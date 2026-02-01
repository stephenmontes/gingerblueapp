from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
from datetime import datetime, timezone
import uuid

class Order(BaseModel):
    model_config = ConfigDict(extra="ignore")
    order_id: str = Field(default_factory=lambda: f"ord_{uuid.uuid4().hex[:12]}")
    external_id: str  # ID from Shopify/Etsy
    store_id: str
    store_name: str
    platform: str
    customer_name: str
    customer_email: Optional[str] = None
    items: List[dict] = []
    total_price: float = 0.0
    currency: str = "USD"
    status: str = "pending"  # pending, in_production, completed, shipped
    current_stage_id: Optional[str] = None
    assigned_to: Optional[str] = None  # user_id
    batch_id: Optional[str] = None  # Production batch ID
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class OrderCreate(BaseModel):
    external_id: str
    store_id: str
    store_name: str
    platform: str
    customer_name: str
    customer_email: Optional[str] = None
    items: List[dict] = []
    total_price: float = 0.0
    currency: str = "USD"
