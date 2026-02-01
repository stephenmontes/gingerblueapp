from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timezone
import uuid

from database import db
from models.user import User
from models.inventory import InventoryItem, InventoryCreate
from dependencies import get_current_user

router = APIRouter(prefix="/inventory", tags=["inventory"])

@router.get("")
async def get_inventory(user: User = Depends(get_current_user)):
    """Get all inventory items"""
    items = await db.inventory.find({}, {"_id": 0}).sort("name", 1).to_list(10000)
    return items

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
