"""
CRM Reports & Dashboards Router
Provides sales pipeline analytics, forecasting, and performance metrics
"""
from fastapi import APIRouter, Depends, Query
from datetime import datetime, timezone, timedelta
from typing import Optional
from zoneinfo import ZoneInfo

from database import db
from models.user import User
from dependencies import get_current_user

router = APIRouter(prefix="/crm/reports", tags=["crm-reports"])

EST_TZ = ZoneInfo("America/New_York")


def get_date_range(period: str):
    """Get start and end dates for a period"""
    now = datetime.now(EST_TZ)
    
    if period == "today":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        end = now
        label = "Today"
    elif period == "yesterday":
        start = (now - timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
        end = start.replace(hour=23, minute=59, second=59)
        label = "Yesterday"
    elif period == "this_week":
        start = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
        end = now
        label = "This Week"
    elif period == "last_week":
        this_week_start = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
        start = this_week_start - timedelta(days=7)
        end = this_week_start - timedelta(seconds=1)
        label = "Last Week"
    elif period == "this_month":
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        end = now
        label = now.strftime("%B %Y")
    elif period == "last_month":
        first_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        end = first_of_month - timedelta(seconds=1)
        start = end.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        label = start.strftime("%B %Y")
    elif period == "this_quarter":
        quarter = (now.month - 1) // 3
        start = now.replace(month=quarter * 3 + 1, day=1, hour=0, minute=0, second=0, microsecond=0)
        end = now
        label = f"Q{quarter + 1} {now.year}"
    elif period == "this_year":
        start = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
        end = now
        label = str(now.year)
    else:
        # Default to this month
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        end = now
        label = now.strftime("%B %Y")
    
    return start.isoformat(), end.isoformat(), label


# ==================== SALES DASHBOARD ====================

@router.get("/dashboard")
async def get_sales_dashboard(
    period: str = Query("this_month"),
    owner_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get sales dashboard metrics"""
    start_date, end_date, period_label = get_date_range(period)
    
    # Build owner filter
    owner_query = {}
    if owner_id:
        owner_query["owner_id"] = owner_id
    elif user.role == "worker":
        owner_query["owner_id"] = user.user_id
    
    # Pipeline metrics
    pipeline_query = {
        "stage": {"$nin": ["closed_won", "closed_lost"]},
        **owner_query
    }
    pipeline_opps = await db.crm_opportunities.find(pipeline_query, {"_id": 0}).to_list(1000)
    
    total_pipeline = sum(o.get("amount", 0) for o in pipeline_opps)
    weighted_pipeline = sum(o.get("amount", 0) * (o.get("probability", 0) / 100) for o in pipeline_opps)
    
    # Closed won this period
    won_query = {
        "stage": "closed_won",
        "closed_at": {"$gte": start_date, "$lte": end_date},
        **owner_query
    }
    won_opps = await db.crm_opportunities.find(won_query, {"_id": 0}).to_list(500)
    total_won = sum(o.get("amount", 0) for o in won_opps)
    
    # Closed lost this period
    lost_query = {
        "stage": "closed_lost",
        "closed_at": {"$gte": start_date, "$lte": end_date},
        **owner_query
    }
    lost_opps = await db.crm_opportunities.find(lost_query, {"_id": 0}).to_list(500)
    total_lost = sum(o.get("amount", 0) for o in lost_opps)
    
    # Win rate
    total_closed = len(won_opps) + len(lost_opps)
    win_rate = (len(won_opps) / total_closed * 100) if total_closed > 0 else 0
    
    # New leads this period
    lead_query = {
        "created_at": {"$gte": start_date, "$lte": end_date},
        **owner_query
    }
    new_leads = await db.crm_leads.count_documents(lead_query)
    
    # Converted leads this period
    converted_query = {
        "status": "converted",
        "converted_at": {"$gte": start_date, "$lte": end_date},
        **owner_query
    }
    converted_leads = await db.crm_leads.count_documents(converted_query)
    
    # Lead conversion rate
    all_leads_period = await db.crm_leads.count_documents({
        "created_at": {"$gte": start_date},
        **owner_query
    })
    conversion_rate = (converted_leads / all_leads_period * 100) if all_leads_period > 0 else 0
    
    # Activities completed this period
    activities_query = {
        "action": {"$in": ["created", "updated"]},
        "created_at": {"$gte": start_date, "$lte": end_date}
    }
    if owner_query:
        activities_query["user_id"] = owner_query.get("owner_id")
    activities_count = await db.crm_activity_log.count_documents(activities_query)
    
    # Tasks due
    tasks_due = await db.crm_tasks.count_documents({
        "status": {"$in": ["not_started", "in_progress"]},
        "due_date": {"$lte": datetime.now(EST_TZ).strftime("%Y-%m-%d")},
        "assigned_to": owner_query.get("owner_id", user.user_id)
    })
    
    # Pipeline by stage
    stage_breakdown = {}
    for opp in pipeline_opps:
        stage = opp.get("stage", "unknown")
        if stage not in stage_breakdown:
            stage_breakdown[stage] = {"count": 0, "amount": 0}
        stage_breakdown[stage]["count"] += 1
        stage_breakdown[stage]["amount"] += opp.get("amount", 0)
    
    return {
        "period": period,
        "period_label": period_label,
        "metrics": {
            "total_pipeline": round(total_pipeline, 2),
            "weighted_pipeline": round(weighted_pipeline, 2),
            "open_opportunities": len(pipeline_opps),
            "closed_won": round(total_won, 2),
            "closed_won_count": len(won_opps),
            "closed_lost": round(total_lost, 2),
            "closed_lost_count": len(lost_opps),
            "win_rate": round(win_rate, 1),
            "new_leads": new_leads,
            "converted_leads": converted_leads,
            "conversion_rate": round(conversion_rate, 1),
            "activities_completed": activities_count,
            "tasks_overdue": tasks_due
        },
        "pipeline_by_stage": stage_breakdown
    }


# ==================== PIPELINE REPORT ====================

@router.get("/pipeline-by-stage")
async def get_pipeline_by_stage(
    owner_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get pipeline breakdown by stage"""
    query = {"stage": {"$nin": ["closed_won", "closed_lost"]}}
    if owner_id:
        query["owner_id"] = owner_id
    elif user.role == "worker":
        query["owner_id"] = user.user_id
    
    pipeline = [
        {"$match": query},
        {"$group": {
            "_id": "$stage",
            "count": {"$sum": 1},
            "total_amount": {"$sum": "$amount"},
            "weighted_amount": {"$sum": {"$multiply": ["$amount", {"$divide": ["$probability", 100]}]}},
            "avg_probability": {"$avg": "$probability"}
        }},
        {"$sort": {"_id": 1}}
    ]
    
    results = await db.crm_opportunities.aggregate(pipeline).to_list(20)
    
    # Map to readable names
    stage_names = {
        "prospecting": "Prospecting",
        "qualification": "Qualification",
        "needs_analysis": "Needs Analysis",
        "proposal": "Proposal",
        "negotiation": "Negotiation"
    }
    
    stage_order = ["prospecting", "qualification", "needs_analysis", "proposal", "negotiation"]
    
    formatted = []
    for stage in stage_order:
        found = next((r for r in results if r["_id"] == stage), None)
        if found:
            formatted.append({
                "stage": stage,
                "stage_name": stage_names.get(stage, stage),
                "count": found["count"],
                "total_amount": round(found["total_amount"], 2),
                "weighted_amount": round(found["weighted_amount"], 2),
                "avg_probability": round(found["avg_probability"], 1)
            })
        else:
            formatted.append({
                "stage": stage,
                "stage_name": stage_names.get(stage, stage),
                "count": 0,
                "total_amount": 0,
                "weighted_amount": 0,
                "avg_probability": 0
            })
    
    totals = {
        "total_count": sum(s["count"] for s in formatted),
        "total_amount": sum(s["total_amount"] for s in formatted),
        "total_weighted": sum(s["weighted_amount"] for s in formatted)
    }
    
    return {"stages": formatted, "totals": totals}


@router.get("/pipeline-by-rep")
async def get_pipeline_by_rep(
    user: User = Depends(get_current_user)
):
    """Get pipeline breakdown by sales rep"""
    if user.role not in ["admin", "manager"]:
        # Workers can only see their own
        query = {"owner_id": user.user_id, "stage": {"$nin": ["closed_won", "closed_lost"]}}
    else:
        query = {"stage": {"$nin": ["closed_won", "closed_lost"]}}
    
    pipeline = [
        {"$match": query},
        {"$group": {
            "_id": {"owner_id": "$owner_id", "owner_name": "$owner_name"},
            "count": {"$sum": 1},
            "total_amount": {"$sum": "$amount"},
            "weighted_amount": {"$sum": {"$multiply": ["$amount", {"$divide": ["$probability", 100]}]}}
        }},
        {"$sort": {"total_amount": -1}}
    ]
    
    results = await db.crm_opportunities.aggregate(pipeline).to_list(100)
    
    formatted = [{
        "owner_id": r["_id"]["owner_id"],
        "owner_name": r["_id"]["owner_name"] or "Unknown",
        "count": r["count"],
        "total_amount": round(r["total_amount"], 2),
        "weighted_amount": round(r["weighted_amount"], 2)
    } for r in results]
    
    return {"reps": formatted}


# ==================== FORECAST REPORT ====================

@router.get("/forecast")
async def get_forecast(
    period: str = Query("this_quarter"),
    owner_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get sales forecast by month"""
    now = datetime.now(EST_TZ)
    
    # Get opportunities closing in next 3 months
    query = {"stage": {"$nin": ["closed_won", "closed_lost"]}}
    if owner_id:
        query["owner_id"] = owner_id
    elif user.role == "worker":
        query["owner_id"] = user.user_id
    
    opportunities = await db.crm_opportunities.find(query, {"_id": 0}).to_list(1000)
    
    # Group by close month
    forecast = {}
    for opp in opportunities:
        close_date = opp.get("close_date", "")[:7]  # YYYY-MM
        if close_date:
            if close_date not in forecast:
                forecast[close_date] = {
                    "pipeline": 0,
                    "best_case": 0,
                    "commit": 0,
                    "count": 0
                }
            amount = opp.get("amount", 0)
            prob = opp.get("probability", 0)
            forecast[close_date]["count"] += 1
            forecast[close_date]["pipeline"] += amount
            
            # Categorize by forecast category
            cat = opp.get("forecast_category", "pipeline")
            if cat == "commit":
                forecast[close_date]["commit"] += amount
                forecast[close_date]["best_case"] += amount
            elif cat == "best_case":
                forecast[close_date]["best_case"] += amount
    
    # Sort by month
    sorted_forecast = sorted(forecast.items())
    
    return {
        "forecast": [{
            "month": month,
            "pipeline": round(data["pipeline"], 2),
            "best_case": round(data["best_case"], 2),
            "commit": round(data["commit"], 2),
            "count": data["count"]
        } for month, data in sorted_forecast]
    }


# ==================== WIN/LOSS ANALYSIS ====================

@router.get("/win-loss-analysis")
async def get_win_loss_analysis(
    period: str = Query("this_year"),
    owner_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Analyze win/loss trends"""
    start_date, end_date, period_label = get_date_range(period)
    
    query = {
        "stage": {"$in": ["closed_won", "closed_lost"]},
        "closed_at": {"$gte": start_date, "$lte": end_date}
    }
    if owner_id:
        query["owner_id"] = owner_id
    elif user.role == "worker":
        query["owner_id"] = user.user_id
    
    closed_opps = await db.crm_opportunities.find(query, {"_id": 0}).to_list(1000)
    
    won = [o for o in closed_opps if o.get("stage") == "closed_won"]
    lost = [o for o in closed_opps if o.get("stage") == "closed_lost"]
    
    # Calculate metrics
    won_amount = sum(o.get("amount", 0) for o in won)
    lost_amount = sum(o.get("amount", 0) for o in lost)
    total_closed = len(won) + len(lost)
    win_rate = (len(won) / total_closed * 100) if total_closed > 0 else 0
    
    # Average sales cycle (days from creation to close)
    cycle_days = []
    for opp in won:
        created = opp.get("created_at", "")
        closed = opp.get("closed_at", "")
        if created and closed:
            try:
                created_dt = datetime.fromisoformat(created.replace('Z', '+00:00'))
                closed_dt = datetime.fromisoformat(closed.replace('Z', '+00:00'))
                days = (closed_dt - created_dt).days
                if days >= 0:
                    cycle_days.append(days)
            except:
                pass
    
    avg_cycle = sum(cycle_days) / len(cycle_days) if cycle_days else 0
    
    # Loss reasons
    loss_reasons = {}
    for opp in lost:
        reason = opp.get("closed_reason", "Not specified")
        loss_reasons[reason] = loss_reasons.get(reason, 0) + 1
    
    # Win/loss by month
    by_month = {}
    for opp in closed_opps:
        month = opp.get("closed_at", "")[:7]
        if month:
            if month not in by_month:
                by_month[month] = {"won": 0, "lost": 0, "won_amount": 0, "lost_amount": 0}
            if opp.get("stage") == "closed_won":
                by_month[month]["won"] += 1
                by_month[month]["won_amount"] += opp.get("amount", 0)
            else:
                by_month[month]["lost"] += 1
                by_month[month]["lost_amount"] += opp.get("amount", 0)
    
    return {
        "period": period_label,
        "summary": {
            "total_won": len(won),
            "total_lost": len(lost),
            "won_amount": round(won_amount, 2),
            "lost_amount": round(lost_amount, 2),
            "win_rate": round(win_rate, 1),
            "avg_sales_cycle_days": round(avg_cycle, 1)
        },
        "loss_reasons": [{"reason": k, "count": v} for k, v in sorted(loss_reasons.items(), key=lambda x: -x[1])],
        "by_month": [{"month": k, **v} for k, v in sorted(by_month.items())]
    }


# ==================== LEADS REPORT ====================

@router.get("/leads-by-source")
async def get_leads_by_source(
    period: str = Query("this_month"),
    owner_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get leads breakdown by source"""
    start_date, end_date, period_label = get_date_range(period)
    
    query = {"created_at": {"$gte": start_date, "$lte": end_date}}
    if owner_id:
        query["owner_id"] = owner_id
    elif user.role == "worker":
        query["owner_id"] = user.user_id
    
    pipeline = [
        {"$match": query},
        {"$group": {
            "_id": "$source",
            "total": {"$sum": 1},
            "converted": {"$sum": {"$cond": [{"$eq": ["$status", "converted"]}, 1, 0]}},
            "qualified": {"$sum": {"$cond": [{"$eq": ["$status", "qualified"]}, 1, 0]}}
        }},
        {"$sort": {"total": -1}}
    ]
    
    results = await db.crm_leads.aggregate(pipeline).to_list(20)
    
    formatted = [{
        "source": r["_id"] or "unknown",
        "total": r["total"],
        "converted": r["converted"],
        "qualified": r["qualified"],
        "conversion_rate": round((r["converted"] / r["total"] * 100) if r["total"] > 0 else 0, 1)
    } for r in results]
    
    return {"period": period_label, "sources": formatted}


# ==================== ACTIVITY REPORT ====================

@router.get("/activity-summary")
async def get_activity_summary(
    period: str = Query("this_week"),
    owner_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get activity summary by user"""
    start_date, end_date, period_label = get_date_range(period)
    
    query = {"created_at": {"$gte": start_date, "$lte": end_date}}
    
    if user.role not in ["admin", "manager"]:
        query["user_id"] = user.user_id
    elif owner_id:
        query["user_id"] = owner_id
    
    pipeline = [
        {"$match": query},
        {"$group": {
            "_id": {"user_id": "$user_id", "user_name": "$user_name"},
            "total_activities": {"$sum": 1},
            "notes": {"$sum": {"$cond": [{"$eq": ["$record_type", "note"]}, 1, 0]}},
            "tasks": {"$sum": {"$cond": [{"$eq": ["$record_type", "task"]}, 1, 0]}},
            "events": {"$sum": {"$cond": [{"$eq": ["$record_type", "event"]}, 1, 0]}},
            "updates": {"$sum": {"$cond": [{"$eq": ["$action", "updated"]}, 1, 0]}}
        }},
        {"$sort": {"total_activities": -1}}
    ]
    
    results = await db.crm_activity_log.aggregate(pipeline).to_list(100)
    
    formatted = [{
        "user_id": r["_id"]["user_id"],
        "user_name": r["_id"]["user_name"] or "Unknown",
        "total_activities": r["total_activities"],
        "notes": r["notes"],
        "tasks": r["tasks"],
        "events": r["events"],
        "updates": r["updates"]
    } for r in results]
    
    return {"period": period_label, "users": formatted}


# ==================== TOP ACCOUNTS ====================

@router.get("/top-accounts")
async def get_top_accounts(
    limit: int = Query(10, le=50),
    by: str = Query("revenue"),  # revenue, opportunities, pipeline
    user: User = Depends(get_current_user)
):
    """Get top accounts by various metrics"""
    if by == "revenue":
        sort_field = "total_revenue"
    elif by == "opportunities":
        sort_field = "total_opportunities"
    else:
        sort_field = "pipeline_value"
    
    accounts = await db.crm_accounts.find(
        {"deleted": {"$ne": True}},
        {"_id": 0}
    ).sort(sort_field, -1).limit(limit).to_list(limit)
    
    return {"accounts": accounts, "sorted_by": by}


# ==================== STALE OPPORTUNITIES ====================

@router.get("/stale-opportunities")
async def get_stale_opportunities(
    days: int = Query(14),
    owner_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get opportunities with no activity in N days"""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    
    query = {
        "stage": {"$nin": ["closed_won", "closed_lost"]},
        "updated_at": {"$lt": cutoff}
    }
    if owner_id:
        query["owner_id"] = owner_id
    elif user.role == "worker":
        query["owner_id"] = user.user_id
    
    stale = await db.crm_opportunities.find(query, {"_id": 0}).sort("updated_at", 1).to_list(100)
    
    return {
        "days_threshold": days,
        "count": len(stale),
        "opportunities": stale
    }


# ==================== CLOSING THIS MONTH ====================

@router.get("/closing-soon")
async def get_closing_soon(
    days: int = Query(30),
    owner_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get opportunities closing within N days"""
    now = datetime.now(EST_TZ)
    end_date = (now + timedelta(days=days)).strftime("%Y-%m-%d")
    today = now.strftime("%Y-%m-%d")
    
    query = {
        "stage": {"$nin": ["closed_won", "closed_lost"]},
        "close_date": {"$gte": today, "$lte": end_date}
    }
    if owner_id:
        query["owner_id"] = owner_id
    elif user.role == "worker":
        query["owner_id"] = user.user_id
    
    closing = await db.crm_opportunities.find(query, {"_id": 0}).sort("close_date", 1).to_list(200)
    
    total_amount = sum(o.get("amount", 0) for o in closing)
    weighted = sum(o.get("amount", 0) * (o.get("probability", 0) / 100) for o in closing)
    
    return {
        "days": days,
        "count": len(closing),
        "total_amount": round(total_amount, 2),
        "weighted_amount": round(weighted, 2),
        "opportunities": closing
    }
