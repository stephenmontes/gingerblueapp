from pydantic import BaseModel, Field, ConfigDict
from typing import Optional
from datetime import datetime, timezone
import uuid

class TimeLog(BaseModel):
    """Time tracking per user, per stage - users typically work on one stage"""
    model_config = ConfigDict(extra="ignore")
    log_id: str = Field(default_factory=lambda: f"log_{uuid.uuid4().hex[:12]}")
    user_id: str
    user_name: str
    stage_id: str
    stage_name: str
    batch_id: Optional[str] = None  # Optional - can be general stage work
    action: str  # started, stopped, paused, resumed
    started_at: datetime
    completed_at: Optional[datetime] = None
    paused_at: Optional[datetime] = None  # When timer was paused
    accumulated_minutes: float = 0  # Time accumulated before pause
    duration_minutes: Optional[float] = None
    items_processed: int = 0
    is_paused: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class TimeLogCreate(BaseModel):
    stage_id: str
    stage_name: str
    action: str
    items_processed: int = 1
