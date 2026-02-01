"""
Shopify Product Sync Service
Handles fetching and syncing products from Shopify stores
"""
import httpx
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone, timedelta
import uuid
import asyncio
from database import db

API_VERSION = "2024-10"

class ShopifyService:
    def __init__(self, shop_url: str, access_token: str):
        """Initialize Shopify API client"""
        # Clean up shop URL
        self.shop_url = shop_url.replace("https://", "").replace("http://", "").rstrip("/")
        if not self.shop_url.endswith(".myshopify.com"):
            self.shop_url = f"{self.shop_url}.myshopify.com"
        
        self.access_token = access_token
        self.base_url = f"https://{self.shop_url}/admin/api/{API_VERSION}"
        self.headers = {
            "X-Shopify-Access-Token": access_token,
            "Content-Type": "application/json"
        }
    
    async def test_connection(self) -> Dict[str, Any]:
        """Test API connection by fetching shop info"""
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(
                    f"{self.base_url}/shop.json",
                    headers=self.headers,
                    timeout=30.0
                )
                response.raise_for_status()
                return {"success": True, "shop": response.json().get("shop", {})}
            except httpx.HTTPStatusError as e:
                return {"success": False, "error": f"HTTP {e.response.status_code}: {e.response.text}"}
            except Exception as e:
                return {"success": False, "error": str(e)}
    
    async def fetch_products(self, limit: int = 250) -> List[Dict[str, Any]]:
        """Fetch all products with pagination"""
        products = []
        url = f"{self.base_url}/products.json?limit={limit}"
        
        async with httpx.AsyncClient() as client:
            while url:
                response = await client.get(url, headers=self.headers, timeout=60.0)
                response.raise_for_status()
                
                data = response.json()
                products.extend(data.get("products", []))
                
                # Handle pagination via Link header
                link_header = response.headers.get("Link", "")
                url = None
                if 'rel="next"' in link_header:
                    for link in link_header.split(","):
                        if 'rel="next"' in link:
                            url = link.split(";")[0].strip("<> ")
                            break
                
                # Rate limiting - 2 req/sec
                await asyncio.sleep(0.5)
        
        return products
    
    async def fetch_product(self, product_id: str) -> Optional[Dict[str, Any]]:
        """Fetch a single product by ID"""
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(
                    f"{self.base_url}/products/{product_id}.json",
                    headers=self.headers,
                    timeout=30.0
                )
                response.raise_for_status()
                return response.json().get("product")
            except:
                return None
    
    async def fetch_orders(self, status: str = "any", limit: int = 250) -> List[Dict[str, Any]]:
        """Fetch orders from Shopify"""
        orders = []
        url = f"{self.base_url}/orders.json?status={status}&limit={limit}"
        
        async with httpx.AsyncClient() as client:
            while url:
                response = await client.get(url, headers=self.headers, timeout=60.0)
                response.raise_for_status()
                
                data = response.json()
                orders.extend(data.get("orders", []))
                
                # Handle pagination
                link_header = response.headers.get("Link", "")
                url = None
                if 'rel="next"' in link_header:
                    for link in link_header.split(","):
                        if 'rel="next"' in link:
                            url = link.split(";")[0].strip("<> ")
                            break
                
                await asyncio.sleep(0.5)
        
        return orders


def transform_shopify_product(shopify_product: Dict, store_id: str) -> Dict[str, Any]:
    """Transform Shopify product to our format"""
    product_id = f"prod_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    
    # Transform variants
    variants = []
    for v in shopify_product.get("variants", []):
        variant_id = f"var_{uuid.uuid4().hex[:8]}"
        variants.append({
            "variant_id": variant_id,
            "external_variant_id": str(v.get("id", "")),
            "sku": v.get("sku"),
            "barcode": v.get("barcode"),
            "title": v.get("title", "Default"),
            "price": float(v.get("price", 0)),
            "compare_at_price": float(v["compare_at_price"]) if v.get("compare_at_price") else None,
            "inventory_quantity": v.get("inventory_quantity", 0),
            "weight": v.get("weight"),
            "weight_unit": v.get("weight_unit", "lb"),
            "option1": v.get("option1"),
            "option2": v.get("option2"),
            "option3": v.get("option3"),
            "requires_shipping": v.get("requires_shipping", True),
            "taxable": v.get("taxable", True),
            "image_url": None  # Will be set from images
        })
    
    # Transform images
    images = []
    for img in shopify_product.get("images", []):
        image_id = f"img_{uuid.uuid4().hex[:8]}"
        images.append({
            "image_id": image_id,
            "external_image_id": str(img.get("id", "")),
            "src": img.get("src", ""),
            "alt": img.get("alt"),
            "position": img.get("position", 1),
            "width": img.get("width"),
            "height": img.get("height"),
            "variant_ids": [str(vid) for vid in img.get("variant_ids", [])]
        })
    
    # Map variant images
    for variant in variants:
        ext_var_id = variant["external_variant_id"]
        for img in images:
            if ext_var_id in img["variant_ids"]:
                variant["image_url"] = img["src"]
                break
        # If no specific image, use first image
        if not variant["image_url"] and images:
            variant["image_url"] = images[0]["src"]
    
    # Transform options
    options = []
    for opt in shopify_product.get("options", []):
        options.append({
            "name": opt.get("name"),
            "position": opt.get("position"),
            "values": opt.get("values", [])
        })
    
    return {
        "product_id": product_id,
        "external_id": str(shopify_product.get("id", "")),
        "store_id": store_id,
        "platform": "shopify",
        "title": shopify_product.get("title", ""),
        "handle": shopify_product.get("handle"),
        "description": shopify_product.get("body_html"),
        "vendor": shopify_product.get("vendor"),
        "product_type": shopify_product.get("product_type"),
        "tags": shopify_product.get("tags", "").split(", ") if shopify_product.get("tags") else [],
        "status": shopify_product.get("status", "active"),
        "is_synced": True,
        "variants": variants,
        "images": images,
        "options": options,
        "created_at": now,
        "updated_at": now,
        "last_synced_at": now,
        "external_created_at": shopify_product.get("created_at"),
        "external_updated_at": shopify_product.get("updated_at")
    }


async def sync_products_from_store(store_id: str) -> Dict[str, Any]:
    """Sync all products from a store"""
    # Get store details
    store = await db.stores.find_one({"store_id": store_id})
    if not store:
        return {"success": False, "error": "Store not found"}
    
    if store.get("platform") != "shopify":
        return {"success": False, "error": "Only Shopify stores are supported for product sync"}
    
    access_token = store.get("access_token")
    shop_url = store.get("shop_url")
    
    if not access_token or not shop_url:
        return {"success": False, "error": "Store credentials not configured"}
    
    # Initialize Shopify service
    service = ShopifyService(shop_url, access_token)
    
    # Test connection
    test_result = await service.test_connection()
    if not test_result["success"]:
        return {"success": False, "error": f"Connection failed: {test_result['error']}"}
    
    # Fetch products
    try:
        shopify_products = await service.fetch_products()
    except Exception as e:
        return {"success": False, "error": f"Failed to fetch products: {str(e)}"}
    
    # Sync results
    result = {
        "success": True,
        "store_id": store_id,
        "store_name": store.get("name", ""),
        "platform": "shopify",
        "total_products": len(shopify_products),
        "synced": 0,
        "created": 0,
        "updated": 0,
        "failed": 0,
        "errors": [],
        "synced_at": datetime.now(timezone.utc).isoformat()
    }
    
    for sp in shopify_products:
        try:
            external_id = str(sp.get("id", ""))
            
            # Get all SKUs from this product's variants
            product_skus = []
            for variant in sp.get("variants", []):
                sku = variant.get("sku", "").strip()
                if sku:
                    product_skus.append(sku)
            
            # Check if product already exists in this store
            existing = await db.products.find_one({
                "store_id": store_id,
                "external_id": external_id
            })
            
            # Check if any SKU already exists in another store
            existing_sku_product = None
            if product_skus and not existing:
                existing_sku_product = await db.products.find_one({
                    "variants.sku": {"$in": product_skus},
                    "store_id": {"$ne": store_id}
                })
            
            product_doc = transform_shopify_product(sp, store_id)
            
            if existing:
                # Update existing product from same store
                product_doc["product_id"] = existing["product_id"]
                product_doc["created_at"] = existing["created_at"]
                
                await db.products.update_one(
                    {"product_id": existing["product_id"]},
                    {"$set": product_doc}
                )
                result["updated"] += 1
            elif existing_sku_product:
                # SKU exists in another store - add this store as additional source
                # Update existing product to include this store's info
                await db.products.update_one(
                    {"product_id": existing_sku_product["product_id"]},
                    {
                        "$addToSet": {"store_ids": store_id},
                        "$set": {
                            "updated_at": datetime.now(timezone.utc).isoformat(),
                            "last_synced_at": datetime.now(timezone.utc).isoformat()
                        }
                    }
                )
                result["skipped_duplicate"] = result.get("skipped_duplicate", 0) + 1
            else:
                # Create new product
                product_doc["store_ids"] = [store_id]  # Track all stores with this product
                await db.products.insert_one(product_doc)
                result["created"] += 1
            
            result["synced"] += 1
            
        except Exception as e:
            result["failed"] += 1
            result["errors"].append(f"Product {sp.get('id', 'unknown')}: {str(e)}")
    
    # Update store last sync time
    await db.stores.update_one(
        {"store_id": store_id},
        {"$set": {"last_product_sync": datetime.now(timezone.utc).isoformat()}}
    )
    
    return result


async def get_product_for_order_item(sku: str, store_id: str = None) -> Optional[Dict]:
    """Find a product variant by SKU, optionally filtered by store"""
    query = {"variants.sku": sku}
    if store_id:
        query["store_id"] = store_id
    
    product = await db.products.find_one(query, {"_id": 0})
    if not product:
        return None
    
    # Find the matching variant
    for variant in product.get("variants", []):
        if variant.get("sku") == sku:
            return {
                "product_id": product["product_id"],
                "product_title": product["title"],
                "variant": variant,
                "images": product.get("images", [])
            }
    
    return None


async def get_product_image_by_sku(sku: str) -> Optional[str]:
    """Get product image URL by SKU"""
    product_info = await get_product_for_order_item(sku)
    if product_info:
        variant = product_info.get("variant", {})
        if variant.get("image_url"):
            return variant["image_url"]
        images = product_info.get("images", [])
        if images:
            return images[0].get("src")
    return None


def transform_shopify_order(shopify_order: Dict, store_id: str, store_name: str) -> Dict[str, Any]:
    """Transform Shopify order to our format"""
    order_id = f"ord_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    
    # Get customer info
    customer = shopify_order.get("customer", {}) or {}
    customer_name = f"{customer.get('first_name', '')} {customer.get('last_name', '')}".strip()
    if not customer_name:
        customer_name = shopify_order.get("billing_address", {}).get("name", "Unknown Customer")
    
    # Transform line items
    items = []
    for item in shopify_order.get("line_items", []):
        items.append({
            "line_item_id": str(item.get("id", "")),
            "product_id": str(item.get("product_id", "")),
            "variant_id": str(item.get("variant_id", "")),
            "sku": item.get("sku") or "",
            "name": item.get("name") or item.get("title", "Unknown Item"),
            "title": item.get("title", ""),
            "quantity": item.get("quantity", 1),
            "qty": item.get("quantity", 1),
            "qty_done": 0,
            "price": float(item.get("price", 0)),
            "variant_title": item.get("variant_title", ""),
            "fulfillment_status": item.get("fulfillment_status"),
            "requires_shipping": item.get("requires_shipping", True),
            "taxable": item.get("taxable", True),
        })
    
    # Get shipping address
    shipping_address = shopify_order.get("shipping_address") or {}
    
    return {
        "order_id": order_id,
        "external_id": str(shopify_order.get("id", "")),
        "order_number": str(shopify_order.get("order_number", "")),
        "store_id": store_id,
        "store_name": store_name,
        "platform": "shopify",
        "customer_name": customer_name,
        "customer_email": customer.get("email") or shopify_order.get("email"),
        "customer_phone": customer.get("phone") or shopify_order.get("phone"),
        "items": items,
        "line_items": items,  # Alias for compatibility
        "total_price": float(shopify_order.get("total_price", 0)),
        "subtotal_price": float(shopify_order.get("subtotal_price", 0)),
        "total_tax": float(shopify_order.get("total_tax", 0)),
        "currency": shopify_order.get("currency", "USD"),
        "financial_status": shopify_order.get("financial_status", ""),
        "fulfillment_status": shopify_order.get("fulfillment_status", "unfulfilled"),
        "status": "pending",
        "current_stage_id": None,
        "fulfillment_stage_id": "fulfill_orders",  # Default to first fulfillment stage
        "fulfillment_stage_name": "Orders",
        "assigned_to": None,
        "batch_id": None,
        "note": shopify_order.get("note"),
        "tags": shopify_order.get("tags", ""),
        "shipping_address": {
            "name": shipping_address.get("name", ""),
            "address1": shipping_address.get("address1", ""),
            "address2": shipping_address.get("address2", ""),
            "city": shipping_address.get("city", ""),
            "province": shipping_address.get("province", ""),
            "province_code": shipping_address.get("province_code", ""),
            "country": shipping_address.get("country", ""),
            "country_code": shipping_address.get("country_code", ""),
            "zip": shipping_address.get("zip", ""),
            "phone": shipping_address.get("phone", ""),
        } if shipping_address else None,
        "created_at": now,
        "updated_at": now,
        "synced_at": now,
        "external_created_at": shopify_order.get("created_at"),
        "external_updated_at": shopify_order.get("updated_at"),
    }


async def sync_orders_from_store(store_id: str, status: str = "any", days_back: int = 30) -> Dict[str, Any]:
    """Sync orders from a Shopify store"""
    # Get store details
    store = await db.stores.find_one({"store_id": store_id})
    if not store:
        return {"success": False, "error": "Store not found"}
    
    if store.get("platform") != "shopify":
        return {"success": False, "error": "Only Shopify stores are supported for order sync"}
    
    access_token = store.get("access_token")
    shop_url = store.get("shop_url")
    store_name = store.get("name", "")
    
    if not access_token or not shop_url:
        return {"success": False, "error": "Store credentials not configured"}
    
    # Initialize Shopify service
    service = ShopifyService(shop_url, access_token)
    
    # Test connection
    test_result = await service.test_connection()
    if not test_result["success"]:
        return {"success": False, "error": f"Connection failed: {test_result['error']}"}
    
    # Fetch orders
    try:
        shopify_orders = await service.fetch_orders(status=status)
    except Exception as e:
        return {"success": False, "error": f"Failed to fetch orders: {str(e)}"}
    
    # Filter orders by date if needed
    if days_back and days_back > 0:
        cutoff = datetime.now(timezone.utc) - timedelta(days=days_back)
        filtered_orders = []
        for order in shopify_orders:
            try:
                created = datetime.fromisoformat(order.get("created_at", "").replace("Z", "+00:00"))
                if created >= cutoff:
                    filtered_orders.append(order)
            except:
                filtered_orders.append(order)  # Include if date parsing fails
        shopify_orders = filtered_orders
    
    # Sync results
    result = {
        "success": True,
        "store_id": store_id,
        "store_name": store_name,
        "platform": "shopify",
        "total_orders": len(shopify_orders),
        "synced": 0,
        "created": 0,
        "updated": 0,
        "skipped": 0,
        "failed": 0,
        "errors": [],
        "synced_at": datetime.now(timezone.utc).isoformat()
    }
    
    for so in shopify_orders:
        try:
            external_id = str(so.get("id", ""))
            
            # Check if order already exists
            existing = await db.fulfillment_orders.find_one({
                "store_id": store_id,
                "external_id": external_id
            })
            
            # Skip if order is already fulfilled/shipped in Shopify
            shopify_fulfillment = so.get("fulfillment_status")
            if shopify_fulfillment == "fulfilled":
                result["skipped"] += 1
                continue
            
            order_doc = transform_shopify_order(so, store_id, store_name)
            
            if existing:
                # Update existing order but preserve local status/stage
                order_doc["order_id"] = existing["order_id"]
                order_doc["created_at"] = existing["created_at"]
                order_doc["status"] = existing.get("status", "pending")
                order_doc["fulfillment_stage_id"] = existing.get("fulfillment_stage_id", "fulfill_orders")
                order_doc["fulfillment_stage_name"] = existing.get("fulfillment_stage_name", "Orders")
                order_doc["assigned_to"] = existing.get("assigned_to")
                order_doc["batch_id"] = existing.get("batch_id")
                
                # Update items while preserving qty_done
                existing_items = {i.get("sku"): i for i in existing.get("items", [])}
                for item in order_doc["items"]:
                    if item["sku"] in existing_items:
                        item["qty_done"] = existing_items[item["sku"]].get("qty_done", 0)
                
                await db.fulfillment_orders.update_one(
                    {"order_id": existing["order_id"]},
                    {"$set": order_doc}
                )
                result["updated"] += 1
            else:
                # Create new order
                await db.fulfillment_orders.insert_one(order_doc)
                result["created"] += 1
            
            result["synced"] += 1
            
        except Exception as e:
            result["failed"] += 1
            result["errors"].append(f"Order {so.get('order_number', so.get('id', 'unknown'))}: {str(e)}")
    
    # Update store last sync time
    await db.stores.update_one(
        {"store_id": store_id},
        {"$set": {"last_order_sync": datetime.now(timezone.utc).isoformat()}}
    )
    
    return result


# Need to import timedelta at the top
