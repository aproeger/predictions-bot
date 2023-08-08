import aiosqlite

class Database:
    def __init__(self, db_file,):
        self.db_file = db_file
        self.connection = None
        self.cursor = None

    async def connect(self):
        try:
            self.connection = await aiosqlite.connect(self.db_file)
            self.cursor = await self.connection.cursor()
            print("Connected to SQLite database.")
        except Exception as e:
            print("Error while establishing the connection:", e)

    async def disconnect(self):
        if self.connection:
            await self.cursor.close()
            await self.connection.close()
            print("Disconnected from SQLite database.")
        else:
            print("No active connection.")

    async def execute_query(self, query, params=None):
        try:
            if params:
                await self.cursor.execute(query, params)
            else:
                await self.cursor.execute(query)
            print("Query executed successfully.")
        except Exception as e:
            print("Error executing the query:", e)

    async def fetch_data(self):
        return await self.cursor.fetchall()

    async def commit(self):
        await self.connection.commit()
        print("Transaction successfully committed.")

    async def rollback(self):
        await self.connection.rollback()
        print("Transaction has been rolled back.")
