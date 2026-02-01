from pydantic import BaseModel, Field, ConfigDict
from typing import Optional
from datetime import datetime, timezone
import uuid

class Store(BaseModel):
    model_config = ConfigDict(extra="ignore")
    store_id: str = Field(default_factory=lambda: f"store_{uuid.uuid4().hex[:12]}")
    name: str
    platform: str  # shopify, etsy
    api_key: Optional[str] = None  # Shopify API key or Etsy client_id
    api_secret: Optional[str] = None
    shop_url: Optional[str] = None  # Shopify store URL
    shop_id: Optional[str] = None  # Etsy shop ID
    access_token: Optional[str] = None
    refresh_token: Optional[str] = None  # For Etsy OAuth refresh
    token_expires_at: Optional[str] = None
    is_active: bool = True
    last_product_sync: Optional[str] = None
    last_order_sync: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class StoreCreate(BaseModel):
    name: str
    platform: str
    api_key: Optional[str] = None
    api_secret: Optional[str] = None
    shop_url: Optional[str] = None
    shop_id: Optional[str] = None
    access_token: Optional[str] = None
    refresh_token: Optional[str] = None
