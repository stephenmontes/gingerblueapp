"""
CRM Configuration Models
Defines configurable elements: stages, picklists, custom fields, layouts
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from enum import Enum
from datetime import datetime


# ==================== FIELD TYPES ====================

class FieldType(str, Enum):
    TEXT = "text"
    TEXTAREA = "textarea"
    NUMBER = "number"
    CURRENCY = "currency"
    PERCENT = "percent"
    DATE = "date"
    DATETIME = "datetime"
    CHECKBOX = "checkbox"
    PICKLIST = "picklist"
    MULTI_PICKLIST = "multi_picklist"
    EMAIL = "email"
    PHONE = "phone"
    URL = "url"
    LOOKUP = "lookup"  # Reference to another object


class ObjectType(str, Enum):
    ACCOUNT = "account"
    CONTACT = "contact"
    LEAD = "lead"
    OPPORTUNITY = "opportunity"
    TASK = "task"
    EVENT = "event"
    QUOTE = "quote"
    CUSTOMER_CRM = "customer_crm"


# ==================== CUSTOM FIELD DEFINITION ====================

class PicklistOption(BaseModel):
    value: str
    label: str
    color: Optional[str] = None
    is_default: bool = False
    is_active: bool = True
    order: int = 0


class CustomFieldCreate(BaseModel):
    """Define a new custom field"""
    object_type: ObjectType
    field_name: str  # API name (snake_case, no spaces)
    label: str  # Display label
    field_type: FieldType
    description: Optional[str] = None
    help_text: Optional[str] = None
    required: bool = False
    unique: bool = False
    default_value: Optional[Any] = None
    # For picklist fields
    picklist_options: Optional[List[PicklistOption]] = None
    # For lookup fields
    lookup_object: Optional[ObjectType] = None
    # For number/currency fields
    decimal_places: Optional[int] = 2
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    # Display options
    visible_on_create: bool = True
    visible_on_edit: bool = True
    visible_on_detail: bool = True
    visible_on_list: bool = False
    # Permissions
    editable_roles: List[str] = ["admin", "manager", "worker"]
    visible_roles: List[str] = ["admin", "manager", "worker"]
    # Ordering
    section: str = "custom_fields"
    order: int = 0


class CustomFieldUpdate(BaseModel):
    """Update an existing custom field"""
    label: Optional[str] = None
    description: Optional[str] = None
    help_text: Optional[str] = None
    required: Optional[bool] = None
    default_value: Optional[Any] = None
    picklist_options: Optional[List[PicklistOption]] = None
    decimal_places: Optional[int] = None
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    visible_on_create: Optional[bool] = None
    visible_on_edit: Optional[bool] = None
    visible_on_detail: Optional[bool] = None
    visible_on_list: Optional[bool] = None
    editable_roles: Optional[List[str]] = None
    visible_roles: Optional[List[str]] = None
    section: Optional[str] = None
    order: Optional[int] = None
    is_active: Optional[bool] = None


# ==================== PIPELINE STAGE CONFIGURATION ====================

class StageCreate(BaseModel):
    """Define a pipeline stage"""
    stage_id: str  # Unique identifier (snake_case)
    name: str  # Display name
    probability: int = Field(ge=0, le=100)
    forecast_category: str = "pipeline"  # pipeline, best_case, commit, closed, omitted
    order: int
    is_closed: bool = False
    is_won: bool = False
    color: str = "#6b7280"
    description: Optional[str] = None
    # Actions when entering this stage
    required_fields: List[str] = []  # Fields that must be filled
    auto_tasks: List[Dict[str, Any]] = []  # Tasks to auto-create


class StageUpdate(BaseModel):
    """Update a pipeline stage"""
    name: Optional[str] = None
    probability: Optional[int] = None
    forecast_category: Optional[str] = None
    order: Optional[int] = None
    is_closed: Optional[bool] = None
    is_won: Optional[bool] = None
    color: Optional[str] = None
    description: Optional[str] = None
    required_fields: Optional[List[str]] = None
    auto_tasks: Optional[List[Dict[str, Any]]] = None
    is_active: Optional[bool] = None


# ==================== PICKLIST CONFIGURATION ====================

class PicklistConfig(BaseModel):
    """Configuration for a system picklist"""
    picklist_id: str  # e.g., "lead_source", "industry", "territory"
    name: str  # Display name
    object_types: List[ObjectType]  # Which objects use this picklist
    options: List[PicklistOption]
    allow_multiple: bool = False
    allow_other: bool = False  # Allow "Other" option with free text


class PicklistConfigUpdate(BaseModel):
    """Update a picklist configuration"""
    name: Optional[str] = None
    options: Optional[List[PicklistOption]] = None
    allow_multiple: Optional[bool] = None
    allow_other: Optional[bool] = None


# ==================== PAGE LAYOUT CONFIGURATION ====================

class LayoutSection(BaseModel):
    """A section in a page layout"""
    section_id: str
    name: str
    columns: int = 2
    order: int
    is_collapsed: bool = False
    fields: List[str] = []  # Field names in order


class PageLayoutConfig(BaseModel):
    """Page layout configuration for an object"""
    object_type: ObjectType
    layout_name: str = "default"
    sections: List[LayoutSection]
    # Related lists to show
    related_lists: List[str] = []
    # Actions available
    available_actions: List[str] = []


class PageLayoutUpdate(BaseModel):
    """Update a page layout"""
    layout_name: Optional[str] = None
    sections: Optional[List[LayoutSection]] = None
    related_lists: Optional[List[str]] = None
    available_actions: Optional[List[str]] = None


# ==================== AUTOMATION RULE CONFIGURATION ====================

class RuleCondition(BaseModel):
    """A condition in an automation rule"""
    field: str
    operator: str  # equals, not_equals, contains, greater_than, less_than, is_empty, is_not_empty
    value: Any


class RuleAction(BaseModel):
    """An action to perform when rule triggers"""
    action_type: str  # update_field, create_task, send_notification, assign_owner
    config: Dict[str, Any]


class AutomationRule(BaseModel):
    """An automation rule"""
    rule_id: Optional[str] = None
    name: str
    object_type: ObjectType
    trigger_event: str  # on_create, on_update, on_field_change, on_stage_change
    trigger_fields: List[str] = []  # Fields that trigger the rule (for on_field_change)
    conditions: List[RuleCondition] = []
    actions: List[RuleAction]
    is_active: bool = True
    order: int = 0


# ==================== ASSIGNMENT RULE CONFIGURATION ====================

class AssignmentRule(BaseModel):
    """Rule for auto-assigning records"""
    rule_id: Optional[str] = None
    name: str
    object_type: ObjectType
    conditions: List[RuleCondition] = []
    assignment_type: str  # specific_user, round_robin, least_records
    assigned_users: List[str] = []  # User IDs for round robin
    specific_user_id: Optional[str] = None
    is_active: bool = True
    order: int = 0
