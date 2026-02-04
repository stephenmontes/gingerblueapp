"""
Customer CRM Router
Handles customer management, notes, tags, and Shopify sync
"""
from fastapi import APIRouter, HTTPException, Depends, Query, BackgroundTasks
from datetime import datetime, timezone
from typing import Optional, List
from pydantic import BaseModel, Field
import uuid

from database import db
from models.user import User
from dependencies import get_current_user
from services.shopify_service import ShopifyService

router = APIRouter(prefix="/customers", tags=["customers"])


# Pydantic Models
class CustomerNote(BaseModel):
    content: str
    note_type: str = "general"  # general, call, email, meeting, issue


class CustomerTag(BaseModel):
    tag: str


class CustomerUpdate(BaseModel):
    custom_tags: Optional[List[str]] = None
    segment: Optional[str] = None
    notes: Optional[str] = None


class CustomerSearchParams(BaseModel):
    search: Optional[str] = None
    store_id: Optional[str] = None
    tag: Optional[str] = None
    segment: Optional[str] = None
    has_orders: Optional[bool] = None
    sort_by: str = "created_at"
    sort_order: str = "desc"
    page: int = 1
    page_size: int = 50


# Helper Functions
async def sync_shopify_customers_for_store(store: dict) -> dict:
    """Sync customers from a single Shopify store"""
    if store.get("platform") != "shopify":
        return {"store_id": store.get("store_id"), "synced": 0, "error": "Not a Shopify store"}
    
    try:
        service = ShopifyService(
            shop_url=store.get("shop_url") or store.get("shop_id"),
            access_token=store.get("access_token")
        )
        
        # Fetch all customers from Shopify
        customers = await service.fetch_customers()
        
        synced_count = 0
        for shopify_customer in customers:
            customer_id = f"cust_{store.get('store_id')}_{shopify_customer.get('id')}"
            
            # Extract address info
            default_address = shopify_customer.get("default_address") or {}
            addresses = shopify_customer.get("addresses") or []
            
            # Extract tags from Shopify
            shopify_tags = []
            if shopify_customer.get("tags"):
                shopify_tags = [t.strip() for t in shopify_customer.get("tags", "").split(",") if t.strip()]
            
            customer_doc = {
                "customer_id": customer_id,
                "external_id": str(shopify_customer.get("id")),
                "store_id": store.get("store_id"),
                "store_name": store.get("name"),
                "platform": "shopify",
                
                # Contact Info
                "email": shopify_customer.get("email"),
                "phone": shopify_customer.get("phone"),
                "first_name": shopify_customer.get("first_name"),
                "last_name": shopify_customer.get("last_name"),
                "full_name": f"{shopify_customer.get('first_name', '')} {shopify_customer.get('last_name', '')}".strip(),
                
                # Address
                "default_address": {
                    "address1": default_address.get("address1"),
                    "address2": default_address.get("address2"),
                    "city": default_address.get("city"),
                    "province": default_address.get("province"),
                    "province_code": default_address.get("province_code"),
                    "country": default_address.get("country"),
                    "country_code": default_address.get("country_code"),
                    "zip": default_address.get("zip"),
                    "company": default_address.get("company"),
                },
                "addresses": addresses,
                
                # Shopify Stats
                "orders_count": shopify_customer.get("orders_count", 0),
                "total_spent": float(shopify_customer.get("total_spent", 0)),
                "currency": shopify_customer.get("currency", "USD"),
                "accepts_marketing": shopify_customer.get("accepts_marketing", False),
                "accepts_marketing_updated_at": shopify_customer.get("accepts_marketing_updated_at"),
                "tax_exempt": shopify_customer.get("tax_exempt", False),
                "verified_email": shopify_customer.get("verified_email", False),
                
                # Tags & Segments (from Shopify)
                "shopify_tags": shopify_tags,
                "shopify_state": shopify_customer.get("state"),  # enabled, disabled, invited
                
                # Shopify Timestamps
                "shopify_created_at": shopify_customer.get("created_at"),
                "shopify_updated_at": shopify_customer.get("updated_at"),
                "last_order_id": shopify_customer.get("last_order_id"),
                "last_order_name": shopify_customer.get("last_order_name"),
                
                # Sync metadata
                "last_synced_at": datetime.now(timezone.utc).isoformat(),
            }
            
            # Upsert customer - preserve custom fields if they exist
            existing = await db.customers.find_one({"customer_id": customer_id})
            if existing:
                # Preserve custom fields
                customer_doc["custom_tags"] = existing.get("custom_tags", [])
                customer_doc["segment"] = existing.get("segment")
                customer_doc["internal_notes"] = existing.get("internal_notes")
                customer_doc["created_at"] = existing.get("created_at")
                customer_doc["updated_at"] = datetime.now(timezone.utc).isoformat()
            else:
                customer_doc["custom_tags"] = []
                customer_doc["segment"] = None
                customer_doc["internal_notes"] = None
                customer_doc["created_at"] = datetime.now(timezone.utc).isoformat()
                customer_doc["updated_at"] = datetime.now(timezone.utc).isoformat()
            
            await db.customers.update_one(
                {"customer_id": customer_id},
                {"$set": customer_doc},
                upsert=True
            )
            synced_count += 1
        
        # Update store sync timestamp
        await db.stores.update_one(
            {"store_id": store.get("store_id")},
            {"$set": {"customers_synced_at": datetime.now(timezone.utc).isoformat()}}
        )
        
        return {
            "store_id": store.get("store_id"),
            "store_name": store.get("name"),
            "synced": synced_count,
            "success": True
        }
    
    except Exception as e:
        return {
            "store_id": store.get("store_id"),
            "store_name": store.get("name"),
            "synced": 0,
            "success": False,
            "error": str(e)
        }


# API Endpoints
@router.get("")
async def get_customers(
    search: Optional[str] = None,
    store_id: Optional[str] = None,
    tag: Optional[str] = None,
    segment: Optional[str] = None,
    has_orders: Optional[bool] = None,
    sort_by: str = Query("created_at", description="Field to sort by"),
    sort_order: str = Query("desc", description="asc or desc"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user: User = Depends(get_current_user)
):
    """Get customers with filtering and pagination"""
    query = {}
    
    # Search across multiple fields
    if search and search.strip():
        search_regex = {"$regex": search.strip(), "$options": "i"}
        query["$or"] = [
            {"full_name": search_regex},
            {"email": search_regex},
            {"phone": search_regex},
            {"default_address.city": search_regex},
            {"default_address.company": search_regex},
        ]
    
    if store_id:
        query["store_id"] = store_id
    
    if tag:
        query["$or"] = [
            {"shopify_tags": tag},
            {"custom_tags": tag}
        ]
    
    if segment:
        query["segment"] = segment
    
    if has_orders is not None:
        if has_orders:
            query["orders_count"] = {"$gt": 0}
        else:
            query["orders_count"] = 0
    
    # Count total
    total_count = await db.customers.count_documents(query)
    
    # Sort
    sort_direction = 1 if sort_order == "asc" else -1
    sort_field_map = {
        "created_at": "created_at",
        "name": "full_name",
        "email": "email",
        "orders_count": "orders_count",
        "total_spent": "total_spent",
        "last_synced_at": "last_synced_at",
    }
    sort_field = sort_field_map.get(sort_by, "created_at")
    
    # Pagination
    skip = (page - 1) * page_size
    
    # Projection - exclude large fields for list view
    projection = {
        "_id": 0,
        "customer_id": 1,
        "external_id": 1,
        "store_id": 1,
        "store_name": 1,
        "email": 1,
        "phone": 1,
        "first_name": 1,
        "last_name": 1,
        "full_name": 1,
        "default_address": 1,
        "orders_count": 1,
        "total_spent": 1,
        "currency": 1,
        "shopify_tags": 1,
        "custom_tags": 1,
        "segment": 1,
        "accepts_marketing": 1,
        "last_order_name": 1,
        "created_at": 1,
        "last_synced_at": 1,
    }
    
    customers = await db.customers.find(query, projection).sort(
        sort_field, sort_direction
    ).skip(skip).limit(page_size).to_list(page_size)
    
    return {
        "customers": customers,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total_count": total_count,
            "total_pages": (total_count + page_size - 1) // page_size
        }
    }


@router.get("/stats")
async def get_customer_stats(user: User = Depends(get_current_user)):
    """Get overall customer statistics"""
    pipeline = [
        {"$group": {
            "_id": None,
            "total_customers": {"$sum": 1},
            "total_revenue": {"$sum": "$total_spent"},
            "total_orders": {"$sum": "$orders_count"},
            "with_orders": {"$sum": {"$cond": [{"$gt": ["$orders_count", 0]}, 1, 0]}},
            "accepts_marketing": {"$sum": {"$cond": ["$accepts_marketing", 1, 0]}},
        }}
    ]
    
    stats = await db.customers.aggregate(pipeline).to_list(1)
    
    # Get customers by store
    store_pipeline = [
        {"$group": {
            "_id": {"store_id": "$store_id", "store_name": "$store_name"},
            "count": {"$sum": 1},
            "revenue": {"$sum": "$total_spent"}
        }},
        {"$sort": {"count": -1}}
    ]
    by_store = await db.customers.aggregate(store_pipeline).to_list(100)
    
    # Get segment breakdown
    segment_pipeline = [
        {"$group": {
            "_id": "$segment",
            "count": {"$sum": 1}
        }},
        {"$sort": {"count": -1}}
    ]
    by_segment = await db.customers.aggregate(segment_pipeline).to_list(100)
    
    # Get top tags
    tag_pipeline = [
        {"$unwind": {"path": "$shopify_tags", "preserveNullAndEmptyArrays": False}},
        {"$group": {"_id": "$shopify_tags", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 20}
    ]
    top_tags = await db.customers.aggregate(tag_pipeline).to_list(20)
    
    base_stats = stats[0] if stats else {
        "total_customers": 0,
        "total_revenue": 0,
        "total_orders": 0,
        "with_orders": 0,
        "accepts_marketing": 0
    }
    
    return {
        "totals": {
            "customers": base_stats.get("total_customers", 0),
            "revenue": round(base_stats.get("total_revenue", 0), 2),
            "orders": base_stats.get("total_orders", 0),
            "with_orders": base_stats.get("with_orders", 0),
            "accepts_marketing": base_stats.get("accepts_marketing", 0),
            "avg_lifetime_value": round(
                base_stats.get("total_revenue", 0) / base_stats.get("total_customers", 1), 2
            ) if base_stats.get("total_customers", 0) > 0 else 0
        },
        "by_store": [
            {
                "store_id": s["_id"]["store_id"],
                "store_name": s["_id"]["store_name"],
                "count": s["count"],
                "revenue": round(s["revenue"], 2)
            }
            for s in by_store
        ],
        "by_segment": [
            {"segment": s["_id"] or "Unassigned", "count": s["count"]}
            for s in by_segment
        ],
        "top_tags": [
            {"tag": t["_id"], "count": t["count"]}
            for t in top_tags
        ]
    }


@router.get("/segments")
async def get_segments(user: User = Depends(get_current_user)):
    """Get all unique segments and tags"""
    # Custom segments
    segments = await db.customers.distinct("segment")
    segments = [s for s in segments if s]
    
    # All tags (Shopify + custom)
    shopify_tags = await db.customers.distinct("shopify_tags")
    custom_tags = await db.customers.distinct("custom_tags")
    all_tags = list(set(shopify_tags + custom_tags))
    all_tags = [t for t in all_tags if t]
    
    return {
        "segments": sorted(segments),
        "tags": sorted(all_tags)
    }


@router.get("/{customer_id}")
async def get_customer(customer_id: str, user: User = Depends(get_current_user)):
    """Get a single customer with full details"""
    customer = await db.customers.find_one({"customer_id": customer_id}, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    # Get customer's orders
    orders = await db.fulfillment_orders.find(
        {"customer_email": customer.get("email")},
        {
            "_id": 0,
            "order_id": 1,
            "order_number": 1,
            "external_id": 1,
            "total_price": 1,
            "status": 1,
            "created_at": 1,
            "items": 1
        }
    ).sort("created_at", -1).limit(50).to_list(50)
    
    # Get activity/notes for this customer
    activities = await db.customer_activities.find(
        {"customer_id": customer_id},
        {"_id": 0}
    ).sort("created_at", -1).limit(100).to_list(100)
    
    return {
        **customer,
        "orders": orders,
        "activities": activities
    }


@router.put("/{customer_id}")
async def update_customer(
    customer_id: str,
    updates: CustomerUpdate,
    user: User = Depends(get_current_user)
):
    """Update customer custom fields (tags, segment, notes)"""
    customer = await db.customers.find_one({"customer_id": customer_id})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    update_doc = {"updated_at": datetime.now(timezone.utc).isoformat()}
    
    if updates.custom_tags is not None:
        update_doc["custom_tags"] = updates.custom_tags
    if updates.segment is not None:
        update_doc["segment"] = updates.segment
    if updates.notes is not None:
        update_doc["internal_notes"] = updates.notes
    
    await db.customers.update_one(
        {"customer_id": customer_id},
        {"$set": update_doc}
    )
    
    # Log activity
    await db.customer_activities.insert_one({
        "activity_id": f"act_{uuid.uuid4().hex[:12]}",
        "customer_id": customer_id,
        "type": "update",
        "description": "Customer profile updated",
        "changes": {k: v for k, v in update_doc.items() if k != "updated_at"},
        "user_id": user.user_id,
        "user_name": user.name,
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    return {"success": True, "message": "Customer updated"}


@router.post("/{customer_id}/notes")
async def add_customer_note(
    customer_id: str,
    note: CustomerNote,
    user: User = Depends(get_current_user)
):
    """Add a note to a customer"""
    customer = await db.customers.find_one({"customer_id": customer_id})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    activity = {
        "activity_id": f"act_{uuid.uuid4().hex[:12]}",
        "customer_id": customer_id,
        "type": "note",
        "note_type": note.note_type,
        "content": note.content,
        "user_id": user.user_id,
        "user_name": user.name,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.customer_activities.insert_one(activity)
    
    return {"success": True, "activity": {k: v for k, v in activity.items() if k != "_id"}}


@router.delete("/{customer_id}/notes/{activity_id}")
async def delete_customer_note(
    customer_id: str,
    activity_id: str,
    user: User = Depends(get_current_user)
):
    """Delete a customer note"""
    result = await db.customer_activities.delete_one({
        "activity_id": activity_id,
        "customer_id": customer_id,
        "type": "note"
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Note not found")
    
    return {"success": True, "message": "Note deleted"}


@router.post("/{customer_id}/tags")
async def add_customer_tag(
    customer_id: str,
    tag_data: CustomerTag,
    user: User = Depends(get_current_user)
):
    """Add a custom tag to a customer"""
    result = await db.customers.update_one(
        {"customer_id": customer_id},
        {
            "$addToSet": {"custom_tags": tag_data.tag},
            "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}
        }
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    return {"success": True, "message": f"Tag '{tag_data.tag}' added"}


@router.delete("/{customer_id}/tags/{tag}")
async def remove_customer_tag(
    customer_id: str,
    tag: str,
    user: User = Depends(get_current_user)
):
    """Remove a custom tag from a customer"""
    result = await db.customers.update_one(
        {"customer_id": customer_id},
        {
            "$pull": {"custom_tags": tag},
            "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}
        }
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    return {"success": True, "message": f"Tag '{tag}' removed"}


@router.post("/sync")
async def sync_customers(
    background_tasks: BackgroundTasks,
    store_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Sync customers from connected Shopify stores"""
    if user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized to sync customers")
    
    # Get stores to sync
    query = {"platform": "shopify"}
    if store_id:
        query["store_id"] = store_id
    
    stores = await db.stores.find(query, {"_id": 0}).to_list(100)
    
    if not stores:
        raise HTTPException(status_code=404, detail="No Shopify stores found")
    
    # Sync each store
    results = []
    for store in stores:
        result = await sync_shopify_customers_for_store(store)
        results.append(result)
    
    total_synced = sum(r.get("synced", 0) for r in results)
    
    return {
        "success": True,
        "total_synced": total_synced,
        "stores": results
    }


@router.post("/bulk-tag")
async def bulk_add_tag(
    customer_ids: List[str],
    tag: str,
    user: User = Depends(get_current_user)
):
    """Add a tag to multiple customers"""
    result = await db.customers.update_many(
        {"customer_id": {"$in": customer_ids}},
        {
            "$addToSet": {"custom_tags": tag},
            "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}
        }
    )
    
    return {
        "success": True,
        "modified": result.modified_count,
        "message": f"Tag '{tag}' added to {result.modified_count} customers"
    }


@router.post("/bulk-segment")
async def bulk_set_segment(
    customer_ids: List[str],
    segment: str,
    user: User = Depends(get_current_user)
):
    """Set segment for multiple customers"""
    result = await db.customers.update_many(
        {"customer_id": {"$in": customer_ids}},
        {"$set": {
            "segment": segment,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {
        "success": True,
        "modified": result.modified_count,
        "message": f"Segment set for {result.modified_count} customers"
    }
