"""
Automation Router - Lead Assignment, Stale Opportunity Rules & Approval Workflows
"""
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from datetime import datetime, timezone, timedelta
from typing import Optional, List
import uuid

from database import db
from models.user import User
from models.automation import (
    LeadAssignmentRuleCreate, LeadAssignmentRuleUpdate,
    StaleOpportunityRuleCreate, StaleOpportunityRuleUpdate,
    AssignmentMethod, RuleStatus, HIGH_SIGNAL_FIELDS, SystemEventType,
    ApprovalRuleCreate, ApprovalRuleUpdate, ApprovalRequestCreate, ApprovalStatus
)
from dependencies import get_current_user
from routers.timeline import log_system_event

router = APIRouter(prefix="/automation", tags=["automation"])


def generate_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


# ==================== LEAD ASSIGNMENT RULES ====================

@router.get("/lead-assignment-rules")
async def get_lead_assignment_rules(
    status: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get all lead assignment rules"""
    if user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Admin/Manager access required")
    
    query = {}
    if status:
        query["status"] = status
    
    rules = await db.automation_lead_assignment.find(query, {"_id": 0}).sort("priority", 1).to_list(100)
    
    # Enrich with assignee names
    for rule in rules:
        assignee_ids = rule.get("assignee_user_ids", [])
        if assignee_ids:
            users = await db.users.find(
                {"user_id": {"$in": assignee_ids}},
                {"_id": 0, "user_id": 1, "name": 1}
            ).to_list(100)
            rule["assignees"] = users
    
    return {"rules": rules}


@router.post("/lead-assignment-rules")
async def create_lead_assignment_rule(
    rule: LeadAssignmentRuleCreate,
    user: User = Depends(get_current_user)
):
    """Create a new lead assignment rule"""
    if user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Admin/Manager access required")
    
    now = datetime.now(timezone.utc).isoformat()
    rule_id = generate_id("lar")
    
    rule_doc = {
        "rule_id": rule_id,
        **rule.model_dump(),
        "last_assigned_index": 0,  # For round-robin tracking
        "created_by": user.user_id,
        "created_at": now,
        "updated_at": now
    }
    
    await db.automation_lead_assignment.insert_one(rule_doc)
    rule_doc.pop("_id", None)
    
    return {"success": True, "rule": rule_doc}


@router.put("/lead-assignment-rules/{rule_id}")
async def update_lead_assignment_rule(
    rule_id: str,
    updates: LeadAssignmentRuleUpdate,
    user: User = Depends(get_current_user)
):
    """Update a lead assignment rule"""
    if user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Admin/Manager access required")
    
    existing = await db.automation_lead_assignment.find_one({"rule_id": rule_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Rule not found")
    
    update_data = {k: v for k, v in updates.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No updates provided")
    
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.automation_lead_assignment.update_one({"rule_id": rule_id}, {"$set": update_data})
    
    return {"success": True, "message": "Rule updated"}


@router.delete("/lead-assignment-rules/{rule_id}")
async def delete_lead_assignment_rule(
    rule_id: str,
    user: User = Depends(get_current_user)
):
    """Delete a lead assignment rule"""
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    result = await db.automation_lead_assignment.delete_one({"rule_id": rule_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Rule not found")
    
    return {"success": True, "message": "Rule deleted"}


# ==================== STALE OPPORTUNITY RULES ====================

@router.get("/stale-opportunity-rules")
async def get_stale_opportunity_rules(
    status: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get all stale opportunity rules"""
    if user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Admin/Manager access required")
    
    query = {}
    if status:
        query["status"] = status
    
    rules = await db.automation_stale_opportunity.find(query, {"_id": 0}).to_list(100)
    return {"rules": rules}


@router.post("/stale-opportunity-rules")
async def create_stale_opportunity_rule(
    rule: StaleOpportunityRuleCreate,
    user: User = Depends(get_current_user)
):
    """Create a new stale opportunity rule"""
    if user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Admin/Manager access required")
    
    now = datetime.now(timezone.utc).isoformat()
    rule_id = generate_id("sor")
    
    rule_doc = {
        "rule_id": rule_id,
        **rule.model_dump(),
        "last_run_at": None,
        "created_by": user.user_id,
        "created_at": now,
        "updated_at": now
    }
    
    await db.automation_stale_opportunity.insert_one(rule_doc)
    rule_doc.pop("_id", None)
    
    return {"success": True, "rule": rule_doc}


@router.put("/stale-opportunity-rules/{rule_id}")
async def update_stale_opportunity_rule(
    rule_id: str,
    updates: StaleOpportunityRuleUpdate,
    user: User = Depends(get_current_user)
):
    """Update a stale opportunity rule"""
    if user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Admin/Manager access required")
    
    existing = await db.automation_stale_opportunity.find_one({"rule_id": rule_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Rule not found")
    
    update_data = {k: v for k, v in updates.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No updates provided")
    
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.automation_stale_opportunity.update_one({"rule_id": rule_id}, {"$set": update_data})
    
    return {"success": True, "message": "Rule updated"}


@router.delete("/stale-opportunity-rules/{rule_id}")
async def delete_stale_opportunity_rule(
    rule_id: str,
    user: User = Depends(get_current_user)
):
    """Delete a stale opportunity rule"""
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    result = await db.automation_stale_opportunity.delete_one({"rule_id": rule_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Rule not found")
    
    return {"success": True, "message": "Rule deleted"}


# ==================== LEAD ASSIGNMENT EXECUTION ====================

async def execute_lead_assignment(lead_doc: dict) -> Optional[dict]:
    """
    Execute lead assignment rules for a newly created lead.
    Returns the assigned user info if assignment occurred.
    """
    # Get active rules sorted by priority
    rules = await db.automation_lead_assignment.find(
        {"status": "active"}
    ).sort("priority", 1).to_list(100)
    
    if not rules:
        return None
    
    for rule in rules:
        # Check if rule conditions match
        if not _check_rule_conditions(rule, lead_doc):
            continue
        
        # Get assignee based on method
        assignee = await _get_assignee_for_rule(rule)
        if not assignee:
            continue
        
        # Update lead with assigned owner
        await db.crm_leads.update_one(
            {"lead_id": lead_doc["lead_id"]},
            {"$set": {
                "owner_id": assignee["user_id"],
                "owner_name": assignee.get("name", "Unknown"),
                "assigned_at": datetime.now(timezone.utc).isoformat(),
                "assigned_by_rule": rule["rule_id"]
            }}
        )
        
        # Log automation event to timeline
        await log_system_event(
            entity_type="lead",
            entity_id=lead_doc["lead_id"],
            activity_type="auto_assigned",
            body=f"Lead automatically assigned to {assignee.get('name', 'Unknown')} via rule: {rule['name']}",
            metadata={
                "rule_id": rule["rule_id"],
                "rule_name": rule["name"],
                "method": rule["method"],
                "assigned_user_id": assignee["user_id"],
                "assigned_user_name": assignee.get("name")
            },
            user_id="system",
            user_name="Automation"
        )
        
        return {
            "assigned_to": assignee,
            "rule": rule
        }
    
    return None


def _check_rule_conditions(rule: dict, lead_doc: dict) -> bool:
    """Check if lead matches rule conditions"""
    conditions = rule.get("conditions", {})
    
    if not conditions:
        return True  # No conditions = matches all
    
    for field, expected_value in conditions.items():
        lead_value = lead_doc.get(field)
        
        # Handle list conditions (any match)
        if isinstance(expected_value, list):
            if lead_value not in expected_value:
                return False
        # Handle exact match
        elif lead_value != expected_value:
            return False
    
    return True


async def _get_assignee_for_rule(rule: dict) -> Optional[dict]:
    """Get the next assignee based on rule method"""
    assignee_ids = rule.get("assignee_user_ids", [])
    
    if not assignee_ids:
        return None
    
    method = rule.get("method", "round_robin")
    
    if method == "round_robin":
        # Get next index and rotate
        current_index = rule.get("last_assigned_index", 0)
        next_index = (current_index + 1) % len(assignee_ids)
        
        # Update the index for next assignment
        await db.automation_lead_assignment.update_one(
            {"rule_id": rule["rule_id"]},
            {"$set": {"last_assigned_index": next_index}}
        )
        
        user_id = assignee_ids[current_index]
    
    elif method == "specific_user":
        # Always assign to first user in list
        user_id = assignee_ids[0]
    
    else:
        # For territory/source based, use round-robin within the pool
        current_index = rule.get("last_assigned_index", 0)
        next_index = (current_index + 1) % len(assignee_ids)
        
        await db.automation_lead_assignment.update_one(
            {"rule_id": rule["rule_id"]},
            {"$set": {"last_assigned_index": next_index}}
        )
        
        user_id = assignee_ids[current_index]
    
    # Get user details
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "user_id": 1, "name": 1, "email": 1})
    return user


# ==================== STALE OPPORTUNITY CHECK ====================

async def check_stale_opportunities():
    """
    Daily job to check for stale opportunities and send notifications.
    Called by the scheduler.
    """
    import logging
    logger = logging.getLogger(__name__)
    
    logger.info("Running stale opportunity check...")
    
    # Get active rules
    rules = await db.automation_stale_opportunity.find(
        {"status": "active"}
    ).to_list(100)
    
    if not rules:
        logger.info("No active stale opportunity rules found")
        return
    
    now = datetime.now(timezone.utc)
    notifications_created = 0
    
    for rule in rules:
        threshold_days = rule.get("days_threshold", 14)
        cutoff_date = now - timedelta(days=threshold_days)
        applicable_stages = rule.get("applicable_stages", [])
        
        # Build query for stale opportunities
        query = {
            "stage": {"$nin": ["closed_won", "closed_lost"]},  # Only open opps
            "updated_at": {"$lt": cutoff_date.isoformat()}
        }
        
        if applicable_stages:
            query["stage"] = {"$in": applicable_stages, "$nin": ["closed_won", "closed_lost"]}
        
        # Find stale opportunities
        stale_opps = await db.crm_opportunities.find(query, {"_id": 0}).to_list(500)
        
        for opp in stale_opps:
            # Check if we already sent a reminder recently (last 24 hours)
            recent_reminder = await db.timeline_items.find_one({
                "entity_type": "opportunity",
                "entity_id": opp["opportunity_id"],
                "activity_type": "stale_reminder",
                "created_at": {"$gt": (now - timedelta(hours=24)).isoformat()}
            })
            
            if recent_reminder:
                continue  # Skip if already reminded today
            
            # Calculate days stale
            last_activity = opp.get("updated_at", opp.get("created_at"))
            if isinstance(last_activity, str):
                last_activity_dt = datetime.fromisoformat(last_activity.replace('Z', '+00:00'))
            else:
                last_activity_dt = last_activity
            
            if last_activity_dt.tzinfo is None:
                last_activity_dt = last_activity_dt.replace(tzinfo=timezone.utc)
            
            days_stale = (now - last_activity_dt).days
            
            # Create notification for owner
            if rule.get("notify_owner", True) and opp.get("owner_id"):
                await _create_stale_notification(
                    opp, days_stale, opp["owner_id"], rule
                )
                notifications_created += 1
            
            # Create notifications for additional users
            for user_id in rule.get("additional_notify_user_ids", []):
                await _create_stale_notification(
                    opp, days_stale, user_id, rule
                )
                notifications_created += 1
            
            # Log to timeline
            await log_system_event(
                entity_type="opportunity",
                entity_id=opp["opportunity_id"],
                activity_type="stale_reminder",
                body=f"This opportunity has had no activity for {days_stale} days",
                metadata={
                    "days_stale": days_stale,
                    "rule_id": rule["rule_id"],
                    "rule_name": rule["name"],
                    "threshold_days": threshold_days
                },
                user_id="system",
                user_name="Automation"
            )
        
        # Update last run time
        await db.automation_stale_opportunity.update_one(
            {"rule_id": rule["rule_id"]},
            {"$set": {"last_run_at": now.isoformat()}}
        )
    
    logger.info(f"Stale opportunity check complete. Created {notifications_created} notifications.")
    return {"notifications_created": notifications_created}


async def _create_stale_notification(opp: dict, days_stale: int, user_id: str, rule: dict):
    """Create an in-app notification for stale opportunity"""
    now = datetime.now(timezone.utc).isoformat()
    
    notification = {
        "notification_id": generate_id("notif"),
        "user_id": user_id,
        "notification_type": "stale_opportunity",
        "title": f"Stale Opportunity: {opp.get('name', 'Unknown')}",
        "body": f"No activity for {days_stale} days. Amount: ${opp.get('amount', 0):,.0f}",
        "entity_type": "opportunity",
        "entity_id": opp["opportunity_id"],
        "metadata": {
            "days_stale": days_stale,
            "amount": opp.get("amount"),
            "stage": opp.get("stage"),
            "rule_id": rule["rule_id"]
        },
        "is_read": False,
        "created_at": now
    }
    
    await db.timeline_notifications.insert_one(notification)


# ==================== MANUAL TRIGGER ENDPOINTS ====================

@router.post("/run-stale-check")
async def run_stale_check_manually(
    user: User = Depends(get_current_user)
):
    """Manually trigger stale opportunity check (admin only)"""
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    result = await check_stale_opportunities()
    return {"success": True, "result": result}


@router.post("/test-assignment/{lead_id}")
async def test_lead_assignment(
    lead_id: str,
    user: User = Depends(get_current_user)
):
    """Test lead assignment rules on an existing lead (dry run)"""
    if user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Admin/Manager access required")
    
    lead = await db.crm_leads.find_one({"lead_id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    # Get matching rules without actually assigning
    rules = await db.automation_lead_assignment.find(
        {"status": "active"}
    ).sort("priority", 1).to_list(100)
    
    matching_rules = []
    for rule in rules:
        if _check_rule_conditions(rule, lead):
            assignee = await _get_assignee_for_rule(rule)
            matching_rules.append({
                "rule_id": rule["rule_id"],
                "rule_name": rule["name"],
                "method": rule["method"],
                "would_assign_to": assignee
            })
    
    return {
        "lead_id": lead_id,
        "current_owner": lead.get("owner_id"),
        "matching_rules": matching_rules,
        "would_use_rule": matching_rules[0] if matching_rules else None
    }


# ==================== HIGH-SIGNAL FIELD CHANGE LOGGING ====================

async def log_field_changes(
    entity_type: str,
    entity_id: str,
    old_values: dict,
    new_values: dict,
    user_id: str,
    user_name: str
):
    """
    Log high-signal field changes to timeline.
    Only logs fields defined in HIGH_SIGNAL_FIELDS.
    """
    tracked_fields = HIGH_SIGNAL_FIELDS.get(entity_type, [])
    
    for field in tracked_fields:
        old_val = old_values.get(field)
        new_val = new_values.get(field)
        
        if old_val == new_val:
            continue
        
        # Determine activity type based on field
        activity_type = _get_activity_type_for_field(field)
        
        # Format values for display
        old_display = _format_field_value(field, old_val)
        new_display = _format_field_value(field, new_val)
        
        # Create timeline entry
        await log_system_event(
            entity_type=entity_type,
            entity_id=entity_id,
            activity_type=activity_type,
            body=f"{_get_field_label(field)} changed from {old_display} to {new_display}",
            metadata={
                "field": field,
                "old_value": old_val,
                "new_value": new_val,
                "old_display": old_display,
                "new_display": new_display
            },
            user_id=user_id,
            user_name=user_name
        )


def _get_activity_type_for_field(field: str) -> str:
    """Map field to activity type"""
    field_map = {
        "stage": "stage_changed",
        "status": "status_changed",
        "owner_id": "owner_changed",
        "owner_user_id": "owner_changed",
        "amount": "amount_changed",
        "close_date": "close_date_changed",
    }
    return field_map.get(field, "field_update")


def _get_field_label(field: str) -> str:
    """Get human-readable label for field"""
    labels = {
        "stage": "Stage",
        "status": "Status",
        "owner_id": "Owner",
        "owner_user_id": "Owner",
        "amount": "Amount",
        "close_date": "Close Date",
        "probability": "Probability",
        "forecast_category": "Forecast Category",
        "account_status": "Account Status",
        "source": "Lead Source"
    }
    return labels.get(field, field.replace("_", " ").title())


def _format_field_value(field: str, value) -> str:
    """Format field value for display"""
    if value is None:
        return "None"
    
    if field == "amount":
        return f"${value:,.0f}" if isinstance(value, (int, float)) else str(value)
    
    if field in ["stage", "status", "account_status", "forecast_category"]:
        return str(value).replace("_", " ").title()
    
    return str(value)


# ==================== RECORD LIFECYCLE EVENTS ====================

async def log_record_created(
    entity_type: str,
    entity_id: str,
    entity_name: str,
    user_id: str,
    user_name: str,
    metadata: dict = None
):
    """Log when a record is created"""
    await log_system_event(
        entity_type=entity_type,
        entity_id=entity_id,
        activity_type="record_created",
        body=f"{entity_type.title()} created: {entity_name}",
        metadata=metadata or {},
        user_id=user_id,
        user_name=user_name
    )


async def log_record_deleted(
    entity_type: str,
    entity_id: str,
    entity_name: str,
    user_id: str,
    user_name: str
):
    """Log when a record is deleted"""
    await log_system_event(
        entity_type=entity_type,
        entity_id=entity_id,
        activity_type="record_deleted",
        body=f"{entity_type.title()} deleted: {entity_name}",
        metadata={"deleted_name": entity_name},
        user_id=user_id,
        user_name=user_name
    )


async def log_lead_converted(
    lead_id: str,
    lead_name: str,
    account_id: str,
    contact_id: str,
    opportunity_id: str,
    user_id: str,
    user_name: str
):
    """Log when a lead is converted"""
    await log_system_event(
        entity_type="lead",
        entity_id=lead_id,
        activity_type="lead_converted",
        body="Lead converted to Account, Contact, and Opportunity",
        metadata={
            "account_id": account_id,
            "contact_id": contact_id,
            "opportunity_id": opportunity_id
        },
        user_id=user_id,
        user_name=user_name
    )


async def log_opportunity_closed(
    opportunity_id: str,
    is_won: bool,
    amount: float,
    user_id: str,
    user_name: str
):
    """Log when an opportunity is closed (won or lost)"""
    activity_type = "opportunity_won" if is_won else "opportunity_lost"
    status_text = "Won" if is_won else "Lost"
    
    await log_system_event(
        entity_type="opportunity",
        entity_id=opportunity_id,
        activity_type=activity_type,
        body=f"Opportunity Closed {status_text}" + (f" - ${amount:,.0f}" if is_won else ""),
        metadata={
            "is_won": is_won,
            "amount": amount if is_won else 0
        },
        user_id=user_id,
        user_name=user_name
    )


# ==================== ERP/SHOPIFY EVENT LOGGING ====================

async def log_erp_event(
    entity_type: str,
    entity_id: str,
    event_type: str,
    description: str,
    metadata: dict = None
):
    """Log ERP system events (orders, fulfillment, etc.)"""
    await log_system_event(
        entity_type=entity_type,
        entity_id=entity_id,
        activity_type=event_type,
        body=description,
        metadata=metadata or {},
        user_id="system",
        user_name="ERP System"
    )


async def log_shopify_sync(
    entity_type: str,
    entity_id: str,
    sync_type: str,
    changes_summary: str,
    metadata: dict = None
):
    """Log Shopify sync events"""
    await log_system_event(
        entity_type=entity_type,
        entity_id=entity_id,
        activity_type="shopify_sync",
        body=f"Shopify {sync_type}: {changes_summary}",
        metadata=metadata or {},
        user_id="system",
        user_name="Shopify Sync"
    )


# ==================== APPROVAL WORKFLOW RULES ====================

@router.get("/approval-rules")
async def get_approval_rules(
    status: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get all approval rules"""
    if user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Admin/Manager access required")
    
    query = {}
    if status:
        query["status"] = status
    
    rules = await db.automation_approval_rules.find(query, {"_id": 0}).sort("threshold", 1).to_list(100)
    
    # Enrich with approver names
    for rule in rules:
        approver_ids = rule.get("approver_user_ids", [])
        if approver_ids:
            users = await db.users.find(
                {"user_id": {"$in": approver_ids}},
                {"_id": 0, "user_id": 1, "name": 1, "email": 1}
            ).to_list(100)
            rule["approvers"] = users
    
    return {"rules": rules}


@router.post("/approval-rules")
async def create_approval_rule(
    rule: ApprovalRuleCreate,
    user: User = Depends(get_current_user)
):
    """Create a new approval rule"""
    if user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Admin/Manager access required")
    
    rule_id = generate_id("appr")
    now = datetime.now(timezone.utc).isoformat()
    
    rule_doc = {
        "rule_id": rule_id,
        **rule.model_dump(),
        "created_by": user.user_id,
        "created_by_name": user.name,
        "created_at": now,
        "updated_at": now
    }
    
    await db.automation_approval_rules.insert_one(rule_doc)
    rule_doc.pop("_id", None)
    return rule_doc


@router.put("/approval-rules/{rule_id}")
async def update_approval_rule(
    rule_id: str,
    updates: ApprovalRuleUpdate,
    user: User = Depends(get_current_user)
):
    """Update an approval rule"""
    if user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Admin/Manager access required")
    
    existing = await db.automation_approval_rules.find_one({"rule_id": rule_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Rule not found")
    
    update_data = {k: v for k, v in updates.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    update_data["updated_by"] = user.user_id
    
    await db.automation_approval_rules.update_one({"rule_id": rule_id}, {"$set": update_data})
    return {"success": True, "message": "Rule updated"}


@router.delete("/approval-rules/{rule_id}")
async def delete_approval_rule(
    rule_id: str,
    user: User = Depends(get_current_user)
):
    """Delete an approval rule"""
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    result = await db.automation_approval_rules.delete_one({"rule_id": rule_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Rule not found")
    
    return {"success": True, "message": "Rule deleted"}


# ==================== APPROVAL REQUESTS ====================

async def check_and_create_approval(
    entity_type: str,
    entity_id: str,
    discount_percent: float,
    discount_amount: float,
    total_value: float,
    requester_user_id: str,
    requester_name: str,
    entity_name: str = ""
) -> dict:
    """Check if approval is needed and create approval request if so"""
    # Get active approval rules sorted by threshold
    rules = await db.automation_approval_rules.find(
        {"status": "active"}
    ).sort("threshold", 1).to_list(100)
    
    for rule in rules:
        trigger_type = rule.get("trigger_type")
        threshold = rule.get("threshold", 0)
        operator = rule.get("operator", "gte")
        
        # Determine the value to check based on trigger type
        check_value = 0
        if trigger_type == "discount_percent":
            check_value = discount_percent
        elif trigger_type == "discount_amount":
            check_value = discount_amount
        elif trigger_type == "quote_total":
            check_value = total_value
        
        # Check if threshold is exceeded
        needs_approval = False
        if operator == "gte" and check_value >= threshold:
            needs_approval = True
        elif operator == "gt" and check_value > threshold:
            needs_approval = True
        
        if needs_approval:
            # Create approval request
            request_id = generate_id("aprq")
            now = datetime.now(timezone.utc).isoformat()
            
            request_doc = {
                "request_id": request_id,
                "entity_type": entity_type,
                "entity_id": entity_id,
                "entity_name": entity_name,
                "rule_id": rule["rule_id"],
                "rule_name": rule.get("name"),
                "trigger_type": trigger_type,
                "threshold": threshold,
                "requested_value": check_value,
                "discount_percent": discount_percent,
                "discount_amount": discount_amount,
                "total_value": total_value,
                "status": "pending",
                "approver_user_ids": rule.get("approver_user_ids", []),
                "requested_by": requester_user_id,
                "requested_by_name": requester_name,
                "requested_at": now,
                "created_at": now
            }
            
            await db.approval_requests.insert_one(request_doc)
            
            # Create notifications for approvers
            for approver_id in rule.get("approver_user_ids", []):
                notification = {
                    "notification_id": generate_id("notif"),
                    "user_id": approver_id,
                    "type": "approval_request",
                    "title": f"Approval Required: {entity_type.title()}",
                    "message": f"{requester_name} requested approval for {trigger_type.replace('_', ' ')} of {check_value}% on {entity_name or entity_id}",
                    "entity_type": entity_type,
                    "entity_id": entity_id,
                    "request_id": request_id,
                    "is_read": False,
                    "created_at": now
                }
                await db.timeline_notifications.insert_one(notification)
            
            request_doc.pop("_id", None)
            return {
                "needs_approval": True,
                "request": request_doc
            }
    
    # No rules triggered, auto-approved
    return {"needs_approval": False, "auto_approved": True}


@router.get("/approval-requests")
async def get_approval_requests(
    status: Optional[str] = None,
    entity_type: Optional[str] = None,
    requested_by: Optional[str] = None,
    pending_for_me: bool = False,
    page: int = 1,
    page_size: int = 50,
    user: User = Depends(get_current_user)
):
    """Get approval requests"""
    query = {}
    
    if status:
        query["status"] = status
    if entity_type:
        query["entity_type"] = entity_type
    if requested_by:
        query["requested_by"] = requested_by
    if pending_for_me:
        query["status"] = "pending"
        query["approver_user_ids"] = user.user_id
    
    # Workers can only see their own requests
    if user.role == "worker":
        query["requested_by"] = user.user_id
    
    total = await db.approval_requests.count_documents(query)
    skip = (page - 1) * page_size
    
    requests = await db.approval_requests.find(query, {"_id": 0}).sort(
        "created_at", -1
    ).skip(skip).limit(page_size).to_list(page_size)
    
    return {
        "requests": requests,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": (total + page_size - 1) // page_size
        }
    }


@router.get("/approval-requests/{request_id}")
async def get_approval_request(
    request_id: str,
    user: User = Depends(get_current_user)
):
    """Get a single approval request"""
    request = await db.approval_requests.find_one({"request_id": request_id}, {"_id": 0})
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
    
    # Check access
    if user.role == "worker" and request.get("requested_by") != user.user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Get entity details
    if request.get("entity_type") == "quote":
        entity = await db.crm_quotes.find_one(
            {"quote_id": request["entity_id"]},
            {"_id": 0, "quote_number": 1, "quote_name": 1, "total": 1}
        )
        request["entity"] = entity
    
    return request


@router.post("/approval-requests/{request_id}/approve")
async def approve_request(
    request_id: str,
    notes: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Approve an approval request"""
    request = await db.approval_requests.find_one({"request_id": request_id})
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
    
    # Check if user is an approver
    if user.user_id not in request.get("approver_user_ids", []) and user.role != "admin":
        raise HTTPException(status_code=403, detail="You are not authorized to approve this request")
    
    if request.get("status") != "pending":
        raise HTTPException(status_code=400, detail=f"Request is already {request.get('status')}")
    
    now = datetime.now(timezone.utc).isoformat()
    
    await db.approval_requests.update_one(
        {"request_id": request_id},
        {"$set": {
            "status": "approved",
            "approved_by": user.user_id,
            "approved_by_name": user.name,
            "approved_at": now,
            "approval_notes": notes
        }}
    )
    
    # Notify requester
    notification = {
        "notification_id": generate_id("notif"),
        "user_id": request["requested_by"],
        "type": "approval_approved",
        "title": "Approval Granted",
        "message": f"{user.name} approved your {request['trigger_type'].replace('_', ' ')} request",
        "entity_type": request["entity_type"],
        "entity_id": request["entity_id"],
        "request_id": request_id,
        "is_read": False,
        "created_at": now
    }
    await db.timeline_notifications.insert_one(notification)
    
    # Log to timeline
    await log_system_event(
        entity_type=request["entity_type"],
        entity_id=request["entity_id"],
        activity_type="approval_approved",
        body=f"Approval granted by {user.name}" + (f": {notes}" if notes else ""),
        metadata={
            "request_id": request_id,
            "requested_value": request.get("requested_value"),
            "trigger_type": request.get("trigger_type")
        },
        user_id=user.user_id,
        user_name=user.name
    )
    
    return {"success": True, "message": "Request approved"}


@router.post("/approval-requests/{request_id}/reject")
async def reject_request(
    request_id: str,
    reason: str,
    user: User = Depends(get_current_user)
):
    """Reject an approval request"""
    request = await db.approval_requests.find_one({"request_id": request_id})
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
    
    # Check if user is an approver
    if user.user_id not in request.get("approver_user_ids", []) and user.role != "admin":
        raise HTTPException(status_code=403, detail="You are not authorized to reject this request")
    
    if request.get("status") != "pending":
        raise HTTPException(status_code=400, detail=f"Request is already {request.get('status')}")
    
    now = datetime.now(timezone.utc).isoformat()
    
    await db.approval_requests.update_one(
        {"request_id": request_id},
        {"$set": {
            "status": "rejected",
            "rejected_by": user.user_id,
            "rejected_by_name": user.name,
            "rejected_at": now,
            "rejection_reason": reason
        }}
    )
    
    # Notify requester
    notification = {
        "notification_id": generate_id("notif"),
        "user_id": request["requested_by"],
        "type": "approval_rejected",
        "title": "Approval Denied",
        "message": f"{user.name} rejected your {request['trigger_type'].replace('_', ' ')} request: {reason}",
        "entity_type": request["entity_type"],
        "entity_id": request["entity_id"],
        "request_id": request_id,
        "is_read": False,
        "created_at": now
    }
    await db.timeline_notifications.insert_one(notification)
    
    # Log to timeline
    await log_system_event(
        entity_type=request["entity_type"],
        entity_id=request["entity_id"],
        activity_type="approval_rejected",
        body=f"Approval denied by {user.name}: {reason}",
        metadata={
            "request_id": request_id,
            "requested_value": request.get("requested_value"),
            "trigger_type": request.get("trigger_type"),
            "reason": reason
        },
        user_id=user.user_id,
        user_name=user.name
    )
    
    return {"success": True, "message": "Request rejected"}


@router.get("/my-pending-approvals")
async def get_my_pending_approvals(user: User = Depends(get_current_user)):
    """Get pending approvals for the current user"""
    requests = await db.approval_requests.find(
        {
            "status": "pending",
            "approver_user_ids": user.user_id
        },
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    return {"pending_count": len(requests), "requests": requests}
