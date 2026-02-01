from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timezone
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
    user: User = Depends(get_current_user)
):
    """Start time tracking for a user working on a fulfillment stage."""
    stage = await db.fulfillment_stages.find_one({"stage_id": stage_id}, {"_id": 0})
    if not stage:
        raise HTTPException(status_code=404, detail="Stage not found")
    
    # Check for any active fulfillment timer
    any_active = await db.fulfillment_time_logs.find_one({
        "user_id": user.user_id,
        "completed_at": None
    }, {"_id": 0})
    
    if any_active:
        raise HTTPException(
            status_code=400, 
            detail=f"You already have an active timer for {any_active.get('stage_name', 'another stage')}. Stop it first."
        )
    
    now = datetime.now(timezone.utc)
    
    time_log = {
        "log_id": f"flog_{uuid.uuid4().hex[:12]}",
        "user_id": user.user_id,
        "user_name": user.name,
        "stage_id": stage_id,
        "stage_name": stage["name"],
        "order_id": order_id,
        "order_number": order_number,
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
    active_timer = await db.fulfillment_time_logs.find_one({
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
        "stage_id": stage_id,
        "stage_name": active_timer["stage_name"],
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
    """Get user's active fulfillment timer if any."""
    active = await db.fulfillment_time_logs.find_one({
        "user_id": user.user_id,
        "completed_at": None
    }, {"_id": 0})
    
    if active:
        return [active]
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
        workers.append({
            "user_id": timer["user_id"],
            "user_name": timer["user_name"],
            "started_at": timer["started_at"],
            "is_paused": timer.get("is_paused", False)
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



@router.get("/stats/overall-kpis")
async def get_fulfillment_overall_kpis(user: User = Depends(get_current_user)):
    """Get overall KPIs for the fulfillment workflow."""
    # Aggregate all completed time logs
    pipeline = [
        {"$match": {
            "duration_minutes": {"$gt": 0},
            "completed_at": {"$ne": None}
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
            "session_count": 0
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
        "session_count": data["session_count"]
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

