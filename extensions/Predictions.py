from dotenv import load_dotenv
from os import environ as env
from interactions import (
    Extension,
    Embed,
    EmbedField,
    SlashCommand,
    SlashContext,
    ActionRow,
    Button,
    ButtonStyle,
    slash_command,
    slash_option,
    listen,
)
from interactions.api.events import ButtonPressed

from classes.prediction import Prediction
from classes.user import User
from classes.prediction_user import PredictionUser
from utils.guilds import parse_guilds

load_dotenv()

GUILD_IDS = env["GUILD_IDS"]
PARSED_GUILDS = parse_guilds(GUILD_IDS)


class Predictions(Extension):
    def __init__(self, client):
        self.client = client

    def prediction_embed(self, prediction: Prediction):
        description = f"""
            # {prediction.fighter_a} vs. {prediction.fighter_b}

            - **{prediction.fighter_a}** - {round(prediction.votes_a_percent)}% ({prediction.votes_a} votes)
            - **{prediction.fighter_b}** - {round(prediction.votes_b_percent)}% ({prediction.votes_b} votes)
            - Draw / No Contest - {round(prediction.votes_draw_percent)}% ({prediction.votes_draw} votes)
             
            """

        if prediction.locked == True:
            description += f"\n\n‼️ **This prediction is locked, no further votes can be placed.** ‼️"

        images = [prediction.image_url] if prediction.image_url is not None else []

        return Embed(
            title=f"Community Prediction started! [#{prediction.id}]",
            description=description,
            color=0xDC3545,
            images=images,
            fields=[
                EmbedField(name="Event", value=str(prediction.event_name), inline=True),
                EmbedField(
                    name="Event Date", value=str(prediction.event_date), inline=True
                ),
            ],
        )

    command_base = SlashCommand(
        name="prediction", description="Prediction commands", scopes=PARSED_GUILDS
    )

    ## Start

    @command_base.subcommand(
        sub_cmd_name="start",
        sub_cmd_description="Adds a new bout for which users can make predictions.",
    )
    @slash_option("fighter_a", "First fighter of the bout.", 3, required=True)
    @slash_option("fighter_b", "Second fighter of the bout.", 3, required=True)
    @slash_option(
        "event_name", "Event in which the bout takes place.", 3, required=True
    )
    @slash_option("event_date", "Date of the event.", 3, required=True)
    @slash_option("image_url", "Event image.", 3, required=False)
    async def start(
        self,
        ctx: SlashContext,
        fighter_a: str,
        fighter_b: str,
        event_name: str,
        event_date: str,
        image_url: str = None,
    ):
        prediction = Prediction(
            db=self.client.db,
            active=True,
            locked=False,
            fighter_a=fighter_a,
            fighter_b=fighter_b,
            event_name=event_name,
            event_date=event_date,
            image_url=image_url,
        )

        await prediction.save()

        embed = self.prediction_embed(prediction)

        message = await ctx.send(
            embed=embed,
            components=[
                ActionRow(
                    Button(
                        style=ButtonStyle.RED,
                        label=f"{fighter_a} by KO/TKO",
                        custom_id="a_ko",
                    ),
                    Button(
                        style=ButtonStyle.RED,
                        label=f"{fighter_a} by Decision",
                        custom_id="a_dec",
                    ),
                ),
                ActionRow(
                    Button(
                        style=ButtonStyle.BLUE,
                        label=f"{fighter_b} by KO/TKO",
                        custom_id="b_ko",
                    ),
                    Button(
                        style=ButtonStyle.BLUE,
                        label=f"{fighter_b} by Decision",
                        custom_id="b_dec",
                    ),
                ),
                ActionRow(
                    Button(
                        style=ButtonStyle.GRAY,
                        label=f"Draw / No Contest",
                        custom_id="draw",
                    ),
                    Button(
                        style=ButtonStyle.GREEN,
                        label="My Vote",
                        custom_id="my_vote",
                    ),
                ),
            ],
        )

        await prediction.update(
            discord_message_id=message.id, discord_channel_id=message.channel.id
        )

    ## Lock

    @command_base.subcommand(
        sub_cmd_name="lock",
        sub_cmd_description="Locks the prediction, no more votes can be placed.",
    )
    @slash_option(
        "prediction_id", "ID of the prediction to be locked.", 3, required=True
    )
    async def lock(
        self,
        ctx: SlashContext,
        prediction_id: int,
    ):
        prediction = Prediction(db=self.client.db, prediction_id=prediction_id)

        if not await prediction.load():
            return await ctx.send("Prediction not found.", ephemeral=True)

        if prediction.locked:
            return await ctx.send(
                content="Predicition is already locked.", ephemeral=True
            )

        await prediction.update(locked=True)
        prediction.locked = True

        await prediction.load_votes_and_percentages()

        message = await ctx.channel.fetch_message(
            message_id=prediction.discord_message_id
        )
        if message:
            embed = self.prediction_embed(prediction)

            await message.edit(
                embed=embed,
                components=[],
            )

        await ctx.send("Prediction locked", ephemeral=True)

    ## End

    async def update_users_and_announce_winners(self, participants, winner, method):
        exact_winners = []
        winners = []

        for participant in participants:
            user = User(db=self.client.db, user_id=participant[0])
            await user.load()

            user_participations = user.participations + 1
            user_wins = user.wins

            if participant[1] == winner and participant[2] == method:
                user_wins = user.wins + 2
                exact_winners.append([user.discord_id, user_wins])

            if (participant[1] == winner and not participant[2] == method) or (
                method == "draw" and participant[2] == "draw"
            ):
                user_wins = user.wins + 1
                winners.append([user.discord_id, user_wins])

            await user.update(participations=user_participations, wins=user_wins)

        return exact_winners, winners

    async def generate_winners_message(self, exact_winners, winners):
        content = ""

        if len(exact_winners) > 0:
            content += "\n\nThe following user(s) predicted the correct fighter and the correct result, they get 2 points:\n"
            content += self.generate_winner_message(exact_winners)

        if len(winners) > 0:
            content += "\n\nThe following user(s) have only predicted the correct fighter or a draw, they get 1 point:\n"
            content += self.generate_winner_message(winners)

        if len(exact_winners) == 0 and len(winners) == 0:
            content += "\n\nArgh! No one guessed right. Better luck next time!"

        else:
            content += "\n\nIf you aren't among the winners, better luck next time!"

        return content

    def generate_winner_message(self, winners):
        winner_messages = []

        for index, winner in enumerate(winners):
            winner_messages.append(f"<@{str(winner[0])}> ({winner[1]} points)")

        return ", ".join(winner_messages)

    @command_base.subcommand(
        sub_cmd_name="end",
        sub_cmd_description="Ends the prediction and reveals the winners.",
    )
    @slash_option(
        "prediction_id", "ID of the prediction to be ended.", 3, required=True
    )
    @slash_option(
        "winner", 'The winner of the bout. ("a", "b" or "none")', 3, required=True
    )
    @slash_option(
        "method",
        'The win method of the bout. ("ko", "dec" or "draw")',
        3,
        required=True,
    )
    async def end(self, ctx: SlashContext, prediction_id=int, winner=str, method=str):
        await ctx.defer()

        if winner not in ["a", "b", "none"]:
            return await ctx.send("Winner is invalid.", ephemeral=True)

        if method not in ["ko", "dec", "draw"]:
            return await ctx.send("Method is invalid.", ephemeral=True)

        prediction = Prediction(db=self.client.db, prediction_id=prediction_id)

        if not await prediction.load():
            return await ctx.send("Prediction not found.", ephemeral=True)

        if not prediction.active:
            return await ctx.send("Prediction has already ended.", ephemeral=True)

        await prediction.update(active=False, winner=winner, method=method)

        participants = await prediction.get_participants()

        content = f"**{prediction.fighter_a}** vs. **{prediction.fighter_b}**\n"

        if method == "draw":
            content += "The bout ended with a **draw**."
        else:
            winner_name = (
                prediction.fighter_a if winner == "a" else prediction.fighter_b
            )
            win_method = "KO/TKO" if method == "ko" else "Decision"
            content += f"**{winner_name}** won by **{win_method}**."

        if len(participants) > 0:
            exact_winners, winners = await self.update_users_and_announce_winners(
                participants, winner, method
            )

            content += await self.generate_winners_message(exact_winners, winners)

        else:
            content += "\n\nNo one participated."

        message = await ctx.channel.fetch_message(
            message_id=prediction.discord_message_id
        )
        if message:
            await message.delete()

        await ctx.send(
            embed=Embed(
                title="The Prediction has ended!",
                color=0xDC3545,
                description=content,
            )
        )

    ## Delete

    @command_base.subcommand(
        sub_cmd_name="delete",
        sub_cmd_description="Deletes the prediction and all votes placed for it. (This action cannot be undone!)",
    )
    @slash_option(
        "prediction_id", "ID of the prediction to be deleted.", 3, required=True
    )
    @slash_option(
        "force",
        'Force deletion. (if the prediction has already ended) ("y" for yes)',
        3,
        required=False,
    )
    async def delete(self, ctx: SlashContext, prediction_id: int, force: str = None):
        prediction = Prediction(db=self.client.db, prediction_id=prediction_id)

        if not await prediction.load():
            return await ctx.send("Prediction not found.", ephemeral=True)

        if not prediction.active and force not in ["y"]:
            return await ctx.send(
                "Prediction has already ended. Use the force parameter to delete the prediction anyway.",
                ephemeral=True,
            )

        message = await ctx.channel.fetch_message(
            message_id=prediction.discord_message_id
        )
        if message:
            await message.delete()

        await prediction.delete()
        await ctx.send("Prediction deleted.", ephemeral=True)

    ## show active predictions and their votes

    @command_base.subcommand(
        sub_cmd_name="active",
        sub_cmd_description="Show all active predictions and their votes.",
    )
    async def active_predictions(self, ctx: SlashContext):
        await ctx.defer()

        try:
            active_predictions = await Prediction.get_active_predictions(self.client.db)

            if not active_predictions:
                return await ctx.send("No active predictions found.", ephemeral=True)

            message = ["Active Predictions"]
            message.append(
                "Here are all the currently active predictions and their votes:\n"
            )

            for prediction in active_predictions:
                prediction_obj = Prediction(
                    db=self.client.db,
                    prediction_id=prediction["id"],
                )
                await prediction_obj.load_votes_and_percentages()

                message.append(
                    f"**{prediction['fighter_a']} vs. {prediction['fighter_b']}** [#{prediction_obj.id}]"
                )
                message.append(f"Total Votes: {prediction_obj.total_votes}")
                message.append(
                    f"Votes for A: {prediction_obj.votes_a} ({round(prediction_obj.votes_a_percent)}%)"
                )
                message.append(
                    f"Votes for B: {prediction_obj.votes_b} ({round(prediction_obj.votes_b_percent)}%)"
                )
                message.append(
                    f"Votes for draw: {prediction_obj.votes_draw} ({round(prediction_obj.votes_draw_percent)}%)\n"
                )

            await ctx.send("\n".join(message), ephemeral=True)

        except Exception as e:
            await ctx.send(f"An error occurred: {str(e)}", ephemeral=True)

    ## leaderboard

    @slash_command(name="leaderboard", description="Shows the top 10 users.")
    async def leaderboard(self, ctx: SlashContext):

        users = await User.get_top10_users(self.client.db)
        message = []

        for index, user in enumerate(users, start=1):
            message.append(f"#{index}: <@{user['discord_id']}> with **{user['wins']} points** ({user['participations']} rounds played)")

        embed = Embed(
            title="Predictions Leaderboard",
            description="\n".join(message)
        )

        await ctx.send(embed=embed)

    ## show own points

    @slash_command(name="points", description="Shows your current points.")
    async def points(self, ctx: SlashContext):
        user = User(db=self.client.db, discord_id=ctx.author.id)

        if not await user.load():
            return await ctx.send("An error occurred while fetching your data.", ephemeral=True)
        
        leaderboard_position = await User.get_user_leaderboard_position(self.client.db, ctx.author.id)

        await ctx.send(f"You are ranked **#{leaderboard_position}** with **{user.wins} points** (**{user.participations}** rounds played).", ephemeral=True)

    ## Process Buttons

    @listen(ButtonPressed)
    async def on_button_pressed(self, event: ButtonPressed):
        if (
            event.ctx.message.author.id != self.client.app.id
            or event.ctx.author.id == self.client.app.id
        ):
            pass

        else:
            prediction = Prediction(
                db=self.client.db,
                discord_message_id=event.ctx.message.id,
            )

            if not await prediction.load():
                return await event.ctx.send(
                    "An Error ocurred. Please try again later.", ephemeral=True
                )

            user = User(db=self.client.db, discord_id=event.ctx.author.id)

            if not await user.load():
                await user.save()

            relation = PredictionUser(
                db=self.client.db, prediction=prediction, user=user
            )

            custom_id = event.ctx.custom_id

            if custom_id == "my_vote":
                user_vote = await relation.load()
                if user_vote:
                    if user_vote.method == "draw":
                        await event.ctx.send(
                            "You voted for a **draw / no-contest**.",
                            ephemeral=True,
                        )
                    else:
                        fighter_name = (
                            prediction.fighter_a
                            if user_vote.fighter == "a"
                            else prediction.fighter_b
                        )
                        method_name = f"{user_vote.method.upper()}"
                        await event.ctx.send(
                            f"You voted for **{fighter_name}** by **{method_name}**.",
                            ephemeral=True,
                        )
                else:
                    await event.ctx.send(
                        "You haven't voted in this prediction yet.",
                        ephemeral=True,
                    )

            elif  custom_id in ["a_ko", "a_dec", "b_ko", "b_dec"]:
                fighter = "a" if custom_id.startswith("a") else "b"
                method = "ko" if custom_id.endswith("ko") else "dec"
                fighter_name = getattr(prediction, f"fighter_{fighter}")
                await relation.save(fighter=fighter, method=method)
                await event.ctx.send(
                    f"You voted for **{fighter_name}** by **{method.upper()}**. Good luck, you can change your vote as long as the prediction has not been locked.",
                    ephemeral=True,
                )
            elif custom_id == "draw":
                await relation.save(fighter=None, method="draw")
                await event.ctx.send(
                    "You voted for a **draw / no-contest**. Good luck, you can change your vote as long as the prediction has not been locked.",
                    ephemeral=True,
                )
            else:
                await relation.save()
                await event.ctx.send("You have voted!", ephemeral=True)

            message = await event.ctx.channel.fetch_message(
                message_id=prediction.discord_message_id
            )
            if message:
                await prediction.load_votes_and_percentages()
                embed = self.prediction_embed(prediction)

            await message.edit(embed=embed)


def setup(client):
    Predictions(client)
