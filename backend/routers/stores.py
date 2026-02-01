from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timezone
import uuid

from database import db
from models.user import User
from models.store import Store, StoreCreate
from dependencies import get_current_user

router = APIRouter(prefix="/stores", tags=["stores"])

@router.get("")
async def get_stores(user: User = Depends(get_current_user)):
    """Get all stores"""
    stores = await db.stores.find({}, {"_id": 0, "api_secret": 0, "access_token": 0}).to_list(100)
    return stores

@router.post("")
async def create_store(store_data: StoreCreate, user: User = Depends(get_current_user)):
    """Create a new store connection"""
    if user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    store = Store(**store_data.model_dump())
    doc = store.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    
    await db.stores.insert_one(doc)
    
    return {k: v for k, v in doc.items() if k not in ["_id", "api_secret", "access_token"]}

@router.delete("/{store_id}")
async def delete_store(store_id: str, user: User = Depends(get_current_user)):
    """Delete a store"""
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    
    result = await db.stores.delete_one({"store_id": store_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Store not found")
    
    return {"message": "Store deleted"}

@router.put("/{store_id}")
async def update_store(store_id: str, store_data: StoreCreate, user: User = Depends(get_current_user)):
    """Update store configuration"""
    if user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    update_doc = store_data.model_dump(exclude_unset=True)
    
    result = await db.stores.update_one(
        {"store_id": store_id},
        {"$set": update_doc}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Store not found")
    
    return {"message": "Store updated"}

@router.get("/{store_id}/full")
async def get_store_full(store_id: str, user: User = Depends(get_current_user)):
    """Get full store details including credentials (admin only)"""
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    
    store = await db.stores.find_one({"store_id": store_id}, {"_id": 0})
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    
    return store
