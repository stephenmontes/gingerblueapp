from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends
from fastapi.responses import JSONResponse
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

class TimeLog(BaseModel):
    model_config = ConfigDict(extra="ignore")
    log_id: str = Field(default_factory=lambda: f"log_{uuid.uuid4().hex[:12]}")
    user_id: str
    user_name: str
    order_id: str
    stage_id: str
    stage_name: str
    action: str  # started, completed, moved
    started_at: datetime
    completed_at: Optional[datetime] = None
    duration_minutes: Optional[float] = None
    items_processed: int = 1
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class TimeLogCreate(BaseModel):
    order_id: str
    stage_id: str
    stage_name: str
    action: str
    items_processed: int = 1

class StageMove(BaseModel):
    order_id: str
    new_stage_id: str
    items_processed: int = 1

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
            {"stage_id": "stage_qc", "name": "Quality Check", "order": 3, "color": "#8B5CF6"},
            {"stage_id": "stage_packing", "name": "Packing", "order": 4, "color": "#22C55E"},
            {"stage_id": "stage_ready", "name": "Ready to Ship", "order": 5, "color": "#10B981"},
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

# ============== Orders Routes ==============

@api_router.get("/orders")
async def get_orders(
    store_id: Optional[str] = None,
    status: Optional[str] = None,
    stage_id: Optional[str] = None,
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
