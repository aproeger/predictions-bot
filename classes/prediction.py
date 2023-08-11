from classes.database import Database


class Prediction:
    def __init__(
        self,
        db: Database,
        active=True,
        locked=True,
        fighter_a=str,
        fighter_b=str,
        event_name=str,
        event_date=str,
        image_url=None,
        discord_message_id=None,
        discord_channel_id=None,
        prediction_id=None,
    ):
        self.db = db
        self.active = active
        self.locked = locked
        self.fighter_a = fighter_a
        self.fighter_b = fighter_b
        self.event_name = event_name
        self.event_date = event_date
        self.image_url = image_url
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
            query = "INSERT INTO predictions (active, locked, fighter_a, fighter_b, event_name, event_date, image_url, discord_message_id, discord_channel_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id;"
            data_to_insert = (
                self.active,
                self.locked,
                self.fighter_a,
                self.fighter_b,
                self.event_name,
                self.event_date,
                self.image_url,
                self.discord_message_id,
                self.discord_channel_id,
            )

            result = await self.db.fetch_data(query, *data_to_insert)
            self.id = result[0][0]
            await self.db.commit()
            print(f"Prediction with ID {self.id} successfully saved in the database.")
            return self.id
        except Exception as e:
            await self.db.rollback()
            print("Error while saving the prediction to the database:", e)

    async def load(self):
        try:
            if self.discord_message_id:
                query = "SELECT * FROM predictions WHERE discord_message_id = $1;"
                row = await self.db.fetch_data(query, self.discord_message_id)
            elif self.id:
                query = "SELECT * FROM predictions WHERE id = $1;"
                row = await self.db.fetch_data(query, self.id)
            else:
                raise Exception("id and discord_message_id not defined.")

            if row:
                row = row[0]
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
            set_values = ", ".join(
                f"{key} = ${i+1}" for i, key in enumerate(kwargs.keys())
            )
            query = f"UPDATE predictions SET {set_values} WHERE id = ${len(kwargs)+1};"

            data_to_update = list(kwargs.values()) + [self.id]

            await self.db.execute_query(query, *data_to_update)
            await self.db.commit()
            print(f"Prediction with ID {self.id} successfully updated in the database.")
        except Exception as e:
            await self.db.rollback()
            print("Error while updating the prediction in the database:", e)

    async def delete(self):
        try:
            query = "DELETE FROM predictions WHERE id = $1;"
            await self.db.execute_query(query, self.id)
            await self.db.commit()
            print(
                f"Prediction with ID {self.id} successfully deleted from the database."
            )
        except Exception as e:
            await self.db.rollback()

        try:
            query = "DELETE FROM prediction_users WHERE prediction_id = $1;"
            await self.db.execute_query(query, self.id)
            await self.db.commit()
            print(
                f"All relations for prediction with ID {self.id} successfully deleted from the database."
            )
        except Exception as e:
            await self.db.rollback()
            print("Error while deleting the prediction relations from the database:", e)

    async def load_votes_and_percentages(self):
        try:
            query = "SELECT fighter, COUNT(*) FROM prediction_users WHERE prediction_id = $1 GROUP BY fighter;"
            rows = await self.db.fetch_data(query, self.id)

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

    async def get_participants(self):
        try:
            query = "SELECT user_id, fighter, method FROM prediction_users WHERE prediction_id = $1;"
            rows = await self.db.fetch_data(query, self.id)

            return rows
        except Exception as e:
            print(
                "Error while retrieving users with correct votes from the database:", e
            )
