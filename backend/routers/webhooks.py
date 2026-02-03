"""
Webhook handlers for Shopify and Etsy order notifications
"""
from fastapi import APIRouter, HTTPException, Request, Header
from typing import Optional
from datetime import datetime, timezone
import uuid
import hmac
import hashlib
import base64
import os

from database import db
from services.shopify_service import transform_shopify_order

router = APIRouter(prefix="/webhooks", tags=["webhooks"])

# Shopify webhook secret (set in store settings)
SHOPIFY_WEBHOOK_SECRET = os.environ.get("SHOPIFY_WEBHOOK_SECRET", "")


def verify_shopify_webhook(data: bytes, hmac_header: str, secret: str) -> bool:
    """Verify Shopify webhook signature"""
    if not secret:
        return True  # Skip verification if no secret configured
    
    computed_hmac = base64.b64encode(
        hmac.new(secret.encode(), data, hashlib.sha256).digest()
    ).decode()
    
    return hmac.compare_digest(computed_hmac, hmac_header)


@router.post("/shopify/orders/create")
async def shopify_order_created(
    request: Request,
    x_shopify_hmac_sha256: Optional[str] = Header(None),
    x_shopify_shop_domain: Optional[str] = Header(None),
    x_shopify_topic: Optional[str] = Header(None)
):
    """Handle Shopify order created webhook"""
    body = await request.body()
    
    # Verify webhook signature
    if SHOPIFY_WEBHOOK_SECRET and x_shopify_hmac_sha256:
        if not verify_shopify_webhook(body, x_shopify_hmac_sha256, SHOPIFY_WEBHOOK_SECRET):
            raise HTTPException(status_code=401, detail="Invalid webhook signature")
    
    # Parse order data
    import json
    try:
        shopify_order = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")
    
    # Find store by shop domain
    shop_domain = x_shopify_shop_domain or ""
    store = await db.stores.find_one({
        "$or": [
            {"shop_url": {"$regex": shop_domain, "$options": "i"}},
            {"shop_url": shop_domain}
        ]
    })
    
    if not store:
        # Log unknown store but don't fail
        await db.webhook_logs.insert_one({
            "log_id": f"wlog_{uuid.uuid4().hex[:12]}",
            "source": "shopify",
            "event": "orders/create",
            "shop_domain": shop_domain,
            "status": "store_not_found",
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        return {"status": "store_not_found", "shop_domain": shop_domain}
    
    store_id = store["store_id"]
    store_name = store.get("name", "")
    external_id = str(shopify_order.get("id", ""))
    
    # Check if order already exists
    existing = await db.fulfillment_orders.find_one({
        "store_id": store_id,
        "external_id": external_id
    })
    
    if existing:
        return {"status": "already_exists", "order_id": existing["order_id"]}
    
    # Skip if already fulfilled
    if shopify_order.get("fulfillment_status") == "fulfilled":
        return {"status": "skipped", "reason": "already_fulfilled"}
    
    # Transform and save order
    order_doc = transform_shopify_order(shopify_order, store_id, store_name)
    await db.fulfillment_orders.insert_one(order_doc)
    
    # Log webhook
    await db.webhook_logs.insert_one({
        "log_id": f"wlog_{uuid.uuid4().hex[:12]}",
        "source": "shopify",
        "event": "orders/create",
        "shop_domain": shop_domain,
        "store_id": store_id,
        "order_id": order_doc["order_id"],
        "external_id": external_id,
        "status": "created",
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    return {"status": "created", "order_id": order_doc["order_id"]}


@router.post("/shopify/orders/updated")
async def shopify_order_updated(
    request: Request,
    x_shopify_hmac_sha256: Optional[str] = Header(None),
    x_shopify_shop_domain: Optional[str] = Header(None)
):
    """Handle Shopify order updated webhook"""
    body = await request.body()
    
    # Verify webhook signature
    if SHOPIFY_WEBHOOK_SECRET and x_shopify_hmac_sha256:
        if not verify_shopify_webhook(body, x_shopify_hmac_sha256, SHOPIFY_WEBHOOK_SECRET):
            raise HTTPException(status_code=401, detail="Invalid webhook signature")
    
    import json
    try:
        shopify_order = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")
    
    shop_domain = x_shopify_shop_domain or ""
    store = await db.stores.find_one({
        "$or": [
            {"shop_url": {"$regex": shop_domain, "$options": "i"}},
            {"shop_url": shop_domain}
        ]
    })
    
    if not store:
        return {"status": "store_not_found"}
    
    store_id = store["store_id"]
    store_name = store.get("name", "")
    external_id = str(shopify_order.get("id", ""))
    
    # Find existing order
    existing = await db.fulfillment_orders.find_one({
        "store_id": store_id,
        "external_id": external_id
    })
    
    if not existing:
        # Create new if doesn't exist and not fulfilled
        if shopify_order.get("fulfillment_status") != "fulfilled":
            order_doc = transform_shopify_order(shopify_order, store_id, store_name)
            await db.fulfillment_orders.insert_one(order_doc)
            return {"status": "created", "order_id": order_doc["order_id"]}
        return {"status": "skipped", "reason": "fulfilled_and_not_tracked"}
    
    # Update existing order but preserve local workflow state
    order_doc = transform_shopify_order(shopify_order, store_id, store_name)
    order_doc["order_id"] = existing["order_id"]
    order_doc["created_at"] = existing["created_at"]
    order_doc["status"] = existing.get("status", "pending")
    order_doc["fulfillment_stage_id"] = existing.get("fulfillment_stage_id")
    order_doc["fulfillment_stage_name"] = existing.get("fulfillment_stage_name")
    order_doc["assigned_to"] = existing.get("assigned_to")
    order_doc["batch_id"] = existing.get("batch_id")
    
    # Preserve qty_done for items
    existing_items = {i.get("sku"): i for i in existing.get("items", [])}
    for item in order_doc["items"]:
        if item["sku"] in existing_items:
            item["qty_done"] = existing_items[item["sku"]].get("qty_done", 0)
    
    await db.fulfillment_orders.update_one(
        {"order_id": existing["order_id"]},
        {"$set": order_doc}
    )
    
    return {"status": "updated", "order_id": existing["order_id"]}


@router.post("/shopify/orders/cancelled")
async def shopify_order_cancelled(
    request: Request,
    x_shopify_hmac_sha256: Optional[str] = Header(None),
    x_shopify_shop_domain: Optional[str] = Header(None)
):
    """Handle Shopify order cancelled webhook"""
    body = await request.body()
    
    if SHOPIFY_WEBHOOK_SECRET and x_shopify_hmac_sha256:
        if not verify_shopify_webhook(body, x_shopify_hmac_sha256, SHOPIFY_WEBHOOK_SECRET):
            raise HTTPException(status_code=401, detail="Invalid webhook signature")
    
    import json
    try:
        shopify_order = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")
    
    shop_domain = x_shopify_shop_domain or ""
    store = await db.stores.find_one({
        "$or": [
            {"shop_url": {"$regex": shop_domain, "$options": "i"}},
            {"shop_url": shop_domain}
        ]
    })
    
    if not store:
        return {"status": "store_not_found"}
    
    external_id = str(shopify_order.get("id", ""))
    
    # Update order status to cancelled
    result = await db.fulfillment_orders.update_one(
        {"store_id": store["store_id"], "external_id": external_id},
        {"$set": {
            "status": "cancelled",
            "cancelled_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    if result.modified_count > 0:
        return {"status": "cancelled"}
    return {"status": "not_found"}


@router.post("/etsy/orders/create")
async def etsy_order_created(request: Request):
    """Handle Etsy order webhook (push notification)
    
    Note: Etsy uses push notifications which need to be set up through their API.
    This endpoint receives the notification and syncs the order.
    """
    body = await request.body()
    
    import json
    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")
    
    # Etsy sends receipt_id in the notification
    receipt_id = payload.get("receipt_id")
    shop_id = payload.get("shop_id")
    
    if not receipt_id or not shop_id:
        return {"status": "invalid_payload"}
    
    # Find store by Etsy shop ID
    store = await db.stores.find_one({
        "platform": "etsy",
        "$or": [
            {"etsy_shop_id": str(shop_id)},
            {"shop_id": str(shop_id)}
        ]
    })
    
    if not store:
        await db.webhook_logs.insert_one({
            "log_id": f"wlog_{uuid.uuid4().hex[:12]}",
            "source": "etsy",
            "event": "orders/create",
            "shop_id": shop_id,
            "receipt_id": receipt_id,
            "status": "store_not_found",
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        return {"status": "store_not_found"}
    
    # Trigger a sync for this specific order
    # The full sync logic handles the order transformation
    from services.etsy_service import sync_orders_from_etsy_store
    
    result = await sync_orders_from_etsy_store(store["store_id"], days_back=1)
    
    return {
        "status": "synced",
        "store_id": store["store_id"],
        "created": result.get("created", 0),
        "updated": result.get("updated", 0)
    }


@router.get("/logs")
async def get_webhook_logs(limit: int = 100):
    """Get recent webhook logs (for debugging)"""
    logs = await db.webhook_logs.find(
        {}, {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    
    return logs


@router.get("/status")
async def webhook_status():
    """Get webhook configuration status"""
    stores = await db.stores.find(
        {"platform": {"$in": ["shopify", "etsy"]}},
        {"_id": 0, "store_id": 1, "name": 1, "platform": 1, "shop_url": 1}
    ).to_list(100)
    
    # Get recent webhook activity
    recent_logs = await db.webhook_logs.find(
        {}, {"_id": 0}
    ).sort("created_at", -1).limit(10).to_list(10)
    
    return {
        "webhook_secret_configured": bool(SHOPIFY_WEBHOOK_SECRET),
        "stores": stores,
        "recent_activity": recent_logs,
        "endpoints": {
            "shopify_order_create": "/api/webhooks/shopify/orders/create",
            "shopify_order_update": "/api/webhooks/shopify/orders/updated",
            "shopify_order_cancel": "/api/webhooks/shopify/orders/cancelled",
            "etsy_order_create": "/api/webhooks/etsy/orders/create"
        }
    }


@router.post("/shopify/register/{store_id}")
async def register_shopify_webhooks(store_id: str, webhook_base_url: str):
    """Register order webhooks for a Shopify store
    
    Args:
        store_id: The local store ID
        webhook_base_url: The base URL for webhook callbacks (e.g., https://gingerblueapp.com)
    
    This will register webhooks for:
    - orders/create
    - orders/updated  
    - orders/cancelled
    """
    from services.shopify_service import ShopifyService
    
    # Get store from database
    store = await db.stores.find_one({"store_id": store_id, "platform": "shopify"})
    if not store:
        raise HTTPException(status_code=404, detail="Shopify store not found")
    
    shop_url = store.get("shop_url") or store.get("api_url")
    access_token = store.get("access_token")
    
    if not shop_url or not access_token:
        raise HTTPException(status_code=400, detail="Store missing shop_url or access_token")
    
    # Clean webhook_base_url
    webhook_base_url = webhook_base_url.rstrip("/")
    
    # Initialize Shopify service and register webhooks
    service = ShopifyService(shop_url, access_token)
    result = await service.register_order_webhooks(webhook_base_url)
    
    # Log the registration
    await db.webhook_logs.insert_one({
        "log_id": f"wlog_{uuid.uuid4().hex[:12]}",
        "source": "shopify",
        "event": "webhooks/register",
        "store_id": store_id,
        "webhook_base_url": webhook_base_url,
        "result": result,
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    # Update store with webhook info
    await db.stores.update_one(
        {"store_id": store_id},
        {"$set": {
            "webhooks_registered": result.get("success", False),
            "webhook_base_url": webhook_base_url,
            "webhooks_updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return result


@router.get("/shopify/list/{store_id}")
async def list_shopify_webhooks(store_id: str):
    """List all registered webhooks for a Shopify store"""
    from services.shopify_service import ShopifyService
    
    store = await db.stores.find_one({"store_id": store_id, "platform": "shopify"})
    if not store:
        raise HTTPException(status_code=404, detail="Shopify store not found")
    
    shop_url = store.get("shop_url") or store.get("api_url")
    access_token = store.get("access_token")
    
    if not shop_url or not access_token:
        raise HTTPException(status_code=400, detail="Store missing shop_url or access_token")
    
    service = ShopifyService(shop_url, access_token)
    webhooks = await service.get_webhooks()
    
    return {
        "store_id": store_id,
        "store_name": store.get("name"),
        "webhooks": webhooks
    }


@router.delete("/shopify/{store_id}/{webhook_id}")
async def delete_shopify_webhook(store_id: str, webhook_id: str):
    """Delete a specific webhook from a Shopify store"""
    from services.shopify_service import ShopifyService
    
    store = await db.stores.find_one({"store_id": store_id, "platform": "shopify"})
    if not store:
        raise HTTPException(status_code=404, detail="Shopify store not found")
    
    shop_url = store.get("shop_url") or store.get("api_url")
    access_token = store.get("access_token")
    
    if not shop_url or not access_token:
        raise HTTPException(status_code=400, detail="Store missing shop_url or access_token")
    
    service = ShopifyService(shop_url, access_token)
    result = await service.delete_webhook(webhook_id)
    
    return result
