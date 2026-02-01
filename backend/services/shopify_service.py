"""
Shopify Product Sync Service
Handles fetching and syncing products from Shopify stores
"""
import httpx
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
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
            
            # Check if product already exists
            existing = await db.products.find_one({
                "store_id": store_id,
                "external_id": external_id
            })
            
            product_doc = transform_shopify_product(sp, store_id)
            
            if existing:
                # Update existing product
                product_doc["product_id"] = existing["product_id"]
                product_doc["created_at"] = existing["created_at"]
                
                await db.products.update_one(
                    {"product_id": existing["product_id"]},
                    {"$set": product_doc}
                )
                result["updated"] += 1
            else:
                # Create new product
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
