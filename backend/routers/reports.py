from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from datetime import datetime, timezone, timedelta

from database import db
from models.user import User
from dependencies import get_current_user

router = APIRouter(tags=["reports"])

@router.get("/stats/dashboard")
async def get_dashboard_stats(user: User = Depends(get_current_user)):
    """Get dashboard statistics"""
    # Optimized: Use single aggregation for order counts instead of multiple count_documents
    order_stats_pipeline = [
        {"$group": {
            "_id": "$status",
            "count": {"$sum": 1}
        }}
    ]
    order_stats = await db.orders.aggregate(order_stats_pipeline).to_list(20)
    
    # Convert to dict for easy lookup
    status_counts = {s["_id"]: s["count"] for s in order_stats}
    total_orders = sum(status_counts.values())
    pending = status_counts.get("pending", 0)
    in_production = status_counts.get("in_production", 0)
    completed = status_counts.get("completed", 0)
    
    pipeline = [
        {"$match": {"duration_minutes": {"$gt": 0}}},
        {"$group": {
            "_id": None,
            "total_items": {"$sum": "$items_processed"},
            "total_minutes": {"$sum": "$duration_minutes"}
        }}
    ]
    agg_result = await db.time_logs.aggregate(pipeline).to_list(1)
    
    avg_items_per_hour = 0
    if agg_result and agg_result[0]["total_minutes"] > 0:
        avg_items_per_hour = round(
            (agg_result[0]["total_items"] / agg_result[0]["total_minutes"]) * 60, 1
        )
    
    store_pipeline = [{"$group": {"_id": "$store_name", "count": {"$sum": 1}}}]
    orders_by_store = await db.orders.aggregate(store_pipeline).to_list(100)
    
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    daily_pipeline = [
        {"$match": {"completed_at": {"$ne": None}}},
        {"$addFields": {"completed_date": {"$dateFromString": {"dateString": "$completed_at"}}}},
        {"$match": {"completed_date": {"$gte": week_ago}}},
        {"$group": {
            "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$completed_date"}},
            "items": {"$sum": "$items_processed"},
            "hours": {"$sum": {"$divide": ["$duration_minutes", 60]}}
        }},
        {"$sort": {"_id": 1}}
    ]
    daily_stats = await db.time_logs.aggregate(daily_pipeline).to_list(7)
    
    return {
        "orders": {"total": total_orders, "pending": pending, "in_production": in_production, "completed": completed},
        "avg_items_per_hour": avg_items_per_hour,
        "orders_by_store": [{"name": s["_id"] or "Unknown", "count": s["count"]} for s in orders_by_store],
        "daily_production": daily_stats
    }

@router.get("/stats/production-kpis")
async def get_production_kpis(user: User = Depends(get_current_user)):
    """Get production KPIs including rejection rates and costs"""
    # Use aggregation for efficient KPI calculation
    pipeline = [
        {"$group": {
            "_id": None,
            "total_required": {"$sum": "$qty_required"},
            "total_completed": {"$sum": "$qty_completed"},
            "total_rejected": {"$sum": {"$ifNull": ["$qty_rejected", 0]}}
        }}
    ]
    
    # Get frame stats from batch_frames (new model)
    frame_stats = await db.batch_frames.aggregate(pipeline).to_list(1)
    if frame_stats:
        stats = frame_stats[0]
        total_required = stats.get("total_required", 0)
        total_completed = stats.get("total_completed", 0)
        total_rejected = stats.get("total_rejected", 0)
    else:
        total_required = total_completed = total_rejected = 0
    
    good_frames = max(0, total_completed - total_rejected)
    
    # Time and cost calculations with aggregation
    time_pipeline = [
        {"$match": {"completed_at": {"$ne": None}}},
        {"$group": {
            "_id": None,
            "total_minutes": {"$sum": "$duration_minutes"},
            "total_items": {"$sum": "$items_processed"}
        }}
    ]
    time_stats = await db.time_logs.aggregate(time_pipeline).to_list(1)
    
    if time_stats:
        total_minutes = time_stats[0].get("total_minutes", 0)
        total_items_processed = time_stats[0].get("total_items", 0)
    else:
        total_minutes = total_items_processed = 0
    
    total_hours = total_minutes / 60
    
    hourly_rate = 22.0
    labor_cost = total_hours * hourly_rate
    avg_cost_per_frame = labor_cost / good_frames if good_frames > 0 else 0
    rejection_rate = (total_rejected / total_completed * 100) if total_completed > 0 else 0
    
    # Inventory stats with aggregation
    inv_pipeline = [
        {"$group": {
            "_id": "$is_rejected",
            "count": {"$sum": 1},
            "total_qty": {"$sum": "$quantity"}
        }}
    ]
    inv_stats = await db.inventory.aggregate(inv_pipeline).to_list(10)
    
    good_inventory = rejected_inventory = total_good_stock = total_rejected_stock = 0
    for stat in inv_stats:
        if stat["_id"]:  # is_rejected = True
            rejected_inventory = stat["count"]
            total_rejected_stock = stat["total_qty"]
        else:
            good_inventory = stat["count"]
            total_good_stock = stat["total_qty"]
    
    # Batch-level breakdown - Optimized: Single aggregation instead of N+1 queries
    # Get recent batches with their IDs
    batches = await db.production_batches.find(
        {}, 
        {"_id": 0, "batch_id": 1, "name": 1, "status": 1}
    ).sort("created_at", -1).limit(50).to_list(50)
    
    batch_ids = [b["batch_id"] for b in batches]
    
    # Single aggregation to get all batch frame stats at once
    batch_frame_pipeline = [
        {"$match": {"batch_id": {"$in": batch_ids}}},
        {"$group": {
            "_id": "$batch_id",
            "completed": {"$sum": "$qty_completed"},
            "rejected": {"$sum": {"$ifNull": ["$qty_rejected", 0]}}
        }}
    ]
    batch_frame_stats = await db.batch_frames.aggregate(batch_frame_pipeline).to_list(100)
    
    # Convert to dict for O(1) lookup
    batch_stats_map = {s["_id"]: s for s in batch_frame_stats}
    
    batch_kpis = []
    for batch in batches:
        bid = batch.get("batch_id")
        b_stats = batch_stats_map.get(bid, {"completed": 0, "rejected": 0})
        
        b_completed = b_stats.get("completed", 0)
        b_rejected = b_stats.get("rejected", 0)
        b_good = max(0, b_completed - b_rejected)
        b_rejection_rate = (b_rejected / b_completed * 100) if b_completed > 0 else 0
        
        batch_kpis.append({
            "batch_id": bid,
            "name": batch.get("name"),
            "status": batch.get("status"),
            "completed": b_completed,
            "rejected": b_rejected,
            "good_frames": b_good,
            "rejection_rate": round(b_rejection_rate, 1)
        })
    
    return {
        "production": {
            "total_required": total_required,
            "total_completed": total_completed,
            "total_rejected": total_rejected,
            "good_frames": good_frames
        },
        "quality": {
            "rejection_rate": round(rejection_rate, 1),
            "yield_rate": round(100 - rejection_rate, 1)
        },
        "time": {
            "total_hours": round(total_hours, 1),
            "total_items_processed": total_items_processed,
            "avg_items_per_hour": round((total_items_processed / total_minutes * 60), 1) if total_minutes > 0 else 0
        },
        "costs": {
            "hourly_rate": hourly_rate,
            "total_labor_cost": round(labor_cost, 2),
            "avg_cost_per_frame": round(avg_cost_per_frame, 2)
        },
        "inventory": {
            "good_skus": good_inventory,
            "rejected_skus": rejected_inventory,
            "total_good_stock": total_good_stock,
            "total_rejected_stock": total_rejected_stock
        },
        "batches": batch_kpis
    }

@router.get("/stats/users")
async def get_user_stats(
    period: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get user performance statistics with optional date filtering
    
    period: 'day', 'week', 'month', 'all' or None (defaults to all)
    start_date/end_date: ISO date strings for custom range (YYYY-MM-DD)
    """
    now = datetime.now(timezone.utc)
    match_query = {"duration_minutes": {"$gt": 0}}
    
    # Calculate date range based on period
    if period == "day":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        match_query["completed_at"] = {"$gte": start.isoformat()}
    elif period == "week":
        start = now - timedelta(days=now.weekday())
        start = start.replace(hour=0, minute=0, second=0, microsecond=0)
        match_query["completed_at"] = {"$gte": start.isoformat()}
    elif period == "month":
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        match_query["completed_at"] = {"$gte": start.isoformat()}
    elif start_date and end_date:
        # Custom date range
        try:
            start = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
            end = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            # Add one day to end to include the full end date
            end = end + timedelta(days=1)
            match_query["completed_at"] = {
                "$gte": start.isoformat(),
                "$lt": end.isoformat()
            }
        except:
            pass  # Invalid dates, ignore filter
    
    pipeline = [
        {"$match": match_query},
        {"$group": {
            "_id": {"user_id": "$user_id", "user_name": "$user_name"},
            "total_items": {"$sum": "$items_processed"},
            "total_minutes": {"$sum": "$duration_minutes"},
            "sessions": {"$sum": 1}
        }},
        {"$project": {
            "user_id": "$_id.user_id",
            "user_name": "$_id.user_name",
            "total_items": 1,
            "total_hours": {"$round": [{"$divide": ["$total_minutes", 60]}, 1]},
            "sessions": 1,
            "items_per_hour": {"$round": [{"$multiply": [{"$divide": ["$total_items", "$total_minutes"]}, 60]}, 1]}
        }}
    ]
    return await db.time_logs.aggregate(pipeline).to_list(100)

@router.get("/stats/stages")
async def get_stage_stats(user: User = Depends(get_current_user)):
    """Get statistics by production stage"""
    pipeline = [
        {"$match": {"duration_minutes": {"$gt": 0}}},
        {"$group": {
            "_id": {"stage_id": "$stage_id", "stage_name": "$stage_name"},
            "total_items": {"$sum": "$items_processed"},
            "total_minutes": {"$sum": "$duration_minutes"},
            "avg_time_per_item": {"$avg": {"$divide": ["$duration_minutes", "$items_processed"]}}
        }},
        {"$project": {
            "stage_id": "$_id.stage_id",
            "stage_name": "$_id.stage_name",
            "total_items": 1,
            "total_hours": {"$round": [{"$divide": ["$total_minutes", 60]}, 1]},
            "avg_minutes_per_item": {"$round": ["$avg_time_per_item", 1]}
        }}
    ]
    return await db.time_logs.aggregate(pipeline).to_list(100)

@router.get("/time-logs")
async def get_time_logs(
    user_id: Optional[str] = None,
    order_id: Optional[str] = None,
    stage_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get time logs with optional filters"""
    query = {}
    if user_id:
        query["user_id"] = user_id
    if order_id:
        query["order_id"] = order_id
    if stage_id:
        query["stage_id"] = stage_id
    
    logs = await db.time_logs.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return logs

@router.get("/stats/stage-user-kpis")
async def get_stage_user_kpis(
    stage_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get KPIs for each user per stage: time in stage, avg items made, items sent to next stage"""
    # Build match query
    match_query = {"duration_minutes": {"$gt": 0}, "completed_at": {"$ne": None}}
    if stage_id:
        match_query["stage_id"] = stage_id
    
    # Aggregate time logs by user and stage
    pipeline = [
        {"$match": match_query},
        {"$group": {
            "_id": {"user_id": "$user_id", "user_name": "$user_name", "stage_id": "$stage_id", "stage_name": "$stage_name"},
            "total_minutes": {"$sum": "$duration_minutes"},
            "total_items": {"$sum": "$items_processed"},
            "session_count": {"$sum": 1}
        }},
        {"$project": {
            "_id": 0,
            "user_id": "$_id.user_id",
            "user_name": "$_id.user_name",
            "stage_id": "$_id.stage_id",
            "stage_name": "$_id.stage_name",
            "total_hours": {"$round": [{"$divide": ["$total_minutes", 60]}, 2]},
            "total_minutes": {"$round": ["$total_minutes", 1]},
            "total_items": 1,
            "session_count": 1,
            "avg_items_per_session": {"$round": [{"$divide": ["$total_items", "$session_count"]}, 1]},
            "items_per_hour": {"$cond": {
                "if": {"$gt": ["$total_minutes", 0]},
                "then": {"$round": [{"$multiply": [{"$divide": ["$total_items", "$total_minutes"]}, 60]}, 1]},
                "else": 0
            }}
        }},
        {"$sort": {"stage_name": 1, "total_items": -1}}
    ]
    
    user_stage_stats = await db.time_logs.aggregate(pipeline).to_list(1000)
    
    # Get all stages for reference
    stages = await db.production_stages.find({}, {"_id": 0}).sort("order", 1).to_list(100)
    stage_order = {s["stage_id"]: s["order"] for s in stages}
    stage_names = {s["stage_id"]: s["name"] for s in stages}
    
    # Group by stage for easier frontend consumption
    stages_data = {}
    for stat in user_stage_stats:
        sid = stat["stage_id"]
        if sid not in stages_data:
            stages_data[sid] = {
                "stage_id": sid,
                "stage_name": stat.get("stage_name", stage_names.get(sid, "Unknown")),
                "order": stage_order.get(sid, 99),
                "users": [],
                "totals": {
                    "total_hours": 0,
                    "total_items": 0,
                    "total_sessions": 0
                }
            }
        stages_data[sid]["users"].append(stat)
        stages_data[sid]["totals"]["total_hours"] += stat["total_hours"]
        stages_data[sid]["totals"]["total_items"] += stat["total_items"]
        stages_data[sid]["totals"]["total_sessions"] += stat["session_count"]
    
    # Calculate stage averages
    for sid, data in stages_data.items():
        total_users = len(data["users"])
        if total_users > 0:
            data["totals"]["avg_hours_per_user"] = round(data["totals"]["total_hours"] / total_users, 2)
            data["totals"]["avg_items_per_user"] = round(data["totals"]["total_items"] / total_users, 1)
        if data["totals"]["total_hours"] > 0:
            data["totals"]["overall_items_per_hour"] = round(data["totals"]["total_items"] / data["totals"]["total_hours"], 1)
        else:
            data["totals"]["overall_items_per_hour"] = 0
    
    # Sort by stage order
    result = sorted(stages_data.values(), key=lambda x: x["order"])
    
    return {
        "stages": result,
        "summary": {
            "total_stages": len(result),
            "total_users_tracked": len(set(s["user_id"] for s in user_stage_stats)),
            "total_hours": round(sum(s["total_hours"] for s in user_stage_stats), 2),
            "total_items": sum(s["total_items"] for s in user_stage_stats)
        }
    }


@router.get("/stats/my-stage-kpis")
async def get_my_stage_kpis(
    stage_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get the current user's KPIs for stages they've worked on"""
    # Build match query for current user
    match_query = {
        "user_id": user.user_id,
        "duration_minutes": {"$gt": 0},
        "completed_at": {"$ne": None}
    }
    if stage_id:
        match_query["stage_id"] = stage_id
    
    # Aggregate time logs for this user by stage
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
    
    # Calculate totals across all stages
    total_hours = sum(s["total_hours"] for s in user_stats)
    total_items = sum(s["total_items"] for s in user_stats)
    total_sessions = sum(s["session_count"] for s in user_stats)
    overall_items_per_hour = round((total_items / (total_hours * 60) * 60), 1) if total_hours > 0 else 0
    
    return {
        "user_id": user.user_id,
        "user_name": user.name,
        "stages": user_stats,
        "totals": {
            "total_hours": round(total_hours, 2),
            "total_items": total_items,
            "total_sessions": total_sessions,
            "overall_items_per_hour": overall_items_per_hour
        }
    }

