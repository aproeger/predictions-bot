import os, nextcord
from dotenv import load_dotenv
from nextcord.ext import commands
from classes.database import Database
from nextcord import Interaction

load_dotenv()
TOKEN = os.getenv("TOKEN")
GUILD_ID = os.getenv("GUILD_ID")

db = Database("predictions.db")

intents = nextcord.Intents.default()
intents.members = True
intents.message_content = True

bot = commands.Bot(command_prefix="$", intents=intents)


@bot.event
async def on_ready():
    await db.connect()
    print(f"Logged in as {bot.user} (ID: {bot.user.id})")


## auto-load extensions


initial_extensions = []

for filename in os.listdir("./cogs"):
    if filename.endswith(".py"):
        initial_extensions.append("cogs." + filename[:-3])

if __name__ == "__main__":
    for extension in initial_extensions:
        try:
            bot.load_extension(extension)
            print(f"Extension {extension} loaded.")
        except Exception as e:
            print("Error loading extension:", e)


bot.run(TOKEN)
