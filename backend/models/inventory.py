from pydantic import BaseModel, Field, ConfigDict
from typing import Optional
from datetime import datetime, timezone
import uuid

class InventoryItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    item_id: str = Field(default_factory=lambda: f"inv_{uuid.uuid4().hex[:8]}")
    sku: str
    name: str
    color: Optional[str] = None
    size: Optional[str] = None
    quantity: int = 0
    min_stock: int = 10
    location: Optional[str] = None
    is_rejected: bool = False
    sku_match_key: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class InventoryCreate(BaseModel):
    sku: str
    name: str
    color: Optional[str] = None
    size: Optional[str] = None
    quantity: int = 0
    min_stock: int = 10
    location: Optional[str] = None
