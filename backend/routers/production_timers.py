"""
Production Timers Router - Time Entry Management for Frame Production
Mirrors the fulfillment time tracking functionality with admin management capabilities
"""
from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timezone, timedelta
from typing import Optional
import uuid

from database import db
from models.user import User
from dependencies import get_current_user

router = APIRouter(prefix="/production", tags=["production-timers"])

DAILY_HOURS_LIMIT = 9


@router.get("/stages/{stage_id}/active-workers")
async def get_production_stage_active_workers(stage_id: str, user: User = Depends(get_current_user)):
    """Get list of users currently working on a production stage."""
    active_timers = await db.time_logs.find({
        "stage_id": stage_id,
        "completed_at": None
    }, {"_id": 0}).to_list(100)
    
    workers = []
    for timer in active_timers:
        # Calculate elapsed time
        started = datetime.fromisoformat(timer["started_at"].replace('Z', '+00:00'))
        elapsed_minutes = (datetime.now(timezone.utc) - started).total_seconds() / 60
        if timer.get("is_paused"):
            elapsed_minutes = timer.get("accumulated_minutes", 0)
        else:
            elapsed_minutes += timer.get("accumulated_minutes", 0)
        
        workers.append({
            "user_id": timer["user_id"],
            "user_name": timer["user_name"],
            "started_at": timer["started_at"],
            "is_paused": timer.get("is_paused", False),
            "batch_id": timer.get("batch_id"),
            "elapsed_minutes": round(elapsed_minutes, 1)
        })
    
    return workers


@router.get("/stats/user-kpis")
async def get_production_user_kpis(
    stage_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get the current user's KPIs for production stages."""
    match_query = {
        "user_id": user.user_id,
        "duration_minutes": {"$gt": 0},
        "completed_at": {"$ne": None},
        "workflow_type": "production"
    }
    if stage_id:
        match_query["stage_id"] = stage_id
    
    pipeline = [
        {"$match": match_query},
        {"$group": {
            "_id": {"stage_id": "$stage_id", "stage_name": "$stage_name"},
            "total_minutes": {"$sum": "$duration_minutes"},
            "total_items": {"$sum": "$items_processed"},
            "session_count": {"$sum": 1}
        }},
        {"$project": {
            "_id": 0,
            "stage_id": "$_id.stage_id",
            "stage_name": "$_id.stage_name",
            "total_hours": {"$round": [{"$divide": ["$total_minutes", 60]}, 2]},
            "total_minutes": {"$round": ["$total_minutes", 1]},
            "total_items": 1,
            "session_count": 1,
            "items_per_hour": {"$cond": {
                "if": {"$gt": ["$total_minutes", 0]},
                "then": {"$round": [{"$multiply": [{"$divide": ["$total_items", "$total_minutes"]}, 60]}, 1]},
                "else": 0
            }}
        }},
        {"$sort": {"total_items": -1}}
    ]
    
    user_stats = await db.time_logs.aggregate(pipeline).to_list(100)
    
    total_hours = sum(s["total_hours"] for s in user_stats)
    total_items = sum(s["total_items"] for s in user_stats)
    total_sessions = sum(s["session_count"] for s in user_stats)
    
    return {
        "user_id": user.user_id,
        "user_name": user.name,
        "stages": user_stats,
        "totals": {
            "total_hours": round(total_hours, 2),
            "total_items": total_items,
            "total_sessions": total_sessions
        }
    }


@router.get("/stats/stage-kpis")
async def get_production_stage_kpis(user: User = Depends(get_current_user)):
    """Get KPIs for all production stages by user."""
    stages = await db.production_stages.find({}, {"_id": 0}).sort("order", 1).to_list(100)
    
    result = []
    for stage in stages:
        pipeline = [
            {"$match": {
                "stage_id": stage["stage_id"],
                "duration_minutes": {"$gt": 0},
                "completed_at": {"$ne": None},
                "workflow_type": "production"
            }},
            {"$group": {
                "_id": {"user_id": "$user_id", "user_name": "$user_name"},
                "total_minutes": {"$sum": "$duration_minutes"},
                "total_items": {"$sum": "$items_processed"},
                "session_count": {"$sum": 1}
            }},
            {"$project": {
                "_id": 0,
                "user_id": "$_id.user_id",
                "user_name": "$_id.user_name",
                "total_hours": {"$round": [{"$divide": ["$total_minutes", 60]}, 2]},
                "total_items": 1,
                "session_count": 1,
                "items_per_hour": {"$cond": {
                    "if": {"$gt": ["$total_minutes", 0]},
                    "then": {"$round": [{"$multiply": [{"$divide": ["$total_items", "$total_minutes"]}, 60]}, 1]},
                    "else": 0
                }}
            }},
            {"$sort": {"total_items": -1}}
        ]
        
        users = await db.time_logs.aggregate(pipeline).to_list(100)
        
        stage_total_hours = sum(u["total_hours"] for u in users)
        stage_total_items = sum(u["total_items"] for u in users)
        
        result.append({
            "stage_id": stage["stage_id"],
            "stage_name": stage["name"],
            "color": stage.get("color"),
            "users": users,
            "totals": {
                "total_hours": round(stage_total_hours, 2),
                "total_items": stage_total_items,
                "worker_count": len(users)
            }
        })
    
    return result


@router.get("/stats/overall-kpis")
async def get_production_overall_kpis(
    period: str = "this_week",
    user: User = Depends(get_current_user)
):
    """Get KPIs for the production workflow for a specified time period."""
    # Use EST timezone for date calculations (user's timezone)
    from zoneinfo import ZoneInfo
    est_tz = ZoneInfo("America/New_York")
    now = datetime.now(est_tz)
    
    # Calculate date range based on period (in EST)
    if period == "today":
        start_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
        end_date = now
        period_label = "Today"
        date_range = start_date.strftime("%b %d")
    elif period == "yesterday":
        start_date = (now - timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
        end_date = start_date.replace(hour=23, minute=59, second=59)
        period_label = "Yesterday"
        date_range = start_date.strftime("%b %d")
    elif period == "this_week":
        days_since_monday = now.weekday()
        start_date = (now - timedelta(days=days_since_monday)).replace(hour=0, minute=0, second=0, microsecond=0)
        end_date = now
        period_label = "This Week"
        date_range = f"{start_date.strftime('%b %d')} - {(start_date + timedelta(days=6)).strftime('%b %d')}"
    elif period == "last_week":
        days_since_monday = now.weekday()
        this_week_start = (now - timedelta(days=days_since_monday)).replace(hour=0, minute=0, second=0, microsecond=0)
        start_date = this_week_start - timedelta(days=7)
        end_date = this_week_start - timedelta(seconds=1)
        period_label = "Last Week"
        date_range = f"{start_date.strftime('%b %d')} - {(start_date + timedelta(days=6)).strftime('%b %d')}"
    elif period == "this_month":
        start_date = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        end_date = now
        period_label = "This Month"
        date_range = start_date.strftime("%B %Y")
    elif period == "last_month":
        first_of_this_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        end_date = first_of_this_month - timedelta(seconds=1)
        start_date = end_date.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        period_label = "Last Month"
        date_range = start_date.strftime("%B %Y")
    elif period == "all_time":
        start_date = datetime(2020, 1, 1, tzinfo=est_tz)
        end_date = now
        period_label = "All Time"
        date_range = "All Time"
    else:
        days_since_monday = now.weekday()
        start_date = (now - timedelta(days=days_since_monday)).replace(hour=0, minute=0, second=0, microsecond=0)
        end_date = now
        period_label = "This Week"
        date_range = f"{start_date.strftime('%b %d')} - {(start_date + timedelta(days=6)).strftime('%b %d')}"
    
    # Convert to UTC for database query
    start_date_utc = start_date.astimezone(timezone.utc)
    end_date_utc = end_date.astimezone(timezone.utc)
    
    # Aggregate completed time logs for the period
    pipeline = [
        {"$match": {
            "duration_minutes": {"$gt": 0},
            "completed_at": {"$ne": None},
            "workflow_type": "production"
        }},
        {"$addFields": {
            "completed_date": {
                "$cond": {
                    "if": {"$eq": [{"$type": "$completed_at"}, "string"]},
                    "then": {"$dateFromString": {"dateString": "$completed_at"}},
                    "else": "$completed_at"
                }
            }
        }},
        {"$match": {
            "completed_date": {"$gte": start_date_utc, "$lte": end_date_utc}
        }},
        {"$group": {
            "_id": "$user_id",
            "total_minutes": {"$sum": "$duration_minutes"},
            "total_items": {"$sum": "$items_processed"},
            "session_count": {"$sum": 1}
        }}
    ]
    
    result = await db.time_logs.aggregate(pipeline).to_list(100)
    
    if not result:
        return {
            "total_hours": 0,
            "total_items": 0,
            "labor_cost": 0,
            "cost_per_item": 0,
            "avg_time_per_item": 0,
            "session_count": 0,
            "period": period,
            "period_label": period_label,
            "date_range": date_range
        }
    
    # Get hourly rates for all users
    user_ids = [r["_id"] for r in result if r["_id"]]
    user_rates = {}
    if user_ids:
        users_cursor = db.users.find(
            {"user_id": {"$in": user_ids}},
            {"_id": 0, "user_id": 1, "hourly_rate": 1}
        )
        async for u in users_cursor:
            user_rates[u["user_id"]] = u.get("hourly_rate", 15)
    
    # Calculate totals with user-specific rates
    total_minutes = 0
    total_items = 0
    session_count = 0
    labor_cost = 0
    
    for r in result:
        user_id = r["_id"]
        hourly_rate = user_rates.get(user_id, 15)
        user_hours = r["total_minutes"] / 60
        
        total_minutes += r["total_minutes"]
        total_items += r["total_items"]
        session_count += r["session_count"]
        labor_cost += user_hours * hourly_rate
    
    total_hours = total_minutes / 60
    cost_per_item = labor_cost / total_items if total_items > 0 else 0
    avg_time_per_item = total_minutes / total_items if total_items > 0 else 0
    
    return {
        "total_hours": round(total_hours, 2),
        "total_items": total_items,
        "labor_cost": round(labor_cost, 2),
        "cost_per_item": round(cost_per_item, 2),
        "avg_time_per_item": round(avg_time_per_item, 1),
        "session_count": session_count,
        "period": period,
        "period_label": period_label,
        "date_range": date_range
    }


@router.get("/timers/history")
async def get_production_timer_history(
    limit: int = 50,
    user: User = Depends(get_current_user)
):
    """Get timer history for production stages."""
    logs = await db.time_logs.find(
        {
            "completed_at": {"$ne": None},
            "workflow_type": "production"
        },
        {"_id": 0}
    ).sort("completed_at", -1).limit(limit).to_list(limit)
    
    return logs


# Admin/Manager endpoints for editing time entries
@router.get("/admin/time-entries")
async def get_all_production_time_entries(
    limit: int = 100,
    user: User = Depends(get_current_user)
):
    """Get all production time entries for admin review."""
    if user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Only admins and managers can view all time entries")
    
    time_logs = await db.time_logs.find(
        {
            "completed_at": {"$ne": None},
            "workflow_type": "production"
        },
        {"_id": 0}
    ).sort("completed_at", -1).limit(limit).to_list(limit)
    
    return time_logs


@router.put("/admin/time-entries/{log_id}")
async def update_production_time_entry(
    log_id: str,
    duration_minutes: Optional[float] = None,
    items_processed: Optional[int] = None,
    notes: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Update a production time entry."""
    if user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Only admins and managers can edit time entries")
    
    time_log = await db.time_logs.find_one({"log_id": log_id})
    if not time_log:
        raise HTTPException(status_code=404, detail="Time entry not found")
    
    update_data = {
        "edited_at": datetime.now(timezone.utc).isoformat(),
        "edited_by": user.user_id,
        "edited_by_name": user.name
    }
    
    if duration_minutes is not None:
        update_data["duration_minutes"] = duration_minutes
        update_data["original_duration_minutes"] = time_log.get("duration_minutes", 0)
    
    if items_processed is not None:
        update_data["items_processed"] = items_processed
    
    if notes is not None:
        update_data["admin_notes"] = notes
    
    await db.time_logs.update_one(
        {"log_id": log_id},
        {"$set": update_data}
    )
    
    return {"message": "Time entry updated", "log_id": log_id}


@router.post("/admin/time-entries/add")
async def add_manual_production_time_entry(
    user_id: str,
    user_name: str,
    stage_id: str,
    stage_name: str,
    duration_minutes: float,
    batch_id: Optional[str] = None,
    items_processed: int = 0,
    notes: Optional[str] = None,
    entry_date: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Add a manual production time entry."""
    if user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Only admins and managers can add manual time entries")
    
    now = datetime.now(timezone.utc)
    
    if entry_date:
        try:
            entry_datetime = datetime.fromisoformat(entry_date.replace('Z', '+00:00'))
        except ValueError:
            entry_datetime = now
    else:
        entry_datetime = now
    
    time_log = {
        "log_id": f"plog_{uuid.uuid4().hex[:12]}",
        "user_id": user_id,
        "user_name": user_name,
        "stage_id": stage_id,
        "stage_name": stage_name,
        "batch_id": batch_id,
        "workflow_type": "production",
        "action": "manual_entry",
        "started_at": entry_datetime.isoformat(),
        "completed_at": entry_datetime.isoformat(),
        "duration_minutes": duration_minutes,
        "items_processed": items_processed,
        "is_paused": False,
        "accumulated_minutes": 0,
        "manual_entry": True,
        "added_by": user.user_id,
        "added_by_name": user.name,
        "admin_notes": notes,
        "created_at": now.isoformat()
    }
    
    await db.time_logs.insert_one(time_log)
    
    return {"message": "Manual time entry added", "log_id": time_log["log_id"]}


@router.delete("/admin/time-entries/{log_id}")
async def delete_production_time_entry(
    log_id: str,
    user: User = Depends(get_current_user)
):
    """Delete a production time entry."""
    if user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Only admins and managers can delete time entries")
    
    result = await db.time_logs.delete_one({"log_id": log_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Time entry not found")
    
    return {"message": "Time entry deleted", "log_id": log_id}


@router.get("/reports/hours-by-user-date")
async def get_production_hours_by_user_date(
    period: str = "day",
    user: User = Depends(get_current_user)
):
    """Get production hours grouped by user and date."""
    # Use EST timezone for date calculations (user's timezone)
    from zoneinfo import ZoneInfo
    est_tz = ZoneInfo("America/New_York")
    now = datetime.now(est_tz)
    
    if period == "day":
        start_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == "week":
        days_since_monday = now.weekday()
        start_date = (now - timedelta(days=days_since_monday)).replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == "month":
        start_date = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    else:
        start_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
    
    # Convert to UTC for database query
    start_date_utc = start_date.astimezone(timezone.utc)
    
    time_logs = await db.time_logs.find({
        "completed_at": {"$gte": start_date_utc.isoformat()},
        "duration_minutes": {"$gt": 0},
        "workflow_type": "production"
    }, {"_id": 0}).to_list(5000)
    
    user_date_data = {}
    
    for log in time_logs:
        user_id = log["user_id"]
        user_name = log["user_name"]
        
        completed = log.get("completed_at", "")
        if completed:
            try:
                completed_dt = datetime.fromisoformat(completed.replace('Z', '+00:00'))
                # Convert to EST for date grouping
                completed_est = completed_dt.astimezone(est_tz)
                log_date = completed_est.strftime("%Y-%m-%d")
            except ValueError:
                continue
        else:
            continue
        
        key = f"{user_id}_{log_date}"
        
        if key not in user_date_data:
            user_date_data[key] = {
                "user_id": user_id,
                "user_name": user_name,
                "date": log_date,
                "total_minutes": 0,
                "total_items": 0,
                "entries": [],
                "exceeds_limit": False
            }
        
        user_date_data[key]["total_minutes"] += log.get("duration_minutes", 0)
        user_date_data[key]["total_items"] += log.get("items_processed", 0)
        user_date_data[key]["entries"].append({
            "log_id": log["log_id"],
            "stage_name": log["stage_name"],
            "batch_id": log.get("batch_id"),
            "duration_minutes": round(log.get("duration_minutes", 0), 1),
            "items_processed": log.get("items_processed", 0),
            "completed_at": log.get("completed_at")
        })
    
    # Get all unique user IDs to fetch their hourly rates
    user_ids = list(set(data["user_id"] for data in user_date_data.values()))
    user_rates = {}
    if user_ids:
        users_cursor = db.users.find(
            {"user_id": {"$in": user_ids}},
            {"_id": 0, "user_id": 1, "hourly_rate": 1}
        )
        async for u in users_cursor:
            user_rates[u["user_id"]] = u.get("hourly_rate", 15)  # Default $15/hr
    
    result = []
    for key, data in user_date_data.items():
        total_hours = data["total_minutes"] / 60
        hourly_rate = user_rates.get(data["user_id"], 15)  # Default $15/hr
        data["total_hours"] = round(total_hours, 2)
        data["hourly_rate"] = hourly_rate
        data["labor_cost"] = round(total_hours * hourly_rate, 2)
        data["exceeds_limit"] = total_hours > DAILY_HOURS_LIMIT
        data["entries"] = sorted(data["entries"], key=lambda x: x.get("completed_at") or "", reverse=True)
        result.append(data)
    
    result.sort(key=lambda x: (x["date"], x["user_name"]), reverse=True)
    
    return {
        "period": period,
        "start_date": start_date.strftime("%Y-%m-%d"),
        "data": result,
        "daily_limit_hours": DAILY_HOURS_LIMIT
    }


@router.get("/user/daily-hours-check")
async def check_production_user_daily_hours(user: User = Depends(get_current_user)):
    """Check if the current user has exceeded the daily hours limit for production."""
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    
    pipeline = [
        {"$match": {
            "user_id": user.user_id,
            "completed_at": {"$gte": today_start.isoformat()},
            "duration_minutes": {"$gt": 0},
            "workflow_type": "production"
        }},
        {"$group": {
            "_id": None,
            "total_minutes": {"$sum": "$duration_minutes"}
        }}
    ]
    
    result = await db.time_logs.aggregate(pipeline).to_list(1)
    
    total_minutes = result[0]["total_minutes"] if result else 0
    total_hours = total_minutes / 60
    
    # Check for active timer
    active_timer = await db.time_logs.find_one({
        "user_id": user.user_id,
        "completed_at": None,
        "workflow_type": "production"
    }, {"_id": 0})
    
    active_timer_minutes = 0
    if active_timer:
        started = datetime.fromisoformat(active_timer["started_at"].replace('Z', '+00:00'))
        now = datetime.now(timezone.utc)
        if not active_timer.get("is_paused"):
            active_timer_minutes = (now - started).total_seconds() / 60
        active_timer_minutes += active_timer.get("accumulated_minutes", 0)
    
    total_hours_with_active = (total_minutes + active_timer_minutes) / 60
    
    return {
        "user_id": user.user_id,
        "user_name": user.name,
        "date": today_start.strftime("%Y-%m-%d"),
        "completed_hours": round(total_hours, 2),
        "active_timer_hours": round(active_timer_minutes / 60, 2),
        "total_hours": round(total_hours_with_active, 2),
        "daily_limit": DAILY_HOURS_LIMIT,
        "exceeds_limit": total_hours_with_active > DAILY_HOURS_LIMIT,
        "remaining_hours": round(max(0, DAILY_HOURS_LIMIT - total_hours_with_active), 2)
    }


# Auto-stop inactive timers
@router.post("/timers/auto-stop-inactive")
async def auto_stop_inactive_production_timers(user: User = Depends(get_current_user)):
    """Automatically stop production timers that have been inactive for more than 4 hours."""
    four_hours_ago = datetime.now(timezone.utc) - timedelta(hours=4)
    
    inactive_timers = await db.time_logs.find({
        "completed_at": None,
        "is_paused": {"$ne": True},
        "started_at": {"$lt": four_hours_ago.isoformat()},
        "workflow_type": "production"
    }, {"_id": 0}).to_list(100)
    
    stopped_count = 0
    for timer in inactive_timers:
        started = datetime.fromisoformat(timer["started_at"].replace('Z', '+00:00'))
        now = datetime.now(timezone.utc)
        
        accumulated = timer.get("accumulated_minutes", 0)
        session_minutes = min((now - started).total_seconds() / 60, 240)
        total_minutes = accumulated + session_minutes
        
        await db.time_logs.update_one(
            {"log_id": timer["log_id"]},
            {"$set": {
                "completed_at": now.isoformat(),
                "duration_minutes": total_minutes,
                "auto_stopped": True,
                "auto_stop_reason": "Inactive for more than 4 hours"
            }}
        )
        stopped_count += 1
    
    return {"message": f"Auto-stopped {stopped_count} inactive timers", "stopped_count": stopped_count}
