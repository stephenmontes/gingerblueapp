"""
CRM Data Models - Salesforce-style Objects
Accounts, Contacts, Leads, Opportunities, Activities, Notes
"""
from pydantic import BaseModel, Field, EmailStr
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


# Enums
class AccountType(str, Enum):
    CUSTOMER = "customer"
    PROSPECT = "prospect"
    VENDOR = "vendor"
    PARTNER = "partner"


class AccountStatus(str, Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    CHURNED = "churned"


class LeadStatus(str, Enum):
    NEW = "new"
    CONTACTED = "contacted"
    QUALIFIED = "qualified"
    UNQUALIFIED = "unqualified"
    CONVERTED = "converted"


class LeadSource(str, Enum):
    WEBSITE = "website"
    TRADE_SHOW = "trade_show"
    REFERRAL = "referral"
    COLD_CALL = "cold_call"
    SOCIAL_MEDIA = "social_media"
    OTHER = "other"


class OpportunityStage(str, Enum):
    PROSPECTING = "prospecting"
    QUALIFICATION = "qualification"
    NEEDS_ANALYSIS = "needs_analysis"
    PROPOSAL = "proposal"
    NEGOTIATION = "negotiation"
    CLOSED_WON = "closed_won"
    CLOSED_LOST = "closed_lost"


class ForecastCategory(str, Enum):
    PIPELINE = "pipeline"
    BEST_CASE = "best_case"
    COMMIT = "commit"
    CLOSED = "closed"
    OMITTED = "omitted"


class TaskPriority(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"


class TaskStatus(str, Enum):
    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    DEFERRED = "deferred"


class ActivityType(str, Enum):
    TASK = "task"
    EVENT = "event"
    CALL = "call"
    EMAIL = "email"
    MEETING = "meeting"
    NOTE = "note"


class NoteType(str, Enum):
    GENERAL = "general"
    CALL = "call"
    EMAIL = "email"
    MEETING = "meeting"
    INTERNAL = "internal"


# Account (Company) Models
class Address(BaseModel):
    street: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None


class AccountCreate(BaseModel):
    name: str
    account_type: AccountType = AccountType.PROSPECT
    industry: Optional[str] = None
    website: Optional[str] = None
    phone: Optional[str] = None
    status: AccountStatus = AccountStatus.ACTIVE
    billing_address: Optional[Address] = None
    shipping_address: Optional[Address] = None
    owner_id: Optional[str] = None
    territory: Optional[str] = None
    tags: List[str] = []
    description: Optional[str] = None
    # Link to existing customer if extending
    linked_customer_id: Optional[str] = None


class AccountUpdate(BaseModel):
    name: Optional[str] = None
    account_type: Optional[AccountType] = None
    industry: Optional[str] = None
    website: Optional[str] = None
    phone: Optional[str] = None
    status: Optional[AccountStatus] = None
    billing_address: Optional[Address] = None
    shipping_address: Optional[Address] = None
    owner_id: Optional[str] = None
    territory: Optional[str] = None
    tags: Optional[List[str]] = None
    description: Optional[str] = None


# Contact Models
class ContactCreate(BaseModel):
    first_name: str
    last_name: str
    account_id: Optional[str] = None
    title: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    mobile: Optional[str] = None
    department: Optional[str] = None
    preferred_contact_method: Optional[str] = "email"
    email_opt_in: bool = True
    sms_opt_in: bool = False
    mailing_address: Optional[Address] = None
    owner_id: Optional[str] = None
    tags: List[str] = []
    description: Optional[str] = None


class ContactUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    account_id: Optional[str] = None
    title: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    mobile: Optional[str] = None
    department: Optional[str] = None
    preferred_contact_method: Optional[str] = None
    email_opt_in: Optional[bool] = None
    sms_opt_in: Optional[bool] = None
    mailing_address: Optional[Address] = None
    owner_id: Optional[str] = None
    tags: Optional[List[str]] = None
    description: Optional[str] = None


# Lead Models
class LeadCreate(BaseModel):
    first_name: str
    last_name: str
    company: Optional[str] = None
    title: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    website: Optional[str] = None
    source: LeadSource = LeadSource.WEBSITE
    status: LeadStatus = LeadStatus.NEW
    score: int = 0
    industry: Optional[str] = None
    address: Optional[Address] = None
    owner_id: Optional[str] = None
    description: Optional[str] = None
    # Inbound details
    utm_source: Optional[str] = None
    utm_medium: Optional[str] = None
    utm_campaign: Optional[str] = None
    landing_page: Optional[str] = None
    referrer: Optional[str] = None


class LeadUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    company: Optional[str] = None
    title: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    website: Optional[str] = None
    source: Optional[LeadSource] = None
    status: Optional[LeadStatus] = None
    score: Optional[int] = None
    industry: Optional[str] = None
    address: Optional[Address] = None
    owner_id: Optional[str] = None
    description: Optional[str] = None


class LeadConvert(BaseModel):
    create_opportunity: bool = True
    opportunity_name: Optional[str] = None
    opportunity_amount: Optional[float] = None
    opportunity_close_date: Optional[str] = None
    account_id: Optional[str] = None  # Existing account or create new


# Opportunity Models
class OpportunityLineItem(BaseModel):
    product_id: Optional[str] = None
    product_name: str
    sku: Optional[str] = None
    quantity: int = 1
    unit_price: float
    discount: float = 0
    total: float


class OpportunityCreate(BaseModel):
    name: str
    account_id: str
    contact_id: Optional[str] = None
    amount: float = 0
    probability: int = 10
    stage: OpportunityStage = OpportunityStage.PROSPECTING
    forecast_category: ForecastCategory = ForecastCategory.PIPELINE
    close_date: str  # ISO date string
    description: Optional[str] = None
    next_step: Optional[str] = None
    lead_source: Optional[LeadSource] = None
    competitors: List[str] = []
    line_items: List[OpportunityLineItem] = []
    owner_id: Optional[str] = None
    tags: List[str] = []


class OpportunityUpdate(BaseModel):
    name: Optional[str] = None
    account_id: Optional[str] = None
    contact_id: Optional[str] = None
    amount: Optional[float] = None
    probability: Optional[int] = None
    stage: Optional[OpportunityStage] = None
    forecast_category: Optional[ForecastCategory] = None
    close_date: Optional[str] = None
    description: Optional[str] = None
    next_step: Optional[str] = None
    lead_source: Optional[LeadSource] = None
    competitors: Optional[List[str]] = None
    line_items: Optional[List[OpportunityLineItem]] = None
    owner_id: Optional[str] = None
    tags: Optional[List[str]] = None
    closed_reason: Optional[str] = None


# Activity Models (Tasks + Events)
class TaskCreate(BaseModel):
    subject: str
    description: Optional[str] = None
    priority: TaskPriority = TaskPriority.MEDIUM
    status: TaskStatus = TaskStatus.NOT_STARTED
    due_date: Optional[str] = None
    reminder_date: Optional[str] = None
    # Related records
    account_id: Optional[str] = None
    contact_id: Optional[str] = None
    opportunity_id: Optional[str] = None
    lead_id: Optional[str] = None
    assigned_to: Optional[str] = None


class TaskUpdate(BaseModel):
    subject: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[TaskPriority] = None
    status: Optional[TaskStatus] = None
    due_date: Optional[str] = None
    reminder_date: Optional[str] = None
    account_id: Optional[str] = None
    contact_id: Optional[str] = None
    opportunity_id: Optional[str] = None
    lead_id: Optional[str] = None
    assigned_to: Optional[str] = None


class EventCreate(BaseModel):
    subject: str
    description: Optional[str] = None
    event_type: str = "meeting"  # meeting, call, demo, etc.
    start_time: str  # ISO datetime
    end_time: str  # ISO datetime
    location: Optional[str] = None
    attendees: List[str] = []  # List of contact_ids or emails
    # Related records
    account_id: Optional[str] = None
    contact_id: Optional[str] = None
    opportunity_id: Optional[str] = None
    lead_id: Optional[str] = None
    owner_id: Optional[str] = None


class EventUpdate(BaseModel):
    subject: Optional[str] = None
    description: Optional[str] = None
    event_type: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    location: Optional[str] = None
    attendees: Optional[List[str]] = None
    account_id: Optional[str] = None
    contact_id: Optional[str] = None
    opportunity_id: Optional[str] = None
    lead_id: Optional[str] = None


# Note Models
class NoteCreate(BaseModel):
    content: str
    note_type: NoteType = NoteType.GENERAL
    is_pinned: bool = False
    is_internal: bool = True
    # Related records (at least one required)
    account_id: Optional[str] = None
    contact_id: Optional[str] = None
    opportunity_id: Optional[str] = None
    lead_id: Optional[str] = None


class NoteUpdate(BaseModel):
    content: Optional[str] = None
    note_type: Optional[NoteType] = None
    is_pinned: Optional[bool] = None
    is_internal: Optional[bool] = None


# Communication Log Models
class CommunicationLogCreate(BaseModel):
    comm_type: str  # email, call, sms
    direction: str  # inbound, outbound
    subject: Optional[str] = None
    body: Optional[str] = None
    from_address: Optional[str] = None
    to_address: Optional[str] = None
    duration_seconds: Optional[int] = None  # For calls
    outcome: Optional[str] = None
    # Related records
    account_id: Optional[str] = None
    contact_id: Optional[str] = None
    opportunity_id: Optional[str] = None
    lead_id: Optional[str] = None


# Quote Models (Simple)
class QuoteLineItem(BaseModel):
    product_id: Optional[str] = None
    product_name: str
    sku: Optional[str] = None
    description: Optional[str] = None
    quantity: int = 1
    unit_price: float
    discount_percent: float = 0
    total: float


class QuoteCreate(BaseModel):
    opportunity_id: str
    quote_name: str
    account_id: str
    contact_id: Optional[str] = None
    valid_until: Optional[str] = None
    billing_address: Optional[Address] = None
    shipping_address: Optional[Address] = None
    line_items: List[QuoteLineItem] = []
    subtotal: float = 0
    discount_percent: float = 0
    discount_amount: float = 0
    tax_percent: float = 0
    tax_amount: float = 0
    shipping_amount: float = 0
    total: float = 0
    notes: Optional[str] = None
    terms: Optional[str] = None


class QuoteUpdate(BaseModel):
    quote_name: Optional[str] = None
    contact_id: Optional[str] = None
    valid_until: Optional[str] = None
    billing_address: Optional[Address] = None
    shipping_address: Optional[Address] = None
    line_items: Optional[List[QuoteLineItem]] = None
    subtotal: Optional[float] = None
    discount_percent: Optional[float] = None
    discount_amount: Optional[float] = None
    tax_percent: Optional[float] = None
    tax_amount: Optional[float] = None
    shipping_amount: Optional[float] = None
    total: Optional[float] = None
    notes: Optional[str] = None
    terms: Optional[str] = None
    status: Optional[str] = None  # draft, sent, accepted, rejected


# CRM Settings Models
class OpportunityStageConfig(BaseModel):
    stage_id: str
    name: str
    probability: int
    forecast_category: ForecastCategory
    order: int
    is_closed: bool = False
    is_won: bool = False
    color: Optional[str] = None


class CRMSettingsUpdate(BaseModel):
    opportunity_stages: Optional[List[OpportunityStageConfig]] = None
    lead_sources: Optional[List[str]] = None
    industries: Optional[List[str]] = None
    territories: Optional[List[str]] = None
