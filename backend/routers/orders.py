from fastapi import APIRouter, HTTPException, Depends, Query, UploadFile, File
from typing import Optional, List
from datetime import datetime, timezone
import uuid
import csv
import io

from database import db
from models.user import User
from models.order import Order, OrderCreate
from models.production import StageMove
from models.time_log import TimeLog
from dependencies import get_current_user
from services.shopify_service import sync_orders_from_store
from services.etsy_service import sync_orders_from_etsy_store
from services.shipstation_sync import sync_orders_from_shipstation

router = APIRouter(prefix="/orders", tags=["orders"])

@router.get("")
async def get_orders(
    store_id: Optional[str] = None,
    status: Optional[str] = None,
    stage_id: Optional[str] = None,
    unbatched: Optional[bool] = None,
    include_archived: Optional[bool] = False,
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
    
    Pagination:
    - page: Page number (default 1)
    - page_size: Items per page (default 100, max 500)
    """
    query = {}
    if store_id:
        query["store_id"] = store_id
    
    # Handle status filtering - "active" means exclude shipped/cancelled/completed
    inactive_statuses = ["shipped", "cancelled", "completed"]
    if status == "active":
        query["status"] = {"$nin": inactive_statuses}
    elif status and status != "all":
        query["status"] = status
    # If status is "all" or None, no status filter is applied
    
    if stage_id:
        query["current_stage_id"] = stage_id
    if unbatched:
        query["$or"] = [{"batch_id": None}, {"batch_id": {"$exists": False}}]
    
    # Exclude archived orders by default
    if not include_archived:
        query["archived"] = {"$ne": True}
    
    # Get total count for pagination info
    total_count = await db.fulfillment_orders.count_documents(query)
    
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
    
    # Fetch from fulfillment_orders with pagination
    # Sort by requested field - created_at is the most reliable date field
    orders = await db.fulfillment_orders.find(query, {"_id": 0}).sort([
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
    else:
        raise HTTPException(status_code=400, detail=f"Platform '{platform}' does not support order sync")
    
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Sync failed"))
    
    return result


@router.get("/sync/status")
async def get_sync_status(user: User = Depends(get_current_user)):
    """Get order sync status for all stores"""
    stores = await db.stores.find(
        {"platform": {"$in": ["shopify", "etsy"]}}, 
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
            "order_count": order_count,
            "is_active": store.get("is_active", True)
        })
    
    return result


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
