from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional, Literal
from datetime import datetime, timezone, timedelta

from database import db
from models.user import User
from dependencies import get_current_user

router = APIRouter(tags=["reports"])

@router.get("/stats/dashboard")
async def get_dashboard_stats(user: User = Depends(get_current_user)):
    """Get dashboard statistics"""
    
    # Total Orders: All unfulfilled orders (not shipped, not cancelled)
    total_unfulfilled = await db.fulfillment_orders.count_documents({
        "status": {"$nin": ["shipped", "cancelled"]}
    })
    
    # In Production: Orders currently in a production batch (batched orders)
    in_production = await db.fulfillment_orders.count_documents({
        "batch_id": {"$ne": None},
        "status": {"$nin": ["shipped", "cancelled", "completed"]}
    })
    
    # Pending Orders: Unbatched orders awaiting production
    # Excluding shipped/cancelled orders
    pending_orders = await db.fulfillment_orders.count_documents({
        "batch_id": None,
        "status": {"$nin": ["shipped", "cancelled"]}
    })
    
    # Completed: Orders that have been shipped
    completed = await db.fulfillment_orders.count_documents({
        "status": "shipped"
    })
    
    # Count orders in fulfillment stages
    fulfillment_pipeline = [
        {"$match": {"fulfillment_stage_id": {"$exists": True, "$ne": None}}},
        {"$group": {
            "_id": "$fulfillment_stage_id",
            "count": {"$sum": 1}
        }}
    ]
    fulfillment_stats = await db.fulfillment_orders.aggregate(fulfillment_pipeline).to_list(20)
    in_fulfillment = sum(s["count"] for s in fulfillment_stats)
    
    # Calculate average items per hour from time logs
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
    
    # Get orders by store from fulfillment_orders (excluding shipped/cancelled)
    store_pipeline = [
        {"$match": {"status": {"$nin": ["shipped", "cancelled"]}}},
        {"$group": {"_id": "$store_name", "count": {"$sum": 1}}}
    ]
    orders_by_store = await db.fulfillment_orders.aggregate(store_pipeline).to_list(100)
    
    # Daily production stats from time logs
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
    
    # Get active production batches count
    active_batches = await db.production_batches.count_documents({"status": "active"})
    
    # Calculate average frame production rate from production_logs
    frame_rate_pipeline = [
        {"$match": {"quantity": {"$gt": 0}}},
        {"$group": {
            "_id": None,
            "total_frames": {"$sum": "$quantity"}
        }}
    ]
    frame_result = await db.production_logs.aggregate(frame_rate_pipeline).to_list(1)
    total_frames_produced = frame_result[0]["total_frames"] if frame_result else 0
    
    # Get total production time in hours
    time_result = await db.time_logs.aggregate([
        {"$match": {"duration_minutes": {"$gt": 0}}},
        {"$group": {"_id": None, "total_minutes": {"$sum": "$duration_minutes"}}}
    ]).to_list(1)
    total_hours = (time_result[0]["total_minutes"] / 60) if time_result else 0
    
    avg_frames_per_hour = round(total_frames_produced / total_hours, 1) if total_hours > 0 else 0
    
    return {
        "orders": {
            "total": total_unfulfilled,       # Total unfulfilled orders (not shipped)
            "pending": pending_orders,         # Unbatched orders needing attention
            "in_production": in_production,    # Currently in production batches
            "in_fulfillment": in_fulfillment,
            "completed": completed             # Shipped orders
        },
        "active_batches": active_batches,
        "avg_items_per_hour": avg_items_per_hour,
        "avg_frames_per_hour": avg_frames_per_hour,
        "orders_by_store": [{"name": s["_id"] or "Unknown", "count": s["count"]} for s in orders_by_store],
        "daily_production": daily_stats
    }


@router.get("/stats/unfulfilled-orders-by-store")
async def get_unfulfilled_orders_by_store(user: User = Depends(get_current_user)):
    """Get unfulfilled orders grouped by store with order values"""
    
    # Aggregate unfulfilled orders by store
    pipeline = [
        {"$match": {"status": {"$nin": ["shipped", "cancelled"]}}},
        {"$group": {
            "_id": "$store_name",
            "order_count": {"$sum": 1},
            "total_value": {"$sum": {"$ifNull": ["$total_price", 0]}},
            "orders": {"$push": {
                "order_id": "$order_id",
                "order_number": "$order_number",
                "customer_name": "$customer_name",
                "total_price": "$total_price",
                "status": "$status",
                "batch_id": "$batch_id",
                "created_at": {"$ifNull": ["$external_created_at", "$created_at"]}
            }}
        }},
        {"$sort": {"total_value": -1}}
    ]
    
    store_data = await db.fulfillment_orders.aggregate(pipeline).to_list(100)
    
    # Calculate totals
    total_orders = sum(s["order_count"] for s in store_data)
    total_value = sum(s["total_value"] for s in store_data)
    
    # Format response
    stores = []
    for store in store_data:
        # Sort orders by created_at descending and limit to 50
        orders = sorted(
            store["orders"], 
            key=lambda x: x.get("created_at") or "", 
            reverse=True
        )[:50]
        
        stores.append({
            "store_name": store["_id"] or "Unknown",
            "order_count": store["order_count"],
            "total_value": round(store["total_value"], 2),
            "orders": orders
        })
    
    return {
        "total_orders": total_orders,
        "total_value": round(total_value, 2),
        "stores": stores
    }


@router.get("/stats/pending-orders-by-store")
async def get_pending_orders_by_store(user: User = Depends(get_current_user)):
    """Get pending orders (ship date within 30 days) grouped by store with order values"""
    
    now = datetime.now(timezone.utc)
    thirty_days_from_now = (now + timedelta(days=30)).isoformat()
    now_str = now.isoformat()
    
    # Aggregate pending orders by store
    pipeline = [
        {"$match": {
            "status": {"$nin": ["shipped", "cancelled"]},
            "requested_ship_date": {
                "$exists": True,
                "$ne": None,
                "$gte": now_str,
                "$lte": thirty_days_from_now
            }
        }},
        {"$group": {
            "_id": "$store_name",
            "order_count": {"$sum": 1},
            "total_value": {"$sum": {"$ifNull": ["$total_price", 0]}},
            "orders": {"$push": {
                "order_id": "$order_id",
                "order_number": "$order_number",
                "customer_name": "$customer_name",
                "total_price": "$total_price",
                "status": "$status",
                "batch_id": "$batch_id",
                "requested_ship_date": "$requested_ship_date",
                "created_at": {"$ifNull": ["$external_created_at", "$created_at"]}
            }}
        }},
        {"$sort": {"total_value": -1}}
    ]
    
    store_data = await db.fulfillment_orders.aggregate(pipeline).to_list(100)
    
    # Calculate totals
    total_orders = sum(s["order_count"] for s in store_data)
    total_value = sum(s["total_value"] for s in store_data)
    
    # Format response
    stores = []
    for store in store_data:
        # Sort orders by ship date ascending (soonest first)
        orders = sorted(
            store["orders"], 
            key=lambda x: x.get("requested_ship_date") or "9999", 
            reverse=False
        )[:50]
        
        stores.append({
            "store_name": store["_id"] or "Unknown",
            "order_count": store["order_count"],
            "total_value": round(store["total_value"], 2),
            "orders": orders
        })
    
    return {
        "total_orders": total_orders,
        "total_value": round(total_value, 2),
        "stores": stores
    }


@router.get("/stats/frame-production-rates")
async def get_frame_production_rates(
    period: Literal["day", "week", "month"] = Query("week", description="Time period for rate calculation"),
    stage_id: Optional[str] = Query(None, description="Filter by specific stage"),
    user: User = Depends(get_current_user)
):
    """Get detailed frame production rates by user, filterable by stage and time period"""
    
    # Calculate date range based on period
    now = datetime.now(timezone.utc)
    if period == "day":
        start_date = now - timedelta(days=1)
        period_label = "Last 24 Hours"
    elif period == "week":
        start_date = now - timedelta(days=7)
        period_label = "Last 7 Days"
    else:  # month
        start_date = now - timedelta(days=30)
        period_label = "Last 30 Days"
    
    start_date_str = start_date.isoformat()
    
    # Build match criteria for production logs
    match_criteria = {
        "created_at": {"$gte": start_date_str},
        "quantity": {"$gt": 0}
    }
    
    if stage_id:
        match_criteria["from_stage"] = stage_id
    
    # Get frames produced per user
    user_frames_pipeline = [
        {"$match": match_criteria},
        {"$group": {
            "_id": {
                "user_id": "$moved_by",
                "user_name": "$moved_by_name",
                "stage_id": "$from_stage"
            },
            "frames_produced": {"$sum": "$quantity"},
            "moves_count": {"$sum": 1}
        }},
        {"$sort": {"frames_produced": -1}}
    ]
    
    user_frame_stats = await db.production_logs.aggregate(user_frames_pipeline).to_list(100)
    
    # Build match criteria for time logs
    time_match = {"created_at": {"$gte": start_date_str}, "duration_minutes": {"$gt": 0}}
    if stage_id:
        time_match["stage_id"] = stage_id
    
    # Get time spent per user per stage
    user_time_pipeline = [
        {"$match": time_match},
        {"$group": {
            "_id": {
                "user_id": "$user_id",
                "user_name": "$user_name", 
                "stage_id": "$stage_id",
                "stage_name": "$stage_name"
            },
            "total_minutes": {"$sum": "$duration_minutes"},
            "sessions": {"$sum": 1}
        }}
    ]
    
    user_time_stats = await db.time_logs.aggregate(user_time_pipeline).to_list(100)
    
    # Build a lookup for time by user+stage
    time_lookup = {}
    for t in user_time_stats:
        key = f"{t['_id']['user_id']}_{t['_id']['stage_id']}"
        time_lookup[key] = {
            "minutes": t["total_minutes"],
            "hours": round(t["total_minutes"] / 60, 2),
            "sessions": t["sessions"],
            "stage_name": t["_id"]["stage_name"]
        }
    
    # Combine frames and time for rate calculation
    user_rates = []
    user_totals = {}  # Aggregate by user
    
    for stat in user_frame_stats:
        user_id = stat["_id"]["user_id"]
        user_name = stat["_id"]["user_name"] or "Unknown"
        stage_id_key = stat["_id"]["stage_id"]
        frames = stat["frames_produced"]
        
        time_key = f"{user_id}_{stage_id_key}"
        time_data = time_lookup.get(time_key, {"minutes": 0, "hours": 0, "sessions": 0, "stage_name": "Unknown"})
        
        hours = time_data["hours"]
        rate = round(frames / hours, 1) if hours > 0 else 0
        
        # Track per-user totals
        if user_id not in user_totals:
            user_totals[user_id] = {
                "user_id": user_id,
                "user_name": user_name,
                "total_frames": 0,
                "total_hours": 0,
                "stages": []
            }
        
        user_totals[user_id]["total_frames"] += frames
        user_totals[user_id]["total_hours"] += hours
        user_totals[user_id]["stages"].append({
            "stage_id": stage_id_key,
            "stage_name": time_data["stage_name"],
            "frames": frames,
            "hours": hours,
            "rate": rate
        })
    
    # Calculate overall rate for each user
    for user_id, data in user_totals.items():
        data["overall_rate"] = round(data["total_frames"] / data["total_hours"], 1) if data["total_hours"] > 0 else 0
        user_rates.append(data)
    
    # Sort by overall rate descending
    user_rates.sort(key=lambda x: x["overall_rate"], reverse=True)
    
    # Get available stages for filter dropdown
    stages = await db.production_stages.find(
        {},
        {"_id": 0, "stage_id": 1, "name": 1, "order": 1}
    ).sort("order", 1).to_list(20)
    
    # Calculate overall average
    total_frames = sum(u["total_frames"] for u in user_rates)
    total_hours = sum(u["total_hours"] for u in user_rates)
    overall_avg = round(total_frames / total_hours, 1) if total_hours > 0 else 0
    
    return {
        "period": period,
        "period_label": period_label,
        "stage_filter": stage_id,
        "overall_average": overall_avg,
        "total_frames": total_frames,
        "total_hours": round(total_hours, 2),
        "user_rates": user_rates,
        "available_stages": stages
    }


@router.get("/stats/orders-in-production")
async def get_orders_in_production(user: User = Depends(get_current_user)):
    """Get list of orders currently in production (have batch_id set)"""
    
    # Fetch orders that are in production batches
    orders = await db.fulfillment_orders.find(
        {
            "batch_id": {"$ne": None},
            "status": {"$nin": ["shipped", "cancelled", "completed"]}
        },
        {
            "_id": 0,
            "order_id": 1,
            "order_number": 1,
            "customer_name": 1,
            "store_name": 1,
            "batch_id": 1,
            "batch_name": 1,
            "status": 1,
            "items": 1,
            "line_items": 1,
            "total_price": 1,
            "created_at": 1,
            "external_created_at": 1
        }
    ).sort("created_at", -1).to_list(500)
    
    # Get batch info for each order
    batch_ids = list(set(o.get("batch_id") for o in orders if o.get("batch_id")))
    batches = await db.production_batches.find(
        {"batch_id": {"$in": batch_ids}},
        {"_id": 0, "batch_id": 1, "name": 1, "current_stage_id": 1, "status": 1}
    ).to_list(100)
    
    batch_lookup = {b["batch_id"]: b for b in batches}
    
    # Enrich orders with batch info
    enriched_orders = []
    for order in orders:
        batch_info = batch_lookup.get(order.get("batch_id"), {})
        
        # Calculate item count
        items = order.get("items") or order.get("line_items") or []
        item_count = len(items) if isinstance(items, list) else 0
        total_qty = sum(item.get("quantity", 1) for item in items) if isinstance(items, list) else 0
        
        enriched_orders.append({
            "order_id": order.get("order_id"),
            "order_number": order.get("order_number"),
            "customer_name": order.get("customer_name"),
            "store_name": order.get("store_name"),
            "batch_id": order.get("batch_id"),
            "batch_name": batch_info.get("name") or order.get("batch_name"),
            "batch_stage": batch_info.get("current_stage_id"),
            "batch_status": batch_info.get("status"),
            "status": order.get("status"),
            "item_count": item_count,
            "total_qty": total_qty,
            "total_price": order.get("total_price"),
            "created_at": order.get("external_created_at") or order.get("created_at")
        })
    
    # Group by batch for summary
    batches_summary = {}
    for order in enriched_orders:
        bid = order.get("batch_id")
        if bid not in batches_summary:
            batches_summary[bid] = {
                "batch_id": bid,
                "batch_name": order.get("batch_name"),
                "batch_stage": order.get("batch_stage"),
                "order_count": 0
            }
        batches_summary[bid]["order_count"] += 1
    
    return {
        "total": len(enriched_orders),
        "orders": enriched_orders,
        "batches_summary": list(batches_summary.values())
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
    
    # Optimized: Only fetch fields that are actually needed
    projection = {
        "_id": 0,
        "log_id": 1,
        "user_id": 1,
        "user_name": 1,
        "order_id": 1,
        "batch_id": 1,
        "stage_id": 1,
        "stage_name": 1,
        "items_processed": 1,
        "duration_minutes": 1,
        "started_at": 1,
        "completed_at": 1,
        "created_at": 1
    }
    logs = await db.time_logs.find(query, projection).sort("created_at", -1).limit(1000).to_list(1000)
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



@router.get("/stats/batch/{batch_id}")
async def get_batch_report(batch_id: str, user: User = Depends(get_current_user)):
    """Get comprehensive time tracking report for a specific batch.
    
    Includes time from:
    - Production stages (frame manufacturing)
    - Fulfillment stages (order packing/shipping)
    
    Returns total time, cost, and breakdown by stage and user.
    """
    # Verify batch exists
    batch = await db.production_batches.find_one(
        {"batch_id": batch_id}, 
        {"_id": 0, "batch_id": 1, "name": 1, "order_ids": 1, "status": 1, "created_at": 1}
    )
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    order_ids = batch.get("order_ids", [])
    
    # Get production time logs for this batch (direct batch_id match)
    production_pipeline = [
        {"$match": {
            "$or": [
                {"batch_id": batch_id},
                {"batch_id": {"$exists": False}}  # Include legacy logs without batch_id
            ],
            "completed_at": {"$ne": None},
            "duration_minutes": {"$gt": 0}
        }},
        {"$group": {
            "_id": {"stage_id": "$stage_id", "stage_name": "$stage_name"},
            "total_minutes": {"$sum": "$duration_minutes"},
            "total_items": {"$sum": "$items_processed"},
            "session_count": {"$sum": 1},
            "users": {"$addToSet": {"user_id": "$user_id", "user_name": "$user_name"}}
        }}
    ]
    
    # For now, get all production logs (until batch_id is consistently tracked)
    # In production, filter by batch_id once data is available
    production_logs = await db.time_logs.aggregate([
        {"$match": {"completed_at": {"$ne": None}, "duration_minutes": {"$gt": 0}}},
        {"$group": {
            "_id": {"stage_id": "$stage_id", "stage_name": "$stage_name"},
            "total_minutes": {"$sum": "$duration_minutes"},
            "total_items": {"$sum": "$items_processed"},
            "session_count": {"$sum": 1}
        }}
    ]).to_list(100)
    
    # Get fulfillment time logs for orders in this batch
    fulfillment_pipeline = [
        {"$match": {
            "$or": [
                {"batch_id": batch_id},
                {"order_id": {"$in": order_ids}}
            ],
            "completed_at": {"$ne": None},
            "duration_minutes": {"$gt": 0}
        }},
        {"$group": {
            "_id": {"stage_id": "$stage_id", "stage_name": "$stage_name"},
            "total_minutes": {"$sum": "$duration_minutes"},
            "orders_processed": {"$sum": "$orders_processed"},
            "items_processed": {"$sum": "$items_processed"},
            "session_count": {"$sum": 1}
        }}
    ]
    fulfillment_logs = await db.fulfillment_time_logs.aggregate(fulfillment_pipeline).to_list(100)
    
    # Calculate totals
    production_minutes = sum(log.get("total_minutes", 0) for log in production_logs)
    fulfillment_minutes = sum(log.get("total_minutes", 0) for log in fulfillment_logs)
    total_minutes = production_minutes + fulfillment_minutes
    total_hours = total_minutes / 60
    
    # Cost calculation
    hourly_rate = 22.0  # Default hourly rate
    production_cost = (production_minutes / 60) * hourly_rate
    fulfillment_cost = (fulfillment_minutes / 60) * hourly_rate
    total_cost = total_hours * hourly_rate
    
    # Get frame stats for this batch
    frame_stats = await db.batch_frames.aggregate([
        {"$match": {"batch_id": batch_id}},
        {"$group": {
            "_id": None,
            "total_frames": {"$sum": "$qty_required"},
            "completed_frames": {"$sum": "$qty_completed"},
            "rejected_frames": {"$sum": {"$ifNull": ["$qty_rejected", 0]}}
        }}
    ]).to_list(1)
    
    frames = frame_stats[0] if frame_stats else {"total_frames": 0, "completed_frames": 0, "rejected_frames": 0}
    good_frames = max(0, frames.get("completed_frames", 0) - frames.get("rejected_frames", 0))
    cost_per_frame = total_cost / good_frames if good_frames > 0 else 0
    
    # Format stage breakdowns
    production_stages = [
        {
            "stage_id": log["_id"]["stage_id"],
            "stage_name": log["_id"]["stage_name"],
            "workflow": "production",
            "total_minutes": round(log.get("total_minutes", 0), 2),
            "total_hours": round(log.get("total_minutes", 0) / 60, 2),
            "items_processed": log.get("total_items", 0),
            "sessions": log.get("session_count", 0),
            "cost": round((log.get("total_minutes", 0) / 60) * hourly_rate, 2)
        }
        for log in production_logs
    ]
    
    fulfillment_stages = [
        {
            "stage_id": log["_id"]["stage_id"],
            "stage_name": log["_id"]["stage_name"],
            "workflow": "fulfillment",
            "total_minutes": round(log.get("total_minutes", 0), 2),
            "total_hours": round(log.get("total_minutes", 0) / 60, 2),
            "orders_processed": log.get("orders_processed", 0),
            "items_processed": log.get("items_processed", 0),
            "sessions": log.get("session_count", 0),
            "cost": round((log.get("total_minutes", 0) / 60) * hourly_rate, 2)
        }
        for log in fulfillment_logs
    ]
    
    return {
        "batch": {
            "batch_id": batch_id,
            "name": batch.get("name"),
            "status": batch.get("status"),
            "created_at": batch.get("created_at"),
            "order_count": len(order_ids)
        },
        "frames": {
            "total": frames.get("total_frames", 0),
            "completed": frames.get("completed_frames", 0),
            "rejected": frames.get("rejected_frames", 0),
            "good": good_frames
        },
        "time": {
            "production_minutes": round(production_minutes, 2),
            "production_hours": round(production_minutes / 60, 2),
            "fulfillment_minutes": round(fulfillment_minutes, 2),
            "fulfillment_hours": round(fulfillment_minutes / 60, 2),
            "total_minutes": round(total_minutes, 2),
            "total_hours": round(total_hours, 2)
        },
        "costs": {
            "hourly_rate": hourly_rate,
            "production_cost": round(production_cost, 2),
            "fulfillment_cost": round(fulfillment_cost, 2),
            "total_cost": round(total_cost, 2),
            "cost_per_frame": round(cost_per_frame, 2)
        },
        "stages": {
            "production": production_stages,
            "fulfillment": fulfillment_stages
        }
    }


@router.get("/stats/batches-summary")
async def get_batches_summary(
    limit: int = 50,
    user: User = Depends(get_current_user)
):
    """Get summary of time tracking and costs across recent batches.
    
    Aggregates production AND fulfillment time for accurate batch costing.
    """
    # Get recent batches
    batches = await db.production_batches.find(
        {}, 
        {"_id": 0, "batch_id": 1, "name": 1, "status": 1, "order_ids": 1, "created_at": 1}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    
    if not batches:
        return {"batches": [], "totals": {}}
    
    batch_ids = [b["batch_id"] for b in batches]
    all_order_ids = []
    for b in batches:
        all_order_ids.extend(b.get("order_ids", []))
    
    # Aggregate production time by batch
    production_by_batch = await db.time_logs.aggregate([
        {"$match": {"batch_id": {"$in": batch_ids}, "completed_at": {"$ne": None}}},
        {"$group": {
            "_id": "$batch_id",
            "total_minutes": {"$sum": "$duration_minutes"},
            "items_processed": {"$sum": "$items_processed"}
        }}
    ]).to_list(100)
    prod_map = {p["_id"]: p for p in production_by_batch}
    
    # Aggregate fulfillment time by batch (via order_ids or batch_id)
    fulfillment_by_batch = await db.fulfillment_time_logs.aggregate([
        {"$match": {
            "$or": [
                {"batch_id": {"$in": batch_ids}},
                {"order_id": {"$in": all_order_ids}}
            ],
            "completed_at": {"$ne": None}
        }},
        {"$group": {
            "_id": "$batch_id",
            "total_minutes": {"$sum": "$duration_minutes"},
            "orders_processed": {"$sum": "$orders_processed"}
        }}
    ]).to_list(100)
    fulfill_map = {f["_id"]: f for f in fulfillment_by_batch if f["_id"]}
    
    # Get frame stats per batch
    frame_stats = await db.batch_frames.aggregate([
        {"$match": {"batch_id": {"$in": batch_ids}}},
        {"$group": {
            "_id": "$batch_id",
            "total_frames": {"$sum": "$qty_required"},
            "completed": {"$sum": "$qty_completed"},
            "rejected": {"$sum": {"$ifNull": ["$qty_rejected", 0]}}
        }}
    ]).to_list(100)
    frame_map = {f["_id"]: f for f in frame_stats}
    
    hourly_rate = 22.0
    batch_summaries = []
    total_production_minutes = 0
    total_fulfillment_minutes = 0
    total_cost = 0
    total_good_frames = 0
    
    for batch in batches:
        bid = batch["batch_id"]
        
        prod = prod_map.get(bid, {"total_minutes": 0, "items_processed": 0})
        fulfill = fulfill_map.get(bid, {"total_minutes": 0, "orders_processed": 0})
        frames = frame_map.get(bid, {"total_frames": 0, "completed": 0, "rejected": 0})
        
        prod_mins = prod.get("total_minutes", 0)
        fulfill_mins = fulfill.get("total_minutes", 0)
        total_mins = prod_mins + fulfill_mins
        batch_cost = (total_mins / 60) * hourly_rate
        
        good_frames = max(0, frames.get("completed", 0) - frames.get("rejected", 0))
        cost_per_frame = batch_cost / good_frames if good_frames > 0 else 0
        
        batch_summaries.append({
            "batch_id": bid,
            "name": batch.get("name"),
            "status": batch.get("status"),
            "created_at": batch.get("created_at"),
            "order_count": len(batch.get("order_ids", [])),
            "frames": {
                "total": frames.get("total_frames", 0),
                "completed": frames.get("completed", 0),
                "good": good_frames
            },
            "time": {
                "production_hours": round(prod_mins / 60, 2),
                "fulfillment_hours": round(fulfill_mins / 60, 2),
                "total_hours": round(total_mins / 60, 2)
            },
            "cost": {
                "total": round(batch_cost, 2),
                "per_frame": round(cost_per_frame, 2)
            }
        })
        
        total_production_minutes += prod_mins
        total_fulfillment_minutes += fulfill_mins
        total_cost += batch_cost
        total_good_frames += good_frames
    
    return {
        "batches": batch_summaries,
        "totals": {
            "batch_count": len(batches),
            "production_hours": round(total_production_minutes / 60, 2),
            "fulfillment_hours": round(total_fulfillment_minutes / 60, 2),
            "total_hours": round((total_production_minutes + total_fulfillment_minutes) / 60, 2),
            "total_cost": round(total_cost, 2),
            "total_good_frames": total_good_frames,
            "avg_cost_per_frame": round(total_cost / total_good_frames, 2) if total_good_frames > 0 else 0
        }
    }

