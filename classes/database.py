import asyncpg
import asyncio


class Database:
    def __init__(self, dsn):
        self.dsn = dsn
        self.connection = None

    async def connect(self):
        try:
            if not self.connection:
                self.connection = await asyncpg.connect(dsn=self.dsn)
                print("Connected to PostgreSQL database.")
        except Exception as e:
            print("Error while establishing the connection:", e)

    async def disconnect(self):
        if self.connection:
            await self.connection.close()
            print("Disconnected from PostgreSQL database.")
        else:
            print("No active connection.")

    async def check_connection(self):
        if self.connection.is_closed():
            print("Connection closed. Reconnecting to database.")
            self.connection = None
            await self.connect()

    async def execute_query(self, query, *args):
        await self.check_connection()  # Check connection here
        try:
            await self.connection.execute(query, *args)
            print("Query executed successfully.")
        except Exception as e:
            print("Error executing the query:", e)

    async def fetch_data(self, query, *args):
        await self.check_connection()  # Check connection here
        return await self.connection.fetch(query, *args)

    async def commit(self):
        await self.check_connection()  # Check connection here
        await self.connection.fetch("COMMIT;")
        print("Transaction successfully committed.")

    async def rollback(self):
        await self.check_connection()  # Check connection here
        await self.connection.fetch("ROLLBACK;")
        print("Transaction has been rolled back.")

    async def execute_sql_file(self, file_path):
        await self.check_connection()  # Check connection here
        try:
            with open(file_path, "r") as sql_file:
                sql_script = sql_file.read()

            await self.connection.execute(sql_script)
            print(f"SQL script from {file_path} executed successfully.")
        except Exception as e:
            print(f"Error executing SQL script from {file_path}:", e)
