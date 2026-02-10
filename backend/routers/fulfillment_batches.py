"""
Fulfillment Batches Router
Handles ShipStation/Etsy batch fulfillment where orders move through stages as a group
Supports multiple workers, item-level progress tracking, and comprehensive reporting
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from datetime import datetime, timezone
from pydantic import BaseModel
import uuid

from database import db
from models.user import User
from dependencies import get_current_user

router = APIRouter(prefix="/fulfillment-batches", tags=["fulfillment-batches"])


class ItemProgressUpdate(BaseModel):
    qty_completed: int


@router.get("")
async def get_fulfillment_batches(
    status: Optional[str] = "active",
    user: User = Depends(get_current_user)
):
    """Get all fulfillment batches with shipping progress"""
    query = {}
    if status and status != "all":
        query["status"] = status
    
    batches = await db.fulfillment_batches.find(
        query,
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    # Add shipping progress to each batch
    for batch in batches:
        batch_id = batch.get("fulfillment_batch_id")
        
        # Get order counts
        total_orders = await db.fulfillment_orders.count_documents(
            {"fulfillment_batch_id": batch_id}
        )
        shipped_count = await db.fulfillment_orders.count_documents(
            {"fulfillment_batch_id": batch_id, "status": "shipped"}
        )
        
        batch["total_orders"] = total_orders
        batch["shipped_count"] = shipped_count
        batch["orders_remaining"] = total_orders - shipped_count
    
    return {"batches": batches}


@router.get("/{batch_id}")
async def get_fulfillment_batch(
    batch_id: str,
    user: User = Depends(get_current_user)
):
    """Get a single fulfillment batch with its orders and progress"""
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
    
    # Apply item progress to orders
    item_progress = batch.get("item_progress", {})
    stage_id = batch.get("current_stage_id", "")
    stage_progress_key = f"stage_{stage_id}"
    stage_progress = item_progress.get(stage_progress_key, {})
    
    # Calculate shipping progress
    total_orders = len(orders)
    shipped_count = 0
    
    for order in orders:
        order_progress = stage_progress.get(order["order_id"], {})
        items = order.get("items", []) or order.get("line_items", [])
        all_complete = True
        
        for idx, item in enumerate(items):
            item_key = f"item_{idx}"
            progress = order_progress.get(item_key, {})
            item["qty_completed"] = progress.get("qty_completed", 0)
            qty_required = item.get("qty") or item.get("quantity") or 1
            item["is_complete"] = item["qty_completed"] >= qty_required
            if not item["is_complete"]:
                all_complete = False
        
        order["is_complete"] = all_complete and len(items) > 0
        
        # Track shipped orders
        if order.get("status") == "shipped":
            shipped_count += 1
        
        # Add individual stage info if order was moved independently
        if order.get("individual_stage_override"):
            order["current_stage"] = {
                "stage_id": order.get("fulfillment_stage_id"),
                "stage_name": order.get("fulfillment_stage_name"),
                "is_independent": True
            }
        else:
            order["current_stage"] = {
                "stage_id": batch.get("current_stage_id"),
                "stage_name": batch.get("current_stage_name"),
                "is_independent": False
            }
    
    # Add shipping progress to batch
    batch["shipped_count"] = shipped_count
    batch["total_orders"] = total_orders
    batch["orders_remaining"] = total_orders - shipped_count
    
    return {**batch, "orders": orders}


@router.post("/{batch_id}/start-timer")
async def start_fulfillment_batch_timer(
    batch_id: str,
    user: User = Depends(get_current_user)
):
    """Start or join the timer for a fulfillment batch (supports multiple workers)"""
    batch = await db.fulfillment_batches.find_one(
        {"fulfillment_batch_id": batch_id},
        {"_id": 0}
    )
    
    if not batch:
        raise HTTPException(status_code=404, detail="Fulfillment batch not found")
    
    # Check for any active stage timer first
    any_active_stage = await db.fulfillment_time_logs.find_one({
        "user_id": user.user_id,
        "completed_at": None
    }, {"_id": 0})
    
    if any_active_stage:
        raise HTTPException(
            status_code=400,
            detail=f"You have an active timer for '{any_active_stage.get('stage_name', 'another stage')}'. Stop it first."
        )
    
    # Check if user is active on another batch
    other_batch = await db.fulfillment_batches.find_one({
        "fulfillment_batch_id": {"$ne": batch_id},
        "active_workers.user_id": user.user_id
    }, {"_id": 0, "batch_name": 1})
    
    if other_batch:
        raise HTTPException(
            status_code=400,
            detail=f"You are already working on batch '{other_batch.get('batch_name', 'another batch')}'. Stop that timer first."
        )
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Get current active workers
    active_workers = batch.get("active_workers", [])
    
    # Check if user is already an active worker on this batch
    user_already_active = any(w["user_id"] == user.user_id for w in active_workers)
    
    if user_already_active:
        return {"success": True, "message": "You are already working on this batch", "batch": batch}
    
    # Add user to active workers with full tracking fields
    worker_entry = {
        "user_id": user.user_id,
        "user_name": user.name,
        "started_at": now,
        "original_started_at": now,
        "is_paused": False,
        "accumulated_minutes": 0,
        "items_processed": 0
    }
    active_workers.append(worker_entry)
    
    update_data = {
        "timer_active": True,
        "timer_paused": False,
        "active_workers": active_workers,
        "updated_at": now
    }
    
    # If this is the first worker (no timer running), set timer_started_at
    if not batch.get("timer_active") or batch.get("timer_paused"):
        update_data["timer_started_at"] = now
    
    # If this is the very first time starting, set time_started
    if not batch.get("time_started"):
        update_data["time_started"] = now
    
    # Set primary assignee if not set
    if not batch.get("assigned_to"):
        update_data["assigned_to"] = user.user_id
        update_data["assigned_name"] = user.name
    
    await db.fulfillment_batches.update_one(
        {"fulfillment_batch_id": batch_id},
        {"$set": update_data}
    )
    
    # Log worker joining
    worker_log = {
        "log_id": f"wlog_{uuid.uuid4().hex[:12]}",
        "fulfillment_batch_id": batch_id,
        "user_id": user.user_id,
        "user_name": user.name,
        "stage_id": batch.get("current_stage_id"),
        "stage_name": batch.get("current_stage_name"),
        "workflow_type": "fulfillment",
        "action": "worker_joined",
        "started_at": now,
        "completed_at": None,
        "duration_minutes": 0,
        "orders_processed": 0,
        "items_processed": 0,
        "created_at": now
    }
    await db.fulfillment_time_logs.insert_one(worker_log)
    
    return {
        "success": True, 
        "message": f"Timer started - {len(active_workers)} worker(s) active",
        "started_at": now,
        "active_workers": active_workers
    }


@router.post("/{batch_id}/stop-timer")
async def stop_fulfillment_batch_timer(
    batch_id: str,
    user: User = Depends(get_current_user)
):
    """Stop timer for current user (removes from active workers)"""
    batch = await db.fulfillment_batches.find_one(
        {"fulfillment_batch_id": batch_id},
        {"_id": 0}
    )
    
    if not batch:
        raise HTTPException(status_code=404, detail="Fulfillment batch not found")
    
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    
    active_workers = batch.get("active_workers", [])
    
    # Find and remove current user from active workers
    user_worker = None
    new_active_workers = []
    for w in active_workers:
        if w["user_id"] == user.user_id:
            user_worker = w
        else:
            new_active_workers.append(w)
    
    if not user_worker:
        return {"success": True, "message": "You are not currently working on this batch"}
    
    # Calculate time worked by this user
    # Check if user was paused - if so, use accumulated_minutes
    elapsed_minutes = user_worker.get("accumulated_minutes", 0)
    
    # If not paused, add the current session time
    if not user_worker.get("is_paused") and user_worker.get("started_at"):
        started_at = datetime.fromisoformat(user_worker["started_at"].replace("Z", "+00:00"))
        session_minutes = (now - started_at).total_seconds() / 60
        elapsed_minutes += session_minutes
    
    # Update worker time tracking
    workers_time = batch.get("workers_time", {})
    if user.user_id not in workers_time:
        workers_time[user.user_id] = {
            "user_name": user.name,
            "total_minutes": 0,
            "sessions": []
        }
    
    workers_time[user.user_id]["total_minutes"] += elapsed_minutes
    workers_time[user.user_id]["sessions"].append({
        "started_at": user_worker.get("original_started_at") or user_worker.get("started_at"),
        "ended_at": now_iso,
        "minutes": elapsed_minutes,
        "stage_id": batch.get("current_stage_id"),
        "stage_name": batch.get("current_stage_name")
    })
    
    # Update accumulated minutes (total batch time)
    accumulated = batch.get("accumulated_minutes", 0) + elapsed_minutes
    
    update_data = {
        "active_workers": new_active_workers,
        "workers_time": workers_time,
        "accumulated_minutes": accumulated,
        "updated_at": now_iso
    }
    
    # If no more active workers, pause the timer
    if len(new_active_workers) == 0:
        update_data["timer_active"] = False
        update_data["timer_paused"] = True
    
    await db.fulfillment_batches.update_one(
        {"fulfillment_batch_id": batch_id},
        {"$set": update_data}
    )
    
    # Log the time in the same format as stage timers for consistency
    time_log = {
        "log_id": f"ftlog_{uuid.uuid4().hex[:12]}",
        "fulfillment_batch_id": batch_id,
        "user_id": user.user_id,
        "user_name": user.name,
        "stage_id": batch.get("current_stage_id"),
        "stage_name": batch.get("current_stage_name"),
        "workflow_type": "fulfillment",
        "action": "worker_stopped",
        "started_at": user_worker.get("original_started_at") or user_worker.get("started_at"),
        "completed_at": now_iso,
        "duration_minutes": round(elapsed_minutes, 2),
        "orders_processed": 0,
        "items_processed": user_worker.get("items_processed", 0),
        "created_at": now_iso
    }
    await db.fulfillment_time_logs.insert_one(time_log)
    
    return {
        "success": True, 
        "message": f"Timer stopped - You worked {elapsed_minutes:.1f} minutes",
        "elapsed_minutes": round(elapsed_minutes, 2),
        "total_minutes": round(accumulated, 2),
        "remaining_workers": len(new_active_workers)
    }


@router.post("/{batch_id}/pause-timer")
async def pause_fulfillment_batch_timer(
    batch_id: str,
    user: User = Depends(get_current_user)
):
    """Pause timer for the current user on a fulfillment batch"""
    batch = await db.fulfillment_batches.find_one(
        {"fulfillment_batch_id": batch_id},
        {"_id": 0}
    )
    
    if not batch:
        raise HTTPException(status_code=404, detail="Fulfillment batch not found")
    
    active_workers = batch.get("active_workers", [])
    
    # Find current user in active workers
    user_worker_idx = None
    for idx, w in enumerate(active_workers):
        if w["user_id"] == user.user_id:
            user_worker_idx = idx
            break
    
    if user_worker_idx is None:
        raise HTTPException(status_code=400, detail="You are not currently working on this batch")
    
    user_worker = active_workers[user_worker_idx]
    
    # Check if already paused
    if user_worker.get("is_paused"):
        raise HTTPException(status_code=400, detail="Your timer is already paused")
    
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    
    # Calculate accumulated time for this session before pausing
    session_minutes = 0
    if user_worker.get("started_at"):
        started_at = datetime.fromisoformat(user_worker["started_at"].replace("Z", "+00:00"))
        session_minutes = (now - started_at).total_seconds() / 60
    
    accumulated = user_worker.get("accumulated_minutes", 0) + session_minutes
    
    # Store original_started_at for reporting purposes
    original_started_at = user_worker.get("original_started_at") or user_worker.get("started_at")
    
    # Update the worker's status to paused
    active_workers[user_worker_idx] = {
        **user_worker,
        "is_paused": True,
        "paused_at": now_iso,
        "accumulated_minutes": accumulated,
        "original_started_at": original_started_at
    }
    
    await db.fulfillment_batches.update_one(
        {"fulfillment_batch_id": batch_id},
        {"$set": {
            "active_workers": active_workers,
            "updated_at": now_iso
        }}
    )
    
    return {
        "success": True,
        "message": "Timer paused",
        "accumulated_minutes": round(accumulated, 2)
    }


@router.post("/{batch_id}/resume-timer")
async def resume_fulfillment_batch_timer(
    batch_id: str,
    user: User = Depends(get_current_user)
):
    """Resume timer for the current user on a fulfillment batch"""
    batch = await db.fulfillment_batches.find_one(
        {"fulfillment_batch_id": batch_id},
        {"_id": 0}
    )
    
    if not batch:
        raise HTTPException(status_code=404, detail="Fulfillment batch not found")
    
    active_workers = batch.get("active_workers", [])
    
    # Find current user in active workers
    user_worker_idx = None
    for idx, w in enumerate(active_workers):
        if w["user_id"] == user.user_id:
            user_worker_idx = idx
            break
    
    if user_worker_idx is None:
        raise HTTPException(status_code=400, detail="You are not currently working on this batch")
    
    user_worker = active_workers[user_worker_idx]
    
    # Check if not paused
    if not user_worker.get("is_paused"):
        raise HTTPException(status_code=400, detail="Your timer is not paused")
    
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    
    # Resume by setting a new started_at and clearing pause status
    active_workers[user_worker_idx] = {
        **user_worker,
        "is_paused": False,
        "started_at": now_iso,  # New session start time
        "resumed_at": now_iso
    }
    
    await db.fulfillment_batches.update_one(
        {"fulfillment_batch_id": batch_id},
        {"$set": {
            "active_workers": active_workers,
            "timer_paused": False,  # Ensure batch timer is not paused
            "timer_active": True,
            "updated_at": now_iso
        }}
    )
    
    return {
        "success": True,
        "message": "Timer resumed",
        "started_at": now_iso
    }


@router.post("/{batch_id}/move-stage")
async def move_fulfillment_batch_stage(
    batch_id: str,
    target_stage_id: str,
    user: User = Depends(get_current_user)
):
    """Move the entire fulfillment batch to a new stage
    - Does NOT stop timer (timer persists across stages for Etsy batches)
    - Resets item completion progress for the new stage
    """
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
    
    # NOTE: Timer persists across stages - we do NOT stop it
    # This allows one person to follow a batch through all stages
    
    # Update batch stage (item_progress for new stage will be empty = reset)
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
        "to_stage": target_stage["name"],
        "timer_preserved": batch.get("timer_active", False)
    }


@router.post("/{batch_id}/items/progress")
async def update_item_progress(
    batch_id: str,
    order_id: str,
    item_index: int,
    progress: ItemProgressUpdate,
    user: User = Depends(get_current_user)
):
    """Update completion progress for a specific item in the batch"""
    try:
        batch = await db.fulfillment_batches.find_one(
            {"fulfillment_batch_id": batch_id},
            {"_id": 0}
        )
        
        if not batch:
            raise HTTPException(status_code=404, detail="Fulfillment batch not found")
        
        now = datetime.now(timezone.utc).isoformat()
        stage_id = batch.get("current_stage_id", "unknown")
        stage_progress_key = f"stage_{stage_id}"
        
        # Get current item progress
        item_progress = batch.get("item_progress", {})
        if stage_progress_key not in item_progress:
            item_progress[stage_progress_key] = {}
        if order_id not in item_progress[stage_progress_key]:
            item_progress[stage_progress_key][order_id] = {}
        
        item_key = f"item_{item_index}"
        item_progress[stage_progress_key][order_id][item_key] = {
            "qty_completed": progress.qty_completed,
            "updated_at": now,
            "updated_by": user.user_id
        }
        
        # Track items processed for the current user's active worker entry
        active_workers = batch.get("active_workers", [])
        for idx, worker in enumerate(active_workers):
            if worker.get("user_id") == user.user_id:
                items_processed = worker.get("items_processed", 0) + 1
                active_workers[idx]["items_processed"] = items_processed
                break
        
        await db.fulfillment_batches.update_one(
            {"fulfillment_batch_id": batch_id},
            {"$set": {
                "item_progress": item_progress,
                "active_workers": active_workers,
                "updated_at": now
            }}
        )
        
        return {
            "success": True,
            "message": "Progress updated",
            "order_id": order_id,
            "item_index": item_index,
            "qty_completed": progress.qty_completed
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"Error updating item progress: {e}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to update progress: {str(e)}")


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
    
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    
    # Stop all active workers and log their time
    active_workers = batch.get("active_workers", [])
    workers_time = batch.get("workers_time", {})
    accumulated = batch.get("accumulated_minutes", 0)
    
    for worker in active_workers:
        elapsed_minutes = 0
        if worker.get("started_at"):
            started_at = datetime.fromisoformat(worker["started_at"].replace("Z", "+00:00"))
            elapsed_minutes = (now - started_at).total_seconds() / 60
        
        user_id = worker["user_id"]
        if user_id not in workers_time:
            workers_time[user_id] = {
                "user_name": worker["user_name"],
                "total_minutes": 0,
                "sessions": []
            }
        
        workers_time[user_id]["total_minutes"] += elapsed_minutes
        workers_time[user_id]["sessions"].append({
            "started_at": worker["started_at"],
            "ended_at": now_iso,
            "minutes": elapsed_minutes,
            "stage_id": batch.get("current_stage_id"),
            "stage_name": batch.get("current_stage_name")
        })
        
        accumulated += elapsed_minutes
    
    # Update batch status
    await db.fulfillment_batches.update_one(
        {"fulfillment_batch_id": batch_id},
        {"$set": {
            "status": "completed",
            "time_completed": now_iso,
            "completed_by": user.user_id,
            "completed_by_name": user.name,
            "timer_active": False,
            "timer_paused": False,
            "active_workers": [],
            "workers_time": workers_time,
            "accumulated_minutes": accumulated,
            "updated_at": now_iso
        }}
    )
    
    # Update all orders in the batch
    await db.fulfillment_orders.update_many(
        {"fulfillment_batch_id": batch_id},
        {"$set": {
            "status": "fulfilled",
            "fulfilled_at": now_iso,
            "updated_at": now_iso
        }}
    )
    
    return {"success": True, "message": "Batch completed", "total_minutes": accumulated}


# ==================== INDIVIDUAL ORDER PACK/SHIP ====================

class MoveOrderToPackShip(BaseModel):
    """Request to move individual orders to pack/ship"""
    order_ids: list[str]
    is_gb_home: bool = False  # GB Home batches can move at any stage


@router.post("/{batch_id}/orders/move-to-pack-ship")
async def move_orders_to_pack_ship(
    batch_id: str,
    request: MoveOrderToPackShip,
    user: User = Depends(get_current_user)
):
    """
    Move individual orders from Finish stage to Pack and Ship independently.
    
    This allows decor/home batches to be printed, mounted, and finished as a batch,
    but packed and shipped individually. The batch timing continues for tracking purposes.
    
    GB Home batches can move orders to Pack and Ship at any stage since they 
    process orders individually rather than as a combined batch.
    """
    batch = await db.fulfillment_batches.find_one(
        {"fulfillment_batch_id": batch_id},
        {"_id": 0}
    )
    
    if not batch:
        raise HTTPException(status_code=404, detail="Fulfillment batch not found")
    
    # GB Home batches can move orders at any stage
    is_gb_home = request.is_gb_home or batch.get("store_type") == "gb_home" or batch.get("is_gb_home_batch", False)
    
    # For non-GB Home batches, verify batch is at Finish stage
    if not is_gb_home and batch.get("current_stage_id") != "fulfill_finish":
        raise HTTPException(
            status_code=400, 
            detail="Orders can only be moved to Pack and Ship when batch is at Finish stage"
        )
    
    now = datetime.now(timezone.utc).isoformat()
    order_ids = request.order_ids
    
    if not order_ids:
        raise HTTPException(status_code=400, detail="No orders specified")
    
    # Initialize individual_order_status if not present
    individual_order_status = batch.get("individual_order_status", {})
    
    # Move specified orders to pack/ship
    moved_orders = []
    for order_id in order_ids:
        # Verify order belongs to this batch
        order = await db.fulfillment_orders.find_one({
            "order_id": order_id,
            "fulfillment_batch_id": batch_id
        })
        
        if not order:
            continue
        
        # Update order status
        individual_order_status[order_id] = {
            "stage_id": "fulfill_pack",
            "stage_name": "Pack and Ship",
            "moved_at": now,
            "moved_by": user.user_id,
            "moved_by_name": user.name
        }
        
        # Update the order document
        await db.fulfillment_orders.update_one(
            {"order_id": order_id},
            {"$set": {
                "fulfillment_stage_id": "fulfill_pack",
                "fulfillment_stage_name": "Pack and Ship",
                "individual_stage_override": True,
                "moved_to_pack_at": now,
                "moved_to_pack_by": user.user_id,
                "fulfillment_updated_at": now,
                "fulfillment_updated_by": user.user_id
            }}
        )
        
        moved_orders.append(order_id)
    
    # Update batch with individual order statuses
    await db.fulfillment_batches.update_one(
        {"fulfillment_batch_id": batch_id},
        {"$set": {
            "individual_order_status": individual_order_status,
            "has_split_orders": True,
            "updated_at": now
        }}
    )
    
    # Log the action
    log_entry = {
        "log_id": f"flog_{uuid.uuid4().hex[:12]}",
        "fulfillment_batch_id": batch_id,
        "action": "orders_moved_to_pack_ship",
        "order_ids": moved_orders,
        "order_count": len(moved_orders),
        "user_id": user.user_id,
        "user_name": user.name,
        "created_at": now
    }
    await db.fulfillment_logs.insert_one(log_entry)
    
    return {
        "success": True,
        "message": f"Moved {len(moved_orders)} order(s) to Pack and Ship",
        "moved_orders": moved_orders,
        "remaining_at_finish": len([
            oid for oid in batch.get("orders", []) 
            if oid not in individual_order_status or 
               individual_order_status.get(oid, {}).get("stage_id") != "fulfill_pack"
        ])
    }


@router.post("/{batch_id}/orders/{order_id}/mark-shipped")
async def mark_order_shipped(
    batch_id: str,
    order_id: str,
    user: User = Depends(get_current_user)
):
    """
    Mark an individual order as shipped/completed.
    Used for orders that have been moved to Pack and Ship independently.
    When all orders in a batch are shipped, the batch is automatically archived.
    """
    batch = await db.fulfillment_batches.find_one(
        {"fulfillment_batch_id": batch_id},
        {"_id": 0}
    )
    
    if not batch:
        raise HTTPException(status_code=404, detail="Fulfillment batch not found")
    
    order = await db.fulfillment_orders.find_one({
        "order_id": order_id,
        "fulfillment_batch_id": batch_id
    })
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found in this batch")
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Update order as shipped
    await db.fulfillment_orders.update_one(
        {"order_id": order_id},
        {"$set": {
            "status": "shipped",
            "shipped_at": now,
            "shipped_by": user.user_id,
            "shipped_by_name": user.name,
            "fulfillment_updated_at": now
        }}
    )
    
    # Update individual order status in batch
    individual_order_status = batch.get("individual_order_status", {})
    if order_id in individual_order_status:
        individual_order_status[order_id]["shipped_at"] = now
        individual_order_status[order_id]["shipped_by"] = user.user_id
        individual_order_status[order_id]["status"] = "shipped"
    else:
        # Add to individual_order_status if not already there
        individual_order_status[order_id] = {
            "stage_id": "fulfill_pack",
            "stage_name": "Pack and Ship",
            "shipped_at": now,
            "shipped_by": user.user_id,
            "status": "shipped"
        }
    
    # Count shipped vs total orders
    all_orders = await db.fulfillment_orders.find(
        {"fulfillment_batch_id": batch_id},
        {"_id": 0, "order_id": 1, "status": 1}
    ).to_list(1000)
    
    total_orders = len(all_orders)
    shipped_count = sum(1 for o in all_orders if o.get("status") == "shipped")
    # Add 1 for the order we just marked (in case the query ran before update propagated)
    if order.get("status") != "shipped":
        shipped_count += 1
    
    batch_update = {
        "individual_order_status": individual_order_status,
        "shipped_count": shipped_count,
        "total_orders": total_orders,
        "updated_at": now
    }
    
    # Auto-archive batch if all orders are shipped
    all_shipped = shipped_count >= total_orders
    if all_shipped:
        batch_update["status"] = "archived"
        batch_update["archived_at"] = now
        batch_update["archived_by"] = user.user_id
        batch_update["archived_reason"] = "All orders shipped"
    
    await db.fulfillment_batches.update_one(
        {"fulfillment_batch_id": batch_id},
        {"$set": batch_update}
    )
    
    return {
        "success": True,
        "message": f"Order {order_id} marked as shipped",
        "shipped_count": shipped_count,
        "total_orders": total_orders,
        "all_shipped": all_shipped,
        "batch_archived": all_shipped
    }


@router.get("/{batch_id}/pack-ship-orders")
async def get_pack_ship_orders(
    batch_id: str,
    user: User = Depends(get_current_user)
):
    """
    Get orders that have been moved to Pack and Ship for this batch.
    Returns orders grouped by status (ready to ship, shipped).
    """
    batch = await db.fulfillment_batches.find_one(
        {"fulfillment_batch_id": batch_id},
        {"_id": 0}
    )
    
    if not batch:
        raise HTTPException(status_code=404, detail="Fulfillment batch not found")
    
    # Get all orders that have been moved to pack/ship
    orders = await db.fulfillment_orders.find({
        "fulfillment_batch_id": batch_id,
        "individual_stage_override": True,
        "fulfillment_stage_id": "fulfill_pack"
    }, {"_id": 0}).to_list(1000)
    
    ready_to_ship = []
    shipped = []
    
    for order in orders:
        if order.get("status") == "shipped":
            shipped.append(order)
        else:
            ready_to_ship.append(order)
    
    return {
        "batch_id": batch_id,
        "batch_name": batch.get("name"),
        "batch_stage": batch.get("current_stage_name"),
        "ready_to_ship": ready_to_ship,
        "shipped": shipped,
        "total_at_pack_ship": len(orders)
    }


@router.get("/{batch_id}/orders-by-stage")
async def get_orders_by_stage(
    batch_id: str,
    user: User = Depends(get_current_user)
):
    """
    Get orders in a batch grouped by their current stage.
    Useful for batches with split orders (some at Finish, some at Pack/Ship).
    """
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
    
    # Group by stage
    by_stage = {}
    
    for order in orders:
        # Determine actual stage - check if individually overridden
        if order.get("individual_stage_override"):
            stage_id = order.get("fulfillment_stage_id", "fulfill_pack")
            stage_name = order.get("fulfillment_stage_name", "Pack and Ship")
        else:
            stage_id = batch.get("current_stage_id")
            stage_name = batch.get("current_stage_name")
        
        if stage_id not in by_stage:
            by_stage[stage_id] = {
                "stage_id": stage_id,
                "stage_name": stage_name,
                "orders": []
            }
        
        by_stage[stage_id]["orders"].append(order)
    
    return {
        "batch_id": batch_id,
        "batch_name": batch.get("name"),
        "batch_current_stage": batch.get("current_stage_name"),
        "has_split_orders": batch.get("has_split_orders", False),
        "stages": list(by_stage.values())
    }


@router.get("/{batch_id}/report")
async def get_fulfillment_batch_report(
    batch_id: str,
    user: User = Depends(get_current_user)
):
    """Get comprehensive time and cost report for a fulfillment batch
    Includes:
    - Workers time breakdown with individual hourly rates
    - Average items per hour
    - Cost calculated per user's hourly rate
    - Production time from associated frame production batch
    """
    batch = await db.fulfillment_batches.find_one(
        {"fulfillment_batch_id": batch_id},
        {"_id": 0}
    )
    
    if not batch:
        raise HTTPException(status_code=404, detail="Fulfillment batch not found")
    
    # Get all users to fetch their hourly rates
    all_users = await db.users.find({}, {"_id": 0, "user_id": 1, "hourly_rate": 1}).to_list(1000)
    user_rates = {u["user_id"]: u.get("hourly_rate", 15.00) for u in all_users}
    default_rate = 15.00  # Default if no rate set
    
    # Get orders to count total items
    orders = await db.fulfillment_orders.find(
        {"fulfillment_batch_id": batch_id},
        {"_id": 0, "items": 1, "line_items": 1}
    ).to_list(1000)
    
    total_items = 0
    for order in orders:
        items = order.get("items", []) or order.get("line_items", [])
        for item in items:
            total_items += item.get("qty") or item.get("quantity") or 1
    
    # Calculate fulfillment time
    workers_time = batch.get("workers_time", {})
    fulfillment_total_minutes = batch.get("accumulated_minutes", 0)
    
    # Add time from any currently active workers
    now = datetime.now(timezone.utc)
    active_workers = batch.get("active_workers", [])
    active_worker_minutes = 0
    for worker in active_workers:
        if worker.get("started_at"):
            started_at = datetime.fromisoformat(worker["started_at"].replace("Z", "+00:00"))
            active_worker_minutes += (now - started_at).total_seconds() / 60
    
    fulfillment_total_minutes += active_worker_minutes
    
    # Get production batch time if linked
    production_batch_id = batch.get("production_batch_id")
    production_time = None
    production_workers = {}
    production_total_cost = 0
    
    if production_batch_id:
        # Get production batch
        production_batch = await db.production_batches.find_one(
            {"batch_id": production_batch_id},
            {"_id": 0}
        )
        
        if production_batch:
            # Get time logs for production batch
            production_logs = await db.production_time_logs.find(
                {"batch_id": production_batch_id},
                {"_id": 0}
            ).to_list(1000)
            
            prod_total_minutes = 0
            for log in production_logs:
                minutes = log.get("minutes", 0)
                prod_total_minutes += minutes
                
                log_user_id = log.get("user_id", "unknown")
                user_name = log.get("user_name", "Unknown")
                user_rate = user_rates.get(log_user_id, default_rate)
                worker_cost = (minutes / 60) * user_rate
                production_total_cost += worker_cost
                
                if log_user_id not in production_workers:
                    production_workers[log_user_id] = {
                        "user_name": user_name,
                        "total_minutes": 0,
                        "hourly_rate": user_rate,
                        "cost": 0
                    }
                production_workers[log_user_id]["total_minutes"] += minutes
                production_workers[log_user_id]["cost"] += worker_cost
            
            production_time = {
                "batch_id": production_batch_id,
                "batch_name": production_batch.get("name"),
                "total_minutes": prod_total_minutes,
                "total_cost": round(production_total_cost, 2),
                "workers": production_workers
            }
    
    # Calculate combined totals
    combined_total_minutes = fulfillment_total_minutes
    if production_time:
        combined_total_minutes += production_time["total_minutes"]
    
    # Calculate metrics
    hours = combined_total_minutes / 60 if combined_total_minutes > 0 else 0
    items_per_hour = total_items / hours if hours > 0 else 0
    
    # Build worker summary for fulfillment with individual rates
    fulfillment_workers = []
    fulfillment_total_cost = 0
    
    for worker_user_id, data in workers_time.items():
        worker_hours = data["total_minutes"] / 60
        worker_rate = user_rates.get(worker_user_id, default_rate)
        worker_cost = worker_hours * worker_rate
        fulfillment_total_cost += worker_cost
        
        fulfillment_workers.append({
            "user_id": worker_user_id,
            "user_name": data["user_name"],
            "total_minutes": data["total_minutes"],
            "total_hours": round(worker_hours, 2),
            "hourly_rate": worker_rate,
            "items_per_hour": round(total_items / worker_hours, 1) if worker_hours > 0 else 0,
            "cost": round(worker_cost, 2)
        })
    
    # Add currently active workers
    for worker in active_workers:
        if worker.get("started_at"):
            started_at = datetime.fromisoformat(worker["started_at"].replace("Z", "+00:00"))
            active_minutes = (now - started_at).total_seconds() / 60
            worker_rate = user_rates.get(worker["user_id"], default_rate)
            active_cost = (active_minutes / 60) * worker_rate
            
            # Check if already in workers list
            existing = next((w for w in fulfillment_workers if w["user_id"] == worker["user_id"]), None)
            if existing:
                existing["total_minutes"] += active_minutes
                existing["total_hours"] = round(existing["total_minutes"] / 60, 2)
                existing["cost"] = round((existing["total_minutes"] / 60) * worker_rate, 2)
                existing["is_active"] = True
                fulfillment_total_cost += active_cost
            else:
                worker_hours = active_minutes / 60
                fulfillment_total_cost += active_cost
                fulfillment_workers.append({
                    "user_id": worker["user_id"],
                    "user_name": worker["user_name"],
                    "total_minutes": active_minutes,
                    "total_hours": round(worker_hours, 2),
                    "hourly_rate": worker_rate,
                    "items_per_hour": round(total_items / worker_hours, 1) if worker_hours > 0 else 0,
                    "cost": round(active_cost, 2),
                    "is_active": True
                })
    
    # Calculate total cost (fulfillment + production)
    total_cost = fulfillment_total_cost + production_total_cost
    
    # Calculate weighted average hourly rate
    avg_hourly_rate = total_cost / hours if hours > 0 else default_rate
    
    return {
        "batch_id": batch_id,
        "batch_name": batch.get("name"),
        "status": batch.get("status"),
        "total_orders": len(orders),
        "total_items": total_items,
        
        "fulfillment_time": {
            "total_minutes": round(fulfillment_total_minutes, 1),
            "total_hours": round(fulfillment_total_minutes / 60, 2),
            "total_cost": round(fulfillment_total_cost, 2),
            "workers": fulfillment_workers,
            "active_workers_count": len(active_workers)
        },
        
        "production_time": production_time,
        
        "combined_metrics": {
            "total_minutes": round(combined_total_minutes, 1),
            "total_hours": round(hours, 2),
            "items_per_hour": round(items_per_hour, 1),
            "avg_hourly_rate": round(avg_hourly_rate, 2),
            "total_cost": round(total_cost, 2)
        }
    }
