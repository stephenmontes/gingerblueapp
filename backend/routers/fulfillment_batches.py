"""
Fulfillment Batches Router
Handles ShipStation/Etsy batch fulfillment where orders move through stages as a group
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from datetime import datetime, timezone
import uuid

from database import db
from models.user import User
from dependencies import get_current_user

router = APIRouter(prefix="/fulfillment-batches", tags=["fulfillment-batches"])


@router.get("")
async def get_fulfillment_batches(
    status: Optional[str] = "active",
    user: User = Depends(get_current_user)
):
    """Get all fulfillment batches"""
    query = {}
    if status and status != "all":
        query["status"] = status
    
    batches = await db.fulfillment_batches.find(
        query,
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    return {"batches": batches}


@router.get("/{batch_id}")
async def get_fulfillment_batch(
    batch_id: str,
    user: User = Depends(get_current_user)
):
    """Get a single fulfillment batch with its orders"""
    batch = await db.fulfillment_batches.find_one(
        {"fulfillment_batch_id": batch_id},
        {"_id": 0}
    )
    
    if not batch:
        raise HTTPException(status_code=404, detail="Fulfillment batch not found")
    
    # Get all orders in this batch
    orders = await db.fulfillment_orders.find(
        {"fulfillment_batch_id": batch_id},
        {"_id": 0}
    ).to_list(1000)
    
    return {**batch, "orders": orders}


@router.post("/{batch_id}/start-timer")
async def start_fulfillment_batch_timer(
    batch_id: str,
    user: User = Depends(get_current_user)
):
    """Start the timer for a fulfillment batch"""
    batch = await db.fulfillment_batches.find_one(
        {"fulfillment_batch_id": batch_id},
        {"_id": 0}
    )
    
    if not batch:
        raise HTTPException(status_code=404, detail="Fulfillment batch not found")
    
    if batch.get("timer_active") and not batch.get("timer_paused"):
        return {"success": True, "message": "Timer already running", "batch": batch}
    
    now = datetime.now(timezone.utc).isoformat()
    
    update_data = {
        "timer_active": True,
        "timer_started_at": now,
        "timer_paused": False,
        "assigned_to": user.user_id,
        "assigned_name": user.name,
        "updated_at": now
    }
    
    # If this is the first time starting, also set time_started
    if not batch.get("time_started"):
        update_data["time_started"] = now
    
    await db.fulfillment_batches.update_one(
        {"fulfillment_batch_id": batch_id},
        {"$set": update_data}
    )
    
    return {"success": True, "message": "Timer started", "started_at": now}


@router.post("/{batch_id}/stop-timer")
async def stop_fulfillment_batch_timer(
    batch_id: str,
    user: User = Depends(get_current_user)
):
    """Stop/pause the timer for a fulfillment batch"""
    batch = await db.fulfillment_batches.find_one(
        {"fulfillment_batch_id": batch_id},
        {"_id": 0}
    )
    
    if not batch:
        raise HTTPException(status_code=404, detail="Fulfillment batch not found")
    
    if not batch.get("timer_active"):
        return {"success": True, "message": "Timer not running"}
    
    now = datetime.now(timezone.utc)
    
    # Calculate elapsed time and add to accumulated minutes
    elapsed_minutes = 0
    if batch.get("timer_started_at"):
        started_at = datetime.fromisoformat(batch["timer_started_at"].replace("Z", "+00:00"))
        elapsed_minutes = (now - started_at).total_seconds() / 60
    
    accumulated = batch.get("accumulated_minutes", 0) + elapsed_minutes
    
    await db.fulfillment_batches.update_one(
        {"fulfillment_batch_id": batch_id},
        {"$set": {
            "timer_active": False,
            "timer_paused": True,
            "accumulated_minutes": accumulated,
            "updated_at": now.isoformat()
        }}
    )
    
    # Log the time
    time_log = {
        "log_id": f"ftlog_{uuid.uuid4().hex[:12]}",
        "fulfillment_batch_id": batch_id,
        "user_id": user.user_id,
        "user_name": user.name,
        "stage_id": batch.get("current_stage_id"),
        "stage_name": batch.get("current_stage_name"),
        "minutes": elapsed_minutes,
        "action": "timer_stopped",
        "created_at": now.isoformat()
    }
    await db.fulfillment_time_logs.insert_one(time_log)
    
    return {
        "success": True, 
        "message": "Timer stopped", 
        "elapsed_minutes": elapsed_minutes,
        "total_minutes": accumulated
    }


@router.post("/{batch_id}/move-stage")
async def move_fulfillment_batch_stage(
    batch_id: str,
    target_stage_id: str,
    user: User = Depends(get_current_user)
):
    """Move the entire fulfillment batch to a new stage"""
    batch = await db.fulfillment_batches.find_one(
        {"fulfillment_batch_id": batch_id},
        {"_id": 0}
    )
    
    if not batch:
        raise HTTPException(status_code=404, detail="Fulfillment batch not found")
    
    # Get target stage info
    target_stage = await db.fulfillment_stages.find_one(
        {"stage_id": target_stage_id},
        {"_id": 0}
    )
    
    if not target_stage:
        raise HTTPException(status_code=404, detail="Target stage not found")
    
    now = datetime.now(timezone.utc).isoformat()
    from_stage_id = batch.get("current_stage_id")
    from_stage_name = batch.get("current_stage_name")
    
    # Stop timer if running
    if batch.get("timer_active"):
        await stop_fulfillment_batch_timer(batch_id, user)
    
    # Update batch stage
    await db.fulfillment_batches.update_one(
        {"fulfillment_batch_id": batch_id},
        {"$set": {
            "current_stage_id": target_stage_id,
            "current_stage_name": target_stage["name"],
            "updated_at": now
        }}
    )
    
    # Update all orders in the batch
    await db.fulfillment_orders.update_many(
        {"fulfillment_batch_id": batch_id},
        {"$set": {
            "fulfillment_stage_id": target_stage_id,
            "fulfillment_stage_name": target_stage["name"],
            "fulfillment_updated_at": now,
            "fulfillment_updated_by": user.user_id
        }}
    )
    
    # Log the stage move
    log_entry = {
        "log_id": f"flog_{uuid.uuid4().hex[:12]}",
        "fulfillment_batch_id": batch_id,
        "from_stage": from_stage_id,
        "from_stage_name": from_stage_name,
        "to_stage": target_stage_id,
        "to_stage_name": target_stage["name"],
        "user_id": user.user_id,
        "user_name": user.name,
        "action": "batch_stage_move",
        "created_at": now
    }
    await db.fulfillment_logs.insert_one(log_entry)
    
    return {
        "success": True,
        "message": f"Batch moved to {target_stage['name']}",
        "from_stage": from_stage_name,
        "to_stage": target_stage["name"]
    }


@router.post("/{batch_id}/complete")
async def complete_fulfillment_batch(
    batch_id: str,
    user: User = Depends(get_current_user)
):
    """Mark a fulfillment batch as completed"""
    batch = await db.fulfillment_batches.find_one(
        {"fulfillment_batch_id": batch_id},
        {"_id": 0}
    )
    
    if not batch:
        raise HTTPException(status_code=404, detail="Fulfillment batch not found")
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Stop timer if running
    if batch.get("timer_active"):
        await stop_fulfillment_batch_timer(batch_id, user)
    
    # Update batch status
    await db.fulfillment_batches.update_one(
        {"fulfillment_batch_id": batch_id},
        {"$set": {
            "status": "completed",
            "time_completed": now,
            "completed_by": user.user_id,
            "completed_by_name": user.name,
            "updated_at": now
        }}
    )
    
    # Update all orders in the batch
    await db.fulfillment_orders.update_many(
        {"fulfillment_batch_id": batch_id},
        {"$set": {
            "status": "fulfilled",
            "fulfilled_at": now,
            "updated_at": now
        }}
    )
    
    return {"success": True, "message": "Batch completed"}
