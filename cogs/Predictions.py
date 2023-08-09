import os, nextcord
from typing import Optional
from dotenv import load_dotenv
from os import environ as env
from nextcord.ext import commands
from nextcord import Interaction, slash_command, SlashOption, Embed

from classes.prediction import Prediction

load_dotenv()

GUILD_ID: int = int(env["GUILD_ID"])


class startButtons(nextcord.ui.View):
    def __init__(self, fighter_a, fighter_b):
        super().__init__(timeout=None)
        self.fighter_a = fighter_a
        self.fighter_b = fighter_b
        self.winner = None
        self.method = None
        self.draw = None
        self.add_buttons()

    def add_buttons(self):

        button_a_by_ko = nextcord.ui.Button(label=f"{self.fighter_a} by KO/KO", style=nextcord.ButtonStyle.red)
        async def a_by_ko(interaction: Interaction):
            await interaction.response.send_message(f"You have voted for {self.fighter_a} by KO/TKO.", ephemeral=True)
            self.winner = "a"
            self.method = "ko"

        button_a_by_ko.callback = a_by_ko
        self.add_item(button_a_by_ko)


class Predictions(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @slash_command(guild_ids=[GUILD_ID])
    async def prediction(self, interaction: Interaction):
        pass

    ## Start
    @prediction.subcommand(
        description="Adds a new bout for which users can make predictions."
    )
    async def start(
        self,
        interaction: Interaction,
        fighter_a: str = SlashOption(
            required=True, description="First fighter of the bout."
        ),
        fighter_b: str = SlashOption(
            required=True, description="Second fighter of the bout."
        ),
        event_name: str = SlashOption(
            required=True, description="Event in which the bout takes place."
        ),
        event_date: str = SlashOption(required=True, description="Date of the event."),
    ):
        prediction = Prediction(
            connection=self.bot.db.connection,
            active=True,
            locked=False,
            fighter_a=fighter_a,
            fighter_b=fighter_b,
            event_name=event_name,
            event_date=event_date,
        )

        prediction_id = await prediction.save()

        embed = Embed(
            title=f"Community Prediction started! [#{prediction_id}]",
            description="""
            A new community prediction has been started, choose your ***favourite fighter*** and the ***win method***.
            
            # %s vs. %s

            """
            % (fighter_a, fighter_b),
            color=0xDC3545,
        )

        await interaction.response.send_message(embed=embed, view=startButtons(fighter_a=fighter_a, fighter_b=fighter_b))

    ## Lock
    @prediction.subcommand(
        description="Locks the prediction, no more votes can be placed."
    )
    async def lock(
        self,
        interaction: Interaction,
        prediction_id: str = SlashOption(
            required=True, description="The ID of the prediction to be locked."
        ),
    ):
        await interaction.response.send_message("prediction lock")

    ## End
    @prediction.subcommand(description="Ends the prediction and reveals the winners.")
    async def end(
        self,
        interaction: Interaction,
        prediction_id: str = SlashOption(
            required=True, description="The ID of the prediction to be ended."
        ),
    ):
        await interaction.response.send_message("prediction end")

    ## Delete
    @prediction.subcommand(description="Deletes the prediction and all votes")
    async def delete(
        self,
        interaction: Interaction,
        prediction_id: str = SlashOption(
            required=True,
            description="Deletes the prediction and all votes placed for it. (This action cannot be undone!)",
        ),
    ):
        await interaction.response.send_message("prediction end")


def setup(bot):
    bot.add_cog(Predictions(bot))
