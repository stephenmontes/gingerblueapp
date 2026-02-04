from fastapi import APIRouter, HTTPException, Depends, Query
from datetime import datetime, timezone
import uuid

from database import db
from models.user import User
from models.inventory import InventoryItem, InventoryCreate
from dependencies import get_current_user

router = APIRouter(prefix="/inventory", tags=["inventory"])

@router.get("")
async def get_inventory(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(100, ge=1, le=500, description="Items per page"),
    search: str = Query(None, description="Search term for name or SKU"),
    user: User = Depends(get_current_user)
):
    """Get inventory items with pagination"""
    query = {}
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"sku": {"$regex": search, "$options": "i"}}
        ]
    
    total_count = await db.inventory.count_documents(query)
    skip = (page - 1) * page_size
    
    items = await db.inventory.find(query, {"_id": 0}).sort("name", 1).skip(skip).limit(page_size).to_list(page_size)
    
    return {
        "items": items,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total_count": total_count,
            "total_pages": (total_count + page_size - 1) // page_size
        }
    }

@router.post("")
async def create_inventory_item(item_data: InventoryCreate, user: User = Depends(get_current_user)):
    """Create a new inventory item"""
    existing = await db.inventory.find_one({"sku": item_data.sku}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="SKU already exists")
    
    item = InventoryItem(**item_data.model_dump())
    doc = item.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    doc["updated_at"] = doc["updated_at"].isoformat()
    
    await db.inventory.insert_one(doc)
    return {"message": "Item created", "item_id": item.item_id}

@router.get("/{item_id}")
async def get_inventory_item(item_id: str, user: User = Depends(get_current_user)):
    """Get a single inventory item"""
    item = await db.inventory.find_one({"item_id": item_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return item

@router.put("/{item_id}")
async def update_inventory_item(item_id: str, item_data: InventoryCreate, user: User = Depends(get_current_user)):
    """Update an inventory item"""
    existing = await db.inventory.find_one({"item_id": item_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Item not found")
    
    sku_check = await db.inventory.find_one({"sku": item_data.sku, "item_id": {"$ne": item_id}}, {"_id": 0})
    if sku_check:
        raise HTTPException(status_code=400, detail="SKU already exists")
    
    update_data = item_data.model_dump()
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.inventory.update_one({"item_id": item_id}, {"$set": update_data})
    return {"message": "Item updated"}

@router.delete("/{item_id}")
async def delete_inventory_item(item_id: str, user: User = Depends(get_current_user)):
    """Delete an inventory item"""
    result = await db.inventory.delete_one({"item_id": item_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"message": "Item deleted"}

@router.put("/{item_id}/adjust")
async def adjust_inventory_quantity(item_id: str, adjustment: int, user: User = Depends(get_current_user)):
    """Adjust inventory quantity"""
    item = await db.inventory.find_one({"item_id": item_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    new_quantity = max(0, item.get("quantity", 0) + adjustment)
    
    await db.inventory.update_one(
        {"item_id": item_id},
        {"$set": {"quantity": new_quantity, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"message": "Quantity adjusted", "new_quantity": new_quantity}

@router.post("/{item_id}/reject")
async def reject_inventory_items(item_id: str, quantity: int, user: User = Depends(get_current_user)):
    """Reject items from good inventory"""
    item = await db.inventory.find_one({"item_id": item_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    if item.get("is_rejected"):
        raise HTTPException(status_code=400, detail="Cannot reject items from rejected inventory")
    
    if quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be greater than 0")
    
    current_qty = item.get("quantity", 0)
    if quantity > current_qty:
        raise HTTPException(status_code=400, detail=f"Cannot reject more than available ({current_qty})")
    
    now = datetime.now(timezone.utc).isoformat()
    sku_match_key = item.get("sku_match_key", item.get("sku", ""))
    
    new_good_qty = current_qty - quantity
    await db.inventory.update_one(
        {"item_id": item_id},
        {"$set": {"quantity": new_good_qty, "updated_at": now}}
    )
    
    existing_rejected = await db.inventory.find_one({
        "sku_match_key": sku_match_key,
        "is_rejected": True
    }, {"_id": 0})
    
    if existing_rejected:
        await db.inventory.update_one(
            {"item_id": existing_rejected["item_id"]},
            {"$inc": {"quantity": quantity}, "$set": {"updated_at": now}}
        )
        new_rejected_qty = existing_rejected.get("quantity", 0) + quantity
    else:
        rej_item = {
            "item_id": f"inv_{uuid.uuid4().hex[:8]}",
            "sku": f"{item.get('sku', '')}-REJECTED",
            "sku_match_key": sku_match_key,
            "name": f"{item.get('name', '')} (REJECTED)",
            "color": item.get("color", ""),
            "size": item.get("size", ""),
            "quantity": quantity,
            "min_stock": 0,
            "location": "Rejected Bin",
            "is_rejected": True,
            "created_at": now,
            "updated_at": now
        }
        await db.inventory.insert_one(rej_item)
        new_rejected_qty = quantity
    
    return {
        "message": f"Rejected {quantity} frames",
        "new_good_quantity": new_good_qty,
        "rejected_quantity": new_rejected_qty
    }



@router.get("/frame-inventory-log")
async def get_frame_inventory_log(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    start_date: str = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: str = Query(None, description="End date (YYYY-MM-DD)"),
    color: str = Query(None, description="Filter by color"),
    size: str = Query(None, description="Filter by size"),
    user: User = Depends(get_current_user)
):
    """Get frame inventory deduction log with filters
    
    Shows history of frames removed from inventory when orders are shipped.
    """
    query = {}
    
    # Date range filter
    if start_date or end_date:
        date_query = {}
        if start_date:
            date_query["$gte"] = f"{start_date}T00:00:00"
        if end_date:
            date_query["$lte"] = f"{end_date}T23:59:59"
        if date_query:
            query["deducted_at"] = date_query
    
    # Color/size filters
    if color:
        query["color"] = {"$regex": color, "$options": "i"}
    if size:
        query["size"] = {"$regex": size, "$options": "i"}
    
    total_count = await db.frame_inventory_log.count_documents(query)
    skip = (page - 1) * page_size
    
    logs = await db.frame_inventory_log.find(
        query, 
        {"_id": 0}
    ).sort("deducted_at", -1).skip(skip).limit(page_size).to_list(page_size)
    
    # Get summary stats
    pipeline = [
        {"$match": query},
        {"$group": {
            "_id": None,
            "total_frames_deducted": {"$sum": "$quantity_deducted"},
            "total_orders": {"$addToSet": "$order_id"}
        }}
    ]
    
    summary_result = await db.frame_inventory_log.aggregate(pipeline).to_list(1)
    summary = {
        "total_frames_deducted": summary_result[0]["total_frames_deducted"] if summary_result else 0,
        "total_orders": len(summary_result[0]["total_orders"]) if summary_result else 0
    }
    
    return {
        "logs": logs,
        "summary": summary,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total_count": total_count,
            "total_pages": (total_count + page_size - 1) // page_size
        }
    }


@router.get("/frame-inventory-log/summary")
async def get_frame_inventory_log_summary(
    days: int = Query(30, ge=1, le=365, description="Number of days to summarize"),
    user: User = Depends(get_current_user)
):
    """Get summary of frame inventory deductions by color/size"""
    from datetime import timedelta
    
    start_date = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    
    pipeline = [
        {"$match": {"deducted_at": {"$gte": start_date}}},
        {"$group": {
            "_id": {"color": "$color", "size": "$size"},
            "total_deducted": {"$sum": "$quantity_deducted"},
            "order_count": {"$addToSet": "$order_id"},
            "last_deduction": {"$max": "$deducted_at"}
        }},
        {"$project": {
            "_id": 0,
            "color": "$_id.color",
            "size": "$_id.size",
            "total_deducted": 1,
            "order_count": {"$size": "$order_count"},
            "last_deduction": 1
        }},
        {"$sort": {"total_deducted": -1}}
    ]
    
    results = await db.frame_inventory_log.aggregate(pipeline).to_list(100)
    
    # Total frames deducted
    total_pipeline = [
        {"$match": {"deducted_at": {"$gte": start_date}}},
        {"$group": {
            "_id": None,
            "total": {"$sum": "$quantity_deducted"}
        }}
    ]
    total_result = await db.frame_inventory_log.aggregate(total_pipeline).to_list(1)
    
    return {
        "period_days": days,
        "by_color_size": results,
        "total_frames_deducted": total_result[0]["total"] if total_result else 0
    }

