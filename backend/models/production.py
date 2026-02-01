from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
from datetime import datetime, timezone
import uuid

class ProductionStage(BaseModel):
    model_config = ConfigDict(extra="ignore")
    stage_id: str = Field(default_factory=lambda: f"stage_{uuid.uuid4().hex[:8]}")
    name: str
    order: int
    color: str = "#3B82F6"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ProductionBatch(BaseModel):
    model_config = ConfigDict(extra="ignore")
    batch_id: str = Field(default_factory=lambda: f"batch_{uuid.uuid4().hex[:8]}")
    name: str
    order_ids: List[str] = []
    current_stage_id: str
    assigned_to: Optional[str] = None
    assigned_name: Optional[str] = None
    status: str = "active"  # active, completed
    time_started: Optional[datetime] = None
    time_completed: Optional[datetime] = None
    total_items: int = 0
    items_completed: int = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ProductionItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    item_id: str = Field(default_factory=lambda: f"item_{uuid.uuid4().hex[:8]}")
    batch_id: str
    order_id: str
    sku: str
    name: str
    color: str
    size: str
    qty_required: int = 1
    qty_completed: int = 0
    qty_rejected: int = 0  # Track rejected frames
    current_stage_id: str
    status: str = "pending"  # pending, in_progress, completed
    added_to_inventory: bool = False  # Track if added to inventory
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class BatchCreate(BaseModel):
    name: str
    order_ids: List[str]

class ItemMove(BaseModel):
    item_id: str
    new_stage_id: str
    qty_completed: int = 0

class StageMove(BaseModel):
    new_stage_id: str
    items_processed: int = 1

class StageTimerStart(BaseModel):
    stage_id: str

class StageTimerStop(BaseModel):
    stage_id: str
    items_processed: int = 0
