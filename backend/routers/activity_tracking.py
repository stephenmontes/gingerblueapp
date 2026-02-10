"""
User Activity Tracking Router
Tracks user login sessions and calculates productivity metrics
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from datetime import datetime, timezone, timedelta
from typing import Optional
from zoneinfo import ZoneInfo
import uuid

from database import db
from models.user import User
from dependencies import get_current_user

router = APIRouter(prefix="/activity", tags=["activity"])

EST_TZ = ZoneInfo("America/New_York")


@router.post("/heartbeat")
async def record_heartbeat(user: User = Depends(get_current_user)):
    """
    Record a heartbeat to track active session time.
    Frontend should call this every 1 minute while user is active.
    """
    now = datetime.now(timezone.utc)
    today_est = now.astimezone(EST_TZ).strftime("%Y-%m-%d")
    
    # Find or create today's activity record for this user
    activity_key = f"{user.user_id}_{today_est}"
    
    existing = await db.user_activity.find_one({"activity_key": activity_key})
    
    if existing:
        # Update last_seen and increment active minutes
        last_seen = existing.get("last_heartbeat")
        minutes_to_add = 1  # Each heartbeat = 1 minute
        
        # If last heartbeat was more than 5 minutes ago, don't add gap time
        if last_seen:
            try:
                last_dt = datetime.fromisoformat(last_seen.replace('Z', '+00:00'))
                gap = (now - last_dt).total_seconds() / 60
                if gap > 5:
                    minutes_to_add = 1  # Only count this minute, not the gap
            except (ValueError, TypeError):
                pass
        
        await db.user_activity.update_one(
            {"activity_key": activity_key},
            {
                "$set": {"last_heartbeat": now.isoformat()},
                "$inc": {"active_minutes": minutes_to_add}
            }
        )
    else:
        # Create new activity record for today
        await db.user_activity.insert_one({
            "activity_key": activity_key,
            "user_id": user.user_id,
            "user_name": user.name,
            "date": today_est,
            "first_seen": now.isoformat(),
            "last_heartbeat": now.isoformat(),
            "active_minutes": 1,
            "created_at": now.isoformat()
        })
    
    return {"status": "ok", "date": today_est}


@router.post("/session-start")
async def record_session_start(user: User = Depends(get_current_user)):
    """Record when a user starts a session (logs in or opens the app)."""
    now = datetime.now(timezone.utc)
    today_est = now.astimezone(EST_TZ).strftime("%Y-%m-%d")
    activity_key = f"{user.user_id}_{today_est}"
    
    existing = await db.user_activity.find_one({"activity_key": activity_key})
    
    if not existing:
        await db.user_activity.insert_one({
            "activity_key": activity_key,
            "user_id": user.user_id,
            "user_name": user.name,
            "date": today_est,
            "first_seen": now.isoformat(),
            "last_heartbeat": now.isoformat(),
            "active_minutes": 0,
            "created_at": now.isoformat()
        })
    
    return {"status": "ok", "date": today_est}


@router.get("/productivity-report")
async def get_productivity_report(
    period: str = Query("week", description="day, week, month, or custom"),
    start_date: Optional[str] = Query(None, description="Start date for custom range (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date for custom range (YYYY-MM-DD)"),
    user: User = Depends(get_current_user)
):
    """
    Get productivity report showing logged-in time vs tracked work time.
    Admin/Manager only.
    """
    if user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    now = datetime.now(EST_TZ)
    
    # Calculate date range
    if period == "day":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        end = now
        period_label = "Today"
    elif period == "week":
        days_since_monday = now.weekday()
        start = (now - timedelta(days=days_since_monday)).replace(hour=0, minute=0, second=0, microsecond=0)
        end = now
        period_label = "This Week"
    elif period == "month":
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        end = now
        period_label = "This Month"
    elif period == "custom" and start_date and end_date:
        try:
            start = datetime.strptime(start_date, "%Y-%m-%d").replace(tzinfo=EST_TZ)
            end = datetime.strptime(end_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59, tzinfo=EST_TZ)
            period_label = f"{start_date} to {end_date}"
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    else:
        # Default to week
        days_since_monday = now.weekday()
        start = (now - timedelta(days=days_since_monday)).replace(hour=0, minute=0, second=0, microsecond=0)
        end = now
        period_label = "This Week"
    
    start_str = start.strftime("%Y-%m-%d")
    end_str = end.strftime("%Y-%m-%d")
    
    # Get activity records (logged-in time)
    activity_records = await db.user_activity.find({
        "date": {"$gte": start_str, "$lte": end_str}
    }, {"_id": 0}).to_list(5000)
    
    # Get tracked time from both fulfillment and production timers
    start_utc = start.astimezone(timezone.utc)
    end_utc = end.astimezone(timezone.utc)
    
    # Fulfillment time logs
    fulfillment_logs = await db.fulfillment_time_logs.find({
        "completed_at": {"$gte": start_utc.isoformat(), "$lte": end_utc.isoformat()},
        "duration_minutes": {"$gt": 0}
    }, {"_id": 0, "user_id": 1, "user_name": 1, "duration_minutes": 1, "completed_at": 1}).to_list(10000)
    
    # Production time logs
    production_logs = await db.time_logs.find({
        "completed_at": {"$gte": start_utc.isoformat(), "$lte": end_utc.isoformat()},
        "duration_minutes": {"$gt": 0},
        "workflow_type": "production"
    }, {"_id": 0, "user_id": 1, "user_name": 1, "duration_minutes": 1, "completed_at": 1}).to_list(10000)
    
    # Combine and group by user and date
    user_date_data = {}
    
    # Process activity records (logged-in time)
    for record in activity_records:
        key = f"{record['user_id']}_{record['date']}"
        if key not in user_date_data:
            user_date_data[key] = {
                "user_id": record["user_id"],
                "user_name": record["user_name"],
                "date": record["date"],
                "logged_in_minutes": 0,
                "tracked_minutes": 0
            }
        user_date_data[key]["logged_in_minutes"] += record.get("active_minutes", 0)
    
    # Process fulfillment time logs (tracked time)
    for log in fulfillment_logs:
        completed = log.get("completed_at", "")
        if completed:
            try:
                completed_dt = datetime.fromisoformat(completed.replace('Z', '+00:00'))
                log_date = completed_dt.astimezone(EST_TZ).strftime("%Y-%m-%d")
                key = f"{log['user_id']}_{log_date}"
                
                if key not in user_date_data:
                    user_date_data[key] = {
                        "user_id": log["user_id"],
                        "user_name": log["user_name"],
                        "date": log_date,
                        "logged_in_minutes": 0,
                        "tracked_minutes": 0
                    }
                user_date_data[key]["tracked_minutes"] += log.get("duration_minutes", 0)
            except:
                pass
    
    # Process production time logs (tracked time)
    for log in production_logs:
        completed = log.get("completed_at", "")
        if completed:
            try:
                completed_dt = datetime.fromisoformat(completed.replace('Z', '+00:00'))
                log_date = completed_dt.astimezone(EST_TZ).strftime("%Y-%m-%d")
                key = f"{log['user_id']}_{log_date}"
                
                if key not in user_date_data:
                    user_date_data[key] = {
                        "user_id": log["user_id"],
                        "user_name": log["user_name"],
                        "date": log_date,
                        "logged_in_minutes": 0,
                        "tracked_minutes": 0
                    }
                user_date_data[key]["tracked_minutes"] += log.get("duration_minutes", 0)
            except:
                pass
    
    # Calculate productivity for each record
    result = []
    total_logged_in = 0
    total_tracked = 0
    
    for key, data in user_date_data.items():
        logged_in_hours = round(data["logged_in_minutes"] / 60, 2)
        tracked_hours = round(data["tracked_minutes"] / 60, 2)
        
        # Calculate productivity percentage
        if data["logged_in_minutes"] > 0:
            productivity = round((data["tracked_minutes"] / data["logged_in_minutes"]) * 100, 1)
        else:
            # If no logged-in time recorded but has tracked time, show 100%
            productivity = 100.0 if data["tracked_minutes"] > 0 else 0.0
        
        result.append({
            "user_id": data["user_id"],
            "user_name": data["user_name"],
            "date": data["date"],
            "logged_in_hours": logged_in_hours,
            "tracked_hours": tracked_hours,
            "productivity_percent": productivity
        })
        
        total_logged_in += data["logged_in_minutes"]
        total_tracked += data["tracked_minutes"]
    
    # Sort by date desc, then user name
    result.sort(key=lambda x: (x["date"], x["user_name"]), reverse=True)
    
    # Calculate averages
    avg_logged_in = round((total_logged_in / 60) / len(result), 2) if result else 0
    avg_tracked = round((total_tracked / 60) / len(result), 2) if result else 0
    avg_productivity = round((total_tracked / total_logged_in) * 100, 1) if total_logged_in > 0 else 0
    
    return {
        "period": period,
        "period_label": period_label,
        "start_date": start_str,
        "end_date": end_str,
        "data": result,
        "summary": {
            "total_logged_in_hours": round(total_logged_in / 60, 2),
            "total_tracked_hours": round(total_tracked / 60, 2),
            "avg_logged_in_hours_per_entry": avg_logged_in,
            "avg_tracked_hours_per_entry": avg_tracked,
            "overall_productivity_percent": avg_productivity,
            "total_entries": len(result)
        }
    }


@router.get("/user-summary/{user_id}")
async def get_user_activity_summary(
    user_id: str,
    period: str = "week",
    user: User = Depends(get_current_user)
):
    """Get activity summary for a specific user."""
    if user.role not in ["admin", "manager"] and user.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    now = datetime.now(EST_TZ)
    
    if period == "day":
        start_str = now.strftime("%Y-%m-%d")
        end_str = start_str
    elif period == "week":
        days_since_monday = now.weekday()
        start = now - timedelta(days=days_since_monday)
        start_str = start.strftime("%Y-%m-%d")
        end_str = now.strftime("%Y-%m-%d")
    elif period == "month":
        start_str = now.replace(day=1).strftime("%Y-%m-%d")
        end_str = now.strftime("%Y-%m-%d")
    else:
        start_str = now.strftime("%Y-%m-%d")
        end_str = start_str
    
    records = await db.user_activity.find({
        "user_id": user_id,
        "date": {"$gte": start_str, "$lte": end_str}
    }, {"_id": 0}).to_list(100)
    
    total_minutes = sum(r.get("active_minutes", 0) for r in records)
    
    return {
        "user_id": user_id,
        "period": period,
        "total_active_hours": round(total_minutes / 60, 2),
        "days_active": len(records),
        "daily_breakdown": [{
            "date": r["date"],
            "active_hours": round(r.get("active_minutes", 0) / 60, 2),
            "first_seen": r.get("first_seen"),
            "last_seen": r.get("last_heartbeat")
        } for r in sorted(records, key=lambda x: x["date"], reverse=True)]
    }
