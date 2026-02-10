"""
CRM Router - Salesforce-style CRM Module
Handles Accounts, Contacts, Leads, Opportunities, Activities, Notes
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from datetime import datetime, timezone
from typing import Optional, List
import uuid

from database import db
from models.user import User
from models.crm import (
    AccountCreate, AccountUpdate, AccountType, AccountStatus,
    ContactCreate, ContactUpdate,
    LeadCreate, LeadUpdate, LeadConvert, LeadStatus, LeadSource,
    OpportunityCreate, OpportunityUpdate, OpportunityStage, ForecastCategory,
    TaskCreate, TaskUpdate, TaskStatus, TaskPriority,
    EventCreate, EventUpdate,
    NoteCreate, NoteUpdate, NoteType,
    CommunicationLogCreate,
    QuoteCreate, QuoteUpdate,
    OpportunityStageConfig, CRMSettingsUpdate
)
from dependencies import get_current_user

router = APIRouter(prefix="/crm", tags=["crm"])


# ==================== UTILITY FUNCTIONS ====================

def generate_id(prefix: str) -> str:
    """Generate unique ID with prefix"""
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


async def log_activity(
    record_type: str,
    record_id: str,
    action: str,
    changes: dict,
    user: User,
    related_ids: dict = None
):
    """Log activity/change history for audit trail"""
    activity = {
        "activity_id": generate_id("act"),
        "record_type": record_type,
        "record_id": record_id,
        "action": action,
        "changes": changes,
        "user_id": user.user_id,
        "user_name": user.name,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    if related_ids:
        activity.update(related_ids)
    await db.crm_activity_log.insert_one(activity)
    return activity


async def get_account_rollups(account_id: str) -> dict:
    """Calculate rollup fields for an account"""
    # Total opportunities
    opp_pipeline = [
        {"$match": {"account_id": account_id}},
        {"$group": {
            "_id": None,
            "total_opportunities": {"$sum": 1},
            "open_opportunities": {"$sum": {"$cond": [
                {"$in": ["$stage", ["prospecting", "qualification", "needs_analysis", "proposal", "negotiation"]]}, 1, 0
            ]}},
            "total_won": {"$sum": {"$cond": [{"$eq": ["$stage", "closed_won"]}, "$amount", 0]}},
            "total_pipeline": {"$sum": {"$cond": [
                {"$in": ["$stage", ["prospecting", "qualification", "needs_analysis", "proposal", "negotiation"]]}, "$amount", 0
            ]}}
        }}
    ]
    opp_stats = await db.crm_opportunities.aggregate(opp_pipeline).to_list(1)
    
    # Open tasks count
    open_tasks = await db.crm_tasks.count_documents({
        "account_id": account_id,
        "status": {"$in": ["not_started", "in_progress"]}
    })
    
    # Last activity date
    last_activity = await db.crm_activity_log.find_one(
        {"$or": [{"account_id": account_id}, {"record_id": account_id}]},
        sort=[("created_at", -1)]
    )
    
    return {
        "total_opportunities": opp_stats[0]["total_opportunities"] if opp_stats else 0,
        "open_opportunities": opp_stats[0]["open_opportunities"] if opp_stats else 0,
        "total_revenue": opp_stats[0]["total_won"] if opp_stats else 0,
        "pipeline_value": opp_stats[0]["total_pipeline"] if opp_stats else 0,
        "open_tasks": open_tasks,
        "last_activity_date": last_activity["created_at"] if last_activity else None
    }


# ==================== ACCOUNTS ====================

@router.post("/accounts")
async def create_account(account: AccountCreate, user: User = Depends(get_current_user)):
    """Create a new account (company)"""
    account_id = generate_id("acc")
    now = datetime.now(timezone.utc).isoformat()
    
    # Check for duplicate name
    existing = await db.crm_accounts.find_one({"name": {"$regex": f"^{account.name}$", "$options": "i"}})
    if existing:
        raise HTTPException(status_code=400, detail=f"Account with name '{account.name}' already exists")
    
    account_doc = {
        "account_id": account_id,
        **account.model_dump(),
        "owner_id": account.owner_id or user.user_id,
        "owner_name": user.name,
        "created_by": user.user_id,
        "created_by_name": user.name,
        "created_at": now,
        "updated_at": now,
        # Rollup fields (calculated)
        "total_opportunities": 0,
        "open_opportunities": 0,
        "total_revenue": 0,
        "pipeline_value": 0,
        "last_activity_date": now
    }
    
    await db.crm_accounts.insert_one(account_doc)
    await log_activity("account", account_id, "created", {"name": account.name}, user)
    
    # Return without _id
    account_doc.pop("_id", None)
    return account_doc


@router.get("/accounts")
async def list_accounts(
    search: Optional[str] = None,
    account_type: Optional[str] = None,
    status: Optional[str] = None,
    owner_id: Optional[str] = None,
    industry: Optional[str] = None,
    territory: Optional[str] = None,
    tag: Optional[str] = None,
    sort_by: str = Query("created_at", description="Field to sort by"),
    sort_order: str = Query("desc", description="asc or desc"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user: User = Depends(get_current_user)
):
    """List accounts with filtering and pagination"""
    query = {}
    
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"website": {"$regex": search, "$options": "i"}},
            {"phone": {"$regex": search, "$options": "i"}}
        ]
    
    if account_type:
        query["account_type"] = account_type
    if status:
        query["status"] = status
    if owner_id:
        query["owner_id"] = owner_id
    if industry:
        query["industry"] = industry
    if territory:
        query["territory"] = territory
    if tag:
        query["tags"] = tag
    
    # Apply role-based filtering
    if user.role == "worker":
        query["owner_id"] = user.user_id
    
    total = await db.crm_accounts.count_documents(query)
    
    sort_dir = 1 if sort_order == "asc" else -1
    skip = (page - 1) * page_size
    
    accounts = await db.crm_accounts.find(query, {"_id": 0}).sort(
        sort_by, sort_dir
    ).skip(skip).limit(page_size).to_list(page_size)
    
    return {
        "accounts": accounts,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": (total + page_size - 1) // page_size
        }
    }


@router.get("/accounts/{account_id}")
async def get_account(account_id: str, user: User = Depends(get_current_user)):
    """Get account details with related data"""
    account = await db.crm_accounts.find_one({"account_id": account_id}, {"_id": 0})
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    # Get contacts
    contacts = await db.crm_contacts.find(
        {"account_id": account_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    # Get opportunities
    opportunities = await db.crm_opportunities.find(
        {"account_id": account_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    # Get open tasks
    tasks = await db.crm_tasks.find(
        {"account_id": account_id, "status": {"$in": ["not_started", "in_progress"]}}, {"_id": 0}
    ).sort("due_date", 1).to_list(50)
    
    # Get recent activities
    activities = await db.crm_activity_log.find(
        {"$or": [{"account_id": account_id}, {"record_id": account_id}]}, {"_id": 0}
    ).sort("created_at", -1).limit(50).to_list(50)
    
    # Get notes
    notes = await db.crm_notes.find(
        {"account_id": account_id}, {"_id": 0}
    ).sort("is_pinned", -1).sort("created_at", -1).to_list(50)
    
    # Get linked customer data from existing ERP
    erp_data = None
    if account.get("linked_customer_id"):
        customer = await db.customers.find_one(
            {"customer_id": account["linked_customer_id"]}, {"_id": 0}
        )
        if customer:
            # Get orders
            orders = await db.fulfillment_orders.find(
                {"customer_email": customer.get("email")}, {"_id": 0}
            ).sort("created_at", -1).limit(20).to_list(20)
            erp_data = {
                "customer": customer,
                "orders": orders
            }
    
    # Update rollups
    rollups = await get_account_rollups(account_id)
    
    return {
        **account,
        **rollups,
        "contacts": contacts,
        "opportunities": opportunities,
        "tasks": tasks,
        "activities": activities,
        "notes": notes,
        "erp_data": erp_data
    }


@router.put("/accounts/{account_id}")
async def update_account(
    account_id: str,
    updates: AccountUpdate,
    user: User = Depends(get_current_user)
):
    """Update an account"""
    existing = await db.crm_accounts.find_one({"account_id": account_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Account not found")
    
    update_data = {k: v for k, v in updates.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No updates provided")
    
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    update_data["updated_by"] = user.user_id
    update_data["updated_by_name"] = user.name
    
    await db.crm_accounts.update_one({"account_id": account_id}, {"$set": update_data})
    await log_activity("account", account_id, "updated", update_data, user)
    
    return {"success": True, "message": "Account updated"}


@router.delete("/accounts/{account_id}")
async def delete_account(account_id: str, user: User = Depends(get_current_user)):
    """Delete an account (soft delete)"""
    if user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized to delete accounts")
    
    result = await db.crm_accounts.update_one(
        {"account_id": account_id},
        {"$set": {
            "deleted": True,
            "deleted_at": datetime.now(timezone.utc).isoformat(),
            "deleted_by": user.user_id
        }}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Account not found")
    
    await log_activity("account", account_id, "deleted", {}, user)
    return {"success": True, "message": "Account deleted"}


# ==================== CONTACTS ====================

@router.post("/contacts")
async def create_contact(contact: ContactCreate, user: User = Depends(get_current_user)):
    """Create a new contact"""
    contact_id = generate_id("con")
    now = datetime.now(timezone.utc).isoformat()
    
    # Check for duplicate email
    if contact.email:
        existing = await db.crm_contacts.find_one({"email": contact.email})
        if existing:
            raise HTTPException(status_code=400, detail=f"Contact with email '{contact.email}' already exists")
    
    contact_doc = {
        "contact_id": contact_id,
        **contact.model_dump(),
        "full_name": f"{contact.first_name} {contact.last_name}".strip(),
        "owner_id": contact.owner_id or user.user_id,
        "owner_name": user.name,
        "created_by": user.user_id,
        "created_by_name": user.name,
        "created_at": now,
        "updated_at": now
    }
    
    await db.crm_contacts.insert_one(contact_doc)
    await log_activity("contact", contact_id, "created", {"name": contact_doc["full_name"]}, user,
                       {"account_id": contact.account_id} if contact.account_id else None)
    
    contact_doc.pop("_id", None)
    return contact_doc


@router.get("/contacts")
async def list_contacts(
    search: Optional[str] = None,
    account_id: Optional[str] = None,
    owner_id: Optional[str] = None,
    tag: Optional[str] = None,
    sort_by: str = Query("created_at"),
    sort_order: str = Query("desc"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user: User = Depends(get_current_user)
):
    """List contacts with filtering"""
    query = {}
    
    if search:
        query["$or"] = [
            {"full_name": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}},
            {"phone": {"$regex": search, "$options": "i"}},
            {"title": {"$regex": search, "$options": "i"}}
        ]
    
    if account_id:
        query["account_id"] = account_id
    if owner_id:
        query["owner_id"] = owner_id
    if tag:
        query["tags"] = tag
    
    if user.role == "worker":
        query["owner_id"] = user.user_id
    
    total = await db.crm_contacts.count_documents(query)
    sort_dir = 1 if sort_order == "asc" else -1
    skip = (page - 1) * page_size
    
    contacts = await db.crm_contacts.find(query, {"_id": 0}).sort(
        sort_by, sort_dir
    ).skip(skip).limit(page_size).to_list(page_size)
    
    # Enrich with account names
    account_ids = list(set(c.get("account_id") for c in contacts if c.get("account_id")))
    if account_ids:
        accounts = await db.crm_accounts.find(
            {"account_id": {"$in": account_ids}},
            {"_id": 0, "account_id": 1, "name": 1}
        ).to_list(len(account_ids))
        account_map = {a["account_id"]: a["name"] for a in accounts}
        for c in contacts:
            c["account_name"] = account_map.get(c.get("account_id"), "")
    
    return {
        "contacts": contacts,
        "pagination": {"page": page, "page_size": page_size, "total": total, "total_pages": (total + page_size - 1) // page_size}
    }


@router.get("/contacts/{contact_id}")
async def get_contact(contact_id: str, user: User = Depends(get_current_user)):
    """Get contact details"""
    contact = await db.crm_contacts.find_one({"contact_id": contact_id}, {"_id": 0})
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    
    # Get account info
    account = None
    if contact.get("account_id"):
        account = await db.crm_accounts.find_one(
            {"account_id": contact["account_id"]}, {"_id": 0, "account_id": 1, "name": 1}
        )
    
    # Get opportunities for this contact
    opportunities = await db.crm_opportunities.find(
        {"contact_id": contact_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    
    # Get activities
    activities = await db.crm_activity_log.find(
        {"contact_id": contact_id}, {"_id": 0}
    ).sort("created_at", -1).limit(50).to_list(50)
    
    # Get notes
    notes = await db.crm_notes.find(
        {"contact_id": contact_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    
    return {
        **contact,
        "account": account,
        "opportunities": opportunities,
        "activities": activities,
        "notes": notes
    }


@router.put("/contacts/{contact_id}")
async def update_contact(contact_id: str, updates: ContactUpdate, user: User = Depends(get_current_user)):
    """Update a contact"""
    existing = await db.crm_contacts.find_one({"contact_id": contact_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Contact not found")
    
    update_data = {k: v for k, v in updates.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No updates provided")
    
    # Update full_name if first/last name changed
    if "first_name" in update_data or "last_name" in update_data:
        first = update_data.get("first_name", existing.get("first_name", ""))
        last = update_data.get("last_name", existing.get("last_name", ""))
        update_data["full_name"] = f"{first} {last}".strip()
    
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    update_data["updated_by"] = user.user_id
    
    await db.crm_contacts.update_one({"contact_id": contact_id}, {"$set": update_data})
    await log_activity("contact", contact_id, "updated", update_data, user)
    
    return {"success": True, "message": "Contact updated"}


@router.delete("/contacts/{contact_id}")
async def delete_contact(contact_id: str, user: User = Depends(get_current_user)):
    """Delete a contact"""
    result = await db.crm_contacts.delete_one({"contact_id": contact_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Contact not found")
    
    await log_activity("contact", contact_id, "deleted", {}, user)
    return {"success": True, "message": "Contact deleted"}


# ==================== LEADS ====================

@router.post("/leads")
async def create_lead(lead: LeadCreate, user: User = Depends(get_current_user)):
    """Create a new lead"""
    lead_id = generate_id("lead")
    now = datetime.now(timezone.utc).isoformat()
    
    # Check for duplicate email
    if lead.email:
        existing = await db.crm_leads.find_one({
            "email": lead.email,
            "status": {"$ne": "converted"}
        })
        if existing:
            raise HTTPException(status_code=400, detail=f"Lead with email '{lead.email}' already exists")
    
    lead_doc = {
        "lead_id": lead_id,
        **lead.model_dump(),
        "full_name": f"{lead.first_name} {lead.last_name}".strip(),
        "owner_id": lead.owner_id or user.user_id,
        "owner_name": user.name,
        "created_by": user.user_id,
        "created_by_name": user.name,
        "created_at": now,
        "updated_at": now
    }
    
    await db.crm_leads.insert_one(lead_doc)
    await log_activity("lead", lead_id, "created", {"name": lead_doc["full_name"], "source": lead.source}, user)
    
    lead_doc.pop("_id", None)
    return lead_doc


@router.get("/leads")
async def list_leads(
    search: Optional[str] = None,
    status: Optional[str] = None,
    source: Optional[str] = None,
    owner_id: Optional[str] = None,
    sort_by: str = Query("created_at"),
    sort_order: str = Query("desc"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user: User = Depends(get_current_user)
):
    """List leads with filtering"""
    query = {"status": {"$ne": "converted"}}  # Exclude converted leads by default
    
    if search:
        query["$or"] = [
            {"full_name": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}},
            {"company": {"$regex": search, "$options": "i"}},
            {"phone": {"$regex": search, "$options": "i"}}
        ]
    
    if status:
        query["status"] = status
    if source:
        query["source"] = source
    if owner_id:
        query["owner_id"] = owner_id
    
    if user.role == "worker":
        query["owner_id"] = user.user_id
    
    total = await db.crm_leads.count_documents(query)
    sort_dir = 1 if sort_order == "asc" else -1
    skip = (page - 1) * page_size
    
    leads = await db.crm_leads.find(query, {"_id": 0}).sort(
        sort_by, sort_dir
    ).skip(skip).limit(page_size).to_list(page_size)
    
    return {
        "leads": leads,
        "pagination": {"page": page, "page_size": page_size, "total": total, "total_pages": (total + page_size - 1) // page_size}
    }


@router.get("/leads/{lead_id}")
async def get_lead(lead_id: str, user: User = Depends(get_current_user)):
    """Get lead details"""
    lead = await db.crm_leads.find_one({"lead_id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    activities = await db.crm_activity_log.find(
        {"lead_id": lead_id}, {"_id": 0}
    ).sort("created_at", -1).limit(50).to_list(50)
    
    notes = await db.crm_notes.find(
        {"lead_id": lead_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    
    tasks = await db.crm_tasks.find(
        {"lead_id": lead_id}, {"_id": 0}
    ).sort("due_date", 1).to_list(50)
    
    return {
        **lead,
        "activities": activities,
        "notes": notes,
        "tasks": tasks
    }


@router.put("/leads/{lead_id}")
async def update_lead(lead_id: str, updates: LeadUpdate, user: User = Depends(get_current_user)):
    """Update a lead"""
    existing = await db.crm_leads.find_one({"lead_id": lead_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    update_data = {k: v for k, v in updates.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No updates provided")
    
    if "first_name" in update_data or "last_name" in update_data:
        first = update_data.get("first_name", existing.get("first_name", ""))
        last = update_data.get("last_name", existing.get("last_name", ""))
        update_data["full_name"] = f"{first} {last}".strip()
    
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    update_data["updated_by"] = user.user_id
    
    await db.crm_leads.update_one({"lead_id": lead_id}, {"$set": update_data})
    await log_activity("lead", lead_id, "updated", update_data, user)
    
    return {"success": True, "message": "Lead updated"}


@router.post("/leads/{lead_id}/convert")
async def convert_lead(lead_id: str, convert_data: LeadConvert, user: User = Depends(get_current_user)):
    """Convert a lead to Account + Contact + optional Opportunity"""
    lead = await db.crm_leads.find_one({"lead_id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    if lead.get("status") == "converted":
        raise HTTPException(status_code=400, detail="Lead already converted")
    
    now = datetime.now(timezone.utc).isoformat()
    result = {"lead_id": lead_id}
    
    # Create or use existing account
    if convert_data.account_id:
        account_id = convert_data.account_id
    else:
        account_id = generate_id("acc")
        account_doc = {
            "account_id": account_id,
            "name": lead.get("company") or f"{lead.get('first_name', '')} {lead.get('last_name', '')}".strip(),
            "account_type": "prospect",
            "industry": lead.get("industry"),
            "website": lead.get("website"),
            "phone": lead.get("phone"),
            "status": "active",
            "billing_address": lead.get("address"),
            "owner_id": user.user_id,
            "owner_name": user.name,
            "tags": [],
            "created_by": user.user_id,
            "created_at": now,
            "updated_at": now,
            "total_opportunities": 0,
            "open_opportunities": 0,
            "total_revenue": 0,
            "pipeline_value": 0
        }
        await db.crm_accounts.insert_one(account_doc)
        result["account_id"] = account_id
        result["account_created"] = True
    
    # Create contact
    contact_id = generate_id("con")
    contact_doc = {
        "contact_id": contact_id,
        "first_name": lead.get("first_name", ""),
        "last_name": lead.get("last_name", ""),
        "full_name": lead.get("full_name", ""),
        "account_id": account_id,
        "title": lead.get("title"),
        "email": lead.get("email"),
        "phone": lead.get("phone"),
        "mailing_address": lead.get("address"),
        "owner_id": user.user_id,
        "owner_name": user.name,
        "tags": [],
        "created_by": user.user_id,
        "created_at": now,
        "updated_at": now
    }
    await db.crm_contacts.insert_one(contact_doc)
    result["contact_id"] = contact_id
    
    # Create opportunity if requested
    if convert_data.create_opportunity:
        opp_id = generate_id("opp")
        opp_name = convert_data.opportunity_name or f"{lead.get('company', '')} - New Opportunity".strip()
        opp_doc = {
            "opportunity_id": opp_id,
            "name": opp_name,
            "account_id": account_id,
            "contact_id": contact_id,
            "amount": convert_data.opportunity_amount or 0,
            "probability": 10,
            "stage": "prospecting",
            "forecast_category": "pipeline",
            "close_date": convert_data.opportunity_close_date or now[:10],
            "lead_source": lead.get("source"),
            "owner_id": user.user_id,
            "owner_name": user.name,
            "tags": [],
            "competitors": [],
            "line_items": [],
            "converted_from_lead": lead_id,
            "created_by": user.user_id,
            "created_at": now,
            "updated_at": now,
            "stage_history": [{
                "stage": "prospecting",
                "entered_at": now,
                "user_id": user.user_id,
                "user_name": user.name
            }]
        }
        await db.crm_opportunities.insert_one(opp_doc)
        result["opportunity_id"] = opp_id
    
    # Mark lead as converted
    await db.crm_leads.update_one(
        {"lead_id": lead_id},
        {"$set": {
            "status": "converted",
            "converted_at": now,
            "converted_by": user.user_id,
            "converted_account_id": account_id,
            "converted_contact_id": contact_id,
            "converted_opportunity_id": result.get("opportunity_id")
        }}
    )
    
    await log_activity("lead", lead_id, "converted", result, user)
    
    return {"success": True, "message": "Lead converted successfully", **result}


@router.delete("/leads/{lead_id}")
async def delete_lead(lead_id: str, user: User = Depends(get_current_user)):
    """Delete a lead"""
    result = await db.crm_leads.delete_one({"lead_id": lead_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    await log_activity("lead", lead_id, "deleted", {}, user)
    return {"success": True, "message": "Lead deleted"}


# ==================== OPPORTUNITIES ====================

@router.post("/opportunities")
async def create_opportunity(opp: OpportunityCreate, user: User = Depends(get_current_user)):
    """Create a new opportunity"""
    opp_id = generate_id("opp")
    now = datetime.now(timezone.utc).isoformat()
    
    # Verify account exists
    account = await db.crm_accounts.find_one({"account_id": opp.account_id})
    if not account:
        raise HTTPException(status_code=400, detail="Account not found")
    
    opp_doc = {
        "opportunity_id": opp_id,
        **opp.model_dump(),
        "account_name": account.get("name"),
        "owner_id": opp.owner_id or user.user_id,
        "owner_name": user.name,
        "created_by": user.user_id,
        "created_by_name": user.name,
        "created_at": now,
        "updated_at": now,
        "stage_history": [{
            "stage": opp.stage,
            "entered_at": now,
            "user_id": user.user_id,
            "user_name": user.name
        }]
    }
    
    await db.crm_opportunities.insert_one(opp_doc)
    await log_activity("opportunity", opp_id, "created", {"name": opp.name, "amount": opp.amount}, user, {"account_id": opp.account_id})
    
    opp_doc.pop("_id", None)
    return opp_doc


@router.get("/opportunities")
async def list_opportunities(
    search: Optional[str] = None,
    account_id: Optional[str] = None,
    stage: Optional[str] = None,
    owner_id: Optional[str] = None,
    forecast_category: Optional[str] = None,
    close_date_from: Optional[str] = None,
    close_date_to: Optional[str] = None,
    min_amount: Optional[float] = None,
    max_amount: Optional[float] = None,
    sort_by: str = Query("created_at"),
    sort_order: str = Query("desc"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user: User = Depends(get_current_user)
):
    """List opportunities with filtering"""
    query = {}
    
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"account_name": {"$regex": search, "$options": "i"}}
        ]
    
    if account_id:
        query["account_id"] = account_id
    if stage:
        query["stage"] = stage
    if owner_id:
        query["owner_id"] = owner_id
    if forecast_category:
        query["forecast_category"] = forecast_category
    if close_date_from:
        query["close_date"] = {"$gte": close_date_from}
    if close_date_to:
        query.setdefault("close_date", {})["$lte"] = close_date_to
    if min_amount is not None:
        query["amount"] = {"$gte": min_amount}
    if max_amount is not None:
        query.setdefault("amount", {})["$lte"] = max_amount
    
    if user.role == "worker":
        query["owner_id"] = user.user_id
    
    total = await db.crm_opportunities.count_documents(query)
    sort_dir = 1 if sort_order == "asc" else -1
    skip = (page - 1) * page_size
    
    opportunities = await db.crm_opportunities.find(query, {"_id": 0}).sort(
        sort_by, sort_dir
    ).skip(skip).limit(page_size).to_list(page_size)
    
    return {
        "opportunities": opportunities,
        "pagination": {"page": page, "page_size": page_size, "total": total, "total_pages": (total + page_size - 1) // page_size}
    }


@router.get("/opportunities/pipeline")
async def get_pipeline(
    owner_id: Optional[str] = None,
    close_date_from: Optional[str] = None,
    close_date_to: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get opportunities grouped by stage for Kanban view"""
    query = {"stage": {"$nin": ["closed_won", "closed_lost"]}}
    
    if owner_id:
        query["owner_id"] = owner_id
    elif user.role == "worker":
        query["owner_id"] = user.user_id
    
    if close_date_from:
        query["close_date"] = {"$gte": close_date_from}
    if close_date_to:
        query.setdefault("close_date", {})["$lte"] = close_date_to
    
    # Get all open opportunities
    opportunities = await db.crm_opportunities.find(query, {"_id": 0}).sort("close_date", 1).to_list(500)
    
    # Group by stage
    stages = ["prospecting", "qualification", "needs_analysis", "proposal", "negotiation"]
    pipeline = {}
    
    for stage in stages:
        stage_opps = [o for o in opportunities if o.get("stage") == stage]
        pipeline[stage] = {
            "opportunities": stage_opps,
            "count": len(stage_opps),
            "total_amount": sum(o.get("amount", 0) for o in stage_opps),
            "weighted_amount": sum(o.get("amount", 0) * (o.get("probability", 0) / 100) for o in stage_opps)
        }
    
    # Get closed this period
    closed_query = {"stage": {"$in": ["closed_won", "closed_lost"]}}
    if owner_id:
        closed_query["owner_id"] = owner_id
    elif user.role == "worker":
        closed_query["owner_id"] = user.user_id
    
    closed = await db.crm_opportunities.find(closed_query, {"_id": 0}).sort("updated_at", -1).limit(20).to_list(20)
    
    return {
        "pipeline": pipeline,
        "closed_recent": closed,
        "totals": {
            "total_count": len(opportunities),
            "total_amount": sum(o.get("amount", 0) for o in opportunities),
            "weighted_pipeline": sum(o.get("amount", 0) * (o.get("probability", 0) / 100) for o in opportunities)
        }
    }


@router.get("/opportunities/{opp_id}")
async def get_opportunity(opp_id: str, user: User = Depends(get_current_user)):
    """Get opportunity details"""
    opp = await db.crm_opportunities.find_one({"opportunity_id": opp_id}, {"_id": 0})
    if not opp:
        raise HTTPException(status_code=404, detail="Opportunity not found")
    
    # Get account
    account = None
    if opp.get("account_id"):
        account = await db.crm_accounts.find_one(
            {"account_id": opp["account_id"]}, {"_id": 0, "account_id": 1, "name": 1}
        )
    
    # Get contact
    contact = None
    if opp.get("contact_id"):
        contact = await db.crm_contacts.find_one(
            {"contact_id": opp["contact_id"]}, {"_id": 0, "contact_id": 1, "full_name": 1, "email": 1}
        )
    
    # Get activities
    activities = await db.crm_activity_log.find(
        {"opportunity_id": opp_id}, {"_id": 0}
    ).sort("created_at", -1).limit(50).to_list(50)
    
    # Get notes
    notes = await db.crm_notes.find(
        {"opportunity_id": opp_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    
    # Get tasks
    tasks = await db.crm_tasks.find(
        {"opportunity_id": opp_id}, {"_id": 0}
    ).sort("due_date", 1).to_list(50)
    
    # Get quotes
    quotes = await db.crm_quotes.find(
        {"opportunity_id": opp_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(20)
    
    return {
        **opp,
        "account": account,
        "contact": contact,
        "activities": activities,
        "notes": notes,
        "tasks": tasks,
        "quotes": quotes
    }


@router.put("/opportunities/{opp_id}")
async def update_opportunity(opp_id: str, updates: OpportunityUpdate, user: User = Depends(get_current_user)):
    """Update an opportunity"""
    existing = await db.crm_opportunities.find_one({"opportunity_id": opp_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Opportunity not found")
    
    update_data = {k: v for k, v in updates.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No updates provided")
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Track stage changes
    if "stage" in update_data and update_data["stage"] != existing.get("stage"):
        stage_history = existing.get("stage_history", [])
        stage_history.append({
            "stage": update_data["stage"],
            "entered_at": now,
            "user_id": user.user_id,
            "user_name": user.name,
            "previous_stage": existing.get("stage")
        })
        update_data["stage_history"] = stage_history
        
        # Update probability based on stage
        stage_probabilities = {
            "prospecting": 10,
            "qualification": 20,
            "needs_analysis": 40,
            "proposal": 60,
            "negotiation": 80,
            "closed_won": 100,
            "closed_lost": 0
        }
        if "probability" not in update_data:
            update_data["probability"] = stage_probabilities.get(update_data["stage"], 10)
        
        # Update forecast category
        if update_data["stage"] == "closed_won":
            update_data["forecast_category"] = "closed"
            update_data["closed_at"] = now
            update_data["is_won"] = True
        elif update_data["stage"] == "closed_lost":
            update_data["forecast_category"] = "omitted"
            update_data["closed_at"] = now
            update_data["is_won"] = False
    
    update_data["updated_at"] = now
    update_data["updated_by"] = user.user_id
    
    await db.crm_opportunities.update_one({"opportunity_id": opp_id}, {"$set": update_data})
    await log_activity("opportunity", opp_id, "updated", update_data, user, {"account_id": existing.get("account_id")})
    
    return {"success": True, "message": "Opportunity updated"}


@router.delete("/opportunities/{opp_id}")
async def delete_opportunity(opp_id: str, user: User = Depends(get_current_user)):
    """Delete an opportunity"""
    if user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized to delete opportunities")
    
    result = await db.crm_opportunities.delete_one({"opportunity_id": opp_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Opportunity not found")
    
    await log_activity("opportunity", opp_id, "deleted", {}, user)
    return {"success": True, "message": "Opportunity deleted"}


# ==================== TASKS ====================

@router.post("/tasks")
async def create_task(task: TaskCreate, user: User = Depends(get_current_user)):
    """Create a new task"""
    task_id = generate_id("task")
    now = datetime.now(timezone.utc).isoformat()
    
    task_doc = {
        "task_id": task_id,
        **task.model_dump(),
        "assigned_to": task.assigned_to or user.user_id,
        "created_by": user.user_id,
        "created_by_name": user.name,
        "created_at": now,
        "updated_at": now
    }
    
    await db.crm_tasks.insert_one(task_doc)
    
    related_ids = {}
    if task.account_id:
        related_ids["account_id"] = task.account_id
    if task.contact_id:
        related_ids["contact_id"] = task.contact_id
    if task.opportunity_id:
        related_ids["opportunity_id"] = task.opportunity_id
    if task.lead_id:
        related_ids["lead_id"] = task.lead_id
    
    await log_activity("task", task_id, "created", {"subject": task.subject}, user, related_ids)
    
    task_doc.pop("_id", None)
    return task_doc


@router.get("/tasks")
async def list_tasks(
    assigned_to: Optional[str] = None,
    status: Optional[str] = None,
    priority: Optional[str] = None,
    account_id: Optional[str] = None,
    opportunity_id: Optional[str] = None,
    lead_id: Optional[str] = None,
    due_date_from: Optional[str] = None,
    due_date_to: Optional[str] = None,
    overdue: Optional[bool] = None,
    sort_by: str = Query("due_date"),
    sort_order: str = Query("asc"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user: User = Depends(get_current_user)
):
    """List tasks with filtering"""
    query = {}
    
    if assigned_to:
        query["assigned_to"] = assigned_to
    if status:
        query["status"] = status
    if priority:
        query["priority"] = priority
    if account_id:
        query["account_id"] = account_id
    if opportunity_id:
        query["opportunity_id"] = opportunity_id
    if lead_id:
        query["lead_id"] = lead_id
    if due_date_from:
        query["due_date"] = {"$gte": due_date_from}
    if due_date_to:
        query.setdefault("due_date", {})["$lte"] = due_date_to
    if overdue:
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        query["due_date"] = {"$lt": today}
        query["status"] = {"$in": ["not_started", "in_progress"]}
    
    # Default to showing user's tasks
    if not assigned_to and user.role == "worker":
        query["assigned_to"] = user.user_id
    
    total = await db.crm_tasks.count_documents(query)
    sort_dir = 1 if sort_order == "asc" else -1
    skip = (page - 1) * page_size
    
    tasks = await db.crm_tasks.find(query, {"_id": 0}).sort(
        sort_by, sort_dir
    ).skip(skip).limit(page_size).to_list(page_size)
    
    return {
        "tasks": tasks,
        "pagination": {"page": page, "page_size": page_size, "total": total, "total_pages": (total + page_size - 1) // page_size}
    }


@router.put("/tasks/{task_id}")
async def update_task(task_id: str, updates: TaskUpdate, user: User = Depends(get_current_user)):
    """Update a task"""
    existing = await db.crm_tasks.find_one({"task_id": task_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Task not found")
    
    update_data = {k: v for k, v in updates.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No updates provided")
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Track completion
    if update_data.get("status") == "completed" and existing.get("status") != "completed":
        update_data["completed_at"] = now
        update_data["completed_by"] = user.user_id
    
    update_data["updated_at"] = now
    update_data["updated_by"] = user.user_id
    
    await db.crm_tasks.update_one({"task_id": task_id}, {"$set": update_data})
    await log_activity("task", task_id, "updated", update_data, user)
    
    return {"success": True, "message": "Task updated"}


@router.delete("/tasks/{task_id}")
async def delete_task(task_id: str, user: User = Depends(get_current_user)):
    """Delete a task"""
    result = await db.crm_tasks.delete_one({"task_id": task_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Task not found")
    
    return {"success": True, "message": "Task deleted"}


# ==================== NOTES ====================

@router.post("/notes")
async def create_note(note: NoteCreate, user: User = Depends(get_current_user)):
    """Create a new note"""
    note_id = generate_id("note")
    now = datetime.now(timezone.utc).isoformat()
    
    note_doc = {
        "note_id": note_id,
        **note.model_dump(),
        "created_by": user.user_id,
        "created_by_name": user.name,
        "created_at": now,
        "updated_at": now
    }
    
    await db.crm_notes.insert_one(note_doc)
    
    related_ids = {}
    if note.account_id:
        related_ids["account_id"] = note.account_id
    if note.contact_id:
        related_ids["contact_id"] = note.contact_id
    if note.opportunity_id:
        related_ids["opportunity_id"] = note.opportunity_id
    if note.lead_id:
        related_ids["lead_id"] = note.lead_id
    
    await log_activity("note", note_id, "created", {"note_type": note.note_type}, user, related_ids)
    
    note_doc.pop("_id", None)
    return note_doc


@router.put("/notes/{note_id}")
async def update_note(note_id: str, updates: NoteUpdate, user: User = Depends(get_current_user)):
    """Update a note"""
    existing = await db.crm_notes.find_one({"note_id": note_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Note not found")
    
    update_data = {k: v for k, v in updates.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    update_data["updated_by"] = user.user_id
    
    await db.crm_notes.update_one({"note_id": note_id}, {"$set": update_data})
    return {"success": True, "message": "Note updated"}


@router.delete("/notes/{note_id}")
async def delete_note(note_id: str, user: User = Depends(get_current_user)):
    """Delete a note"""
    result = await db.crm_notes.delete_one({"note_id": note_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Note not found")
    return {"success": True, "message": "Note deleted"}


# ==================== EVENTS ====================

@router.post("/events")
async def create_event(event: EventCreate, user: User = Depends(get_current_user)):
    """Create a new event/meeting"""
    event_id = generate_id("evt")
    now = datetime.now(timezone.utc).isoformat()
    
    event_doc = {
        "event_id": event_id,
        **event.model_dump(),
        "owner_id": event.owner_id or user.user_id,
        "owner_name": user.name,
        "created_by": user.user_id,
        "created_by_name": user.name,
        "created_at": now,
        "updated_at": now
    }
    
    await db.crm_events.insert_one(event_doc)
    
    related_ids = {}
    if event.account_id:
        related_ids["account_id"] = event.account_id
    if event.contact_id:
        related_ids["contact_id"] = event.contact_id
    if event.opportunity_id:
        related_ids["opportunity_id"] = event.opportunity_id
    
    await log_activity("event", event_id, "created", {"subject": event.subject, "start_time": event.start_time}, user, related_ids)
    
    event_doc.pop("_id", None)
    return event_doc


@router.get("/events")
async def list_events(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    owner_id: Optional[str] = None,
    account_id: Optional[str] = None,
    opportunity_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """List events/meetings"""
    query = {}
    
    if start_date:
        query["start_time"] = {"$gte": start_date}
    if end_date:
        query.setdefault("start_time", {})["$lte"] = end_date
    if owner_id:
        query["owner_id"] = owner_id
    if account_id:
        query["account_id"] = account_id
    if opportunity_id:
        query["opportunity_id"] = opportunity_id
    
    events = await db.crm_events.find(query, {"_id": 0}).sort("start_time", 1).to_list(500)
    return {"events": events}


@router.put("/events/{event_id}")
async def update_event(event_id: str, updates: EventUpdate, user: User = Depends(get_current_user)):
    """Update an event"""
    existing = await db.crm_events.find_one({"event_id": event_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Event not found")
    
    update_data = {k: v for k, v in updates.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.crm_events.update_one({"event_id": event_id}, {"$set": update_data})
    return {"success": True, "message": "Event updated"}


@router.delete("/events/{event_id}")
async def delete_event(event_id: str, user: User = Depends(get_current_user)):
    """Delete an event"""
    result = await db.crm_events.delete_one({"event_id": event_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Event not found")
    return {"success": True, "message": "Event deleted"}


# ==================== QUOTES ====================

@router.post("/quotes")
async def create_quote(quote: QuoteCreate, user: User = Depends(get_current_user)):
    """Create a new quote"""
    quote_id = generate_id("quote")
    now = datetime.now(timezone.utc).isoformat()
    
    # Get latest version number for this opportunity
    existing_quotes = await db.crm_quotes.count_documents({"opportunity_id": quote.opportunity_id})
    version = existing_quotes + 1
    
    quote_doc = {
        "quote_id": quote_id,
        **quote.model_dump(),
        "version": version,
        "status": "draft",
        "created_by": user.user_id,
        "created_by_name": user.name,
        "created_at": now,
        "updated_at": now
    }
    
    await db.crm_quotes.insert_one(quote_doc)
    await log_activity("quote", quote_id, "created", {"quote_name": quote.quote_name, "total": quote.total}, user, {"opportunity_id": quote.opportunity_id})
    
    quote_doc.pop("_id", None)
    return quote_doc


@router.get("/quotes/{quote_id}")
async def get_quote(quote_id: str, user: User = Depends(get_current_user)):
    """Get quote details"""
    quote = await db.crm_quotes.find_one({"quote_id": quote_id}, {"_id": 0})
    if not quote:
        raise HTTPException(status_code=404, detail="Quote not found")
    return quote


@router.put("/quotes/{quote_id}")
async def update_quote(quote_id: str, updates: QuoteUpdate, user: User = Depends(get_current_user)):
    """Update a quote"""
    existing = await db.crm_quotes.find_one({"quote_id": quote_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Quote not found")
    
    update_data = {k: v for k, v in updates.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.crm_quotes.update_one({"quote_id": quote_id}, {"$set": update_data})
    await log_activity("quote", quote_id, "updated", update_data, user)
    
    return {"success": True, "message": "Quote updated"}


@router.post("/quotes/{quote_id}/send")
async def send_quote(quote_id: str, user: User = Depends(get_current_user)):
    """Mark quote as sent"""
    now = datetime.now(timezone.utc).isoformat()
    
    result = await db.crm_quotes.update_one(
        {"quote_id": quote_id},
        {"$set": {"status": "sent", "sent_at": now, "sent_by": user.user_id}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Quote not found")
    
    await log_activity("quote", quote_id, "sent", {}, user)
    return {"success": True, "message": "Quote marked as sent"}


# ==================== CRM SETTINGS ====================

@router.get("/settings")
async def get_crm_settings(user: User = Depends(get_current_user)):
    """Get CRM configuration settings"""
    settings = await db.crm_settings.find_one({"settings_id": "main"}, {"_id": 0})
    
    if not settings:
        # Return default settings
        settings = {
            "settings_id": "main",
            "opportunity_stages": [
                {"stage_id": "prospecting", "name": "Prospecting", "probability": 10, "forecast_category": "pipeline", "order": 1, "is_closed": False, "is_won": False, "color": "#6b7280"},
                {"stage_id": "qualification", "name": "Qualification", "probability": 20, "forecast_category": "pipeline", "order": 2, "is_closed": False, "is_won": False, "color": "#3b82f6"},
                {"stage_id": "needs_analysis", "name": "Needs Analysis", "probability": 40, "forecast_category": "pipeline", "order": 3, "is_closed": False, "is_won": False, "color": "#8b5cf6"},
                {"stage_id": "proposal", "name": "Proposal", "probability": 60, "forecast_category": "best_case", "order": 4, "is_closed": False, "is_won": False, "color": "#f59e0b"},
                {"stage_id": "negotiation", "name": "Negotiation", "probability": 80, "forecast_category": "commit", "order": 5, "is_closed": False, "is_won": False, "color": "#10b981"},
                {"stage_id": "closed_won", "name": "Closed Won", "probability": 100, "forecast_category": "closed", "order": 6, "is_closed": True, "is_won": True, "color": "#22c55e"},
                {"stage_id": "closed_lost", "name": "Closed Lost", "probability": 0, "forecast_category": "omitted", "order": 7, "is_closed": True, "is_won": False, "color": "#ef4444"}
            ],
            "lead_sources": ["website", "trade_show", "referral", "cold_call", "social_media", "other"],
            "industries": ["Retail", "Wholesale", "E-commerce", "Manufacturing", "Services", "Other"],
            "territories": ["Northeast", "Southeast", "Midwest", "Southwest", "West", "International"]
        }
        await db.crm_settings.insert_one(settings)
    
    return settings


@router.put("/settings")
async def update_crm_settings(updates: CRMSettingsUpdate, user: User = Depends(get_current_user)):
    """Update CRM configuration settings (admin only)"""
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can modify CRM settings")
    
    update_data = {k: v for k, v in updates.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    update_data["updated_by"] = user.user_id
    
    await db.crm_settings.update_one(
        {"settings_id": "main"},
        {"$set": update_data},
        upsert=True
    )
    
    return {"success": True, "message": "Settings updated"}


# ==================== GLOBAL SEARCH ====================

@router.get("/search")
async def global_search(
    q: str = Query(..., min_length=2),
    types: Optional[str] = None,  # Comma-separated: accounts,contacts,leads,opportunities
    limit: int = Query(20, le=50),
    user: User = Depends(get_current_user)
):
    """Global search across all CRM objects"""
    search_types = types.split(",") if types else ["accounts", "contacts", "leads", "opportunities"]
    results = {}
    
    search_regex = {"$regex": q, "$options": "i"}
    
    if "accounts" in search_types:
        accounts = await db.crm_accounts.find(
            {"$or": [{"name": search_regex}, {"website": search_regex}]},
            {"_id": 0, "account_id": 1, "name": 1, "account_type": 1}
        ).limit(limit).to_list(limit)
        results["accounts"] = accounts
    
    if "contacts" in search_types:
        contacts = await db.crm_contacts.find(
            {"$or": [{"full_name": search_regex}, {"email": search_regex}]},
            {"_id": 0, "contact_id": 1, "full_name": 1, "email": 1, "account_id": 1}
        ).limit(limit).to_list(limit)
        results["contacts"] = contacts
    
    if "leads" in search_types:
        leads = await db.crm_leads.find(
            {"$or": [{"full_name": search_regex}, {"email": search_regex}, {"company": search_regex}], "status": {"$ne": "converted"}},
            {"_id": 0, "lead_id": 1, "full_name": 1, "company": 1, "status": 1}
        ).limit(limit).to_list(limit)
        results["leads"] = leads
    
    if "opportunities" in search_types:
        opps = await db.crm_opportunities.find(
            {"$or": [{"name": search_regex}, {"account_name": search_regex}]},
            {"_id": 0, "opportunity_id": 1, "name": 1, "account_name": 1, "amount": 1, "stage": 1}
        ).limit(limit).to_list(limit)
        results["opportunities"] = opps
    
    return results


# ==================== ACTIVITY TIMELINE ====================

@router.get("/timeline/{record_type}/{record_id}")
async def get_timeline(
    record_type: str,
    record_id: str,
    limit: int = Query(50, le=200),
    user: User = Depends(get_current_user)
):
    """Get unified activity timeline for a record"""
    query = {"record_id": record_id}
    
    # Also include activities related to this record via foreign keys
    if record_type == "account":
        query = {"$or": [
            {"record_id": record_id},
            {"account_id": record_id}
        ]}
    elif record_type == "contact":
        query = {"$or": [
            {"record_id": record_id},
            {"contact_id": record_id}
        ]}
    elif record_type == "opportunity":
        query = {"$or": [
            {"record_id": record_id},
            {"opportunity_id": record_id}
        ]}
    elif record_type == "lead":
        query = {"$or": [
            {"record_id": record_id},
            {"lead_id": record_id}
        ]}
    
    activities = await db.crm_activity_log.find(
        query, {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    
    return {"timeline": activities}
