from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timezone, timedelta
from typing import Optional
import uuid

from database import db
from models.user import User
from dependencies import get_current_user

router = APIRouter(prefix="/fulfillment", tags=["fulfillment-timers"])

@router.post("/stages/{stage_id}/start-timer")
async def start_fulfillment_timer(
    stage_id: str, 
    order_id: Optional[str] = None,
    order_number: Optional[str] = None,
    fulfillment_batch_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Start time tracking for a user working on a fulfillment stage."""
    stage = await db.fulfillment_stages.find_one({"stage_id": stage_id}, {"_id": 0})
    if not stage:
        raise HTTPException(status_code=404, detail="Stage not found")
    
    # Check for any active fulfillment stage timer
    any_active = await db.fulfillment_time_logs.find_one({
        "user_id": user.user_id,
        "completed_at": None
    }, {"_id": 0})
    
    if any_active:
        raise HTTPException(
            status_code=400, 
            detail=f"You already have an active timer for {any_active.get('stage_name', 'another stage')}. Stop it first."
        )
    
    # Also check for active batch timers (from fulfillment_batches.active_workers)
    batch_with_user = await db.fulfillment_batches.find_one({
        "active_workers.user_id": user.user_id
    }, {"_id": 0, "batch_name": 1, "fulfillment_batch_id": 1})
    
    if batch_with_user:
        raise HTTPException(
            status_code=400,
            detail=f"You are currently working on batch '{batch_with_user.get('batch_name', 'Unknown')}'. Stop that timer first."
        )
    
    # Get batch_id from the order if order_id is provided, or use fulfillment_batch_id directly
    batch_id = fulfillment_batch_id
    if order_id and not batch_id:
        order = await db.fulfillment_orders.find_one(
            {"order_id": order_id}, 
            {"_id": 0, "batch_id": 1, "fulfillment_batch_id": 1}
        )
        if order:
            batch_id = order.get("fulfillment_batch_id") or order.get("batch_id")
    
    now = datetime.now(timezone.utc)
    
    time_log = {
        "log_id": f"flog_{uuid.uuid4().hex[:12]}",
        "user_id": user.user_id,
        "user_name": user.name,
        "stage_id": stage_id,
        "stage_name": stage["name"],
        "order_id": order_id,
        "order_number": order_number,
        "batch_id": batch_id,
        "fulfillment_batch_id": fulfillment_batch_id,
        "workflow_type": "fulfillment",
        "action": "started",
        "started_at": now.isoformat(),
        "orders_processed": 0,
        "items_processed": 0,
        "is_paused": False,
        "accumulated_minutes": 0,
        "pause_events": [],
        "created_at": now.isoformat()
    }
    await db.fulfillment_time_logs.insert_one(time_log)
    
    return {
        "message": f"Timer started for {stage['name']}",
        "log_id": time_log["log_id"],
        "stage_id": stage_id,
        "stage_name": stage["name"],
        "order_id": order_id,
        "order_number": order_number,
        "batch_id": batch_id,
        "fulfillment_batch_id": fulfillment_batch_id,
        "user_name": user.name,
        "started_at": now.isoformat()
    }


@router.post("/stages/{stage_id}/stop-timer")
async def stop_fulfillment_timer(
    stage_id: str, 
    orders_processed: int = 0,
    items_processed: int = 0,
    user: User = Depends(get_current_user)
):
    """Stop time tracking for a user's fulfillment stage work."""
    # First try to find timer for this specific stage
    active_timer = await db.fulfillment_time_logs.find_one({
        "user_id": user.user_id,
        "stage_id": stage_id,
        "completed_at": None
    }, {"_id": 0})
    
    # If not found for this stage, try to find any active timer for this user
    if not active_timer:
        active_timer = await db.fulfillment_time_logs.find_one({
            "user_id": user.user_id,
            "completed_at": None
        }, {"_id": 0})
        
        if active_timer:
            # Found timer but for different stage - still stop it
            print(f"Timer found for different stage: {active_timer.get('stage_id')} vs requested: {stage_id}")
    
    if not active_timer:
        raise HTTPException(status_code=400, detail="No active timer found")
    
    now = datetime.now(timezone.utc)
    accumulated = active_timer.get("accumulated_minutes", 0)
    
    if active_timer.get("is_paused"):
        duration_minutes = accumulated
    else:
        started_at = datetime.fromisoformat(active_timer["started_at"].replace('Z', '+00:00'))
        if started_at.tzinfo is None:
            started_at = started_at.replace(tzinfo=timezone.utc)
        current_session = (now - started_at).total_seconds() / 60
        duration_minutes = accumulated + current_session
    
    await db.fulfillment_time_logs.update_one(
        {"log_id": active_timer["log_id"]},
        {"$set": {
            "completed_at": now.isoformat(),
            "duration_minutes": round(duration_minutes, 2),
            "orders_processed": orders_processed,
            "items_processed": items_processed,
            "action": "stopped",
            "is_paused": False
        }}
    )
    
    return {
        "message": "Timer stopped",
        "stage_id": active_timer.get("stage_id"),
        "stage_name": active_timer.get("stage_name"),
        "duration_minutes": round(duration_minutes, 2),
        "orders_processed": orders_processed,
        "items_processed": items_processed
    }


@router.post("/stages/{stage_id}/pause-timer")
async def pause_fulfillment_timer(stage_id: str, user: User = Depends(get_current_user)):
    """Pause the fulfillment timer."""
    active_timer = await db.fulfillment_time_logs.find_one({
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
    new_accumulated = active_timer.get("accumulated_minutes", 0) + current_session
    
    pause_events = active_timer.get("pause_events", [])
    pause_events.append({"paused_at": now.isoformat()})
    
    await db.fulfillment_time_logs.update_one(
        {"log_id": active_timer["log_id"]},
        {"$set": {
            "is_paused": True,
            "accumulated_minutes": round(new_accumulated, 2),
            "pause_events": pause_events
        }}
    )
    
    return {"message": "Timer paused", "accumulated_minutes": round(new_accumulated, 2)}


@router.post("/stages/{stage_id}/resume-timer")
async def resume_fulfillment_timer(stage_id: str, user: User = Depends(get_current_user)):
    """Resume a paused fulfillment timer."""
    active_timer = await db.fulfillment_time_logs.find_one({
        "user_id": user.user_id,
        "stage_id": stage_id,
        "completed_at": None
    }, {"_id": 0})
    
    if not active_timer:
        raise HTTPException(status_code=400, detail="No active timer for this stage")
    
    if not active_timer.get("is_paused"):
        raise HTTPException(status_code=400, detail="Timer is not paused")
    
    now = datetime.now(timezone.utc)
    
    pause_events = active_timer.get("pause_events", [])
    if pause_events and "resumed_at" not in pause_events[-1]:
        pause_events[-1]["resumed_at"] = now.isoformat()
    
    await db.fulfillment_time_logs.update_one(
        {"log_id": active_timer["log_id"]},
        {"$set": {
            "is_paused": False,
            "started_at": now.isoformat(),
            "pause_events": pause_events
        }}
    )
    
    return {"message": "Timer resumed", "started_at": now.isoformat()}


@router.get("/user/active-timer")
async def get_user_active_fulfillment_timer(user: User = Depends(get_current_user)):
    """Get user's active fulfillment timer if any (checks both stage and batch timers)."""
    now = datetime.now(timezone.utc)
    
    # Check for active stage timer
    active_stage = await db.fulfillment_time_logs.find_one({
        "user_id": user.user_id,
        "completed_at": None
    }, {"_id": 0})
    
    if active_stage:
        return [active_stage]
    
    # Check for active batch timer
    batch_with_user = await db.fulfillment_batches.find_one({
        "active_workers.user_id": user.user_id
    }, {"_id": 0})
    
    if batch_with_user:
        # Find this user's worker entry
        for worker in batch_with_user.get("active_workers", []):
            if worker.get("user_id") == user.user_id:
                # Calculate elapsed time
                elapsed_minutes = worker.get("accumulated_minutes", 0)
                if not worker.get("is_paused") and worker.get("started_at"):
                    started = datetime.fromisoformat(worker["started_at"].replace('Z', '+00:00'))
                    elapsed_minutes += (now - started).total_seconds() / 60
                
                # Return in similar format to stage timer
                return [{
                    "log_id": f"batch_{batch_with_user['fulfillment_batch_id']}",
                    "user_id": user.user_id,
                    "user_name": worker.get("user_name"),
                    "stage_id": batch_with_user.get("current_stage_id"),
                    "stage_name": batch_with_user.get("current_stage_name") or batch_with_user.get("batch_name"),
                    "batch_id": batch_with_user.get("fulfillment_batch_id"),
                    "fulfillment_batch_id": batch_with_user.get("fulfillment_batch_id"),
                    "batch_name": batch_with_user.get("batch_name"),
                    "workflow_type": "fulfillment_batch",
                    "started_at": worker.get("original_started_at") or worker.get("started_at"),
                    "is_paused": worker.get("is_paused", False),
                    "accumulated_minutes": worker.get("accumulated_minutes", 0),
                    "elapsed_minutes": round(elapsed_minutes, 1),
                    "items_processed": worker.get("items_processed", 0)
                }]
    
    return []


@router.get("/stages/{stage_id}/active-workers")
async def get_stage_active_workers(stage_id: str, user: User = Depends(get_current_user)):
    """Get list of users currently working on a fulfillment stage."""
    active_timers = await db.fulfillment_time_logs.find({
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
            "order_id": timer.get("order_id"),
            "order_number": timer.get("order_number"),
            "elapsed_minutes": round(elapsed_minutes, 1)
        })
    
    return workers


@router.get("/stats/user-kpis")
async def get_fulfillment_user_kpis(
    stage_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get the current user's KPIs for fulfillment stages."""
    match_query = {
        "user_id": user.user_id,
        "duration_minutes": {"$gt": 0},
        "completed_at": {"$ne": None}
    }
    if stage_id:
        match_query["stage_id"] = stage_id
    
    pipeline = [
        {"$match": match_query},
        {"$group": {
            "_id": {"stage_id": "$stage_id", "stage_name": "$stage_name"},
            "total_minutes": {"$sum": "$duration_minutes"},
            "total_orders": {"$sum": "$orders_processed"},
            "total_items": {"$sum": "$items_processed"},
            "session_count": {"$sum": 1}
        }},
        {"$project": {
            "_id": 0,
            "stage_id": "$_id.stage_id",
            "stage_name": "$_id.stage_name",
            "total_hours": {"$round": [{"$divide": ["$total_minutes", 60]}, 2]},
            "total_minutes": {"$round": ["$total_minutes", 1]},
            "total_orders": 1,
            "total_items": 1,
            "session_count": 1,
            "orders_per_hour": {"$cond": {
                "if": {"$gt": ["$total_minutes", 0]},
                "then": {"$round": [{"$multiply": [{"$divide": ["$total_orders", "$total_minutes"]}, 60]}, 1]},
                "else": 0
            }}
        }},
        {"$sort": {"total_orders": -1}}
    ]
    
    user_stats = await db.fulfillment_time_logs.aggregate(pipeline).to_list(100)
    
    total_hours = sum(s["total_hours"] for s in user_stats)
    total_orders = sum(s["total_orders"] for s in user_stats)
    total_sessions = sum(s["session_count"] for s in user_stats)
    
    return {
        "user_id": user.user_id,
        "user_name": user.name,
        "stages": user_stats,
        "totals": {
            "total_hours": round(total_hours, 2),
            "total_orders": total_orders,
            "total_sessions": total_sessions
        }
    }


@router.get("/stats/stage-kpis")
async def get_fulfillment_stage_kpis(user: User = Depends(get_current_user)):
    """Get KPIs for all fulfillment stages by user."""
    stages = await db.fulfillment_stages.find({}, {"_id": 0}).sort("order", 1).to_list(100)
    
    result = []
    for stage in stages:
        pipeline = [
            {"$match": {
                "stage_id": stage["stage_id"],
                "duration_minutes": {"$gt": 0},
                "completed_at": {"$ne": None}
            }},
            {"$group": {
                "_id": {"user_id": "$user_id", "user_name": "$user_name"},
                "total_minutes": {"$sum": "$duration_minutes"},
                "total_orders": {"$sum": "$orders_processed"},
                "total_items": {"$sum": "$items_processed"},
                "session_count": {"$sum": 1}
            }},
            {"$project": {
                "_id": 0,
                "user_id": "$_id.user_id",
                "user_name": "$_id.user_name",
                "total_hours": {"$round": [{"$divide": ["$total_minutes", 60]}, 2]},
                "total_orders": 1,
                "total_items": 1,
                "session_count": 1,
                "orders_per_hour": {"$cond": {
                    "if": {"$gt": ["$total_minutes", 0]},
                    "then": {"$round": [{"$multiply": [{"$divide": ["$total_orders", "$total_minutes"]}, 60]}, 1]},
                    "else": 0
                }}
            }},
            {"$sort": {"total_orders": -1}}
        ]
        
        users = await db.fulfillment_time_logs.aggregate(pipeline).to_list(100)
        
        stage_total_hours = sum(u["total_hours"] for u in users)
        stage_total_orders = sum(u["total_orders"] for u in users)
        
        result.append({
            "stage_id": stage["stage_id"],
            "stage_name": stage["name"],
            "color": stage.get("color"),
            "users": users,
            "totals": {
                "total_hours": round(stage_total_hours, 2),
                "total_orders": stage_total_orders,
                "worker_count": len(users)
            }
        })
    
    return result


@router.get("/timers/history")
async def get_fulfillment_timer_history(
    limit: int = 50,
    user: User = Depends(get_current_user)
):
    """Get timer history for fulfillment stages."""
    logs = await db.fulfillment_time_logs.find(
        {"completed_at": {"$ne": None}},
        {"_id": 0}
    ).sort("completed_at", -1).limit(limit).to_list(limit)
    
    return logs


@router.get("/user/timer-history")
async def get_user_timer_history(
    period: str = "today",
    user: User = Depends(get_current_user)
):
    """Get the current user's timer history for a specified period."""
    now = datetime.now(timezone.utc)
    
    # Calculate date range based on period
    if period == "today":
        start_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
        period_label = "Today"
    elif period == "yesterday":
        start_date = (now - timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
        now = start_date.replace(hour=23, minute=59, second=59)
        period_label = "Yesterday"
    elif period == "this_week":
        days_since_monday = now.weekday()
        start_date = (now - timedelta(days=days_since_monday)).replace(hour=0, minute=0, second=0, microsecond=0)
        period_label = "This Week"
    else:
        start_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
        period_label = "Today"
    
    # Fetch completed sessions
    logs = await db.fulfillment_time_logs.find({
        "user_id": user.user_id,
        "completed_at": {"$ne": None, "$gte": start_date.isoformat()}
    }, {"_id": 0}).sort("completed_at", -1).to_list(100)
    
    # Calculate totals
    total_minutes = sum(log.get("duration_minutes", 0) for log in logs)
    total_orders = sum(log.get("orders_processed", 0) for log in logs)
    total_items = sum(log.get("items_processed", 0) for log in logs)
    
    # Group by stage
    stage_totals = {}
    for log in logs:
        stage_id = log.get("stage_id", "unknown")
        if stage_id not in stage_totals:
            stage_totals[stage_id] = {
                "stage_id": stage_id,
                "stage_name": log.get("stage_name", "Unknown"),
                "total_minutes": 0,
                "session_count": 0
            }
        stage_totals[stage_id]["total_minutes"] += log.get("duration_minutes", 0)
        stage_totals[stage_id]["session_count"] += 1
    
    # Check for active timer
    active_timer = await db.fulfillment_time_logs.find_one({
        "user_id": user.user_id,
        "completed_at": None
    }, {"_id": 0})
    
    active_minutes = 0
    if active_timer and not active_timer.get("is_paused"):
        started = datetime.fromisoformat(active_timer["started_at"].replace('Z', '+00:00'))
        active_minutes = (now - started).total_seconds() / 60
        active_minutes += active_timer.get("accumulated_minutes", 0)
    elif active_timer:
        active_minutes = active_timer.get("accumulated_minutes", 0)
    
    return {
        "period": period,
        "period_label": period_label,
        "user_id": user.user_id,
        "user_name": user.name,
        "sessions": [{
            "log_id": log["log_id"],
            "stage_id": log.get("stage_id"),
            "stage_name": log.get("stage_name"),
            "order_number": log.get("order_number"),
            "batch_id": log.get("batch_id") or log.get("fulfillment_batch_id"),
            "started_at": log.get("started_at"),
            "completed_at": log.get("completed_at"),
            "duration_minutes": round(log.get("duration_minutes", 0), 1),
            "orders_processed": log.get("orders_processed", 0),
            "items_processed": log.get("items_processed", 0),
            "is_manual": log.get("manual_entry", False)
        } for log in logs],
        "active_timer": {
            "stage_name": active_timer.get("stage_name"),
            "started_at": active_timer.get("started_at"),
            "is_paused": active_timer.get("is_paused", False),
            "current_minutes": round(active_minutes, 1)
        } if active_timer else None,
        "totals": {
            "total_hours": round(total_minutes / 60, 2),
            "total_minutes": round(total_minutes, 1),
            "total_orders": total_orders,
            "total_items": total_items,
            "session_count": len(logs),
            "active_minutes": round(active_minutes, 1)
        },
        "by_stage": list(stage_totals.values())
    }


@router.get("/stats/overall-kpis")
async def get_fulfillment_overall_kpis(
    period: str = "this_week",
    user: User = Depends(get_current_user)
):
    """Get KPIs for the fulfillment workflow for a specified time period."""
    now = datetime.now(timezone.utc)
    
    # Calculate date range based on period
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
        start_date = datetime(2020, 1, 1, tzinfo=timezone.utc)
        end_date = now
        period_label = "All Time"
        date_range = "All Time"
    else:
        # Default to this week
        days_since_monday = now.weekday()
        start_date = (now - timedelta(days=days_since_monday)).replace(hour=0, minute=0, second=0, microsecond=0)
        end_date = now
        period_label = "This Week"
        date_range = f"{start_date.strftime('%b %d')} - {(start_date + timedelta(days=6)).strftime('%b %d')}"
    
    # Aggregate completed time logs for the period
    pipeline = [
        {"$match": {
            "duration_minutes": {"$gt": 0},
            "completed_at": {"$ne": None, "$gte": start_date.isoformat(), "$lte": end_date.isoformat()}
        }},
        {"$group": {
            "_id": None,
            "total_minutes": {"$sum": "$duration_minutes"},
            "total_orders": {"$sum": "$orders_processed"},
            "total_items": {"$sum": "$items_processed"},
            "session_count": {"$sum": 1}
        }}
    ]
    
    result = await db.fulfillment_time_logs.aggregate(pipeline).to_list(1)
    
    if not result:
        return {
            "total_hours": 0,
            "total_orders": 0,
            "total_items": 0,
            "labor_cost": 0,
            "cost_per_order": 0,
            "cost_per_item": 0,
            "avg_time_per_order": 0,
            "session_count": 0,
            "period": period,
            "period_label": period_label,
            "date_range": date_range
        }
    
    data = result[0]
    total_hours = data["total_minutes"] / 60
    total_orders = data["total_orders"]
    total_items = data["total_items"]
    
    # Calculate costs ($30/hour rate)
    labor_cost = total_hours * 30
    cost_per_order = labor_cost / total_orders if total_orders > 0 else 0
    cost_per_item = labor_cost / total_items if total_items > 0 else 0
    avg_time_per_order = data["total_minutes"] / total_orders if total_orders > 0 else 0
    
    return {
        "total_hours": round(total_hours, 2),
        "total_orders": total_orders,
        "total_items": total_items,
        "labor_cost": round(labor_cost, 2),
        "cost_per_order": round(cost_per_order, 2),
        "cost_per_item": round(cost_per_item, 2),
        "avg_time_per_order": round(avg_time_per_order, 1),
        "session_count": data["session_count"],
        "period": period,
        "period_label": period_label,
        "date_range": date_range
    }


@router.get("/reports/order-kpis")
async def get_order_kpis_report(user: User = Depends(get_current_user)):
    """Get KPI report for individual orders with time breakdown by user and stage."""
    
    # Get all time logs with order_id
    time_logs = await db.fulfillment_time_logs.find(
        {
            "order_id": {"$ne": None},
            "duration_minutes": {"$gt": 0},
            "completed_at": {"$ne": None}
        },
        {"_id": 0}
    ).to_list(1000)
    
    # Group by order_id
    order_data = {}
    for log in time_logs:
        order_id = log["order_id"]
        if order_id not in order_data:
            order_data[order_id] = {
                "order_id": order_id,
                "order_number": log.get("order_number", order_id[:8] if order_id else "—"),
                "total_minutes": 0,
                "total_items": 0,
                "stages": {},
                "users": {},
                "time_entries": []
            }
        
        order_data[order_id]["total_minutes"] += log.get("duration_minutes", 0)
        order_data[order_id]["total_items"] += log.get("items_processed", 0)
        
        # Track by stage
        stage_id = log["stage_id"]
        if stage_id not in order_data[order_id]["stages"]:
            order_data[order_id]["stages"][stage_id] = {
                "stage_id": stage_id,
                "stage_name": log["stage_name"],
                "minutes": 0,
                "users": []
            }
        order_data[order_id]["stages"][stage_id]["minutes"] += log.get("duration_minutes", 0)
        
        # Track by user
        user_id = log["user_id"]
        if user_id not in order_data[order_id]["users"]:
            order_data[order_id]["users"][user_id] = {
                "user_id": user_id,
                "user_name": log["user_name"],
                "minutes": 0
            }
        order_data[order_id]["users"][user_id]["minutes"] += log.get("duration_minutes", 0)
        
        # Add time entry
        order_data[order_id]["time_entries"].append({
            "log_id": log["log_id"],
            "user_name": log["user_name"],
            "stage_name": log["stage_name"],
            "duration_minutes": round(log.get("duration_minutes", 0), 1),
            "items_processed": log.get("items_processed", 0),
            "completed_at": log.get("completed_at")
        })
    
    # Now get order details and calculate costs
    result = []
    for order_id, data in order_data.items():
        # Get order details
        order = await db.orders.find_one({"order_id": order_id}, {"_id": 0})
        
        total_hours = data["total_minutes"] / 60
        total_items = data["total_items"] or 1
        labor_cost = total_hours * 30
        cost_per_item = labor_cost / total_items if total_items > 0 else 0
        
        result.append({
            "order_id": order_id,
            "order_number": data["order_number"] or (order.get("order_number") if order else order_id[:8]),
            "customer_name": order.get("customer_name") if order else "—",
            "total_minutes": round(data["total_minutes"], 1),
            "total_hours": round(total_hours, 2),
            "total_items": total_items,
            "labor_cost": round(labor_cost, 2),
            "cost_per_item": round(cost_per_item, 2),
            "stages": list(data["stages"].values()),
            "users": list(data["users"].values()),
            "time_entries": sorted(data["time_entries"], key=lambda x: x.get("completed_at") or "", reverse=True)
        })
    
    # Sort by most recent activity
    result.sort(key=lambda x: x["time_entries"][0]["completed_at"] if x["time_entries"] else "", reverse=True)
    
    return result


@router.get("/reports/order/{order_id}/time-entries")
async def get_order_time_entries(order_id: str, user: User = Depends(get_current_user)):
    """Get all time entries for a specific order."""
    
    time_logs = await db.fulfillment_time_logs.find(
        {
            "order_id": order_id,
            "completed_at": {"$ne": None}
        },
        {"_id": 0}
    ).sort("completed_at", -1).to_list(100)
    
    # Get order details
    order = await db.orders.find_one({"order_id": order_id}, {"_id": 0})
    
    total_minutes = sum(log.get("duration_minutes", 0) for log in time_logs)
    total_items = sum(log.get("items_processed", 0) for log in time_logs) or 1
    total_hours = total_minutes / 60
    labor_cost = total_hours * 30
    
    return {
        "order_id": order_id,
        "order_number": order.get("order_number") if order else order_id[:8],
        "customer_name": order.get("customer_name") if order else "—",
        "total_minutes": round(total_minutes, 1),
        "total_hours": round(total_hours, 2),
        "total_items": total_items,
        "labor_cost": round(labor_cost, 2),
        "cost_per_item": round(labor_cost / total_items, 2) if total_items > 0 else 0,
        "time_entries": [{
            "log_id": log["log_id"],
            "user_id": log["user_id"],
            "user_name": log["user_name"],
            "stage_id": log["stage_id"],
            "stage_name": log["stage_name"],
            "duration_minutes": round(log.get("duration_minutes", 0), 1),
            "items_processed": log.get("items_processed", 0),
            "started_at": log.get("started_at"),
            "completed_at": log.get("completed_at")
        } for log in time_logs]
    }



# Auto-stop inactive timers (called periodically or on page load)
@router.post("/timers/auto-stop-inactive")
async def auto_stop_inactive_timers(user: User = Depends(get_current_user)):
    """Automatically stop timers that have been inactive for more than 4 hours."""
    
    four_hours_ago = datetime.now(timezone.utc) - timedelta(hours=4)
    
    # Find all active timers that started more than 4 hours ago and are not paused
    inactive_timers = await db.fulfillment_time_logs.find({
        "completed_at": None,
        "is_paused": {"$ne": True},
        "started_at": {"$lt": four_hours_ago.isoformat()}
    }, {"_id": 0}).to_list(100)
    
    stopped_count = 0
    for timer in inactive_timers:
        started = datetime.fromisoformat(timer["started_at"].replace('Z', '+00:00'))
        now = datetime.now(timezone.utc)
        
        # Calculate duration (cap at 4 hours for inactive timers)
        accumulated = timer.get("accumulated_minutes", 0)
        session_minutes = min((now - started).total_seconds() / 60, 240)  # Cap at 4 hours
        total_minutes = accumulated + session_minutes
        
        await db.fulfillment_time_logs.update_one(
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


# Admin/Manager endpoints for editing time entries
@router.get("/admin/time-entries")
async def get_all_time_entries(
    limit: int = 100,
    user: User = Depends(get_current_user)
):
    """Get all time entries for admin review. Requires admin or manager role."""
    
    # Check if user is admin or manager
    if user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Only admins and managers can view all time entries")
    
    time_logs = await db.fulfillment_time_logs.find(
        {"completed_at": {"$ne": None}},
        {"_id": 0}
    ).sort("completed_at", -1).limit(limit).to_list(limit)
    
    return time_logs


@router.put("/admin/time-entries/{log_id}")
async def update_time_entry(
    log_id: str,
    duration_minutes: Optional[float] = None,
    items_processed: Optional[int] = None,
    orders_processed: Optional[int] = None,
    notes: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Update a time entry. Requires admin or manager role."""
    
    # Check if user is admin or manager
    if user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Only admins and managers can edit time entries")
    
    # Find the time entry
    time_log = await db.fulfillment_time_logs.find_one({"log_id": log_id})
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
    
    if orders_processed is not None:
        update_data["orders_processed"] = orders_processed
    
    if notes is not None:
        update_data["admin_notes"] = notes
    
    await db.fulfillment_time_logs.update_one(
        {"log_id": log_id},
        {"$set": update_data}
    )
    
    return {"message": "Time entry updated", "log_id": log_id}


@router.post("/admin/time-entries/add")
async def add_manual_time_entry(
    user_id: str,
    user_name: str,
    stage_id: str,
    stage_name: str,
    duration_minutes: float,
    order_id: Optional[str] = None,
    order_number: Optional[str] = None,
    items_processed: int = 0,
    orders_processed: int = 1,
    notes: Optional[str] = None,
    entry_date: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Add a manual time entry for neglected time tracking. Requires admin or manager role."""
    
    # Check if user is admin or manager
    if user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Only admins and managers can add manual time entries")
    
    now = datetime.now(timezone.utc)
    
    # Use provided date or current time
    if entry_date:
        try:
            entry_datetime = datetime.fromisoformat(entry_date.replace('Z', '+00:00'))
        except:
            entry_datetime = now
    else:
        entry_datetime = now
    
    time_log = {
        "log_id": f"flog_{uuid.uuid4().hex[:12]}",
        "user_id": user_id,
        "user_name": user_name,
        "stage_id": stage_id,
        "stage_name": stage_name,
        "order_id": order_id,
        "order_number": order_number,
        "action": "manual_entry",
        "started_at": entry_datetime.isoformat(),
        "completed_at": entry_datetime.isoformat(),
        "duration_minutes": duration_minutes,
        "items_processed": items_processed,
        "orders_processed": orders_processed,
        "is_paused": False,
        "accumulated_minutes": 0,
        "pause_events": [],
        "manual_entry": True,
        "added_by": user.user_id,
        "added_by_name": user.name,
        "admin_notes": notes,
        "created_at": now.isoformat()
    }
    
    await db.fulfillment_time_logs.insert_one(time_log)
    
    return {"message": "Manual time entry added", "log_id": time_log["log_id"]}


@router.delete("/admin/time-entries/{log_id}")
async def delete_time_entry(
    log_id: str,
    user: User = Depends(get_current_user)
):
    """Delete a time entry. Requires admin or manager role."""
    
    # Check if user is admin or manager
    if user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Only admins and managers can delete time entries")
    
    result = await db.fulfillment_time_logs.delete_one({"log_id": log_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Time entry not found")
    
    return {"message": "Time entry deleted", "log_id": log_id}


@router.get("/admin/users")
async def get_users_for_time_entry(user: User = Depends(get_current_user)):
    """Get list of users for manual time entry. Requires admin or manager role."""
    
    if user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Only admins and managers can access this")
    
    users = await db.users.find({}, {"_id": 0, "user_id": 1, "name": 1, "email": 1}).to_list(100)
    return users



# Daily hours limit and grouped reports
DAILY_HOURS_LIMIT = 9

@router.get("/reports/hours-by-user-date")
async def get_hours_by_user_date(
    period: str = "day",  # day, week, month
    user: User = Depends(get_current_user)
):
    """Get hours grouped by user and date for reporting."""
    
    now = datetime.now(timezone.utc)
    
    # Calculate date range based on period
    if period == "day":
        start_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == "week":
        days_since_monday = now.weekday()
        start_date = (now - timedelta(days=days_since_monday)).replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == "month":
        start_date = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    else:
        start_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
    
    # Get all completed time logs in the period
    time_logs = await db.fulfillment_time_logs.find({
        "completed_at": {"$gte": start_date.isoformat()},
        "duration_minutes": {"$gt": 0}
    }, {"_id": 0}).to_list(5000)
    
    # Group by user and date
    user_date_data = {}
    
    for log in time_logs:
        user_id = log["user_id"]
        user_name = log["user_name"]
        
        # Get date from completed_at
        completed = log.get("completed_at", "")
        if completed:
            try:
                log_date = datetime.fromisoformat(completed.replace('Z', '+00:00')).strftime("%Y-%m-%d")
            except:
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
                "total_orders": 0,
                "entries": [],
                "exceeds_limit": False
            }
        
        user_date_data[key]["total_minutes"] += log.get("duration_minutes", 0)
        user_date_data[key]["total_items"] += log.get("items_processed", 0)
        user_date_data[key]["total_orders"] += log.get("orders_processed", 0)
        user_date_data[key]["entries"].append({
            "log_id": log["log_id"],
            "stage_name": log["stage_name"],
            "order_number": log.get("order_number"),
            "duration_minutes": round(log.get("duration_minutes", 0), 1),
            "items_processed": log.get("items_processed", 0),
            "completed_at": log.get("completed_at")
        })
    
    # Check if exceeds limit and calculate totals
    result = []
    for key, data in user_date_data.items():
        total_hours = data["total_minutes"] / 60
        data["total_hours"] = round(total_hours, 2)
        data["labor_cost"] = round(total_hours * 30, 2)
        data["exceeds_limit"] = total_hours > DAILY_HOURS_LIMIT
        data["entries"] = sorted(data["entries"], key=lambda x: x.get("completed_at") or "", reverse=True)
        result.append(data)
    
    # Sort by date desc, then user name
    result.sort(key=lambda x: (x["date"], x["user_name"]), reverse=True)
    
    return {
        "period": period,
        "start_date": start_date.strftime("%Y-%m-%d"),
        "data": result,
        "daily_limit_hours": DAILY_HOURS_LIMIT
    }


@router.get("/user/daily-hours-check")
async def check_user_daily_hours(user: User = Depends(get_current_user)):
    """Check if the current user has exceeded the daily hours limit."""
    
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    
    # Get all completed time logs for today for this user
    pipeline = [
        {"$match": {
            "user_id": user.user_id,
            "completed_at": {"$gte": today_start.isoformat()},
            "duration_minutes": {"$gt": 0}
        }},
        {"$group": {
            "_id": None,
            "total_minutes": {"$sum": "$duration_minutes"}
        }}
    ]
    
    result = await db.fulfillment_time_logs.aggregate(pipeline).to_list(1)
    
    total_minutes = result[0]["total_minutes"] if result else 0
    total_hours = total_minutes / 60
    
    # Also check if there's an active timer and add its time
    active_timer = await db.fulfillment_time_logs.find_one({
        "user_id": user.user_id,
        "completed_at": None
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


@router.post("/user/acknowledge-limit-exceeded")
async def acknowledge_limit_exceeded(
    continue_working: bool,
    user: User = Depends(get_current_user)
):
    """Record user's response to exceeding daily hours limit."""
    
    now = datetime.now(timezone.utc)
    
    # Log the acknowledgment
    await db.daily_limit_acknowledgments.insert_one({
        "user_id": user.user_id,
        "user_name": user.name,
        "acknowledged_at": now.isoformat(),
        "continue_working": continue_working,
        "date": now.strftime("%Y-%m-%d")
    })
    
    if continue_working:
        # User wants to continue - mark that they've acknowledged for today
        await db.users.update_one(
            {"user_id": user.user_id},
            {"$set": {
                "daily_limit_acknowledged": now.strftime("%Y-%m-%d"),
                "daily_limit_acknowledged_at": now.isoformat()
            }}
        )
        return {"message": "Acknowledged. You may continue working.", "action": "continue"}
    else:
        # User chose not to continue - stop any active timer
        active_timer = await db.fulfillment_time_logs.find_one({
            "user_id": user.user_id,
            "completed_at": None
        })
        
        if active_timer:
            started = datetime.fromisoformat(active_timer["started_at"].replace('Z', '+00:00'))
            accumulated = active_timer.get("accumulated_minutes", 0)
            if not active_timer.get("is_paused"):
                session_minutes = (now - started).total_seconds() / 60
            else:
                session_minutes = 0
            total_minutes = accumulated + session_minutes
            
            await db.fulfillment_time_logs.update_one(
                {"log_id": active_timer["log_id"]},
                {"$set": {
                    "completed_at": now.isoformat(),
                    "duration_minutes": total_minutes,
                    "auto_stopped": True,
                    "auto_stop_reason": "User chose to stop after exceeding daily limit"
                }}
            )
        
        return {"message": "Timer stopped. Please log out.", "action": "logout"}


@router.get("/user/check-limit-acknowledged")
async def check_limit_acknowledged(user: User = Depends(get_current_user)):
    """Check if user has already acknowledged the daily limit for today."""
    
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    
    acknowledged_date = user_doc.get("daily_limit_acknowledged") if user_doc else None
    
    return {
        "acknowledged_today": acknowledged_date == today,
        "acknowledged_date": acknowledged_date
    }

