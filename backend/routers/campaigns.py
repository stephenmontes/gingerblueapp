"""
Campaign Management Router - Marketing Campaign Tracking for CRM
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from datetime import datetime, timezone
from typing import Optional, List
import uuid

from database import db
from models.user import User
from dependencies import get_current_user

router = APIRouter(prefix="/campaigns", tags=["campaigns"])


def generate_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


# ==================== CAMPAIGN CRUD ====================

@router.get("")
async def list_campaigns(
    status: Optional[str] = None,
    campaign_type: Optional[str] = None,
    owner_id: Optional[str] = None,
    search: Optional[str] = None,
    sort_by: str = Query("created_at"),
    sort_order: str = Query("desc"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user: User = Depends(get_current_user)
):
    """List campaigns with filtering and pagination"""
    query = {"deleted": {"$ne": True}}
    
    if status:
        query["status"] = status
    if campaign_type:
        query["campaign_type"] = campaign_type
    if owner_id:
        query["owner_id"] = owner_id
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"description": {"$regex": search, "$options": "i"}}
        ]
    
    total = await db.crm_campaigns.count_documents(query)
    sort_dir = 1 if sort_order == "asc" else -1
    skip = (page - 1) * page_size
    
    campaigns = await db.crm_campaigns.find(query, {"_id": 0}).sort(
        sort_by, sort_dir
    ).skip(skip).limit(page_size).to_list(page_size)
    
    return {
        "campaigns": campaigns,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": (total + page_size - 1) // page_size
        }
    }


@router.post("")
async def create_campaign(
    name: str,
    campaign_type: str,
    status: str = "planned",
    description: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    budget: Optional[float] = None,
    expected_revenue: Optional[float] = None,
    target_audience: Optional[str] = None,
    channels: List[str] = [],
    tags: List[str] = [],
    user: User = Depends(get_current_user)
):
    """Create a new marketing campaign"""
    campaign_id = generate_id("camp")
    now = datetime.now(timezone.utc).isoformat()
    
    campaign_doc = {
        "campaign_id": campaign_id,
        "name": name,
        "campaign_type": campaign_type,
        "status": status,
        "description": description,
        "start_date": start_date,
        "end_date": end_date,
        "budget": budget,
        "expected_revenue": expected_revenue,
        "target_audience": target_audience,
        "channels": channels,
        "tags": tags,
        "owner_id": user.user_id,
        "owner_name": user.name,
        "created_by": user.user_id,
        "created_by_name": user.name,
        "created_at": now,
        "updated_at": now,
        # Metrics (calculated)
        "leads_generated": 0,
        "opportunities_created": 0,
        "revenue_won": 0,
        "cost_per_lead": 0,
        "roi": 0
    }
    
    await db.crm_campaigns.insert_one(campaign_doc)
    campaign_doc.pop("_id", None)
    return campaign_doc


@router.get("/{campaign_id}")
async def get_campaign(campaign_id: str, user: User = Depends(get_current_user)):
    """Get campaign details with metrics and attribution"""
    campaign = await db.crm_campaigns.find_one(
        {"campaign_id": campaign_id, "deleted": {"$ne": True}}, 
        {"_id": 0}
    )
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    # Get attributed leads
    leads = await db.crm_leads.find(
        {"campaign_id": campaign_id},
        {"_id": 0, "lead_id": 1, "full_name": 1, "email": 1, "status": 1, "created_at": 1}
    ).sort("created_at", -1).limit(50).to_list(50)
    
    # Get attributed opportunities
    opportunities = await db.crm_opportunities.find(
        {"campaign_id": campaign_id},
        {"_id": 0, "opportunity_id": 1, "name": 1, "amount": 1, "stage": 1, "created_at": 1}
    ).sort("created_at", -1).limit(50).to_list(50)
    
    # Calculate metrics
    lead_count = await db.crm_leads.count_documents({"campaign_id": campaign_id})
    opp_count = await db.crm_opportunities.count_documents({"campaign_id": campaign_id})
    
    # Revenue from won opportunities
    won_pipeline = [
        {"$match": {"campaign_id": campaign_id, "stage": "closed_won"}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]
    won_result = await db.crm_opportunities.aggregate(won_pipeline).to_list(1)
    revenue_won = won_result[0]["total"] if won_result else 0
    
    # Update campaign metrics
    budget = campaign.get("budget") or 0
    cost_per_lead = budget / lead_count if lead_count > 0 else 0
    roi = ((revenue_won - budget) / budget * 100) if budget > 0 else 0
    
    return {
        **campaign,
        "leads": leads,
        "opportunities": opportunities,
        "metrics": {
            "leads_generated": lead_count,
            "opportunities_created": opp_count,
            "revenue_won": revenue_won,
            "cost_per_lead": round(cost_per_lead, 2),
            "roi": round(roi, 1)
        }
    }


@router.put("/{campaign_id}")
async def update_campaign(
    campaign_id: str,
    name: Optional[str] = None,
    campaign_type: Optional[str] = None,
    status: Optional[str] = None,
    description: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    budget: Optional[float] = None,
    expected_revenue: Optional[float] = None,
    target_audience: Optional[str] = None,
    channels: Optional[List[str]] = None,
    tags: Optional[List[str]] = None,
    user: User = Depends(get_current_user)
):
    """Update a campaign"""
    existing = await db.crm_campaigns.find_one({"campaign_id": campaign_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    update_data = {}
    if name is not None:
        update_data["name"] = name
    if campaign_type is not None:
        update_data["campaign_type"] = campaign_type
    if status is not None:
        update_data["status"] = status
    if description is not None:
        update_data["description"] = description
    if start_date is not None:
        update_data["start_date"] = start_date
    if end_date is not None:
        update_data["end_date"] = end_date
    if budget is not None:
        update_data["budget"] = budget
    if expected_revenue is not None:
        update_data["expected_revenue"] = expected_revenue
    if target_audience is not None:
        update_data["target_audience"] = target_audience
    if channels is not None:
        update_data["channels"] = channels
    if tags is not None:
        update_data["tags"] = tags
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No updates provided")
    
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    update_data["updated_by"] = user.user_id
    
    await db.crm_campaigns.update_one({"campaign_id": campaign_id}, {"$set": update_data})
    return {"success": True, "message": "Campaign updated"}


@router.delete("/{campaign_id}")
async def delete_campaign(campaign_id: str, user: User = Depends(get_current_user)):
    """Soft delete a campaign"""
    if user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Admin/Manager access required")
    
    result = await db.crm_campaigns.update_one(
        {"campaign_id": campaign_id},
        {"$set": {
            "deleted": True,
            "deleted_at": datetime.now(timezone.utc).isoformat(),
            "deleted_by": user.user_id
        }}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    return {"success": True, "message": "Campaign deleted"}


# ==================== CAMPAIGN ATTRIBUTION ====================

@router.post("/{campaign_id}/attribute-lead/{lead_id}")
async def attribute_lead_to_campaign(
    campaign_id: str,
    lead_id: str,
    user: User = Depends(get_current_user)
):
    """Attribute a lead to a campaign"""
    # Verify campaign exists
    campaign = await db.crm_campaigns.find_one({"campaign_id": campaign_id})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    # Update lead
    result = await db.crm_leads.update_one(
        {"lead_id": lead_id},
        {"$set": {
            "campaign_id": campaign_id,
            "campaign_name": campaign.get("name"),
            "attributed_at": datetime.now(timezone.utc).isoformat(),
            "attributed_by": user.user_id
        }}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    return {"success": True, "message": f"Lead attributed to campaign: {campaign.get('name')}"}


@router.post("/{campaign_id}/attribute-opportunity/{opportunity_id}")
async def attribute_opportunity_to_campaign(
    campaign_id: str,
    opportunity_id: str,
    user: User = Depends(get_current_user)
):
    """Attribute an opportunity to a campaign"""
    # Verify campaign exists
    campaign = await db.crm_campaigns.find_one({"campaign_id": campaign_id})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    # Update opportunity
    result = await db.crm_opportunities.update_one(
        {"opportunity_id": opportunity_id},
        {"$set": {
            "campaign_id": campaign_id,
            "campaign_name": campaign.get("name"),
            "attributed_at": datetime.now(timezone.utc).isoformat(),
            "attributed_by": user.user_id
        }}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Opportunity not found")
    
    return {"success": True, "message": f"Opportunity attributed to campaign: {campaign.get('name')}"}


@router.delete("/{campaign_id}/remove-lead/{lead_id}")
async def remove_lead_attribution(
    campaign_id: str,
    lead_id: str,
    user: User = Depends(get_current_user)
):
    """Remove a lead's campaign attribution"""
    result = await db.crm_leads.update_one(
        {"lead_id": lead_id, "campaign_id": campaign_id},
        {"$unset": {"campaign_id": "", "campaign_name": "", "attributed_at": "", "attributed_by": ""}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Lead not found or not attributed to this campaign")
    
    return {"success": True, "message": "Lead attribution removed"}


# ==================== CAMPAIGN REPORTS ====================

@router.get("/reports/summary")
async def campaign_summary_report(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get summary report across all campaigns"""
    query = {"deleted": {"$ne": True}}
    
    if start_date:
        query["created_at"] = {"$gte": start_date}
    if end_date:
        query.setdefault("created_at", {})["$lte"] = end_date
    
    campaigns = await db.crm_campaigns.find(query, {"_id": 0}).to_list(1000)
    
    # Aggregate metrics
    total_budget = sum(c.get("budget") or 0 for c in campaigns)
    total_expected = sum(c.get("expected_revenue") or 0 for c in campaigns)
    
    # Get lead counts by campaign
    lead_pipeline = [
        {"$match": {"campaign_id": {"$exists": True, "$ne": None}}},
        {"$group": {"_id": "$campaign_id", "count": {"$sum": 1}}}
    ]
    lead_counts = await db.crm_leads.aggregate(lead_pipeline).to_list(1000)
    lead_map = {lead["_id"]: lead["count"] for lead in lead_counts}
    
    # Get opportunity counts and revenue by campaign
    opp_pipeline = [
        {"$match": {"campaign_id": {"$exists": True, "$ne": None}}},
        {"$group": {
            "_id": "$campaign_id",
            "count": {"$sum": 1},
            "won_revenue": {"$sum": {"$cond": [{"$eq": ["$stage", "closed_won"]}, "$amount", 0]}}
        }}
    ]
    opp_counts = await db.crm_opportunities.aggregate(opp_pipeline).to_list(1000)
    opp_map = {o["_id"]: o for o in opp_counts}
    
    total_leads = sum(lead_map.values())
    total_opps = sum(o["count"] for o in opp_counts)
    total_revenue = sum(o["won_revenue"] for o in opp_counts)
    
    # Enrich campaigns with metrics
    for c in campaigns:
        cid = c["campaign_id"]
        c["leads_generated"] = lead_map.get(cid, 0)
        c["opportunities_created"] = opp_map.get(cid, {}).get("count", 0)
        c["revenue_won"] = opp_map.get(cid, {}).get("won_revenue", 0)
    
    return {
        "summary": {
            "total_campaigns": len(campaigns),
            "total_budget": total_budget,
            "total_expected_revenue": total_expected,
            "total_leads": total_leads,
            "total_opportunities": total_opps,
            "total_revenue_won": total_revenue,
            "overall_roi": round(((total_revenue - total_budget) / total_budget * 100) if total_budget > 0 else 0, 1)
        },
        "campaigns": campaigns
    }


@router.get("/reports/performance")
async def campaign_performance_report(
    campaign_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get detailed performance metrics for campaigns"""
    query = {"deleted": {"$ne": True}}
    if campaign_id:
        query["campaign_id"] = campaign_id
    
    campaigns = await db.crm_campaigns.find(query, {"_id": 0}).to_list(100)
    
    performance = []
    for campaign in campaigns:
        cid = campaign["campaign_id"]
        
        # Lead metrics
        lead_count = await db.crm_leads.count_documents({"campaign_id": cid})
        converted_leads = await db.crm_leads.count_documents(
            {"campaign_id": cid, "status": "converted"}
        )
        
        # Opportunity metrics
        opp_count = await db.crm_opportunities.count_documents({"campaign_id": cid})
        won_count = await db.crm_opportunities.count_documents(
            {"campaign_id": cid, "stage": "closed_won"}
        )
        
        # Revenue
        revenue_pipeline = [
            {"$match": {"campaign_id": cid, "stage": "closed_won"}},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
        ]
        revenue_result = await db.crm_opportunities.aggregate(revenue_pipeline).to_list(1)
        revenue = revenue_result[0]["total"] if revenue_result else 0
        
        budget = campaign.get("budget") or 0
        
        performance.append({
            "campaign_id": cid,
            "name": campaign.get("name"),
            "status": campaign.get("status"),
            "campaign_type": campaign.get("campaign_type"),
            "budget": budget,
            "leads_generated": lead_count,
            "leads_converted": converted_leads,
            "lead_conversion_rate": round((converted_leads / lead_count * 100) if lead_count > 0 else 0, 1),
            "opportunities_created": opp_count,
            "opportunities_won": won_count,
            "win_rate": round((won_count / opp_count * 100) if opp_count > 0 else 0, 1),
            "revenue_won": revenue,
            "cost_per_lead": round(budget / lead_count if lead_count > 0 else 0, 2),
            "cost_per_opportunity": round(budget / opp_count if opp_count > 0 else 0, 2),
            "roi": round(((revenue - budget) / budget * 100) if budget > 0 else 0, 1)
        })
    
    return {"performance": performance}


# Campaign types for reference
CAMPAIGN_TYPES = [
    "email",
    "social_media",
    "trade_show",
    "webinar",
    "advertising",
    "content_marketing",
    "referral",
    "direct_mail",
    "telemarketing",
    "other"
]

CAMPAIGN_STATUSES = [
    "planned",
    "in_progress",
    "completed",
    "paused",
    "cancelled"
]


@router.get("/config/types")
async def get_campaign_types():
    """Get available campaign types"""
    return {"types": CAMPAIGN_TYPES, "statuses": CAMPAIGN_STATUSES}
