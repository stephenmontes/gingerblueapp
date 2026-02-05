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


class OnDemandFrame(BaseModel):
    size: str
    color: str
    qty: int


class OnDemandBatchCreate(BaseModel):
    name: Optional[str] = None
    frames: List[OnDemandFrame]


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


@router.post("/on-demand")
async def create_on_demand_batch(data: OnDemandBatchCreate, user: User = Depends(get_current_user)):
    """Create an on-demand batch with manually specified frames (not from orders)"""
    if not data.frames:
        raise HTTPException(status_code=400, detail="At least one frame is required")
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Get the first production stage (Cutting)
    stages = await db.stages.find({"type": "production"}, {"_id": 0}).sort("order", 1).to_list(100)
    if not stages:
        # Auto-create default production stages
        default_stages = [
            {"stage_id": "stage_cutting", "name": "Cutting", "type": "production", "order": 1, "color": "#EF4444", "created_at": now},
            {"stage_id": "stage_assembly", "name": "Assembly", "type": "production", "order": 2, "color": "#F59E0B", "created_at": now},
            {"stage_id": "stage_finishing", "name": "Finishing", "type": "production", "order": 3, "color": "#10B981", "created_at": now},
            {"stage_id": "stage_qc", "name": "Quality Check", "type": "production", "order": 4, "color": "#3B82F6", "created_at": now},
            {"stage_id": "stage_complete", "name": "Complete", "type": "production", "order": 5, "color": "#8B5CF6", "created_at": now},
        ]
        await db.stages.insert_many(default_stages)
        stages = default_stages
    
    first_stage = stages[0]
    
    batch_id = f"batch_{uuid.uuid4().hex[:12]}"
    
    # Generate batch name if not provided
    if data.name:
        batch_name = data.name
    else:
        # Count existing on-demand batches today
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        existing_count = await db.production_batches.count_documents({
            "batch_type": "on_demand",
            "created_at": {"$regex": f"^{today}"}
        })
        batch_name = f"On-Demand #{existing_count + 1} - {datetime.now(timezone.utc).strftime('%b %d')}"
    
    # Calculate totals
    total_qty = sum(f.qty for f in data.frames)
    
    # Create the batch
    batch = {
        "batch_id": batch_id,
        "name": batch_name,
        "status": "active",
        "batch_type": "on_demand",
        "order_count": 0,
        "item_count": len(data.frames),
        "total_qty": total_qty,
        "current_stage_id": first_stage["stage_id"],
        "current_stage_name": first_stage["name"],
        "created_at": now,
        "created_by": user.user_id,
        "created_by_name": user.name or user.email
    }
    
    await db.production_batches.insert_one(batch)
    
    # Create frames
    frames_to_insert = []
    for i, frame_data in enumerate(data.frames):
        frame_id = f"frame_{uuid.uuid4().hex[:12]}"
        frame = {
            "frame_id": frame_id,
            "batch_id": batch_id,
            "size": frame_data.size.upper(),
            "color": frame_data.color.upper(),
            "qty": frame_data.qty,
            "qty_required": frame_data.qty,  # Used by UI to show total required
            "qty_completed": 0,
            "qty_rejected": 0,
            "current_stage_id": first_stage["stage_id"],
            "current_stage_name": first_stage["name"],
            "stage_history": [{
                "stage_id": first_stage["stage_id"],
                "stage_name": first_stage["name"],
                "entered_at": now,
                "entered_by": user.user_id
            }],
            "created_at": now,
            "source": "on_demand",
            "order_ids": [],
            "sku": f"OD-{frame_data.size.upper()}-{frame_data.color.upper()}"
        }
        frames_to_insert.append(frame)
    
    if frames_to_insert:
        await db.batch_frames.insert_many(frames_to_insert)
    
    return {
        "message": "On-demand batch created successfully",
        "batch_id": batch_id,
        "batch_name": batch_name,
        "frame_count": len(frames_to_insert),
        "total_qty": total_qty
    }


@router.get("")
async def get_batches(status: Optional[str] = None, user: User = Depends(get_current_user)):
    """Get all production batches"""
    query = {}
    if status:
        query["status"] = status
    
    batches = await db.production_batches.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return batches


@router.delete("/{batch_id}")
async def delete_batch(
    batch_id: str, 
    remove_frames: bool = True,
    user: User = Depends(get_current_user)
):
    """Delete/Undo a batch - removes from both Frame Production and Order Fulfillment
    
    Args:
        remove_frames: If True, delete all batch frames. If False, keep frames in production queue.
    
    This action:
    1. Removes the production batch
    2. Optionally removes all batch frames (based on remove_frames param)
    3. Removes the linked fulfillment batch (if ShipStation)
    4. Resets orders to remove batch references
    
    Only admins/managers can delete batches.
    """
    # Check permissions
    if user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Only admins and managers can delete batches")
    
    batch = await db.production_batches.find_one({"batch_id": batch_id}, {"_id": 0})
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Log the deletion before removing
    deletion_log = {
        "log_id": f"bdel_{uuid.uuid4().hex[:12]}",
        "batch_id": batch_id,
        "batch_name": batch.get("name"),
        "batch_type": batch.get("batch_type"),
        "order_ids": batch.get("order_ids", []),
        "remove_frames": remove_frames,
        "deleted_by": user.user_id,
        "deleted_by_name": user.name,
        "action": "batch_deleted",
        "created_at": now
    }
    await db.batch_deletion_logs.insert_one(deletion_log)
    
    # Get order IDs before deletion
    order_ids = batch.get("order_ids", [])
    fulfillment_batch_id = batch.get("fulfillment_batch_id")
    
    # 1. Conditionally delete batch frames based on remove_frames parameter
    frames_deleted_count = 0
    if remove_frames:
        frames_deleted = await db.batch_frames.delete_many({"batch_id": batch_id})
        frames_deleted_count = frames_deleted.deleted_count
    else:
        # Just unlink frames from batch but keep them in production queue
        await db.batch_frames.update_many(
            {"batch_id": batch_id},
            {"$unset": {"batch_id": "", "batch_name": ""}}
        )
    
    # 2. Delete all production items (if any)
    items_deleted = await db.production_items.delete_many({"batch_id": batch_id})
    
    # 3. Delete the production batch
    await db.production_batches.delete_one({"batch_id": batch_id})
    
    # 4. If there's a linked fulfillment batch, delete it
    fulfillment_batch_deleted = False
    if fulfillment_batch_id:
        await db.fulfillment_batches.delete_one({"fulfillment_batch_id": fulfillment_batch_id})
        fulfillment_batch_deleted = True
    
    # Also check by production_batch_id reference
    linked_fulfillment = await db.fulfillment_batches.find_one({"production_batch_id": batch_id})
    if linked_fulfillment:
        await db.fulfillment_batches.delete_one({"production_batch_id": batch_id})
        fulfillment_batch_deleted = True
    
    # 5. Reset orders - remove batch references but keep them in fulfillment
    if order_ids:
        await db.fulfillment_orders.update_many(
            {"order_id": {"$in": order_ids}},
            {"$unset": {
                "batch_id": "",
                "batch_name": "",
                "fulfillment_batch_id": "",
                "is_batch_fulfillment": ""
            },
            "$set": {
                "status": "pending",
                "fulfillment_stage_id": "fulfill_orders",
                "fulfillment_stage_name": "In Production",
                "updated_at": now
            }}
        )
        
        # Also update the main orders collection
        await db.orders.update_many(
            {"order_id": {"$in": order_ids}},
            {"$unset": {
                "batch_id": "",
                "batch_name": ""
            },
            "$set": {
                "status": "pending",
                "updated_at": now
            }}
        )
    
    return {
        "success": True,
        "message": f"Batch '{batch.get('name')}' has been deleted",
        "batch_id": batch_id,
        "frames_deleted": frames_deleted_count,
        "frames_removed": remove_frames,
        "items_deleted": items_deleted.deleted_count,
        "orders_reset": len(order_ids),
        "fulfillment_batch_deleted": fulfillment_batch_deleted,
        "deleted_by": user.name
    }


@router.post("/{batch_id}/archive")
async def archive_batch(batch_id: str, user: User = Depends(get_current_user)):
    """Archive/complete a batch - moves it to history
    
    For order-based batches: Updates orders in fulfillment
    For on-demand batches: Moves completed frames to inventory
    
    Only admins and managers can archive batches.
    """
    # Check if user is admin or manager
    if user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Only admins and managers can archive batches")
    
    batch = await db.production_batches.find_one({"batch_id": batch_id}, {"_id": 0})
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    if batch.get("status") == "archived":
        raise HTTPException(status_code=400, detail="Batch is already archived")
    
    # Get final stats before archiving (from batch_frames)
    frames = await db.batch_frames.find({"batch_id": batch_id}, {"_id": 0}).to_list(10000)
    total_completed = sum(frame.get("qty_completed", 0) for frame in frames)
    total_rejected = sum(frame.get("qty_rejected", 0) for frame in frames)
    
    now = datetime.now(timezone.utc).isoformat()
    
    await db.production_batches.update_one(
        {"batch_id": batch_id},
        {"$set": {
            "status": "archived",
            "archived_at": now,
            "archived_by": user.user_id,
            "final_stats": {
                "total_items": len(frames),
                "total_completed": total_completed,
                "total_rejected": total_rejected,
                "good_frames": max(0, total_completed - total_rejected)
            }
        }}
    )
    
    # Handle differently based on batch type
    if batch.get("batch_type") == "on_demand":
        # On-demand batches: Move completed frames to inventory
        inventory_added = 0
        for frame in frames:
            good_qty = frame.get("qty_completed", 0) - frame.get("qty_rejected", 0)
            if good_qty > 0:
                # Check if inventory item exists for this size/color
                existing = await db.frame_inventory.find_one({
                    "size": frame.get("size"),
                    "color": frame.get("color")
                })
                
                if existing:
                    # Update existing inventory
                    await db.frame_inventory.update_one(
                        {"inventory_id": existing["inventory_id"]},
                        {
                            "$inc": {"quantity": good_qty},
                            "$set": {"updated_at": now}
                        }
                    )
                else:
                    # Create new inventory item
                    inventory_id = f"inv_{uuid.uuid4().hex[:12]}"
                    await db.frame_inventory.insert_one({
                        "inventory_id": inventory_id,
                        "sku": f"FRAME-{frame.get('size', 'UNK')}-{frame.get('color', 'UNK')}",
                        "name": f"{frame.get('size', '')} {frame.get('color', '')} Frame",
                        "size": frame.get("size"),
                        "color": frame.get("color"),
                        "quantity": good_qty,
                        "min_stock": 10,
                        "location": "Production",
                        "created_at": now,
                        "updated_at": now
                    })
                inventory_added += good_qty
        
        return {
            "message": "On-demand batch archived - frames added to inventory",
            "batch_id": batch_id,
            "archived_at": now,
            "inventory_added": inventory_added
        }
    else:
        # Order-based batches: Update orders status to completed in fulfillment_orders
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
    """Get a single batch with its frames"""
    batch = await db.production_batches.find_one({"batch_id": batch_id}, {"_id": 0})
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    # Get frames from batch_frames collection
    frames = await db.batch_frames.find({"batch_id": batch_id}, {"_id": 0}).to_list(1000)
    
    # Optimized: Only fetch order fields needed for display
    order_projection = {
        "_id": 0,
        "order_id": 1,
        "order_number": 1,
        "external_id": 1,
        "customer_name": 1,
        "customer_email": 1,
        "store_name": 1,
        "status": 1,
        "total_price": 1,
        "items": 1,
        "requested_ship_date": 1
    }
    orders = await db.fulfillment_orders.find(
        {"order_id": {"$in": batch.get("order_ids", [])}}, 
        order_projection
    ).to_list(1000)
    
    return {**batch, "items": frames, "frames": frames, "orders": orders}

@router.post("")
async def create_batch(batch_data: BatchCreate, user: User = Depends(get_current_user)):
    """Create a production batch from selected orders - creates aggregated frame list by size/color"""
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
    # Optimized: Only fetch fields needed for batch creation (items for frame aggregation)
    order_projection = {
        "_id": 0,
        "order_id": 1,
        "items": 1,
        "store_id": 1,
        "store_name": 1,
        "platform": 1
    }
    orders = await db.fulfillment_orders.find(
        {"order_id": {"$in": batch_data.order_ids}}, 
        order_projection
    ).to_list(1000)
    
    if not orders:
        raise HTTPException(status_code=404, detail="No orders found")
    
    # Find the Cutting stage - first production stage
    cutting_stage = await db.production_stages.find_one({"stage_id": "stage_cutting"}, {"_id": 0})
    if not cutting_stage:
        cutting_stage = await db.production_stages.find_one({"name": {"$regex": "cut", "$options": "i"}}, {"_id": 0})
    if not cutting_stage:
        stages = await db.production_stages.find({}, {"_id": 0}).sort("order", 1).to_list(100)
        if not stages:
            # Initialize default stages if empty
            default_stages = [
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
        cutting_stage = stages[0] if stages else {"stage_id": "stage_cutting", "name": "Cutting"}
    
    batch_id = f"batch_{uuid.uuid4().hex[:8]}"
    now = datetime.now(timezone.utc).isoformat()
    
    # Track stores for this batch
    store_ids = set()
    store_names = set()
    platforms = set()
    
    for order in orders:
        # Track store info
        if order.get("store_id"):
            store_ids.add(order["store_id"])
        if order.get("store_name"):
            store_names.add(order["store_name"])
        if order.get("platform"):
            platforms.add(order["platform"])
    
    # Determine if this is a ShipStation (Etsy) batch or GB Decor batch
    is_shipstation_batch = "shipstation" in platforms
    
    # Check store names for special handling
    is_gb_decor_batch = False
    is_gb_home_batch = False
    is_antique_farmhouse_batch = False
    
    for name in store_names:
        if name:
            name_lower = name.lower()
            if "decor" in name_lower:
                is_gb_decor_batch = True
            elif "home" in name_lower:
                is_gb_home_batch = True
            elif "antique" in name_lower or "farmhouse" in name_lower:
                is_antique_farmhouse_batch = True
    
    # ShipStation, GB Decor, and Antique Farmhouse batches use the enhanced workflow (combined worksheet)
    # GB Home uses batch cards but individual order processing
    is_enhanced_batch = is_shipstation_batch or is_gb_decor_batch or is_antique_farmhouse_batch
    
    # All batches now get fulfillment batch cards
    needs_fulfillment_batch = True
    
    # Valid frame SKU prefixes for production cut list
    # Only these items go to frame production; others go directly to fulfillment
    FRAME_SKU_PREFIXES = ("BWF", "CRF", "CLF", "MTF")
    
    # Aggregate frames by size/color - THIS IS THE PRODUCTION LIST
    # Each unique size/color combination becomes ONE production frame item
    # For enhanced batches: Only include items with valid frame SKU prefixes
    frame_aggregation = {}
    total_frames = 0
    
    for order in orders:
        for item in order.get("items", []):
            sku = item.get("sku", "UNKNOWN")
            
            # For enhanced batches (ShipStation/Etsy/GB Decor), only process frame items
            if is_enhanced_batch:
                sku_prefix = sku.split("-")[0].upper() if "-" in sku else sku[:3].upper()
                if sku_prefix not in FRAME_SKU_PREFIXES:
                    continue  # Skip non-frame items for frame production
            
            parsed = parse_sku(sku)
            size = parsed["size"]
            color = parsed["color"]
            qty = item.get("qty", 1) or item.get("quantity", 1) or 1
            
            key = f"{size}-{color}"
            if key not in frame_aggregation:
                frame_aggregation[key] = {
                    "size": size,
                    "color": color,
                    "qty_required": 0,
                    "order_ids": [],
                    "skus": set()
                }
            frame_aggregation[key]["qty_required"] += qty
            frame_aggregation[key]["order_ids"].append(order["order_id"])
            frame_aggregation[key]["skus"].add(sku)
            total_frames += qty
    
    # Determine batch store type
    # single_store: all orders from one store
    # mixed: orders from multiple stores
    # shipstation: all orders from shipstation platform (Etsy)
    # gb_decor: all orders from GB Decor store
    # gb_home: all orders from GB Home store
    # antique_farmhouse: all orders from Antique Farmhouse store
    store_type = "mixed"
    primary_store_id = None
    primary_store_name = None
    
    if len(store_ids) == 1:
        primary_store_id = list(store_ids)[0]
        primary_store_name = list(store_names)[0] if store_names else None
        if is_antique_farmhouse_batch:
            store_type = "antique_farmhouse"
        elif is_shipstation_batch:
            store_type = "shipstation"
        elif is_gb_decor_batch:
            store_type = "gb_decor"
        elif is_gb_home_batch:
            store_type = "gb_home"
        else:
            store_type = "single_store"
    elif is_antique_farmhouse_batch:
        store_type = "antique_farmhouse"
    elif is_shipstation_batch:
        store_type = "shipstation"
    elif is_gb_decor_batch:
        store_type = "gb_decor"
    elif is_gb_home_batch:
        store_type = "gb_home"
    
    # Create aggregated frame items - these move through stages as units
    frame_items = []
    for key, data in frame_aggregation.items():
        frame_item = {
            "frame_id": f"frame_{uuid.uuid4().hex[:8]}",
            "batch_id": batch_id,
            "size": data["size"],
            "color": data["color"],
            "qty_required": data["qty_required"],
            "qty_completed": 0,
            "qty_rejected": 0,
            "current_stage_id": cutting_stage["stage_id"],
            "current_stage_name": cutting_stage.get("name", "Cutting"),
            "status": "pending",
            "order_ids": list(set(data["order_ids"])),
            "skus": list(data["skus"]),
            "created_at": now,
            "updated_at": now
        }
        frame_items.append(frame_item)
    
    # Store in batch_frames collection (aggregated production items)
    if frame_items:
        await db.batch_frames.insert_many(frame_items)
    
    # For enhanced batches with no frames, auto-archive the production batch
    # Orders will still go to fulfillment, but no frame production is needed
    auto_archived = False
    if is_enhanced_batch and len(frame_items) == 0:
        auto_archived = True
    
    batch_doc = {
        "batch_id": batch_id,
        "name": batch_data.name,
        "order_ids": batch_data.order_ids,
        "batch_type": "order_based",  # Distinguish from on_demand batches
        "store_type": store_type,  # "single_store", "mixed", "shipstation", "gb_decor", or "gb_home"
        "is_shipstation_batch": is_shipstation_batch,  # Flag for special ShipStation/Etsy handling
        "is_gb_decor_batch": is_gb_decor_batch,  # Flag for GB Decor handling
        "is_gb_home_batch": is_gb_home_batch,  # Flag for GB Home handling
        "is_enhanced_batch": is_enhanced_batch,  # Flag for enhanced batch workflow (combined worksheet)
        "store_id": primary_store_id,
        "store_name": primary_store_name,
        "store_ids": list(store_ids),
        "store_names": list(store_names),
        "current_stage_id": cutting_stage["stage_id"],
        "assigned_to": None,
        "assigned_name": None,
        "status": "archived" if auto_archived else "active",
        "auto_archived": auto_archived,
        "auto_archive_reason": "no_frames_to_produce" if auto_archived else None,
        "archived_at": now if auto_archived else None,
        "time_started": None,
        "time_completed": None,
        "total_frames": total_frames,
        "total_frame_types": len(frame_items),
        "frames_completed": 0,
        "created_at": now
    }
    
    await db.production_batches.insert_one(batch_doc)
    
    # Get Print List stage for Order Fulfillment workflow
    # Orders from batch creation should go directly to Print List, not In Production
    fulfillment_stages = await db.fulfillment_stages.find({}, {"_id": 0}).sort("order", 1).to_list(100)
    print_list_stage = None
    
    if not fulfillment_stages:
        # Initialize default fulfillment stages if empty
        default_fulfill_stages = [
            {"stage_id": "fulfill_orders", "name": "In Production", "order": 0, "color": "#6366F1"},
            {"stage_id": "fulfill_print", "name": "Print List", "order": 1, "color": "#F59E0B"},
            {"stage_id": "fulfill_mount", "name": "Mount List", "order": 2, "color": "#EC4899"},
            {"stage_id": "fulfill_finish", "name": "Finish", "order": 3, "color": "#14B8A6"},
            {"stage_id": "fulfill_pack", "name": "Pack and Ship", "order": 4, "color": "#22C55E"},
        ]
        for stage in default_fulfill_stages:
            stage["created_at"] = datetime.now(timezone.utc).isoformat()
        await db.fulfillment_stages.insert_many(default_fulfill_stages)
        fulfillment_stages = default_fulfill_stages
    
    # Find "Print List" stage (fulfill_print) - this is where batched orders should go
    for stage in fulfillment_stages:
        if stage["stage_id"] == "fulfill_print":
            print_list_stage = stage
            break
    
    # Fallback to first stage if Print List not found (shouldn't happen)
    if not print_list_stage and fulfillment_stages:
        print_list_stage = fulfillment_stages[0]
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Update orders with batch info - items start in cutting stage
    update_data = {
        "batch_id": batch_id,
        "batch_name": batch_data.name,
        "status": "in_production",
        "current_stage_id": cutting_stage["stage_id"],
        "updated_at": now
    }
    
    # Assign orders to Print List stage in Order Fulfillment
    if print_list_stage:
        update_data["fulfillment_stage_id"] = print_list_stage["stage_id"]
        update_data["fulfillment_stage_name"] = print_list_stage["name"]
        update_data["fulfillment_updated_at"] = now
        update_data["fulfillment_updated_by"] = user.user_id
    
    # Create fulfillment batch for all batch types (card-based workflow)
    # - ShipStation/GB Decor: Use combined worksheet with qty tracking
    # - GB Home: Use batch card but show individual orders when selected
    fulfillment_batch_id = None
    if needs_fulfillment_batch:
        fulfillment_batch_id = f"fbatch_{uuid.uuid4().hex[:8]}"
        
        # Create fulfillment batch document
        fulfillment_batch_doc = {
            "fulfillment_batch_id": fulfillment_batch_id,
            "production_batch_id": batch_id,
            "name": batch_data.name,
            "order_ids": batch_data.order_ids,
            "order_count": len(batch_data.order_ids),
            "store_type": store_type,  # "shipstation", "gb_decor", "gb_home", etc.
            "is_enhanced_batch": is_enhanced_batch,  # True for combined worksheet, False for individual orders
            "store_id": primary_store_id,
            "store_name": primary_store_name,
            "current_stage_id": print_list_stage["stage_id"] if print_list_stage else "fulfill_print",
            "current_stage_name": print_list_stage["name"] if print_list_stage else "Print List",
            "assigned_to": None,
            "assigned_name": None,
            "status": "active",
            "time_started": None,
            "time_completed": None,
            "timer_active": False,
            "timer_started_at": None,
            "timer_paused": False,
            "accumulated_minutes": 0,
            "active_workers": [],
            "workers_time": {},
            "item_progress": {},
            "created_by": user.user_id,
            "created_by_name": user.name,
            "created_at": now,
            "updated_at": now
        }
        
        await db.fulfillment_batches.insert_one(fulfillment_batch_doc)
        
        # Add fulfillment batch reference to update_data
        update_data["fulfillment_batch_id"] = fulfillment_batch_id
        update_data["is_batch_fulfillment"] = True  # Flag for UI to show batch workflow
    
    # Update orders in fulfillment_orders collection
    await db.fulfillment_orders.update_many(
        {"order_id": {"$in": batch_data.order_ids}},
        {"$set": update_data}
    )
    
    # Log the fulfillment assignment for each order
    if print_list_stage:
        fulfillment_logs = []
        for order_id in batch_data.order_ids:
            fulfillment_logs.append({
                "log_id": f"flog_{uuid.uuid4().hex[:12]}",
                "order_id": order_id,
                "from_stage": None,
                "to_stage": print_list_stage["stage_id"],
                "to_stage_name": print_list_stage["name"],
                "user_id": user.user_id,
                "user_name": user.name,
                "action": "batch_created",
                "batch_id": batch_id,
                "fulfillment_batch_id": fulfillment_batch_id,
                "created_at": now
            })
        if fulfillment_logs:
            await db.fulfillment_logs.insert_many(fulfillment_logs)
    
    response_data = {**{k: v for k, v in batch_doc.items() if k != "_id"}, "items_count": len(frame_items)}
    if fulfillment_batch_id:
        response_data["fulfillment_batch_id"] = fulfillment_batch_id
    
    # Add auto-archive message if batch was archived due to no frames
    if auto_archived:
        response_data["auto_archived_message"] = "No frame items found - production batch archived. Orders moved to fulfillment."
    
    return response_data

@router.get("/{batch_id}/items-grouped")
async def get_batch_items_grouped(batch_id: str, user: User = Depends(get_current_user)):
    """Get batch frames grouped by color and size with subtotals"""
    frames = await db.batch_frames.find({"batch_id": batch_id}, {"_id": 0}).to_list(10000)
    
    grouped = {}
    for frame in frames:
        key = f"{frame['color']}-{frame['size']}"
        if key not in grouped:
            grouped[key] = {
                "color": frame["color"],
                "size": frame["size"],
                "items": [],
                "total_required": 0,
                "total_completed": 0
            }
        grouped[key]["items"].append(frame)
        grouped[key]["total_required"] += frame.get("qty_required", 1)
        grouped[key]["total_completed"] += frame.get("qty_completed", 0)
    
    result = list(grouped.values())
    result.sort(key=lambda x: (x["color"], x["size"]))
    
    return result

@router.get("/{batch_id}/stage-summary")
async def get_batch_stage_summary(batch_id: str, user: User = Depends(get_current_user)):
    """Get summary of frames by stage for a batch"""
    # Query the batch_frames collection (new frame-centric model)
    frames = await db.batch_frames.find({"batch_id": batch_id}, {"_id": 0}).to_list(10000)
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
    
    for frame in frames:
        stage_id = frame.get("current_stage_id", "stage_cutting")
        if stage_id in stage_summary:
            stage_summary[stage_id]["items"].append(frame)
            stage_summary[stage_id]["total_items"] += 1
            stage_summary[stage_id]["total_required"] += frame.get("qty_required", 1)
            stage_summary[stage_id]["total_completed"] += frame.get("qty_completed", 0)
    
    result = list(stage_summary.values())
    result.sort(key=lambda x: x["order"])
    
    return result

@router.get("/{batch_id}/stats")
async def get_batch_stats(batch_id: str, user: User = Depends(get_current_user)):
    """Get comprehensive batch statistics"""
    batch = await db.production_batches.find_one({"batch_id": batch_id}, {"_id": 0})
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    # Query batch_frames collection (new frame-centric model)
    frames = await db.batch_frames.find({"batch_id": batch_id}, {"_id": 0}).to_list(10000)
    time_logs = await db.time_logs.find({"completed_at": {"$ne": None}}, {"_id": 0}).to_list(10000)
    
    total_required = sum(frame.get("qty_required", 0) for frame in frames)
    total_completed = sum(frame.get("qty_completed", 0) for frame in frames)
    total_rejected = sum(frame.get("qty_rejected", 0) for frame in frames)
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

@router.get("/{batch_id}/frames")
async def get_batch_frames(
    batch_id: str, 
    stage_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get frames for a batch - the main production list. Optionally filter by stage."""
    batch = await db.production_batches.find_one({"batch_id": batch_id}, {"_id": 0})
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    # Get frames from batch_frames collection
    query = {"batch_id": batch_id}
    if stage_id:
        query["current_stage_id"] = stage_id
    
    frames = await db.batch_frames.find(query, {"_id": 0}).to_list(1000)
    
    # Size order for sorting
    SIZE_ORDER = ["S", "L", "XL", "HS", "HX", "XX", "XXX"]
    
    def get_size_index(size):
        try:
            return SIZE_ORDER.index(size)
        except ValueError:
            return len(SIZE_ORDER)
    
    # Sort frames by size order, then color
    frames.sort(key=lambda x: (get_size_index(x.get("size", "")), x.get("color", "")))
    
    # Group by size for subtotals
    size_groups = {}
    for frame in frames:
        size = frame.get("size", "UNK")
        if size not in size_groups:
            size_groups[size] = {
                "size": size,
                "frames": [],
                "subtotal_required": 0,
                "subtotal_completed": 0
            }
        size_groups[size]["frames"].append(frame)
        size_groups[size]["subtotal_required"] += frame.get("qty_required", 0)
        size_groups[size]["subtotal_completed"] += frame.get("qty_completed", 0)
    
    groups = list(size_groups.values())
    groups.sort(key=lambda x: get_size_index(x["size"]))
    
    # Calculate totals
    grand_total_required = sum(f.get("qty_required", 0) for f in frames)
    grand_total_completed = sum(f.get("qty_completed", 0) for f in frames)
    
    return {
        "batch_id": batch_id,
        "batch_name": batch.get("name", ""),
        "current_stage_id": batch.get("current_stage_id"),
        "size_groups": groups,
        "frames": frames,
        "grand_total_required": grand_total_required,
        "grand_total_completed": grand_total_completed
    }

@router.put("/{batch_id}/frames/{frame_id}")
async def update_frame(
    batch_id: str,
    frame_id: str,
    qty_completed: int = 0,
    qty_rejected: int = 0,
    user: User = Depends(get_current_user)
):
    """Update a frame's completed/rejected quantities"""
    frame = await db.batch_frames.find_one({"batch_id": batch_id, "frame_id": frame_id})
    if not frame:
        raise HTTPException(status_code=404, detail="Frame not found")
    
    now = datetime.now(timezone.utc).isoformat()
    
    update_data = {
        "qty_completed": qty_completed,
        "qty_rejected": qty_rejected,
        "updated_at": now,
        "updated_by": user.user_id
    }
    
    # Mark as complete if qty_completed >= qty_required
    if qty_completed >= frame.get("qty_required", 0):
        update_data["status"] = "completed"
    
    await db.batch_frames.update_one(
        {"frame_id": frame_id},
        {"$set": update_data}
    )
    
    return {"message": "Frame updated", "frame_id": frame_id, "qty_completed": qty_completed}


@router.delete("/{batch_id}/frames/{frame_id}")
async def delete_frame(
    batch_id: str,
    frame_id: str,
    user: User = Depends(get_current_user)
):
    """Delete a frame from a batch (only allowed in Cutting stage)"""
    frame = await db.batch_frames.find_one({"batch_id": batch_id, "frame_id": frame_id})
    if not frame:
        raise HTTPException(status_code=404, detail="Frame not found")
    
    # Only allow deletion from Cutting stage
    current_stage = frame.get("current_stage_id", "")
    if current_stage != "stage_cutting" and "cutting" not in current_stage.lower():
        raise HTTPException(status_code=400, detail="Frames can only be removed from the Cutting stage")
    
    # Delete the frame
    await db.batch_frames.delete_one({"frame_id": frame_id})
    
    # Log the deletion
    now = datetime.now(timezone.utc).isoformat()
    await db.production_logs.insert_one({
        "log_id": f"log_{uuid.uuid4().hex[:12]}",
        "frame_id": frame_id,
        "batch_id": batch_id,
        "action": "frame_deleted",
        "size": frame.get("size"),
        "color": frame.get("color"),
        "qty_required": frame.get("qty_required"),
        "deleted_by": user.user_id,
        "deleted_by_name": user.name,
        "created_at": now
    })
    
    return {
        "message": "Frame removed from batch",
        "frame_id": frame_id,
        "size": frame.get("size"),
        "color": frame.get("color")
    }


@router.post("/{batch_id}/frames/{frame_id}/move")
async def move_frame_to_next_stage(
    batch_id: str,
    frame_id: str,
    target_stage_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Move a frame to the next stage (or specified stage)"""
    frame = await db.batch_frames.find_one({"batch_id": batch_id, "frame_id": frame_id})
    if not frame:
        raise HTTPException(status_code=404, detail="Frame not found")
    
    current_stage_id = frame.get("current_stage_id")
    
    # Get stages in order
    stages = await db.production_stages.find({}, {"_id": 0}).sort("order", 1).to_list(100)
    stage_map = {s["stage_id"]: s for s in stages}
    
    # Find next stage
    if target_stage_id:
        next_stage = stage_map.get(target_stage_id)
    else:
        # Find next stage in order
        current_order = None
        for s in stages:
            if s["stage_id"] == current_stage_id:
                current_order = s.get("order", 0)
                break
        
        next_stage = None
        if current_order is not None:
            for s in stages:
                if s.get("order", 0) == current_order + 1:
                    next_stage = s
                    break
    
    if not next_stage:
        raise HTTPException(status_code=400, detail="No next stage available")
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Update frame - reset qty_completed and qty_rejected for new stage
    await db.batch_frames.update_one(
        {"frame_id": frame_id},
        {
            "$set": {
                "current_stage_id": next_stage["stage_id"],
                "current_stage_name": next_stage.get("name", ""),
                "qty_completed": 0,
                "qty_rejected": 0,
                "status": "pending",
                "stage_updated_at": now,
                "stage_updated_by": user.user_id,
                "updated_at": now
            }
        }
    )
    
    # Log the transition
    await db.production_logs.insert_one({
        "log_id": f"log_{uuid.uuid4().hex[:12]}",
        "frame_id": frame_id,
        "batch_id": batch_id,
        "from_stage": current_stage_id,
        "to_stage": next_stage["stage_id"],
        "to_stage_name": next_stage.get("name", ""),
        "size": frame.get("size"),
        "color": frame.get("color"),
        "qty": frame.get("qty_required"),
        "moved_by": user.user_id,
        "moved_by_name": user.name,
        "created_at": now
    })
    
    return {
        "message": f"Moved {frame.get('size')}-{frame.get('color')} to {next_stage.get('name')}",
        "frame_id": frame_id,
        "from_stage": current_stage_id,
        "to_stage": next_stage["stage_id"],
        "to_stage_name": next_stage.get("name", "")
    }

@router.post("/{batch_id}/frames/move-all")
async def move_all_completed_frames(
    batch_id: str,
    from_stage_id: str,
    user: User = Depends(get_current_user)
):
    """Move all completed frames from a stage to the next stage"""
    batch = await db.production_batches.find_one({"batch_id": batch_id})
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    # Get stages in order
    stages = await db.production_stages.find({}, {"_id": 0}).sort("order", 1).to_list(100)
    
    # Find next stage
    current_order = None
    for s in stages:
        if s["stage_id"] == from_stage_id:
            current_order = s.get("order", 0)
            break
    
    next_stage = None
    if current_order is not None:
        for s in stages:
            if s.get("order", 0) == current_order + 1:
                next_stage = s
                break
    
    if not next_stage:
        raise HTTPException(status_code=400, detail="No next stage available")
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Find frames that are completed in the current stage
    frames_to_move = await db.batch_frames.find({
        "batch_id": batch_id,
        "current_stage_id": from_stage_id,
        "$expr": {"$gte": ["$qty_completed", "$qty_required"]}
    }, {"_id": 0}).to_list(1000)
    
    moved_count = 0
    for frame in frames_to_move:
        await db.batch_frames.update_one(
            {"frame_id": frame["frame_id"]},
            {
                "$set": {
                    "current_stage_id": next_stage["stage_id"],
                    "current_stage_name": next_stage.get("name", ""),
                    "qty_completed": 0,  # Reset for next stage
                    "qty_rejected": 0,   # Reset rejected count for next stage
                    "status": "pending",
                    "stage_updated_at": now,
                    "updated_at": now
                }
            }
        )
        moved_count += 1
    
    return {
        "message": f"Moved {moved_count} frames to {next_stage.get('name')}",
        "moved_count": moved_count,
        "to_stage": next_stage["stage_id"],
        "to_stage_name": next_stage.get("name", "")
    }

# Keep old cut-list endpoint for backwards compatibility but redirect to frames
@router.get("/{batch_id}/cut-list")
async def get_cut_list(batch_id: str, user: User = Depends(get_current_user)):
    """Get cut list with progress for a batch - redirects to frames endpoint"""
    return await get_batch_frames(batch_id, None, user)

@router.put("/{batch_id}/cut-list/item")
async def update_cut_list_item(
    batch_id: str,
    size: str,
    color: str,
    qty_made: int = 0,
    completed: bool = False,
    user: User = Depends(get_current_user)
):
    """Update a frame's completed quantity - maps to batch_frames"""
    # Find the frame by size/color
    frame = await db.batch_frames.find_one({
        "batch_id": batch_id,
        "size": {"$regex": f"^{size}$", "$options": "i"},
        "color": {"$regex": f"^{color}$", "$options": "i"}
    })
    
    if not frame:
        raise HTTPException(status_code=404, detail=f"Frame {size}-{color} not found")
    
    now = datetime.now(timezone.utc).isoformat()
    
    update_data = {
        "qty_completed": qty_made,
        "updated_at": now,
        "updated_by": user.user_id
    }
    
    if completed or qty_made >= frame.get("qty_required", 0):
        update_data["status"] = "completed"
    
    await db.batch_frames.update_one(
        {"frame_id": frame["frame_id"]},
        {"$set": update_data}
    )
    
    return {
        "message": "Frame updated",
        "frame_id": frame["frame_id"],
        "size": size,
        "color": color,
        "qty_completed": qty_made
    }


@router.post("/{batch_id}/frames/{frame_id}/to-inventory")
async def move_frame_to_inventory(
    batch_id: str,
    frame_id: str,
    user: User = Depends(get_current_user)
):
    """Move a completed frame from Quality Check to inventory
    
    - Adds good frames (qty_completed - qty_rejected) to inventory
    - Adds rejected frames to rejected inventory
    - Removes the frame from the batch
    """
    frame = await db.batch_frames.find_one({"batch_id": batch_id, "frame_id": frame_id})
    if not frame:
        raise HTTPException(status_code=404, detail="Frame not found")
    
    qty_completed = frame.get("qty_completed", 0)
    qty_rejected = frame.get("qty_rejected", 0)
    qty_good = max(0, qty_completed - qty_rejected)
    
    if qty_completed == 0:
        raise HTTPException(status_code=400, detail="No completed items to move to inventory")
    
    size = frame.get("size", "UNK")
    color = frame.get("color", "UNK")
    now = datetime.now(timezone.utc).isoformat()
    
    # Create SKU for inventory
    sku = f"FRAME-{size}-{color}"
    sku_match_key = f"{size}-{color}"
    
    result = {
        "frame_id": frame_id,
        "size": size,
        "color": color,
        "good_added": 0,
        "rejected_added": 0
    }
    
    # Add good frames to inventory
    if qty_good > 0:
        existing_good = await db.inventory.find_one({
            "sku_match_key": sku_match_key,
            "is_rejected": {"$ne": True}
        })
        
        if existing_good:
            await db.inventory.update_one(
                {"item_id": existing_good["item_id"]},
                {"$inc": {"quantity": qty_good}, "$set": {"updated_at": now}}
            )
        else:
            good_item = {
                "item_id": f"inv_{uuid.uuid4().hex[:8]}",
                "sku": sku,
                "sku_match_key": sku_match_key,
                "name": f"Frame {size} - {color}",
                "color": color,
                "size": size,
                "quantity": qty_good,
                "min_stock": 10,
                "location": "Production",
                "is_rejected": False,
                "created_at": now,
                "updated_at": now
            }
            await db.inventory.insert_one(good_item)
        
        result["good_added"] = qty_good
    
    # Add rejected frames to rejected inventory
    if qty_rejected > 0:
        existing_rejected = await db.inventory.find_one({
            "sku_match_key": sku_match_key,
            "is_rejected": True
        })
        
        if existing_rejected:
            await db.inventory.update_one(
                {"item_id": existing_rejected["item_id"]},
                {"$inc": {"quantity": qty_rejected}, "$set": {"updated_at": now}}
            )
        else:
            rejected_item = {
                "item_id": f"inv_{uuid.uuid4().hex[:8]}",
                "sku": f"{sku}-REJECTED",
                "sku_match_key": sku_match_key,
                "name": f"Frame {size} - {color} (REJECTED)",
                "color": color,
                "size": size,
                "quantity": qty_rejected,
                "min_stock": 0,
                "location": "Rejected Bin",
                "is_rejected": True,
                "created_at": now,
                "updated_at": now
            }
            await db.inventory.insert_one(rejected_item)
        
        result["rejected_added"] = qty_rejected
    
    # Remove frame from batch_frames
    await db.batch_frames.delete_one({"frame_id": frame_id})
    
    # Log the inventory transfer
    await db.production_logs.insert_one({
        "log_id": f"log_{uuid.uuid4().hex[:12]}",
        "frame_id": frame_id,
        "batch_id": batch_id,
        "action": "moved_to_inventory",
        "size": size,
        "color": color,
        "qty_good": qty_good,
        "qty_rejected": qty_rejected,
        "moved_by": user.user_id,
        "moved_by_name": user.name,
        "created_at": now
    })
    
    # Check if batch is now empty and should be auto-archived
    batch_archived = False
    remaining_frames = await db.batch_frames.count_documents({"batch_id": batch_id})
    if remaining_frames == 0:
        # Auto-archive the batch
        await db.production_batches.update_one(
            {"batch_id": batch_id},
            {"$set": {
                "status": "archived",
                "archived_at": now,
                "archived_by": user.user_id,
                "auto_archived": True,
                "auto_archive_reason": "all_frames_sent_to_inventory"
            }}
        )
        batch_archived = True
    
    return {
        "message": f"Moved {size}-{color} to inventory: {qty_good} good, {qty_rejected} rejected",
        "batch_archived": batch_archived,
        **result
    }


@router.post("/{batch_id}/frames/all-to-inventory")
async def move_all_frames_to_inventory(
    batch_id: str,
    user: User = Depends(get_current_user)
):
    """Move all completed frames from Quality Check stage to inventory"""
    batch = await db.production_batches.find_one({"batch_id": batch_id})
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    # Find Quality Check stage
    qc_stage = await db.production_stages.find_one({
        "$or": [
            {"stage_id": "stage_ready"},
            {"name": {"$regex": "quality", "$options": "i"}}
        ]
    })
    
    if not qc_stage:
        raise HTTPException(status_code=400, detail="Quality Check stage not found")
    
    # Get all frames in Quality Check stage that have completed items
    frames = await db.batch_frames.find({
        "batch_id": batch_id,
        "current_stage_id": qc_stage["stage_id"],
        "qty_completed": {"$gt": 0}
    }, {"_id": 0}).to_list(1000)
    
    if not frames:
        return {"message": "No completed frames to move", "moved_count": 0}
    
    now = datetime.now(timezone.utc).isoformat()
    total_good = 0
    total_rejected = 0
    moved_count = 0
    
    for frame in frames:
        qty_completed = frame.get("qty_completed", 0)
        qty_rejected = frame.get("qty_rejected", 0)
        qty_good = max(0, qty_completed - qty_rejected)
        
        size = frame.get("size", "UNK")
        color = frame.get("color", "UNK")
        sku = f"FRAME-{size}-{color}"
        sku_match_key = f"{size}-{color}"
        
        # Add good frames
        if qty_good > 0:
            existing_good = await db.inventory.find_one({
                "sku_match_key": sku_match_key,
                "is_rejected": {"$ne": True}
            })
            
            if existing_good:
                await db.inventory.update_one(
                    {"item_id": existing_good["item_id"]},
                    {"$inc": {"quantity": qty_good}, "$set": {"updated_at": now}}
                )
            else:
                await db.inventory.insert_one({
                    "item_id": f"inv_{uuid.uuid4().hex[:8]}",
                    "sku": sku,
                    "sku_match_key": sku_match_key,
                    "name": f"Frame {size} - {color}",
                    "color": color,
                    "size": size,
                    "quantity": qty_good,
                    "min_stock": 10,
                    "location": "Production",
                    "is_rejected": False,
                    "created_at": now,
                    "updated_at": now
                })
            total_good += qty_good
        
        # Add rejected frames
        if qty_rejected > 0:
            existing_rejected = await db.inventory.find_one({
                "sku_match_key": sku_match_key,
                "is_rejected": True
            })
            
            if existing_rejected:
                await db.inventory.update_one(
                    {"item_id": existing_rejected["item_id"]},
                    {"$inc": {"quantity": qty_rejected}, "$set": {"updated_at": now}}
                )
            else:
                await db.inventory.insert_one({
                    "item_id": f"inv_{uuid.uuid4().hex[:8]}",
                    "sku": f"{sku}-REJECTED",
                    "sku_match_key": sku_match_key,
                    "name": f"Frame {size} - {color} (REJECTED)",
                    "color": color,
                    "size": size,
                    "quantity": qty_rejected,
                    "min_stock": 0,
                    "location": "Rejected Bin",
                    "is_rejected": True,
                    "created_at": now,
                    "updated_at": now
                })
            total_rejected += qty_rejected
        
        # Remove frame from batch
        await db.batch_frames.delete_one({"frame_id": frame["frame_id"]})
        moved_count += 1
    
    # Log the bulk transfer
    await db.production_logs.insert_one({
        "log_id": f"log_{uuid.uuid4().hex[:12]}",
        "batch_id": batch_id,
        "action": "bulk_moved_to_inventory",
        "frames_moved": moved_count,
        "total_good": total_good,
        "total_rejected": total_rejected,
        "moved_by": user.user_id,
        "moved_by_name": user.name,
        "created_at": now
    })
    
    # Check if batch is now empty and should be auto-archived
    batch_archived = False
    remaining_frames = await db.batch_frames.count_documents({"batch_id": batch_id})
    if remaining_frames == 0:
        # Auto-archive the batch
        await db.production_batches.update_one(
            {"batch_id": batch_id},
            {"$set": {
                "status": "archived",
                "archived_at": now,
                "archived_by": user.user_id,
                "auto_archived": True,
                "auto_archive_reason": "all_frames_sent_to_inventory"
            }}
        )
        batch_archived = True
    
    return {
        "message": f"Moved {moved_count} frames to inventory: {total_good} good, {total_rejected} rejected",
        "moved_count": moved_count,
        "total_good": total_good,
        "total_rejected": total_rejected,
        "batch_archived": batch_archived
    }

