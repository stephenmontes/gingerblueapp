from fastapi import APIRouter, HTTPException, Depends, Query, UploadFile, File
from fastapi.responses import StreamingResponse
from typing import Optional, List
from datetime import datetime, timezone
from pydantic import BaseModel
import uuid
import csv
import io
import os
import asyncio
import logging
import resend

from database import db
from models.user import User
from models.order import Order, OrderCreate
from models.production import StageMove
from models.time_log import TimeLog
from dependencies import get_current_user
from services.shopify_service import sync_orders_from_store
from services.etsy_service import sync_orders_from_etsy_store
from services.shipstation_sync import sync_orders_from_shipstation

logger = logging.getLogger(__name__)

# Initialize Resend
resend.api_key = os.environ.get("RESEND_API_KEY")

router = APIRouter(prefix="/orders", tags=["orders"])


class ExportOrdersRequest(BaseModel):
    order_ids: List[str]


class SendOrderEmailRequest(BaseModel):
    to: str


# Pydantic models for order notes
class OrderNote(BaseModel):
    content: str
    note_type: str = "general"  # general, task, issue, update


@router.post("/download-csv")
async def export_orders_to_csv(
    request: ExportOrdersRequest,
    user: User = Depends(get_current_user)
):
    """Export selected orders to CSV file for download"""
    if not request.order_ids:
        raise HTTPException(status_code=400, detail="No orders selected for export")
    
    # Get orders with batch info
    orders = await db.orders.find(
        {"order_id": {"$in": request.order_ids}},
        {"_id": 0}
    ).to_list(len(request.order_ids))
    
    if not orders:
        raise HTTPException(status_code=404, detail="No orders found")
    
    # Get batch info for each order
    batch_ids = set()
    for order in orders:
        if order.get("fulfillment_batch_id"):
            batch_ids.add(order["fulfillment_batch_id"])
        if order.get("production_batch_id"):
            batch_ids.add(order["production_batch_id"])
    
    batches = {}
    if batch_ids:
        # Get fulfillment batches
        fulfillment_batches = await db.fulfillment_batches.find(
            {"fulfillment_batch_id": {"$in": list(batch_ids)}},
            {"_id": 0}
        ).to_list(100)
        for b in fulfillment_batches:
            batches[b["fulfillment_batch_id"]] = b
        
        # Get production batches
        production_batches = await db.production_batches.find(
            {"batch_id": {"$in": list(batch_ids)}},
            {"_id": 0}
        ).to_list(100)
        for b in production_batches:
            batches[b["batch_id"]] = b
    
    # Create CSV content
    csv_buffer = io.StringIO()
    writer = csv.writer(csv_buffer)
    
    # Header row
    headers = [
        "Order Number", "Order ID", "Store", "Platform",
        "Customer Name", "Customer Email", "Customer Phone",
        "Ship To Name", "Address 1", "Address 2", "City", "State", "Zip", "Country",
        "Order Date", "Requested Ship Date", "Status",
        "Total Items", "Items Completed",
        "Item SKU", "Item Name", "Item Quantity", "Item Done",
        "Fulfillment Batch", "Fulfillment Batch Status", "Fulfillment Stage",
        "Production Batch", "Production Batch Status",
        "Notes", "Tags",
        "Created At", "Updated At"
    ]
    writer.writerow(headers)
    
    # Data rows - one row per item
    for order in orders:
        # Get batch info
        fulfill_batch = batches.get(order.get("fulfillment_batch_id"), {})
        prod_batch = batches.get(order.get("production_batch_id"), {})
        
        # Get address
        addr = order.get("shipping_address", {})
        
        # Base order data
        base_row = [
            order.get("order_number", ""),
            order.get("order_id", ""),
            order.get("store_name", ""),
            order.get("platform", ""),
            order.get("customer_name", ""),
            order.get("customer_email", ""),
            order.get("customer_phone", ""),
            addr.get("name", order.get("customer_name", "")),
            addr.get("address1", ""),
            addr.get("address2", ""),
            addr.get("city", ""),
            addr.get("state", ""),
            addr.get("zip", ""),
            addr.get("country", ""),
            order.get("order_date", ""),
            order.get("requested_ship_date", ""),
            order.get("status", ""),
            order.get("total_items", 0),
            order.get("items_completed", 0),
        ]
        
        # Add rows for each item
        items = order.get("items", [])
        if items:
            for item in items:
                row = base_row + [
                    item.get("sku", ""),
                    item.get("name", ""),
                    item.get("quantity", 0),
                    item.get("qty_done", 0),
                    fulfill_batch.get("batch_name", ""),
                    fulfill_batch.get("status", ""),
                    fulfill_batch.get("current_stage", ""),
                    prod_batch.get("name", ""),
                    prod_batch.get("status", ""),
                    order.get("notes", ""),
                    ", ".join(order.get("tags", [])),
                    order.get("created_at", ""),
                    order.get("updated_at", "")
                ]
                writer.writerow(row)
        else:
            # No items - still write order row
            row = base_row + [
                "", "", 0, 0,
                fulfill_batch.get("batch_name", ""),
                fulfill_batch.get("status", ""),
                fulfill_batch.get("current_stage", ""),
                prod_batch.get("name", ""),
                prod_batch.get("status", ""),
                order.get("notes", ""),
                ", ".join(order.get("tags", [])),
                order.get("created_at", ""),
                order.get("updated_at", "")
            ]
            writer.writerow(row)
    
    # Get CSV content and create response
    csv_content = csv_buffer.getvalue()
    csv_buffer.close()
    
    # Return as downloadable file
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"orders_export_{timestamp}.csv"
    
    return StreamingResponse(
        io.BytesIO(csv_content.encode('utf-8')),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("")
async def get_orders(
    store_id: Optional[str] = None,
    status: Optional[str] = None,
    stage_id: Optional[str] = None,
    unbatched: Optional[bool] = None,
    include_archived: Optional[bool] = False,
    search: Optional[str] = Query(None, description="Search term for order number, customer name, or email"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(100, ge=1, le=500, description="Items per page"),
    sort_by: str = Query("order_date", description="Field to sort by"),
    sort_order: str = Query("desc", description="Sort order: asc or desc"),
    user: User = Depends(get_current_user)
):
    """Get orders with optional filters and pagination
    
    Status filter options:
    - "active": Shows orders that are NOT shipped, cancelled, or completed (default for UI)
    - "all": Shows all orders
    - Specific status (e.g., "pending", "shipped"): Shows only that status
    
    Search:
    - When search term is provided, archived orders are automatically included
    - Searches order_number, customer_name, customer_email, external_id
    
    Pagination:
    - page: Page number (default 1)
    - page_size: Items per page (default 100, max 500)
    """
    query = {}
    if store_id:
        query["store_id"] = store_id
    
    # When searching, bypass status filters to include ALL orders (archived, shipped, completed, etc.)
    if search and search.strip():
        # Search across multiple fields using regex (case-insensitive)
        search_regex = {"$regex": search.strip(), "$options": "i"}
        query["$or"] = [
            {"order_number": search_regex},
            {"customer_name": search_regex},
            {"customer_email": search_regex},
            {"external_id": search_regex},
            {"order_id": search_regex}
        ]
        # When searching: include ALL orders - archived, shipped, completed, etc.
        # Don't apply status filter or archived filter
    else:
        # Normal filtering when not searching
        # Handle status filtering - "active" means exclude shipped/cancelled/completed
        inactive_statuses = ["shipped", "cancelled", "completed"]
        if status == "active":
            query["status"] = {"$nin": inactive_statuses}
        elif status == "draft":
            # For draft status, query the orders collection (where POS drafts are stored)
            query["status"] = "draft"
            query["is_draft"] = True
        elif status and status != "all":
            query["status"] = status
        # If status is "all" or None, no status filter is applied
        
        if stage_id:
            query["current_stage_id"] = stage_id
        if unbatched:
            query["$or"] = [{"batch_id": None}, {"batch_id": {"$exists": False}}]
        
        # Exclude archived orders by default (when not searching)
        if not include_archived:
            query["archived"] = {"$ne": True}
    
    # Determine which collection to query
    collection = db.orders if status == "draft" else db.fulfillment_orders
    
    # Get total count for pagination info
    total_count = await collection.count_documents(query)
    
    # Calculate skip for pagination
    skip = (page - 1) * page_size
    
    # Determine sort direction (1 for asc, -1 for desc)
    sort_direction = 1 if sort_order == "asc" else -1
    
    # Map sort_by to actual field names
    # Use created_at as primary since many orders don't have order_date
    sort_field_map = {
        "order_date": "created_at",
        "created_at": "created_at",
        "order_number": "order_number",
        "store_name": "store_name",
        "customer_name": "customer_name",
        "total_price": "total_price",
        "status": "status"
    }
    primary_sort_field = sort_field_map.get(sort_by, "created_at")
    
    # Optimized: Only fetch fields needed for the orders list view
    # Excludes large nested data like full shipping_address details
    order_projection = {
        "_id": 0,
        "order_id": 1,
        "external_id": 1,
        "order_number": 1,
        "store_id": 1,
        "store_name": 1,
        "customer_name": 1,
        "customer_email": 1,
        "customer_phone": 1,
        "status": 1,
        "total_price": 1,
        "items": 1,
        "batch_id": 1,
        "batch_name": 1,
        "current_stage_id": 1,
        "fulfillment_batch_id": 1,
        "fulfillment_batch_name": 1,
        "fulfillment_stage_id": 1,
        "fulfillment_stage_name": 1,
        "individual_stage_override": 1,
        "archived": 1,
        "requested_ship_date": 1,
        "shipping_address": 1,
        "note_attributes": 1,
        "created_at": 1,
        "order_date": 1,
        "updated_at": 1,
        "pos_order_number": 1,
        "is_draft": 1,
        "source": 1,
        "platform": 1
    }
    
    # Fetch from appropriate collection with pagination
    # Sort by requested field - created_at is the most reliable date field
    orders = await collection.find(query, order_projection).sort([
        (primary_sort_field, sort_direction)
    ]).skip(skip).limit(page_size).to_list(page_size)
    
    return {
        "orders": orders,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total_count": total_count,
            "total_pages": (total_count + page_size - 1) // page_size
        }
    }


@router.put("/{order_id}/archive")
async def archive_order(order_id: str, user: User = Depends(get_current_user)):
    """Archive an order to remove it from active list"""
    result = await db.fulfillment_orders.update_one(
        {"order_id": order_id},
        {"$set": {"archived": True, "archived_at": datetime.now(timezone.utc).isoformat(), "archived_by": user.user_id}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Order not found")
    
    return {"message": "Order archived"}


@router.put("/{order_id}/unarchive")
async def unarchive_order(order_id: str, user: User = Depends(get_current_user)):
    """Unarchive an order to restore it to active list"""
    result = await db.fulfillment_orders.update_one(
        {"order_id": order_id},
        {"$set": {"archived": False}, "$unset": {"archived_at": "", "archived_by": ""}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Order not found")
    
    return {"message": "Order restored"}


@router.put("/{order_id}/ship-date")
async def update_ship_date(order_id: str, requested_ship_date: Optional[str] = None, user: User = Depends(get_current_user)):
    """Update the requested ship date for an order"""
    update_data = {
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    if requested_ship_date:
        update_data["requested_ship_date"] = requested_ship_date
    else:
        # If empty/null, remove the field
        result = await db.fulfillment_orders.update_one(
            {"order_id": order_id},
            {"$unset": {"requested_ship_date": ""}, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Order not found")
        return {"message": "Ship date cleared", "requested_ship_date": None}
    
    result = await db.fulfillment_orders.update_one(
        {"order_id": order_id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Order not found")
    
    return {"message": "Ship date updated", "requested_ship_date": requested_ship_date}


@router.post("/{order_id}/enrich-images")
async def enrich_order_images(order_id: str, user: User = Depends(get_current_user)):
    """Enrich order items with product images from synced products"""
    order = await db.fulfillment_orders.find_one({"order_id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    items = order.get("items", [])
    updated = False
    
    for item in items:
        # Skip if already has image
        if item.get("image_url"):
            continue
            
        # Try to find image by SKU or product_id
        sku = item.get("sku")
        product_id = item.get("product_id")
        
        product = None
        if sku:
            product = await db.products.find_one(
                {"variants.sku": sku},
                {"_id": 0, "images": 1, "variants": 1}
            )
        
        if not product and product_id:
            product = await db.products.find_one(
                {"external_id": product_id},
                {"_id": 0, "images": 1, "variants": 1}
            )
        
        if product:
            # First try to get variant-specific image
            for variant in product.get("variants", []):
                if variant.get("sku") == sku and variant.get("image_url"):
                    item["image_url"] = variant["image_url"]
                    updated = True
                    break
            
            # Fall back to first product image
            if not item.get("image_url") and product.get("images"):
                item["image_url"] = product["images"][0].get("src")
                updated = True
    
    if updated:
        await db.fulfillment_orders.update_one(
            {"order_id": order_id},
            {"$set": {"items": items}}
        )
    
    return {"success": True, "items_updated": updated}


@router.post("")
async def create_order(order_data: OrderCreate, user: User = Depends(get_current_user)):
    """Create a new order"""
    order = Order(**order_data.model_dump())
    
    stages = await db.production_stages.find({}, {"_id": 0}).sort("order", 1).to_list(1)
    if stages:
        order.current_stage_id = stages[0]["stage_id"]
    
    doc = order.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    doc["updated_at"] = doc["updated_at"].isoformat()
    
    await db.orders.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

@router.get("/{order_id}")
async def get_order(order_id: str, user: User = Depends(get_current_user)):
    """Get single order"""
    # Try fulfillment_orders first (main orders collection)
    order = await db.fulfillment_orders.find_one({"order_id": order_id}, {"_id": 0})
    if not order:
        # Fall back to orders collection
        order = await db.orders.find_one({"order_id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order

@router.put("/{order_id}/stage")
async def move_order_stage(order_id: str, move_data: StageMove, user: User = Depends(get_current_user)):
    """Move order to a new stage"""
    order = await db.orders.find_one({"order_id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    old_stage_id = order.get("current_stage_id")
    new_stage_id = move_data.new_stage_id
    
    new_stage = await db.production_stages.find_one({"stage_id": new_stage_id}, {"_id": 0})
    if not new_stage:
        raise HTTPException(status_code=404, detail="Stage not found")
    
    if old_stage_id:
        now = datetime.now(timezone.utc)
        open_logs = await db.time_logs.find({"order_id": order_id, "completed_at": None}).to_list(100)
        
        for log in open_logs:
            started_at = log.get("started_at")
            if isinstance(started_at, str):
                started_at = datetime.fromisoformat(started_at)
            if started_at.tzinfo is None:
                started_at = started_at.replace(tzinfo=timezone.utc)
            
            duration = (now - started_at).total_seconds() / 60
            await db.time_logs.update_one(
                {"log_id": log["log_id"]},
                {"$set": {"completed_at": now.isoformat(), "duration_minutes": round(duration, 2)}}
            )
    
    time_log = TimeLog(
        user_id=user.user_id,
        user_name=user.name,
        stage_id=new_stage_id,
        stage_name=new_stage["name"],
        action="moved",
        started_at=datetime.now(timezone.utc),
        items_processed=move_data.items_processed
    )
    log_doc = time_log.model_dump()
    log_doc["started_at"] = log_doc["started_at"].isoformat()
    log_doc["created_at"] = log_doc["created_at"].isoformat()
    await db.time_logs.insert_one(log_doc)
    
    stages = await db.production_stages.find({}, {"_id": 0}).sort("order", 1).to_list(100)
    stage_orders = {s["stage_id"]: s["order"] for s in stages}
    new_stage_order = stage_orders.get(new_stage_id, 0)
    
    if new_stage_order == 0:
        status = "pending"
    elif new_stage_order == len(stages) - 1:
        status = "completed"
    else:
        status = "in_production"
    
    await db.orders.update_one(
        {"order_id": order_id},
        {"$set": {
            "current_stage_id": new_stage_id,
            "status": status,
            "assigned_to": user.user_id,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"message": "Order moved", "new_stage": new_stage["name"], "status": status}

@router.put("/{order_id}/assign")
async def assign_order(order_id: str, assignee_id: str, user: User = Depends(get_current_user)):
    """Assign order to a user"""
    result = await db.orders.update_one(
        {"order_id": order_id},
        {"$set": {"assigned_to": assignee_id, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Order not found")
    
    return {"message": "Order assigned"}


@router.post("/sync/{store_id}")
async def sync_store_orders(
    store_id: str,
    status: str = Query("any", description="Order status filter: any, open, closed"),
    days_back: int = Query(365, ge=1, le=730, description="Number of days to sync"),
    user: User = Depends(get_current_user)
):
    """Sync orders from a Shopify or Etsy store"""
    if user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Verify store exists
    store = await db.stores.find_one({"store_id": store_id})
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    
    platform = store.get("platform")
    
    # Run sync based on platform
    if platform == "shopify":
        result = await sync_orders_from_store(store_id, status=status, days_back=days_back)
    elif platform == "etsy":
        result = await sync_orders_from_etsy_store(store_id, days_back=days_back)
    elif platform == "shipstation":
        # Get ShipStation store ID from the store config
        shipstation_store_id = store.get("shipstation_store_id")
        if not shipstation_store_id:
            raise HTTPException(status_code=400, detail="Store is missing ShipStation store ID configuration")
        result = await sync_orders_from_shipstation(store_id=shipstation_store_id, days_back=days_back)
        # Update last_sync on the store
        await db.stores.update_one(
            {"store_id": store_id},
            {"$set": {"last_sync": datetime.now(timezone.utc).isoformat()}}
        )
    else:
        raise HTTPException(status_code=400, detail=f"Platform '{platform}' does not support order sync")
    
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Sync failed"))
    
    return result


@router.get("/sync/status")
async def get_sync_status(user: User = Depends(get_current_user)):
    """Get order sync status for all stores"""
    stores = await db.stores.find(
        {"platform": {"$in": ["shopify", "etsy", "shipstation"]}}, 
        {"_id": 0}
    ).to_list(100)
    
    result = []
    for store in stores:
        order_count = await db.fulfillment_orders.count_documents({"store_id": store["store_id"]})
        result.append({
            "store_id": store["store_id"],
            "store_name": store.get("name", ""),
            "platform": store.get("platform"),
            "last_order_sync": store.get("last_order_sync"),
            "last_sync": store.get("last_sync"),
            "order_count": order_count,
            "is_active": store.get("is_active", True),
            "shipstation_store_id": store.get("shipstation_store_id")
        })
    
    return result


@router.post("/sync-all")
async def sync_all_stores(
    user: User = Depends(get_current_user)
):
    """Manually trigger sync for all stores (admin/manager only)"""
    if user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    from services.scheduler import sync_all_stores as do_sync
    result = await do_sync()
    return {
        "success": True,
        "message": f"Synced {len(result)} stores",
        "results": result
    }


@router.get("/sync/scheduler-status")
async def get_scheduler_status(user: User = Depends(get_current_user)):
    """Get status of the scheduled sync job"""
    if user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    from services.scheduler import get_scheduler_status as get_status
    
    # Also get last sync log
    last_sync = await db.scheduled_sync_logs.find_one(
        {"sync_type": "daily_order_sync"},
        {"_id": 0},
        sort=[("triggered_at", -1)]
    )
    
    status = get_status()
    status["last_scheduled_sync"] = last_sync
    
    return status


@router.get("/sync/logs")
async def get_sync_logs(
    limit: int = Query(10, ge=1, le=100),
    user: User = Depends(get_current_user)
):
    """Get recent scheduled sync logs"""
    if user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    logs = await db.scheduled_sync_logs.find(
        {},
        {"_id": 0}
    ).sort("triggered_at", -1).limit(limit).to_list(limit)
    
    return {"logs": logs}


@router.post("/upload-csv/{store_id}")
async def upload_orders_csv(
    store_id: str,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user)
):
    """Upload orders from a CSV file for dropship stores
    
    Supports Antique Farmhouse CSV format:
    - Order Number (required)
    - Full Name (required)
    - Address 1
    - City
    - State
    - Zip
    - Item Number (SKU, required)
    - Price
    - Qty
    - Order Comments
    - Order Date
    
    Also supports generic format with lowercase column names.
    """
    if user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Verify store exists
    store = await db.stores.find_one({"store_id": store_id})
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    
    store_name = store.get("name", "")
    platform = store.get("platform", "dropship")
    
    # Read CSV content
    try:
        content = await file.read()
        decoded = content.decode("utf-8-sig")  # Handle BOM
        reader = csv.DictReader(io.StringIO(decoded))
        rows = list(reader)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse CSV: {str(e)}")
    
    if not rows:
        raise HTTPException(status_code=400, detail="CSV file is empty")
    
    # Helper function to get value with multiple possible column names
    def get_col(row, *names, default=""):
        for name in names:
            if name in row and row[name]:
                return row[name].strip()
        return default
    
    # Group rows by order_number
    orders_map = {}
    for row in rows:
        # Support both "Order Number" and "order_number" column names
        order_num = get_col(row, "Order Number", "order_number", "OrderNumber", "order_id")
        if not order_num:
            continue
        
        if order_num not in orders_map:
            customer_name = get_col(row, "Full Name", "customer_name", "CustomerName", "name") or "Unknown Customer"
            orders_map[order_num] = {
                "order_number": order_num,
                "customer_name": customer_name,
                "customer_email": get_col(row, "Email", "customer_email", "CustomerEmail"),
                "shipping_address": {
                    "name": customer_name,
                    "address1": get_col(row, "Address 1", "shipping_address1", "Address", "address1"),
                    "address2": get_col(row, "Address 2", "shipping_address2", "address2"),
                    "city": get_col(row, "City", "shipping_city"),
                    "province": get_col(row, "State", "shipping_state", "Province"),
                    "zip": get_col(row, "Zip", "shipping_zip", "ZIP", "Postal"),
                    "country": get_col(row, "Country", "shipping_country") or "US",
                },
                "notes": get_col(row, "Order Comments", "notes", "Notes", "Comments"),
                "order_date": get_col(row, "Order Date", "order_date", "date"),
                "items": []
            }
        
        # Add item to order - support "Item Number" as SKU
        sku = get_col(row, "Item Number", "sku", "SKU", "ItemNumber", "item_number")
        if sku:
            try:
                qty = int(get_col(row, "Qty", "quantity", "Quantity", "QTY") or "1")
            except (ValueError, TypeError):
                qty = 1
            try:
                price = float(get_col(row, "Price", "price", "Unit Price") or "0")
            except (ValueError, TypeError):
                price = 0
            
            orders_map[order_num]["items"].append({
                "line_item_id": f"csv_{uuid.uuid4().hex[:8]}",
                "sku": sku,
                "name": get_col(row, "Item Name", "item_name", "Product", "Description") or sku,
                "title": get_col(row, "Item Name", "item_name", "Product", "Description") or sku,
                "quantity": qty,
                "qty": qty,
                "qty_done": 0,
                "price": price,
            })
    
    # Create/update orders
    now = datetime.now(timezone.utc).isoformat()
    result = {
        "success": True,
        "store_id": store_id,
        "store_name": store_name,
        "total_rows": len(rows),
        "total_orders": len(orders_map),
        "created": 0,
        "updated": 0,
        "skipped": 0,
        "errors": []
    }
    
    for order_num, order_data in orders_map.items():
        try:
            # Check if order exists
            existing = await db.fulfillment_orders.find_one({
                "store_id": store_id,
                "order_number": order_num
            })
            
            if existing:
                # Update existing - add new items, update existing
                existing_skus = {i.get("sku"): i for i in existing.get("items", [])}
                for item in order_data["items"]:
                    if item["sku"] in existing_skus:
                        # Keep qty_done from existing
                        item["qty_done"] = existing_skus[item["sku"]].get("qty_done", 0)
                
                await db.fulfillment_orders.update_one(
                    {"order_id": existing["order_id"]},
                    {"$set": {
                        "items": order_data["items"],
                        "line_items": order_data["items"],
                        "customer_name": order_data["customer_name"],
                        "customer_email": order_data["customer_email"],
                        "shipping_address": order_data["shipping_address"],
                        "note": order_data["notes"],
                        "updated_at": now,
                        "synced_at": now,
                    }}
                )
                result["updated"] += 1
            else:
                # Create new order
                order_id = f"ord_{uuid.uuid4().hex[:12]}"
                total_price = sum(i["price"] * i["qty"] for i in order_data["items"])
                
                order_doc = {
                    "order_id": order_id,
                    "external_id": order_num,
                    "order_number": order_num,
                    "store_id": store_id,
                    "store_name": store_name,
                    "platform": platform,
                    "customer_name": order_data["customer_name"],
                    "customer_email": order_data["customer_email"],
                    "customer_phone": "",
                    "items": order_data["items"],
                    "line_items": order_data["items"],
                    "total_price": total_price,
                    "subtotal_price": total_price,
                    "total_tax": 0,
                    "currency": "USD",
                    "financial_status": "paid",
                    "fulfillment_status": "unfulfilled",
                    "status": "pending",
                    "current_stage_id": None,
                    "fulfillment_stage_id": "fulfill_orders",
                    "fulfillment_stage_name": "Orders",
                    "assigned_to": None,
                    "batch_id": None,
                    "note": order_data["notes"],
                    "tags": "dropship,csv-import",
                    "shipping_address": order_data["shipping_address"],
                    "created_at": now,
                    "updated_at": now,
                    "synced_at": now,
                }
                
                await db.fulfillment_orders.insert_one(order_doc)
                result["created"] += 1
                
        except Exception as e:
            result["errors"].append(f"Order {order_num}: {str(e)}")
    
    # Update store last sync time
    await db.stores.update_one(
        {"store_id": store_id},
        {"$set": {"last_order_sync": now}}
    )
    
    return result


@router.get("/csv-template")
async def get_csv_template(user: User = Depends(get_current_user)):
    """Get CSV template for order uploads
    
    Supports Antique Farmhouse format and generic formats.
    """
    return {
        "formats": [
            {
                "name": "Antique Farmhouse Format",
                "columns": [
                    {"name": "Order Number", "required": True, "description": "Order/PO number"},
                    {"name": "Full Name", "required": True, "description": "Customer full name"},
                    {"name": "Address 1", "required": False, "description": "Street address"},
                    {"name": "City", "required": False, "description": "City"},
                    {"name": "State", "required": False, "description": "State/Province"},
                    {"name": "Zip", "required": False, "description": "ZIP/Postal code"},
                    {"name": "Item Number", "required": True, "description": "Product SKU"},
                    {"name": "Price", "required": False, "description": "Item price"},
                    {"name": "Qty", "required": False, "description": "Quantity (default 1)"},
                    {"name": "Order Comments", "required": False, "description": "Order notes"},
                    {"name": "Order Date", "required": False, "description": "Date of order"},
                ],
                "sample_csv": "Order Number,Full Name,Address 1,City,State,Zip,Item Number,Price,Qty,Order Comments,Order Date\nPO-12345,John Smith,123 Main St,New York,NY,10001,FRAME-001,29.99,2,Gift wrap please,2025-02-15"
            },
            {
                "name": "Generic Format",
                "columns": [
                    {"name": "order_number", "required": True, "description": "Order or PO number"},
                    {"name": "customer_name", "required": True, "description": "Customer full name"},
                    {"name": "sku", "required": True, "description": "Product SKU"},
                    {"name": "quantity", "required": False, "description": "Quantity (default 1)"},
                    {"name": "price", "required": False, "description": "Item price"},
                    {"name": "shipping_address1", "required": False, "description": "Street address"},
                    {"name": "shipping_city", "required": False, "description": "City"},
                    {"name": "shipping_state", "required": False, "description": "State/Province"},
                    {"name": "shipping_zip", "required": False, "description": "ZIP/Postal code"},
                    {"name": "notes", "required": False, "description": "Order notes"},
                ],
                "sample_csv": "order_number,customer_name,sku,quantity,price,shipping_address1,shipping_city,shipping_state,shipping_zip,notes\nPO-12345,John Smith,FRAME-001,2,29.99,123 Main St,New York,NY,10001,Gift wrap please"
            }
        ]
    }


# Order Notes/Activities
@router.get("/{order_id}/activities")
async def get_order_activities(
    order_id: str,
    user: User = Depends(get_current_user)
):
    """Get all activities/notes for an order"""
    order = await db.fulfillment_orders.find_one({"order_id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    activities = await db.order_activities.find(
        {"order_id": order_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    return {"activities": activities}


@router.post("/{order_id}/notes")
async def add_order_note(
    order_id: str,
    note: OrderNote,
    user: User = Depends(get_current_user)
):
    """Add a note to an order"""
    order = await db.fulfillment_orders.find_one({"order_id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    activity = {
        "activity_id": f"oact_{uuid.uuid4().hex[:12]}",
        "order_id": order_id,
        "type": "note",
        "note_type": note.note_type,
        "content": note.content,
        "user_id": user.user_id,
        "user_name": user.name,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.order_activities.insert_one(activity)
    
    return {"success": True, "activity": {k: v for k, v in activity.items() if k != "_id"}}


@router.delete("/{order_id}/notes/{activity_id}")
async def delete_order_note(
    order_id: str,
    activity_id: str,
    user: User = Depends(get_current_user)
):
    """Delete an order note"""
    result = await db.order_activities.delete_one({
        "activity_id": activity_id,
        "order_id": order_id
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Note not found")
    
    return {"success": True, "message": "Note deleted"}


@router.post("/{order_id}/send-email")
async def send_order_email(
    order_id: str,
    request: SendOrderEmailRequest,
    user: User = Depends(get_current_user)
):
    """Send order confirmation email to customer"""
    # Get order from either fulfillment_orders or pos orders
    order = await db.fulfillment_orders.find_one({"order_id": order_id}, {"_id": 0})
    if not order:
        order = await db.orders.find_one({"order_id": order_id}, {"_id": 0})
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Get store info for branding
    store_id = order.get("store_id")
    store = await db.stores.find_one({"store_id": store_id}, {"_id": 0}) if store_id else None
    store_name = store.get("name", "Store") if store else "Store"
    store_phone = store.get("phone", "") if store else ""
    store_email = store.get("email", "") if store else ""
    store_address = store.get("address", "") if store else ""
    
    # Build order details
    order_number = order.get("order_number") or order.get("pos_order_number") or order_id
    customer_name = order.get("customer", {}).get("name") or order.get("name") or "Valued Customer"
    line_items = order.get("line_items", [])
    subtotal = order.get("subtotal", 0) or sum(item.get("price", 0) * item.get("quantity", 1) for item in line_items)
    shipping = order.get("shipping", {}).get("price", 0) if order.get("shipping") else 0
    total = order.get("total", subtotal + shipping)
    
    # Build items HTML
    items_html = ""
    for item in line_items:
        qty = item.get("quantity", 1)
        price = item.get("price", 0)
        line_total = qty * price
        items_html += f"""
        <tr>
            <td style="padding: 12px; border-bottom: 1px solid #eee;">
                <strong>{item.get('title', item.get('name', 'Item'))}</strong>
                {f"<br><span style='font-size: 12px; color: #666;'>SKU: {item.get('sku')}</span>" if item.get('sku') else ""}
            </td>
            <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center;">{qty}</td>
            <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right;">${price:.2f}</td>
            <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right;">${line_total:.2f}</td>
        </tr>
        """
    
    # Build email HTML
    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; padding-bottom: 20px; border-bottom: 2px solid #333; margin-bottom: 20px;">
            <h1 style="margin: 0; font-size: 24px;">{store_name}</h1>
            {f'<p style="margin: 5px 0; color: #666;">{store_phone}</p>' if store_phone else ''}
            {f'<p style="margin: 5px 0; color: #666; font-size: 14px;">{store_email}</p>' if store_email else ''}
            {f'<p style="margin: 5px 0; color: #666; font-size: 13px;">{store_address}</p>' if store_address else ''}
        </div>
        
        <h2 style="color: #333; font-size: 20px;">Order Confirmation</h2>
        <p>Dear {customer_name},</p>
        <p>Thank you for your order! Here's a summary of your purchase:</p>
        
        <div style="background: #f9f9f9; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0;"><strong>Order Number:</strong> {order_number}</p>
            <p style="margin: 5px 0 0 0;"><strong>Date:</strong> {datetime.now().strftime('%B %d, %Y')}</p>
        </div>
        
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <thead>
                <tr style="background: #f5f5f5;">
                    <th style="padding: 12px; text-align: left; border-bottom: 2px solid #333;">Item</th>
                    <th style="padding: 12px; text-align: center; border-bottom: 2px solid #333;">Qty</th>
                    <th style="padding: 12px; text-align: right; border-bottom: 2px solid #333;">Price</th>
                    <th style="padding: 12px; text-align: right; border-bottom: 2px solid #333;">Total</th>
                </tr>
            </thead>
            <tbody>
                {items_html}
            </tbody>
        </table>
        
        <div style="margin-left: auto; width: 250px; margin-top: 20px;">
            <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee;">
                <span>Subtotal:</span>
                <span>${subtotal:.2f}</span>
            </div>
            {f'<div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee;"><span>Shipping:</span><span>${shipping:.2f}</span></div>' if shipping > 0 else ''}
            <div style="display: flex; justify-content: space-between; padding: 8px 0; font-weight: bold; font-size: 18px; border-top: 2px solid #333;">
                <span>Total:</span>
                <span>${total:.2f}</span>
            </div>
        </div>
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center; color: #666; font-size: 12px;">
            <p>Thank you for your business!</p>
            <p>If you have any questions, please contact us.</p>
        </div>
    </body>
    </html>
    """
    
    # Send via Resend
    resend_key = os.environ.get("RESEND_API_KEY")
    if not resend_key:
        raise HTTPException(status_code=500, detail="Email service not configured")
    
    try:
        # Use verified domain email
        verified_from_email = os.environ.get("RESEND_FROM_EMAIL", "onboarding@resend.dev")
        
        params = {
            "from": f"{store_name} <{verified_from_email}>",
            "to": [request.to],
            "subject": f"Order Confirmation - {order_number}",
            "html": html_body,
            "reply_to": store_email if store_email and store_email != verified_from_email else None
        }
        
        # Remove None values
        params = {k: v for k, v in params.items() if v is not None}
        
        email_response = await asyncio.to_thread(resend.Emails.send, params)
        
        logger.info(f"Order email sent to {request.to} for order {order_number}, ID: {email_response.get('id')}")
        
        # Log the email
        await db.email_logs.insert_one({
            "email_id": email_response.get("id"),
            "to": request.to,
            "subject": f"Order Confirmation - {order_number}",
            "order_id": order_id,
            "order_number": order_number,
            "store_id": store_id,
            "total": total,
            "items_count": len(line_items),
            "sent_by": user.user_id,
            "sent_by_name": user.name,
            "status": "sent",
            "provider": "resend",
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        
        return {
            "message": "Email sent successfully",
            "to": request.to,
            "email_id": email_response.get("id")
        }
        
    except Exception as e:
        logger.error(f"Failed to send order email: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to send email: {str(e)}")

