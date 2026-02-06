"""
Timer Recovery Service
Saves and restores active timer states for users across deployments/sessions
"""
from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timezone
from typing import Optional
import uuid

from database import db
from models.user import User
from dependencies import get_current_user

router = APIRouter(prefix="/timer-recovery", tags=["timer-recovery"])


@router.get("/check")
async def check_saved_timers(user: User = Depends(get_current_user)):
    """Check if the user has any saved timer states that can be resumed."""
    
    # Check for saved production timers
    production_timer = await db.saved_timer_states.find_one({
        "user_id": user.user_id,
        "workflow_type": "production",
        "restored": False
    }, {"_id": 0})
    
    # Check for saved fulfillment timers
    fulfillment_timer = await db.saved_timer_states.find_one({
        "user_id": user.user_id,
        "workflow_type": "fulfillment",
        "restored": False
    }, {"_id": 0})
    
    result = {
        "has_saved_timers": False,
        "production_timer": None,
        "fulfillment_timer": None
    }
    
    if production_timer:
        result["has_saved_timers"] = True
        result["production_timer"] = {
            "save_id": production_timer.get("save_id"),
            "stage_id": production_timer.get("stage_id"),
            "stage_name": production_timer.get("stage_name"),
            "batch_id": production_timer.get("batch_id"),
            "batch_name": production_timer.get("batch_name"),
            "elapsed_minutes": production_timer.get("elapsed_minutes", 0),
            "items_processed": production_timer.get("items_processed", 0),
            "saved_at": production_timer.get("saved_at")
        }
    
    if fulfillment_timer:
        result["has_saved_timers"] = True
        result["fulfillment_timer"] = {
            "save_id": fulfillment_timer.get("save_id"),
            "stage_id": fulfillment_timer.get("stage_id"),
            "stage_name": fulfillment_timer.get("stage_name"),
            "batch_id": fulfillment_timer.get("fulfillment_batch_id"),
            "batch_name": fulfillment_timer.get("batch_name"),
            "elapsed_minutes": fulfillment_timer.get("elapsed_minutes", 0),
            "items_processed": fulfillment_timer.get("items_processed", 0),
            "saved_at": fulfillment_timer.get("saved_at")
        }
    
    return result


@router.post("/save-all")
async def save_all_active_timers(user: User = Depends(get_current_user)):
    """Save all active timers for the current user before logout/deployment."""
    now = datetime.now(timezone.utc)
    saved_count = 0
    
    # Save production timer
    production_timer = await db.time_logs.find_one({
        "user_id": user.user_id,
        "completed_at": None,
        "workflow_type": "production"
    }, {"_id": 0})
    
    if production_timer:
        # Calculate elapsed time
        started = datetime.fromisoformat(production_timer["started_at"].replace('Z', '+00:00'))
        accumulated = production_timer.get("accumulated_minutes", 0)
        
        if production_timer.get("is_paused"):
            elapsed = accumulated
        else:
            elapsed = accumulated + (now - started).total_seconds() / 60
        
        # Get batch name
        batch_name = None
        if production_timer.get("batch_id"):
            batch = await db.production_batches.find_one(
                {"batch_id": production_timer["batch_id"]},
                {"_id": 0, "name": 1}
            )
            if batch:
                batch_name = batch.get("name")
        
        # Save the state
        save_doc = {
            "save_id": f"save_{uuid.uuid4().hex[:12]}",
            "user_id": user.user_id,
            "user_name": user.name,
            "workflow_type": "production",
            "original_log_id": production_timer.get("log_id"),
            "stage_id": production_timer.get("stage_id"),
            "stage_name": production_timer.get("stage_name"),
            "batch_id": production_timer.get("batch_id"),
            "batch_name": batch_name,
            "original_started_at": production_timer.get("started_at"),
            "elapsed_minutes": round(elapsed, 2),
            "items_processed": production_timer.get("items_processed", 0),
            "is_paused": production_timer.get("is_paused", False),
            "saved_at": now.isoformat(),
            "restored": False
        }
        
        # Remove any existing saved state for this user/workflow
        await db.saved_timer_states.delete_many({
            "user_id": user.user_id,
            "workflow_type": "production"
        })
        
        await db.saved_timer_states.insert_one(save_doc)
        
        # Mark original timer as saved (but don't complete it)
        await db.time_logs.update_one(
            {"log_id": production_timer["log_id"]},
            {"$set": {"state_saved": True, "state_saved_at": now.isoformat()}}
        )
        
        saved_count += 1
    
    # Save fulfillment timer
    fulfillment_timer = await db.fulfillment_time_logs.find_one({
        "user_id": user.user_id,
        "completed_at": None
    }, {"_id": 0})
    
    if fulfillment_timer:
        started_at = fulfillment_timer.get("started_at")
        accumulated = fulfillment_timer.get("accumulated_minutes", 0)
        
        if started_at:
            started = datetime.fromisoformat(started_at.replace('Z', '+00:00'))
            if fulfillment_timer.get("is_paused"):
                elapsed = accumulated
            else:
                elapsed = accumulated + (now - started).total_seconds() / 60
        else:
            elapsed = accumulated
        
        # Get batch name
        batch_name = None
        if fulfillment_timer.get("fulfillment_batch_id"):
            batch = await db.fulfillment_batches.find_one(
                {"fulfillment_batch_id": fulfillment_timer["fulfillment_batch_id"]},
                {"_id": 0, "name": 1}
            )
            if batch:
                batch_name = batch.get("name")
        
        save_doc = {
            "save_id": f"save_{uuid.uuid4().hex[:12]}",
            "user_id": user.user_id,
            "user_name": user.name,
            "workflow_type": "fulfillment",
            "original_log_id": fulfillment_timer.get("log_id"),
            "stage_id": fulfillment_timer.get("stage_id"),
            "stage_name": fulfillment_timer.get("stage_name"),
            "fulfillment_batch_id": fulfillment_timer.get("fulfillment_batch_id"),
            "batch_name": batch_name,
            "original_started_at": fulfillment_timer.get("started_at"),
            "elapsed_minutes": round(elapsed, 2),
            "items_processed": fulfillment_timer.get("items_processed", 0),
            "orders_processed": fulfillment_timer.get("orders_processed", 0),
            "is_paused": fulfillment_timer.get("is_paused", False),
            "saved_at": now.isoformat(),
            "restored": False
        }
        
        await db.saved_timer_states.delete_many({
            "user_id": user.user_id,
            "workflow_type": "fulfillment"
        })
        
        await db.saved_timer_states.insert_one(save_doc)
        
        await db.fulfillment_time_logs.update_one(
            {"log_id": fulfillment_timer["log_id"]},
            {"$set": {"state_saved": True, "state_saved_at": now.isoformat()}}
        )
        
        saved_count += 1
    
    return {
        "message": f"Saved {saved_count} active timer(s)",
        "saved_count": saved_count,
        "saved_at": now.isoformat()
    }


@router.post("/restore/{save_id}")
async def restore_timer(save_id: str, user: User = Depends(get_current_user)):
    """Restore a saved timer state and resume tracking."""
    
    saved_state = await db.saved_timer_states.find_one({
        "save_id": save_id,
        "user_id": user.user_id,
        "restored": False
    }, {"_id": 0})
    
    if not saved_state:
        raise HTTPException(status_code=404, detail="Saved timer not found or already restored")
    
    now = datetime.now(timezone.utc)
    workflow_type = saved_state.get("workflow_type")
    
    if workflow_type == "production":
        # Check if user already has an active production timer
        existing = await db.time_logs.find_one({
            "user_id": user.user_id,
            "completed_at": None,
            "workflow_type": "production"
        })
        
        if existing:
            raise HTTPException(
                status_code=400, 
                detail="You already have an active production timer. Stop it first."
            )
        
        # Create a new timer with accumulated time from saved state
        new_timer = {
            "log_id": f"plog_{uuid.uuid4().hex[:12]}",
            "user_id": user.user_id,
            "user_name": user.name,
            "stage_id": saved_state.get("stage_id"),
            "stage_name": saved_state.get("stage_name"),
            "batch_id": saved_state.get("batch_id"),
            "workflow_type": "production",
            "action": "resumed",
            "started_at": now.isoformat(),
            "completed_at": None,
            "accumulated_minutes": saved_state.get("elapsed_minutes", 0),
            "items_processed": saved_state.get("items_processed", 0),
            "is_paused": False,
            "restored_from": save_id,
            "original_started_at": saved_state.get("original_started_at"),
            "created_at": now.isoformat()
        }
        
        await db.time_logs.insert_one(new_timer)
        
    elif workflow_type == "fulfillment":
        # Check if user already has an active fulfillment timer
        existing = await db.fulfillment_time_logs.find_one({
            "user_id": user.user_id,
            "completed_at": None
        })
        
        if existing:
            raise HTTPException(
                status_code=400,
                detail="You already have an active fulfillment timer. Stop it first."
            )
        
        new_timer = {
            "log_id": f"flog_{uuid.uuid4().hex[:12]}",
            "user_id": user.user_id,
            "user_name": user.name,
            "stage_id": saved_state.get("stage_id"),
            "stage_name": saved_state.get("stage_name"),
            "fulfillment_batch_id": saved_state.get("fulfillment_batch_id"),
            "workflow_type": "fulfillment",
            "action": "resumed",
            "started_at": now.isoformat(),
            "completed_at": None,
            "accumulated_minutes": saved_state.get("elapsed_minutes", 0),
            "items_processed": saved_state.get("items_processed", 0),
            "orders_processed": saved_state.get("orders_processed", 0),
            "is_paused": False,
            "restored_from": save_id,
            "original_started_at": saved_state.get("original_started_at"),
            "created_at": now.isoformat()
        }
        
        await db.fulfillment_time_logs.insert_one(new_timer)
    
    # Mark saved state as restored
    await db.saved_timer_states.update_one(
        {"save_id": save_id},
        {"$set": {
            "restored": True,
            "restored_at": now.isoformat()
        }}
    )
    
    return {
        "message": f"Timer restored with {saved_state.get('elapsed_minutes', 0):.1f} minutes accumulated",
        "workflow_type": workflow_type,
        "stage_name": saved_state.get("stage_name"),
        "elapsed_minutes": saved_state.get("elapsed_minutes", 0)
    }


@router.post("/discard/{save_id}")
async def discard_saved_timer(save_id: str, user: User = Depends(get_current_user)):
    """Discard a saved timer state without restoring it."""
    
    result = await db.saved_timer_states.delete_one({
        "save_id": save_id,
        "user_id": user.user_id
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Saved timer not found")
    
    return {"message": "Saved timer discarded", "save_id": save_id}


@router.post("/discard-all")
async def discard_all_saved_timers(user: User = Depends(get_current_user)):
    """Discard all saved timer states for the current user."""
    
    result = await db.saved_timer_states.delete_many({
        "user_id": user.user_id
    })
    
    return {
        "message": f"Discarded {result.deleted_count} saved timer(s)",
        "discarded_count": result.deleted_count
    }
