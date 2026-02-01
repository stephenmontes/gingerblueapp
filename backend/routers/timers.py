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

@router.get("/timers/history")
async def get_timer_history(
    limit: int = 50,
    stage_id: str = None,
    user: User = Depends(get_current_user)
):
    """Get timer history for the current user with break tracking info."""
    query = {"user_id": user.user_id, "completed_at": {"$ne": None}}
    if stage_id:
        query["stage_id"] = stage_id
    
    logs = await db.time_logs.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)
    
    # Calculate break times from pause events
    for log in logs:
        paused_at = log.get("paused_at")
        if paused_at and log.get("started_at"):
            # Calculate total break time if there was a pause
            log["had_breaks"] = True
        else:
            log["had_breaks"] = False
    
    return logs

@router.get("/timers/daily-summary")
async def get_daily_timer_summary(
    days: int = 7,
    user: User = Depends(get_current_user)
):
    """Get daily work summary with total work time and break patterns."""
    from datetime import timedelta
    
    start_date = datetime.now(timezone.utc) - timedelta(days=days)
    
    logs = await db.time_logs.find({
        "user_id": user.user_id,
        "completed_at": {"$ne": None}
    }, {"_id": 0}).to_list(10000)
    
    daily_stats = {}
    
    for log in logs:
        created = log.get("created_at", "")
        if not created:
            continue
        
        try:
            log_date = datetime.fromisoformat(created.replace("Z", "+00:00"))
            if log_date < start_date:
                continue
            date_key = log_date.strftime("%Y-%m-%d")
        except:
            continue
        
        if date_key not in daily_stats:
            daily_stats[date_key] = {
                "date": date_key,
                "total_work_minutes": 0,
                "sessions": 0,
                "items_processed": 0,
                "stages_worked": set()
            }
        
        daily_stats[date_key]["total_work_minutes"] += log.get("duration_minutes", 0)
        daily_stats[date_key]["sessions"] += 1
        daily_stats[date_key]["items_processed"] += log.get("items_processed", 0)
        daily_stats[date_key]["stages_worked"].add(log.get("stage_name", "Unknown"))
    
    # Convert sets to lists for JSON serialization
    result = []
    for date_key in sorted(daily_stats.keys(), reverse=True):
        stats = daily_stats[date_key]
        stats["stages_worked"] = list(stats["stages_worked"])
        stats["total_work_hours"] = round(stats["total_work_minutes"] / 60, 2)
        result.append(stats)
    
    return result

@router.post("/timers/log-break")
async def log_break(
    duration_minutes: int,
    break_type: str = "general",
    user: User = Depends(get_current_user)
):
    """Manually log a break period."""
    now = datetime.now(timezone.utc)
    
    break_log = {
        "log_id": f"break_{uuid.uuid4().hex[:12]}",
        "user_id": user.user_id,
        "user_name": user.name,
        "type": "break",
        "break_type": break_type,  # lunch, short, general
        "duration_minutes": duration_minutes,
        "logged_at": now.isoformat(),
        "created_at": now.isoformat()
    }
    
    await db.break_logs.insert_one(break_log)
    
    return {
        "message": f"Break logged: {duration_minutes} minutes",
        "break_type": break_type,
        "log_id": break_log["log_id"]
    }

@router.get("/timers/breaks")
async def get_break_history(
    limit: int = 50,
    user: User = Depends(get_current_user)
):
    """Get break history for the current user."""
    breaks = await db.break_logs.find(
        {"user_id": user.user_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(limit)
    
    return breaks

@router.get("/timers/work-summary")
async def get_work_summary(user: User = Depends(get_current_user)):
    """Get comprehensive work summary including work time and breaks."""
    from datetime import timedelta
    
    # Get completed time logs
    logs = await db.time_logs.find({
        "user_id": user.user_id,
        "completed_at": {"$ne": None}
    }, {"_id": 0}).to_list(10000)
    
    # Get break logs
    breaks = await db.break_logs.find(
        {"user_id": user.user_id},
        {"_id": 0}
    ).to_list(10000)
    
    # Calculate totals
    total_work_minutes = sum(log.get("duration_minutes", 0) for log in logs)
    total_items = sum(log.get("items_processed", 0) for log in logs)
    total_sessions = len(logs)
    
    total_break_minutes = sum(b.get("duration_minutes", 0) for b in breaks)
    
    # Stage breakdown
    stage_breakdown = {}
    for log in logs:
        stage = log.get("stage_name", "Unknown")
        if stage not in stage_breakdown:
            stage_breakdown[stage] = {"minutes": 0, "items": 0, "sessions": 0}
        stage_breakdown[stage]["minutes"] += log.get("duration_minutes", 0)
        stage_breakdown[stage]["items"] += log.get("items_processed", 0)
        stage_breakdown[stage]["sessions"] += 1
    
    # Break type breakdown
    break_breakdown = {}
    for b in breaks:
        bt = b.get("break_type", "general")
        if bt not in break_breakdown:
            break_breakdown[bt] = {"minutes": 0, "count": 0}
        break_breakdown[bt]["minutes"] += b.get("duration_minutes", 0)
        break_breakdown[bt]["count"] += 1
    
    return {
        "work": {
            "total_hours": round(total_work_minutes / 60, 2),
            "total_minutes": round(total_work_minutes, 1),
            "total_sessions": total_sessions,
            "total_items": total_items,
            "avg_items_per_hour": round((total_items / total_work_minutes * 60), 1) if total_work_minutes > 0 else 0
        },
        "breaks": {
            "total_hours": round(total_break_minutes / 60, 2),
            "total_minutes": round(total_break_minutes, 1),
            "total_count": len(breaks),
            "breakdown": break_breakdown
        },
        "stages": stage_breakdown,
        "efficiency": {
            "work_ratio": round(total_work_minutes / (total_work_minutes + total_break_minutes) * 100, 1) if (total_work_minutes + total_break_minutes) > 0 else 100
        }
    }

