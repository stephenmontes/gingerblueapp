from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from datetime import datetime, timezone
import uuid

from database import db
from models.user import User
from models.production import ItemMove
from dependencies import get_current_user
from services.sku_parser import get_sku_match_key

router = APIRouter(prefix="/items", tags=["items"])

class BulkMoveRequest(BaseModel):
    stage_id: str
    next_stage_id: str

@router.put("/{item_id}/update")
async def update_item_progress(item_id: str, qty_completed: int, user: User = Depends(get_current_user)):
    """Update the completed quantity for an item"""
    item = await db.production_items.find_one({"item_id": item_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    qty_completed = max(0, qty_completed)
    status = "completed" if qty_completed >= item.get("qty_required", 1) else "in_progress"
    
    await db.production_items.update_one(
        {"item_id": item_id},
        {"$set": {"qty_completed": qty_completed, "status": status}}
    )
    
    batch = await db.production_batches.find_one({"batch_id": item["batch_id"]}, {"_id": 0})
    if batch:
        all_items = await db.production_items.find({"batch_id": item["batch_id"]}, {"_id": 0}).to_list(10000)
        total_completed = sum(i.get("qty_completed", 0) for i in all_items)
        await db.production_batches.update_one(
            {"batch_id": item["batch_id"]},
            {"$set": {"items_completed": total_completed}}
        )
    
    return {"message": "Item updated", "qty_completed": qty_completed, "status": status}

@router.put("/{item_id}/move-stage")
async def move_item_stage(item_id: str, move_data: ItemMove, user: User = Depends(get_current_user)):
    """Move an individual item to the next stage"""
    item = await db.production_items.find_one({"item_id": item_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    prev_stage_id = item.get("current_stage_id")
    new_stage = await db.production_stages.find_one({"stage_id": move_data.new_stage_id}, {"_id": 0})
    if not new_stage:
        raise HTTPException(status_code=404, detail="Stage not found")
    
    completed_this_stage = item.get("qty_completed", 0)
    
    await db.production_items.update_one(
        {"item_id": item_id},
        {"$set": {"current_stage_id": move_data.new_stage_id, "qty_completed": 0, "status": "pending"}}
    )
    
    if prev_stage_id:
        active_timer = await db.time_logs.find_one({
            "user_id": user.user_id,
            "stage_id": prev_stage_id,
            "completed_at": None
        }, {"_id": 0})
        
        if active_timer:
            await db.time_logs.update_one(
                {"log_id": active_timer["log_id"]},
                {"$inc": {"items_processed": completed_this_stage}}
            )
    
    return {
        "message": f"Item moved to {new_stage['name']} (qty reset to 0)",
        "item_id": item_id,
        "new_stage": new_stage["name"],
        "completed_in_previous_stage": completed_this_stage
    }

@router.post("/bulk-move")
async def bulk_move_completed_items(move_data: BulkMoveRequest, user: User = Depends(get_current_user)):
    """Move all completed items from one stage to the next"""
    current_stage = await db.production_stages.find_one({"stage_id": move_data.stage_id}, {"_id": 0})
    next_stage = await db.production_stages.find_one({"stage_id": move_data.next_stage_id}, {"_id": 0})
    
    if not current_stage or not next_stage:
        raise HTTPException(status_code=404, detail="Stage not found")
    
    completed_items = await db.production_items.find({
        "current_stage_id": move_data.stage_id,
        "$expr": {"$gte": ["$qty_completed", "$qty_required"]}
    }, {"_id": 0}).to_list(10000)
    
    if not completed_items:
        return {"message": "No completed items to move", "moved_count": 0}
    
    item_ids = [item["item_id"] for item in completed_items]
    total_items_processed = sum(item.get("qty_completed", 0) for item in completed_items)
    
    await db.production_items.update_many(
        {"item_id": {"$in": item_ids}},
        {"$set": {"current_stage_id": move_data.next_stage_id, "qty_completed": 0, "status": "pending"}}
    )
    
    active_timer = await db.time_logs.find_one({
        "user_id": user.user_id,
        "stage_id": move_data.stage_id,
        "completed_at": None
    }, {"_id": 0})
    
    if active_timer:
        await db.time_logs.update_one(
            {"log_id": active_timer["log_id"]},
            {"$inc": {"items_processed": total_items_processed}}
        )
    
    return {
        "message": f"Moved {len(item_ids)} items to {next_stage['name']} (qty reset to 0)",
        "moved_count": len(item_ids),
        "items_processed": total_items_processed,
        "next_stage": next_stage["name"]
    }

@router.put("/{item_id}/reject")
async def update_item_rejected(item_id: str, qty_rejected: int, user: User = Depends(get_current_user)):
    """Update the rejected quantity for an item"""
    item = await db.production_items.find_one({"item_id": item_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    qty_rejected = max(0, qty_rejected)
    
    await db.production_items.update_one(
        {"item_id": item_id},
        {"$set": {"qty_rejected": qty_rejected}}
    )
    
    return {"message": "Rejected quantity updated", "qty_rejected": qty_rejected}

@router.post("/{item_id}/add-to-inventory")
async def add_item_to_inventory(item_id: str, user: User = Depends(get_current_user)):
    """Add completed item to frame inventory (from Quality Check stage)"""
    item = await db.production_items.find_one({"item_id": item_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    if item.get("added_to_inventory"):
        raise HTTPException(status_code=400, detail="Item already added to inventory")
    
    qty_completed = item.get("qty_completed", 0)
    qty_rejected = item.get("qty_rejected", 0)
    qty_good = max(0, qty_completed - qty_rejected)
    
    if qty_completed <= 0:
        raise HTTPException(status_code=400, detail="No frames completed")
    
    sku = item.get("sku", "")
    match_key = get_sku_match_key(sku)
    now = datetime.now(timezone.utc).isoformat()
    messages = []
    
    # Add GOOD frames to main inventory
    if qty_good > 0:
        existing_good = await db.inventory.find_one({
            "sku_match_key": match_key,
            "is_rejected": {"$ne": True}
        }, {"_id": 0})
        
        if existing_good:
            await db.inventory.update_one(
                {"item_id": existing_good["item_id"]},
                {"$inc": {"quantity": qty_good}, "$set": {"updated_at": now}}
            )
        else:
            inv_item = {
                "item_id": f"inv_{uuid.uuid4().hex[:8]}",
                "sku": sku,
                "sku_match_key": match_key,
                "name": item["name"],
                "color": item.get("color", ""),
                "size": item.get("size", ""),
                "quantity": qty_good,
                "min_stock": 10,
                "location": "",
                "is_rejected": False,
                "created_at": now,
                "updated_at": now
            }
            await db.inventory.insert_one(inv_item)
        messages.append(f"{qty_good} good")
    
    # Add REJECTED frames to separate rejected inventory
    if qty_rejected > 0:
        existing_rejected = await db.inventory.find_one({
            "sku_match_key": match_key,
            "is_rejected": True
        }, {"_id": 0})
        
        if existing_rejected:
            await db.inventory.update_one(
                {"item_id": existing_rejected["item_id"]},
                {"$inc": {"quantity": qty_rejected}, "$set": {"updated_at": now}}
            )
        else:
            rej_item = {
                "item_id": f"inv_{uuid.uuid4().hex[:8]}",
                "sku": f"{sku}-REJECTED",
                "sku_match_key": match_key,
                "name": f"{item['name']} (REJECTED)",
                "color": item.get("color", ""),
                "size": item.get("size", ""),
                "quantity": qty_rejected,
                "min_stock": 0,
                "location": "Rejected Bin",
                "is_rejected": True,
                "created_at": now,
                "updated_at": now
            }
            await db.inventory.insert_one(rej_item)
        messages.append(f"{qty_rejected} rejected")
    
    # Remove item from production
    await db.production_items.delete_one({"item_id": item_id})
    
    # Check if batch is now empty and should be auto-archived
    batch_archived = False
    batch_id = item.get("batch_id")
    if batch_id:
        remaining_items = await db.production_items.count_documents({"batch_id": batch_id})
        if remaining_items == 0:
            # Auto-archive the batch
            await db.production_batches.update_one(
                {"batch_id": batch_id},
                {"$set": {
                    "status": "archived",
                    "archived_at": now,
                    "archived_by": user.user_id,
                    "auto_archived": True,
                    "auto_archive_reason": "all_items_sent_to_inventory"
                }}
            )
            batch_archived = True
    
    return {
        "message": f"Added to inventory: {', '.join(messages)}",
        "sku": sku,
        "match_key": match_key,
        "good_added": qty_good,
        "rejected_added": qty_rejected,
        "item_removed": True,
        "batch_archived": batch_archived
    }
