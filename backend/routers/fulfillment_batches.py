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
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Get current active workers
    active_workers = batch.get("active_workers", [])
    
    # Check if user is already an active worker
    user_already_active = any(w["user_id"] == user.user_id for w in active_workers)
    
    if user_already_active:
        return {"success": True, "message": "You are already working on this batch", "batch": batch}
    
    # Add user to active workers
    worker_entry = {
        "user_id": user.user_id,
        "user_name": user.name,
        "started_at": now
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
        "action": "worker_joined",
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
    elapsed_minutes = 0
    if user_worker.get("started_at"):
        started_at = datetime.fromisoformat(user_worker["started_at"].replace("Z", "+00:00"))
        elapsed_minutes = (now - started_at).total_seconds() / 60
    
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
        "started_at": user_worker["started_at"],
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
    
    # Log the time
    time_log = {
        "log_id": f"ftlog_{uuid.uuid4().hex[:12]}",
        "fulfillment_batch_id": batch_id,
        "user_id": user.user_id,
        "user_name": user.name,
        "stage_id": batch.get("current_stage_id"),
        "stage_name": batch.get("current_stage_name"),
        "minutes": elapsed_minutes,
        "action": "worker_stopped",
        "created_at": now_iso
    }
    await db.fulfillment_time_logs.insert_one(time_log)
    
    return {
        "success": True, 
        "message": f"Timer stopped - You worked {elapsed_minutes:.1f} minutes",
        "elapsed_minutes": elapsed_minutes,
        "total_minutes": accumulated,
        "remaining_workers": len(new_active_workers)
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
    
    await db.fulfillment_batches.update_one(
        {"fulfillment_batch_id": batch_id},
        {"$set": {
            "item_progress": item_progress,
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
                    "user_name": worker["user_name"],
                    "total_minutes": active_minutes,
                    "total_hours": round(worker_hours, 2),
                    "items_per_hour": round(total_items / worker_hours, 1) if worker_hours > 0 else 0,
                    "cost": round(worker_hours * cost_per_hour, 2),
                    "is_active": True
                })
    
    return {
        "batch_id": batch_id,
        "batch_name": batch.get("name"),
        "status": batch.get("status"),
        "total_orders": len(orders),
        "total_items": total_items,
        
        "fulfillment_time": {
            "total_minutes": round(fulfillment_total_minutes, 1),
            "total_hours": round(fulfillment_total_minutes / 60, 2),
            "workers": fulfillment_workers,
            "active_workers_count": len(active_workers)
        },
        
        "production_time": production_time,
        
        "combined_metrics": {
            "total_minutes": round(combined_total_minutes, 1),
            "total_hours": round(hours, 2),
            "items_per_hour": round(items_per_hour, 1),
            "cost_per_hour": cost_per_hour,
            "total_cost": round(total_cost, 2)
        }
    }
