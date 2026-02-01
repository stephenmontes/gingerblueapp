from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from datetime import datetime, timezone
import uuid

from database import db
from models.user import User
from models.order import Order, OrderCreate
from models.production import StageMove
from models.time_log import TimeLog
from dependencies import get_current_user

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
