from motor.motor_asyncio import AsyncIOMotorClient

# Replace with YOUR actual string from Step 1
MONGO_URL = "mongodb+srv://sswaraj1407_db_user:7mrm6a28Q9F1qFcl@cluster.mongodb.net"
client = AsyncIOMotorClient(MONGO_URL)
db = client.inventory_db