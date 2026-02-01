from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends
from fastapi.responses import JSONResponse, StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import httpx

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app
app = FastAPI()

# Create router with /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ============== Models ==============

class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    role: str = "worker"  # admin, manager, worker
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UserSession(BaseModel):
    model_config = ConfigDict(extra="ignore")
    user_id: str
    session_token: str
    expires_at: datetime
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Store(BaseModel):
    model_config = ConfigDict(extra="ignore")
    store_id: str = Field(default_factory=lambda: f"store_{uuid.uuid4().hex[:12]}")
    name: str
    platform: str  # shopify, etsy
    api_key: Optional[str] = None
    api_secret: Optional[str] = None
    shop_url: Optional[str] = None
    access_token: Optional[str] = None
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class StoreCreate(BaseModel):
    name: str
    platform: str
    api_key: Optional[str] = None
    api_secret: Optional[str] = None
    shop_url: Optional[str] = None
    access_token: Optional[str] = None

class ProductionStage(BaseModel):
    model_config = ConfigDict(extra="ignore")
    stage_id: str = Field(default_factory=lambda: f"stage_{uuid.uuid4().hex[:8]}")
    name: str
    order: int
    color: str = "#3B82F6"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Order(BaseModel):
    model_config = ConfigDict(extra="ignore")
    order_id: str = Field(default_factory=lambda: f"ord_{uuid.uuid4().hex[:12]}")
    external_id: str  # ID from Shopify/Etsy
    store_id: str
    store_name: str
    platform: str
    customer_name: str
    customer_email: Optional[str] = None
    items: List[dict] = []
    total_price: float = 0.0
    currency: str = "USD"
    status: str = "pending"  # pending, in_production, completed, shipped
    current_stage_id: Optional[str] = None
    assigned_to: Optional[str] = None  # user_id
    batch_id: Optional[str] = None  # Production batch ID
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class OrderCreate(BaseModel):
    external_id: str
    store_id: str
    store_name: str
    platform: str
    customer_name: str
    customer_email: Optional[str] = None
    items: List[dict] = []
    total_price: float = 0.0
    currency: str = "USD"

# Production Batch - groups orders for frame production
class ProductionBatch(BaseModel):
    model_config = ConfigDict(extra="ignore")
    batch_id: str = Field(default_factory=lambda: f"batch_{uuid.uuid4().hex[:8]}")
    name: str
    order_ids: List[str] = []
    current_stage_id: str
    assigned_to: Optional[str] = None
    assigned_name: Optional[str] = None
    status: str = "active"  # active, completed
    time_started: Optional[datetime] = None
    time_completed: Optional[datetime] = None
    total_items: int = 0
    items_completed: int = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# Production Item - individual item tracking within a batch
class ProductionItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    item_id: str = Field(default_factory=lambda: f"item_{uuid.uuid4().hex[:8]}")
    batch_id: str
    order_id: str
    sku: str
    name: str
    color: str
    size: str
    qty_required: int = 1
    qty_completed: int = 0
    qty_rejected: int = 0  # Track rejected frames
    current_stage_id: str
    status: str = "pending"  # pending, in_progress, completed
    added_to_inventory: bool = False  # Track if added to inventory
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class TimeLog(BaseModel):
    """Time tracking per user, per stage - users typically work on one stage"""
    model_config = ConfigDict(extra="ignore")
    log_id: str = Field(default_factory=lambda: f"log_{uuid.uuid4().hex[:12]}")
    user_id: str
    user_name: str
    stage_id: str
    stage_name: str
    batch_id: Optional[str] = None  # Optional - can be general stage work
    action: str  # started, stopped, paused, resumed
    started_at: datetime
    completed_at: Optional[datetime] = None
    paused_at: Optional[datetime] = None  # When timer was paused
    accumulated_minutes: float = 0  # Time accumulated before pause
    duration_minutes: Optional[float] = None
    items_processed: int = 0
    is_paused: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class StageTimerStart(BaseModel):
    stage_id: str

class StageTimerStop(BaseModel):
    stage_id: str
    items_processed: int = 0

class StageMove(BaseModel):
    new_stage_id: str
    items_processed: int = 1

class TimeLogCreate(BaseModel):
    stage_id: str
    stage_name: str
    action: str
    items_processed: int = 1

class BatchCreate(BaseModel):
    name: str
    order_ids: List[str]

class ItemMove(BaseModel):
    item_id: str
    new_stage_id: str
    qty_completed: int = 0

# Inventory Models
class InventoryItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    item_id: str = Field(default_factory=lambda: f"inv_{uuid.uuid4().hex[:8]}")
    sku: str
    name: str
    color: Optional[str] = None
    size: Optional[str] = None
    quantity: int = 0
    min_stock: int = 10
    location: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class InventoryCreate(BaseModel):
    sku: str
    name: str
    color: Optional[str] = None
    size: Optional[str] = None
    quantity: int = 0
    min_stock: int = 10
    location: Optional[str] = None

# ============== Auth Helpers ==============

async def get_current_user(request: Request) -> User:
    """Get current user from session token in cookie or header"""
    session_token = request.cookies.get("session_token")
    if not session_token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            session_token = auth_header.split(" ")[1]
    
    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    session_doc = await db.user_sessions.find_one(
        {"session_token": session_token},
        {"_id": 0}
    )
    
    if not session_doc:
        raise HTTPException(status_code=401, detail="Invalid session")
    
    # Check expiry
    expires_at = session_doc.get("expires_at")
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")
    
    user_doc = await db.users.find_one(
        {"user_id": session_doc["user_id"]},
        {"_id": 0}
    )
    
    if not user_doc:
        raise HTTPException(status_code=401, detail="User not found")
    
    return User(**user_doc)

# ============== Auth Routes ==============

@api_router.post("/auth/session")
async def create_session(request: Request, response: Response):
    """Exchange session_id for session_token"""
    body = await request.json()
    session_id = body.get("session_id")
    
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id required")
    
    # Call Emergent auth to get user data
    async with httpx.AsyncClient() as client:
        try:
            auth_response = await client.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": session_id},
                timeout=10.0
            )
            auth_response.raise_for_status()
            user_data = auth_response.json()
        except Exception as e:
            logger.error(f"Auth error: {e}")
            raise HTTPException(status_code=401, detail="Invalid session_id")
    
    # Generate user_id
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    email = user_data.get("email", "")
    
    # Check if user exists
    existing_user = await db.users.find_one({"email": email}, {"_id": 0})
    if existing_user:
        user_id = existing_user["user_id"]
        # Update user data
        await db.users.update_one(
            {"email": email},
            {"$set": {
                "name": user_data.get("name", ""),
                "picture": user_data.get("picture", "")
            }}
        )
    else:
        # Create new user (first user is admin)
        user_count = await db.users.count_documents({})
        role = "admin" if user_count == 0 else "worker"
        
        new_user = {
            "user_id": user_id,
            "email": email,
            "name": user_data.get("name", ""),
            "picture": user_data.get("picture", ""),
            "role": role,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.users.insert_one(new_user)
    
    # Create session
    session_token = user_data.get("session_token", f"sess_{uuid.uuid4().hex}")
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    
    session_doc = {
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Remove old sessions for this user
    await db.user_sessions.delete_many({"user_id": user_id})
    await db.user_sessions.insert_one(session_doc)
    
    # Set cookie - use lax samesite for better compatibility
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="lax",
        path="/",
        max_age=7 * 24 * 60 * 60
    )
    
    # Get updated user
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    
    return user_doc

@api_router.get("/auth/me")
async def get_me(user: User = Depends(get_current_user)):
    """Get current authenticated user"""
    return user.model_dump()

@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    """Logout user"""
    session_token = request.cookies.get("session_token")
    if session_token:
        await db.user_sessions.delete_many({"session_token": session_token})
    
    response.delete_cookie(key="session_token", path="/", samesite="lax", secure=True)
    return {"message": "Logged out"}

# ============== Users Routes ==============

@api_router.get("/users")
async def get_users(user: User = Depends(get_current_user)):
    """Get all users (admin/manager only)"""
    if user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    users = await db.users.find({}, {"_id": 0}).to_list(1000)
    return users

@api_router.put("/users/{user_id}/role")
async def update_user_role(user_id: str, role: str, user: User = Depends(get_current_user)):
    """Update user role (admin only)"""
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    
    if role not in ["admin", "manager", "worker"]:
        raise HTTPException(status_code=400, detail="Invalid role")
    
    result = await db.users.update_one(
        {"user_id": user_id},
        {"$set": {"role": role}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {"message": "Role updated"}

# ============== Stores Routes ==============

@api_router.get("/stores")
async def get_stores(user: User = Depends(get_current_user)):
    """Get all stores"""
    stores = await db.stores.find({}, {"_id": 0, "api_secret": 0, "access_token": 0}).to_list(100)
    return stores

@api_router.post("/stores")
async def create_store(store_data: StoreCreate, user: User = Depends(get_current_user)):
    """Create a new store connection"""
    if user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    store = Store(**store_data.model_dump())
    doc = store.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    
    await db.stores.insert_one(doc)
    
    # Return without sensitive fields
    return {k: v for k, v in doc.items() if k not in ["_id", "api_secret", "access_token"]}

@api_router.delete("/stores/{store_id}")
async def delete_store(store_id: str, user: User = Depends(get_current_user)):
    """Delete a store"""
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    
    result = await db.stores.delete_one({"store_id": store_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Store not found")
    
    return {"message": "Store deleted"}

# ============== Production Stages Routes ==============

@api_router.get("/stages")
async def get_stages(user: User = Depends(get_current_user)):
    """Get all production stages"""
    stages = await db.production_stages.find({}, {"_id": 0}).sort("order", 1).to_list(100)
    
    # Initialize default stages if none exist
    if not stages:
        default_stages = [
            {"stage_id": "stage_new", "name": "New Orders", "order": 0, "color": "#6366F1"},
            {"stage_id": "stage_cutting", "name": "Cutting", "order": 1, "color": "#F59E0B"},
            {"stage_id": "stage_assembly", "name": "Assembly", "order": 2, "color": "#3B82F6"},
            {"stage_id": "stage_qc", "name": "Sand", "order": 3, "color": "#8B5CF6"},
            {"stage_id": "stage_packing", "name": "Paint", "order": 4, "color": "#22C55E"},
            {"stage_id": "stage_ready", "name": "Quality Check", "order": 5, "color": "#10B981"},
        ]
        for stage in default_stages:
            stage["created_at"] = datetime.now(timezone.utc).isoformat()
        await db.production_stages.insert_many(default_stages)
        stages = default_stages
    
    return stages

@api_router.post("/stages")
async def create_stage(name: str, color: str = "#3B82F6", user: User = Depends(get_current_user)):
    """Create a new production stage"""
    if user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Get max order
    max_stage = await db.production_stages.find_one(sort=[("order", -1)])
    new_order = (max_stage.get("order", 0) + 1) if max_stage else 0
    
    stage = ProductionStage(name=name, order=new_order, color=color)
    doc = stage.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    
    await db.production_stages.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

# ============== SKU Parser Helper ==============

def parse_sku(sku: str) -> dict:
    """Parse SKU to extract color and size
    Format: PREFIX-XXX-COLOR-SIZE or variations
    Size codes: S, L, XL, HS, HX, XX, XXX
    Color codes: B, N, W, etc.
    """
    size_codes = ['XXX', 'XX', 'XL', 'HS', 'HX', 'S', 'L']
    
    # Split SKU by common delimiters
    parts = sku.replace('_', '-').replace('.', '-').split('-')
    parts = [p.strip().upper() for p in parts if p.strip()]
    
    color = "UNK"
    size = "UNK"
    
    if len(parts) >= 2:
        # Try to find size in the last part
        last_part = parts[-1]
        for size_code in size_codes:
            if last_part == size_code or last_part.endswith(size_code):
                size = size_code
                break
        
        # Color is typically second to last
        if len(parts) >= 2:
            second_last = parts[-2] if size != "UNK" else parts[-1]
            # If it's a single letter or short code, it's likely the color
            if len(second_last) <= 3 and second_last.isalpha():
                color = second_last
    
    # Fallback: try to extract from end of SKU string
    if color == "UNK" or size == "UNK":
        clean_sku = sku.upper().replace(' ', '')
        for size_code in size_codes:
            if clean_sku.endswith(size_code):
                size = size_code
                # Try to get color before size
                remaining = clean_sku[:-len(size_code)].rstrip('-_')
                if remaining:
                    last_char = remaining[-1]
                    if last_char.isalpha():
                        color = last_char
                break
    
    return {"color": color, "size": size}

# ============== Production Batches Routes ==============

@api_router.get("/batches")
async def get_batches(
    status: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get all production batches"""
    query = {}
    if status:
        query["status"] = status
    
    batches = await db.production_batches.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return batches

@api_router.get("/batches/{batch_id}")
async def get_batch(batch_id: str, user: User = Depends(get_current_user)):
    """Get a single batch with its items"""
    batch = await db.production_batches.find_one({"batch_id": batch_id}, {"_id": 0})
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    # Get items for this batch
    items = await db.production_items.find({"batch_id": batch_id}, {"_id": 0}).to_list(1000)
    
    # Get orders in this batch
    orders = await db.orders.find({"order_id": {"$in": batch.get("order_ids", [])}}, {"_id": 0}).to_list(1000)
    
    return {
        **batch,
        "items": items,
        "orders": orders
    }

@api_router.post("/batches")
async def create_batch(batch_data: BatchCreate, user: User = Depends(get_current_user)):
    """Create a production batch from selected orders.
    Orders can only be added to ONE batch - no duplicates allowed."""
    if not batch_data.order_ids:
        raise HTTPException(status_code=400, detail="No orders selected")
    
    # Check if any orders are already in a batch
    already_batched = await db.orders.find(
        {"order_id": {"$in": batch_data.order_ids}, "batch_id": {"$ne": None}},
        {"_id": 0, "order_id": 1, "batch_id": 1}
    ).to_list(1000)
    
    if already_batched:
        order_ids = [o["order_id"] for o in already_batched]
        raise HTTPException(
            status_code=400, 
            detail=f"Orders already in a batch: {', '.join(order_ids[:3])}{'...' if len(order_ids) > 3 else ''}"
        )
    
    # Get the orders
    orders = await db.orders.find(
        {"order_id": {"$in": batch_data.order_ids}},
        {"_id": 0}
    ).to_list(1000)
    
    if not orders:
        raise HTTPException(status_code=404, detail="No orders found")
    
    # Get first production stage (skip "New Orders")
    stages = await db.production_stages.find({}, {"_id": 0}).sort("order", 1).to_list(100)
    first_stage = stages[1] if len(stages) > 1 else stages[0]
    
    # Create the batch
    batch_id = f"batch_{uuid.uuid4().hex[:8]}"
    total_items = 0
    
    # Parse items from orders and create production items
    production_items = []
    for order in orders:
        for item in order.get("items", []):
            sku = item.get("sku", "UNKNOWN")
            parsed = parse_sku(sku)
            qty = item.get("qty", 1)
            total_items += qty
            
            prod_item = {
                "item_id": f"item_{uuid.uuid4().hex[:8]}",
                "batch_id": batch_id,
                "order_id": order["order_id"],
                "sku": sku,
                "name": item.get("name", "Unknown Item"),
                "color": parsed["color"],
                "size": parsed["size"],
                "qty_required": qty,
                "qty_completed": 0,
                "qty_rejected": 0,
                "current_stage_id": first_stage["stage_id"],
                "status": "pending",
                "added_to_inventory": False,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            production_items.append(prod_item)
    
    # Insert production items
    if production_items:
        await db.production_items.insert_many(production_items)
    
    # Create batch document
    batch_doc = {
        "batch_id": batch_id,
        "name": batch_data.name,
        "order_ids": batch_data.order_ids,
        "current_stage_id": first_stage["stage_id"],
        "assigned_to": None,
        "assigned_name": None,
        "status": "active",
        "time_started": None,
        "time_completed": None,
        "total_items": total_items,
        "items_completed": 0,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.production_batches.insert_one(batch_doc)
    
    # Update orders to reference this batch
    await db.orders.update_many(
        {"order_id": {"$in": batch_data.order_ids}},
        {"$set": {
            "batch_id": batch_id,
            "status": "in_production",
            "current_stage_id": first_stage["stage_id"],
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {
        **{k: v for k, v in batch_doc.items() if k != "_id"},
        "items_count": len(production_items)
    }

@api_router.post("/stages/{stage_id}/start-timer")
async def start_stage_timer(stage_id: str, user: User = Depends(get_current_user)):
    """Start time tracking for a user working on a specific stage.
    User can only have ONE active timer at a time across all stages."""
    
    stage = await db.production_stages.find_one({"stage_id": stage_id}, {"_id": 0})
    if not stage:
        raise HTTPException(status_code=404, detail="Stage not found")
    
    # Check if user already has ANY active timer (only one timer allowed at a time)
    any_active_timer = await db.time_logs.find_one({
        "user_id": user.user_id,
        "completed_at": None
    }, {"_id": 0})
    
    if any_active_timer:
        raise HTTPException(
            status_code=400, 
            detail=f"You already have an active timer for {any_active_timer.get('stage_name', 'another stage')}. Stop it first."
        )
    
    now = datetime.now(timezone.utc)
    
    time_log = {
        "log_id": f"log_{uuid.uuid4().hex[:12]}",
        "user_id": user.user_id,
        "user_name": user.name,
        "stage_id": stage_id,
        "stage_name": stage["name"],
        "action": "started",
        "started_at": now.isoformat(),
        "items_processed": 0,
        "created_at": now.isoformat()
    }
    await db.time_logs.insert_one(time_log)
    
    return {
        "message": f"Timer started for {stage['name']}",
        "stage_id": stage_id,
        "stage_name": stage["name"],
        "user_name": user.name,
        "started_at": now.isoformat()
    }

@api_router.post("/stages/{stage_id}/stop-timer")
async def stop_stage_timer(
    stage_id: str, 
    items_processed: int = 0,
    user: User = Depends(get_current_user)
):
    """Stop time tracking for a user's stage work."""
    
    # Find the active timer for this user and stage
    active_timer = await db.time_logs.find_one({
        "user_id": user.user_id,
        "stage_id": stage_id,
        "completed_at": None
    }, {"_id": 0})
    
    if not active_timer:
        raise HTTPException(status_code=400, detail="No active timer for this stage")
    
    now = datetime.now(timezone.utc)
    accumulated = active_timer.get("accumulated_minutes", 0)
    
    # If timer is paused, just use accumulated time
    if active_timer.get("is_paused"):
        duration_minutes = accumulated
    else:
        # Calculate time since last start/resume
        started_at = datetime.fromisoformat(active_timer["started_at"])
        if started_at.tzinfo is None:
            started_at = started_at.replace(tzinfo=timezone.utc)
        
        current_session = (now - started_at).total_seconds() / 60
        duration_minutes = accumulated + current_session
    
    # Update the time log
    await db.time_logs.update_one(
        {"log_id": active_timer["log_id"]},
        {"$set": {
            "completed_at": now.isoformat(),
            "duration_minutes": round(duration_minutes, 2),
            "items_processed": items_processed,
            "action": "stopped",
            "is_paused": False
        }}
    )
    
    return {
        "message": "Timer stopped",
        "stage_id": stage_id,
        "stage_name": active_timer["stage_name"],
        "duration_minutes": round(duration_minutes, 2),
        "items_processed": items_processed
    }

@api_router.post("/stages/{stage_id}/pause-timer")
async def pause_stage_timer(stage_id: str, user: User = Depends(get_current_user)):
    """Pause the timer - saves accumulated time."""
    
    active_timer = await db.time_logs.find_one({
        "user_id": user.user_id,
        "stage_id": stage_id,
        "completed_at": None
    }, {"_id": 0})
    
    if not active_timer:
        raise HTTPException(status_code=400, detail="No active timer for this stage")
    
    if active_timer.get("is_paused"):
        raise HTTPException(status_code=400, detail="Timer is already paused")
    
    now = datetime.now(timezone.utc)
    started_at = datetime.fromisoformat(active_timer["started_at"])
    if started_at.tzinfo is None:
        started_at = started_at.replace(tzinfo=timezone.utc)
    
    # Calculate time in this session and add to accumulated
    current_session = (now - started_at).total_seconds() / 60
    accumulated = active_timer.get("accumulated_minutes", 0) + current_session
    
    await db.time_logs.update_one(
        {"log_id": active_timer["log_id"]},
        {"$set": {
            "is_paused": True,
            "paused_at": now.isoformat(),
            "accumulated_minutes": round(accumulated, 2),
            "action": "paused"
        }}
    )
    
    return {
        "message": "Timer paused",
        "stage_id": stage_id,
        "stage_name": active_timer["stage_name"],
        "accumulated_minutes": round(accumulated, 2)
    }

@api_router.post("/stages/{stage_id}/resume-timer")
async def resume_stage_timer(stage_id: str, user: User = Depends(get_current_user)):
    """Resume a paused timer."""
    
    active_timer = await db.time_logs.find_one({
        "user_id": user.user_id,
        "stage_id": stage_id,
        "completed_at": None
    }, {"_id": 0})
    
    if not active_timer:
        raise HTTPException(status_code=400, detail="No active timer for this stage")
    
    if not active_timer.get("is_paused"):
        raise HTTPException(status_code=400, detail="Timer is not paused")
    
    now = datetime.now(timezone.utc)
    
    await db.time_logs.update_one(
        {"log_id": active_timer["log_id"]},
        {"$set": {
            "is_paused": False,
            "started_at": now.isoformat(),  # Reset start time for new session
            "action": "resumed"
        }}
    )
    
    return {
        "message": "Timer resumed",
        "stage_id": stage_id,
        "stage_name": active_timer["stage_name"],
        "accumulated_minutes": active_timer.get("accumulated_minutes", 0)
    }

@api_router.get("/stages/{stage_id}/active-timer")
async def get_active_stage_timer(stage_id: str, user: User = Depends(get_current_user)):
    """Check if user has an active timer for a stage."""
    active_timer = await db.time_logs.find_one({
        "user_id": user.user_id,
        "stage_id": stage_id,
        "completed_at": None
    }, {"_id": 0})
    
    if not active_timer:
        return {"active": False}
    
    return {
        "active": True,
        "started_at": active_timer["started_at"],
        "stage_name": active_timer["stage_name"]
    }

@api_router.get("/user/active-timers")
async def get_user_active_timers(user: User = Depends(get_current_user)):
    """Get all active timers for the current user across all stages."""
    active_timers = await db.time_logs.find({
        "user_id": user.user_id,
        "completed_at": None
    }, {"_id": 0}).to_list(100)
    
    return active_timers

@api_router.get("/user/time-stats")
async def get_user_time_stats(user: User = Depends(get_current_user)):
    """Get time tracking statistics for the current user per stage."""
    # Get all completed time logs for user
    logs = await db.time_logs.find({
        "user_id": user.user_id,
        "completed_at": {"$ne": None}
    }, {"_id": 0}).to_list(10000)
    
    # Group by stage
    stage_stats = {}
    for log in logs:
        stage_id = log["stage_id"]
        if stage_id not in stage_stats:
            stage_stats[stage_id] = {
                "stage_id": stage_id,
                "stage_name": log.get("stage_name", "Unknown"),
                "total_minutes": 0,
                "total_items": 0,
                "session_count": 0
            }
        stage_stats[stage_id]["total_minutes"] += log.get("duration_minutes", 0)
        stage_stats[stage_id]["total_items"] += log.get("items_processed", 0)
        stage_stats[stage_id]["session_count"] += 1
    
    # Calculate averages
    for stats in stage_stats.values():
        if stats["total_minutes"] > 0 and stats["total_items"] > 0:
            stats["avg_items_per_hour"] = round((stats["total_items"] / stats["total_minutes"]) * 60, 1)
        else:
            stats["avg_items_per_hour"] = 0
    
    return list(stage_stats.values())

@api_router.get("/stages/active-workers")
async def get_stages_active_workers(user: User = Depends(get_current_user)):
    """Get all active timers across all stages - shows who is working on what."""
    active_timers = await db.time_logs.find({
        "completed_at": None
    }, {"_id": 0}).to_list(1000)
    
    # Group by stage
    stage_workers = {}
    for timer in active_timers:
        stage_id = timer["stage_id"]
        if stage_id not in stage_workers:
            stage_workers[stage_id] = {
                "stage_id": stage_id,
                "stage_name": timer.get("stage_name", "Unknown"),
                "workers": []
            }
        stage_workers[stage_id]["workers"].append({
            "user_id": timer["user_id"],
            "user_name": timer["user_name"],
            "started_at": timer["started_at"],
            "items_processed": timer.get("items_processed", 0)
        })
    
    return list(stage_workers.values())

@api_router.get("/batches/{batch_id}/items-grouped")
async def get_batch_items_grouped(batch_id: str, user: User = Depends(get_current_user)):
    """Get batch items grouped by color and size with subtotals"""
    items = await db.production_items.find({"batch_id": batch_id}, {"_id": 0}).to_list(10000)
    
    # Group by color and size
    grouped = {}
    for item in items:
        key = f"{item['color']}-{item['size']}"
        if key not in grouped:
            grouped[key] = {
                "color": item["color"],
                "size": item["size"],
                "items": [],
                "total_required": 0,
                "total_completed": 0
            }
        grouped[key]["items"].append(item)
        grouped[key]["total_required"] += item.get("qty_required", 1)
        grouped[key]["total_completed"] += item.get("qty_completed", 0)
    
    # Convert to list and sort
    result = list(grouped.values())
    result.sort(key=lambda x: (x["color"], x["size"]))
    
    return result

@api_router.put("/items/{item_id}/update")
async def update_item_progress(
    item_id: str,
    qty_completed: int,
    user: User = Depends(get_current_user)
):
    """Update the completed quantity for an item - allows qty > required (e.g., extras in cutting)"""
    item = await db.production_items.find_one({"item_id": item_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    # Allow qty_completed to exceed qty_required (for extras/spares)
    qty_completed = max(0, qty_completed)
    
    status = "completed" if qty_completed >= item.get("qty_required", 1) else "in_progress"
    
    await db.production_items.update_one(
        {"item_id": item_id},
        {"$set": {
            "qty_completed": qty_completed,
            "status": status
        }}
    )
    
    # Update batch totals
    batch = await db.production_batches.find_one({"batch_id": item["batch_id"]}, {"_id": 0})
    if batch:
        # Recalculate completed items
        all_items = await db.production_items.find({"batch_id": item["batch_id"]}, {"_id": 0}).to_list(10000)
        total_completed = sum(i.get("qty_completed", 0) for i in all_items)
        
        await db.production_batches.update_one(
            {"batch_id": item["batch_id"]},
            {"$set": {"items_completed": total_completed}}
        )
    
    return {"message": "Item updated", "qty_completed": qty_completed, "status": status}

@api_router.put("/items/{item_id}/move-stage")
async def move_item_stage(
    item_id: str,
    move_data: ItemMove,
    user: User = Depends(get_current_user)
):
    """Move an individual item to the next stage.
    Each stage is a new task - qty_completed resets to 0 for the next user/stage."""
    item = await db.production_items.find_one({"item_id": item_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    # Get previous and new stage info
    prev_stage_id = item.get("current_stage_id")
    new_stage = await db.production_stages.find_one({"stage_id": move_data.new_stage_id}, {"_id": 0})
    if not new_stage:
        raise HTTPException(status_code=404, detail="Stage not found")
    
    # Record completed qty for this stage before resetting
    completed_this_stage = item.get("qty_completed", 0)
    
    # Reset qty_completed to 0 for the next stage (each stage is a new task)
    await db.production_items.update_one(
        {"item_id": item_id},
        {"$set": {
            "current_stage_id": move_data.new_stage_id,
            "qty_completed": 0,  # Reset for next stage
            "status": "pending"
        }}
    )
    
    # If user has an active timer for the previous stage, increment items processed
    if prev_stage_id:
        active_timer = await db.time_logs.find_one({
            "user_id": user.user_id,
            "stage_id": prev_stage_id,
            "completed_at": None
        }, {"_id": 0})
        
        if active_timer:
            await db.time_logs.update_one(
                {"log_id": active_timer["log_id"]},
                {"$inc": {"items_processed": completed_this_stage}}
            )
    
    return {
        "message": f"Item moved to {new_stage['name']} (qty reset to 0)",
        "item_id": item_id,
        "new_stage": new_stage["name"],
        "completed_in_previous_stage": completed_this_stage
    }

class BulkMoveRequest(BaseModel):
    stage_id: str
    next_stage_id: str

@api_router.post("/items/bulk-move")
async def bulk_move_completed_items(
    move_data: BulkMoveRequest,
    user: User = Depends(get_current_user)
):
    """Move all completed items from one stage to the next stage.
    Each stage is a new task - qty_completed resets to 0 for the next user/stage."""
    
    # Get stages info
    current_stage = await db.production_stages.find_one({"stage_id": move_data.stage_id}, {"_id": 0})
    next_stage = await db.production_stages.find_one({"stage_id": move_data.next_stage_id}, {"_id": 0})
    
    if not current_stage or not next_stage:
        raise HTTPException(status_code=404, detail="Stage not found")
    
    # Find all completed items at the current stage
    completed_items = await db.production_items.find({
        "current_stage_id": move_data.stage_id,
        "$expr": {"$gte": ["$qty_completed", "$qty_required"]}
    }, {"_id": 0}).to_list(10000)
    
    if not completed_items:
        return {"message": "No completed items to move", "moved_count": 0}
    
    item_ids = [item["item_id"] for item in completed_items]
    
    # Calculate total items processed for timer tracking
    total_items_processed = sum(item.get("qty_completed", 0) for item in completed_items)
    
    # Update all items: move to next stage AND reset qty_completed to 0
    await db.production_items.update_many(
        {"item_id": {"$in": item_ids}},
        {"$set": {
            "current_stage_id": move_data.next_stage_id,
            "qty_completed": 0,  # Reset for next stage
            "status": "pending"
        }}
    )
    
    # If user has an active timer for current stage, increment items processed
    active_timer = await db.time_logs.find_one({
        "user_id": user.user_id,
        "stage_id": move_data.stage_id,
        "completed_at": None
    }, {"_id": 0})
    
    if active_timer:
        await db.time_logs.update_one(
            {"log_id": active_timer["log_id"]},
            {"$inc": {"items_processed": total_items_processed}}
        )
    
    return {
        "message": f"Moved {len(item_ids)} items to {next_stage['name']} (qty reset to 0)",
        "moved_count": len(item_ids),
        "items_processed": total_items_processed,
        "next_stage": next_stage["name"]
    }

@api_router.get("/batches/{batch_id}/stage-summary")
async def get_batch_stage_summary(batch_id: str, user: User = Depends(get_current_user)):
    """Get summary of items by stage for a batch"""
    items = await db.production_items.find({"batch_id": batch_id}, {"_id": 0}).to_list(10000)
    stages = await db.production_stages.find({}, {"_id": 0}).sort("order", 1).to_list(100)
    
    # Create stage map
    stage_map = {s["stage_id"]: s for s in stages}
    
    # Group items by stage
    stage_summary = {}
    for stage in stages:
        stage_summary[stage["stage_id"]] = {
            "stage_id": stage["stage_id"],
            "stage_name": stage["name"],
            "color": stage["color"],
            "order": stage["order"],
            "total_items": 0,
            "total_required": 0,
            "total_completed": 0,
            "items": []
        }
    
    for item in items:
        stage_id = item.get("current_stage_id", "stage_new")
        if stage_id in stage_summary:
            stage_summary[stage_id]["items"].append(item)
            stage_summary[stage_id]["total_items"] += 1
            stage_summary[stage_id]["total_required"] += item.get("qty_required", 1)
            stage_summary[stage_id]["total_completed"] += item.get("qty_completed", 0)
    
    # Convert to sorted list
    result = list(stage_summary.values())
    result.sort(key=lambda x: x["order"])
    
    return result

@api_router.delete("/batches/{batch_id}")
async def delete_batch(batch_id: str, user: User = Depends(get_current_user)):
    """Delete a batch and return orders to pending"""
    if user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    batch = await db.production_batches.find_one({"batch_id": batch_id}, {"_id": 0})
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    # Delete production items
    await db.production_items.delete_many({"batch_id": batch_id})
    
    # Reset orders
    first_stage = await db.production_stages.find_one(sort=[("order", 1)])
    first_stage_id = first_stage["stage_id"] if first_stage else "stage_new"
    
    await db.orders.update_many(
        {"batch_id": batch_id},
        {"$set": {
            "batch_id": None,
            "status": "pending",
            "current_stage_id": first_stage_id,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Delete batch
    await db.production_batches.delete_one({"batch_id": batch_id})
    
    return {"message": "Batch deleted"}

# ============== Orders Routes ==============

@api_router.get("/orders")
async def get_orders(
    store_id: Optional[str] = None,
    status: Optional[str] = None,
    stage_id: Optional[str] = None,
    unbatched: Optional[bool] = None,
    user: User = Depends(get_current_user)
):
    """Get all orders with optional filters"""
    query = {}
    if store_id:
        query["store_id"] = store_id
    if status:
        query["status"] = status
    if stage_id:
        query["current_stage_id"] = stage_id
    if unbatched:
        query["$or"] = [{"batch_id": None}, {"batch_id": {"$exists": False}}]
    
    orders = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return orders

@api_router.post("/orders")
async def create_order(order_data: OrderCreate, user: User = Depends(get_current_user)):
    """Create a new order (manual entry or sync)"""
    order = Order(**order_data.model_dump())
    
    # Set initial stage
    stages = await db.production_stages.find({}, {"_id": 0}).sort("order", 1).to_list(1)
    if stages:
        order.current_stage_id = stages[0]["stage_id"]
    
    doc = order.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    doc["updated_at"] = doc["updated_at"].isoformat()
    
    await db.orders.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

@api_router.get("/orders/{order_id}")
async def get_order(order_id: str, user: User = Depends(get_current_user)):
    """Get single order"""
    order = await db.orders.find_one({"order_id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order

@api_router.put("/orders/{order_id}/stage")
async def move_order_stage(order_id: str, move_data: StageMove, user: User = Depends(get_current_user)):
    """Move order to a new stage and log time"""
    order = await db.orders.find_one({"order_id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    old_stage_id = order.get("current_stage_id")
    new_stage_id = move_data.new_stage_id
    
    # Get stage info
    new_stage = await db.production_stages.find_one({"stage_id": new_stage_id}, {"_id": 0})
    if not new_stage:
        raise HTTPException(status_code=404, detail="Stage not found")
    
    # Complete any open time logs for this order
    if old_stage_id:
        now = datetime.now(timezone.utc)
        open_logs = await db.time_logs.find(
            {"order_id": order_id, "completed_at": None}
        ).to_list(100)
        
        for log in open_logs:
            started_at = log.get("started_at")
            if isinstance(started_at, str):
                started_at = datetime.fromisoformat(started_at)
            if started_at.tzinfo is None:
                started_at = started_at.replace(tzinfo=timezone.utc)
            
            duration = (now - started_at).total_seconds() / 60
            await db.time_logs.update_one(
                {"log_id": log["log_id"]},
                {"$set": {
                    "completed_at": now.isoformat(),
                    "duration_minutes": round(duration, 2)
                }}
            )
    
    # Create new time log
    time_log = TimeLog(
        user_id=user.user_id,
        user_name=user.name,
        order_id=order_id,
        stage_id=new_stage_id,
        stage_name=new_stage["name"],
        action="moved",
        started_at=datetime.now(timezone.utc),
        items_processed=move_data.items_processed
    )
    log_doc = time_log.model_dump()
    log_doc["started_at"] = log_doc["started_at"].isoformat()
    log_doc["created_at"] = log_doc["created_at"].isoformat()
    await db.time_logs.insert_one(log_doc)
    
    # Determine status based on stage
    stages = await db.production_stages.find({}, {"_id": 0}).sort("order", 1).to_list(100)
    stage_orders = {s["stage_id"]: s["order"] for s in stages}
    new_stage_order = stage_orders.get(new_stage_id, 0)
    
    if new_stage_order == 0:
        status = "pending"
    elif new_stage_order == len(stages) - 1:
        status = "completed"
    else:
        status = "in_production"
    
    # Update order
    await db.orders.update_one(
        {"order_id": order_id},
        {"$set": {
            "current_stage_id": new_stage_id,
            "status": status,
            "assigned_to": user.user_id,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"message": "Order moved", "new_stage": new_stage["name"], "status": status}

@api_router.put("/orders/{order_id}/assign")
async def assign_order(order_id: str, assignee_id: str, user: User = Depends(get_current_user)):
    """Assign order to a user"""
    result = await db.orders.update_one(
        {"order_id": order_id},
        {"$set": {
            "assigned_to": assignee_id,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Order not found")
    
    return {"message": "Order assigned"}

# ============== Time Logs Routes ==============

@api_router.get("/time-logs")
async def get_time_logs(
    user_id: Optional[str] = None,
    order_id: Optional[str] = None,
    stage_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get time logs with optional filters"""
    query = {}
    if user_id:
        query["user_id"] = user_id
    if order_id:
        query["order_id"] = order_id
    if stage_id:
        query["stage_id"] = stage_id
    
    logs = await db.time_logs.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return logs

@api_router.post("/time-logs/start")
async def start_time_log(log_data: TimeLogCreate, user: User = Depends(get_current_user)):
    """Start tracking time for an order stage"""
    time_log = TimeLog(
        user_id=user.user_id,
        user_name=user.name,
        order_id=log_data.order_id,
        stage_id=log_data.stage_id,
        stage_name=log_data.stage_name,
        action=log_data.action,
        started_at=datetime.now(timezone.utc),
        items_processed=log_data.items_processed
    )
    
    doc = time_log.model_dump()
    doc["started_at"] = doc["started_at"].isoformat()
    doc["created_at"] = doc["created_at"].isoformat()
    
    await db.time_logs.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

@api_router.put("/time-logs/{log_id}/complete")
async def complete_time_log(log_id: str, items_processed: int = 1, user: User = Depends(get_current_user)):
    """Complete a time log entry"""
    log = await db.time_logs.find_one({"log_id": log_id}, {"_id": 0})
    if not log:
        raise HTTPException(status_code=404, detail="Time log not found")
    
    started_at = log.get("started_at")
    if isinstance(started_at, str):
        started_at = datetime.fromisoformat(started_at)
    if started_at.tzinfo is None:
        started_at = started_at.replace(tzinfo=timezone.utc)
    
    now = datetime.now(timezone.utc)
    duration = (now - started_at).total_seconds() / 60
    
    await db.time_logs.update_one(
        {"log_id": log_id},
        {"$set": {
            "completed_at": now.isoformat(),
            "duration_minutes": round(duration, 2),
            "items_processed": items_processed
        }}
    )
    
    return {"message": "Time log completed", "duration_minutes": round(duration, 2)}

# ============== Reports/Stats Routes ==============

@api_router.get("/stats/dashboard")
async def get_dashboard_stats(user: User = Depends(get_current_user)):
    """Get dashboard statistics"""
    # Order counts by status
    total_orders = await db.orders.count_documents({})
    pending = await db.orders.count_documents({"status": "pending"})
    in_production = await db.orders.count_documents({"status": "in_production"})
    completed = await db.orders.count_documents({"status": "completed"})
    
    # Calculate avg items per hour from time logs
    pipeline = [
        {"$match": {"duration_minutes": {"$gt": 0}}},
        {"$group": {
            "_id": None,
            "total_items": {"$sum": "$items_processed"},
            "total_minutes": {"$sum": "$duration_minutes"}
        }}
    ]
    agg_result = await db.time_logs.aggregate(pipeline).to_list(1)
    
    avg_items_per_hour = 0
    if agg_result and agg_result[0]["total_minutes"] > 0:
        avg_items_per_hour = round(
            (agg_result[0]["total_items"] / agg_result[0]["total_minutes"]) * 60, 1
        )
    
    # Orders by store
    store_pipeline = [
        {"$group": {"_id": "$store_name", "count": {"$sum": 1}}}
    ]
    orders_by_store = await db.orders.aggregate(store_pipeline).to_list(100)
    
    # Recent activity (last 7 days)
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    daily_pipeline = [
        {"$match": {"completed_at": {"$ne": None}}},
        {"$addFields": {
            "completed_date": {"$dateFromString": {"dateString": "$completed_at"}}
        }},
        {"$match": {"completed_date": {"$gte": week_ago}}},
        {"$group": {
            "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$completed_date"}},
            "items": {"$sum": "$items_processed"},
            "hours": {"$sum": {"$divide": ["$duration_minutes", 60]}}
        }},
        {"$sort": {"_id": 1}}
    ]
    daily_stats = await db.time_logs.aggregate(daily_pipeline).to_list(7)
    
    return {
        "orders": {
            "total": total_orders,
            "pending": pending,
            "in_production": in_production,
            "completed": completed
        },
        "avg_items_per_hour": avg_items_per_hour,
        "orders_by_store": [{"name": s["_id"] or "Unknown", "count": s["count"]} for s in orders_by_store],
        "daily_production": daily_stats
    }

@api_router.get("/stats/users")
async def get_user_stats(user: User = Depends(get_current_user)):
    """Get user performance statistics"""
    pipeline = [
        {"$match": {"duration_minutes": {"$gt": 0}}},
        {"$group": {
            "_id": {"user_id": "$user_id", "user_name": "$user_name"},
            "total_items": {"$sum": "$items_processed"},
            "total_minutes": {"$sum": "$duration_minutes"},
            "sessions": {"$sum": 1}
        }},
        {"$project": {
            "user_id": "$_id.user_id",
            "user_name": "$_id.user_name",
            "total_items": 1,
            "total_hours": {"$round": [{"$divide": ["$total_minutes", 60]}, 1]},
            "sessions": 1,
            "items_per_hour": {
                "$round": [
                    {"$multiply": [{"$divide": ["$total_items", "$total_minutes"]}, 60]},
                    1
                ]
            }
        }}
    ]
    
    user_stats = await db.time_logs.aggregate(pipeline).to_list(100)
    return user_stats

@api_router.get("/stats/stages")
async def get_stage_stats(user: User = Depends(get_current_user)):
    """Get statistics by production stage"""
    pipeline = [
        {"$match": {"duration_minutes": {"$gt": 0}}},
        {"$group": {
            "_id": {"stage_id": "$stage_id", "stage_name": "$stage_name"},
            "total_items": {"$sum": "$items_processed"},
            "total_minutes": {"$sum": "$duration_minutes"},
            "avg_time_per_item": {"$avg": {"$divide": ["$duration_minutes", "$items_processed"]}}
        }},
        {"$project": {
            "stage_id": "$_id.stage_id",
            "stage_name": "$_id.stage_name",
            "total_items": 1,
            "total_hours": {"$round": [{"$divide": ["$total_minutes", 60]}, 1]},
            "avg_minutes_per_item": {"$round": ["$avg_time_per_item", 1]}
        }}
    ]
    
    stage_stats = await db.time_logs.aggregate(pipeline).to_list(100)
    return stage_stats

# ============== Inventory Routes ==============

@api_router.get("/inventory")
async def get_inventory(user: User = Depends(get_current_user)):
    """Get all inventory items"""
    items = await db.inventory.find({}, {"_id": 0}).sort("name", 1).to_list(10000)
    return items

@api_router.post("/inventory")
async def create_inventory_item(item_data: InventoryCreate, user: User = Depends(get_current_user)):
    """Create a new inventory item"""
    # Check for duplicate SKU
    existing = await db.inventory.find_one({"sku": item_data.sku}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="SKU already exists")
    
    item = InventoryItem(**item_data.model_dump())
    doc = item.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    doc["updated_at"] = doc["updated_at"].isoformat()
    
    await db.inventory.insert_one(doc)
    return {"message": "Item created", "item_id": item.item_id}

@api_router.get("/inventory/{item_id}")
async def get_inventory_item(item_id: str, user: User = Depends(get_current_user)):
    """Get a single inventory item"""
    item = await db.inventory.find_one({"item_id": item_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return item

@api_router.put("/inventory/{item_id}")
async def update_inventory_item(item_id: str, item_data: InventoryCreate, user: User = Depends(get_current_user)):
    """Update an inventory item"""
    existing = await db.inventory.find_one({"item_id": item_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Item not found")
    
    # Check for duplicate SKU (excluding current item)
    sku_check = await db.inventory.find_one({"sku": item_data.sku, "item_id": {"$ne": item_id}}, {"_id": 0})
    if sku_check:
        raise HTTPException(status_code=400, detail="SKU already exists")
    
    update_data = item_data.model_dump()
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.inventory.update_one(
        {"item_id": item_id},
        {"$set": update_data}
    )
    return {"message": "Item updated"}

@api_router.delete("/inventory/{item_id}")
async def delete_inventory_item(item_id: str, user: User = Depends(get_current_user)):
    """Delete an inventory item"""
    result = await db.inventory.delete_one({"item_id": item_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"message": "Item deleted"}

@api_router.put("/inventory/{item_id}/adjust")
async def adjust_inventory_quantity(
    item_id: str, 
    adjustment: int,
    user: User = Depends(get_current_user)
):
    """Adjust inventory quantity (positive to add, negative to subtract)"""
    item = await db.inventory.find_one({"item_id": item_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    new_quantity = max(0, item.get("quantity", 0) + adjustment)
    
    await db.inventory.update_one(
        {"item_id": item_id},
        {"$set": {
            "quantity": new_quantity,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    return {"message": "Quantity adjusted", "new_quantity": new_quantity}

# ============== Production Item Updates ==============

@api_router.put("/items/{item_id}/reject")
async def update_item_rejected(
    item_id: str,
    qty_rejected: int,
    user: User = Depends(get_current_user)
):
    """Update the rejected quantity for an item"""
    item = await db.production_items.find_one({"item_id": item_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    qty_rejected = max(0, qty_rejected)
    
    await db.production_items.update_one(
        {"item_id": item_id},
        {"$set": {"qty_rejected": qty_rejected}}
    )
    
    return {"message": "Rejected quantity updated", "qty_rejected": qty_rejected}

@api_router.post("/items/{item_id}/add-to-inventory")
def get_sku_match_key(sku: str) -> str:
    """Extract last two groups from SKU for matching.
    E.g., 'FRAME-BLK-SM' -> 'BLK-SM', 'PROD-001-B-L' -> 'B-L'"""
    parts = sku.split("-")
    if len(parts) >= 2:
        return f"{parts[-2]}-{parts[-1]}"
    return sku

async def add_item_to_inventory(item_id: str, user: User = Depends(get_current_user)):
    """Add completed item to frame inventory (from Quality Check stage).
    - Good frames go to main inventory
    - Rejected frames go to separate rejected inventory
    - Items are matched/combined by last two SKU groups (e.g., 'BLK-SM')"""
    item = await db.production_items.find_one({"item_id": item_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    if item.get("added_to_inventory"):
        raise HTTPException(status_code=400, detail="Item already added to inventory")
    
    qty_completed = item.get("qty_completed", 0)
    qty_rejected = item.get("qty_rejected", 0)
    qty_good = max(0, qty_completed - qty_rejected)
    
    if qty_completed <= 0:
        raise HTTPException(status_code=400, detail="No frames completed")
    
    sku = item.get("sku", "")
    match_key = get_sku_match_key(sku)
    now = datetime.now(timezone.utc).isoformat()
    messages = []
    
    # Add GOOD frames to main inventory (match by last two SKU groups)
    if qty_good > 0:
        existing_good = await db.inventory.find_one({
            "sku_match_key": match_key,
            "is_rejected": {"$ne": True}
        }, {"_id": 0})
        
        if existing_good:
            await db.inventory.update_one(
                {"item_id": existing_good["item_id"]},
                {"$inc": {"quantity": qty_good},
                 "$set": {"updated_at": now}}
            )
        else:
            inv_item = {
                "item_id": f"inv_{uuid.uuid4().hex[:8]}",
                "sku": sku,
                "sku_match_key": match_key,
                "name": item["name"],
                "color": item.get("color", ""),
                "size": item.get("size", ""),
                "quantity": qty_good,
                "min_stock": 10,
                "location": "",
                "is_rejected": False,
                "created_at": now,
                "updated_at": now
            }
            await db.inventory.insert_one(inv_item)
        messages.append(f"{qty_good} good")
    
    # Add REJECTED frames to separate rejected inventory
    if qty_rejected > 0:
        existing_rejected = await db.inventory.find_one({
            "sku_match_key": match_key,
            "is_rejected": True
        }, {"_id": 0})
        
        if existing_rejected:
            await db.inventory.update_one(
                {"item_id": existing_rejected["item_id"]},
                {"$inc": {"quantity": qty_rejected},
                 "$set": {"updated_at": now}}
            )
        else:
            rej_item = {
                "item_id": f"inv_{uuid.uuid4().hex[:8]}",
                "sku": f"{sku}-REJECTED",
                "sku_match_key": match_key,
                "name": f"{item['name']} (REJECTED)",
                "color": item.get("color", ""),
                "size": item.get("size", ""),
                "quantity": qty_rejected,
                "min_stock": 0,
                "location": "Rejected Bin",
                "is_rejected": True,
                "created_at": now,
                "updated_at": now
            }
            await db.inventory.insert_one(rej_item)
        messages.append(f"{qty_rejected} rejected")
    
    # Remove item from production (Quality Check stage) after adding to inventory
    await db.production_items.delete_one({"item_id": item_id})
    
    return {
        "message": f"Added to inventory: {', '.join(messages)}",
        "sku": sku,
        "match_key": match_key,
        "good_added": qty_good,
        "rejected_added": qty_rejected,
        "item_removed": True
    }

@api_router.get("/batches/{batch_id}/stats")
async def get_batch_stats(batch_id: str, user: User = Depends(get_current_user)):
    """Get comprehensive batch statistics including combined hours, costs, and rejection rate"""
    batch = await db.production_batches.find_one({"batch_id": batch_id}, {"_id": 0})
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    # Get all items in batch
    items = await db.production_items.find({"batch_id": batch_id}, {"_id": 0}).to_list(10000)
    
    # Get all time logs for this batch's stages
    time_logs = await db.time_logs.find({
        "completed_at": {"$ne": None}
    }, {"_id": 0}).to_list(10000)
    
    # Calculate totals
    total_required = sum(item.get("qty_required", 0) for item in items)
    total_completed = sum(item.get("qty_completed", 0) for item in items)
    total_rejected = sum(item.get("qty_rejected", 0) for item in items)
    total_good = total_completed - total_rejected
    
    # Calculate combined hours from all users
    total_minutes = sum(log.get("duration_minutes", 0) for log in time_logs)
    total_hours = total_minutes / 60
    
    # Calculate rejection rate
    rejection_rate = (total_rejected / total_completed * 100) if total_completed > 0 else 0
    
    # Calculate avg cost per frame ($22/hour labor rate)
    hourly_rate = 22.0
    total_labor_cost = total_hours * hourly_rate
    avg_cost_per_frame = total_labor_cost / total_good if total_good > 0 else 0
    
    # Get hours breakdown by user
    user_hours = {}
    for log in time_logs:
        user_name = log.get("user_name", "Unknown")
        if user_name not in user_hours:
            user_hours[user_name] = {"minutes": 0, "items_processed": 0}
        user_hours[user_name]["minutes"] += log.get("duration_minutes", 0)
        user_hours[user_name]["items_processed"] += log.get("items_processed", 0)
    
    user_breakdown = [
        {
            "user_name": name,
            "hours": round(data["minutes"] / 60, 2),
            "items_processed": data["items_processed"]
        }
        for name, data in user_hours.items()
    ]
    
    return {
        "batch_id": batch_id,
        "batch_name": batch.get("name", ""),
        "totals": {
            "required": total_required,
            "completed": total_completed,
            "rejected": total_rejected,
            "good_frames": total_good
        },
        "time": {
            "total_hours": round(total_hours, 2),
            "total_minutes": round(total_minutes, 1)
        },
        "costs": {
            "hourly_rate": hourly_rate,
            "total_labor_cost": round(total_labor_cost, 2),
            "avg_cost_per_frame": round(avg_cost_per_frame, 2)
        },
        "quality": {
            "rejection_rate": round(rejection_rate, 1),
            "rejected_count": total_rejected
        },
        "user_breakdown": user_breakdown
    }

# ============== Demo Data Route ==============

@api_router.post("/demo/seed")
async def seed_demo_data(user: User = Depends(get_current_user)):
    """Seed demo data for testing"""
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Add demo stores
    demo_stores = [
        {"store_id": "store_demo_1", "name": "My Shopify Store", "platform": "shopify", "is_active": True, "created_at": datetime.now(timezone.utc).isoformat()},
        {"store_id": "store_demo_2", "name": "Second Shopify", "platform": "shopify", "is_active": True, "created_at": datetime.now(timezone.utc).isoformat()},
        {"store_id": "store_demo_3", "name": "Etsy Shop", "platform": "etsy", "is_active": True, "created_at": datetime.now(timezone.utc).isoformat()},
    ]
    
    for store in demo_stores:
        await db.stores.update_one(
            {"store_id": store["store_id"]},
            {"$set": store},
            upsert=True
        )
    
    # Get stages
    stages = await db.production_stages.find({}, {"_id": 0}).sort("order", 1).to_list(100)
    if not stages:
        # Initialize stages first
        await get_stages(user)
        stages = await db.production_stages.find({}, {"_id": 0}).sort("order", 1).to_list(100)
    
    # Add demo orders
    import random
    products = [
        {"name": "Custom T-Shirt", "sku": "TSH-001", "qty": 1},
        {"name": "Embroidered Hoodie", "sku": "HOD-002", "qty": 1},
        {"name": "Personalized Mug", "sku": "MUG-003", "qty": 2},
        {"name": "Canvas Print", "sku": "CNV-004", "qty": 1},
        {"name": "Custom Phone Case", "sku": "PHN-005", "qty": 1},
    ]
    
    customers = ["John Smith", "Jane Doe", "Bob Wilson", "Alice Brown", "Charlie Davis"]
    
    for i in range(15):
        store = random.choice(demo_stores)
        stage = random.choice(stages)
        customer = random.choice(customers)
        order_items = random.sample(products, random.randint(1, 3))
        
        order = {
            "order_id": f"ord_demo_{i+1:03d}",
            "external_id": f"EXT-{random.randint(10000, 99999)}",
            "store_id": store["store_id"],
            "store_name": store["name"],
            "platform": store["platform"],
            "customer_name": customer,
            "customer_email": f"{customer.lower().replace(' ', '.')}@example.com",
            "items": order_items,
            "total_price": round(random.uniform(25, 150), 2),
            "currency": "USD",
            "status": "pending" if stage["order"] == 0 else ("completed" if stage["order"] >= 4 else "in_production"),
            "current_stage_id": stage["stage_id"],
            "created_at": (datetime.now(timezone.utc) - timedelta(days=random.randint(0, 7))).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.orders.update_one(
            {"order_id": order["order_id"]},
            {"$set": order},
            upsert=True
        )
    
    return {"message": "Demo data seeded", "stores": 3, "orders": 15}

# ============== Store Sync Services ==============

class StoreUpdate(BaseModel):
    name: Optional[str] = None
    api_key: Optional[str] = None
    api_secret: Optional[str] = None
    shop_url: Optional[str] = None
    access_token: Optional[str] = None
    is_active: Optional[bool] = None

@api_router.put("/stores/{store_id}")
async def update_store(store_id: str, store_data: StoreUpdate, user: User = Depends(get_current_user)):
    """Update store credentials"""
    if user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    update_dict = {k: v for k, v in store_data.model_dump().items() if v is not None}
    if not update_dict:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    result = await db.stores.update_one(
        {"store_id": store_id},
        {"$set": update_dict}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Store not found")
    
    return {"message": "Store updated"}

@api_router.get("/stores/{store_id}/full")
async def get_store_full(store_id: str, user: User = Depends(get_current_user)):
    """Get store with credentials (admin only)"""
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    
    store = await db.stores.find_one({"store_id": store_id}, {"_id": 0})
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    
    # Mask sensitive data
    if store.get("access_token"):
        store["access_token"] = store["access_token"][:8] + "..." if len(store["access_token"]) > 8 else "***"
    if store.get("api_secret"):
        store["api_secret"] = store["api_secret"][:8] + "..." if len(store["api_secret"]) > 8 else "***"
    
    return store

async def sync_shopify_orders(store: dict) -> dict:
    """Sync orders from a Shopify store"""
    shop_url = store.get("shop_url", "").replace("https://", "").replace("http://", "").rstrip("/")
    access_token = store.get("access_token")
    
    if not shop_url or not access_token:
        return {"success": False, "error": "Missing shop_url or access_token", "synced": 0}
    
    headers = {
        "X-Shopify-Access-Token": access_token,
        "Content-Type": "application/json"
    }
    
    api_url = f"https://{shop_url}/admin/api/2024-01/orders.json?status=any&limit=50"
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(api_url, headers=headers)
            
            if response.status_code == 401:
                return {"success": False, "error": "Invalid access token", "synced": 0}
            elif response.status_code == 404:
                return {"success": False, "error": "Store not found - check shop URL", "synced": 0}
            
            response.raise_for_status()
            data = response.json()
            
        orders = data.get("orders", [])
        synced_count = 0
        
        # Get first stage
        stages = await db.production_stages.find({}, {"_id": 0}).sort("order", 1).to_list(1)
        first_stage_id = stages[0]["stage_id"] if stages else "stage_new"
        
        for shopify_order in orders:
            # Transform Shopify order to our format
            items = []
            for line_item in shopify_order.get("line_items", []):
                items.append({
                    "name": line_item.get("name", "Unknown"),
                    "sku": line_item.get("sku", "N/A"),
                    "qty": line_item.get("quantity", 1),
                    "price": float(line_item.get("price", 0))
                })
            
            customer = shopify_order.get("customer", {})
            shipping = shopify_order.get("shipping_address", {})
            
            order_doc = {
                "order_id": f"shp_{store['store_id']}_{shopify_order['id']}",
                "external_id": str(shopify_order.get("order_number", shopify_order["id"])),
                "store_id": store["store_id"],
                "store_name": store["name"],
                "platform": "shopify",
                "customer_name": f"{customer.get('first_name', '')} {customer.get('last_name', '')}".strip() or shipping.get("name", "Unknown"),
                "customer_email": customer.get("email") or shopify_order.get("email", ""),
                "items": items,
                "total_price": float(shopify_order.get("total_price", 0)),
                "currency": shopify_order.get("currency", "USD"),
                "status": "pending",
                "current_stage_id": first_stage_id,
                "shipping_address": {
                    "name": shipping.get("name", ""),
                    "address1": shipping.get("address1", ""),
                    "address2": shipping.get("address2", ""),
                    "city": shipping.get("city", ""),
                    "province": shipping.get("province", ""),
                    "zip": shipping.get("zip", ""),
                    "country": shipping.get("country", "")
                },
                "shopify_data": {
                    "id": shopify_order["id"],
                    "fulfillment_status": shopify_order.get("fulfillment_status"),
                    "financial_status": shopify_order.get("financial_status"),
                    "created_at": shopify_order.get("created_at")
                },
                "created_at": shopify_order.get("created_at", datetime.now(timezone.utc).isoformat()),
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "synced_at": datetime.now(timezone.utc).isoformat()
            }
            
            # Upsert order
            await db.orders.update_one(
                {"order_id": order_doc["order_id"]},
                {"$set": order_doc},
                upsert=True
            )
            synced_count += 1
        
        # Update last sync time
        await db.stores.update_one(
            {"store_id": store["store_id"]},
            {"$set": {"last_sync": datetime.now(timezone.utc).isoformat()}}
        )
        
        return {"success": True, "synced": synced_count, "error": None}
        
    except httpx.HTTPStatusError as e:
        return {"success": False, "error": f"HTTP Error: {e.response.status_code}", "synced": 0}
    except Exception as e:
        logger.error(f"Shopify sync error: {e}")
        return {"success": False, "error": str(e), "synced": 0}

async def sync_etsy_orders(store: dict) -> dict:
    """Sync orders from an Etsy store"""
    api_key = store.get("api_key")
    access_token = store.get("access_token")
    shop_id = store.get("shop_url")  # Using shop_url field for shop_id
    
    if not api_key or not shop_id:
        return {"success": False, "error": "Missing api_key or shop_id", "synced": 0}
    
    headers = {
        "x-api-key": api_key,
        "Authorization": f"Bearer {access_token}" if access_token else ""
    }
    
    # Note: Etsy API v3 requires OAuth for full access
    # This is a simplified version - full implementation would need OAuth flow
    api_url = f"https://openapi.etsy.com/v3/application/shops/{shop_id}/receipts"
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(api_url, headers=headers)
            
            if response.status_code == 401:
                return {"success": False, "error": "Invalid API key or OAuth token required", "synced": 0}
            elif response.status_code == 403:
                return {"success": False, "error": "OAuth authentication required for this endpoint", "synced": 0}
            
            response.raise_for_status()
            data = response.json()
        
        receipts = data.get("results", [])
        synced_count = 0
        
        # Get first stage
        stages = await db.production_stages.find({}, {"_id": 0}).sort("order", 1).to_list(1)
        first_stage_id = stages[0]["stage_id"] if stages else "stage_new"
        
        for receipt in receipts:
            items = []
            for transaction in receipt.get("transactions", []):
                items.append({
                    "name": transaction.get("title", "Unknown"),
                    "sku": transaction.get("sku", "N/A"),
                    "qty": transaction.get("quantity", 1),
                    "price": float(transaction.get("price", {}).get("amount", 0)) / 100
                })
            
            order_doc = {
                "order_id": f"etsy_{store['store_id']}_{receipt['receipt_id']}",
                "external_id": str(receipt.get("receipt_id")),
                "store_id": store["store_id"],
                "store_name": store["name"],
                "platform": "etsy",
                "customer_name": receipt.get("name", "Unknown"),
                "customer_email": receipt.get("buyer_email", ""),
                "items": items,
                "total_price": float(receipt.get("grandtotal", {}).get("amount", 0)) / 100,
                "currency": receipt.get("grandtotal", {}).get("currency_code", "USD"),
                "status": "pending",
                "current_stage_id": first_stage_id,
                "etsy_data": {
                    "receipt_id": receipt["receipt_id"],
                    "was_paid": receipt.get("was_paid"),
                    "was_shipped": receipt.get("was_shipped")
                },
                "created_at": datetime.fromtimestamp(receipt.get("create_timestamp", 0), tz=timezone.utc).isoformat() if receipt.get("create_timestamp") else datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "synced_at": datetime.now(timezone.utc).isoformat()
            }
            
            await db.orders.update_one(
                {"order_id": order_doc["order_id"]},
                {"$set": order_doc},
                upsert=True
            )
            synced_count += 1
        
        await db.stores.update_one(
            {"store_id": store["store_id"]},
            {"$set": {"last_sync": datetime.now(timezone.utc).isoformat()}}
        )
        
        return {"success": True, "synced": synced_count, "error": None}
        
    except httpx.HTTPStatusError as e:
        return {"success": False, "error": f"HTTP Error: {e.response.status_code}", "synced": 0}
    except Exception as e:
        logger.error(f"Etsy sync error: {e}")
        return {"success": False, "error": str(e), "synced": 0}

@api_router.post("/stores/{store_id}/sync")
async def sync_store_orders(store_id: str, user: User = Depends(get_current_user)):
    """Manually sync orders from a store"""
    if user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    store = await db.stores.find_one({"store_id": store_id}, {"_id": 0})
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    
    if store["platform"] == "shopify":
        result = await sync_shopify_orders(store)
    elif store["platform"] == "etsy":
        result = await sync_etsy_orders(store)
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported platform: {store['platform']}")
    
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    
    return {"message": f"Synced {result['synced']} orders from {store['name']}", "synced": result["synced"]}

@api_router.post("/stores/sync-all")
async def sync_all_stores(user: User = Depends(get_current_user)):
    """Sync orders from all active stores"""
    if user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    stores = await db.stores.find({"is_active": True}, {"_id": 0}).to_list(100)
    
    results = []
    total_synced = 0
    
    for store in stores:
        if store["platform"] == "shopify":
            result = await sync_shopify_orders(store)
        elif store["platform"] == "etsy":
            result = await sync_etsy_orders(store)
        else:
            result = {"success": False, "error": "Unsupported platform", "synced": 0}
        
        results.append({
            "store_id": store["store_id"],
            "store_name": store["name"],
            "platform": store["platform"],
            **result
        })
        total_synced += result.get("synced", 0)
    
    return {"message": f"Sync completed. Total orders synced: {total_synced}", "total_synced": total_synced, "results": results}

# ============== Webhooks ==============

@api_router.post("/webhooks/shopify/{store_id}")
async def shopify_webhook(store_id: str, request: Request):
    """Handle Shopify webhook events"""
    try:
        body = await request.json()
        topic = request.headers.get("X-Shopify-Topic", "unknown")
        
        logger.info(f"Shopify webhook received: {topic} for store {store_id}")
        
        store = await db.stores.find_one({"store_id": store_id}, {"_id": 0})
        if not store:
            logger.error(f"Store not found: {store_id}")
            return {"status": "ignored", "reason": "Store not found"}
        
        # Handle order creation/update
        if topic in ["orders/create", "orders/updated"]:
            shopify_order = body
            
            # Get first stage
            stages = await db.production_stages.find({}, {"_id": 0}).sort("order", 1).to_list(1)
            first_stage_id = stages[0]["stage_id"] if stages else "stage_new"
            
            items = []
            for line_item in shopify_order.get("line_items", []):
                items.append({
                    "name": line_item.get("name", "Unknown"),
                    "sku": line_item.get("sku", "N/A"),
                    "qty": line_item.get("quantity", 1),
                    "price": float(line_item.get("price", 0))
                })
            
            customer = shopify_order.get("customer", {})
            shipping = shopify_order.get("shipping_address", {})
            
            order_doc = {
                "order_id": f"shp_{store_id}_{shopify_order['id']}",
                "external_id": str(shopify_order.get("order_number", shopify_order["id"])),
                "store_id": store_id,
                "store_name": store["name"],
                "platform": "shopify",
                "customer_name": f"{customer.get('first_name', '')} {customer.get('last_name', '')}".strip() or shipping.get("name", "Unknown"),
                "customer_email": customer.get("email") or shopify_order.get("email", ""),
                "items": items,
                "total_price": float(shopify_order.get("total_price", 0)),
                "currency": shopify_order.get("currency", "USD"),
                "status": "pending",
                "current_stage_id": first_stage_id,
                "shopify_data": {
                    "id": shopify_order["id"],
                    "fulfillment_status": shopify_order.get("fulfillment_status"),
                    "financial_status": shopify_order.get("financial_status")
                },
                "created_at": shopify_order.get("created_at", datetime.now(timezone.utc).isoformat()),
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "synced_at": datetime.now(timezone.utc).isoformat()
            }
            
            # Check if order exists - don't overwrite stage if it does
            existing = await db.orders.find_one({"order_id": order_doc["order_id"]})
            if existing:
                # Keep existing stage and status
                order_doc["current_stage_id"] = existing.get("current_stage_id", first_stage_id)
                order_doc["status"] = existing.get("status", "pending")
            
            await db.orders.update_one(
                {"order_id": order_doc["order_id"]},
                {"$set": order_doc},
                upsert=True
            )
            
            return {"status": "processed", "order_id": order_doc["order_id"]}
        
        return {"status": "ignored", "reason": f"Unhandled topic: {topic}"}
        
    except Exception as e:
        logger.error(f"Webhook error: {e}")
        return {"status": "error", "error": str(e)}

@api_router.post("/webhooks/etsy/{store_id}")
async def etsy_webhook(store_id: str, request: Request):
    """Handle Etsy webhook events (ping endpoint)"""
    try:
        body = await request.json()
        logger.info(f"Etsy webhook received for store {store_id}")
        
        # Etsy webhooks are more complex and require verification
        # This is a placeholder for the ping verification
        
        return {"status": "received"}
        
    except Exception as e:
        logger.error(f"Etsy webhook error: {e}")
        return {"status": "error", "error": str(e)}

@api_router.get("/webhooks/info/{store_id}")
async def get_webhook_info(store_id: str, request: Request, user: User = Depends(get_current_user)):
    """Get webhook URL info for a store"""
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    
    store = await db.stores.find_one({"store_id": store_id}, {"_id": 0})
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    
    # Get base URL from request
    base_url = str(request.base_url).rstrip("/")
    
    webhook_url = f"{base_url}/api/webhooks/{store['platform']}/{store_id}"
    
    instructions = {}
    if store["platform"] == "shopify":
        instructions = {
            "webhook_url": webhook_url,
            "events_to_subscribe": ["orders/create", "orders/updated"],
            "setup_instructions": [
                "1. Go to your Shopify Admin → Settings → Notifications → Webhooks",
                "2. Click 'Create webhook'",
                "3. Select 'Order creation' event",
                "4. Paste the webhook URL below",
                "5. Select 'JSON' format",
                "6. Click 'Save'",
                "7. Repeat for 'Order update' event"
            ]
        }
    elif store["platform"] == "etsy":
        instructions = {
            "webhook_url": webhook_url,
            "note": "Etsy webhooks require OAuth app approval and are only available for approved apps",
            "setup_instructions": [
                "1. Etsy webhooks are currently in limited availability",
                "2. You need to apply for webhook access through Etsy's developer portal",
                "3. For now, use the 'Sync Orders' button to manually sync"
            ]
        }
    
    return {"store_id": store_id, "platform": store["platform"], **instructions}

# ============== Export Routes ==============

import csv
import io
from fastapi.responses import StreamingResponse

@api_router.get("/export/orders")
async def export_orders_csv(
    store_id: Optional[str] = None,
    status: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Export orders to CSV"""
    query = {}
    if store_id:
        query["store_id"] = store_id
    if status:
        query["status"] = status
    
    orders = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(10000)
    
    # Create CSV in memory
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Write header
    writer.writerow([
        "Order ID", "External ID", "Store", "Platform", "Customer Name", 
        "Customer Email", "Items Count", "Total Price", "Currency", 
        "Status", "Stage", "Created At"
    ])
    
    # Write data
    for order in orders:
        writer.writerow([
            order.get("order_id", ""),
            order.get("external_id", ""),
            order.get("store_name", ""),
            order.get("platform", ""),
            order.get("customer_name", ""),
            order.get("customer_email", ""),
            len(order.get("items", [])),
            order.get("total_price", 0),
            order.get("currency", "USD"),
            order.get("status", ""),
            order.get("current_stage_id", ""),
            order.get("created_at", "")
        ])
    
    output.seek(0)
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=orders_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"}
    )

@api_router.get("/export/time-logs")
async def export_time_logs_csv(
    user_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Export time logs to CSV"""
    query = {}
    if user_id:
        query["user_id"] = user_id
    
    logs = await db.time_logs.find(query, {"_id": 0}).sort("created_at", -1).to_list(10000)
    
    output = io.StringIO()
    writer = csv.writer(output)
    
    writer.writerow([
        "Log ID", "User", "Order ID", "Stage", "Action", 
        "Started At", "Completed At", "Duration (min)", "Items Processed"
    ])
    
    for log in logs:
        writer.writerow([
            log.get("log_id", ""),
            log.get("user_name", ""),
            log.get("order_id", ""),
            log.get("stage_name", ""),
            log.get("action", ""),
            log.get("started_at", ""),
            log.get("completed_at", ""),
            log.get("duration_minutes", ""),
            log.get("items_processed", 0)
        ])
    
    output.seek(0)
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=time_logs_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"}
    )

@api_router.get("/export/user-stats")
async def export_user_stats_csv(user: User = Depends(get_current_user)):
    """Export user performance stats to CSV"""
    pipeline = [
        {"$match": {"duration_minutes": {"$gt": 0}}},
        {"$group": {
            "_id": {"user_id": "$user_id", "user_name": "$user_name"},
            "total_items": {"$sum": "$items_processed"},
            "total_minutes": {"$sum": "$duration_minutes"},
            "sessions": {"$sum": 1}
        }},
        {"$project": {
            "user_id": "$_id.user_id",
            "user_name": "$_id.user_name",
            "total_items": 1,
            "total_hours": {"$round": [{"$divide": ["$total_minutes", 60]}, 2]},
            "sessions": 1,
            "items_per_hour": {
                "$round": [
                    {"$multiply": [{"$divide": ["$total_items", "$total_minutes"]}, 60]},
                    2
                ]
            }
        }}
    ]
    
    stats = await db.time_logs.aggregate(pipeline).to_list(100)
    
    output = io.StringIO()
    writer = csv.writer(output)
    
    writer.writerow([
        "User ID", "User Name", "Total Items", "Total Hours", 
        "Sessions", "Items Per Hour"
    ])
    
    for stat in stats:
        writer.writerow([
            stat.get("user_id", ""),
            stat.get("user_name", ""),
            stat.get("total_items", 0),
            stat.get("total_hours", 0),
            stat.get("sessions", 0),
            stat.get("items_per_hour", 0)
        ])
    
    output.seek(0)
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=user_stats_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"}
    )

@api_router.get("/export/report-pdf")
async def export_report_pdf(user: User = Depends(get_current_user)):
    """Generate a PDF report summary"""
    # Get stats
    total_orders = await db.orders.count_documents({})
    pending = await db.orders.count_documents({"status": "pending"})
    in_production = await db.orders.count_documents({"status": "in_production"})
    completed = await db.orders.count_documents({"status": "completed"})
    
    # Get store breakdown
    store_pipeline = [
        {"$group": {"_id": "$store_name", "count": {"$sum": 1}}}
    ]
    orders_by_store = await db.orders.aggregate(store_pipeline).to_list(100)
    
    # Get user stats
    user_pipeline = [
        {"$match": {"duration_minutes": {"$gt": 0}}},
        {"$group": {
            "_id": "$user_name",
            "total_items": {"$sum": "$items_processed"},
            "total_hours": {"$sum": {"$divide": ["$duration_minutes", 60]}}
        }}
    ]
    user_stats = await db.time_logs.aggregate(user_pipeline).to_list(100)
    
    # Generate simple HTML report (browsers can print to PDF)
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>ShopFactory Report - {datetime.now().strftime('%Y-%m-%d')}</title>
        <style>
            body {{ font-family: Arial, sans-serif; margin: 40px; color: #333; }}
            h1 {{ color: #3B82F6; border-bottom: 2px solid #3B82F6; padding-bottom: 10px; }}
            h2 {{ color: #555; margin-top: 30px; }}
            .stats-grid {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin: 20px 0; }}
            .stat-card {{ background: #f5f5f5; padding: 20px; border-radius: 8px; text-align: center; }}
            .stat-value {{ font-size: 36px; font-weight: bold; color: #3B82F6; }}
            .stat-label {{ color: #666; margin-top: 5px; }}
            table {{ width: 100%; border-collapse: collapse; margin: 20px 0; }}
            th, td {{ border: 1px solid #ddd; padding: 12px; text-align: left; }}
            th {{ background: #f5f5f5; font-weight: bold; }}
            .footer {{ margin-top: 40px; text-align: center; color: #888; font-size: 12px; }}
        </style>
    </head>
    <body>
        <h1>ShopFactory Production Report</h1>
        <p>Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</p>
        
        <h2>Order Summary</h2>
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-value">{total_orders}</div>
                <div class="stat-label">Total Orders</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">{pending}</div>
                <div class="stat-label">Pending</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">{in_production}</div>
                <div class="stat-label">In Production</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">{completed}</div>
                <div class="stat-label">Completed</div>
            </div>
        </div>
        
        <h2>Orders by Store</h2>
        <table>
            <tr><th>Store</th><th>Orders</th></tr>
            {"".join(f"<tr><td>{s['_id'] or 'Unknown'}</td><td>{s['count']}</td></tr>" for s in orders_by_store)}
        </table>
        
        <h2>Team Performance</h2>
        <table>
            <tr><th>Team Member</th><th>Items Processed</th><th>Hours Worked</th></tr>
            {"".join(f"<tr><td>{s['_id'] or 'Unknown'}</td><td>{s['total_items']}</td><td>{round(s['total_hours'], 1)}</td></tr>" for s in user_stats) if user_stats else "<tr><td colspan='3'>No data available</td></tr>"}
        </table>
        
        <div class="footer">
            <p>ShopFactory Manufacturing & Fulfillment Hub</p>
            <p>Print this page to save as PDF (Ctrl+P / Cmd+P)</p>
        </div>
    </body>
    </html>
    """
    
    return Response(
        content=html_content,
        media_type="text/html",
        headers={"Content-Disposition": f"inline; filename=report_{datetime.now().strftime('%Y%m%d')}.html"}
    )

# ============== Root Route ==============

@api_router.get("/")
async def root():
    return {"message": "Manufacturing & Fulfillment API"}

# Include router and setup CORS
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
