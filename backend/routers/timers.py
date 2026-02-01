from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timezone
import uuid

from database import db
from models.user import User
from dependencies import get_current_user

router = APIRouter(tags=["timers"])

@router.post("/stages/{stage_id}/start-timer")
async def start_stage_timer(stage_id: str, user: User = Depends(get_current_user)):
    """Start time tracking for a user working on a specific stage."""
    stage = await db.production_stages.find_one({"stage_id": stage_id}, {"_id": 0})
    if not stage:
        raise HTTPException(status_code=404, detail="Stage not found")
    
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

@router.post("/stages/{stage_id}/stop-timer")
async def stop_stage_timer(stage_id: str, items_processed: int = 0, user: User = Depends(get_current_user)):
    """Stop time tracking for a user's stage work."""
    active_timer = await db.time_logs.find_one({
        "user_id": user.user_id,
        "stage_id": stage_id,
        "completed_at": None
    }, {"_id": 0})
    
    if not active_timer:
        raise HTTPException(status_code=400, detail="No active timer for this stage")
    
    now = datetime.now(timezone.utc)
    accumulated = active_timer.get("accumulated_minutes", 0)
    
    if active_timer.get("is_paused"):
        duration_minutes = accumulated
    else:
        started_at = datetime.fromisoformat(active_timer["started_at"])
        if started_at.tzinfo is None:
            started_at = started_at.replace(tzinfo=timezone.utc)
        current_session = (now - started_at).total_seconds() / 60
        duration_minutes = accumulated + current_session
    
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

@router.post("/stages/{stage_id}/pause-timer")
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

@router.post("/stages/{stage_id}/resume-timer")
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
            "started_at": now.isoformat(),
            "action": "resumed"
        }}
    )
    
    return {
        "message": "Timer resumed",
        "stage_id": stage_id,
        "stage_name": active_timer["stage_name"],
        "accumulated_minutes": active_timer.get("accumulated_minutes", 0)
    }

@router.get("/stages/{stage_id}/active-timer")
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
        "stage_name": active_timer["stage_name"],
        "is_paused": active_timer.get("is_paused", False),
        "accumulated_minutes": active_timer.get("accumulated_minutes", 0)
    }

@router.get("/user/active-timers")
async def get_user_active_timers(user: User = Depends(get_current_user)):
    """Get all active timers for the current user."""
    active_timers = await db.time_logs.find({
        "user_id": user.user_id,
        "completed_at": None
    }, {"_id": 0}).to_list(100)
    
    return active_timers

@router.get("/user/time-stats")
async def get_user_time_stats(user: User = Depends(get_current_user)):
    """Get time tracking statistics for the current user per stage."""
    logs = await db.time_logs.find({
        "user_id": user.user_id,
        "completed_at": {"$ne": None}
    }, {"_id": 0}).to_list(10000)
    
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
    
    for stats in stage_stats.values():
        if stats["total_minutes"] > 0 and stats["total_items"] > 0:
            stats["avg_items_per_hour"] = round((stats["total_items"] / stats["total_minutes"]) * 60, 1)
        else:
            stats["avg_items_per_hour"] = 0
    
    return list(stage_stats.values())

@router.get("/timers/active")
async def get_all_active_timers(user: User = Depends(get_current_user)):
    """Get all active timers (alias for user/active-timers)."""
    return await get_user_active_timers(user)
