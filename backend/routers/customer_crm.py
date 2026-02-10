"""
Customer CRM Router
Manages CRM extension data separate from Shopify-synced customer data
Implements field ownership rules to prevent sync collisions
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from datetime import datetime, timezone
from typing import Optional, List
import uuid

from database import db
from models.user import User
from models.customer_crm import (
    CustomerCRMCreate, CustomerCRMUpdate, AccountStatus,
    SHOPIFY_OWNED_FIELDS, CRM_OWNED_FIELDS
)
from dependencies import get_current_user

router = APIRouter(prefix="/customer-crm", tags=["customer-crm"])


def generate_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


async def get_or_create_crm_record(customer_id: str, user: User) -> dict:
    """Get existing CRM record or create a new one"""
    crm_record = await db.customer_crm.find_one({"customer_id": customer_id}, {"_id": 0})
    
    if not crm_record:
        # Create default CRM record
        now = datetime.now(timezone.utc).isoformat()
        crm_record = {
            "crm_id": generate_id("crm"),
            "customer_id": customer_id,
            "owner_user_id": user.user_id,
            "owner_name": user.name,
            "account_status": "prospect",
            "tags": [],
            "industry": None,
            "account_type": None,
            "territory": None,
            "region": None,
            "lead_source": None,
            "converted_from_lead_id": None,
            "credit_limit": None,
            "payment_terms": None,
            "notes": None,
            "custom_fields": {},
            "last_activity_at": now,
            "next_task_due_at": None,
            "created_at": now,
            "updated_at": now,
            "created_by": user.user_id
        }
        await db.customer_crm.insert_one({**crm_record})
    
    return crm_record


async def get_erp_rollups(customer_id: str, customer_email: str = None) -> dict:
    """Calculate ERP rollups for a customer"""
    # Get orders by customer_id or email
    order_query = {"$or": []}
    if customer_id:
        order_query["$or"].append({"customer.id": customer_id})
    if customer_email:
        order_query["$or"].append({"customer_email": customer_email})
        order_query["$or"].append({"email": customer_email})
    
    if not order_query["$or"]:
        return {
            "total_orders": 0,
            "total_revenue": 0,
            "open_orders_count": 0,
            "open_orders_value": 0,
            "last_order_date": None,
            "ar_balance": 0
        }
    
    # Count and sum orders
    orders = await db.orders.find(order_query).to_list(1000)
    fulfillment_orders = await db.fulfillment_orders.find(order_query).to_list(1000)
    all_orders = orders + fulfillment_orders
    
    total_orders = len(all_orders)
    total_revenue = sum(float(o.get("total_price", 0) or 0) for o in all_orders)
    
    # Open orders (not fulfilled)
    open_orders = [o for o in all_orders if o.get("fulfillment_status") not in ["fulfilled", "shipped"]]
    open_orders_count = len(open_orders)
    open_orders_value = sum(float(o.get("total_price", 0) or 0) for o in open_orders)
    
    # Last order date
    order_dates = [o.get("created_at") for o in all_orders if o.get("created_at")]
    last_order_date = max(order_dates) if order_dates else None
    
    # Get opportunities for this customer
    opp_query = {}
    crm_record = await db.customer_crm.find_one({"customer_id": customer_id})
    if crm_record:
        # Find linked account
        linked_account = await db.crm_accounts.find_one({"linked_customer_id": customer_id})
        if linked_account:
            opp_pipeline = await db.crm_opportunities.find({
                "account_id": linked_account["account_id"],
                "stage": {"$nin": ["closed_won", "closed_lost"]}
            }).to_list(100)
            open_opportunities = len(opp_pipeline)
            pipeline_value = sum(o.get("amount", 0) for o in opp_pipeline)
        else:
            open_opportunities = 0
            pipeline_value = 0
    else:
        open_opportunities = 0
        pipeline_value = 0
    
    return {
        "total_orders": total_orders,
        "total_revenue": round(total_revenue, 2),
        "open_orders_count": open_orders_count,
        "open_orders_value": round(open_orders_value, 2),
        "last_order_date": last_order_date,
        "ar_balance": 0,  # Would need invoicing system
        "open_opportunities": open_opportunities,
        "pipeline_value": round(pipeline_value, 2)
    }


# ==================== UNIFIED ACCOUNT VIEW ====================

@router.get("/accounts")
async def list_accounts(
    search: Optional[str] = None,
    account_status: Optional[str] = None,
    owner_id: Optional[str] = None,
    territory: Optional[str] = None,
    industry: Optional[str] = None,
    has_crm: Optional[bool] = None,
    sort_by: str = Query("updated_at", description="Field to sort by"),
    sort_order: str = Query("desc"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user: User = Depends(get_current_user)
):
    """
    List accounts with unified view (customers + customer_crm joined)
    This is the main account list for CRM users
    """
    # First get customer_crm records with filters
    crm_query = {}
    
    if account_status:
        crm_query["account_status"] = account_status
    if owner_id:
        crm_query["owner_user_id"] = owner_id
    if territory:
        crm_query["territory"] = territory
    if industry:
        crm_query["industry"] = industry
    
    # Role-based filtering
    if user.role == "worker":
        crm_query["owner_user_id"] = user.user_id
    
    # Get CRM records
    crm_records = await db.customer_crm.find(crm_query, {"_id": 0}).to_list(10000)
    crm_by_customer = {r["customer_id"]: r for r in crm_records}
    
    # Build customer query
    customer_query = {}
    if search:
        customer_query["$or"] = [
            {"email": {"$regex": search, "$options": "i"}},
            {"first_name": {"$regex": search, "$options": "i"}},
            {"last_name": {"$regex": search, "$options": "i"}},
            {"default_address.company": {"$regex": search, "$options": "i"}}
        ]
    
    # If filtering by CRM fields, limit to customers with CRM records
    if crm_query:
        customer_ids = list(crm_by_customer.keys())
        if customer_ids:
            customer_query["customer_id"] = {"$in": customer_ids}
        else:
            # No matching CRM records
            return {
                "accounts": [],
                "pagination": {"page": page, "page_size": page_size, "total": 0, "total_pages": 0}
            }
    
    # Get customers
    total = await db.customers.count_documents(customer_query)
    sort_dir = 1 if sort_order == "asc" else -1
    skip = (page - 1) * page_size
    
    customers = await db.customers.find(customer_query, {"_id": 0}).sort(
        sort_by, sort_dir
    ).skip(skip).limit(page_size).to_list(page_size)
    
    # Merge with CRM data
    accounts = []
    for customer in customers:
        customer_id = customer.get("customer_id")
        crm_data = crm_by_customer.get(customer_id, {})
        
        # Create unified account view
        account = {
            # Customer (Shopify-owned) fields
            "customer_id": customer_id,
            "email": customer.get("email"),
            "first_name": customer.get("first_name"),
            "last_name": customer.get("last_name"),
            "full_name": f"{customer.get('first_name', '')} {customer.get('last_name', '')}".strip() or customer.get("email"),
            "company": customer.get("default_address", {}).get("company") if customer.get("default_address") else None,
            "phone": customer.get("phone"),
            "default_address": customer.get("default_address"),
            "shopify_id": customer.get("shopify_id"),
            "shopify_orders_count": customer.get("orders_count", 0),
            "shopify_total_spent": customer.get("total_spent", 0),
            "accepts_marketing": customer.get("accepts_marketing", False),
            "shopify_tags": customer.get("tags", ""),
            "shopify_note": customer.get("note"),
            "created_at": customer.get("created_at"),
            "updated_at": customer.get("updated_at"),
            
            # CRM (CRM-owned) fields
            "crm_id": crm_data.get("crm_id"),
            "owner_user_id": crm_data.get("owner_user_id"),
            "owner_name": crm_data.get("owner_name"),
            "account_status": crm_data.get("account_status", "prospect"),
            "crm_tags": crm_data.get("tags", []),
            "industry": crm_data.get("industry"),
            "account_type": crm_data.get("account_type"),
            "territory": crm_data.get("territory"),
            "region": crm_data.get("region"),
            "lead_source": crm_data.get("lead_source"),
            "credit_limit": crm_data.get("credit_limit"),
            "payment_terms": crm_data.get("payment_terms"),
            "crm_notes": crm_data.get("notes"),
            "last_activity_at": crm_data.get("last_activity_at"),
            "next_task_due_at": crm_data.get("next_task_due_at"),
            
            # Has CRM record flag
            "has_crm_record": bool(crm_data)
        }
        accounts.append(account)
    
    return {
        "accounts": accounts,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": (total + page_size - 1) // page_size
        }
    }


@router.get("/accounts/{customer_id}")
async def get_account(customer_id: str, user: User = Depends(get_current_user)):
    """
    Get unified account view with all related data:
    - Customer (Shopify) data
    - CRM extension data
    - ERP rollups (orders, revenue)
    - Related opportunities, tasks, activities
    """
    # Get customer (Shopify data)
    customer = await db.customers.find_one({"customer_id": customer_id}, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    # Get or create CRM record
    crm_data = await get_or_create_crm_record(customer_id, user)
    
    # Get ERP rollups
    erp_data = await get_erp_rollups(customer_id, customer.get("email"))
    
    # Get recent orders
    order_query = {"$or": [
        {"customer.id": customer_id},
        {"customer_email": customer.get("email")},
        {"email": customer.get("email")}
    ]}
    recent_orders = await db.orders.find(order_query, {"_id": 0}).sort("created_at", -1).limit(10).to_list(10)
    if not recent_orders:
        recent_orders = await db.fulfillment_orders.find(order_query, {"_id": 0}).sort("created_at", -1).limit(10).to_list(10)
    
    # Get linked CRM account if exists
    linked_account = await db.crm_accounts.find_one({"linked_customer_id": customer_id}, {"_id": 0})
    
    # Get opportunities if linked
    opportunities = []
    if linked_account:
        opportunities = await db.crm_opportunities.find(
            {"account_id": linked_account["account_id"]}, {"_id": 0}
        ).sort("created_at", -1).limit(20).to_list(20)
    
    # Get tasks for this customer
    tasks = await db.crm_tasks.find(
        {"$or": [
            {"account_id": linked_account["account_id"] if linked_account else "none"},
            {"customer_id": customer_id}
        ]},
        {"_id": 0}
    ).sort("due_date", 1).limit(20).to_list(20)
    
    # Get notes
    notes = await db.crm_notes.find(
        {"$or": [
            {"account_id": linked_account["account_id"] if linked_account else "none"},
            {"customer_id": customer_id}
        ]},
        {"_id": 0}
    ).sort("created_at", -1).limit(20).to_list(20)
    
    # Get activity timeline
    activities = await db.crm_activity_log.find(
        {"$or": [
            {"account_id": linked_account["account_id"] if linked_account else "none"},
            {"customer_id": customer_id}
        ]},
        {"_id": 0}
    ).sort("created_at", -1).limit(50).to_list(50)
    
    # Build unified response
    return {
        # Shopify-owned fields (read-only from CRM)
        "shopify_data": {
            "customer_id": customer_id,
            "shopify_id": customer.get("shopify_id"),
            "email": customer.get("email"),
            "first_name": customer.get("first_name"),
            "last_name": customer.get("last_name"),
            "phone": customer.get("phone"),
            "default_address": customer.get("default_address"),
            "addresses": customer.get("addresses", []),
            "orders_count": customer.get("orders_count", 0),
            "total_spent": customer.get("total_spent", 0),
            "accepts_marketing": customer.get("accepts_marketing", False),
            "shopify_tags": customer.get("tags"),
            "shopify_note": customer.get("note"),
            "shopify_created_at": customer.get("shopify_created_at"),
            "shopify_updated_at": customer.get("shopify_updated_at"),
            "_ownership": "SHOPIFY - Read-only from CRM"
        },
        
        # CRM-owned fields (editable)
        "crm_data": {
            "crm_id": crm_data.get("crm_id"),
            "owner_user_id": crm_data.get("owner_user_id"),
            "owner_name": crm_data.get("owner_name"),
            "account_status": crm_data.get("account_status"),
            "tags": crm_data.get("tags", []),
            "industry": crm_data.get("industry"),
            "account_type": crm_data.get("account_type"),
            "territory": crm_data.get("territory"),
            "region": crm_data.get("region"),
            "lead_source": crm_data.get("lead_source"),
            "converted_from_lead_id": crm_data.get("converted_from_lead_id"),
            "credit_limit": crm_data.get("credit_limit"),
            "payment_terms": crm_data.get("payment_terms"),
            "notes": crm_data.get("notes"),
            "custom_fields": crm_data.get("custom_fields", {}),
            "last_activity_at": crm_data.get("last_activity_at"),
            "next_task_due_at": crm_data.get("next_task_due_at"),
            "_ownership": "CRM - Editable"
        },
        
        # ERP calculated fields (read-only)
        "erp_data": {
            **erp_data,
            "_ownership": "ERP - Calculated from orders"
        },
        
        # Related records
        "linked_crm_account": linked_account,
        "recent_orders": recent_orders,
        "opportunities": opportunities,
        "tasks": tasks,
        "notes": notes,
        "activities": activities
    }


@router.put("/accounts/{customer_id}/crm")
async def update_account_crm(
    customer_id: str,
    updates: CustomerCRMUpdate,
    user: User = Depends(get_current_user)
):
    """
    Update CRM-owned fields only
    Cannot update Shopify-owned fields through this endpoint
    """
    # Verify customer exists
    customer = await db.customers.find_one({"customer_id": customer_id})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    # Get or create CRM record
    crm_record = await db.customer_crm.find_one({"customer_id": customer_id})
    
    update_data = {k: v for k, v in updates.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No updates provided")
    
    now = datetime.now(timezone.utc).isoformat()
    update_data["updated_at"] = now
    update_data["updated_by"] = user.user_id
    update_data["last_activity_at"] = now
    
    if crm_record:
        # Update existing
        await db.customer_crm.update_one(
            {"customer_id": customer_id},
            {"$set": update_data}
        )
    else:
        # Create new CRM record
        crm_record = {
            "crm_id": generate_id("crm"),
            "customer_id": customer_id,
            "owner_user_id": user.user_id,
            "owner_name": user.name,
            "account_status": "prospect",
            "tags": [],
            "created_at": now,
            "updated_at": now,
            "created_by": user.user_id,
            **update_data
        }
        await db.customer_crm.insert_one({**crm_record})
    
    # Log activity
    await db.crm_activity_log.insert_one({
        "activity_id": generate_id("act"),
        "record_type": "customer_crm",
        "record_id": customer_id,
        "action": "updated",
        "changes": update_data,
        "user_id": user.user_id,
        "user_name": user.name,
        "created_at": now
    })
    
    return {"success": True, "message": "CRM data updated"}


# ==================== LEAD CONVERSION WITH CUSTOMER LINKING ====================

@router.post("/leads/{lead_id}/convert-to-customer")
async def convert_lead_to_customer(
    lead_id: str,
    create_opportunity: bool = True,
    opportunity_name: Optional[str] = None,
    opportunity_amount: Optional[float] = None,
    user: User = Depends(get_current_user)
):
    """
    Convert a lead to:
    1. Customer record (if no existing customer with same email)
    2. Customer_CRM record (always)
    3. Optional Opportunity
    
    If customer already exists, just create CRM record and link
    """
    # Get lead
    lead = await db.crm_leads.find_one({"lead_id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    if lead.get("status") == "converted":
        raise HTTPException(status_code=400, detail="Lead already converted")
    
    now = datetime.now(timezone.utc).isoformat()
    result = {"lead_id": lead_id}
    
    # Check if customer exists by email
    existing_customer = None
    if lead.get("email"):
        existing_customer = await db.customers.find_one({"email": lead["email"]})
    
    if existing_customer:
        customer_id = existing_customer.get("customer_id")
        result["customer_id"] = customer_id
        result["customer_existed"] = True
    else:
        # Create new customer record
        customer_id = generate_id("cust")
        customer_doc = {
            "customer_id": customer_id,
            "email": lead.get("email"),
            "first_name": lead.get("first_name"),
            "last_name": lead.get("last_name"),
            "phone": lead.get("phone"),
            "default_address": {
                "company": lead.get("company"),
                **(lead.get("address") or {})
            } if lead.get("company") or lead.get("address") else None,
            "orders_count": 0,
            "total_spent": 0,
            "source": "crm_lead_conversion",
            "created_at": now,
            "updated_at": now
        }
        await db.customers.insert_one({**customer_doc})
        result["customer_id"] = customer_id
        result["customer_created"] = True
    
    # Create CRM record for this customer
    crm_record = await db.customer_crm.find_one({"customer_id": customer_id})
    if not crm_record:
        crm_record = {
            "crm_id": generate_id("crm"),
            "customer_id": customer_id,
            "owner_user_id": user.user_id,
            "owner_name": user.name,
            "account_status": "prospect",
            "tags": [],
            "industry": lead.get("industry"),
            "lead_source": lead.get("source"),
            "converted_from_lead_id": lead_id,
            "created_at": now,
            "updated_at": now,
            "created_by": user.user_id,
            "last_activity_at": now
        }
        await db.customer_crm.insert_one({**crm_record})
        result["crm_record_created"] = True
    else:
        # Update existing CRM record with lead source
        await db.customer_crm.update_one(
            {"customer_id": customer_id},
            {"$set": {
                "converted_from_lead_id": lead_id,
                "lead_source": lead.get("source"),
                "updated_at": now,
                "last_activity_at": now
            }}
        )
        result["crm_record_updated"] = True
    
    # Create CRM Account linked to this customer (for opportunity tracking)
    linked_account = await db.crm_accounts.find_one({"linked_customer_id": customer_id})
    if not linked_account:
        account_id = generate_id("acc")
        account_doc = {
            "account_id": account_id,
            "name": lead.get("company") or f"{lead.get('first_name', '')} {lead.get('last_name', '')}".strip(),
            "account_type": "prospect",
            "industry": lead.get("industry"),
            "website": lead.get("website"),
            "phone": lead.get("phone"),
            "status": "active",
            "linked_customer_id": customer_id,
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
        await db.crm_accounts.insert_one({**account_doc})
        result["account_id"] = account_id
    else:
        result["account_id"] = linked_account["account_id"]
    
    # Create contact
    contact_id = generate_id("con")
    contact_doc = {
        "contact_id": contact_id,
        "first_name": lead.get("first_name", ""),
        "last_name": lead.get("last_name", ""),
        "full_name": lead.get("full_name", ""),
        "account_id": result["account_id"],
        "title": lead.get("title"),
        "email": lead.get("email"),
        "phone": lead.get("phone"),
        "owner_id": user.user_id,
        "owner_name": user.name,
        "tags": [],
        "created_by": user.user_id,
        "created_at": now,
        "updated_at": now
    }
    await db.crm_contacts.insert_one({**contact_doc})
    result["contact_id"] = contact_id
    
    # Create opportunity if requested
    if create_opportunity:
        opp_id = generate_id("opp")
        opp_name = opportunity_name or f"{lead.get('company', '')} - New Opportunity".strip()
        opp_doc = {
            "opportunity_id": opp_id,
            "name": opp_name,
            "account_id": result["account_id"],
            "contact_id": contact_id,
            "amount": opportunity_amount or 0,
            "probability": 10,
            "stage": "prospecting",
            "forecast_category": "pipeline",
            "close_date": now[:10],
            "lead_source": lead.get("source"),
            "owner_id": user.user_id,
            "owner_name": user.name,
            "tags": [],
            "competitors": [],
            "line_items": [],
            "converted_from_lead": lead_id,
            "linked_customer_id": customer_id,
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
        await db.crm_opportunities.insert_one({**opp_doc})
        result["opportunity_id"] = opp_id
    
    # Mark lead as converted
    await db.crm_leads.update_one(
        {"lead_id": lead_id},
        {"$set": {
            "status": "converted",
            "converted_at": now,
            "converted_by": user.user_id,
            "converted_customer_id": customer_id,
            "converted_account_id": result.get("account_id"),
            "converted_contact_id": contact_id,
            "converted_opportunity_id": result.get("opportunity_id")
        }}
    )
    
    # Log activity
    await db.crm_activity_log.insert_one({
        "activity_id": generate_id("act"),
        "record_type": "lead",
        "record_id": lead_id,
        "action": "converted",
        "changes": result,
        "user_id": user.user_id,
        "user_name": user.name,
        "created_at": now
    })
    
    return {"success": True, "message": "Lead converted successfully", **result}


# ==================== FIELD OWNERSHIP CHECK ====================

@router.get("/field-ownership")
async def get_field_ownership(user: User = Depends(get_current_user)):
    """
    Returns field ownership rules for documentation/UI purposes
    """
    return {
        "shopify_owned": list(SHOPIFY_OWNED_FIELDS),
        "crm_owned": list(CRM_OWNED_FIELDS),
        "rules": {
            "shopify_sync": "Shopify sync updates only shopify_owned fields in 'customers' collection",
            "crm_updates": "CRM users update only crm_owned fields in 'customer_crm' collection",
            "no_collision": "CRM fields are physically separated from Shopify data - no sync collisions possible"
        }
    }


# ==================== BULK OPERATIONS ====================

@router.post("/accounts/bulk-assign")
async def bulk_assign_owner(
    customer_ids: List[str],
    owner_user_id: str,
    user: User = Depends(get_current_user)
):
    """Bulk assign owner to multiple accounts"""
    if user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Get owner name
    owner = await db.users.find_one({"user_id": owner_user_id})
    owner_name = owner.get("name") if owner else "Unknown"
    
    now = datetime.now(timezone.utc).isoformat()
    updated_count = 0
    
    for customer_id in customer_ids:
        crm_record = await db.customer_crm.find_one({"customer_id": customer_id})
        if crm_record:
            await db.customer_crm.update_one(
                {"customer_id": customer_id},
                {"$set": {
                    "owner_user_id": owner_user_id,
                    "owner_name": owner_name,
                    "updated_at": now
                }}
            )
        else:
            await db.customer_crm.insert_one({
                "crm_id": generate_id("crm"),
                "customer_id": customer_id,
                "owner_user_id": owner_user_id,
                "owner_name": owner_name,
                "account_status": "prospect",
                "tags": [],
                "created_at": now,
                "updated_at": now,
                "created_by": user.user_id
            })
        updated_count += 1
    
    return {"success": True, "updated_count": updated_count}


@router.post("/accounts/bulk-tag")
async def bulk_add_tag(
    customer_ids: List[str],
    tag: str,
    user: User = Depends(get_current_user)
):
    """Bulk add CRM tag to multiple accounts"""
    now = datetime.now(timezone.utc).isoformat()
    updated_count = 0
    
    for customer_id in customer_ids:
        crm_record = await db.customer_crm.find_one({"customer_id": customer_id})
        if crm_record:
            await db.customer_crm.update_one(
                {"customer_id": customer_id},
                {"$addToSet": {"tags": tag}, "$set": {"updated_at": now}}
            )
        else:
            await db.customer_crm.insert_one({
                "crm_id": generate_id("crm"),
                "customer_id": customer_id,
                "owner_user_id": user.user_id,
                "owner_name": user.name,
                "account_status": "prospect",
                "tags": [tag],
                "created_at": now,
                "updated_at": now,
                "created_by": user.user_id
            })
        updated_count += 1
    
    return {"success": True, "updated_count": updated_count, "tag": tag}
