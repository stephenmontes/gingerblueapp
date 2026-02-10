"""
Timeline & Activity Feed Models
Salesforce-style unified activity timeline for CRM records
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


class EntityType(str, Enum):
    """Types of records that can have a timeline"""
    ACCOUNT = "account"
    CONTACT = "contact"
    LEAD = "lead"
    OPPORTUNITY = "opportunity"
    QUOTE = "quote"
    ORDER = "order"
    CASE = "case"
    CUSTOMER = "customer"  # customer_crm
    TASK = "task"


class ActivityType(str, Enum):
    """Types of timeline activities"""
    # User-created
    CHAT_POST = "chat_post"
    COMMENT = "comment"
    NOTE = "note"
    CALL_LOG = "call_log"
    EMAIL_LOG = "email_log"
    SMS_LOG = "sms_log"
    MEETING_LOG = "meeting_log"
    FILE_UPLOAD = "file_upload"
    
    # Task/Event related
    TASK_CREATED = "task_created"
    TASK_COMPLETED = "task_completed"
    TASK_UPDATED = "task_updated"
    EVENT_CREATED = "event_created"
    EVENT_COMPLETED = "event_completed"
    
    # CRM workflow events
    STAGE_CHANGED = "stage_changed"
    OWNER_CHANGED = "owner_changed"
    STATUS_CHANGED = "status_changed"
    LEAD_CONVERTED = "lead_converted"
    
    # Quote/Order events
    QUOTE_CREATED = "quote_created"
    QUOTE_SENT = "quote_sent"
    QUOTE_ACCEPTED = "quote_accepted"
    QUOTE_REJECTED = "quote_rejected"
    ORDER_CREATED = "order_created"
    ORDER_FULFILLED = "order_fulfilled"
    ORDER_SHIPPED = "order_shipped"
    ORDER_DELIVERED = "order_delivered"
    
    # Invoice/Payment events
    INVOICE_CREATED = "invoice_created"
    INVOICE_SENT = "invoice_sent"
    PAYMENT_RECEIVED = "payment_received"
    
    # External sync events
    SHOPIFY_SYNC = "shopify_sync"
    SHIPSTATION_SYNC = "shipstation_sync"
    
    # Generic
    SYSTEM_EVENT = "system_event"
    FIELD_UPDATE = "field_update"
    RECORD_CREATED = "record_created"
    RECORD_UPDATED = "record_updated"


class Visibility(str, Enum):
    """Timeline item visibility levels"""
    PUBLIC = "public"  # All users with record access
    INTERNAL = "internal"  # Internal team only
    PRIVATE = "private"  # Owner + managers only


class Attachment(BaseModel):
    """File attachment model"""
    attachment_id: str
    filename: str
    file_url: str
    file_type: str
    file_size: int  # bytes
    uploaded_by: str
    uploaded_at: str


class TimelineItemCreate(BaseModel):
    """Create a new timeline item"""
    entity_type: EntityType
    entity_id: str
    activity_type: ActivityType
    body: Optional[str] = None  # Rich text or markdown
    visibility: Visibility = Visibility.PUBLIC
    parent_id: Optional[str] = None  # For threaded replies
    metadata: Dict[str, Any] = {}  # Structured data
    attachments: List[Attachment] = []
    # For specific activity types
    call_duration_minutes: Optional[int] = None
    call_outcome: Optional[str] = None
    task_id: Optional[str] = None
    event_id: Optional[str] = None


class TimelineItemUpdate(BaseModel):
    """Update a timeline item"""
    body: Optional[str] = None
    visibility: Optional[Visibility] = None
    is_pinned: Optional[bool] = None
    metadata: Optional[Dict[str, Any]] = None


class TimelineMention(BaseModel):
    """Mention in a timeline item"""
    mention_id: str
    timeline_item_id: str
    mentioned_user_id: str
    mentioned_user_name: str
    mention_text: str  # The @username text
    created_at: str


class RecordFollow(BaseModel):
    """User following a record"""
    follow_id: str
    user_id: str
    user_name: str
    entity_type: EntityType
    entity_id: str
    notify_on: List[str] = ["chat_post", "comment", "stage_changed", "mention"]
    created_at: str


class TimelineNotification(BaseModel):
    """Notification for timeline activity"""
    notification_id: str
    user_id: str
    notification_type: str  # mention, reply, follow_update, system
    title: str
    body: str
    entity_type: str
    entity_id: str
    timeline_item_id: Optional[str] = None
    is_read: bool = False
    created_at: str


# Activity type configurations
ACTIVITY_TYPE_CONFIG = {
    ActivityType.CHAT_POST: {
        "label": "Post",
        "icon": "message-circle",
        "color": "#3b82f6",
        "user_created": True,
        "allows_replies": True
    },
    ActivityType.COMMENT: {
        "label": "Comment",
        "icon": "message-square",
        "color": "#6b7280",
        "user_created": True,
        "allows_replies": True
    },
    ActivityType.NOTE: {
        "label": "Note",
        "icon": "file-text",
        "color": "#f59e0b",
        "user_created": True,
        "allows_replies": True
    },
    ActivityType.CALL_LOG: {
        "label": "Call",
        "icon": "phone",
        "color": "#10b981",
        "user_created": True,
        "allows_replies": True
    },
    ActivityType.EMAIL_LOG: {
        "label": "Email",
        "icon": "mail",
        "color": "#8b5cf6",
        "user_created": True,
        "allows_replies": True
    },
    ActivityType.MEETING_LOG: {
        "label": "Meeting",
        "icon": "calendar",
        "color": "#ec4899",
        "user_created": True,
        "allows_replies": True
    },
    ActivityType.STAGE_CHANGED: {
        "label": "Stage Changed",
        "icon": "git-branch",
        "color": "#6366f1",
        "user_created": False,
        "allows_replies": False
    },
    ActivityType.OWNER_CHANGED: {
        "label": "Owner Changed",
        "icon": "user",
        "color": "#14b8a6",
        "user_created": False,
        "allows_replies": False
    },
    ActivityType.TASK_CREATED: {
        "label": "Task Created",
        "icon": "check-square",
        "color": "#f97316",
        "user_created": False,
        "allows_replies": False
    },
    ActivityType.TASK_COMPLETED: {
        "label": "Task Completed",
        "icon": "check-circle",
        "color": "#22c55e",
        "user_created": False,
        "allows_replies": False
    },
    ActivityType.QUOTE_CREATED: {
        "label": "Quote Created",
        "icon": "file-plus",
        "color": "#0ea5e9",
        "user_created": False,
        "allows_replies": False
    },
    ActivityType.ORDER_CREATED: {
        "label": "Order Created",
        "icon": "shopping-cart",
        "color": "#22c55e",
        "user_created": False,
        "allows_replies": False
    },
    ActivityType.SHOPIFY_SYNC: {
        "label": "Shopify Update",
        "icon": "refresh-cw",
        "color": "#84cc16",
        "user_created": False,
        "allows_replies": False
    },
    ActivityType.SYSTEM_EVENT: {
        "label": "System",
        "icon": "info",
        "color": "#6b7280",
        "user_created": False,
        "allows_replies": False
    }
}
