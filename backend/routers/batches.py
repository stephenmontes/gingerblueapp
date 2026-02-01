from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone
import uuid

from database import db
from models.user import User
from models.production import BatchCreate, ItemMove
from dependencies import get_current_user

router = APIRouter(prefix="/batches", tags=["batches"])

def parse_sku(sku: str) -> dict:
    """Parse SKU to extract size and color
    
    SKU format: BWF-AD-1225-HS-W
    - Size is second to last group: HS, S, L, XL, HX, XX, XXX
    - Color is last group: W, B, N, G, etc.
    """
    if not sku:
        return {"color": "UNK", "size": "UNK"}
    
    parts = sku.replace('_', '-').replace('.', '-').split('-')
    parts = [p.strip().upper() for p in parts if p.strip()]
    
    color = "UNK"
    size = "UNK"
    
    if len(parts) >= 2:
        # Color is the LAST part
        color = parts[-1]
        # Size is the SECOND TO LAST part
        size = parts[-2]
    elif len(parts) == 1:
        # Single part - try to extract from end
        part = parts[0]
        if len(part) >= 2:
            color = part[-1]
            # Look for size codes
            size_codes = ['XXX', 'XX', 'XL', 'HS', 'HX', 'S', 'L']
            remaining = part[:-1]
            for code in size_codes:
                if remaining.endswith(code):
                    size = code
                    break
    
    return {"color": color, "size": size}

@router.get("")
async def get_batches(status: Optional[str] = None, user: User = Depends(get_current_user)):
    """Get all production batches"""
    query = {}
    if status:
        query["status"] = status
    
    batches = await db.production_batches.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return batches

@router.post("/{batch_id}/archive")
async def archive_batch(batch_id: str, user: User = Depends(get_current_user)):
    """Archive/complete a batch - moves it to history"""
    batch = await db.production_batches.find_one({"batch_id": batch_id}, {"_id": 0})
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    if batch.get("status") == "archived":
        raise HTTPException(status_code=400, detail="Batch is already archived")
    
    # Get final stats before archiving
    items = await db.production_items.find({"batch_id": batch_id}, {"_id": 0}).to_list(10000)
    total_completed = sum(item.get("qty_completed", 0) for item in items)
    total_rejected = sum(item.get("qty_rejected", 0) for item in items)
    
    now = datetime.now(timezone.utc).isoformat()
    
    await db.production_batches.update_one(
        {"batch_id": batch_id},
        {"$set": {
            "status": "archived",
            "archived_at": now,
            "archived_by": user.user_id,
            "final_stats": {
                "total_items": len(items),
                "total_completed": total_completed,
                "total_rejected": total_rejected,
                "good_frames": max(0, total_completed - total_rejected)
            }
        }}
    )
    
    # Update orders status to completed in fulfillment_orders
    await db.fulfillment_orders.update_many(
        {"batch_id": batch_id},
        {"$set": {"status": "completed", "updated_at": now}}
    )
    
    return {
        "message": "Batch archived successfully",
        "batch_id": batch_id,
        "archived_at": now
    }

@router.post("/{batch_id}/restore")
async def restore_batch(batch_id: str, user: User = Depends(get_current_user)):
    """Restore an archived batch back to active"""
    batch = await db.production_batches.find_one({"batch_id": batch_id}, {"_id": 0})
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    if batch.get("status") != "archived":
        raise HTTPException(status_code=400, detail="Batch is not archived")
    
    now = datetime.now(timezone.utc).isoformat()
    
    await db.production_batches.update_one(
        {"batch_id": batch_id},
        {"$set": {"status": "active"}, "$unset": {"archived_at": "", "archived_by": "", "final_stats": ""}}
    )
    
    # Update orders status back to in_production in fulfillment_orders
    await db.fulfillment_orders.update_many(
        {"batch_id": batch_id},
        {"$set": {"status": "in_production", "updated_at": now}}
    )
    
    return {"message": "Batch restored successfully", "batch_id": batch_id}

@router.get("/{batch_id}")
async def get_batch(batch_id: str, user: User = Depends(get_current_user)):
    """Get a single batch with its items"""
    batch = await db.production_batches.find_one({"batch_id": batch_id}, {"_id": 0})
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    items = await db.production_items.find({"batch_id": batch_id}, {"_id": 0}).to_list(1000)
    orders = await db.fulfillment_orders.find({"order_id": {"$in": batch.get("order_ids", [])}}, {"_id": 0}).to_list(1000)
    
    return {**batch, "items": items, "orders": orders}

@router.post("")
async def create_batch(batch_data: BatchCreate, user: User = Depends(get_current_user)):
    """Create a production batch from selected orders"""
    if not batch_data.order_ids:
        raise HTTPException(status_code=400, detail="No orders selected")
    
    # Check in fulfillment_orders collection (main orders collection)
    already_batched = await db.fulfillment_orders.find(
        {"order_id": {"$in": batch_data.order_ids}, "batch_id": {"$ne": None}},
        {"_id": 0, "order_id": 1, "batch_id": 1}
    ).to_list(1000)
    
    if already_batched:
        order_ids = [o["order_id"] for o in already_batched]
        raise HTTPException(
            status_code=400, 
            detail=f"Orders already in a batch: {', '.join(order_ids[:3])}{'...' if len(order_ids) > 3 else ''}"
        )
    
    # Get orders from fulfillment_orders collection
    orders = await db.fulfillment_orders.find({"order_id": {"$in": batch_data.order_ids}}, {"_id": 0}).to_list(1000)
    
    if not orders:
        raise HTTPException(status_code=404, detail="No orders found")
    
    # Find the Cutting stage specifically - this is where cut list items start
    cutting_stage = await db.production_stages.find_one({"stage_id": "stage_cutting"})
    if not cutting_stage:
        # Fallback - find by name
        cutting_stage = await db.production_stages.find_one({"name": {"$regex": "cut", "$options": "i"}})
    if not cutting_stage:
        # Last fallback - use first stage
        stages = await db.production_stages.find({}, {"_id": 0}).sort("order", 1).to_list(100)
        cutting_stage = stages[0] if stages else {"stage_id": "stage_cutting", "name": "Cutting"}
    
    batch_id = f"batch_{uuid.uuid4().hex[:8]}"
    total_items = 0
    
    # Items are ONLY added to the cutting stage (cut list)
    # They will move to next stages when marked as done in the cut list
    production_items = []
    for order in orders:
        for item in order.get("items", []):
            sku = item.get("sku", "UNKNOWN")
            parsed = parse_sku(sku)
            qty = item.get("qty", 1)
            total_items += qty
            
            prod_item = {
                "item_id": f"item_{uuid.uuid4().hex[:8]}",
                "batch_id": batch_id,
                "order_id": order["order_id"],
                "sku": sku,
                "name": item.get("name", "Unknown Item"),
                "color": parsed["color"],
                "size": parsed["size"],
                "qty_required": qty,
                "qty_completed": 0,
                "qty_rejected": 0,
                "current_stage_id": cutting_stage["stage_id"],
                "current_stage_name": cutting_stage.get("name", "Cutting"),
                "status": "pending",
                "added_to_inventory": False,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            production_items.append(prod_item)
    
    if production_items:
        await db.production_items.insert_many(production_items)
    
    batch_doc = {
        "batch_id": batch_id,
        "name": batch_data.name,
        "order_ids": batch_data.order_ids,
        "current_stage_id": cutting_stage["stage_id"],
        "assigned_to": None,
        "assigned_name": None,
        "status": "active",
        "time_started": None,
        "time_completed": None,
        "total_items": total_items,
        "items_completed": 0,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.production_batches.insert_one(batch_doc)
    
    # Get first fulfillment stage for Order Fulfillment workflow
    fulfillment_stages = await db.fulfillment_stages.find({}, {"_id": 0}).sort("order", 1).to_list(100)
    first_fulfill_stage = None
    if fulfillment_stages:
        first_fulfill_stage = fulfillment_stages[0]
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Update orders with batch info AND assign to fulfillment workflow
    update_data = {
        "batch_id": batch_id,
        "batch_name": batch_data.name,
        "status": "in_production",
        "current_stage_id": first_stage["stage_id"],
        "updated_at": now
    }
    
    # Also assign to Order Fulfillment first stage
    if first_fulfill_stage:
        update_data["fulfillment_stage_id"] = first_fulfill_stage["stage_id"]
        update_data["fulfillment_stage_name"] = first_fulfill_stage["name"]
        update_data["fulfillment_updated_at"] = now
        update_data["fulfillment_updated_by"] = user.user_id
    
    # Update orders in fulfillment_orders collection
    await db.fulfillment_orders.update_many(
        {"order_id": {"$in": batch_data.order_ids}},
        {"$set": update_data}
    )
    
    # Log the fulfillment assignment for each order
    if first_fulfill_stage:
        fulfillment_logs = []
        for order_id in batch_data.order_ids:
            fulfillment_logs.append({
                "log_id": f"flog_{uuid.uuid4().hex[:12]}",
                "order_id": order_id,
                "from_stage": None,
                "to_stage": first_fulfill_stage["stage_id"],
                "to_stage_name": first_fulfill_stage["name"],
                "user_id": user.user_id,
                "user_name": user.name,
                "action": "batch_created",
                "batch_id": batch_id,
                "created_at": now
            })
        if fulfillment_logs:
            await db.fulfillment_logs.insert_many(fulfillment_logs)
    
    return {**{k: v for k, v in batch_doc.items() if k != "_id"}, "items_count": len(production_items)}

@router.delete("/{batch_id}")
async def delete_batch(batch_id: str, user: User = Depends(get_current_user)):
    """Delete a batch and return orders to pending"""
    if user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    batch = await db.production_batches.find_one({"batch_id": batch_id}, {"_id": 0})
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    await db.production_items.delete_many({"batch_id": batch_id})
    
    first_stage = await db.production_stages.find_one(sort=[("order", 1)])
    first_stage_id = first_stage["stage_id"] if first_stage else "stage_new"
    
    # Update orders in fulfillment_orders collection
    await db.fulfillment_orders.update_many(
        {"batch_id": batch_id},
        {"$set": {
            "batch_id": None,
            "batch_name": None,
            "status": "pending",
            "current_stage_id": first_stage_id,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    await db.production_batches.delete_one({"batch_id": batch_id})
    
    return {"message": "Batch deleted"}

@router.get("/{batch_id}/items-grouped")
async def get_batch_items_grouped(batch_id: str, user: User = Depends(get_current_user)):
    """Get batch items grouped by color and size with subtotals"""
    items = await db.production_items.find({"batch_id": batch_id}, {"_id": 0}).to_list(10000)
    
    grouped = {}
    for item in items:
        key = f"{item['color']}-{item['size']}"
        if key not in grouped:
            grouped[key] = {
                "color": item["color"],
                "size": item["size"],
                "items": [],
                "total_required": 0,
                "total_completed": 0
            }
        grouped[key]["items"].append(item)
        grouped[key]["total_required"] += item.get("qty_required", 1)
        grouped[key]["total_completed"] += item.get("qty_completed", 0)
    
    result = list(grouped.values())
    result.sort(key=lambda x: (x["color"], x["size"]))
    
    return result

@router.get("/{batch_id}/stage-summary")
async def get_batch_stage_summary(batch_id: str, user: User = Depends(get_current_user)):
    """Get summary of items by stage for a batch"""
    items = await db.production_items.find({"batch_id": batch_id}, {"_id": 0}).to_list(10000)
    stages = await db.production_stages.find({}, {"_id": 0}).sort("order", 1).to_list(100)
    
    stage_summary = {}
    for stage in stages:
        stage_summary[stage["stage_id"]] = {
            "stage_id": stage["stage_id"],
            "stage_name": stage["name"],
            "color": stage["color"],
            "order": stage["order"],
            "total_items": 0,
            "total_required": 0,
            "total_completed": 0,
            "items": []
        }
    
    for item in items:
        stage_id = item.get("current_stage_id", "stage_new")
        if stage_id in stage_summary:
            stage_summary[stage_id]["items"].append(item)
            stage_summary[stage_id]["total_items"] += 1
            stage_summary[stage_id]["total_required"] += item.get("qty_required", 1)
            stage_summary[stage_id]["total_completed"] += item.get("qty_completed", 0)
    
    result = list(stage_summary.values())
    result.sort(key=lambda x: x["order"])
    
    return result

@router.get("/{batch_id}/stats")
async def get_batch_stats(batch_id: str, user: User = Depends(get_current_user)):
    """Get comprehensive batch statistics"""
    batch = await db.production_batches.find_one({"batch_id": batch_id}, {"_id": 0})
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    items = await db.production_items.find({"batch_id": batch_id}, {"_id": 0}).to_list(10000)
    time_logs = await db.time_logs.find({"completed_at": {"$ne": None}}, {"_id": 0}).to_list(10000)
    
    total_required = sum(item.get("qty_required", 0) for item in items)
    total_completed = sum(item.get("qty_completed", 0) for item in items)
    total_rejected = sum(item.get("qty_rejected", 0) for item in items)
    total_good = total_completed - total_rejected
    
    total_minutes = sum(log.get("duration_minutes", 0) for log in time_logs)
    total_hours = total_minutes / 60
    
    rejection_rate = (total_rejected / total_completed * 100) if total_completed > 0 else 0
    
    hourly_rate = 22.0
    total_labor_cost = total_hours * hourly_rate
    avg_cost_per_frame = total_labor_cost / total_good if total_good > 0 else 0
    
    user_hours = {}
    for log in time_logs:
        user_name = log.get("user_name", "Unknown")
        if user_name not in user_hours:
            user_hours[user_name] = {"minutes": 0, "items_processed": 0}
        user_hours[user_name]["minutes"] += log.get("duration_minutes", 0)
        user_hours[user_name]["items_processed"] += log.get("items_processed", 0)
    
    user_breakdown = [
        {"user_name": name, "hours": round(data["minutes"] / 60, 2), "items_processed": data["items_processed"]}
        for name, data in user_hours.items()
    ]
    
    return {
        "batch_id": batch_id,
        "batch_name": batch.get("name", ""),
        "totals": {"required": total_required, "completed": total_completed, "rejected": total_rejected, "good_frames": total_good},
        "time": {"total_hours": round(total_hours, 2), "total_minutes": round(total_minutes, 1)},
        "costs": {"hourly_rate": hourly_rate, "total_labor_cost": round(total_labor_cost, 2), "avg_cost_per_frame": round(avg_cost_per_frame, 2)},
        "quality": {"rejection_rate": round(rejection_rate, 1), "rejected_count": total_rejected},
        "user_breakdown": user_breakdown
    }


# Cut List Progress Models
class CutListItemUpdate(BaseModel):
    size: str
    color: str
    qty_made: int
    completed: bool = False

class CutListUpdate(BaseModel):
    items: List[CutListItemUpdate]

@router.get("/{batch_id}/cut-list")
async def get_cut_list(batch_id: str, user: User = Depends(get_current_user)):
    """Get cut list with progress for a batch - aggregated by size and color"""
    batch = await db.production_batches.find_one({"batch_id": batch_id}, {"_id": 0})
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    # Get orders for this batch
    order_ids = batch.get("order_ids", [])
    orders = await db.fulfillment_orders.find(
        {"order_id": {"$in": order_ids}},
        {"_id": 0}
    ).to_list(1000)
    
    # Get existing cut list progress
    cut_list_progress = await db.cut_list_progress.find_one(
        {"batch_id": batch_id},
        {"_id": 0}
    )
    progress_map = {}
    if cut_list_progress:
        for item in cut_list_progress.get("items", []):
            key = f"{item['size']}-{item['color']}"
            progress_map[key] = item
    
    # Size order for sorting
    SIZE_ORDER = ["S", "L", "XL", "HS", "HX", "XX", "XXX"]
    
    # Aggregate items by size and color
    item_map = {}
    for order in orders:
        for item in order.get("items", []):
            sku = item.get("sku", "")
            parsed = parse_sku(sku)
            size = parsed.get("size", "UNK")
            color = parsed.get("color", "UNK")
            key = f"{size}-{color}"
            qty = item.get("quantity") or item.get("qty") or 1
            
            if key in item_map:
                item_map[key]["qty_required"] += qty
            else:
                # Get progress if exists
                progress = progress_map.get(key, {})
                item_map[key] = {
                    "size": size,
                    "color": color,
                    "qty_required": qty,
                    "qty_made": progress.get("qty_made", 0),
                    "completed": progress.get("completed", False)
                }
    
    # Convert to list and sort
    def get_size_index(size):
        try:
            return SIZE_ORDER.index(size)
        except ValueError:
            return len(SIZE_ORDER)
    
    items = list(item_map.values())
    items.sort(key=lambda x: (get_size_index(x["size"]), x["color"]))
    
    # Group by size for subtotals
    size_groups = {}
    for item in items:
        size = item["size"]
        if size not in size_groups:
            size_groups[size] = {
                "size": size,
                "items": [],
                "subtotal_required": 0,
                "subtotal_made": 0
            }
        size_groups[size]["items"].append(item)
        size_groups[size]["subtotal_required"] += item["qty_required"]
        size_groups[size]["subtotal_made"] += item["qty_made"]
    
    groups = list(size_groups.values())
    groups.sort(key=lambda x: get_size_index(x["size"]))
    
    # Calculate totals
    grand_total_required = sum(item["qty_required"] for item in items)
    grand_total_made = sum(item["qty_made"] for item in items)
    
    return {
        "batch_id": batch_id,
        "size_groups": groups,
        "grand_total_required": grand_total_required,
        "grand_total_made": grand_total_made
    }

@router.put("/{batch_id}/cut-list")
async def update_cut_list(
    batch_id: str,
    update: CutListUpdate,
    user: User = Depends(get_current_user)
):
    """Update cut list progress for a batch"""
    batch = await db.production_batches.find_one({"batch_id": batch_id})
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Upsert cut list progress
    await db.cut_list_progress.update_one(
        {"batch_id": batch_id},
        {
            "$set": {
                "batch_id": batch_id,
                "items": [item.dict() for item in update.items],
                "updated_at": now,
                "updated_by": user.user_id
            }
        },
        upsert=True
    )
    
    return {"message": "Cut list updated", "batch_id": batch_id}

@router.put("/{batch_id}/cut-list/item")
async def update_cut_list_item(
    batch_id: str,
    size: str,
    color: str,
    qty_made: int = 0,
    completed: bool = False,
    user: User = Depends(get_current_user)
):
    """Update a single cut list item"""
    batch = await db.production_batches.find_one({"batch_id": batch_id})
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    now = datetime.now(timezone.utc).isoformat()
    key = f"{size}-{color}"
    
    # Get existing progress
    progress = await db.cut_list_progress.find_one({"batch_id": batch_id})
    
    if progress:
        # Update existing item or add new one
        items = progress.get("items", [])
        found = False
        for item in items:
            if item["size"] == size and item["color"] == color:
                item["qty_made"] = qty_made
                item["completed"] = completed
                found = True
                break
        
        if not found:
            items.append({
                "size": size,
                "color": color,
                "qty_made": qty_made,
                "completed": completed
            })
        
        await db.cut_list_progress.update_one(
            {"batch_id": batch_id},
            {
                "$set": {
                    "items": items,
                    "updated_at": now,
                    "updated_by": user.user_id
                }
            }
        )
    else:
        # Create new progress document
        await db.cut_list_progress.insert_one({
            "batch_id": batch_id,
            "items": [{
                "size": size,
                "color": color,
                "qty_made": qty_made,
                "completed": completed
            }],
            "updated_at": now,
            "updated_by": user.user_id
        })
    
    return {"message": "Item updated", "size": size, "color": color, "qty_made": qty_made, "completed": completed}


@router.post("/{batch_id}/cut-list/move-to-assembly")
async def move_cut_list_item_to_assembly(
    batch_id: str,
    size: str,
    color: str,
    quantity: int = 1,
    user: User = Depends(get_current_user)
):
    """Move items from cut list to assembly stage"""
    batch = await db.production_batches.find_one({"batch_id": batch_id})
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    # Find assembly stage
    assembly_stage = await db.production_stages.find_one({"stage_id": "stage_assembly"})
    if not assembly_stage:
        # Fallback - find by name
        assembly_stage = await db.production_stages.find_one({"name": {"$regex": "assembly", "$options": "i"}})
    
    if not assembly_stage:
        raise HTTPException(status_code=404, detail="Assembly stage not found")
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Find production items matching this size/color in the cutting stage
    cutting_stage = await db.production_stages.find_one({"stage_id": "stage_cutting"})
    cutting_stage_id = cutting_stage["stage_id"] if cutting_stage else "stage_cutting"
    
    # Get items in the batch that match size/color and are in cutting stage
    items_to_move = await db.production_items.find({
        "batch_id": batch_id,
        "size": size.upper(),
        "color": color.upper(),
        "current_stage_id": cutting_stage_id
    }, {"_id": 0}).to_list(quantity)
    
    if not items_to_move:
        # If no items found in cutting, check if they're in 'new' stage
        items_to_move = await db.production_items.find({
            "batch_id": batch_id,
            "size": size.upper(),
            "color": color.upper(),
            "current_stage_id": "stage_new"
        }, {"_id": 0}).to_list(quantity)
    
    moved_count = 0
    for item in items_to_move[:quantity]:
        await db.production_items.update_one(
            {"item_id": item["item_id"]},
            {
                "$set": {
                    "current_stage_id": assembly_stage["stage_id"],
                    "current_stage_name": assembly_stage["name"],
                    "stage_updated_at": now,
                    "stage_updated_by": user.user_id,
                    "updated_at": now
                }
            }
        )
        moved_count += 1
        
        # Log the stage transition
        await db.production_logs.insert_one({
            "log_id": f"log_{uuid.uuid4().hex[:12]}",
            "item_id": item["item_id"],
            "batch_id": batch_id,
            "from_stage": item.get("current_stage_id"),
            "to_stage": assembly_stage["stage_id"],
            "to_stage_name": assembly_stage["name"],
            "moved_by": user.user_id,
            "moved_by_name": user.name,
            "quantity": 1,
            "created_at": now
        })
    
    # Update cut list progress - reduce qty_made for moved items
    if moved_count > 0:
        progress = await db.cut_list_progress.find_one({"batch_id": batch_id})
        if progress:
            items = progress.get("items", [])
            for item in items:
                if item["size"] == size.upper() and item["color"] == color.upper():
                    # Track moved quantity separately
                    item["qty_moved_to_assembly"] = item.get("qty_moved_to_assembly", 0) + moved_count
                    break
            
            await db.cut_list_progress.update_one(
                {"batch_id": batch_id},
                {"$set": {"items": items, "updated_at": now}}
            )
    
    return {
        "message": f"Moved {moved_count} items to Assembly",
        "moved_count": moved_count,
        "size": size,
        "color": color,
        "to_stage": assembly_stage["name"]
    }

