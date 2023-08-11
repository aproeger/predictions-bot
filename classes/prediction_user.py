from classes.database import Database

class PredictionUser:
    def __init__(self, db, prediction, user):
        self.db: Database = db
        self.prediction = prediction
        self.user = user

    async def save(self, fighter=None, method=str):
        try:
            # Delete existing dbs between the same prediction and user
            await self.delete_existing_dbs()

            query = (
                "INSERT INTO prediction_users (prediction_id, user_id, fighter, method) VALUES ($1, $2, $3, $4);"
            )
            data_to_insert = (self.prediction.id, self.user.id, fighter, method)

            await self.db.execute_query(query, *data_to_insert)
            await self.db.commit()
            print("Prediction-User relationship successfully saved in the database.")
        except Exception as e:
            await self.db.rollback()
            print("Error while saving the Prediction-User relationship:", e)

    async def delete_existing_dbs(self):
        try:
            query = (
                "DELETE FROM prediction_users WHERE prediction_id = $1 AND user_id = $2;"
            )
            data_to_delete = (self.prediction.id, self.user.id)

            await self.db.execute_query(query, *data_to_delete)
            await self.db.commit()
            print("Existing Prediction-User relationships successfully deleted.")
        except Exception as e:
            await self.db.rollback()
            print("Error while deleting existing Prediction-User relationships:", e)

    async def delete(self):
        try:
            query = (
                "DELETE FROM prediction_users WHERE prediction_id = $1 AND user_id = $2;"
            )
            data_to_delete = (self.prediction.id, self.user.id)

            await self.db.execute_query(query, *data_to_delete)
            await self.db.commit()
            print("Prediction-User relationship successfully deleted from the database.")
        except Exception as e:
            await self.db.rollback()
            print("Error while deleting the Prediction-User relationship:", e)
