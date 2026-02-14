"""
Case Management Router - Support Tickets for CRM
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from datetime import datetime, timezone, timedelta
from typing import Optional, List
from pydantic import BaseModel
import uuid

from database import db
from models.user import User
from dependencies import get_current_user

router = APIRouter(prefix="/cases", tags=["cases"])


def generate_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


# Case statuses and priorities
CASE_STATUSES = [
    {"value": "new", "label": "New", "color": "#3b82f6"},
    {"value": "in_progress", "label": "In Progress", "color": "#f59e0b"},
    {"value": "waiting_customer", "label": "Waiting on Customer", "color": "#8b5cf6"},
    {"value": "escalated", "label": "Escalated", "color": "#ef4444"},
    {"value": "resolved", "label": "Resolved", "color": "#22c55e"},
    {"value": "closed", "label": "Closed", "color": "#6b7280"}
]

CASE_PRIORITIES = [
    {"value": "low", "label": "Low", "color": "#6b7280"},
    {"value": "medium", "label": "Medium", "color": "#3b82f6"},
    {"value": "high", "label": "High", "color": "#f59e0b"},
    {"value": "critical", "label": "Critical", "color": "#ef4444"}
]

CASE_CATEGORIES = [
    "Product Issue",
    "Shipping/Delivery",
    "Billing/Payment",
    "Returns/Refunds",
    "Order Inquiry",
    "Technical Support",
    "Account Issue",
    "General Question",
    "Complaint",
    "Other"
]

CASE_ORIGINS = [
    "Email",
    "Phone",
    "Web Form",
    "Chat",
    "Social Media",
    "Walk-in",
    "Internal"
]


class CaseCreate(BaseModel):
    subject: str
    description: Optional[str] = None
    status: str = "new"
    priority: str = "medium"
    category: Optional[str] = None
    origin: Optional[str] = None
    account_id: Optional[str] = None
    contact_id: Optional[str] = None
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    assigned_to: Optional[str] = None
    due_date: Optional[str] = None
    internal_notes: Optional[str] = None


class CaseUpdate(BaseModel):
    subject: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    category: Optional[str] = None
    origin: Optional[str] = None
    account_id: Optional[str] = None
    contact_id: Optional[str] = None
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    assigned_to: Optional[str] = None
    due_date: Optional[str] = None
    resolution: Optional[str] = None
    internal_notes: Optional[str] = None


# ==================== CASE CRUD ====================

@router.get("")
async def list_cases(
    status: Optional[str] = None,
    priority: Optional[str] = None,
    category: Optional[str] = None,
    assigned_to: Optional[str] = None,
    account_id: Optional[str] = None,
    contact_id: Optional[str] = None,
    search: Optional[str] = None,
    is_open: Optional[bool] = None,
    overdue: Optional[bool] = None,
    sort_by: str = Query("created_at"),
    sort_order: str = Query("desc"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user: User = Depends(get_current_user)
):
    """List cases with filtering and pagination"""
    query = {}
    
    if status:
        query["status"] = status
    if priority:
        query["priority"] = priority
    if category:
        query["category"] = category
    if assigned_to:
        query["assigned_to"] = assigned_to
    if account_id:
        query["account_id"] = account_id
    if contact_id:
        query["contact_id"] = contact_id
    if search:
        query["$or"] = [
            {"subject": {"$regex": search, "$options": "i"}},
            {"description": {"$regex": search, "$options": "i"}},
            {"case_number": {"$regex": search, "$options": "i"}},
            {"contact_name": {"$regex": search, "$options": "i"}},
            {"contact_email": {"$regex": search, "$options": "i"}}
        ]
    if is_open is True:
        query["status"] = {"$nin": ["resolved", "closed"]}
    elif is_open is False:
        query["status"] = {"$in": ["resolved", "closed"]}
    if overdue:
        query["due_date"] = {"$lt": datetime.now(timezone.utc).isoformat()}
        query["status"] = {"$nin": ["resolved", "closed"]}
    
    total = await db.crm_cases.count_documents(query)
    sort_dir = 1 if sort_order == "asc" else -1
    skip = (page - 1) * page_size
    
    cases = await db.crm_cases.find(query, {"_id": 0}).sort(
        sort_by, sort_dir
    ).skip(skip).limit(page_size).to_list(page_size)
    
    # Enrich with account/contact names if needed
    for case in cases:
        if case.get("account_id") and not case.get("account_name"):
            account = await db.crm_accounts.find_one(
                {"account_id": case["account_id"]},
                {"_id": 0, "name": 1}
            )
            if account:
                case["account_name"] = account.get("name")
    
    return {
        "cases": cases,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": (total + page_size - 1) // page_size
        }
    }


@router.post("")
async def create_case(
    case_data: CaseCreate,
    user: User = Depends(get_current_user)
):
    """Create a new support case"""
    # Generate case number
    count = await db.crm_cases.count_documents({})
    case_number = f"CS-{str(count + 1).zfill(5)}"
    
    case_id = generate_id("case")
    now = datetime.now(timezone.utc).isoformat()
    
    # Get account name if provided
    account_name = None
    if case_data.account_id:
        account = await db.crm_accounts.find_one(
            {"account_id": case_data.account_id},
            {"_id": 0, "name": 1}
        )
        if account:
            account_name = account.get("name")
    
    # Get assigned user name if provided
    assigned_to_name = None
    if case_data.assigned_to:
        assigned_user = await db.users.find_one(
            {"user_id": case_data.assigned_to},
            {"_id": 0, "name": 1}
        )
        if assigned_user:
            assigned_to_name = assigned_user.get("name")
    
    case_doc = {
        "case_id": case_id,
        "case_number": case_number,
        "subject": case_data.subject,
        "description": case_data.description,
        "status": case_data.status,
        "priority": case_data.priority,
        "category": case_data.category,
        "origin": case_data.origin,
        "account_id": case_data.account_id,
        "account_name": account_name,
        "contact_id": case_data.contact_id,
        "contact_name": case_data.contact_name,
        "contact_email": case_data.contact_email,
        "contact_phone": case_data.contact_phone,
        "assigned_to": case_data.assigned_to,
        "assigned_to_name": assigned_to_name,
        "due_date": case_data.due_date,
        "internal_notes": case_data.internal_notes,
        "resolution": None,
        "resolved_at": None,
        "closed_at": None,
        "created_by": user.user_id,
        "created_by_name": user.name,
        "created_at": now,
        "updated_at": now,
        "first_response_at": None,
        "status_history": [
            {
                "status": case_data.status,
                "changed_at": now,
                "changed_by": user.user_id,
                "changed_by_name": user.name
            }
        ]
    }
    
    await db.crm_cases.insert_one(case_doc)
    case_doc.pop("_id", None)
    
    # Log activity
    await log_case_activity(
        case_id, "created", f"Case created: {case_data.subject}",
        user.user_id, user.name
    )
    
    return case_doc


@router.get("/config")
async def get_case_config():
    """Get case configuration options"""
    return {
        "statuses": CASE_STATUSES,
        "priorities": CASE_PRIORITIES,
        "categories": CASE_CATEGORIES,
        "origins": CASE_ORIGINS
    }


@router.get("/stats")
async def get_case_stats(user: User = Depends(get_current_user)):
    """Get case statistics for dashboard"""
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    week_start = (now - timedelta(days=now.weekday())).replace(
        hour=0, minute=0, second=0, microsecond=0
    ).isoformat()
    
    # Total open cases
    open_count = await db.crm_cases.count_documents(
        {"status": {"$nin": ["resolved", "closed"]}}
    )
    
    # By status
    status_pipeline = [
        {"$group": {"_id": "$status", "count": {"$sum": 1}}}
    ]
    status_counts = await db.crm_cases.aggregate(status_pipeline).to_list(20)
    by_status = {s["_id"]: s["count"] for s in status_counts}
    
    # By priority (open only)
    priority_pipeline = [
        {"$match": {"status": {"$nin": ["resolved", "closed"]}}},
        {"$group": {"_id": "$priority", "count": {"$sum": 1}}}
    ]
    priority_counts = await db.crm_cases.aggregate(priority_pipeline).to_list(10)
    by_priority = {p["_id"]: p["count"] for p in priority_counts}
    
    # Overdue cases
    overdue_count = await db.crm_cases.count_documents({
        "due_date": {"$lt": now.isoformat()},
        "status": {"$nin": ["resolved", "closed"]}
    })
    
    # Created today
    created_today = await db.crm_cases.count_documents(
        {"created_at": {"$gte": today_start}}
    )
    
    # Resolved today
    resolved_today = await db.crm_cases.count_documents(
        {"resolved_at": {"$gte": today_start}}
    )
    
    # Created this week
    created_week = await db.crm_cases.count_documents(
        {"created_at": {"$gte": week_start}}
    )
    
    # My open cases (assigned to current user)
    my_open = await db.crm_cases.count_documents({
        "assigned_to": user.user_id,
        "status": {"$nin": ["resolved", "closed"]}
    })
    
    # Unassigned cases
    unassigned = await db.crm_cases.count_documents({
        "assigned_to": None,
        "status": {"$nin": ["resolved", "closed"]}
    })
    
    # Critical/High priority open
    critical_high = await db.crm_cases.count_documents({
        "priority": {"$in": ["critical", "high"]},
        "status": {"$nin": ["resolved", "closed"]}
    })
    
    return {
        "total_open": open_count,
        "by_status": by_status,
        "by_priority": by_priority,
        "overdue": overdue_count,
        "created_today": created_today,
        "resolved_today": resolved_today,
        "created_this_week": created_week,
        "my_open_cases": my_open,
        "unassigned": unassigned,
        "critical_high": critical_high
    }


@router.get("/{case_id}")
async def get_case(case_id: str, user: User = Depends(get_current_user)):
    """Get case details with related data"""
    case = await db.crm_cases.find_one({"case_id": case_id}, {"_id": 0})
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    
    # Get account details
    if case.get("account_id"):
        account = await db.crm_accounts.find_one(
            {"account_id": case["account_id"]},
            {"_id": 0, "account_id": 1, "name": 1, "industry": 1, "account_type": 1}
        )
        case["account"] = account
    
    # Get contact details
    if case.get("contact_id"):
        contact = await db.crm_contacts.find_one(
            {"contact_id": case["contact_id"]},
            {"_id": 0, "contact_id": 1, "full_name": 1, "email": 1, "phone": 1}
        )
        case["contact"] = contact
    
    # Get assigned user details
    if case.get("assigned_to"):
        assigned = await db.users.find_one(
            {"user_id": case["assigned_to"]},
            {"_id": 0, "user_id": 1, "name": 1, "email": 1}
        )
        case["assigned_user"] = assigned
    
    # Get activities/comments
    activities = await db.crm_case_activities.find(
        {"case_id": case_id},
        {"_id": 0}
    ).sort("created_at", -1).limit(50).to_list(50)
    case["activities"] = activities
    
    # Get related cases (same account)
    if case.get("account_id"):
        related = await db.crm_cases.find(
            {
                "account_id": case["account_id"],
                "case_id": {"$ne": case_id}
            },
            {"_id": 0, "case_id": 1, "case_number": 1, "subject": 1, "status": 1, "created_at": 1}
        ).sort("created_at", -1).limit(5).to_list(5)
        case["related_cases"] = related
    
    return case


@router.put("/{case_id}")
async def update_case(
    case_id: str,
    updates: CaseUpdate,
    user: User = Depends(get_current_user)
):
    """Update a case"""
    existing = await db.crm_cases.find_one({"case_id": case_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Case not found")
    
    update_data = {k: v for k, v in updates.model_dump().items() if v is not None}
    now = datetime.now(timezone.utc).isoformat()
    update_data["updated_at"] = now
    update_data["updated_by"] = user.user_id
    
    # Handle status change
    if updates.status and updates.status != existing.get("status"):
        # Add to status history
        status_entry = {
            "status": updates.status,
            "changed_at": now,
            "changed_by": user.user_id,
            "changed_by_name": user.name
        }
        await db.crm_cases.update_one(
            {"case_id": case_id},
            {"$push": {"status_history": status_entry}}
        )
        
        # Track resolution/closed timestamps
        if updates.status == "resolved":
            update_data["resolved_at"] = now
        elif updates.status == "closed":
            update_data["closed_at"] = now
        
        # Log activity
        await log_case_activity(
            case_id, "status_changed",
            f"Status changed from {existing.get('status')} to {updates.status}",
            user.user_id, user.name
        )
    
    # Handle assignment change
    if updates.assigned_to and updates.assigned_to != existing.get("assigned_to"):
        assigned_user = await db.users.find_one(
            {"user_id": updates.assigned_to},
            {"_id": 0, "name": 1}
        )
        if assigned_user:
            update_data["assigned_to_name"] = assigned_user.get("name")
            await log_case_activity(
                case_id, "assigned",
                f"Case assigned to {assigned_user.get('name')}",
                user.user_id, user.name
            )
    
    # Handle account change
    if updates.account_id and updates.account_id != existing.get("account_id"):
        account = await db.crm_accounts.find_one(
            {"account_id": updates.account_id},
            {"_id": 0, "name": 1}
        )
        if account:
            update_data["account_name"] = account.get("name")
    
    await db.crm_cases.update_one({"case_id": case_id}, {"$set": update_data})
    
    return {"success": True, "message": "Case updated"}


@router.delete("/{case_id}")
async def delete_case(case_id: str, user: User = Depends(get_current_user)):
    """Delete a case (admin/manager only)"""
    if user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Admin/Manager access required")
    
    result = await db.crm_cases.delete_one({"case_id": case_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Case not found")
    
    # Delete related activities
    await db.crm_case_activities.delete_many({"case_id": case_id})
    
    return {"success": True, "message": "Case deleted"}


# ==================== CASE ACTIVITIES/COMMENTS ====================

async def log_case_activity(
    case_id: str,
    activity_type: str,
    description: str,
    user_id: str,
    user_name: str,
    is_public: bool = False
):
    """Log an activity on a case"""
    activity = {
        "activity_id": generate_id("cact"),
        "case_id": case_id,
        "activity_type": activity_type,
        "description": description,
        "is_public": is_public,
        "created_by": user_id,
        "created_by_name": user_name,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.crm_case_activities.insert_one(activity)


@router.post("/{case_id}/comments")
async def add_comment(
    case_id: str,
    comment: str,
    is_public: bool = False,
    user: User = Depends(get_current_user)
):
    """Add a comment to a case"""
    existing = await db.crm_cases.find_one({"case_id": case_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Case not found")
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Update first response time if this is the first response
    if not existing.get("first_response_at") and is_public:
        await db.crm_cases.update_one(
            {"case_id": case_id},
            {"$set": {"first_response_at": now}}
        )
    
    await log_case_activity(
        case_id,
        "comment",
        comment,
        user.user_id,
        user.name,
        is_public
    )
    
    # Update case updated_at
    await db.crm_cases.update_one(
        {"case_id": case_id},
        {"$set": {"updated_at": now}}
    )
    
    return {"success": True, "message": "Comment added"}


@router.get("/{case_id}/activities")
async def get_case_activities(
    case_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    user: User = Depends(get_current_user)
):
    """Get activities for a case"""
    total = await db.crm_case_activities.count_documents({"case_id": case_id})
    skip = (page - 1) * page_size
    
    activities = await db.crm_case_activities.find(
        {"case_id": case_id},
        {"_id": 0}
    ).sort("created_at", -1).skip(skip).limit(page_size).to_list(page_size)
    
    return {
        "activities": activities,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": (total + page_size - 1) // page_size
        }
    }


# ==================== BULK OPERATIONS ====================

@router.post("/bulk-assign")
async def bulk_assign_cases(
    case_ids: List[str],
    assigned_to: str,
    user: User = Depends(get_current_user)
):
    """Bulk assign cases to a user"""
    if user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Admin/Manager access required")
    
    # Get assignee name
    assigned_user = await db.users.find_one(
        {"user_id": assigned_to},
        {"_id": 0, "name": 1}
    )
    if not assigned_user:
        raise HTTPException(status_code=404, detail="Assigned user not found")
    
    now = datetime.now(timezone.utc).isoformat()
    
    result = await db.crm_cases.update_many(
        {"case_id": {"$in": case_ids}},
        {"$set": {
            "assigned_to": assigned_to,
            "assigned_to_name": assigned_user.get("name"),
            "updated_at": now,
            "updated_by": user.user_id
        }}
    )
    
    # Log activities
    for case_id in case_ids:
        await log_case_activity(
            case_id, "assigned",
            f"Case assigned to {assigned_user.get('name')} (bulk)",
            user.user_id, user.name
        )
    
    return {"success": True, "updated": result.modified_count}


@router.post("/bulk-status")
async def bulk_update_status(
    case_ids: List[str],
    status: str,
    user: User = Depends(get_current_user)
):
    """Bulk update case status"""
    if user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Admin/Manager access required")
    
    valid_statuses = [s["value"] for s in CASE_STATUSES]
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail="Invalid status")
    
    now = datetime.now(timezone.utc).isoformat()
    
    update_data = {
        "status": status,
        "updated_at": now,
        "updated_by": user.user_id
    }
    
    if status == "resolved":
        update_data["resolved_at"] = now
    elif status == "closed":
        update_data["closed_at"] = now
    
    result = await db.crm_cases.update_many(
        {"case_id": {"$in": case_ids}},
        {"$set": update_data}
    )
    
    # Log activities and add status history
    for case_id in case_ids:
        await db.crm_cases.update_one(
            {"case_id": case_id},
            {"$push": {"status_history": {
                "status": status,
                "changed_at": now,
                "changed_by": user.user_id,
                "changed_by_name": user.name
            }}}
        )
        await log_case_activity(
            case_id, "status_changed",
            f"Status changed to {status} (bulk)",
            user.user_id, user.name
        )
    
    return {"success": True, "updated": result.modified_count}


# ==================== CASE BY ACCOUNT/CONTACT ====================

@router.get("/by-account/{account_id}")
async def get_cases_by_account(
    account_id: str,
    include_closed: bool = False,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user)
):
    """Get cases for a specific account"""
    query = {"account_id": account_id}
    if not include_closed:
        query["status"] = {"$nin": ["closed"]}
    
    total = await db.crm_cases.count_documents(query)
    skip = (page - 1) * page_size
    
    cases = await db.crm_cases.find(query, {"_id": 0}).sort(
        "created_at", -1
    ).skip(skip).limit(page_size).to_list(page_size)
    
    return {
        "cases": cases,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": (total + page_size - 1) // page_size
        }
    }


@router.get("/by-contact/{contact_id}")
async def get_cases_by_contact(
    contact_id: str,
    include_closed: bool = False,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user)
):
    """Get cases for a specific contact"""
    query = {"contact_id": contact_id}
    if not include_closed:
        query["status"] = {"$nin": ["closed"]}
    
    total = await db.crm_cases.count_documents(query)
    skip = (page - 1) * page_size
    
    cases = await db.crm_cases.find(query, {"_id": 0}).sort(
        "created_at", -1
    ).skip(skip).limit(page_size).to_list(page_size)
    
    return {
        "cases": cases,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": (total + page_size - 1) // page_size
        }
    }
