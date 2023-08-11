class User:
    def __init__(
        self,
        connection,
        discord_id=None,
        user_id=None,
    ):
        self.connection = connection
        self.discord_id = discord_id
        self.id = user_id
        self.participations = 0
        self.wins = 0

    async def save(self):
        try:
            existing_user = await self.load()
            if existing_user:
                print(
                    f"User with Discord ID {self.discord_id} already exists in the database."
                )
                return existing_user.id

            query = "INSERT INTO users (discord_id) VALUES (?);"
            data_to_insert = (self.discord_id,)

            async with self.connection.execute(query, data_to_insert) as cursor:
                await self.connection.commit()
                self.id = cursor.lastrowid
                print(f"User with ID {self.id} successfully saved in the database.")
                return self.id
        except Exception as e:
            await self.connection.rollback()
            print("Error while saving the user to the database:", e)

    async def load(self):
        try:

            if(self.id):
                query = "SELECT * FROM users WHERE id = ?;"
                async with self.connection.execute(query, (self.id,)) as cursor:
                    row = await cursor.fetchone()
            else:
                query = "SELECT * FROM users WHERE discord_id = ?;"
                async with self.connection.execute(query, (self.discord_id,)) as cursor:
                    row = await cursor.fetchone()

            if row:
                self.id = row[0]
                self.discord_id = row[1]
                self.participations = row[2]
                self.wins = row[3]
                print(f"User with ID {self.id} loaded from the database.")
                return self
            else:
                print(
                    f"User with Discord ID {self.discord_id} not found in the database."
                )
                return None
        except Exception as e:
            print("Error while loading the user from the database:", e)

    async def update(self, **kwargs):
        try:
            set_values = ", ".join(f"{key} = ?" for key in kwargs.keys())
            query = f"UPDATE users SET {set_values} WHERE id = ?;"

            data_to_update = list(kwargs.values()) + [self.id]

            async with self.connection.execute(query, data_to_update) as cursor:
                await self.connection.commit()
                print(f"User with ID {self.id} successfully updated in the database.")
        except Exception as e:
            await self.connection.rollback()
            print("Error while updating the user in the database:", e)

    async def delete(self):
        try:
            query = "DELETE FROM users WHERE id = ?;"
            async with self.connection.execute(query, (self.id,)) as cursor:
                await self.connection.commit()
                print(f"User with ID {self.id} successfully deleted from the database.")
        except Exception as e:
            await self.connection.rollback()
            print("Error while deleting the user from the database:", e)
