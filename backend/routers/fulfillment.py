from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from datetime import datetime, timezone
import uuid

from database import db
from models.user import User
from dependencies import get_current_user

router = APIRouter(prefix="/fulfillment", tags=["fulfillment"])

# Default fulfillment stages
DEFAULT_FULFILLMENT_STAGES = [
    {"stage_id": "fulfill_orders", "name": "Orders", "order": 0, "color": "#6366F1"},
    {"stage_id": "fulfill_print", "name": "Print List", "order": 1, "color": "#F59E0B"},
    {"stage_id": "fulfill_mount", "name": "Mount List", "order": 2, "color": "#3B82F6"},
    {"stage_id": "fulfill_finish", "name": "Finish", "order": 3, "color": "#8B5CF6"},
    {"stage_id": "fulfill_pack", "name": "Pack and Ship", "order": 4, "color": "#22C55E"},
]

@router.get("/stages")
async def get_fulfillment_stages(user: User = Depends(get_current_user)):
    """Get all fulfillment stages"""
    stages = await db.fulfillment_stages.find({}, {"_id": 0}).sort("order", 1).to_list(100)
    
    if not stages:
        # Initialize default stages
        for stage in DEFAULT_FULFILLMENT_STAGES:
            stage["created_at"] = datetime.now(timezone.utc).isoformat()
        await db.fulfillment_stages.insert_many(DEFAULT_FULFILLMENT_STAGES)
        stages = DEFAULT_FULFILLMENT_STAGES
    
    return stages

@router.get("/orders")
async def get_fulfillment_orders(
    status: Optional[str] = None,
    stage_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get orders for fulfillment with optional filtering"""
    query = {}
    if status:
        query["fulfillment_status"] = status
    if stage_id:
        query["fulfillment_stage_id"] = stage_id
    
    orders = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return orders

@router.post("/orders/{order_id}/assign-stage")
async def assign_order_to_stage(
    order_id: str,
    stage_id: str,
    user: User = Depends(get_current_user)
):
    """Assign an order to a fulfillment stage"""
    order = await db.orders.find_one({"order_id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    stage = await db.fulfillment_stages.find_one({"stage_id": stage_id})
    if not stage:
        raise HTTPException(status_code=404, detail="Stage not found")
    
    await db.orders.update_one(
        {"order_id": order_id},
        {"$set": {
            "fulfillment_stage_id": stage_id,
            "fulfillment_stage_name": stage["name"],
            "fulfillment_updated_at": datetime.now(timezone.utc).isoformat(),
            "fulfillment_updated_by": user.user_id
        }}
    )
    
    # Log the stage change
    await db.fulfillment_logs.insert_one({
        "log_id": f"flog_{uuid.uuid4().hex[:12]}",
        "order_id": order_id,
        "from_stage": order.get("fulfillment_stage_id"),
        "to_stage": stage_id,
        "to_stage_name": stage["name"],
        "user_id": user.user_id,
        "user_name": user.name,
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    return {"message": f"Order moved to {stage['name']}", "stage_id": stage_id}

@router.post("/orders/{order_id}/move-next")
async def move_order_to_next_stage(
    order_id: str,
    user: User = Depends(get_current_user)
):
    """Move an order to the next fulfillment stage"""
    order = await db.orders.find_one({"order_id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    current_stage_id = order.get("fulfillment_stage_id", "fulfill_orders")
    
    # Get all stages sorted by order
    stages = await db.fulfillment_stages.find({}, {"_id": 0}).sort("order", 1).to_list(100)
    if not stages:
        raise HTTPException(status_code=400, detail="No fulfillment stages configured")
    
    # Find current stage index and get next
    current_idx = 0
    for i, s in enumerate(stages):
        if s["stage_id"] == current_stage_id:
            current_idx = i
            break
    
    if current_idx >= len(stages) - 1:
        raise HTTPException(status_code=400, detail="Order is already at the final stage")
    
    next_stage = stages[current_idx + 1]
    
    await db.orders.update_one(
        {"order_id": order_id},
        {"$set": {
            "fulfillment_stage_id": next_stage["stage_id"],
            "fulfillment_stage_name": next_stage["name"],
            "fulfillment_updated_at": datetime.now(timezone.utc).isoformat(),
            "fulfillment_updated_by": user.user_id
        }}
    )
    
    # Log the change
    await db.fulfillment_logs.insert_one({
        "log_id": f"flog_{uuid.uuid4().hex[:12]}",
        "order_id": order_id,
        "from_stage": current_stage_id,
        "to_stage": next_stage["stage_id"],
        "to_stage_name": next_stage["name"],
        "user_id": user.user_id,
        "user_name": user.name,
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    return {"message": f"Order moved to {next_stage['name']}", "stage": next_stage}

@router.post("/orders/bulk-move")
async def bulk_move_orders(
    order_ids: list,
    target_stage_id: str,
    user: User = Depends(get_current_user)
):
    """Move multiple orders to a specific stage"""
    stage = await db.fulfillment_stages.find_one({"stage_id": target_stage_id})
    if not stage:
        raise HTTPException(status_code=404, detail="Stage not found")
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Update all orders
    result = await db.orders.update_many(
        {"order_id": {"$in": order_ids}},
        {"$set": {
            "fulfillment_stage_id": target_stage_id,
            "fulfillment_stage_name": stage["name"],
            "fulfillment_updated_at": now,
            "fulfillment_updated_by": user.user_id
        }}
    )
    
    # Log bulk move
    await db.fulfillment_logs.insert_one({
        "log_id": f"flog_{uuid.uuid4().hex[:12]}",
        "action": "bulk_move",
        "order_ids": order_ids,
        "to_stage": target_stage_id,
        "to_stage_name": stage["name"],
        "user_id": user.user_id,
        "user_name": user.name,
        "count": result.modified_count,
        "created_at": now
    })
    
    return {
        "message": f"Moved {result.modified_count} orders to {stage['name']}",
        "modified_count": result.modified_count
    }

@router.get("/stages/{stage_id}/orders")
async def get_orders_by_stage(
    stage_id: str,
    user: User = Depends(get_current_user)
):
    """Get all orders in a specific fulfillment stage"""
    orders = await db.orders.find(
        {"fulfillment_stage_id": stage_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(1000)
    return orders

@router.get("/stages/{stage_id}/count")
async def get_stage_order_count(
    stage_id: str,
    user: User = Depends(get_current_user)
):
    """Get count of orders in a stage"""
    count = await db.orders.count_documents({"fulfillment_stage_id": stage_id})
    return {"stage_id": stage_id, "count": count}

@router.get("/summary")
async def get_fulfillment_summary(user: User = Depends(get_current_user)):
    """Get summary of orders across all fulfillment stages"""
    stages = await db.fulfillment_stages.find({}, {"_id": 0}).sort("order", 1).to_list(100)
    
    summary = []
    for stage in stages:
        count = await db.orders.count_documents({"fulfillment_stage_id": stage["stage_id"]})
        summary.append({
            "stage_id": stage["stage_id"],
            "stage_name": stage["name"],
            "color": stage.get("color", "#6366F1"),
            "order": stage["order"],
            "count": count
        })
    
    # Count orders not yet assigned to fulfillment
    unassigned = await db.orders.count_documents({
        "$or": [
            {"fulfillment_stage_id": {"$exists": False}},
            {"fulfillment_stage_id": None}
        ]
    })
    
    total = await db.orders.count_documents({})
    
    return {
        "stages": summary,
        "unassigned_count": unassigned,
        "total_orders": total
    }

@router.post("/orders/{order_id}/mark-shipped")
async def mark_order_shipped(
    order_id: str,
    tracking_number: Optional[str] = None,
    carrier: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Mark an order as shipped"""
    order = await db.orders.find_one({"order_id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    now = datetime.now(timezone.utc).isoformat()
    
    update_data = {
        "status": "shipped",
        "fulfillment_status": "shipped",
        "shipped_at": now,
        "shipped_by": user.user_id
    }
    
    if tracking_number:
        update_data["tracking_number"] = tracking_number
    if carrier:
        update_data["carrier"] = carrier
    
    await db.orders.update_one(
        {"order_id": order_id},
        {"$set": update_data}
    )
    
    return {"message": "Order marked as shipped", "order_id": order_id}
