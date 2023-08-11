class PredictionUser:
    def __init__(self, connection, prediction, user):
        self.connection = connection
        self.prediction = prediction
        self.user = user

    async def save(self, fighter=None, method=str):
        try:
            # Delete existing connections between the same prediction and user
            await self.delete_existing_connections()

            query = (
                "INSERT INTO prediction_users (prediction_id, user_id, fighter, method) VALUES (?, ?, ?, ?);"
            )
            data_to_insert = (self.prediction.id, self.user.id, fighter, method)

            async with self.connection.execute(query, data_to_insert) as cursor:
                await self.connection.commit()
                print(
                    "Prediction-User relationship successfully saved in the database."
                )
        except Exception as e:
            await self.connection.rollback()
            print("Error while saving the Prediction-User relationship:", e)

    async def delete_existing_connections(self):
        try:
            query = (
                "DELETE FROM prediction_users WHERE prediction_id = ? AND user_id = ?;"
            )
            data_to_delete = (self.prediction.id, self.user.id)

            async with self.connection.execute(query, data_to_delete) as cursor:
                await self.connection.commit()
                print("Existing Prediction-User relationships successfully deleted.")
        except Exception as e:
            await self.connection.rollback()
            print("Error while deleting existing Prediction-User relationships:", e)

    async def delete(self):
        try:
            query = (
                "DELETE FROM prediction_users WHERE prediction_id = ? AND user_id = ?;"
            )
            data_to_delete = (self.prediction.id, self.user.id)

            async with self.prediction.connection.execute(
                query, data_to_delete
            ) as cursor:
                await self.prediction.connection.commit()
                print(
                    "Prediction-User relationship successfully deleted from the database."
                )
        except Exception as e:
            await self.prediction.connection.rollback()
            print("Error while deleting the Prediction-User relationship:", e)
