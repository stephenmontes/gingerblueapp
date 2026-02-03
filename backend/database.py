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

async def create_indexes():
    """Create database indexes for optimized query performance"""
    try:
        # fulfillment_orders indexes
        await db.fulfillment_orders.create_index("order_id", unique=True)
        await db.fulfillment_orders.create_index("store_id")
        await db.fulfillment_orders.create_index("status")
        await db.fulfillment_orders.create_index("batch_id")
        await db.fulfillment_orders.create_index("fulfillment_stage_id")
        await db.fulfillment_orders.create_index("archived")
        await db.fulfillment_orders.create_index("created_at")
        await db.fulfillment_orders.create_index([("order_number", "text"), ("customer_name", "text"), ("customer_email", "text")])
        
        # production_batches indexes
        await db.production_batches.create_index("batch_id", unique=True)
        await db.production_batches.create_index("status")
        await db.production_batches.create_index("current_stage_id")
        await db.production_batches.create_index("created_at")
        
        # batch_frames indexes
        await db.batch_frames.create_index("batch_id")
        await db.batch_frames.create_index("frame_id")
        await db.batch_frames.create_index([("batch_id", 1), ("frame_id", 1)])
        
        # time_logs indexes
        await db.time_logs.create_index("user_id")
        await db.time_logs.create_index("stage_id")
        await db.time_logs.create_index("batch_id")
        await db.time_logs.create_index("completed_at")
        await db.time_logs.create_index("created_at")
        
        # inventory indexes
        await db.inventory.create_index("sku")
        await db.inventory.create_index("is_rejected")
        
        # stages indexes
        await db.production_stages.create_index("stage_id", unique=True)
        await db.fulfillment_stages.create_index("stage_id", unique=True)
        
        print("[Database] Indexes created successfully")
    except Exception as e:
        print(f"[Database] Index creation error (may already exist): {e}")
