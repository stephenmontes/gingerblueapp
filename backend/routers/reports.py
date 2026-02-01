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
    total_orders = await db.orders.count_documents({})
    pending = await db.orders.count_documents({"status": "pending"})
    in_production = await db.orders.count_documents({"status": "in_production"})
    completed = await db.orders.count_documents({"status": "completed"})
    
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
    # Get all production items
    items = await db.production_items.find({}, {"_id": 0}).to_list(10000)
    
    total_required = sum(item.get("qty_required", 0) for item in items)
    total_completed = sum(item.get("qty_completed", 0) for item in items)
    total_rejected = sum(item.get("qty_rejected", 0) for item in items)
    good_frames = max(0, total_completed - total_rejected)
    
    # Time and cost calculations
    time_logs = await db.time_logs.find({"completed_at": {"$ne": None}}, {"_id": 0}).to_list(10000)
    total_minutes = sum(log.get("duration_minutes", 0) for log in time_logs)
    total_hours = total_minutes / 60
    total_items_processed = sum(log.get("items_processed", 0) for log in time_logs)
    
    hourly_rate = 22.0
    labor_cost = total_hours * hourly_rate
    avg_cost_per_frame = labor_cost / good_frames if good_frames > 0 else 0
    rejection_rate = (total_rejected / total_completed * 100) if total_completed > 0 else 0
    
    # Inventory stats
    inventory = await db.inventory.find({}, {"_id": 0}).to_list(10000)
    good_inventory = sum(1 for i in inventory if not i.get("is_rejected"))
    rejected_inventory = sum(1 for i in inventory if i.get("is_rejected"))
    total_good_stock = sum(i.get("quantity", 0) for i in inventory if not i.get("is_rejected"))
    total_rejected_stock = sum(i.get("quantity", 0) for i in inventory if i.get("is_rejected"))
    
    # Batch-level breakdown
    batches = await db.production_batches.find({}, {"_id": 0}).to_list(100)
    batch_kpis = []
    for batch in batches:
        batch_items = [i for i in items if i.get("batch_id") == batch.get("batch_id")]
        b_completed = sum(i.get("qty_completed", 0) for i in batch_items)
        b_rejected = sum(i.get("qty_rejected", 0) for i in batch_items)
        b_good = max(0, b_completed - b_rejected)
        b_rejection_rate = (b_rejected / b_completed * 100) if b_completed > 0 else 0
        
        batch_kpis.append({
            "batch_id": batch.get("batch_id"),
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
async def get_user_stats(user: User = Depends(get_current_user)):
    """Get user performance statistics"""
    pipeline = [
        {"$match": {"duration_minutes": {"$gt": 0}}},
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

