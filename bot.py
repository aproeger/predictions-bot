import os, nextcord
from dotenv import load_dotenv
from os import environ as env
from nextcord.ext import commands
from classes.database import Database

load_dotenv()

TOKEN: str = str(env.get("BOT_TOKEN"))
GUILD_ID: int = int(env.get("GUILD_ID"))

db = Database("database.db")

intents = nextcord.Intents.default()
intents.members = True
intents.message_content = True

bot = commands.Bot(command_prefix="$", intents=intents)
bot.test = "testo"


@bot.event
async def on_ready():
    await db.connect()
    bot.db = db
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


@bot.command()
async def reload(ctx, extension):
    try:
        bot.reload_extension(f"cogs.{extension}")
        await ctx.send(f"Extension {extension} reloaded.")
    except Exception as e:
        await ctx.send("Error loading extension:", e)


bot.run(TOKEN)
