import os, interactions
from dotenv import load_dotenv
from os import environ as env
from classes.database import Database

load_dotenv()

TOKEN: str = str(env.get("BOT_TOKEN"))
DATABASE_URL: str = str(env.get("DATABASE_URL"))

db = Database(dsn=DATABASE_URL)

intents = interactions.Intents.DEFAULT | interactions.Intents.GUILDS | interactions.Intents.MESSAGE_CONTENT
client = interactions.Client(intents=intents)


@interactions.listen()
async def on_startup():
    await db.connect()
    await db.execute_sql_file("init_database.sql")

    client.db = db
    print(f"We're online! We've logged in as {client.app.name}.")

@interactions.listen()
async def on_ready():
    print("Ready")
    print(f"This bot is owned by {client.owner}")


# auto-load extensions


initial_extensions = []

for filename in os.listdir("./extensions"):
    if filename.endswith(".py"):
        initial_extensions.append("extensions." + filename[:-3])

if __name__ == "__main__":
    for extension in initial_extensions:
        try:
            client.load_extension(extension)
            print(f"Extension {extension} loaded.")
        except Exception as e:
            print("Error loading extension:", e)


client.start(TOKEN)
