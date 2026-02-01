from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from datetime import datetime, timezone
import uuid

from database import db
from models.user import User
from models.production import ProductionStage
from dependencies import get_current_user

router = APIRouter(prefix="/stages", tags=["stages"])

@router.get("")
async def get_stages(user: User = Depends(get_current_user)):
    """Get all production stages"""
    stages = await db.production_stages.find({}, {"_id": 0}).sort("order", 1).to_list(100)
    
    if not stages:
        default_stages = [
            {"stage_id": "stage_new", "name": "New Orders", "order": 0, "color": "#6366F1"},
            {"stage_id": "stage_cutting", "name": "Cutting", "order": 1, "color": "#F59E0B"},
            {"stage_id": "stage_assembly", "name": "Assembly", "order": 2, "color": "#3B82F6"},
            {"stage_id": "stage_qc", "name": "Sand", "order": 3, "color": "#8B5CF6"},
            {"stage_id": "stage_packing", "name": "Paint", "order": 4, "color": "#22C55E"},
            {"stage_id": "stage_ready", "name": "Quality Check", "order": 5, "color": "#10B981"},
        ]
        for stage in default_stages:
            stage["created_at"] = datetime.now(timezone.utc).isoformat()
        await db.production_stages.insert_many(default_stages)
        stages = default_stages
    
    return stages

@router.post("")
async def create_stage(name: str, color: str = "#3B82F6", user: User = Depends(get_current_user)):
    """Create a new production stage"""
    if user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    max_stage = await db.production_stages.find_one(sort=[("order", -1)])
    new_order = (max_stage.get("order", 0) + 1) if max_stage else 0
    
    stage = ProductionStage(name=name, order=new_order, color=color)
    doc = stage.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    
    await db.production_stages.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

@router.get("/active-workers")
async def get_stages_active_workers(user: User = Depends(get_current_user)):
    """Get all active timers across all stages"""
    active_timers = await db.time_logs.find({
        "completed_at": None
    }, {"_id": 0}).to_list(1000)
    
    stage_workers = {}
    for timer in active_timers:
        stage_id = timer["stage_id"]
        if stage_id not in stage_workers:
            stage_workers[stage_id] = []
        stage_workers[stage_id].append({
            "user_id": timer["user_id"],
            "user_name": timer["user_name"],
            "started_at": timer["started_at"],
            "is_paused": timer.get("is_paused", False)
        })
    
    return stage_workers
