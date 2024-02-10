from classes.database import Database
from classes.prediction import Prediction
from classes.user import User

class PredictionUser:
    def __init__(self, db, prediction, user):
        self.db: Database = db
        self.prediction: Prediction = prediction
        self.user: User = user
        self.fighter = None
        self.method = None

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

    async def load(self):
        try:
            query = (
                "SELECT fighter, method FROM prediction_users WHERE prediction_id = $1 AND user_id = $2;"
            )
            data_to_select = (self.prediction.id, self.user.id)

            result = await self.db.fetch_data(query, *data_to_select)

            if result:
                self.fighter = result[0][0]
                self.method = result[0][1]
                print("Prediction-User relationship successfully loaded from the database.")
                return self
            else:
                print("No Prediction-User relationship found for the given prediction and user.")
                return False

        except Exception as e:
            print("Error while loading the Prediction-User relationship:", e)
            return False
        
