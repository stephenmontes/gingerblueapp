"""
Automation Models - Lead Assignment & Stale Opportunity Rules
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from enum import Enum


class AssignmentMethod(str, Enum):
    """Methods for assigning leads"""
    ROUND_ROBIN = "round_robin"
    BY_TERRITORY = "by_territory"
    BY_SOURCE = "by_source"
    SPECIFIC_USER = "specific_user"


class RuleStatus(str, Enum):
    """Rule activation status"""
    ACTIVE = "active"
    INACTIVE = "inactive"


class LeadAssignmentRuleCreate(BaseModel):
    """Create a lead assignment rule"""
    name: str
    description: Optional[str] = None
    method: AssignmentMethod
    # Conditions - when to apply this rule
    conditions: Dict[str, Any] = {}  # e.g., {"territory": "Northeast"} or {"source": "Trade Show"}
    # Assignees for this rule
    assignee_user_ids: List[str] = []
    # Priority (lower = higher priority)
    priority: int = 100
    status: RuleStatus = RuleStatus.ACTIVE


class LeadAssignmentRuleUpdate(BaseModel):
    """Update a lead assignment rule"""
    name: Optional[str] = None
    description: Optional[str] = None
    method: Optional[AssignmentMethod] = None
    conditions: Optional[Dict[str, Any]] = None
    assignee_user_ids: Optional[List[str]] = None
    priority: Optional[int] = None
    status: Optional[RuleStatus] = None


class StaleOpportunityRuleCreate(BaseModel):
    """Create a stale opportunity reminder rule"""
    name: str
    description: Optional[str] = None
    # Days without activity to be considered stale
    days_threshold: int = 14
    # Which stages to check (empty = all open stages)
    applicable_stages: List[str] = []
    # Notify owner
    notify_owner: bool = True
    # Also notify these users
    additional_notify_user_ids: List[str] = []
    status: RuleStatus = RuleStatus.ACTIVE


class StaleOpportunityRuleUpdate(BaseModel):
    """Update a stale opportunity rule"""
    name: Optional[str] = None
    description: Optional[str] = None
    days_threshold: Optional[int] = None
    applicable_stages: Optional[List[str]] = None
    notify_owner: Optional[bool] = None
    additional_notify_user_ids: Optional[List[str]] = None
    status: Optional[RuleStatus] = None


# High-signal fields to track changes
HIGH_SIGNAL_FIELDS = {
    "opportunity": ["stage", "amount", "close_date", "owner_id", "probability", "forecast_category"],
    "lead": ["status", "owner_id", "source"],
    "account": ["status", "owner_id", "account_type"],
    "customer": ["account_status", "owner_user_id"],
}


class SystemEventType(str, Enum):
    """Types of system-generated events"""
    # Record lifecycle
    RECORD_CREATED = "record_created"
    RECORD_DELETED = "record_deleted"
    RECORD_RESTORED = "record_restored"
    
    # Lead lifecycle
    LEAD_CONVERTED = "lead_converted"
    LEAD_ASSIGNED = "lead_assigned"
    
    # Opportunity lifecycle
    OPPORTUNITY_WON = "opportunity_won"
    OPPORTUNITY_LOST = "opportunity_lost"
    STAGE_CHANGED = "stage_changed"
    
    # Field changes (high-signal)
    AMOUNT_CHANGED = "amount_changed"
    CLOSE_DATE_CHANGED = "close_date_changed"
    OWNER_CHANGED = "owner_changed"
    STATUS_CHANGED = "status_changed"
    
    # ERP/Shopify events
    ORDER_CREATED = "order_created"
    ORDER_FULFILLED = "order_fulfilled"
    ORDER_SHIPPED = "order_shipped"
    SHOPIFY_SYNC = "shopify_sync"
    CUSTOMER_SYNCED = "customer_synced"
    
    # Automation events
    AUTO_ASSIGNED = "auto_assigned"
    STALE_REMINDER = "stale_reminder"
    AUTOMATION_TRIGGERED = "automation_triggered"
    
    # Approval events
    APPROVAL_REQUESTED = "approval_requested"
    APPROVAL_APPROVED = "approval_approved"
    APPROVAL_REJECTED = "approval_rejected"


class ApprovalStatus(str, Enum):
    """Status of an approval request"""
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    EXPIRED = "expired"


class ApprovalTriggerType(str, Enum):
    """What triggers an approval workflow"""
    DISCOUNT_PERCENT = "discount_percent"
    DISCOUNT_AMOUNT = "discount_amount"
    QUOTE_TOTAL = "quote_total"


class ApprovalRuleCreate(BaseModel):
    """Create a discount approval rule"""
    name: str
    description: Optional[str] = None
    trigger_type: ApprovalTriggerType
    threshold: float  # The value that triggers approval
    operator: str = "gte"  # gte = greater than or equal, gt = greater than
    approver_user_ids: List[str]  # Users who can approve
    auto_approve_below_threshold: bool = True
    status: RuleStatus = RuleStatus.ACTIVE


class ApprovalRuleUpdate(BaseModel):
    """Update a discount approval rule"""
    name: Optional[str] = None
    description: Optional[str] = None
    trigger_type: Optional[ApprovalTriggerType] = None
    threshold: Optional[float] = None
    operator: Optional[str] = None
    approver_user_ids: Optional[List[str]] = None
    auto_approve_below_threshold: Optional[bool] = None
    status: Optional[RuleStatus] = None


class ApprovalRequestCreate(BaseModel):
    """Create an approval request"""
    entity_type: str  # quote, order, etc.
    entity_id: str
    rule_id: str
    requested_value: float  # The discount value being requested
    notes: Optional[str] = None
