from fastapi import APIRouter, HTTPException, Depends
from typing import Optional, List
from datetime import datetime, timezone
import uuid

from database import db
from models.user import User
from dependencies import get_current_user

router = APIRouter(prefix="/fulfillment", tags=["fulfillment"])

# Default fulfillment stages
DEFAULT_FULFILLMENT_STAGES = [
    {"stage_id": "fulfill_orders", "name": "In Production", "order": 0, "color": "#6366F1"},  # Indigo
    {"stage_id": "fulfill_print", "name": "Print List", "order": 1, "color": "#F59E0B"},  # Amber
    {"stage_id": "fulfill_mount", "name": "Mount List", "order": 2, "color": "#EC4899"},  # Pink
    {"stage_id": "fulfill_finish", "name": "Finish", "order": 3, "color": "#14B8A6"},  # Teal
    {"stage_id": "fulfill_pack", "name": "Pack and Ship", "order": 4, "color": "#22C55E"},  # Green
]

# Helper function to parse SKU and get match key
def get_sku_match_key(sku: str) -> str:
    """Extract color-size key from SKU for inventory matching"""
    if not sku:
        return "UNK-UNK"
    
    size_codes = ['XXX', 'XX', 'XL', 'HS', 'HX', 'S', 'L']
    parts = sku.replace('_', '-').replace('.', '-').split('-')
    parts = [p.strip().upper() for p in parts if p.strip()]
    
    color = "UNK"
    size = "UNK"
    
    if len(parts) >= 2:
        last_part = parts[-1]
        for size_code in size_codes:
            if last_part == size_code or last_part.endswith(size_code):
                size = size_code
                break
        
        if len(parts) >= 2:
            second_last = parts[-2] if size != "UNK" else parts[-1]
            if len(second_last) <= 3 and second_last.isalpha():
                color = second_last
    
    return f"{color}-{size}"


# Size sort order: S, L, XL, HS, HX, XX, XXX
SIZE_SORT_ORDER = {
    'S': 0,
    'L': 1,
    'XL': 2,
    'HS': 3,
    'HX': 4,
    'XX': 5,
    'XXX': 6
}


def get_size_sort_key(size_str: str) -> tuple:
    """
    Get sort key for size. Returns (priority, alphabetical_fallback)
    Known sizes get priority 0-6, unknown sizes get priority 99 and sort alphabetically
    """
    size_upper = size_str.upper().strip()
    if size_upper in SIZE_SORT_ORDER:
        return (SIZE_SORT_ORDER[size_upper], "")
    else:
        return (99, size_upper)  # Fallback to alphabetical


def parse_sku_for_sorting(sku: str) -> tuple:
    """
    Parse SKU and return sort key based on SIZE (second-to-last group).
    Sort order: S, L, XL, HS, HX, XX, XXX, then alphabetically for others.
    """
    if not sku:
        return (99, "ZZZ", "ZZZ")
    
    parts = sku.replace('_', '-').replace('.', '-').split('-')
    parts = [p.strip().upper() for p in parts if p.strip()]
    
    # Get the second-to-last part (SIZE)
    if len(parts) >= 2:
        size_part = parts[-2]
    elif len(parts) == 1:
        size_part = parts[0]
    else:
        size_part = "ZZZ"
    
    # Get size sort priority
    size_priority, size_alpha = get_size_sort_key(size_part)
    
    # Also include full SKU for secondary sorting within same size
    return (size_priority, size_alpha, sku.upper())


def get_item_group_key(item: dict) -> str:
    """Create a grouping key for identical items (SKU + size combination)"""
    sku = item.get("sku", "UNKNOWN")
    name = item.get("name", "Unknown")
    return f"{sku}||{name}"


async def check_inventory_for_order(order: dict) -> dict:
    """Check inventory availability for all items in an order"""
    items = order.get("items", []) or order.get("line_items", [])
    
    availability = {
        "order_id": order.get("order_id"),
        "items": [],
        "all_in_stock": True,
        "partial_stock": False,
        "out_of_stock_count": 0,
        "low_stock_items": []
    }
    
    for item in items:
        sku = item.get("sku", "UNKNOWN")
        qty_needed = item.get("qty", 1) or item.get("quantity", 1)
        match_key = get_sku_match_key(sku)
        
        # Find matching inventory (not rejected)
        inv_item = await db.inventory.find_one({
            "$or": [
                {"sku": sku, "is_rejected": {"$ne": True}},
                {"sku_match_key": match_key, "is_rejected": {"$ne": True}},
                {"color": match_key.split("-")[0], "size": match_key.split("-")[1], "is_rejected": {"$ne": True}}
            ]
        }, {"_id": 0})
        
        stock_qty = inv_item.get("quantity", 0) if inv_item else 0
        in_stock = stock_qty >= qty_needed
        
        item_availability = {
            "sku": sku,
            "name": item.get("name", "Unknown"),
            "qty_needed": qty_needed,
            "qty_available": stock_qty,
            "in_stock": in_stock,
            "inventory_item_id": inv_item.get("item_id") if inv_item else None,
            "match_key": match_key
        }
        
        availability["items"].append(item_availability)
        
        if not in_stock:
            availability["all_in_stock"] = False
            availability["out_of_stock_count"] += 1
            if stock_qty > 0:
                availability["partial_stock"] = True
                availability["low_stock_items"].append({
                    "sku": sku,
                    "needed": qty_needed,
                    "available": stock_qty,
                    "shortage": qty_needed - stock_qty
                })
    
    return availability


async def deduct_inventory_for_order(order: dict, user: User) -> dict:
    """Deduct inventory items for an order and create allocation records
    
    Checks both 'inventory' and 'frame_inventory' collections for matching items.
    Logs all frame_inventory deductions to frame_inventory_log collection.
    """
    items = order.get("items", []) or order.get("line_items", [])
    order_id = order.get("order_id")
    order_number = order.get("order_number", order_id)
    now = datetime.now(timezone.utc).isoformat()
    
    deductions = []
    allocations = []
    errors = []
    frame_inventory_logs = []  # Track frame inventory deductions
    
    for item in items:
        sku = item.get("sku", "UNKNOWN")
        qty_needed = item.get("qty", 1) or item.get("quantity", 1)
        match_key = get_sku_match_key(sku)
        
        # Parse color and size from match_key
        parts = match_key.split("-")
        color = parts[0] if len(parts) > 0 else ""
        size = parts[1] if len(parts) > 1 else ""
        
        inv_item = None
        inv_collection = "inventory"
        
        # First, try to find in main inventory collection
        inv_item = await db.inventory.find_one({
            "$or": [
                {"sku": sku, "is_rejected": {"$ne": True}},
                {"sku_match_key": match_key, "is_rejected": {"$ne": True}},
                {"color": color, "size": size, "is_rejected": {"$ne": True}}
            ],
            "quantity": {"$gt": 0}
        }, {"_id": 0})
        
        # If not found in inventory, check frame_inventory (from on-demand production)
        if not inv_item:
            inv_item = await db.frame_inventory.find_one({
                "$or": [
                    {"sku": sku},
                    {"color": color, "size": size}
                ],
                "quantity": {"$gt": 0}
            }, {"_id": 0})
            if inv_item:
                inv_collection = "frame_inventory"
        
        if not inv_item:
            errors.append({"sku": sku, "error": "No matching inventory found"})
            continue
        
        # Get the item ID field (different field names in different collections)
        item_id_field = "inventory_id" if inv_collection == "frame_inventory" else "item_id"
        item_id = inv_item.get(item_id_field) or inv_item.get("item_id") or inv_item.get("inventory_id")
        
        current_qty = inv_item.get("quantity", 0)
        actual_deduct = min(qty_needed, current_qty)
        
        if actual_deduct > 0:
            # Deduct from inventory
            new_qty = current_qty - actual_deduct
            await db[inv_collection].update_one(
                {item_id_field: item_id},
                {"$set": {"quantity": new_qty, "updated_at": now}}
            )
            
            deductions.append({
                "sku": sku,
                "inventory_item_id": item_id,
                "inventory_collection": inv_collection,
                "qty_deducted": actual_deduct,
                "new_quantity": new_qty
            })
            
            # Create allocation record
            allocation = {
                "allocation_id": f"alloc_{uuid.uuid4().hex[:12]}",
                "order_id": order_id,
                "inventory_item_id": item_id,
                "inventory_collection": inv_collection,
                "inventory_sku": inv_item.get("sku"),
                "order_item_sku": sku,
                "quantity_allocated": actual_deduct,
                "allocated_by": user.user_id,
                "allocated_by_name": user.name,
                "created_at": now
            }
            allocations.append(allocation)
            
            # Log frame inventory deductions specifically
            if inv_collection == "frame_inventory":
                frame_inventory_logs.append({
                    "log_id": f"finvlog_{uuid.uuid4().hex[:12]}",
                    "inventory_id": item_id,
                    "order_id": order_id,
                    "order_number": order_number,
                    "sku": sku,
                    "color": inv_item.get("color", color),
                    "size": inv_item.get("size", size),
                    "quantity_before": current_qty,
                    "quantity_deducted": actual_deduct,
                    "quantity_after": new_qty,
                    "action": "order_fulfillment",
                    "deducted_by": user.user_id,
                    "deducted_by_name": user.name,
                    "deducted_at": now,
                    "created_at": now
                })
        
        if actual_deduct < qty_needed:
            errors.append({
                "sku": sku,
                "error": f"Insufficient stock. Needed {qty_needed}, had {current_qty}, deducted {actual_deduct}"
            })
    
    # Save allocations
    if allocations:
        await db.inventory_allocations.insert_many(allocations)
    
    # Save frame inventory deduction logs
    if frame_inventory_logs:
        await db.frame_inventory_log.insert_many(frame_inventory_logs)
    
    return {
        "order_id": order_id,
        "deductions": deductions,
        "allocations_created": len(allocations),
        "frame_inventory_deductions": len(frame_inventory_logs),
        "errors": errors
    }


@router.get("/stages")
async def get_fulfillment_stages(user: User = Depends(get_current_user)):
    """Get all fulfillment stages"""
    stages = await db.fulfillment_stages.find({}, {"_id": 0}).sort("order", 1).to_list(100)
    
    if not stages:
        for stage in DEFAULT_FULFILLMENT_STAGES:
            stage["created_at"] = datetime.now(timezone.utc).isoformat()
        await db.fulfillment_stages.insert_many(DEFAULT_FULFILLMENT_STAGES)
        stages = DEFAULT_FULFILLMENT_STAGES
    else:
        # Update stage name if it's the old "Orders" name
        for stage in stages:
            if stage["stage_id"] == "fulfill_orders" and stage.get("name") == "Orders":
                await db.fulfillment_stages.update_one(
                    {"stage_id": "fulfill_orders"},
                    {"$set": {"name": "In Production"}}
                )
                stage["name"] = "In Production"
    
    return stages


@router.post("/stages/cleanup-unbatched")
async def cleanup_unbatched_orders(user: User = Depends(get_current_user)):
    """Remove orders without a batch from fulfillment stages
    
    Orders should only appear in fulfillment when sent via 'Send to Production'
    """
    if user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Find and clear fulfillment_stage_id for orders without a batch_id
    result = await db.fulfillment_orders.update_many(
        {
            "fulfillment_stage_id": {"$exists": True, "$ne": None},
            "$or": [
                {"batch_id": {"$exists": False}},
                {"batch_id": None}
            ]
        },
        {
            "$unset": {
                "fulfillment_stage_id": "",
                "fulfillment_stage_name": ""
            }
        }
    )
    
    return {
        "message": f"Cleared {result.modified_count} orders without batches from fulfillment",
        "cleared_count": result.modified_count
    }


@router.get("/stages/{stage_id}/items-consolidated")
async def get_stage_items_consolidated(
    stage_id: str,
    user: User = Depends(get_current_user)
):
    """
    Get all items from orders in a stage, expanded, sorted by SKU components,
    and grouped with subtotals for identical items.
    
    Sort order: 2nd SKU group (color) -> 3rd group (number) -> 4th group (size) -> 2nd-to-last letters
    """
    orders = await db.fulfillment_orders.find(
        {"fulfillment_stage_id": stage_id},
        {"_id": 0}
    ).to_list(1000)
    
    # Expand all items from all orders
    all_items = []
    for order in orders:
        items = order.get("items", []) or order.get("line_items", [])
        for item in items:
            qty = item.get("qty", 1) or item.get("quantity", 1)
            all_items.append({
                "order_id": order.get("order_id"),
                "order_number": order.get("order_number", order.get("order_id", "")[-8:]),
                "customer_name": order.get("customer_name", "N/A"),
                "sku": item.get("sku", "UNKNOWN"),
                "name": item.get("name", "Unknown Item"),
                "quantity": qty,
                "sort_key": parse_sku_for_sorting(item.get("sku", "")),
                "group_key": get_item_group_key(item)
            })
    
    # Sort items by SKU components
    all_items.sort(key=lambda x: x["sort_key"])
    
    # Group identical items and calculate subtotals
    grouped_items = {}
    for item in all_items:
        key = item["group_key"]
        if key not in grouped_items:
            grouped_items[key] = {
                "sku": item["sku"],
                "name": item["name"],
                "total_quantity": 0,
                "orders": [],
                "sort_key": item["sort_key"]
            }
        grouped_items[key]["total_quantity"] += item["quantity"]
        grouped_items[key]["orders"].append({
            "order_id": item["order_id"],
            "order_number": item["order_number"],
            "customer_name": item["customer_name"],
            "quantity": item["quantity"]
        })
    
    # Convert to list and sort
    grouped_list = list(grouped_items.values())
    grouped_list.sort(key=lambda x: x["sort_key"])
    
    # Remove sort_key from response
    for item in grouped_list:
        del item["sort_key"]
    
    # Also return individual items sorted (for detailed view)
    for item in all_items:
        del item["sort_key"]
        del item["group_key"]
    
    return {
        "stage_id": stage_id,
        "total_orders": len(orders),
        "total_unique_items": len(grouped_list),
        "total_item_count": sum(g["total_quantity"] for g in grouped_list),
        "grouped_items": grouped_list,
        "all_items_sorted": all_items
    }


@router.get("/orders")
async def get_fulfillment_orders(
    status: Optional[str] = None,
    stage_id: Optional[str] = None,
    unassigned: bool = False,
    user: User = Depends(get_current_user)
):
    """Get orders for fulfillment with optional filtering"""
    query = {}
    if unassigned:
        query["$or"] = [
            {"fulfillment_stage_id": {"$exists": False}},
            {"fulfillment_stage_id": None}
        ]
    elif stage_id:
        query["fulfillment_stage_id"] = stage_id
    if status:
        query["fulfillment_status"] = status
    
    orders = await db.fulfillment_orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return orders


@router.get("/orders/{order_id}/inventory-status")
async def get_order_inventory_status(
    order_id: str,
    user: User = Depends(get_current_user)
):
    """Check inventory availability for a specific order"""
    order = await db.fulfillment_orders.find_one({"order_id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    return await check_inventory_for_order(order)


@router.put("/orders/{order_id}/worksheet")
async def save_worksheet_progress(
    order_id: str,
    data: dict,
    user: User = Depends(get_current_user)
):
    """Save worksheet progress for an order (qty_done, is_complete for each item)"""
    order = await db.fulfillment_orders.find_one({"order_id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    items = order.get("items", []) or order.get("line_items", [])
    worksheet_items = data.get("items", [])
    
    # Update items with worksheet progress
    for ws_item in worksheet_items:
        idx = ws_item.get("item_index", -1)
        if 0 <= idx < len(items):
            items[idx]["qty_done"] = ws_item.get("qty_done", 0)
            items[idx]["is_complete"] = ws_item.get("is_complete", False)
    
    # Check if all items are complete
    all_complete = all(item.get("is_complete", False) for item in items) if items else False
    
    now = datetime.now(timezone.utc).isoformat()
    
    await db.fulfillment_orders.update_one(
        {"order_id": order_id},
        {"$set": {
            "items": items,
            "worksheet_updated_at": now,
            "worksheet_updated_by": user.user_id,
            "all_items_complete": all_complete
        }}
    )
    
    return {
        "message": "Worksheet saved",
        "all_complete": all_complete,
        "items_complete": sum(1 for i in items if i.get("is_complete", False)),
        "total_items": len(items)
    }


@router.get("/stages/{stage_id}/orders")
async def get_orders_by_stage(
    stage_id: str,
    include_inventory_status: bool = False,
    page: int = 1,
    page_size: int = 50,
    user: User = Depends(get_current_user)
):
    """Get orders in a specific fulfillment stage with pagination"""
    skip = (page - 1) * page_size
    
    # Get total count for pagination
    total = await db.fulfillment_orders.count_documents({"fulfillment_stage_id": stage_id})
    
    orders = await db.fulfillment_orders.find(
        {"fulfillment_stage_id": stage_id},
        {"_id": 0}
    ).sort("created_at", -1).skip(skip).limit(page_size).to_list(page_size)
    
    # Only check inventory if explicitly requested (expensive operation)
    if include_inventory_status:
        for order in orders:
            inv_status = await check_inventory_for_order(order)
            order["inventory_status"] = {
                "all_in_stock": inv_status["all_in_stock"],
                "partial_stock": inv_status["partial_stock"],
                "out_of_stock_count": inv_status["out_of_stock_count"],
                "items": inv_status["items"]
            }
    
    return {
        "orders": orders,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": (total + page_size - 1) // page_size
        }
    }


@router.post("/orders/{order_id}/assign-stage")
async def assign_order_to_stage(
    order_id: str,
    stage_id: str,
    user: User = Depends(get_current_user)
):
    """Assign an order to a fulfillment stage"""
    order = await db.fulfillment_orders.find_one({"order_id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    stage = await db.fulfillment_stages.find_one({"stage_id": stage_id})
    if not stage:
        raise HTTPException(status_code=404, detail="Stage not found")
    
    now = datetime.now(timezone.utc).isoformat()
    
    # If moving to Pack and Ship, auto-deduct inventory
    deduction_result = None
    if stage_id == "fulfill_pack":
        deduction_result = await deduct_inventory_for_order(order, user)
    
    # Reset worksheet progress for items when moving to new stage
    items = order.get("items", []) or order.get("line_items", [])
    for item in items:
        item["qty_done"] = 0
        item["is_complete"] = False
    
    await db.fulfillment_orders.update_one(
        {"order_id": order_id},
        {"$set": {
            "fulfillment_stage_id": stage_id,
            "fulfillment_stage_name": stage["name"],
            "fulfillment_updated_at": now,
            "fulfillment_updated_by": user.user_id,
            "inventory_deducted": stage_id == "fulfill_pack",
            "items": items,
            "all_items_complete": False
        }}
    )
    
    # Log the stage change
    await db.fulfillment_logs.insert_one({
        "log_id": f"flog_{uuid.uuid4().hex[:12]}",
        "order_id": order_id,
        "from_stage": order.get("fulfillment_stage_id"),
        "to_stage": stage_id,
        "to_stage_name": stage["name"],
        "user_id": user.user_id,
        "user_name": user.name,
        "inventory_deducted": stage_id == "fulfill_pack",
        "created_at": now
    })
    
    result = {"message": f"Order moved to {stage['name']}", "stage_id": stage_id}
    if deduction_result:
        result["inventory_deduction"] = deduction_result
    
    return result


@router.post("/orders/{order_id}/move-next")
async def move_order_to_next_stage(
    order_id: str,
    user: User = Depends(get_current_user)
):
    """Move an order to the next fulfillment stage"""
    order = await db.fulfillment_orders.find_one({"order_id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    current_stage_id = order.get("fulfillment_stage_id", "fulfill_orders")
    
    stages = await db.fulfillment_stages.find({}, {"_id": 0}).sort("order", 1).to_list(100)
    if not stages:
        raise HTTPException(status_code=400, detail="No fulfillment stages configured")
    
    current_idx = 0
    for i, s in enumerate(stages):
        if s["stage_id"] == current_stage_id:
            current_idx = i
            break
    
    if current_idx >= len(stages) - 1:
        raise HTTPException(status_code=400, detail="Order is already at the final stage")
    
    next_stage = stages[current_idx + 1]
    now = datetime.now(timezone.utc).isoformat()
    
    # If moving to Pack and Ship, check and deduct inventory
    deduction_result = None
    if next_stage["stage_id"] == "fulfill_pack":
        # Check inventory first
        inv_status = await check_inventory_for_order(order)
        if not inv_status["all_in_stock"]:
            # Still allow move but with warning
            pass
        deduction_result = await deduct_inventory_for_order(order, user)
    
    # Reset worksheet progress for items when moving to new stage
    items = order.get("items", []) or order.get("line_items", [])
    for item in items:
        item["qty_done"] = 0
        item["is_complete"] = False
    
    await db.fulfillment_orders.update_one(
        {"order_id": order_id},
        {"$set": {
            "fulfillment_stage_id": next_stage["stage_id"],
            "fulfillment_stage_name": next_stage["name"],
            "fulfillment_updated_at": now,
            "fulfillment_updated_by": user.user_id,
            "inventory_deducted": next_stage["stage_id"] == "fulfill_pack",
            "items": items,
            "all_items_complete": False
        }}
    )
    
    # Log the change
    await db.fulfillment_logs.insert_one({
        "log_id": f"flog_{uuid.uuid4().hex[:12]}",
        "order_id": order_id,
        "from_stage": current_stage_id,
        "to_stage": next_stage["stage_id"],
        "to_stage_name": next_stage["name"],
        "user_id": user.user_id,
        "user_name": user.name,
        "inventory_deducted": next_stage["stage_id"] == "fulfill_pack",
        "created_at": now
    })
    
    result = {"message": f"Order moved to {next_stage['name']}", "stage": next_stage}
    if deduction_result:
        result["inventory_deduction"] = deduction_result
    
    return result


@router.post("/orders/bulk-move")
async def bulk_move_orders(
    order_ids: list,
    target_stage_id: str,
    user: User = Depends(get_current_user)
):
    """Move multiple orders to a specific stage"""
    stage = await db.fulfillment_stages.find_one({"stage_id": target_stage_id})
    if not stage:
        raise HTTPException(status_code=404, detail="Stage not found")
    
    now = datetime.now(timezone.utc).isoformat()
    deduction_results = []
    
    # If moving to Pack and Ship, deduct inventory for each order
    if target_stage_id == "fulfill_pack":
        for oid in order_ids:
            order = await db.fulfillment_orders.find_one({"order_id": oid}, {"_id": 0})
            if order and not order.get("inventory_deducted"):
                result = await deduct_inventory_for_order(order, user)
                deduction_results.append(result)
    
    # Reset worksheet progress for each order when moving to new stage
    for oid in order_ids:
        order = await db.fulfillment_orders.find_one({"order_id": oid})
        if order:
            items = order.get("items", []) or order.get("line_items", [])
            for item in items:
                item["qty_done"] = 0
                item["is_complete"] = False
            
            await db.fulfillment_orders.update_one(
                {"order_id": oid},
                {"$set": {
                    "fulfillment_stage_id": target_stage_id,
                    "fulfillment_stage_name": stage["name"],
                    "fulfillment_updated_at": now,
                    "fulfillment_updated_by": user.user_id,
                    "inventory_deducted": target_stage_id == "fulfill_pack",
                    "items": items,
                    "all_items_complete": False
                }}
            )
    
    # Log bulk move
    await db.fulfillment_logs.insert_one({
        "log_id": f"flog_{uuid.uuid4().hex[:12]}",
        "action": "bulk_move",
        "order_ids": order_ids,
        "to_stage": target_stage_id,
        "to_stage_name": stage["name"],
        "user_id": user.user_id,
        "user_name": user.name,
        "count": len(order_ids),
        "inventory_deducted": target_stage_id == "fulfill_pack",
        "created_at": now
    })
    
    response = {
        "message": f"Moved {len(order_ids)} orders to {stage['name']}",
        "modified_count": len(order_ids)
    }
    
    if deduction_results:
        response["inventory_deductions"] = deduction_results
    
    return response


@router.get("/stages/{stage_id}/count")
async def get_stage_order_count(
    stage_id: str,
    user: User = Depends(get_current_user)
):
    """Get count of orders in a stage"""
    count = await db.fulfillment_orders.count_documents({"fulfillment_stage_id": stage_id})
    return {"stage_id": stage_id, "count": count}


@router.get("/summary")
async def get_fulfillment_summary(user: User = Depends(get_current_user)):
    """Get summary of orders across all fulfillment stages (optimized)"""
    stages = await db.fulfillment_stages.find({}, {"_id": 0}).sort("order", 1).to_list(100)
    
    summary = []
    
    # Use aggregation for faster counting
    for stage in stages:
        count = await db.fulfillment_orders.count_documents({"fulfillment_stage_id": stage["stage_id"]})
        
        summary.append({
            "stage_id": stage["stage_id"],
            "stage_name": stage["name"],
            "color": stage.get("color", "#6366F1"),
            "order": stage["order"],
            "count": count,
            "out_of_stock_count": 0  # Skip expensive inventory check for summary
        })
    
    unassigned = await db.fulfillment_orders.count_documents({
        "$or": [
            {"fulfillment_stage_id": {"$exists": False}},
            {"fulfillment_stage_id": None}
        ]
    })
    
    total = await db.fulfillment_orders.count_documents({})
    
    return {
        "stages": summary,
        "unassigned_count": unassigned,
        "total_orders": total,
        "total_out_of_stock": 0  # Use /inventory-alerts endpoint for this
    }


@router.get("/inventory-alerts")
async def get_inventory_alerts(user: User = Depends(get_current_user)):
    """Get list of orders with insufficient inventory"""
    orders = await db.fulfillment_orders.find(
        {"fulfillment_stage_id": {"$exists": True, "$ne": None}},
        {"_id": 0}
    ).to_list(1000)
    
    alerts = []
    
    for order in orders:
        inv_status = await check_inventory_for_order(order)
        if not inv_status["all_in_stock"]:
            alerts.append({
                "order_id": order.get("order_id"),
                "order_number": order.get("order_number"),
                "customer_name": order.get("customer_name"),
                "stage": order.get("fulfillment_stage_name"),
                "stage_id": order.get("fulfillment_stage_id"),
                "out_of_stock_count": inv_status["out_of_stock_count"],
                "low_stock_items": inv_status["low_stock_items"],
                "items": inv_status["items"]
            })
    
    return {
        "total_alerts": len(alerts),
        "alerts": alerts
    }


@router.get("/orders/{order_id}/allocations")
async def get_order_allocations(
    order_id: str,
    user: User = Depends(get_current_user)
):
    """Get inventory allocations for an order (which inventory items were used)"""
    allocations = await db.inventory_allocations.find(
        {"order_id": order_id},
        {"_id": 0}
    ).to_list(1000)
    
    return {
        "order_id": order_id,
        "allocations": allocations,
        "total_items_allocated": sum(a.get("quantity_allocated", 0) for a in allocations)
    }


@router.post("/orders/{order_id}/mark-shipped")
async def mark_order_shipped(
    order_id: str,
    tracking_number: Optional[str] = None,
    carrier: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Mark an order as shipped and archive it"""
    order = await db.fulfillment_orders.find_one({"order_id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    now = datetime.now(timezone.utc).isoformat()
    
    # If inventory not yet deducted, do it now
    deduction_result = None
    if not order.get("inventory_deducted"):
        deduction_result = await deduct_inventory_for_order(order, user)
    
    update_data = {
        "status": "shipped",
        "fulfillment_status": "shipped",
        "fulfillment_stage_id": "archived",
        "fulfillment_stage_name": "Archived",
        "shipped_at": now,
        "shipped_by": user.user_id,
        "archived_at": now,
        "inventory_deducted": True
    }
    
    if tracking_number:
        update_data["tracking_number"] = tracking_number
    if carrier:
        update_data["carrier"] = carrier
    
    await db.fulfillment_orders.update_one(
        {"order_id": order_id},
        {"$set": update_data}
    )
    
    result = {"message": "Order shipped and archived", "order_id": order_id}
    if deduction_result:
        result["inventory_deduction"] = deduction_result
    
    return result



@router.post("/orders/{order_id}/start-timer")
async def start_order_timer(order_id: str, user: User = Depends(get_current_user)):
    """Start timer for an individual order (used for GB Home workflow)"""
    order = await db.fulfillment_orders.find_one({"order_id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    if order.get("timer_active"):
        return {"success": True, "message": "Timer already running"}
    
    now = datetime.now(timezone.utc).isoformat()
    
    await db.fulfillment_orders.update_one(
        {"order_id": order_id},
        {"$set": {
            "timer_active": True,
            "timer_started_at": now,
            "assigned_to": user.user_id,
            "assigned_name": user.name,
            "updated_at": now
        }}
    )
    
    return {"success": True, "message": "Timer started", "started_at": now}


@router.post("/orders/{order_id}/stop-timer")
async def stop_order_timer(order_id: str, user: User = Depends(get_current_user)):
    """Stop timer for an individual order"""
    order = await db.fulfillment_orders.find_one({"order_id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    if not order.get("timer_active"):
        return {"success": True, "message": "Timer not running"}
    
    now = datetime.now(timezone.utc)
    
    # Calculate elapsed time
    elapsed_minutes = 0
    if order.get("timer_started_at"):
        started_at = datetime.fromisoformat(order["timer_started_at"].replace("Z", "+00:00"))
        elapsed_minutes = (now - started_at).total_seconds() / 60
    
    accumulated = order.get("timer_accumulated_minutes", 0) + elapsed_minutes
    
    await db.fulfillment_orders.update_one(
        {"order_id": order_id},
        {"$set": {
            "timer_active": False,
            "timer_accumulated_minutes": accumulated,
            "updated_at": now.isoformat()
        }}
    )
    
    # Log the time
    time_log = {
        "log_id": f"ftlog_{uuid.uuid4().hex[:12]}",
        "order_id": order_id,
        "user_id": user.user_id,
        "user_name": user.name,
        "stage_id": order.get("fulfillment_stage_id"),
        "stage_name": order.get("fulfillment_stage_name"),
        "minutes": elapsed_minutes,
        "action": "order_timer_stopped",
        "created_at": now.isoformat()
    }
    await db.fulfillment_time_logs.insert_one(time_log)
    
    return {
        "success": True,
        "message": "Timer stopped",
        "elapsed_minutes": elapsed_minutes,
        "total_minutes": accumulated
    }



@router.delete("/orders/{order_id}")
async def remove_order_from_fulfillment(order_id: str, user: User = Depends(get_current_user)):
    """
    Remove an order from the fulfillment workflow (admin/manager only).
    This only removes the order from fulfillment stages - does not affect the actual order.
    """
    # Check if user is admin or manager
    if user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Only admins and managers can remove orders from fulfillment")
    
    # Check if order exists in fulfillment
    order = await db.fulfillment_orders.find_one({"order_id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found in fulfillment workflow")
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Log the removal before deleting
    removal_log = {
        "log_id": f"frmlog_{uuid.uuid4().hex[:12]}",
        "order_id": order_id,
        "order_number": order.get("order_number"),
        "store_id": order.get("store_id"),
        "store_name": order.get("store_name"),
        "stage_id": order.get("fulfillment_stage_id"),
        "stage_name": order.get("fulfillment_stage_name"),
        "removed_by": user.user_id,
        "removed_by_name": user.name,
        "action": "removed_from_fulfillment",
        "reason": "manual_removal_by_admin",
        "created_at": now
    }
    await db.fulfillment_removal_logs.insert_one(removal_log)
    
    # Delete the order from fulfillment_orders
    result = await db.fulfillment_orders.delete_one({"order_id": order_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=500, detail="Failed to remove order from fulfillment")
    
    return {
        "success": True,
        "message": f"Order {order.get('order_number', order_id)} removed from fulfillment workflow",
        "order_id": order_id,
        "removed_by": user.name
    }


@router.delete("/orders/{order_id}/items/{item_id}")
async def remove_item_from_fulfillment_order(order_id: str, item_id: str, user: User = Depends(get_current_user)):
    """
    Remove a specific item from an order in the fulfillment workflow (admin/manager only).
    This only removes the item from fulfillment - does not affect the actual order.
    """
    # Check if user is admin or manager
    if user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Only admins and managers can remove items from fulfillment")
    
    # Check if order exists in fulfillment
    order = await db.fulfillment_orders.find_one({"order_id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found in fulfillment workflow")
    
    # Find the item in the order's line items
    line_items = order.get("line_items", [])
    item_to_remove = None
    item_index = None
    
    for idx, item in enumerate(line_items):
        if item.get("line_item_id") == item_id or item.get("item_id") == item_id:
            item_to_remove = item
            item_index = idx
            break
    
    if item_to_remove is None:
        raise HTTPException(status_code=404, detail="Item not found in order")
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Log the item removal
    removal_log = {
        "log_id": f"firmlog_{uuid.uuid4().hex[:12]}",
        "order_id": order_id,
        "order_number": order.get("order_number"),
        "item_id": item_id,
        "item_name": item_to_remove.get("name") or item_to_remove.get("title"),
        "item_sku": item_to_remove.get("sku"),
        "quantity": item_to_remove.get("quantity", 1),
        "store_id": order.get("store_id"),
        "store_name": order.get("store_name"),
        "stage_id": order.get("fulfillment_stage_id"),
        "stage_name": order.get("fulfillment_stage_name"),
        "removed_by": user.user_id,
        "removed_by_name": user.name,
        "action": "item_removed_from_fulfillment",
        "reason": "manual_removal_by_admin",
        "created_at": now
    }
    await db.fulfillment_removal_logs.insert_one(removal_log)
    
    # Remove the item from the order's line items
    updated_items = [item for idx, item in enumerate(line_items) if idx != item_index]
    
    # If this was the last item, remove the entire order from fulfillment
    if len(updated_items) == 0:
        await db.fulfillment_orders.delete_one({"order_id": order_id})
        return {
            "success": True,
            "message": f"Last item removed - order {order.get('order_number', order_id)} removed from fulfillment workflow",
            "order_id": order_id,
            "item_id": item_id,
            "order_removed": True,
            "removed_by": user.name
        }
    
    # Update the order with remaining items
    await db.fulfillment_orders.update_one(
        {"order_id": order_id},
        {"$set": {
            "line_items": updated_items,
            "item_count": len(updated_items),
            "updated_at": now
        }}
    )
    
    return {
        "success": True,
        "message": f"Item removed from order {order.get('order_number', order_id)}",
        "order_id": order_id,
        "item_id": item_id,
        "items_remaining": len(updated_items),
        "removed_by": user.name
    }

