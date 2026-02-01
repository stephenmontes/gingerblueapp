"""
Etsy Order Sync Service
Handles fetching and syncing orders/receipts from Etsy stores
"""
import httpx
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone, timedelta
import uuid
import asyncio
import hashlib
import base64
import secrets
from database import db

API_VERSION = "v3"
API_BASE_URL = "https://api.etsy.com/v3"


class EtsyService:
    def __init__(self, shop_id: str, access_token: str, api_key: str):
        """Initialize Etsy API client
        
        Args:
            shop_id: The Etsy shop ID
            access_token: OAuth access token (format: user_id.oauth_token)
            api_key: The Etsy API key (client_id)
        """
        self.shop_id = shop_id
        self.access_token = access_token
        self.api_key = api_key
        self.headers = {
            "Authorization": f"Bearer {access_token}",
            "x-api-key": api_key,
            "Content-Type": "application/json"
        }
    
    async def test_connection(self) -> Dict[str, Any]:
        """Test API connection by fetching shop info"""
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(
                    f"{API_BASE_URL}/application/shops/{self.shop_id}",
                    headers=self.headers,
                    timeout=30.0
                )
                response.raise_for_status()
                shop_data = response.json()
                return {
                    "success": True, 
                    "shop": shop_data.get("results", shop_data)
                }
            except httpx.HTTPStatusError as e:
                return {"success": False, "error": f"HTTP {e.response.status_code}: {e.response.text}"}
            except Exception as e:
                return {"success": False, "error": str(e)}
    
    async def fetch_receipts(self, limit: int = 100, min_created: int = None) -> List[Dict[str, Any]]:
        """Fetch receipts (orders) from Etsy shop with pagination
        
        Args:
            limit: Max receipts per page (max 100)
            min_created: Unix timestamp - only fetch receipts after this time
        """
        receipts = []
        offset = 0
        
        async with httpx.AsyncClient() as client:
            while True:
                params = {
                    "limit": min(limit, 100),
                    "offset": offset
                }
                if min_created:
                    params["min_created"] = min_created
                
                response = await client.get(
                    f"{API_BASE_URL}/application/shops/{self.shop_id}/receipts",
                    headers=self.headers,
                    params=params,
                    timeout=60.0
                )
                response.raise_for_status()
                
                data = response.json()
                results = data.get("results", [])
                receipts.extend(results)
                
                # Check if there are more pages
                count = data.get("count", 0)
                if len(receipts) >= count or len(results) == 0:
                    break
                
                offset += len(results)
                
                # Rate limiting - Etsy allows ~10 req/sec
                await asyncio.sleep(0.15)
        
        return receipts
    
    async def fetch_receipt(self, receipt_id: str) -> Optional[Dict[str, Any]]:
        """Fetch a single receipt by ID"""
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(
                    f"{API_BASE_URL}/application/shops/{self.shop_id}/receipts/{receipt_id}",
                    headers=self.headers,
                    timeout=30.0
                )
                response.raise_for_status()
                return response.json()
            except:
                return None
    
    async def fetch_listing(self, listing_id: str) -> Optional[Dict[str, Any]]:
        """Fetch listing details for a product"""
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(
                    f"{API_BASE_URL}/application/listings/{listing_id}",
                    headers=self.headers,
                    timeout=30.0
                )
                response.raise_for_status()
                return response.json()
            except:
                return None


def transform_etsy_receipt(receipt: Dict, store_id: str, store_name: str) -> Dict[str, Any]:
    """Transform Etsy receipt to our order format"""
    order_id = f"ord_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    
    # Get buyer info
    buyer_email = receipt.get("buyer_email", "")
    buyer_user_id = receipt.get("buyer_user_id", "")
    
    # Get name from shipping address
    name = receipt.get("name", "")
    if not name:
        name = f"Etsy Buyer {buyer_user_id}"
    
    # Transform transactions (line items)
    items = []
    transactions = receipt.get("transactions", [])
    for txn in transactions:
        # Build SKU from listing info
        sku = txn.get("product_data", {}).get("sku") or ""
        if not sku:
            sku = f"ETSY-{txn.get('listing_id', 'UNKNOWN')}"
            if txn.get("variations"):
                for var in txn.get("variations", []):
                    sku += f"-{var.get('formatted_value', '')}"
        
        # Get variation info
        variations = []
        for var in txn.get("variations", []):
            variations.append({
                "property_name": var.get("formatted_name", ""),
                "value": var.get("formatted_value", "")
            })
        
        items.append({
            "line_item_id": str(txn.get("transaction_id", "")),
            "product_id": str(txn.get("listing_id", "")),
            "variant_id": str(txn.get("product_id", "")),
            "sku": sku,
            "name": txn.get("title", "Unknown Item"),
            "title": txn.get("title", ""),
            "quantity": txn.get("quantity", 1),
            "qty": txn.get("quantity", 1),
            "qty_done": 0,
            "price": float(txn.get("price", {}).get("amount", 0)) / 100,  # Etsy prices in cents
            "variations": variations,
            "is_digital": txn.get("is_digital", False),
        })
    
    # Calculate total from grandtotal
    grandtotal = receipt.get("grandtotal", {})
    total_price = float(grandtotal.get("amount", 0)) / 100 if grandtotal else 0
    
    subtotal = receipt.get("subtotal", {})
    subtotal_price = float(subtotal.get("amount", 0)) / 100 if subtotal else 0
    
    total_tax = receipt.get("total_tax_cost", {})
    tax_amount = float(total_tax.get("amount", 0)) / 100 if total_tax else 0
    
    # Shipping address
    shipping_address = None
    if receipt.get("name"):
        shipping_address = {
            "name": receipt.get("name", ""),
            "address1": receipt.get("first_line", ""),
            "address2": receipt.get("second_line", ""),
            "city": receipt.get("city", ""),
            "province": receipt.get("state", ""),
            "province_code": receipt.get("state", ""),
            "country": receipt.get("country_iso", ""),
            "country_code": receipt.get("country_iso", ""),
            "zip": receipt.get("zip", ""),
            "phone": "",
        }
    
    # Determine status based on Etsy status
    etsy_status = receipt.get("status", "")
    status = "pending"
    if etsy_status in ["completed", "shipped"]:
        status = "completed"
    elif etsy_status == "canceled":
        status = "cancelled"
    
    return {
        "order_id": order_id,
        "external_id": str(receipt.get("receipt_id", "")),
        "order_number": str(receipt.get("receipt_id", "")),
        "store_id": store_id,
        "store_name": store_name,
        "platform": "etsy",
        "customer_name": name,
        "customer_email": buyer_email,
        "customer_phone": "",
        "items": items,
        "line_items": items,
        "total_price": total_price,
        "subtotal_price": subtotal_price,
        "total_tax": tax_amount,
        "currency": grandtotal.get("currency_code", "USD") if grandtotal else "USD",
        "financial_status": "paid" if receipt.get("is_paid") else "pending",
        "fulfillment_status": "shipped" if receipt.get("is_shipped") else "unfulfilled",
        "status": status,
        "current_stage_id": None,
        "fulfillment_stage_id": "fulfill_orders",
        "fulfillment_stage_name": "Orders",
        "assigned_to": None,
        "batch_id": None,
        "note": receipt.get("message_from_buyer"),
        "tags": "",
        "shipping_address": shipping_address,
        "is_gift": receipt.get("is_gift", False),
        "gift_message": receipt.get("gift_message"),
        "created_at": now,
        "updated_at": now,
        "synced_at": now,
        "external_created_at": datetime.fromtimestamp(
            receipt.get("create_timestamp", 0), 
            tz=timezone.utc
        ).isoformat() if receipt.get("create_timestamp") else None,
        "external_updated_at": datetime.fromtimestamp(
            receipt.get("update_timestamp", 0),
            tz=timezone.utc
        ).isoformat() if receipt.get("update_timestamp") else None,
    }


async def sync_orders_from_etsy_store(store_id: str, days_back: int = 30) -> Dict[str, Any]:
    """Sync orders from an Etsy store"""
    # Get store details
    store = await db.stores.find_one({"store_id": store_id})
    if not store:
        return {"success": False, "error": "Store not found"}
    
    if store.get("platform") != "etsy":
        return {"success": False, "error": "Only Etsy stores are supported"}
    
    access_token = store.get("access_token")
    api_key = store.get("api_key")
    shop_id = store.get("shop_id")
    store_name = store.get("name", "")
    
    if not access_token or not api_key or not shop_id:
        return {"success": False, "error": "Store credentials not configured. Need: access_token, api_key, shop_id"}
    
    # Initialize Etsy service
    service = EtsyService(shop_id, access_token, api_key)
    
    # Test connection
    test_result = await service.test_connection()
    if not test_result["success"]:
        return {"success": False, "error": f"Connection failed: {test_result['error']}"}
    
    # Calculate min_created timestamp
    min_created = None
    if days_back and days_back > 0:
        cutoff = datetime.now(timezone.utc) - timedelta(days=days_back)
        min_created = int(cutoff.timestamp())
    
    # Fetch receipts
    try:
        receipts = await service.fetch_receipts(min_created=min_created)
    except Exception as e:
        return {"success": False, "error": f"Failed to fetch receipts: {str(e)}"}
    
    # Sync results
    result = {
        "success": True,
        "store_id": store_id,
        "store_name": store_name,
        "platform": "etsy",
        "total_orders": len(receipts),
        "synced": 0,
        "created": 0,
        "updated": 0,
        "skipped": 0,
        "failed": 0,
        "errors": [],
        "synced_at": datetime.now(timezone.utc).isoformat()
    }
    
    for receipt in receipts:
        try:
            external_id = str(receipt.get("receipt_id", ""))
            
            # Check if order already exists
            existing = await db.fulfillment_orders.find_one({
                "store_id": store_id,
                "external_id": external_id
            })
            
            # Skip if already shipped in Etsy
            if receipt.get("is_shipped") and not existing:
                result["skipped"] += 1
                continue
            
            order_doc = transform_etsy_receipt(receipt, store_id, store_name)
            
            if existing:
                # Update existing order but preserve local status/stage
                order_doc["order_id"] = existing["order_id"]
                order_doc["created_at"] = existing["created_at"]
                order_doc["status"] = existing.get("status", "pending")
                order_doc["fulfillment_stage_id"] = existing.get("fulfillment_stage_id", "fulfill_orders")
                order_doc["fulfillment_stage_name"] = existing.get("fulfillment_stage_name", "Orders")
                order_doc["assigned_to"] = existing.get("assigned_to")
                order_doc["batch_id"] = existing.get("batch_id")
                
                # Preserve qty_done for existing items
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
            result["errors"].append(f"Receipt {receipt.get('receipt_id', 'unknown')}: {str(e)}")
    
    # Update store last sync time
    await db.stores.update_one(
        {"store_id": store_id},
        {"$set": {"last_order_sync": datetime.now(timezone.utc).isoformat()}}
    )
    
    return result


# OAuth helper functions for Etsy authentication
def generate_pkce_pair():
    """Generate PKCE code verifier and challenge pair"""
    code_verifier = secrets.token_urlsafe(32)
    
    # Create S256 challenge
    challenge_bytes = hashlib.sha256(code_verifier.encode('ascii')).digest()
    code_challenge = base64.urlsafe_b64encode(challenge_bytes).decode('ascii').rstrip('=')
    
    return code_verifier, code_challenge


def get_etsy_auth_url(client_id: str, redirect_uri: str, state: str = None) -> tuple:
    """Generate Etsy OAuth authorization URL with PKCE
    
    Returns:
        (auth_url, code_verifier, state) tuple
    """
    code_verifier, code_challenge = generate_pkce_pair()
    state = state or secrets.token_urlsafe(16)
    
    params = {
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "scope": "transactions_r shops_r listings_r",
        "state": state,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256"
    }
    
    from urllib.parse import urlencode
    auth_url = f"https://www.etsy.com/oauth/connect?{urlencode(params)}"
    
    return auth_url, code_verifier, state
