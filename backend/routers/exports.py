from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from typing import Optional
from datetime import datetime, timezone, timedelta
import csv
import io

from database import db
from models.user import User
from dependencies import get_current_user

router = APIRouter(prefix="/export", tags=["export"])

@router.get("/orders")
async def export_orders_csv(user: User = Depends(get_current_user)):
    """Export orders to CSV"""
    orders = await db.orders.find({}, {"_id": 0}).sort("created_at", -1).to_list(10000)
    
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Header
    writer.writerow([
        "Order ID", "External ID", "Store", "Platform", "Customer", 
        "Email", "Status", "Stage", "Batch ID", "Total Price", 
        "Currency", "Created At"
    ])
    
    # Data
    for order in orders:
        writer.writerow([
            order.get("order_id", ""),
            order.get("external_id", ""),
            order.get("store_name", ""),
            order.get("platform", ""),
            order.get("customer_name", ""),
            order.get("customer_email", ""),
            order.get("status", ""),
            order.get("current_stage_id", ""),
            order.get("batch_id", ""),
            order.get("total_price", 0),
            order.get("currency", "USD"),
            order.get("created_at", "")
        ])
    
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=orders_{datetime.now().strftime('%Y%m%d')}.csv"}
    )

@router.get("/time-logs")
async def export_time_logs_csv(user: User = Depends(get_current_user)):
    """Export time logs to CSV"""
    logs = await db.time_logs.find({}, {"_id": 0}).sort("created_at", -1).to_list(10000)
    
    output = io.StringIO()
    writer = csv.writer(output)
    
    writer.writerow([
        "Log ID", "User", "Stage", "Action", "Started At", 
        "Completed At", "Duration (min)", "Items Processed", "Is Paused"
    ])
    
    for log in logs:
        writer.writerow([
            log.get("log_id", ""),
            log.get("user_name", ""),
            log.get("stage_name", ""),
            log.get("action", ""),
            log.get("started_at", ""),
            log.get("completed_at", ""),
            log.get("duration_minutes", ""),
            log.get("items_processed", 0),
            log.get("is_paused", False)
        ])
    
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=time_logs_{datetime.now().strftime('%Y%m%d')}.csv"}
    )

@router.get("/team-stats")
async def export_team_stats_csv(
    period: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Export team statistics to CSV with optional date filtering
    
    Periods: day, week, month, or use custom start_date/end_date
    """
    # Build date filter
    date_filter = {}
    if period == "day":
        today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        date_filter = {"started_at": {"$gte": today.isoformat()}}
    elif period == "week":
        week_start = datetime.now(timezone.utc) - timedelta(days=7)
        date_filter = {"started_at": {"$gte": week_start.isoformat()}}
    elif period == "month":
        month_start = datetime.now(timezone.utc) - timedelta(days=30)
        date_filter = {"started_at": {"$gte": month_start.isoformat()}}
    elif start_date and end_date:
        date_filter = {
            "started_at": {"$gte": start_date, "$lte": end_date + "T23:59:59"}
        }
    
    # Aggregate user stats
    match_stage = {"$match": {"duration_minutes": {"$gt": 0}}}
    if date_filter:
        match_stage["$match"].update(date_filter)
    
    pipeline = [
        match_stage,
        {"$group": {
            "_id": {"user_id": "$user_id", "user_name": "$user_name"},
            "total_items": {"$sum": "$items_processed"},
            "total_minutes": {"$sum": "$duration_minutes"},
            "sessions": {"$sum": 1},
            "stages_worked": {"$addToSet": "$stage_name"}
        }}
    ]
    
    stats = await db.time_logs.aggregate(pipeline).to_list(100)
    
    # Get user info for roles
    users = await db.users.find({}, {"_id": 0, "user_id": 1, "role": 1, "email": 1}).to_list(100)
    user_map = {u["user_id"]: u for u in users}
    
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Header
    writer.writerow([
        "User Name", "Email", "Role", "Total Items Processed", 
        "Total Hours", "Sessions", "Items Per Hour", "Stages Worked",
        "Labor Cost ($22/hr)"
    ])
    
    hourly_rate = 22.0
    
    for stat in stats:
        user_id = stat["_id"]["user_id"]
        user_info = user_map.get(user_id, {})
        total_hours = round(stat["total_minutes"] / 60, 2)
        items_per_hour = round((stat["total_items"] / stat["total_minutes"]) * 60, 1) if stat["total_minutes"] > 0 else 0
        labor_cost = round(total_hours * hourly_rate, 2)
        
        writer.writerow([
            stat["_id"]["user_name"],
            user_info.get("email", ""),
            user_info.get("role", "worker"),
            stat["total_items"],
            total_hours,
            stat["sessions"],
            items_per_hour,
            ", ".join(stat.get("stages_worked", [])),
            labor_cost
        ])
    
    # Add totals row
    total_items = sum(s["total_items"] for s in stats)
    total_minutes = sum(s["total_minutes"] for s in stats)
    total_hours = round(total_minutes / 60, 2)
    total_sessions = sum(s["sessions"] for s in stats)
    avg_items_per_hour = round((total_items / total_minutes) * 60, 1) if total_minutes > 0 else 0
    total_labor_cost = round(total_hours * hourly_rate, 2)
    
    writer.writerow([])
    writer.writerow([
        "TOTALS", "", "", total_items, total_hours, total_sessions,
        avg_items_per_hour, "", total_labor_cost
    ])
    
    period_label = period or "all_time"
    if start_date and end_date:
        period_label = f"{start_date}_to_{end_date}"
    
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=team_stats_{period_label}_{datetime.now().strftime('%Y%m%d')}.csv"}
    )


@router.get("/user-stats")
async def export_user_stats_csv(user: User = Depends(get_current_user)):
    """Export user statistics to CSV"""
    pipeline = [
        {"$match": {"duration_minutes": {"$gt": 0}}},
        {"$group": {
            "_id": {"user_id": "$user_id", "user_name": "$user_name"},
            "total_items": {"$sum": "$items_processed"},
            "total_minutes": {"$sum": "$duration_minutes"},
            "sessions": {"$sum": 1}
        }}
    ]
    stats = await db.time_logs.aggregate(pipeline).to_list(100)
    
    output = io.StringIO()
    writer = csv.writer(output)
    
    writer.writerow([
        "User ID", "User Name", "Total Items", "Total Hours", 
        "Sessions", "Items Per Hour"
    ])
    
    for stat in stats:
        total_hours = round(stat["total_minutes"] / 60, 2)
        items_per_hour = round((stat["total_items"] / stat["total_minutes"]) * 60, 1) if stat["total_minutes"] > 0 else 0
        
        writer.writerow([
            stat["_id"]["user_id"],
            stat["_id"]["user_name"],
            stat["total_items"],
            total_hours,
            stat["sessions"],
            items_per_hour
        ])
    
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=user_stats_{datetime.now().strftime('%Y%m%d')}.csv"}
    )

@router.get("/production-kpis")
async def export_production_kpis_csv(user: User = Depends(get_current_user)):
    """Export production KPIs including rejection rate and costs"""
    # Get all batches with their stats
    batches = await db.production_batches.find({}, {"_id": 0}).to_list(1000)
    
    output = io.StringIO()
    writer = csv.writer(output)
    
    writer.writerow([
        "Batch ID", "Batch Name", "Status", "Total Required", "Total Completed",
        "Total Rejected", "Good Frames", "Rejection Rate %", "Total Hours",
        "Labor Cost ($)", "Avg Cost Per Frame ($)", "Created At"
    ])
    
    hourly_rate = 22.0
    
    for batch in batches:
        batch_id = batch.get("batch_id")
        
        # Get items for this batch
        items = await db.production_items.find({"batch_id": batch_id}, {"_id": 0}).to_list(10000)
        
        total_required = sum(item.get("qty_required", 0) for item in items)
        total_completed = sum(item.get("qty_completed", 0) for item in items)
        total_rejected = sum(item.get("qty_rejected", 0) for item in items)
        good_frames = max(0, total_completed - total_rejected)
        
        rejection_rate = round((total_rejected / total_completed * 100), 1) if total_completed > 0 else 0
        
        # Get time logs
        time_logs = await db.time_logs.find({"completed_at": {"$ne": None}}, {"_id": 0}).to_list(10000)
        total_minutes = sum(log.get("duration_minutes", 0) for log in time_logs)
        total_hours = total_minutes / 60
        
        labor_cost = round(total_hours * hourly_rate, 2)
        avg_cost = round(labor_cost / good_frames, 2) if good_frames > 0 else 0
        
        writer.writerow([
            batch_id,
            batch.get("name", ""),
            batch.get("status", ""),
            total_required,
            total_completed,
            total_rejected,
            good_frames,
            rejection_rate,
            round(total_hours, 2),
            labor_cost,
            avg_cost,
            batch.get("created_at", "")
        ])
    
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=production_kpis_{datetime.now().strftime('%Y%m%d')}.csv"}
    )

@router.get("/inventory")
async def export_inventory_csv(user: User = Depends(get_current_user)):
    """Export inventory to CSV"""
    items = await db.inventory.find({}, {"_id": 0}).sort("name", 1).to_list(10000)
    
    output = io.StringIO()
    writer = csv.writer(output)
    
    writer.writerow([
        "Item ID", "SKU", "Name", "Color", "Size", "Quantity", 
        "Min Stock", "Location", "Is Rejected", "Updated At"
    ])
    
    for item in items:
        writer.writerow([
            item.get("item_id", ""),
            item.get("sku", ""),
            item.get("name", ""),
            item.get("color", ""),
            item.get("size", ""),
            item.get("quantity", 0),
            item.get("min_stock", 10),
            item.get("location", ""),
            item.get("is_rejected", False),
            item.get("updated_at", "")
        ])
    
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=inventory_{datetime.now().strftime('%Y%m%d')}.csv"}
    )

@router.get("/report-pdf")
async def export_full_report_pdf(user: User = Depends(get_current_user)):
    """Generate a full PDF report with all KPIs"""
    # Get all stats
    total_orders = await db.orders.count_documents({})
    pending = await db.orders.count_documents({"status": "pending"})
    in_production = await db.orders.count_documents({"status": "in_production"})
    completed = await db.orders.count_documents({"status": "completed"})
    
    # Get production stats
    items = await db.production_items.find({}, {"_id": 0}).to_list(10000)
    total_required = sum(item.get("qty_required", 0) for item in items)
    total_completed = sum(item.get("qty_completed", 0) for item in items)
    total_rejected = sum(item.get("qty_rejected", 0) for item in items)
    good_frames = max(0, total_completed - total_rejected)
    
    # Time stats
    time_logs = await db.time_logs.find({"completed_at": {"$ne": None}}, {"_id": 0}).to_list(10000)
    total_minutes = sum(log.get("duration_minutes", 0) for log in time_logs)
    total_hours = total_minutes / 60
    total_items_processed = sum(log.get("items_processed", 0) for log in time_logs)
    
    # Cost calculations
    hourly_rate = 22.0
    labor_cost = total_hours * hourly_rate
    avg_cost_per_frame = labor_cost / good_frames if good_frames > 0 else 0
    rejection_rate = (total_rejected / total_completed * 100) if total_completed > 0 else 0
    avg_items_per_hour = (total_items_processed / total_minutes * 60) if total_minutes > 0 else 0
    
    # Inventory stats
    inventory = await db.inventory.find({}, {"_id": 0}).to_list(10000)
    good_inventory = [i for i in inventory if not i.get("is_rejected")]
    rejected_inventory = [i for i in inventory if i.get("is_rejected")]
    total_good_stock = sum(i.get("quantity", 0) for i in good_inventory)
    total_rejected_stock = sum(i.get("quantity", 0) for i in rejected_inventory)
    
    # Generate simple text-based report (proper PDF would require reportlab)
    report_date = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    report_content = f"""
================================================================================
                        SHOPFACTORY PRODUCTION REPORT
                        Generated: {report_date}
================================================================================

ORDER SUMMARY
-------------
Total Orders:        {total_orders}
Pending:             {pending}
In Production:       {in_production}
Completed:           {completed}

PRODUCTION METRICS
------------------
Total Items Required:    {total_required}
Total Items Completed:   {total_completed}
Total Items Rejected:    {total_rejected}
Good Frames Produced:    {good_frames}

QUALITY METRICS
---------------
Rejection Rate:          {rejection_rate:.1f}%
Good Frame Yield:        {(100 - rejection_rate):.1f}%

TIME & LABOR
------------
Total Hours Logged:      {total_hours:.1f} hours
Total Items Processed:   {total_items_processed}
Avg Items Per Hour:      {avg_items_per_hour:.1f}

COST ANALYSIS
-------------
Hourly Labor Rate:       ${hourly_rate:.2f}
Total Labor Cost:        ${labor_cost:.2f}
Avg Cost Per Frame:      ${avg_cost_per_frame:.2f}

INVENTORY STATUS
----------------
Good Stock Items:        {len(good_inventory)} SKUs ({total_good_stock} units)
Rejected Stock Items:    {len(rejected_inventory)} SKUs ({total_rejected_stock} units)

================================================================================
                              END OF REPORT
================================================================================
"""
    
    # Return as downloadable text file (for proper PDF, use reportlab library)
    return StreamingResponse(
        iter([report_content]),
        media_type="text/plain",
        headers={"Content-Disposition": f"attachment; filename=production_report_{datetime.now().strftime('%Y%m%d')}.txt"}
    )
