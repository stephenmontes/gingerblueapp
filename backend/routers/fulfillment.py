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
    {"stage_id": "fulfill_orders", "name": "Orders", "order": 0, "color": "#6366F1"},
    {"stage_id": "fulfill_print", "name": "Print List", "order": 1, "color": "#F59E0B"},
    {"stage_id": "fulfill_mount", "name": "Mount List", "order": 2, "color": "#3B82F6"},
    {"stage_id": "fulfill_finish", "name": "Finish", "order": 3, "color": "#8B5CF6"},
    {"stage_id": "fulfill_pack", "name": "Pack and Ship", "order": 4, "color": "#22C55E"},
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
    """Deduct inventory items for an order and create allocation records"""
    items = order.get("items", []) or order.get("line_items", [])
    order_id = order.get("order_id")
    now = datetime.now(timezone.utc).isoformat()
    
    deductions = []
    allocations = []
    errors = []
    
    for item in items:
        sku = item.get("sku", "UNKNOWN")
        qty_needed = item.get("qty", 1) or item.get("quantity", 1)
        match_key = get_sku_match_key(sku)
        
        # Find matching inventory
        inv_item = await db.inventory.find_one({
            "$or": [
                {"sku": sku, "is_rejected": {"$ne": True}},
                {"sku_match_key": match_key, "is_rejected": {"$ne": True}},
                {"color": match_key.split("-")[0], "size": match_key.split("-")[1], "is_rejected": {"$ne": True}}
            ]
        }, {"_id": 0})
        
        if not inv_item:
            errors.append({"sku": sku, "error": "No matching inventory found"})
            continue
        
        current_qty = inv_item.get("quantity", 0)
        actual_deduct = min(qty_needed, current_qty)
        
        if actual_deduct > 0:
            # Deduct from inventory
            new_qty = current_qty - actual_deduct
            await db.inventory.update_one(
                {"item_id": inv_item["item_id"]},
                {"$set": {"quantity": new_qty, "updated_at": now}}
            )
            
            deductions.append({
                "sku": sku,
                "inventory_item_id": inv_item["item_id"],
                "qty_deducted": actual_deduct,
                "new_quantity": new_qty
            })
            
            # Create allocation record
            allocation = {
                "allocation_id": f"alloc_{uuid.uuid4().hex[:12]}",
                "order_id": order_id,
                "inventory_item_id": inv_item["item_id"],
                "inventory_sku": inv_item.get("sku"),
                "order_item_sku": sku,
                "quantity_allocated": actual_deduct,
                "allocated_by": user.user_id,
                "allocated_by_name": user.name,
                "created_at": now
            }
            allocations.append(allocation)
        
        if actual_deduct < qty_needed:
            errors.append({
                "sku": sku,
                "error": f"Insufficient stock. Needed {qty_needed}, had {current_qty}, deducted {actual_deduct}"
            })
    
    # Save allocations
    if allocations:
        await db.inventory_allocations.insert_many(allocations)
    
    return {
        "order_id": order_id,
        "deductions": deductions,
        "allocations_created": len(allocations),
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
    
    return stages


@router.get("/orders")
async def get_fulfillment_orders(
    status: Optional[str] = None,
    stage_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get orders for fulfillment with optional filtering"""
    query = {}
    if status:
        query["fulfillment_status"] = status
    if stage_id:
        query["fulfillment_stage_id"] = stage_id
    
    orders = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return orders


@router.get("/orders/{order_id}/inventory-status")
async def get_order_inventory_status(
    order_id: str,
    user: User = Depends(get_current_user)
):
    """Check inventory availability for a specific order"""
    order = await db.orders.find_one({"order_id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    return await check_inventory_for_order(order)


@router.get("/stages/{stage_id}/orders")
async def get_orders_by_stage(
    stage_id: str,
    include_inventory_status: bool = True,
    user: User = Depends(get_current_user)
):
    """Get all orders in a specific fulfillment stage with inventory status"""
    orders = await db.orders.find(
        {"fulfillment_stage_id": stage_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(1000)
    
    if include_inventory_status:
        for order in orders:
            inv_status = await check_inventory_for_order(order)
            order["inventory_status"] = {
                "all_in_stock": inv_status["all_in_stock"],
                "partial_stock": inv_status["partial_stock"],
                "out_of_stock_count": inv_status["out_of_stock_count"],
                "items": inv_status["items"]
            }
    
    return orders


@router.post("/orders/{order_id}/assign-stage")
async def assign_order_to_stage(
    order_id: str,
    stage_id: str,
    user: User = Depends(get_current_user)
):
    """Assign an order to a fulfillment stage"""
    order = await db.orders.find_one({"order_id": order_id})
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
    
    await db.orders.update_one(
        {"order_id": order_id},
        {"$set": {
            "fulfillment_stage_id": stage_id,
            "fulfillment_stage_name": stage["name"],
            "fulfillment_updated_at": now,
            "fulfillment_updated_by": user.user_id,
            "inventory_deducted": stage_id == "fulfill_pack"
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
    order = await db.orders.find_one({"order_id": order_id})
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
    
    await db.orders.update_one(
        {"order_id": order_id},
        {"$set": {
            "fulfillment_stage_id": next_stage["stage_id"],
            "fulfillment_stage_name": next_stage["name"],
            "fulfillment_updated_at": now,
            "fulfillment_updated_by": user.user_id,
            "inventory_deducted": next_stage["stage_id"] == "fulfill_pack"
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
            order = await db.orders.find_one({"order_id": oid}, {"_id": 0})
            if order and not order.get("inventory_deducted"):
                result = await deduct_inventory_for_order(order, user)
                deduction_results.append(result)
    
    # Update all orders
    result = await db.orders.update_many(
        {"order_id": {"$in": order_ids}},
        {"$set": {
            "fulfillment_stage_id": target_stage_id,
            "fulfillment_stage_name": stage["name"],
            "fulfillment_updated_at": now,
            "fulfillment_updated_by": user.user_id,
            "inventory_deducted": target_stage_id == "fulfill_pack"
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
        "count": result.modified_count,
        "inventory_deducted": target_stage_id == "fulfill_pack",
        "created_at": now
    })
    
    response = {
        "message": f"Moved {result.modified_count} orders to {stage['name']}",
        "modified_count": result.modified_count
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
    count = await db.orders.count_documents({"fulfillment_stage_id": stage_id})
    return {"stage_id": stage_id, "count": count}


@router.get("/summary")
async def get_fulfillment_summary(user: User = Depends(get_current_user)):
    """Get summary of orders across all fulfillment stages with stock alerts"""
    stages = await db.fulfillment_stages.find({}, {"_id": 0}).sort("order", 1).to_list(100)
    
    summary = []
    total_out_of_stock = 0
    
    for stage in stages:
        orders = await db.orders.find(
            {"fulfillment_stage_id": stage["stage_id"]},
            {"_id": 0}
        ).to_list(1000)
        
        out_of_stock_orders = 0
        for order in orders:
            inv_status = await check_inventory_for_order(order)
            if not inv_status["all_in_stock"]:
                out_of_stock_orders += 1
        
        total_out_of_stock += out_of_stock_orders
        
        summary.append({
            "stage_id": stage["stage_id"],
            "stage_name": stage["name"],
            "color": stage.get("color", "#6366F1"),
            "order": stage["order"],
            "count": len(orders),
            "out_of_stock_count": out_of_stock_orders
        })
    
    unassigned = await db.orders.count_documents({
        "$or": [
            {"fulfillment_stage_id": {"$exists": False}},
            {"fulfillment_stage_id": None}
        ]
    })
    
    total = await db.orders.count_documents({})
    
    return {
        "stages": summary,
        "unassigned_count": unassigned,
        "total_orders": total,
        "total_out_of_stock": total_out_of_stock
    }


@router.get("/inventory-alerts")
async def get_inventory_alerts(user: User = Depends(get_current_user)):
    """Get list of orders with insufficient inventory"""
    orders = await db.orders.find(
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
    """Mark an order as shipped"""
    order = await db.orders.find_one({"order_id": order_id})
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
        "shipped_at": now,
        "shipped_by": user.user_id,
        "inventory_deducted": True
    }
    
    if tracking_number:
        update_data["tracking_number"] = tracking_number
    if carrier:
        update_data["carrier"] = carrier
    
    await db.orders.update_one(
        {"order_id": order_id},
        {"$set": update_data}
    )
    
    result = {"message": "Order marked as shipped", "order_id": order_id}
    if deduction_result:
        result["inventory_deduction"] = deduction_result
    
    return result
