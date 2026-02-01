"""
Products Router - API endpoints for product management and sync
"""
from fastapi import APIRouter, HTTPException, Depends, Query, BackgroundTasks
from typing import Optional, List
from datetime import datetime, timezone

from database import db
from models.user import User
from models.product import Product, ProductCreate, ProductSyncResult
from dependencies import get_current_user
from services.shopify_service import sync_products_from_store, get_product_image_by_sku, ShopifyService

router = APIRouter(prefix="/products", tags=["products"])


@router.get("")
async def get_products(
    store_id: Optional[str] = None,
    search: Optional[str] = None,
    product_type: Optional[str] = None,
    vendor: Optional[str] = None,
    status: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    sort_by: str = Query("updated_at", description="Field to sort by"),
    sort_order: str = Query("desc", description="Sort order: asc or desc"),
    user: User = Depends(get_current_user)
):
    """Get all products with optional filters and sorting"""
    query = {}
    
    if store_id:
        query["store_id"] = store_id
    if status:
        query["status"] = status
    if product_type:
        query["product_type"] = product_type
    if vendor:
        query["vendor"] = vendor
    if search:
        query["$or"] = [
            {"title": {"$regex": search, "$options": "i"}},
            {"variants.sku": {"$regex": search, "$options": "i"}},
            {"variants.barcode": {"$regex": search, "$options": "i"}}
        ]
    
    # Map sort_by to actual field names
    sort_field_map = {
        "title": "title",
        "product": "title",
        "vendor": "vendor",
        "type": "product_type",
        "product_type": "product_type",
        "status": "status",
        "updated_at": "updated_at",
        "created_at": "created_at"
    }
    sort_field = sort_field_map.get(sort_by, "updated_at")
    sort_direction = 1 if sort_order == "asc" else -1
    
    total = await db.products.count_documents(query)
    products = await db.products.find(
        query,
        {"_id": 0}
    ).sort(sort_field, sort_direction).skip(skip).limit(limit).to_list(limit)
    
    return {
        "products": products,
        "total": total,
        "skip": skip,
        "limit": limit,
        "sort_by": sort_by,
        "sort_order": sort_order
    }


@router.get("/stats")
async def get_product_stats(
    store_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get product statistics"""
    query = {}
    if store_id:
        query["store_id"] = store_id
    
    total = await db.products.count_documents(query)
    
    # Count by status
    pipeline = [
        {"$match": query},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}}
    ]
    status_counts = {doc["_id"]: doc["count"] async for doc in db.products.aggregate(pipeline)}
    
    # Count variants and total inventory
    variant_pipeline = [
        {"$match": query},
        {"$unwind": "$variants"},
        {"$group": {
            "_id": None,
            "total_variants": {"$sum": 1},
            "total_inventory": {"$sum": "$variants.inventory_quantity"},
            "with_barcode": {"$sum": {"$cond": [{"$ne": ["$variants.barcode", None]}, 1, 0]}},
            "with_sku": {"$sum": {"$cond": [{"$ne": ["$variants.sku", None]}, 1, 0]}}
        }}
    ]
    variant_stats = await db.products.aggregate(variant_pipeline).to_list(1)
    variant_data = variant_stats[0] if variant_stats else {}
    
    # Count by vendor
    vendor_pipeline = [
        {"$match": query},
        {"$group": {"_id": "$vendor", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 10}
    ]
    vendors = [{"vendor": doc["_id"] or "Unknown", "count": doc["count"]} async for doc in db.products.aggregate(vendor_pipeline)]
    
    # Count by product type
    type_pipeline = [
        {"$match": query},
        {"$group": {"_id": "$product_type", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 10}
    ]
    product_types = [{"type": doc["_id"] or "Unknown", "count": doc["count"]} async for doc in db.products.aggregate(type_pipeline)]
    
    return {
        "total_products": total,
        "status_counts": status_counts,
        "total_variants": variant_data.get("total_variants", 0),
        "total_inventory": variant_data.get("total_inventory", 0),
        "variants_with_barcode": variant_data.get("with_barcode", 0),
        "variants_with_sku": variant_data.get("with_sku", 0),
        "top_vendors": vendors,
        "top_product_types": product_types
    }


@router.get("/{product_id}")
async def get_product(
    product_id: str,
    user: User = Depends(get_current_user)
):
    """Get a single product by ID"""
    product = await db.products.find_one({"product_id": product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


@router.get("/by-sku/{sku}")
async def get_product_by_sku(
    sku: str,
    store_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get product and variant info by SKU"""
    query = {"variants.sku": sku}
    if store_id:
        query["store_id"] = store_id
    
    product = await db.products.find_one(query, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found for this SKU")
    
    # Find matching variant
    variant = None
    for v in product.get("variants", []):
        if v.get("sku") == sku:
            variant = v
            break
    
    return {
        "product": product,
        "variant": variant
    }


@router.get("/image/{sku}")
async def get_product_image(
    sku: str,
    user: User = Depends(get_current_user)
):
    """Get product image URL by SKU"""
    image_url = await get_product_image_by_sku(sku)
    if not image_url:
        raise HTTPException(status_code=404, detail="No image found for this SKU")
    return {"sku": sku, "image_url": image_url}


@router.post("/sync/{store_id}")
async def sync_store_products(
    store_id: str,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user)
):
    """Trigger product sync from a store"""
    if user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Verify store exists
    store = await db.stores.find_one({"store_id": store_id})
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    
    if store.get("platform") != "shopify":
        raise HTTPException(status_code=400, detail="Only Shopify stores support product sync")
    
    # Run sync
    result = await sync_products_from_store(store_id)
    
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Sync failed"))
    
    return result


@router.post("/sync/{store_id}/test")
async def test_store_connection(
    store_id: str,
    user: User = Depends(get_current_user)
):
    """Test store API connection"""
    if user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    store = await db.stores.find_one({"store_id": store_id})
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    
    if store.get("platform") != "shopify":
        raise HTTPException(status_code=400, detail="Only Shopify stores support connection test")
    
    access_token = store.get("access_token")
    shop_url = store.get("shop_url")
    
    if not access_token or not shop_url:
        raise HTTPException(status_code=400, detail="Store credentials not configured")
    
    service = ShopifyService(shop_url, access_token)
    result = await service.test_connection()
    
    if result["success"]:
        return {
            "success": True,
            "shop_name": result["shop"].get("name"),
            "shop_email": result["shop"].get("email"),
            "shop_domain": result["shop"].get("domain")
        }
    else:
        raise HTTPException(status_code=400, detail=result.get("error", "Connection failed"))


@router.delete("/{product_id}")
async def delete_product(
    product_id: str,
    user: User = Depends(get_current_user)
):
    """Delete a product"""
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    
    result = await db.products.delete_one({"product_id": product_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")
    
    return {"message": "Product deleted"}


@router.delete("/store/{store_id}/all")
async def delete_all_store_products(
    store_id: str,
    user: User = Depends(get_current_user)
):
    """Delete all products from a store"""
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    
    result = await db.products.delete_many({"store_id": store_id})
    
    return {
        "message": f"Deleted {result.deleted_count} products",
        "deleted_count": result.deleted_count
    }


@router.get("/vendors/list")
async def get_vendors(
    store_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get list of unique vendors"""
    query = {}
    if store_id:
        query["store_id"] = store_id
    
    pipeline = [
        {"$match": query},
        {"$group": {"_id": "$vendor"}},
        {"$sort": {"_id": 1}}
    ]
    vendors = [doc["_id"] async for doc in db.products.aggregate(pipeline) if doc["_id"]]
    return {"vendors": vendors}


@router.get("/types/list")
async def get_product_types(
    store_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get list of unique product types"""
    query = {}
    if store_id:
        query["store_id"] = store_id
    
    pipeline = [
        {"$match": query},
        {"$group": {"_id": "$product_type"}},
        {"$sort": {"_id": 1}}
    ]
    types = [doc["_id"] async for doc in db.products.aggregate(pipeline) if doc["_id"]]
    return {"product_types": types}
