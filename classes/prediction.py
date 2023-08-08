
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
        discord_message_id=int,
        discord_channel_id=int,
        prediction_id=None,
    ):
        self.connection = connection
        self.active = active
        self.locked = locked
        self.fighter_a = fighter_a
        self.fighter_b = fighter_b
        self.event_name = event_name
        self.event_date = event_date
        self.discord_message_id = discord_message_id
        self.discord_channel_id = discord_channel_id
        self.id = prediction_id

    async def save(self):
        try:
            query = "INSERT INTO predictions (active, locked, fighter_a, fighter_b, event_name, event_date, discord_message_id, discord_channel_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?);"
            data_to_insert = (
                self.active,
                self.locked,
                self.fighter_a,
                self.fighter_b,
                self.event_name,
                self.event_date,
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
            query = "SELECT * FROM predictions WHERE id = ?;"
            async with self.connection.execute(query, (self.id,)) as cursor:
                row = await cursor.fetchone()

            if row:
                self.id = row[0]
                self.active = row[1]
                self.locked = row[2]
                self.fighter_a = row[3]
                self.fighter_b = row[4]
                self.event_name = row[5]
                self.event_date = row[6]
                self.discord_message_id = row[7]
                self.discord_channel_id = row[8]
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
            print("Error while deleting the prediction from the database:", e)
