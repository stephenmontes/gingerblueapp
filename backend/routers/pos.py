"""
Point of Sale (POS) Router
Handles in-store order creation with Shopify sync
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from pydantic import BaseModel
import uuid
import httpx
import logging

from database import db
from models.user import User
from dependencies import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/pos", tags=["pos"])

API_VERSION = "2024-10"


# Pydantic Models
class POSCustomer(BaseModel):
    first_name: str
    last_name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    company: Optional[str] = None
    address1: Optional[str] = None
    address2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip: Optional[str] = None
    country: Optional[str] = "US"
    tax_exempt: bool = False
    note: Optional[str] = None


class POSLineItem(BaseModel):
    product_id: Optional[str] = None
    variant_id: Optional[str] = None
    sku: Optional[str] = None
    title: str
    quantity: int
    price: float
    taxable: bool = True
    is_custom: bool = False
    image: Optional[str] = None
    discount_type: Optional[str] = None  # "percentage" or "fixed"
    discount_value: float = 0


class POSDiscount(BaseModel):
    type: str = "percentage"  # "percentage" or "fixed"
    value: float = 0
    reason: Optional[str] = None


class POSShipping(BaseModel):
    title: str = "Standard Shipping"
    price: float = 0.0
    code: Optional[str] = "standard"


class POSOrderCreate(BaseModel):
    store_id: str
    customer: Optional[POSCustomer] = None
    customer_id: Optional[str] = None  # Existing customer ID
    line_items: List[POSLineItem]
    shipping: Optional[POSShipping] = None
    ship_all_items: bool = True
    tax_exempt: bool = False
    note: Optional[str] = None
    tags: List[str] = []
    send_receipt: bool = False
    financial_status: str = "pending"  # pending, paid, partially_paid
    order_discount: Optional[POSDiscount] = None  # Order-level discount
    is_draft: bool = False  # Save as draft instead of syncing to Shopify
    requested_ship_date: Optional[str] = None  # ISO date string for scheduling


# Helper functions
async def get_shopify_credentials(store_id: str) -> tuple:
    """Get Shopify credentials for a store"""
    store = await db.stores.find_one({"store_id": store_id}, {"_id": 0})
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    
    if store.get("platform") != "shopify":
        raise HTTPException(status_code=400, detail="Store is not a Shopify store")
    
    shop_url = store.get("shop_url", "")
    access_token = store.get("access_token", "")
    
    if not shop_url or not access_token:
        raise HTTPException(status_code=400, detail="Store missing Shopify credentials")
    
    # Normalize shop URL
    shop_url = shop_url.replace("https://", "").replace("http://", "").rstrip("/")
    if not shop_url.endswith(".myshopify.com"):
        shop_url = f"{shop_url}.myshopify.com"
    
    return shop_url, access_token, store


async def create_shopify_order(shop_url: str, access_token: str, order_data: dict) -> dict:
    """Create order in Shopify"""
    base_url = f"https://{shop_url}/admin/api/{API_VERSION}"
    headers = {
        "X-Shopify-Access-Token": access_token,
        "Content-Type": "application/json"
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{base_url}/orders.json",
            json={"order": order_data},
            headers=headers,
            timeout=30.0
        )
        
        if response.status_code not in [200, 201]:
            logger.error(f"Shopify order creation failed: {response.text}")
            raise HTTPException(
                status_code=response.status_code, 
                detail=f"Shopify error: {response.text}"
            )
        
        return response.json().get("order", {})


# API Endpoints
@router.get("/stores")
async def get_pos_stores(user: User = Depends(get_current_user)):
    """Get Shopify stores available for POS"""
    stores = await db.stores.find(
        {"platform": "shopify", "is_active": {"$ne": False}},
        {"_id": 0, "store_id": 1, "name": 1, "shop_url": 1}
    ).to_list(100)
    
    return {"stores": stores}


@router.get("/next-order-number")
async def get_next_order_number(user: User = Depends(get_current_user)):
    """Get the next POS order number for preview"""
    next_number = await get_next_pos_order_number()
    return {"next_order_number": next_number}


@router.get("/products/search")
async def search_products(
    store_id: str,
    query: str = "",
    barcode: Optional[str] = None,
    sku: Optional[str] = None,
    limit: int = 20,
    user: User = Depends(get_current_user)
):
    """Search products by barcode, SKU, title, or tag"""
    # Check if store has any products
    total_products = await db.products.count_documents({"store_id": store_id})
    
    search_filter = {"store_id": store_id}
    
    if barcode:
        # Exact barcode match
        search_filter["$or"] = [
            {"barcode": barcode},
            {"variants.barcode": barcode}
        ]
    elif sku:
        # Exact SKU match
        search_filter["$or"] = [
            {"sku": sku.upper()},
            {"variants.sku": sku.upper()}
        ]
    elif query:
        # Text search on title, tags, SKU
        search_filter["$or"] = [
            {"title": {"$regex": query, "$options": "i"}},
            {"sku": {"$regex": query, "$options": "i"}},
            {"tags": {"$regex": query, "$options": "i"}},
            {"barcode": {"$regex": query, "$options": "i"}},
            {"variants.sku": {"$regex": query, "$options": "i"}},
            {"variants.barcode": {"$regex": query, "$options": "i"}}
        ]
    
    products = await db.products.find(
        search_filter,
        {"_id": 0}
    ).limit(limit).to_list(limit)
    
    return {
        "products": products, 
        "count": len(products),
        "total_in_store": total_products,
        "store_id": store_id
    }


@router.get("/products/barcode/{barcode}")
async def get_product_by_barcode(
    barcode: str,
    store_id: str,
    user: User = Depends(get_current_user)
):
    """Get product by exact barcode match - for scanner"""
    # Try to find by product barcode or variant barcode
    product = await db.products.find_one(
        {
            "store_id": store_id,
            "$or": [
                {"barcode": barcode},
                {"variants.barcode": barcode}
            ]
        },
        {"_id": 0}
    )
    
    if not product:
        raise HTTPException(status_code=404, detail="Product not found with this barcode")
    
    # Find the matching variant if it was a variant barcode
    matching_variant = None
    for variant in product.get("variants", []):
        if variant.get("barcode") == barcode:
            matching_variant = variant
            break
    
    return {
        "product": product,
        "matched_variant": matching_variant
    }


@router.get("/customers/search")
async def search_customers(
    store_id: str,
    query: str = "",
    limit: int = 20,
    user: User = Depends(get_current_user)
):
    """Search customers by name, email, phone, company, or address"""
    search_filter = {"store_id": store_id}
    
    if query:
        search_filter["$or"] = [
            {"name": {"$regex": query, "$options": "i"}},
            {"first_name": {"$regex": query, "$options": "i"}},
            {"last_name": {"$regex": query, "$options": "i"}},
            {"email": {"$regex": query, "$options": "i"}},
            {"phone": {"$regex": query, "$options": "i"}},
            {"company": {"$regex": query, "$options": "i"}},
            {"default_address.city": {"$regex": query, "$options": "i"}},
            {"default_address.state": {"$regex": query, "$options": "i"}},
            {"default_address.address1": {"$regex": query, "$options": "i"}}
        ]
    
    customers = await db.customers.find(
        search_filter,
        {"_id": 0, "customer_id": 1, "name": 1, "full_name": 1, "first_name": 1, "last_name": 1,
         "email": 1, "phone": 1, "company": 1, "default_address": 1, 
         "tax_exempt": 1, "note": 1, "tags": 1, "orders_count": 1, 
         "total_spent": 1, "created_at": 1}
    ).sort([("full_name", 1)]).limit(limit).to_list(limit)
    
    # Normalize fields for frontend compatibility
    for cust in customers:
        # Normalize name field (use full_name if name is not present)
        if not cust.get("name") and cust.get("full_name"):
            cust["name"] = cust["full_name"]
        elif not cust.get("name"):
            cust["name"] = f"{cust.get('first_name', '')} {cust.get('last_name', '')}".strip()
        
        # Populate company from default_address if not present at top level
        if not cust.get("company") and cust.get("default_address", {}).get("company"):
            cust["company"] = cust["default_address"]["company"]
    
    return {"customers": customers, "count": len(customers)}


@router.post("/customers")
async def create_customer(
    store_id: str,
    customer: POSCustomer,
    user: User = Depends(get_current_user)
):
    """Create a new customer (local + Shopify)"""
    shop_url, access_token, store = await get_shopify_credentials(store_id)
    
    # Create in Shopify
    shopify_customer_data = {
        "first_name": customer.first_name,
        "last_name": customer.last_name,
        "email": customer.email,
        "phone": customer.phone,
        "tax_exempt": customer.tax_exempt,
        "note": customer.note,
        "addresses": []
    }
    
    if customer.address1:
        shopify_customer_data["addresses"].append({
            "first_name": customer.first_name,
            "last_name": customer.last_name,
            "company": customer.company,
            "address1": customer.address1,
            "address2": customer.address2,
            "city": customer.city,
            "province": customer.state,
            "zip": customer.zip,
            "country": customer.country,
            "phone": customer.phone,
            "default": True
        })
    
    base_url = f"https://{shop_url}/admin/api/{API_VERSION}"
    headers = {
        "X-Shopify-Access-Token": access_token,
        "Content-Type": "application/json"
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{base_url}/customers.json",
            json={"customer": shopify_customer_data},
            headers=headers,
            timeout=30.0
        )
        
        if response.status_code not in [200, 201]:
            logger.error(f"Shopify customer creation failed: {response.text}")
            raise HTTPException(status_code=400, detail=f"Shopify error: {response.text}")
        
        shopify_customer = response.json().get("customer", {})
    
    # Save locally
    customer_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    local_customer = {
        "customer_id": customer_id,
        "store_id": store_id,
        "external_id": str(shopify_customer.get("id", "")),
        "platform": "shopify",
        "name": f"{customer.first_name} {customer.last_name}",
        "first_name": customer.first_name,
        "last_name": customer.last_name,
        "email": customer.email,
        "phone": customer.phone,
        "company": customer.company,
        "tax_exempt": customer.tax_exempt,
        "default_address": {
            "address1": customer.address1,
            "address2": customer.address2,
            "city": customer.city,
            "state": customer.state,
            "zip": customer.zip,
            "country": customer.country
        },
        "note": customer.note,
        "created_at": now,
        "updated_at": now
    }
    
    await db.customers.insert_one(local_customer)
    del local_customer["_id"]
    
    return {"customer": local_customer, "shopify_id": shopify_customer.get("id")}


async def get_next_pos_order_number() -> str:
    """Generate next POS order number (pos21000, pos21001, etc.)"""
    # Find the highest existing POS order number
    last_pos_order = await db.orders.find_one(
        {"pos_order_number": {"$regex": "^pos\\d+$"}},
        {"pos_order_number": 1},
        sort=[("pos_order_number", -1)]
    )
    
    if last_pos_order and last_pos_order.get("pos_order_number"):
        # Extract the number part and increment
        last_num = int(last_pos_order["pos_order_number"].replace("pos", ""))
        next_num = last_num + 1
    else:
        # Start at 21000
        next_num = 21000
    
    return f"pos{next_num}"


@router.post("/orders")
async def create_pos_order(
    order: POSOrderCreate,
    user: User = Depends(get_current_user)
):
    """Create a new POS order - either draft or sync to Shopify"""
    store = await db.stores.find_one({"store_id": order.store_id}, {"_id": 0})
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    
    # Generate POS order number
    pos_order_number = await get_next_pos_order_number()
    
    # Calculate totals with discounts
    subtotal = 0
    items_for_db = []
    for item in order.line_items:
        item_total = item.price * item.quantity
        item_discount = 0
        
        if item.discount_type and item.discount_value > 0:
            if item.discount_type == "percentage":
                item_discount = item_total * (item.discount_value / 100)
            else:  # fixed
                item_discount = min(item.discount_value, item_total)
        
        final_item_total = item_total - item_discount
        subtotal += final_item_total
        
        items_for_db.append({
            "product_id": item.product_id,
            "variant_id": item.variant_id,
            "sku": item.sku or "",
            "name": item.title,
            "quantity": item.quantity,
            "price": item.price,
            "discount_type": item.discount_type,
            "discount_value": item.discount_value,
            "discount_amount": item_discount,
            "line_total": final_item_total,
            "image": item.image,
            "qty_done": 0
        })
    
    # Apply order-level discount
    order_discount_amount = 0
    if order.order_discount and order.order_discount.value > 0:
        if order.order_discount.type == "percentage":
            order_discount_amount = subtotal * (order.order_discount.value / 100)
        else:  # fixed
            order_discount_amount = min(order.order_discount.value, subtotal)
    
    subtotal_after_discount = subtotal - order_discount_amount
    shipping_total = order.shipping.price if order.shipping and order.ship_all_items else 0
    total_price = subtotal_after_discount + shipping_total
    
    order_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    # Build customer info
    customer_name = ""
    customer_email = ""
    customer_data = None
    
    if order.customer_id:
        existing_customer = await db.customers.find_one(
            {"customer_id": order.customer_id},
            {"_id": 0}
        )
        if existing_customer:
            customer_name = existing_customer.get("name", "")
            customer_email = existing_customer.get("email", "")
            customer_data = existing_customer
    elif order.customer:
        customer_name = f"{order.customer.first_name} {order.customer.last_name}"
        customer_email = order.customer.email or ""
        customer_data = order.customer.dict()
    
    # If draft, save locally only
    if order.is_draft:
        local_order = {
            "order_id": order_id,
            "pos_order_number": pos_order_number,
            "store_id": order.store_id,
            "store_name": store.get("name", ""),
            "platform": "pos",
            "external_id": None,
            "order_number": pos_order_number,
            "customer_id": order.customer_id,
            "customer_name": customer_name,
            "customer_email": customer_email,
            "customer_data": customer_data,
            "status": "draft",
            "financial_status": "pending",
            "fulfillment_status": None,
            "subtotal": subtotal,
            "order_discount": order.order_discount.dict() if order.order_discount else None,
            "order_discount_amount": order_discount_amount,
            "shipping": order.shipping.dict() if order.shipping else None,
            "shipping_total": shipping_total,
            "total_price": round(total_price, 2),
            "items": items_for_db,
            "total_items": sum(item.quantity for item in order.line_items),
            "items_completed": 0,
            "shipping_address": {},
            "tags": ["pos-draft", pos_order_number] + order.tags,
            "notes": order.note,
            "tax_exempt": order.tax_exempt,
            "ship_all_items": order.ship_all_items,
            "requested_ship_date": order.requested_ship_date,
            "source": "pos",
            "is_draft": True,
            "created_by": user.user_id,
            "created_by_name": user.name,
            "order_date": now,
            "created_at": now,
            "updated_at": now
        }
        
        await db.orders.insert_one(local_order)
        del local_order["_id"]
        
        logger.info(f"POS draft order created: {pos_order_number} ({order_id})")
        
        return {
            "order": local_order,
            "pos_order_number": pos_order_number,
            "is_draft": True,
            "shopify_order_id": None,
            "shopify_order_number": None
        }
    
    # For live orders, sync to Shopify
    shop_url, access_token, store = await get_shopify_credentials(order.store_id)
    
    # Build Shopify order
    shopify_line_items = []
    for item in order.line_items:
        # Calculate discounted price for Shopify
        item_price = item.price
        if item.discount_type and item.discount_value > 0:
            if item.discount_type == "percentage":
                item_price = item.price * (1 - item.discount_value / 100)
            else:
                item_price = max(0, item.price - (item.discount_value / item.quantity))
        
        line_item = {
            "title": item.title,
            "quantity": item.quantity,
            "price": str(round(item_price, 2)),
            "taxable": item.taxable
        }
        
        if item.variant_id and not item.is_custom:
            line_item["variant_id"] = int(item.variant_id)
        
        if item.sku:
            line_item["sku"] = item.sku
        
        shopify_line_items.append(line_item)
    
    shopify_order_data = {
        "line_items": shopify_line_items,
        "financial_status": order.financial_status,
        "send_receipt": order.send_receipt,
        "tags": ", ".join(["pos-order", pos_order_number] + order.tags),
        "note": f"POS Order #{pos_order_number}" + (f" - {order.note}" if order.note else "")
    }
    
    # Add order-level discount to Shopify
    if order_discount_amount > 0:
        shopify_order_data["discount_codes"] = [{
            "code": f"POS-{order.order_discount.type.upper()}-{order.order_discount.value}",
            "amount": str(round(order_discount_amount, 2)),
            "type": "fixed_amount"
        }]
    
    # Add customer
    if order.customer_id:
        existing_customer = await db.customers.find_one(
            {"customer_id": order.customer_id},
            {"_id": 0, "external_id": 1}
        )
        if existing_customer and existing_customer.get("external_id"):
            shopify_order_data["customer"] = {"id": int(existing_customer["external_id"])}
    elif order.customer:
        shopify_order_data["customer"] = {
            "first_name": order.customer.first_name,
            "last_name": order.customer.last_name,
            "email": order.customer.email,
            "phone": order.customer.phone
        }
        
        if order.customer.address1:
            shopify_order_data["shipping_address"] = {
                "first_name": order.customer.first_name,
                "last_name": order.customer.last_name,
                "company": order.customer.company,
                "address1": order.customer.address1,
                "address2": order.customer.address2,
                "city": order.customer.city,
                "province": order.customer.state,
                "zip": order.customer.zip,
                "country": order.customer.country,
                "phone": order.customer.phone
            }
            shopify_order_data["billing_address"] = shopify_order_data["shipping_address"].copy()
    
    # Add shipping
    if order.shipping and order.ship_all_items:
        shopify_order_data["shipping_lines"] = [{
            "title": order.shipping.title,
            "price": str(order.shipping.price),
            "code": order.shipping.code
        }]
    
    # Tax exempt
    if order.tax_exempt:
        shopify_order_data["tax_exempt"] = True
    
    # Create in Shopify
    logger.info(f"Creating Shopify order: {shopify_order_data}")
    shopify_order = await create_shopify_order(shop_url, access_token, shopify_order_data)
    
    # Save locally
    local_order = {
        "order_id": order_id,
        "pos_order_number": pos_order_number,
        "store_id": order.store_id,
        "store_name": store.get("name", ""),
        "platform": "shopify",
        "external_id": str(shopify_order.get("id", "")),
        "order_number": str(shopify_order.get("order_number", "")),
        "customer_id": order.customer_id,
        "customer_name": shopify_order.get("customer", {}).get("first_name", "") + " " + shopify_order.get("customer", {}).get("last_name", ""),
        "customer_email": shopify_order.get("customer", {}).get("email", ""),
        "status": "active",
        "financial_status": shopify_order.get("financial_status", order.financial_status),
        "fulfillment_status": shopify_order.get("fulfillment_status"),
        "subtotal": subtotal,
        "order_discount": order.order_discount.dict() if order.order_discount else None,
        "order_discount_amount": order_discount_amount,
        "shipping_total": shipping_total,
        "total_price": float(shopify_order.get("total_price", total_price)),
        "items": items_for_db,
        "total_items": sum(item.quantity for item in order.line_items),
        "items_completed": 0,
        "shipping_address": shopify_order.get("shipping_address", {}),
        "tags": ["pos-order", pos_order_number] + order.tags,
        "notes": order.note,
        "tax_exempt": order.tax_exempt,
        "requested_ship_date": order.requested_ship_date,
        "source": "pos",
        "is_draft": False,
        "created_by": user.user_id,
        "created_by_name": user.name,
        "order_date": now,
        "created_at": now,
        "updated_at": now
    }
    
    await db.orders.insert_one(local_order)
    del local_order["_id"]
    
    # If ship date is set, create calendar event
    if order.requested_ship_date:
        try:
            await create_calendar_event_for_order(local_order)
        except Exception as e:
            logger.warning(f"Failed to create calendar event: {e}")
    
    logger.info(f"POS order created: {pos_order_number} ({order_id}) -> Shopify #{shopify_order.get('order_number')}")
    
    return {
        "order": local_order,
        "pos_order_number": pos_order_number,
        "is_draft": False,
        "shopify_order_id": shopify_order.get("id"),
        "shopify_order_number": shopify_order.get("order_number")
    }


async def create_calendar_event_for_order(order: dict):
    """Create a Google Calendar event for order ship date"""
    from routers.calendar import get_calendar_credentials
    
    try:
        credentials = await get_calendar_credentials()
        if not credentials:
            logger.info("No calendar credentials configured, skipping calendar event")
            return
        
        import httpx
        
        ship_date = order.get("requested_ship_date")
        if not ship_date:
            return
        
        # Build event
        event = {
            "summary": f"POS Order {order.get('pos_order_number', '')} - Ship",
            "description": f"Customer: {order.get('customer_name', 'N/A')}\nTotal: ${order.get('total_price', 0):.2f}\nItems: {order.get('total_items', 0)}\n\nOrder ID: {order.get('order_id', '')}",
            "start": {
                "date": ship_date
            },
            "end": {
                "date": ship_date
            },
            "colorId": "6"  # Orange for POS orders
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://www.googleapis.com/calendar/v3/calendars/primary/events",
                headers={
                    "Authorization": f"Bearer {credentials['access_token']}",
                    "Content-Type": "application/json"
                },
                json=event
            )
            
            if response.status_code == 200:
                logger.info(f"Calendar event created for order {order.get('pos_order_number')}")
            else:
                logger.warning(f"Failed to create calendar event: {response.text}")
    except Exception as e:
        logger.warning(f"Calendar event creation failed: {e}")


@router.get("/drafts")
async def get_draft_orders(
    store_id: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 50,
    user: User = Depends(get_current_user)
):
    """Get draft POS orders"""
    query = {"is_draft": True, "status": "draft"}
    
    if store_id:
        query["store_id"] = store_id
    
    if search:
        query["$or"] = [
            {"pos_order_number": {"$regex": search, "$options": "i"}},
            {"customer_name": {"$regex": search, "$options": "i"}},
            {"customer_email": {"$regex": search, "$options": "i"}},
            {"notes": {"$regex": search, "$options": "i"}},
            {"created_by_name": {"$regex": search, "$options": "i"}}
        ]
    
    drafts = await db.orders.find(
        query,
        {"_id": 0}
    ).sort([("created_at", -1)]).limit(limit).to_list(limit)
    
    # Add lock status for each draft
    for draft in drafts:
        draft["is_locked"] = bool(draft.get("locked_by"))
        draft["is_mine"] = draft.get("locked_by") == user.user_id or draft.get("created_by") == user.user_id
    
    return {"drafts": drafts, "count": len(drafts), "current_user_id": user.user_id}


@router.get("/drafts/{order_id}")
async def get_draft_order(
    order_id: str,
    user: User = Depends(get_current_user)
):
    """Get a single draft order for editing"""
    draft = await db.orders.find_one(
        {"order_id": order_id, "is_draft": True},
        {"_id": 0}
    )
    
    if not draft:
        raise HTTPException(status_code=404, detail="Draft order not found")
    
    # Check if draft is locked by another user
    locked_by = draft.get("locked_by")
    if locked_by and locked_by != user.user_id:
        locked_by_name = draft.get("locked_by_name", "another user")
        locked_at = draft.get("locked_at", "")
        raise HTTPException(
            status_code=423, 
            detail=f"Draft is currently being edited by {locked_by_name} (since {locked_at})"
        )
    
    # Lock the draft for this user
    await db.orders.update_one(
        {"order_id": order_id},
        {"$set": {
            "locked_by": user.user_id,
            "locked_by_name": user.name,
            "locked_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"draft": draft}


@router.post("/drafts/{order_id}/release")
async def release_draft_order(
    order_id: str,
    user: User = Depends(get_current_user)
):
    """Release/unlock a draft order so others can edit it"""
    result = await db.orders.update_one(
        {"order_id": order_id, "is_draft": True},
        {"$unset": {"locked_by": "", "locked_by_name": "", "locked_at": ""}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Draft order not found")
    
    return {"message": "Draft released", "order_id": order_id}


@router.delete("/drafts/{order_id}")
async def delete_draft_order(
    order_id: str,
    user: User = Depends(get_current_user)
):
    """Delete a draft order"""
    result = await db.orders.delete_one({"order_id": order_id, "is_draft": True})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Draft order not found")
    
    return {"message": "Draft deleted", "order_id": order_id}


@router.post("/drafts/{order_id}/complete")
async def complete_draft_order(
    order_id: str,
    user: User = Depends(get_current_user)
):
    """Convert a draft order to a live Shopify order"""
    draft = await db.orders.find_one({"order_id": order_id, "is_draft": True}, {"_id": 0})
    
    if not draft:
        raise HTTPException(status_code=404, detail="Draft order not found")
    
    # Rebuild order data from draft
    line_items = [
        POSLineItem(
            product_id=item.get("product_id"),
            variant_id=item.get("variant_id"),
            sku=item.get("sku"),
            title=item.get("name"),
            quantity=item.get("quantity"),
            price=item.get("price"),
            image=item.get("image"),
            discount_type=item.get("discount_type"),
            discount_value=item.get("discount_value", 0)
        )
        for item in draft.get("items", [])
    ]
    
    order_discount = None
    if draft.get("order_discount"):
        order_discount = POSDiscount(**draft["order_discount"])
    
    shipping = None
    if draft.get("shipping"):
        shipping = POSShipping(**draft["shipping"])
    
    customer = None
    if draft.get("customer_data") and isinstance(draft["customer_data"], dict):
        if "first_name" in draft["customer_data"]:
            customer = POSCustomer(**draft["customer_data"])
    
    order_data = POSOrderCreate(
        store_id=draft["store_id"],
        customer=customer,
        customer_id=draft.get("customer_id"),
        line_items=line_items,
        shipping=shipping,
        ship_all_items=draft.get("ship_all_items", True),
        tax_exempt=draft.get("tax_exempt", False),
        note=draft.get("notes"),
        tags=[t for t in draft.get("tags", []) if t not in ["pos-draft", draft.get("pos_order_number", "")]],
        order_discount=order_discount,
        is_draft=False
    )
    
    # Delete the draft
    await db.orders.delete_one({"order_id": order_id})
    
    # Create the live order (reuse existing logic)
    return await create_pos_order(order_data, user)


@router.get("/orders/{order_id}/sync")
async def sync_order_from_shopify(
    order_id: str,
    user: User = Depends(get_current_user)
):
    """Sync order status from Shopify"""
    order = await db.orders.find_one({"order_id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    if not order.get("external_id"):
        raise HTTPException(status_code=400, detail="Order not linked to Shopify")
    
    shop_url, access_token, store = await get_shopify_credentials(order["store_id"])
    
    base_url = f"https://{shop_url}/admin/api/{API_VERSION}"
    headers = {
        "X-Shopify-Access-Token": access_token,
        "Content-Type": "application/json"
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{base_url}/orders/{order['external_id']}.json",
            headers=headers,
            timeout=30.0
        )
        
        if response.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to fetch from Shopify")
        
        shopify_order = response.json().get("order", {})
    
    # Update local order
    updates = {
        "financial_status": shopify_order.get("financial_status"),
        "fulfillment_status": shopify_order.get("fulfillment_status"),
        "total_price": float(shopify_order.get("total_price", 0)),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "last_synced_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Update status based on fulfillment
    if shopify_order.get("fulfillment_status") == "fulfilled":
        updates["status"] = "completed"
    elif shopify_order.get("cancelled_at"):
        updates["status"] = "cancelled"
    
    await db.orders.update_one(
        {"order_id": order_id},
        {"$set": updates}
    )
    
    return {
        "message": "Order synced",
        "financial_status": updates["financial_status"],
        "fulfillment_status": updates["fulfillment_status"],
        "status": updates.get("status", order.get("status"))
    }
