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
        
        # customers indexes (CRM)
        await db.customers.create_index("customer_id", unique=True)
        await db.customers.create_index("external_id")
        await db.customers.create_index("store_id")
        await db.customers.create_index("email")
        await db.customers.create_index("segment")
        await db.customers.create_index("shopify_tags")
        await db.customers.create_index("custom_tags")
        await db.customers.create_index([("full_name", "text"), ("email", "text")])
        
        # customer_activities indexes
        await db.customer_activities.create_index("customer_id")
        await db.customer_activities.create_index("created_at")
        
        # order_activities indexes
        await db.order_activities.create_index("order_id")
        await db.order_activities.create_index("created_at")
        
        # tasks indexes
        await db.tasks.create_index("task_id", unique=True)
        await db.tasks.create_index("assigned_to")
        await db.tasks.create_index("created_by")
        await db.tasks.create_index("customer_id")
        await db.tasks.create_index("order_id")
        await db.tasks.create_index("status")
        await db.tasks.create_index("due_date")
        await db.tasks.create_index("shared_with")
        
        # task_activities indexes
        await db.task_activities.create_index("task_id")
        await db.task_activities.create_index("created_at")
        
        # task_comments indexes
        await db.task_comments.create_index("task_id")
        
        # notifications indexes
        await db.notifications.create_index("notification_id", unique=True)
        await db.notifications.create_index("user_id")
        await db.notifications.create_index([("user_id", 1), ("read", 1)])
        await db.notifications.create_index("created_at")
        
        # fulfillment_batches indexes
        await db.fulfillment_batches.create_index("fulfillment_batch_id", unique=True)
        await db.fulfillment_batches.create_index("production_batch_id")
        await db.fulfillment_batches.create_index("status")
        await db.fulfillment_batches.create_index("created_at")
        
        # frame_inventory_log indexes
        await db.frame_inventory_log.create_index("log_id", unique=True)
        await db.frame_inventory_log.create_index("order_id")
        await db.frame_inventory_log.create_index("inventory_id")
        await db.frame_inventory_log.create_index("deducted_at")
        await db.frame_inventory_log.create_index([("color", 1), ("size", 1)])
        
        # CRM Indexes
        await db.crm_accounts.create_index("account_id", unique=True)
        await db.crm_accounts.create_index("owner_id")
        await db.crm_accounts.create_index("account_type")
        await db.crm_accounts.create_index("status")
        await db.crm_accounts.create_index("linked_customer_id")
        await db.crm_accounts.create_index([("name", "text")])
        
        await db.crm_contacts.create_index("contact_id", unique=True)
        await db.crm_contacts.create_index("account_id")
        await db.crm_contacts.create_index("owner_id")
        await db.crm_contacts.create_index("email")
        await db.crm_contacts.create_index([("full_name", "text"), ("email", "text")])
        
        await db.crm_leads.create_index("lead_id", unique=True)
        await db.crm_leads.create_index("owner_id")
        await db.crm_leads.create_index("status")
        await db.crm_leads.create_index("source")
        await db.crm_leads.create_index("email")
        await db.crm_leads.create_index([("full_name", "text"), ("company", "text")])
        
        await db.crm_opportunities.create_index("opportunity_id", unique=True)
        await db.crm_opportunities.create_index("account_id")
        await db.crm_opportunities.create_index("contact_id")
        await db.crm_opportunities.create_index("owner_id")
        await db.crm_opportunities.create_index("stage")
        await db.crm_opportunities.create_index("close_date")
        await db.crm_opportunities.create_index([("name", "text")])
        
        await db.crm_tasks.create_index("task_id", unique=True)
        await db.crm_tasks.create_index("assigned_to")
        await db.crm_tasks.create_index("status")
        await db.crm_tasks.create_index("due_date")
        await db.crm_tasks.create_index("account_id")
        await db.crm_tasks.create_index("opportunity_id")
        await db.crm_tasks.create_index("lead_id")
        
        await db.crm_notes.create_index("note_id", unique=True)
        await db.crm_notes.create_index("account_id")
        await db.crm_notes.create_index("contact_id")
        await db.crm_notes.create_index("opportunity_id")
        await db.crm_notes.create_index("lead_id")
        
        await db.crm_events.create_index("event_id", unique=True)
        await db.crm_events.create_index("owner_id")
        await db.crm_events.create_index("start_time")
        
        await db.crm_quotes.create_index("quote_id", unique=True)
        await db.crm_quotes.create_index("opportunity_id")
        await db.crm_quotes.create_index("account_id")
        
        await db.crm_activity_log.create_index("activity_id", unique=True)
        await db.crm_activity_log.create_index("record_type")
        await db.crm_activity_log.create_index("record_id")
        await db.crm_activity_log.create_index("account_id")
        await db.crm_activity_log.create_index("opportunity_id")
        await db.crm_activity_log.create_index("created_at")
        
        await db.crm_settings.create_index("settings_id", unique=True)
        
        print("[Database] Indexes created successfully")
    except Exception as e:
        print(f"[Database] Index creation error (may already exist): {e}")
