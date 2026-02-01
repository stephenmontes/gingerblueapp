from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional
from datetime import datetime, timezone
import uuid

from database import db
from models.user import User
from models.order import Order, OrderCreate
from models.production import StageMove
from models.time_log import TimeLog
from dependencies import get_current_user
from services.shopify_service import sync_orders_from_store
from services.etsy_service import sync_orders_from_etsy_store

router = APIRouter(prefix="/orders", tags=["orders"])

@router.get("")
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

@router.post("")
async def create_order(order_data: OrderCreate, user: User = Depends(get_current_user)):
    """Create a new order"""
    order = Order(**order_data.model_dump())
    
    stages = await db.production_stages.find({}, {"_id": 0}).sort("order", 1).to_list(1)
    if stages:
        order.current_stage_id = stages[0]["stage_id"]
    
    doc = order.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    doc["updated_at"] = doc["updated_at"].isoformat()
    
    await db.orders.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

@router.get("/{order_id}")
async def get_order(order_id: str, user: User = Depends(get_current_user)):
    """Get single order"""
    order = await db.orders.find_one({"order_id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order

@router.put("/{order_id}/stage")
async def move_order_stage(order_id: str, move_data: StageMove, user: User = Depends(get_current_user)):
    """Move order to a new stage"""
    order = await db.orders.find_one({"order_id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    old_stage_id = order.get("current_stage_id")
    new_stage_id = move_data.new_stage_id
    
    new_stage = await db.production_stages.find_one({"stage_id": new_stage_id}, {"_id": 0})
    if not new_stage:
        raise HTTPException(status_code=404, detail="Stage not found")
    
    if old_stage_id:
        now = datetime.now(timezone.utc)
        open_logs = await db.time_logs.find({"order_id": order_id, "completed_at": None}).to_list(100)
        
        for log in open_logs:
            started_at = log.get("started_at")
            if isinstance(started_at, str):
                started_at = datetime.fromisoformat(started_at)
            if started_at.tzinfo is None:
                started_at = started_at.replace(tzinfo=timezone.utc)
            
            duration = (now - started_at).total_seconds() / 60
            await db.time_logs.update_one(
                {"log_id": log["log_id"]},
                {"$set": {"completed_at": now.isoformat(), "duration_minutes": round(duration, 2)}}
            )
    
    time_log = TimeLog(
        user_id=user.user_id,
        user_name=user.name,
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
    
    stages = await db.production_stages.find({}, {"_id": 0}).sort("order", 1).to_list(100)
    stage_orders = {s["stage_id"]: s["order"] for s in stages}
    new_stage_order = stage_orders.get(new_stage_id, 0)
    
    if new_stage_order == 0:
        status = "pending"
    elif new_stage_order == len(stages) - 1:
        status = "completed"
    else:
        status = "in_production"
    
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

@router.put("/{order_id}/assign")
async def assign_order(order_id: str, assignee_id: str, user: User = Depends(get_current_user)):
    """Assign order to a user"""
    result = await db.orders.update_one(
        {"order_id": order_id},
        {"$set": {"assigned_to": assignee_id, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Order not found")
    
    return {"message": "Order assigned"}


@router.post("/sync/{store_id}")
async def sync_store_orders(
    store_id: str,
    status: str = Query("any", description="Order status filter: any, open, closed"),
    days_back: int = Query(30, ge=1, le=365, description="Number of days to sync"),
    user: User = Depends(get_current_user)
):
    """Sync orders from a Shopify or Etsy store"""
    if user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Verify store exists
    store = await db.stores.find_one({"store_id": store_id})
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    
    platform = store.get("platform")
    
    # Run sync based on platform
    if platform == "shopify":
        result = await sync_orders_from_store(store_id, status=status, days_back=days_back)
    elif platform == "etsy":
        result = await sync_orders_from_etsy_store(store_id, days_back=days_back)
    else:
        raise HTTPException(status_code=400, detail=f"Platform '{platform}' does not support order sync")
    
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Sync failed"))
    
    return result


@router.get("/sync/status")
async def get_sync_status(user: User = Depends(get_current_user)):
    """Get order sync status for all stores"""
    stores = await db.stores.find(
        {"platform": {"$in": ["shopify", "etsy"]}}, 
        {"_id": 0}
    ).to_list(100)
    
    result = []
    for store in stores:
        order_count = await db.fulfillment_orders.count_documents({"store_id": store["store_id"]})
        result.append({
            "store_id": store["store_id"],
            "store_name": store.get("name", ""),
            "platform": store.get("platform"),
            "last_order_sync": store.get("last_order_sync"),
            "order_count": order_count,
            "is_active": store.get("is_active", True)
        })
    
    return result
