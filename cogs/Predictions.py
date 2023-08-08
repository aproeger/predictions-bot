import os, nextcord
from dotenv import load_dotenv
from nextcord.ext import commands
from nextcord import Interaction

load_dotenv()
GUILD_ID = os.getenv("GUILD_ID")


class Predictions(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @nextcord.slash_command(name="my_slash_command", description="Test command", guild_ids=[GUILD_ID])
    async def my_slash_command(self, interaction: Interaction):
        await interaction.response.send_message("This is a slash command in a cog!")


def setup(bot):
    bot.add_cog(Predictions(bot))