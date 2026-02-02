from motor.motor_asyncio import AsyncIOMotorClient
from config import MONGO_URL, DB_NAME
import os

# Check if training mode is enabled
TRAINING_MODE = os.environ.get("TRAINING_MODE", "false").lower() == "true"

# Use separate database for training
if TRAINING_MODE:
    ACTIVE_DB_NAME = f"{DB_NAME}_training"
else:
    ACTIVE_DB_NAME = DB_NAME

client = AsyncIOMotorClient(MONGO_URL)
db = client[ACTIVE_DB_NAME]

# Log which database is being used
print(f"[Database] Connected to: {ACTIVE_DB_NAME} {'(TRAINING MODE)' if TRAINING_MODE else '(PRODUCTION)'}")
