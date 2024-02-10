from classes.database import Database

class User:
    def __init__(
        self,
        db: Database,
        discord_id=None,
        user_id=None,
    ):
        self.db = db
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

            query = (
                "INSERT INTO users (discord_id, participations, wins) VALUES ($1, $2, $3) RETURNING id;"
            )
            data_to_insert = (
                self.discord_id,
                0,
                0,
            )

            result = await self.db.fetch_data(query, *data_to_insert)
            self.id = result[0][0]
            await self.db.commit()
            print(f"User with ID {self.id} successfully saved in the database.")
            return self.id
        except Exception as e:
            await self.db.rollback()
            print("Error while saving the user to the database:", e)

    async def load(self):
        try:
            if self.id:
                query = "SELECT * FROM users WHERE id = $1;"
                row = await self.db.fetch_data(query, self.id)
            else:
                query = "SELECT * FROM users WHERE discord_id = $1;"
                row = await self.db.fetch_data(query, self.discord_id)

            if row:
                row = row[0]
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
            set_values = ", ".join(f"{key} = ${i+1}" for i, key in enumerate(kwargs.keys()))
            query = f"UPDATE users SET {set_values} WHERE id = ${len(kwargs)+1};"

            data_to_update = list(kwargs.values()) + [self.id]

            await self.db.execute_query(query, *data_to_update)
            await self.db.commit()
            print(f"User with ID {self.id} successfully updated in the database.")
        except Exception as e:
            await self.db.rollback()
            print("Error while updating the user in the database:", e)

    async def delete(self):
        try:
            query = "DELETE FROM users WHERE id = $1;"
            await self.db.execute_query(query, self.id)
            await self.db.commit()
            print(f"User with ID {self.id} successfully deleted from the database.")
        except Exception as e:
            await self.db.rollback()
            print("Error while deleting the user from the database:", e)

    @staticmethod
    async def get_top10_users(db: Database):
        try:
            query = "SELECT * FROM users ORDER BY wins DESC LIMIT 10;"
            users = await db.fetch_data(query)
            return users
        except Exception as e:
            print("Error while getting top10 users:", e)
            return []
        
    @staticmethod
    async def get_user_leaderboard_position(db: Database, discord_id: int):
        try:
            query = "SELECT position FROM (SELECT discord_id, RANK() OVER (ORDER BY wins DESC) as position FROM users) as ranked_users WHERE discord_id = $1;"
            result = await db.fetch_data(query, discord_id)

            print("Leaderboard", result)

            if result:
                return result[0]["position"]
            else:
                return None

        except Exception as e:
            print("Error while getting user leaderboard position:", e)
            return None
