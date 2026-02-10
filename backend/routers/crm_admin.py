"""
CRM Admin Configuration Router
Manages configurable elements: stages, picklists, custom fields, layouts, automation
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from datetime import datetime, timezone
from typing import Optional, List
import uuid
import re

from database import db
from models.user import User
from models.crm_config import (
    ObjectType, FieldType,
    CustomFieldCreate, CustomFieldUpdate, PicklistOption,
    StageCreate, StageUpdate,
    PicklistConfig, PicklistConfigUpdate,
    PageLayoutConfig, PageLayoutUpdate, LayoutSection,
    AutomationRule, AssignmentRule, RuleCondition, RuleAction
)
from dependencies import get_current_user

router = APIRouter(prefix="/crm/admin", tags=["crm-admin"])


def generate_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def require_admin(user: User):
    """Check if user has admin privileges"""
    if user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Admin access required")


def validate_field_name(name: str) -> str:
    """Validate and normalize field name"""
    # Convert to snake_case, remove special chars
    name = re.sub(r'[^a-zA-Z0-9_]', '_', name.lower())
    name = re.sub(r'_+', '_', name).strip('_')
    if not name:
        raise HTTPException(status_code=400, detail="Invalid field name")
    # Ensure it doesn't conflict with system fields
    system_fields = ['_id', 'id', 'created_at', 'updated_at', 'created_by']
    if name in system_fields:
        raise HTTPException(status_code=400, detail=f"'{name}' is a reserved field name")
    return name


# ==================== DEFAULT CONFIGURATIONS ====================

DEFAULT_STAGES = [
    {"stage_id": "prospecting", "name": "Prospecting", "probability": 10, "forecast_category": "pipeline", "order": 1, "color": "#6b7280"},
    {"stage_id": "qualification", "name": "Qualification", "probability": 20, "forecast_category": "pipeline", "order": 2, "color": "#3b82f6"},
    {"stage_id": "needs_analysis", "name": "Needs Analysis", "probability": 40, "forecast_category": "pipeline", "order": 3, "color": "#8b5cf6"},
    {"stage_id": "proposal", "name": "Proposal", "probability": 60, "forecast_category": "best_case", "order": 4, "color": "#f59e0b"},
    {"stage_id": "negotiation", "name": "Negotiation", "probability": 80, "forecast_category": "commit", "order": 5, "color": "#10b981"},
    {"stage_id": "closed_won", "name": "Closed Won", "probability": 100, "forecast_category": "closed", "order": 6, "color": "#22c55e", "is_closed": True, "is_won": True},
    {"stage_id": "closed_lost", "name": "Closed Lost", "probability": 0, "forecast_category": "omitted", "order": 7, "color": "#ef4444", "is_closed": True, "is_won": False}
]

DEFAULT_PICKLISTS = {
    "lead_source": {
        "name": "Lead Source",
        "object_types": ["lead", "opportunity"],
        "options": [
            {"value": "website", "label": "Website", "order": 1},
            {"value": "trade_show", "label": "Trade Show", "order": 2},
            {"value": "referral", "label": "Referral", "order": 3},
            {"value": "cold_call", "label": "Cold Call", "order": 4},
            {"value": "social_media", "label": "Social Media", "order": 5},
            {"value": "advertising", "label": "Advertising", "order": 6},
            {"value": "partner", "label": "Partner", "order": 7},
            {"value": "other", "label": "Other", "order": 99}
        ]
    },
    "industry": {
        "name": "Industry",
        "object_types": ["account", "lead", "customer_crm"],
        "options": [
            {"value": "retail", "label": "Retail", "order": 1},
            {"value": "wholesale", "label": "Wholesale", "order": 2},
            {"value": "ecommerce", "label": "E-commerce", "order": 3},
            {"value": "manufacturing", "label": "Manufacturing", "order": 4},
            {"value": "services", "label": "Services", "order": 5},
            {"value": "hospitality", "label": "Hospitality", "order": 6},
            {"value": "healthcare", "label": "Healthcare", "order": 7},
            {"value": "education", "label": "Education", "order": 8},
            {"value": "technology", "label": "Technology", "order": 9},
            {"value": "other", "label": "Other", "order": 99}
        ]
    },
    "territory": {
        "name": "Territory",
        "object_types": ["account", "lead", "customer_crm", "opportunity"],
        "options": [
            {"value": "northeast", "label": "Northeast", "order": 1},
            {"value": "southeast", "label": "Southeast", "order": 2},
            {"value": "midwest", "label": "Midwest", "order": 3},
            {"value": "southwest", "label": "Southwest", "order": 4},
            {"value": "west", "label": "West", "order": 5},
            {"value": "international", "label": "International", "order": 6}
        ]
    },
    "account_type": {
        "name": "Account Type",
        "object_types": ["account", "customer_crm"],
        "options": [
            {"value": "prospect", "label": "Prospect", "order": 1},
            {"value": "customer", "label": "Customer", "order": 2},
            {"value": "partner", "label": "Partner", "order": 3},
            {"value": "vendor", "label": "Vendor", "order": 4},
            {"value": "competitor", "label": "Competitor", "order": 5}
        ]
    },
    "lead_status": {
        "name": "Lead Status",
        "object_types": ["lead"],
        "options": [
            {"value": "new", "label": "New", "color": "#3b82f6", "order": 1},
            {"value": "contacted", "label": "Contacted", "color": "#f59e0b", "order": 2},
            {"value": "qualified", "label": "Qualified", "color": "#10b981", "order": 3},
            {"value": "unqualified", "label": "Unqualified", "color": "#6b7280", "order": 4},
            {"value": "converted", "label": "Converted", "color": "#8b5cf6", "order": 5}
        ]
    },
    "task_priority": {
        "name": "Task Priority",
        "object_types": ["task"],
        "options": [
            {"value": "low", "label": "Low", "color": "#6b7280", "order": 1},
            {"value": "medium", "label": "Medium", "color": "#f59e0b", "order": 2},
            {"value": "high", "label": "High", "color": "#ef4444", "order": 3},
            {"value": "urgent", "label": "Urgent", "color": "#dc2626", "order": 4}
        ]
    },
    "task_status": {
        "name": "Task Status",
        "object_types": ["task"],
        "options": [
            {"value": "not_started", "label": "Not Started", "order": 1},
            {"value": "in_progress", "label": "In Progress", "order": 2},
            {"value": "completed", "label": "Completed", "order": 3},
            {"value": "deferred", "label": "Deferred", "order": 4}
        ]
    }
}


async def ensure_defaults_exist():
    """Ensure default configurations exist in database"""
    # Check if stages exist
    stages_count = await db.crm_config_stages.count_documents({})
    if stages_count == 0:
        now = datetime.now(timezone.utc).isoformat()
        for stage in DEFAULT_STAGES:
            await db.crm_config_stages.insert_one({
                **stage,
                "is_active": True,
                "created_at": now,
                "updated_at": now
            })
    
    # Check if picklists exist
    for picklist_id, config in DEFAULT_PICKLISTS.items():
        existing = await db.crm_config_picklists.find_one({"picklist_id": picklist_id})
        if not existing:
            now = datetime.now(timezone.utc).isoformat()
            await db.crm_config_picklists.insert_one({
                "picklist_id": picklist_id,
                **config,
                "allow_multiple": False,
                "allow_other": False,
                "is_active": True,
                "created_at": now,
                "updated_at": now
            })


# ==================== PIPELINE STAGES ====================

@router.get("/stages")
async def get_stages(
    include_inactive: bool = False,
    user: User = Depends(get_current_user)
):
    """Get all pipeline stages"""
    await ensure_defaults_exist()
    
    query = {} if include_inactive else {"is_active": {"$ne": False}}
    stages = await db.crm_config_stages.find(query, {"_id": 0}).sort("order", 1).to_list(100)
    return {"stages": stages}


@router.post("/stages")
async def create_stage(stage: StageCreate, user: User = Depends(get_current_user)):
    """Create a new pipeline stage"""
    require_admin(user)
    
    # Check if stage_id already exists
    existing = await db.crm_config_stages.find_one({"stage_id": stage.stage_id})
    if existing:
        raise HTTPException(status_code=400, detail=f"Stage '{stage.stage_id}' already exists")
    
    now = datetime.now(timezone.utc).isoformat()
    stage_doc = {
        **stage.model_dump(),
        "is_active": True,
        "created_at": now,
        "updated_at": now,
        "created_by": user.user_id
    }
    
    await db.crm_config_stages.insert_one(stage_doc)
    stage_doc.pop("_id", None)
    
    return {"success": True, "stage": stage_doc}


@router.put("/stages/{stage_id}")
async def update_stage(
    stage_id: str,
    updates: StageUpdate,
    user: User = Depends(get_current_user)
):
    """Update a pipeline stage"""
    require_admin(user)
    
    existing = await db.crm_config_stages.find_one({"stage_id": stage_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Stage not found")
    
    update_data = {k: v for k, v in updates.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No updates provided")
    
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    update_data["updated_by"] = user.user_id
    
    await db.crm_config_stages.update_one({"stage_id": stage_id}, {"$set": update_data})
    
    return {"success": True, "message": "Stage updated"}


@router.delete("/stages/{stage_id}")
async def delete_stage(stage_id: str, user: User = Depends(get_current_user)):
    """Deactivate a pipeline stage (soft delete)"""
    require_admin(user)
    
    # Don't allow deleting closed_won or closed_lost
    if stage_id in ["closed_won", "closed_lost"]:
        raise HTTPException(status_code=400, detail="Cannot delete system stages")
    
    result = await db.crm_config_stages.update_one(
        {"stage_id": stage_id},
        {"$set": {
            "is_active": False,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": user.user_id
        }}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Stage not found")
    
    return {"success": True, "message": "Stage deactivated"}


@router.post("/stages/reorder")
async def reorder_stages(
    stage_order: List[str],
    user: User = Depends(get_current_user)
):
    """Reorder pipeline stages"""
    require_admin(user)
    
    now = datetime.now(timezone.utc).isoformat()
    for idx, stage_id in enumerate(stage_order):
        await db.crm_config_stages.update_one(
            {"stage_id": stage_id},
            {"$set": {"order": idx + 1, "updated_at": now}}
        )
    
    return {"success": True, "message": "Stages reordered"}


# ==================== PICKLISTS ====================

@router.get("/picklists")
async def get_picklists(
    object_type: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get all picklists, optionally filtered by object type"""
    await ensure_defaults_exist()
    
    query = {"is_active": {"$ne": False}}
    if object_type:
        query["object_types"] = object_type
    
    picklists = await db.crm_config_picklists.find(query, {"_id": 0}).to_list(100)
    return {"picklists": picklists}


@router.get("/picklists/{picklist_id}")
async def get_picklist(picklist_id: str, user: User = Depends(get_current_user)):
    """Get a specific picklist configuration"""
    await ensure_defaults_exist()
    
    picklist = await db.crm_config_picklists.find_one({"picklist_id": picklist_id}, {"_id": 0})
    if not picklist:
        raise HTTPException(status_code=404, detail="Picklist not found")
    
    return picklist


@router.post("/picklists")
async def create_picklist(config: PicklistConfig, user: User = Depends(get_current_user)):
    """Create a new picklist"""
    require_admin(user)
    
    existing = await db.crm_config_picklists.find_one({"picklist_id": config.picklist_id})
    if existing:
        raise HTTPException(status_code=400, detail=f"Picklist '{config.picklist_id}' already exists")
    
    now = datetime.now(timezone.utc).isoformat()
    picklist_doc = {
        **config.model_dump(),
        "is_active": True,
        "created_at": now,
        "updated_at": now,
        "created_by": user.user_id
    }
    
    # Convert enums to strings
    picklist_doc["object_types"] = [str(ot.value) if hasattr(ot, 'value') else str(ot) for ot in picklist_doc["object_types"]]
    picklist_doc["options"] = [opt.model_dump() if hasattr(opt, 'model_dump') else opt for opt in picklist_doc["options"]]
    
    await db.crm_config_picklists.insert_one(picklist_doc)
    picklist_doc.pop("_id", None)
    
    return {"success": True, "picklist": picklist_doc}


@router.put("/picklists/{picklist_id}")
async def update_picklist(
    picklist_id: str,
    updates: PicklistConfigUpdate,
    user: User = Depends(get_current_user)
):
    """Update a picklist configuration"""
    require_admin(user)
    
    existing = await db.crm_config_picklists.find_one({"picklist_id": picklist_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Picklist not found")
    
    update_data = {k: v for k, v in updates.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No updates provided")
    
    # Convert options to dict if needed
    if "options" in update_data:
        update_data["options"] = [opt.model_dump() if hasattr(opt, 'model_dump') else opt for opt in update_data["options"]]
    
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    update_data["updated_by"] = user.user_id
    
    await db.crm_config_picklists.update_one({"picklist_id": picklist_id}, {"$set": update_data})
    
    return {"success": True, "message": "Picklist updated"}


@router.post("/picklists/{picklist_id}/options")
async def add_picklist_option(
    picklist_id: str,
    option: PicklistOption,
    user: User = Depends(get_current_user)
):
    """Add an option to a picklist"""
    require_admin(user)
    
    now = datetime.now(timezone.utc).isoformat()
    
    result = await db.crm_config_picklists.update_one(
        {"picklist_id": picklist_id},
        {
            "$push": {"options": option.model_dump()},
            "$set": {"updated_at": now, "updated_by": user.user_id}
        }
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Picklist not found")
    
    return {"success": True, "message": "Option added"}


@router.delete("/picklists/{picklist_id}/options/{option_value}")
async def remove_picklist_option(
    picklist_id: str,
    option_value: str,
    user: User = Depends(get_current_user)
):
    """Remove an option from a picklist (marks as inactive)"""
    require_admin(user)
    
    picklist = await db.crm_config_picklists.find_one({"picklist_id": picklist_id})
    if not picklist:
        raise HTTPException(status_code=404, detail="Picklist not found")
    
    # Mark option as inactive instead of removing
    options = picklist.get("options", [])
    for opt in options:
        if opt.get("value") == option_value:
            opt["is_active"] = False
    
    await db.crm_config_picklists.update_one(
        {"picklist_id": picklist_id},
        {"$set": {
            "options": options,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": user.user_id
        }}
    )
    
    return {"success": True, "message": "Option deactivated"}


# ==================== CUSTOM FIELDS ====================

@router.get("/fields")
async def get_custom_fields(
    object_type: Optional[str] = None,
    include_inactive: bool = False,
    user: User = Depends(get_current_user)
):
    """Get all custom fields, optionally filtered by object type"""
    query = {} if include_inactive else {"is_active": {"$ne": False}}
    if object_type:
        query["object_type"] = object_type
    
    fields = await db.crm_config_fields.find(query, {"_id": 0}).sort("order", 1).to_list(500)
    return {"fields": fields}


@router.get("/fields/{object_type}")
async def get_object_fields(
    object_type: str,
    include_system: bool = True,
    user: User = Depends(get_current_user)
):
    """Get all fields for an object type (system + custom)"""
    # System fields by object type
    system_fields = {
        "account": [
            {"field_name": "name", "label": "Account Name", "field_type": "text", "required": True, "is_system": True},
            {"field_name": "account_type", "label": "Type", "field_type": "picklist", "picklist_id": "account_type", "is_system": True},
            {"field_name": "industry", "label": "Industry", "field_type": "picklist", "picklist_id": "industry", "is_system": True},
            {"field_name": "phone", "label": "Phone", "field_type": "phone", "is_system": True},
            {"field_name": "website", "label": "Website", "field_type": "url", "is_system": True},
            {"field_name": "description", "label": "Description", "field_type": "textarea", "is_system": True},
        ],
        "contact": [
            {"field_name": "first_name", "label": "First Name", "field_type": "text", "required": True, "is_system": True},
            {"field_name": "last_name", "label": "Last Name", "field_type": "text", "required": True, "is_system": True},
            {"field_name": "email", "label": "Email", "field_type": "email", "is_system": True},
            {"field_name": "phone", "label": "Phone", "field_type": "phone", "is_system": True},
            {"field_name": "title", "label": "Title", "field_type": "text", "is_system": True},
            {"field_name": "account_id", "label": "Account", "field_type": "lookup", "lookup_object": "account", "is_system": True},
        ],
        "lead": [
            {"field_name": "first_name", "label": "First Name", "field_type": "text", "required": True, "is_system": True},
            {"field_name": "last_name", "label": "Last Name", "field_type": "text", "required": True, "is_system": True},
            {"field_name": "company", "label": "Company", "field_type": "text", "is_system": True},
            {"field_name": "email", "label": "Email", "field_type": "email", "is_system": True},
            {"field_name": "phone", "label": "Phone", "field_type": "phone", "is_system": True},
            {"field_name": "source", "label": "Lead Source", "field_type": "picklist", "picklist_id": "lead_source", "is_system": True},
            {"field_name": "status", "label": "Status", "field_type": "picklist", "picklist_id": "lead_status", "is_system": True},
            {"field_name": "industry", "label": "Industry", "field_type": "picklist", "picklist_id": "industry", "is_system": True},
        ],
        "opportunity": [
            {"field_name": "name", "label": "Opportunity Name", "field_type": "text", "required": True, "is_system": True},
            {"field_name": "account_id", "label": "Account", "field_type": "lookup", "lookup_object": "account", "required": True, "is_system": True},
            {"field_name": "amount", "label": "Amount", "field_type": "currency", "is_system": True},
            {"field_name": "probability", "label": "Probability (%)", "field_type": "percent", "is_system": True},
            {"field_name": "stage", "label": "Stage", "field_type": "picklist", "is_system": True, "picklist_id": "_stages"},
            {"field_name": "close_date", "label": "Close Date", "field_type": "date", "required": True, "is_system": True},
            {"field_name": "lead_source", "label": "Lead Source", "field_type": "picklist", "picklist_id": "lead_source", "is_system": True},
            {"field_name": "next_step", "label": "Next Step", "field_type": "text", "is_system": True},
            {"field_name": "description", "label": "Description", "field_type": "textarea", "is_system": True},
        ],
        "customer_crm": [
            {"field_name": "account_status", "label": "Account Status", "field_type": "picklist", "is_system": True},
            {"field_name": "industry", "label": "Industry", "field_type": "picklist", "picklist_id": "industry", "is_system": True},
            {"field_name": "territory", "label": "Territory", "field_type": "picklist", "picklist_id": "territory", "is_system": True},
            {"field_name": "account_type", "label": "Account Type", "field_type": "text", "is_system": True},
            {"field_name": "credit_limit", "label": "Credit Limit", "field_type": "currency", "is_system": True},
            {"field_name": "payment_terms", "label": "Payment Terms", "field_type": "text", "is_system": True},
            {"field_name": "notes", "label": "Notes", "field_type": "textarea", "is_system": True},
        ]
    }
    
    result = []
    
    # Add system fields
    if include_system and object_type in system_fields:
        result.extend(system_fields[object_type])
    
    # Add custom fields
    custom_fields = await db.crm_config_fields.find(
        {"object_type": object_type, "is_active": {"$ne": False}},
        {"_id": 0}
    ).sort("order", 1).to_list(100)
    
    result.extend(custom_fields)
    
    return {"fields": result, "object_type": object_type}


@router.post("/fields")
async def create_custom_field(field: CustomFieldCreate, user: User = Depends(get_current_user)):
    """Create a new custom field"""
    require_admin(user)
    
    # Validate and normalize field name
    field_name = validate_field_name(field.field_name)
    
    # Check if field already exists for this object
    existing = await db.crm_config_fields.find_one({
        "object_type": field.object_type,
        "field_name": field_name
    })
    if existing:
        raise HTTPException(status_code=400, detail=f"Field '{field_name}' already exists on {field.object_type}")
    
    # Get next order number
    last_field = await db.crm_config_fields.find_one(
        {"object_type": field.object_type},
        sort=[("order", -1)]
    )
    next_order = (last_field.get("order", 0) if last_field else 0) + 1
    
    now = datetime.now(timezone.utc).isoformat()
    field_doc = {
        "field_id": generate_id("fld"),
        **field.model_dump(),
        "field_name": field_name,
        "object_type": str(field.object_type.value) if hasattr(field.object_type, 'value') else str(field.object_type),
        "field_type": str(field.field_type.value) if hasattr(field.field_type, 'value') else str(field.field_type),
        "order": field.order or next_order,
        "is_active": True,
        "is_system": False,
        "created_at": now,
        "updated_at": now,
        "created_by": user.user_id
    }
    
    # Convert picklist options if present
    if field_doc.get("picklist_options"):
        field_doc["picklist_options"] = [
            opt.model_dump() if hasattr(opt, 'model_dump') else opt 
            for opt in field_doc["picklist_options"]
        ]
    
    await db.crm_config_fields.insert_one(field_doc)
    field_doc.pop("_id", None)
    
    return {"success": True, "field": field_doc}


@router.put("/fields/{field_id}")
async def update_custom_field(
    field_id: str,
    updates: CustomFieldUpdate,
    user: User = Depends(get_current_user)
):
    """Update a custom field"""
    require_admin(user)
    
    existing = await db.crm_config_fields.find_one({"field_id": field_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Field not found")
    
    if existing.get("is_system"):
        raise HTTPException(status_code=400, detail="Cannot modify system fields")
    
    update_data = {k: v for k, v in updates.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No updates provided")
    
    # Convert picklist options if present
    if "picklist_options" in update_data:
        update_data["picklist_options"] = [
            opt.model_dump() if hasattr(opt, 'model_dump') else opt 
            for opt in update_data["picklist_options"]
        ]
    
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    update_data["updated_by"] = user.user_id
    
    await db.crm_config_fields.update_one({"field_id": field_id}, {"$set": update_data})
    
    return {"success": True, "message": "Field updated"}


@router.delete("/fields/{field_id}")
async def delete_custom_field(field_id: str, user: User = Depends(get_current_user)):
    """Deactivate a custom field (soft delete)"""
    require_admin(user)
    
    existing = await db.crm_config_fields.find_one({"field_id": field_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Field not found")
    
    if existing.get("is_system"):
        raise HTTPException(status_code=400, detail="Cannot delete system fields")
    
    await db.crm_config_fields.update_one(
        {"field_id": field_id},
        {"$set": {
            "is_active": False,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": user.user_id
        }}
    )
    
    return {"success": True, "message": "Field deactivated"}


# ==================== PAGE LAYOUTS ====================

@router.get("/layouts/{object_type}")
async def get_page_layout(object_type: str, user: User = Depends(get_current_user)):
    """Get page layout for an object type"""
    layout = await db.crm_config_layouts.find_one(
        {"object_type": object_type},
        {"_id": 0}
    )
    
    if not layout:
        # Return default layout
        layout = {
            "object_type": object_type,
            "layout_name": "default",
            "sections": [
                {"section_id": "details", "name": "Details", "columns": 2, "order": 1, "fields": []},
                {"section_id": "custom_fields", "name": "Additional Information", "columns": 2, "order": 2, "fields": []},
                {"section_id": "description", "name": "Description", "columns": 1, "order": 3, "fields": ["description"]}
            ],
            "related_lists": [],
            "available_actions": ["edit", "delete"]
        }
    
    return layout


@router.put("/layouts/{object_type}")
async def update_page_layout(
    object_type: str,
    layout: PageLayoutUpdate,
    user: User = Depends(get_current_user)
):
    """Update page layout for an object type"""
    require_admin(user)
    
    update_data = {k: v for k, v in layout.model_dump().items() if v is not None}
    if "sections" in update_data:
        update_data["sections"] = [
            s.model_dump() if hasattr(s, 'model_dump') else s 
            for s in update_data["sections"]
        ]
    
    update_data["object_type"] = object_type
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    update_data["updated_by"] = user.user_id
    
    await db.crm_config_layouts.update_one(
        {"object_type": object_type},
        {"$set": update_data},
        upsert=True
    )
    
    return {"success": True, "message": "Layout updated"}


# ==================== AUTOMATION RULES ====================

@router.get("/automation-rules")
async def get_automation_rules(
    object_type: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get all automation rules"""
    query = {}
    if object_type:
        query["object_type"] = object_type
    
    rules = await db.crm_config_automation.find(query, {"_id": 0}).sort("order", 1).to_list(100)
    return {"rules": rules}


@router.post("/automation-rules")
async def create_automation_rule(rule: AutomationRule, user: User = Depends(get_current_user)):
    """Create an automation rule"""
    require_admin(user)
    
    now = datetime.now(timezone.utc).isoformat()
    rule_doc = {
        "rule_id": generate_id("rule"),
        **rule.model_dump(),
        "object_type": str(rule.object_type.value) if hasattr(rule.object_type, 'value') else str(rule.object_type),
        "created_at": now,
        "updated_at": now,
        "created_by": user.user_id
    }
    
    # Convert nested models
    rule_doc["conditions"] = [c.model_dump() if hasattr(c, 'model_dump') else c for c in rule_doc.get("conditions", [])]
    rule_doc["actions"] = [a.model_dump() if hasattr(a, 'model_dump') else a for a in rule_doc.get("actions", [])]
    
    await db.crm_config_automation.insert_one(rule_doc)
    rule_doc.pop("_id", None)
    
    return {"success": True, "rule": rule_doc}


@router.put("/automation-rules/{rule_id}")
async def update_automation_rule(
    rule_id: str,
    rule: AutomationRule,
    user: User = Depends(get_current_user)
):
    """Update an automation rule"""
    require_admin(user)
    
    existing = await db.crm_config_automation.find_one({"rule_id": rule_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Rule not found")
    
    update_data = rule.model_dump()
    update_data["object_type"] = str(rule.object_type.value) if hasattr(rule.object_type, 'value') else str(rule.object_type)
    update_data["conditions"] = [c.model_dump() if hasattr(c, 'model_dump') else c for c in update_data.get("conditions", [])]
    update_data["actions"] = [a.model_dump() if hasattr(a, 'model_dump') else a for a in update_data.get("actions", [])]
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    update_data["updated_by"] = user.user_id
    
    await db.crm_config_automation.update_one({"rule_id": rule_id}, {"$set": update_data})
    
    return {"success": True, "message": "Rule updated"}


@router.delete("/automation-rules/{rule_id}")
async def delete_automation_rule(rule_id: str, user: User = Depends(get_current_user)):
    """Delete an automation rule"""
    require_admin(user)
    
    result = await db.crm_config_automation.delete_one({"rule_id": rule_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Rule not found")
    
    return {"success": True, "message": "Rule deleted"}


# ==================== ASSIGNMENT RULES ====================

@router.get("/assignment-rules")
async def get_assignment_rules(
    object_type: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get all assignment rules"""
    query = {}
    if object_type:
        query["object_type"] = object_type
    
    rules = await db.crm_config_assignment.find(query, {"_id": 0}).sort("order", 1).to_list(100)
    return {"rules": rules}


@router.post("/assignment-rules")
async def create_assignment_rule(rule: AssignmentRule, user: User = Depends(get_current_user)):
    """Create an assignment rule"""
    require_admin(user)
    
    now = datetime.now(timezone.utc).isoformat()
    rule_doc = {
        "rule_id": generate_id("assign"),
        **rule.model_dump(),
        "object_type": str(rule.object_type.value) if hasattr(rule.object_type, 'value') else str(rule.object_type),
        "created_at": now,
        "updated_at": now,
        "created_by": user.user_id
    }
    
    rule_doc["conditions"] = [c.model_dump() if hasattr(c, 'model_dump') else c for c in rule_doc.get("conditions", [])]
    
    await db.crm_config_assignment.insert_one(rule_doc)
    rule_doc.pop("_id", None)
    
    return {"success": True, "rule": rule_doc}


# ==================== FULL CONFIGURATION EXPORT/IMPORT ====================

@router.get("/export")
async def export_configuration(user: User = Depends(get_current_user)):
    """Export all CRM configuration"""
    require_admin(user)
    
    stages = await db.crm_config_stages.find({}, {"_id": 0}).to_list(100)
    picklists = await db.crm_config_picklists.find({}, {"_id": 0}).to_list(100)
    fields = await db.crm_config_fields.find({}, {"_id": 0}).to_list(500)
    layouts = await db.crm_config_layouts.find({}, {"_id": 0}).to_list(100)
    automation = await db.crm_config_automation.find({}, {"_id": 0}).to_list(100)
    assignment = await db.crm_config_assignment.find({}, {"_id": 0}).to_list(100)
    
    return {
        "export_date": datetime.now(timezone.utc).isoformat(),
        "stages": stages,
        "picklists": picklists,
        "custom_fields": fields,
        "layouts": layouts,
        "automation_rules": automation,
        "assignment_rules": assignment
    }
