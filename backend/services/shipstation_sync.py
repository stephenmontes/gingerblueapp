"""
ShipStation Order Sync Service
Syncs orders from ShipStation stores to local database with product matching
"""
import asyncio
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Any, Optional
import uuid
from database import db
from services.shipstation_service import shipstation_service
import logging

logger = logging.getLogger(__name__)


async def sync_orders_from_shipstation(
    store_id: int,
    days_back: int = 30,
    order_status: str = None
) -> Dict[str, Any]:
    """
    Sync orders from a ShipStation store to local database
    
    Args:
        store_id: ShipStation store ID (e.g., 82108 for GingerBlueCo)
        days_back: Number of days to look back for orders
        order_status: Filter by status (awaiting_shipment, shipped, etc.)
    
    Returns:
        Sync result with counts
    """
    result = {
        "success": True,
        "store_id": store_id,
        "total_fetched": 0,
        "created": 0,
        "updated": 0,
        "skipped": 0,
        "failed": 0,
        "errors": [],
        "synced_at": datetime.now(timezone.utc).isoformat()
    }
    
    try:
        # Get store info from ShipStation
        stores = await shipstation_service.get_stores()
        store_info = next((s for s in stores if s.get("storeId") == store_id), None)
        
        if not store_info:
            result["success"] = False
            result["errors"].append(f"Store ID {store_id} not found in ShipStation")
            return result
        
        store_name = store_info.get("storeName", f"Store {store_id}")
        marketplace = store_info.get("marketplaceName", "Unknown")
        
        # Calculate date range
        start_date = (datetime.now(timezone.utc) - timedelta(days=days_back)).strftime("%Y-%m-%d")
        
        # Build filters
        filters = {
            "storeId": store_id,
            "createDateStart": start_date,
            "pageSize": 500,
            "sortBy": "OrderDate",
            "sortDir": "DESC"
        }
        
        if order_status:
            filters["orderStatus"] = order_status
        
        # Fetch orders from ShipStation
        page = 1
        all_orders = []
        
        while True:
            filters["page"] = page
            response = await shipstation_service.list_orders(filters)
            
            if "error" in response:
                result["errors"].append(response["error"])
                break
            
            orders = response.get("orders", [])
            if not orders:
                break
            
            all_orders.extend(orders)
            result["total_fetched"] += len(orders)
            
            # Check if there are more pages
            total_pages = response.get("pages", 1)
            if page >= total_pages:
                break
            page += 1
        
        logger.info(f"Fetched {len(all_orders)} orders from ShipStation store {store_name}")
        
        # Process each order
        for ss_order in all_orders:
            try:
                order_doc = await transform_shipstation_order(ss_order, store_id, store_name, marketplace)
                
                # Check if order already exists
                existing = await db.fulfillment_orders.find_one({
                    "shipstation_order_id": ss_order.get("orderId")
                })
                
                if existing:
                    # Update existing order
                    order_doc["order_id"] = existing["order_id"]
                    order_doc["created_at"] = existing["created_at"]
                    
                    await db.fulfillment_orders.update_one(
                        {"order_id": existing["order_id"]},
                        {"$set": order_doc}
                    )
                    result["updated"] += 1
                else:
                    # Create new order
                    await db.fulfillment_orders.insert_one(order_doc)
                    result["created"] += 1
                    
            except Exception as e:
                result["failed"] += 1
                result["errors"].append(f"Order {ss_order.get('orderNumber')}: {str(e)}")
        
        # Update local store record with last sync time
        await db.stores.update_one(
            {"shipstation_store_id": store_id},
            {
                "$set": {
                    "last_shipstation_sync": datetime.now(timezone.utc).isoformat(),
                    "shipstation_store_name": store_name,
                    "shipstation_marketplace": marketplace
                }
            },
            upsert=True
        )
        
    except Exception as e:
        result["success"] = False
        result["errors"].append(str(e))
        logger.error(f"ShipStation sync error: {e}")
    
    return result


async def transform_shipstation_order(
    ss_order: Dict,
    store_id: int,
    store_name: str,
    marketplace: str
) -> Dict[str, Any]:
    """Transform a ShipStation order to our local format with product matching"""
    
    order_id = f"ord_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    
    # Extract shipping address (handle None values)
    ship_to = ss_order.get("shipTo") or {}
    bill_to = ss_order.get("billTo") or {}
    
    # Map ShipStation order status to our status
    status_map = {
        "awaiting_payment": "pending",
        "awaiting_shipment": "awaiting_shipment",
        "pending_fulfillment": "pending",
        "shipped": "shipped",
        "on_hold": "on_hold",
        "cancelled": "cancelled"
    }
    
    ss_status = ss_order.get("orderStatus", "awaiting_shipment")
    local_status = status_map.get(ss_status, "awaiting_shipment")
    
    # Process line items with product matching
    items = []
    for ss_item in ss_order.get("items", []):
        sku = ss_item.get("sku", "").strip()
        
        # Try to match product from our database
        matched_product = None
        if sku:
            matched_product = await db.products.find_one({
                "variants.sku": sku
            }, {"_id": 0, "product_id": 1, "title": 1, "images": 1})
        
        # Handle weight which might be None
        item_weight = ss_item.get("weight") or {}
        
        item_doc = {
            "line_item_id": f"li_{uuid.uuid4().hex[:8]}",
            "shipstation_item_id": ss_item.get("orderItemId"),
            "sku": sku or "NO-SKU",
            "name": ss_item.get("name", "Unknown Item"),
            "title": ss_item.get("name", "Unknown Item"),
            "quantity": ss_item.get("quantity", 1),
            "qty": ss_item.get("quantity", 1),
            "qty_done": ss_item.get("quantity", 1) if local_status == "shipped" else 0,
            "unit_price": ss_item.get("unitPrice", 0),
            "weight_value": item_weight.get("value") if item_weight else None,
            "weight_units": item_weight.get("units") if item_weight else None,
            "image_url": ss_item.get("imageUrl"),
            "product_matched": matched_product is not None,
            "matched_product_id": matched_product.get("product_id") if matched_product else None,
        }
        
        # If we matched a product, get its image
        if matched_product and matched_product.get("images"):
            item_doc["image_url"] = matched_product["images"][0].get("src")
        
        items.append(item_doc)
    
    # Build order document
    order_doc = {
        "order_id": order_id,
        "order_number": str(ss_order.get("orderNumber", "")),
        "external_order_id": str(ss_order.get("orderKey", "")),
        "shipstation_order_id": ss_order.get("orderId"),
        "shipstation_store_id": store_id,
        "store_name": store_name,
        "store_id": f"shipstation_{store_id}",
        "source_platform": marketplace.lower(),
        "platform": "shipstation",
        
        # Customer info
        "customer_name": ship_to.get("name", "Unknown"),
        "customer_email": ss_order.get("customerEmail", ""),
        "customer_notes": ss_order.get("customerNotes", ""),
        "internal_notes": ss_order.get("internalNotes", ""),
        "gift_message": ss_order.get("giftMessage", ""),
        
        # Addresses
        "shipping_address": {
            "name": ship_to.get("name", ""),
            "company": ship_to.get("company", ""),
            "street1": ship_to.get("street1", ""),
            "street2": ship_to.get("street2", ""),
            "city": ship_to.get("city", ""),
            "state": ship_to.get("state", ""),
            "postal_code": ship_to.get("postalCode", ""),
            "country": ship_to.get("country", "US"),
            "phone": ship_to.get("phone", ""),
            "residential": ship_to.get("residential", True)
        },
        "billing_address": {
            "name": bill_to.get("name", ""),
            "company": bill_to.get("company", ""),
            "street1": bill_to.get("street1", ""),
            "street2": bill_to.get("street2", ""),
            "city": bill_to.get("city", ""),
            "state": bill_to.get("state", ""),
            "postal_code": bill_to.get("postalCode", ""),
            "country": bill_to.get("country", "US"),
            "phone": bill_to.get("phone", "")
        },
        
        # Order details
        "items": items,
        "status": local_status,
        "shipstation_status": ss_status,
        "payment_status": "paid" if ss_order.get("paymentDate") else "pending",
        
        # Shipping info
        "requested_shipping_service": ss_order.get("requestedShippingService", ""),
        "carrier_code": ss_order.get("carrierCode", ""),
        "service_code": ss_order.get("serviceCode", ""),
        "package_code": ss_order.get("packageCode", ""),
        "confirmation": ss_order.get("confirmation", ""),
        
        # Totals
        "order_total": ss_order.get("orderTotal", 0),
        "amount_paid": ss_order.get("amountPaid", 0),
        "shipping_amount": ss_order.get("shippingAmount", 0),
        "tax_amount": ss_order.get("taxAmount", 0),
        
        # Weight
        "weight": ss_order.get("weight") or {},
        "dimensions": ss_order.get("dimensions") or {},
        
        # Dates
        "order_date": ss_order.get("orderDate"),
        "payment_date": ss_order.get("paymentDate"),
        "ship_by_date": ss_order.get("shipByDate"),
        "created_at": now,
        "updated_at": now,
        "external_created_at": ss_order.get("createDate"),
        "external_updated_at": ss_order.get("modifyDate"),
        
        # Tags and flags
        "tags": [t.get("name") for t in ss_order.get("tagIds", []) if t.get("name")],
        "is_gift": ss_order.get("gift", False),
        "hold_until_date": ss_order.get("holdUntilDate"),
        
        # Fulfillment tracking
        "shipments": []
    }
    
    return order_doc


async def sync_shipment_status(days_back: int = 30) -> Dict[str, Any]:
    """
    Sync shipment/tracking status from ShipStation for recent orders
    """
    result = {
        "success": True,
        "orders_checked": 0,
        "shipments_found": 0,
        "orders_updated": 0,
        "errors": []
    }
    
    try:
        # Get recent orders that might have shipments
        start_date = (datetime.now(timezone.utc) - timedelta(days=days_back)).isoformat()
        
        orders = await db.fulfillment_orders.find({
            "shipstation_order_id": {"$exists": True},
            "created_at": {"$gte": start_date}
        }).to_list(1000)
        
        result["orders_checked"] = len(orders)
        
        # Fetch shipments from ShipStation
        shipments_response = await shipstation_service.list_shipments({
            "createDateStart": (datetime.now(timezone.utc) - timedelta(days=days_back)).strftime("%Y-%m-%d"),
            "pageSize": 500
        })
        
        if "error" in shipments_response:
            result["errors"].append(shipments_response["error"])
            return result
        
        shipments = shipments_response.get("shipments", [])
        result["shipments_found"] = len(shipments)
        
        # Create lookup by order ID
        shipments_by_order = {}
        for shipment in shipments:
            order_id = shipment.get("orderId")
            if order_id:
                if order_id not in shipments_by_order:
                    shipments_by_order[order_id] = []
                shipments_by_order[order_id].append({
                    "shipment_id": shipment.get("shipmentId"),
                    "tracking_number": shipment.get("trackingNumber"),
                    "carrier_code": shipment.get("carrierCode"),
                    "service_code": shipment.get("serviceCode"),
                    "ship_date": shipment.get("shipDate"),
                    "shipment_cost": shipment.get("shipmentCost"),
                    "insurance_cost": shipment.get("insuranceCost"),
                    "voided": shipment.get("voided", False),
                    "label_url": shipment.get("labelData"),
                    "tracking_url": f"https://track.shipstation.com/{shipment.get('trackingNumber')}" if shipment.get('trackingNumber') else None
                })
        
        # Update orders with shipment info
        for order in orders:
            ss_order_id = order.get("shipstation_order_id")
            if ss_order_id in shipments_by_order:
                order_shipments = shipments_by_order[ss_order_id]
                
                # Determine if shipped based on valid shipments
                valid_shipments = [s for s in order_shipments if not s.get("voided")]
                new_status = "shipped" if valid_shipments else order.get("status")
                
                await db.fulfillment_orders.update_one(
                    {"order_id": order["order_id"]},
                    {
                        "$set": {
                            "shipments": order_shipments,
                            "status": new_status,
                            "tracking_number": valid_shipments[0].get("tracking_number") if valid_shipments else None,
                            "updated_at": datetime.now(timezone.utc).isoformat()
                        }
                    }
                )
                result["orders_updated"] += 1
        
    except Exception as e:
        result["success"] = False
        result["errors"].append(str(e))
        logger.error(f"Shipment sync error: {e}")
    
    return result


# Store ID constants for easy reference
SHIPSTATION_STORES = {
    "antique_farmhouse": 4088,
    "ginger_blue_decor": 4089,
    "ginger_blue_home": 64326,
    "gingerblueco": 82108,  # Etsy store
    "manual_orders": 84729,
    "rate_browser": 84194
}
