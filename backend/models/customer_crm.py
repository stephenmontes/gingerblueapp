"""
Customer CRM Extension Models
Separate CRM fields from Shopify-synced customer data
"""
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from enum import Enum


class AccountStatus(str, Enum):
    PROSPECT = "prospect"
    CUSTOMER = "customer"
    DORMANT = "dormant"
    CHURNED = "churned"
    VIP = "vip"


class CustomerCRMCreate(BaseModel):
    """Create CRM extension for a customer"""
    customer_id: str  # Links to customers collection
    owner_user_id: Optional[str] = None
    account_status: AccountStatus = AccountStatus.PROSPECT
    tags: List[str] = []
    industry: Optional[str] = None
    account_type: Optional[str] = None  # B2B, B2C, Wholesale, etc.
    territory: Optional[str] = None
    region: Optional[str] = None
    lead_source: Optional[str] = None  # For converted leads
    converted_from_lead_id: Optional[str] = None
    credit_limit: Optional[float] = None
    payment_terms: Optional[str] = None  # Net 30, COD, etc.
    notes: Optional[str] = None
    # Custom fields stored as key-value
    custom_fields: dict = {}


class CustomerCRMUpdate(BaseModel):
    """Update CRM extension fields only"""
    owner_user_id: Optional[str] = None
    account_status: Optional[AccountStatus] = None
    tags: Optional[List[str]] = None
    industry: Optional[str] = None
    account_type: Optional[str] = None
    territory: Optional[str] = None
    region: Optional[str] = None
    lead_source: Optional[str] = None
    credit_limit: Optional[float] = None
    payment_terms: Optional[str] = None
    notes: Optional[str] = None
    custom_fields: Optional[dict] = None


# Field ownership rules - which system owns which fields
SHOPIFY_OWNED_FIELDS = {
    "email",
    "first_name",
    "last_name",
    "phone",
    "default_address",
    "addresses",
    "shopify_id",
    "shopify_created_at",
    "shopify_updated_at",
    "orders_count",
    "total_spent",
    "accepts_marketing",
    "note",  # Shopify customer note
    "tags",  # Shopify tags (separate from CRM tags)
}

CRM_OWNED_FIELDS = {
    "owner_user_id",
    "account_status",
    "crm_tags",  # CRM-specific tags
    "industry",
    "account_type",
    "territory",
    "region",
    "lead_source",
    "converted_from_lead_id",
    "credit_limit",
    "payment_terms",
    "crm_notes",  # CRM-specific notes
    "custom_fields",
    "last_activity_at",
    "next_task_due_at",
}

ERP_CALCULATED_FIELDS = {
    "total_orders",
    "total_revenue",
    "open_orders_count",
    "open_orders_value",
    "last_order_date",
    "ar_balance",  # Accounts receivable
    "open_opportunities",
    "pipeline_value",
}
