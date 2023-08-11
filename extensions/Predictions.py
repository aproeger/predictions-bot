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
    slash_option,
    listen,
)
from interactions.api.events import ButtonPressed

from classes.prediction import Prediction
from classes.user import User
from classes.prediction_user import PredictionUser

load_dotenv()

GUILD_ID: int = int(env["GUILD_ID"])
GUILD_IDS = [1096005107759460442,717696838362333224]


class Predictions(Extension):
    def __init__(self, client):
        self.client = client

    def prediction_embed(self, prediction: Prediction):
        description = f"""
            A community prediction has been started, choose your **favourite fighter** and the **win method**.
                
            # {prediction.fighter_a} vs. {prediction.fighter_b}
                
            """

        if prediction.locked == True:
            description += f"\n\n‼️ **This prediction is locked, no further votes can be placed.** ‼️"

        return Embed(
            title=f"Community Prediction started! [#{prediction.id}]",
            description=description,
            color=0xDC3545,
            images=[prediction.image],
            fields=[
                EmbedField(name="Event", value=str(prediction.event_name), inline=True),
                EmbedField(name="Event Date", value=str(prediction.event_date), inline=True),
                EmbedField(name="\u200B", value="\u200B", inline=True),
                EmbedField(
                    name=f"Votes for {prediction.fighter_a}",
                    value=f"{round(prediction.votes_a_percent)}%",
                    inline=True,
                ),
                EmbedField(
                    name=f"Votes for {prediction.fighter_b}",
                    value=f"{round(prediction.votes_b_percent)}%",
                    inline=True,
                ),
            ],
        )

    command_base = SlashCommand(
        name="prediction", description="Prediction commands", scopes=GUILD_IDS
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
    @slash_option("image_url", "Event image.", 3, required=True)
    async def start(
        self,
        ctx: SlashContext,
        fighter_a: str,
        fighter_b: str,
        event_name: str,
        event_date: str,
        image_url: str,
    ):
        prediction = Prediction(
            connection=self.client.db.connection,
            active=True,
            locked=False,
            fighter_a=fighter_a,
            fighter_b=fighter_b,
            event_name=event_name,
            event_date=event_date,
            image=image_url,
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
                    )
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
        prediction = Prediction(
            connection=self.client.db.connection, prediction_id=prediction_id
        )

        await prediction.load()

        if prediction.locked:
            return await ctx.send(content="Predicition is already locked.", ephemeral=True)

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
        ctx.defer()

        if winner not in ["a", "b", "none"]:
            await ctx.send("Winner is invalid.", ephemeral=True)

        elif method not in ["ko", "dec", "draw"]:
            await ctx.send("Method is invalid.", ephemeral=True)

        else:
            prediction = Prediction(
                connection=self.client.db.connection, prediction_id=prediction_id
            )
            await prediction.load()

            if not prediction.active:
                return await ctx.send(content="Predicition has already ended.", ephemeral=True)

            await prediction.update(active=False, winner=winner, method=method)

            participans = await prediction.get_participans()

            content = f"**{prediction.fighter_a}** vs. **{prediction.fighter_b}**\n"

            if method == "draw":
                content += "The bout ended with a **draw**."
            else:
                winner_name = (
                    prediction.fighter_a if winner == "a" else prediction.fighter_b
                )
                win_method = "KO/TKO" if method == "ko" else "Decision"
                content += f"**{winner_name}** won by **{win_method}**."

            if len(participans) > 0:
                winners = []

                for participant in participans:
                    user = User(
                        connection=self.client.db.connection, user_id=participant[0]
                    )
                    await user.load()

                    user_participations = user.participations + 1
                    user_wins = user.wins

                    if (participant[1] == winner and participant[2] == method) or (
                        method == "draw" and participant[2] == "draw"
                    ):
                        user_wins = user.wins + 1
                        winners.append([user.discord_id, user_wins])

                    await user.update(
                        participations=user_participations, wins=user_wins
                    )

                if len(winners) > 0:
                    content += "\n\nThe winners are:\n"

                    for winner in winners:
                        content += f"<@{str(winner[0])}> ({winner[1]} wins), "

                    content += "\n\nCongratulations and good luck to all other participants next time."
                else:
                    content += "\n\nArgh! No one guessed right. Better luck next time!"

            else:
                content += "\n\nArgh! No one guessed right. Better luck next time!"

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
    async def delete(
        self,
        ctx: SlashContext,
        prediction_id: int,
    ):
        prediction = Prediction(
            connection=self.client.db.connection, prediction_id=prediction_id
        )
        await prediction.load()
        await prediction.delete()

        message = await ctx.channel.fetch_message(
            message_id=prediction.discord_message_id
        )
        if message:
            await message.delete()

        await ctx.send("Prediction deleted.", ephemeral=True)

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
                connection=self.client.db.connection,
                discord_message_id=event.ctx.message.id,
            )
            await prediction.load()

            user = User(
                connection=self.client.db.connection, discord_id=event.ctx.author.id
            )

            if await user.load() == None:
                await user.save()

            relation = PredictionUser(
                connection=self.client.db.connection, prediction=prediction, user=user
            )

            custom_id = event.ctx.custom_id

            if custom_id in ["a_ko", "a_dec", "b_ko", "b_dec"]:
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
