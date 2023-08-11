class Prediction:
    def __init__(
        self,
        connection,
        active=True,
        locked=True,
        fighter_a=str,
        fighter_b=str,
        event_name=str,
        event_date=str,
        image=str,
        discord_message_id=None,
        discord_channel_id=None,
        prediction_id=None,
    ):
        self.connection = connection
        self.active = active
        self.locked = locked
        self.fighter_a = fighter_a
        self.fighter_b = fighter_b
        self.event_name = event_name
        self.event_date = event_date
        self.image = image
        self.discord_message_id = discord_message_id
        self.discord_channel_id = discord_channel_id
        self.id = prediction_id
        self.winner = None
        self.method = None
        self.votes_a = 0
        self.votes_b = 0
        self.votes_draw = 0
        self.votes_a_percent = 0
        self.votes_b_percent = 0

    async def save(self):
        try:
            query = "INSERT INTO predictions (active, locked, fighter_a, fighter_b, event_name, event_date, image, discord_message_id, discord_channel_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);"
            data_to_insert = (
                self.active,
                self.locked,
                self.fighter_a,
                self.fighter_b,
                self.event_name,
                self.event_date,
                self.image,
                self.discord_message_id,
                self.discord_channel_id,
            )

            async with self.connection.execute(query, data_to_insert) as cursor:
                await self.connection.commit()
                self.id = cursor.lastrowid
                print(
                    f"Prediction with ID {self.id} successfully saved in the database."
                )
                return self.id
        except Exception as e:
            await self.connection.rollback()
            print("Error while saving the prediction to the database:", e)

    async def load(self):
        try:
            if self.discord_message_id:
                query = "SELECT * FROM predictions WHERE discord_message_id = ?;"
                async with self.connection.execute(
                    query, (self.discord_message_id,)
                ) as cursor:
                    row = await cursor.fetchone()
            elif self.id:
                query = "SELECT * FROM predictions WHERE id = ?;"
                async with self.connection.execute(query, (self.id,)) as cursor:
                    row = await cursor.fetchone()
            else:
                raise Exception("id and discord_message_id not defined.")

            if row:
                self.id = row[0]
                self.active = row[1]
                self.locked = row[2]
                self.fighter_a = row[3]
                self.fighter_b = row[4]
                self.event_name = row[5]
                self.event_date = row[6]
                self.image = row[7]
                self.discord_message_id = row[8]
                self.discord_channel_id = row[9]
                print(f"Prediction with ID {self.id} loaded from the database.")
            else:
                print(f"Prediction with ID {self.id} not found.")
        except Exception as e:
            print("Error while loading the prediction from the database:", e)

    async def update(self, **kwargs):
        try:
            set_values = ", ".join(f"{key} = ?" for key in kwargs.keys())
            query = f"UPDATE predictions SET {set_values} WHERE id = ?;"

            data_to_update = list(kwargs.values()) + [self.id]

            async with self.connection.execute(query, data_to_update) as cursor:
                await self.connection.commit()
                print(
                    f"Prediction with ID {self.id} successfully updated in the database."
                )
        except Exception as e:
            await self.connection.rollback()
            print("Error while updating the prediction in the database:", e)

    async def delete(self):
        try:
            query = "DELETE FROM predictions WHERE id = ?;"
            async with self.connection.execute(query, (self.id,)) as cursor:
                await self.connection.commit()
                print(
                    f"Prediction with ID {self.id} successfully deleted from the database."
                )
        except Exception as e:
            await self.connection.rollback()

        try:
            query = "DELETE FROM prediction_users WHERE prediction_id = ?;"
            async with self.connection.execute(query, (self.id,)) as cursor:
                await self.connection.commit()
                print(
                    f"All relations for prediction with ID {self.id} successfully deleted from the database."
                )
        except Exception as e:
            await self.connection.rollback()
            print("Error while deleting the prediction relations from the database:", e)

    async def load_votes_and_percentages(self):
        try:
            query = "SELECT fighter, COUNT(*) FROM prediction_users WHERE prediction_id = ? GROUP BY fighter;"
            async with self.connection.execute(query, (self.id,)) as cursor:
                rows = await cursor.fetchall()

            total_votes = 0
            for row in rows:
                fighter, count = row
                total_votes += count
                if fighter == "a":
                    self.votes_a = count
                elif fighter == "b":
                    self.votes_b = count

            if total_votes > 0:
                self.votes_a_percent = (self.votes_a / total_votes) * 100
                self.votes_b_percent = (self.votes_b / total_votes) * 100

            print(f"Votes and percentages loaded for Prediction with ID {self.id}.")
        except Exception as e:
            print("Error while loading votes and percentages from the database:", e)

    async def get_participans(self):
        try:
            query = "SELECT user_id, fighter, method FROM prediction_users WHERE prediction_id = ?;"
            async with self.connection.execute(query, (self.id,)) as cursor:
                rows = await cursor.fetchall()

            return rows
        except Exception as e:
            print(
                "Error while retrieving users with correct votes from the database:", e
            )
