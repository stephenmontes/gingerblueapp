from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timezone
from typing import Optional
from pydantic import BaseModel
import uuid

from database import db
from models.user import User
from models.store import Store, StoreCreate
from dependencies import get_current_user
from services.shopify_service import ShopifyService
from services.etsy_service import EtsyService

router = APIRouter(prefix="/stores", tags=["stores"])


class TestConnectionRequest(BaseModel):
    platform: str
    shop_url: Optional[str] = None
    shop_id: Optional[str] = None
    api_key: Optional[str] = None
    access_token: Optional[str] = None
    store_id: Optional[str] = None
    use_existing_token: Optional[bool] = False


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


@router.post("/test-connection")
async def test_connection(data: TestConnectionRequest, user: User = Depends(get_current_user)):
    """Test store connection with provided credentials"""
    if user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    if data.platform == "shopify":
        if not data.shop_url:
            raise HTTPException(status_code=400, detail="Shop URL is required for Shopify")
        
        service = ShopifyService(data.shop_url, data.access_token)
        result = await service.test_connection()
        
        if result["success"]:
            shop = result.get("shop", {})
            return {
                "success": True,
                "shop_name": shop.get("name"),
                "shop_email": shop.get("email"),
                "shop_domain": shop.get("domain")
            }
        else:
            raise HTTPException(status_code=400, detail=result.get("error", "Connection failed"))
    
    elif data.platform == "etsy":
        if not data.shop_id or not data.api_key:
            raise HTTPException(status_code=400, detail="Shop ID and API Key are required for Etsy")
        
        service = EtsyService(data.shop_id, data.access_token, data.api_key)
        result = await service.test_connection()
        
        if result["success"]:
            shop = result.get("shop", {})
            return {
                "success": True,
                "shop_name": shop.get("shop_name"),
                "shop_id": shop.get("shop_id"),
            }
        else:
            raise HTTPException(status_code=400, detail=result.get("error", "Connection failed"))
    
    else:
        raise HTTPException(status_code=400, detail=f"Unknown platform: {data.platform}")


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
    
    # Build update document, excluding None values
    update_doc = {}
    data = store_data.model_dump(exclude_unset=True)
    for key, value in data.items():
        if value is not None and value != "":
            update_doc[key] = value
    
    if not update_doc:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    result = await db.stores.update_one(
        {"store_id": store_id},
        {"$set": update_doc}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Store not found")
    
    # Return updated store (without sensitive fields)
    store = await db.stores.find_one({"store_id": store_id}, {"_id": 0, "api_secret": 0, "access_token": 0})
    return store


@router.get("/{store_id}/full")
async def get_store_full(store_id: str, user: User = Depends(get_current_user)):
    """Get full store details including credentials (admin only)"""
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    
    store = await db.stores.find_one({"store_id": store_id}, {"_id": 0})
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    
    return store
