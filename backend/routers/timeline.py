"""
Timeline & Activity Feed Router
Salesforce-style unified timeline for CRM records
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from datetime import datetime, timezone
from typing import Optional, List
import uuid
import re

from database import db
from models.user import User
from models.timeline import (
    EntityType, ActivityType, Visibility,
    TimelineItemCreate, TimelineItemUpdate,
    ACTIVITY_TYPE_CONFIG
)
from dependencies import get_current_user

router = APIRouter(prefix="/timeline", tags=["timeline"])


def generate_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def parse_mentions(text: str) -> List[dict]:
    """Parse @username mentions from text"""
    if not text:
        return []
    # Find all @mentions (alphanumeric + underscores)
    pattern = r'@(\w+)'
    matches = re.findall(pattern, text)
    return [{"username": m, "mention_text": f"@{m}"} for m in matches]


async def resolve_mentions(mentions: List[dict]) -> List[dict]:
    """Resolve @username to user_id"""
    resolved = []
    for mention in mentions:
        # Try to find user by username or name
        user = await db.users.find_one({
            "$or": [
                {"username": mention["username"]},
                {"name": {"$regex": f"^{mention['username']}$", "$options": "i"}}
            ]
        })
        if user:
            resolved.append({
                "mentioned_user_id": user.get("user_id"),
                "mentioned_user_name": user.get("name", mention["username"]),
                "mention_text": mention["mention_text"]
            })
    return resolved


async def create_notifications_for_mentions(
    timeline_item_id: str,
    mentions: List[dict],
    entity_type: str,
    entity_id: str,
    author_name: str
):
    """Create notifications for mentioned users"""
    now = datetime.now(timezone.utc).isoformat()
    
    for mention in mentions:
        notification = {
            "notification_id": generate_id("notif"),
            "user_id": mention["mentioned_user_id"],
            "notification_type": "mention",
            "title": f"{author_name} mentioned you",
            "body": f"You were mentioned in a {entity_type}",
            "entity_type": entity_type,
            "entity_id": entity_id,
            "timeline_item_id": timeline_item_id,
            "is_read": False,
            "created_at": now
        }
        await db.timeline_notifications.insert_one(notification)


async def notify_followers(
    entity_type: str,
    entity_id: str,
    activity_type: str,
    author_user_id: str,
    author_name: str,
    timeline_item_id: str
):
    """Notify users following this record"""
    now = datetime.now(timezone.utc).isoformat()
    
    # Get followers who want this type of notification
    followers = await db.record_follows.find({
        "entity_type": entity_type,
        "entity_id": entity_id,
        "notify_on": activity_type
    }).to_list(100)
    
    for follower in followers:
        # Don't notify the author
        if follower.get("user_id") == author_user_id:
            continue
        
        notification = {
            "notification_id": generate_id("notif"),
            "user_id": follower["user_id"],
            "notification_type": "follow_update",
            "title": f"New activity on followed {entity_type}",
            "body": f"{author_name} posted a {activity_type.replace('_', ' ')}",
            "entity_type": entity_type,
            "entity_id": entity_id,
            "timeline_item_id": timeline_item_id,
            "is_read": False,
            "created_at": now
        }
        await db.timeline_notifications.insert_one(notification)


# ==================== TIMELINE ITEMS ====================

@router.post("/items")
async def create_timeline_item(
    item: TimelineItemCreate,
    user: User = Depends(get_current_user)
):
    """Create a new timeline item (post, note, call log, etc.)"""
    item_id = generate_id("tl")
    now = datetime.now(timezone.utc).isoformat()
    
    # Parse mentions from body
    mentions = parse_mentions(item.body)
    resolved_mentions = await resolve_mentions(mentions)
    
    # Get entity name for context
    entity_name = await get_entity_name(item.entity_type, item.entity_id)
    
    item_doc = {
        "item_id": item_id,
        "entity_type": str(item.entity_type.value) if hasattr(item.entity_type, 'value') else str(item.entity_type),
        "entity_id": item.entity_id,
        "entity_name": entity_name,
        "activity_type": str(item.activity_type.value) if hasattr(item.activity_type, 'value') else str(item.activity_type),
        "body": item.body,
        "visibility": str(item.visibility.value) if hasattr(item.visibility, 'value') else str(item.visibility),
        "parent_id": item.parent_id,
        "metadata": item.metadata,
        "attachments": [a.model_dump() if hasattr(a, 'model_dump') else a for a in item.attachments],
        "mentions": resolved_mentions,
        "is_pinned": False,
        "is_edited": False,
        "is_deleted": False,
        "reply_count": 0,
        "created_by_user_id": user.user_id,
        "created_by_name": user.name,
        "created_at": now,
        "updated_at": now,
        # Activity-specific fields
        "call_duration_minutes": item.call_duration_minutes,
        "call_outcome": item.call_outcome,
        "task_id": item.task_id,
        "event_id": item.event_id
    }
    
    await db.timeline_items.insert_one(item_doc)
    
    # Update parent's reply count
    if item.parent_id:
        await db.timeline_items.update_one(
            {"item_id": item.parent_id},
            {"$inc": {"reply_count": 1}}
        )
    
    # Create mention notifications
    if resolved_mentions:
        await create_notifications_for_mentions(
            item_id, resolved_mentions, 
            item_doc["entity_type"], item.entity_id, user.name
        )
    
    # Notify followers
    await notify_followers(
        item_doc["entity_type"], item.entity_id,
        item_doc["activity_type"], user.user_id, user.name, item_id
    )
    
    item_doc.pop("_id", None)
    return item_doc


@router.get("/items/{entity_type}/{entity_id}")
async def get_timeline(
    entity_type: str,
    entity_id: str,
    activity_types: Optional[str] = None,  # Comma-separated filter
    include_replies: bool = True,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user)
):
    """Get timeline for a record with pagination"""
    query = {
        "entity_type": entity_type,
        "entity_id": entity_id,
        "is_deleted": {"$ne": True}
    }
    
    # Filter to top-level items only (no replies in main list)
    if not include_replies:
        query["parent_id"] = None
    else:
        query["parent_id"] = None  # Always show top-level, replies loaded separately
    
    # Activity type filter
    if activity_types:
        types_list = [t.strip() for t in activity_types.split(",")]
        query["activity_type"] = {"$in": types_list}
    
    # Visibility filter based on user role
    if user.role == "worker":
        query["$or"] = [
            {"visibility": "public"},
            {"visibility": "internal"},
            {"created_by_user_id": user.user_id}
        ]
    
    total = await db.timeline_items.count_documents(query)
    skip = (page - 1) * page_size
    
    items = await db.timeline_items.find(query, {"_id": 0}).sort(
        "created_at", -1
    ).skip(skip).limit(page_size).to_list(page_size)
    
    # Load replies for each item
    for item in items:
        if item.get("reply_count", 0) > 0:
            replies = await db.timeline_items.find({
                "parent_id": item["item_id"],
                "is_deleted": {"$ne": True}
            }, {"_id": 0}).sort("created_at", 1).limit(5).to_list(5)
            item["replies"] = replies
            item["has_more_replies"] = item.get("reply_count", 0) > 5
    
    return {
        "items": items,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": (total + page_size - 1) // page_size
        }
    }


@router.get("/items/{item_id}/replies")
async def get_item_replies(
    item_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user)
):
    """Get replies/comments for a timeline item"""
    query = {
        "parent_id": item_id,
        "is_deleted": {"$ne": True}
    }
    
    total = await db.timeline_items.count_documents(query)
    skip = (page - 1) * page_size
    
    replies = await db.timeline_items.find(query, {"_id": 0}).sort(
        "created_at", 1
    ).skip(skip).limit(page_size).to_list(page_size)
    
    return {
        "replies": replies,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": (total + page_size - 1) // page_size
        }
    }


@router.put("/items/{item_id}")
async def update_timeline_item(
    item_id: str,
    updates: TimelineItemUpdate,
    user: User = Depends(get_current_user)
):
    """Update a timeline item (edit post)"""
    existing = await db.timeline_items.find_one({"item_id": item_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Item not found")
    
    # Check permission: owner can edit within time window, admins always
    if existing.get("created_by_user_id") != user.user_id and user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to edit this item")
    
    # Check time window for non-admins (15 minutes)
    if user.role != "admin":
        created_at = datetime.fromisoformat(existing["created_at"].replace('Z', '+00:00'))
        elapsed = (datetime.now(timezone.utc) - created_at).total_seconds() / 60
        if elapsed > 15:
            raise HTTPException(status_code=400, detail="Edit window expired (15 minutes)")
    
    update_data = {k: v for k, v in updates.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No updates provided")
    
    # Re-parse mentions if body changed
    if "body" in update_data:
        mentions = parse_mentions(update_data["body"])
        update_data["mentions"] = await resolve_mentions(mentions)
    
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    update_data["updated_by"] = user.user_id
    update_data["is_edited"] = True
    
    await db.timeline_items.update_one({"item_id": item_id}, {"$set": update_data})
    
    return {"success": True, "message": "Item updated"}


@router.delete("/items/{item_id}")
async def delete_timeline_item(
    item_id: str,
    user: User = Depends(get_current_user)
):
    """Soft delete a timeline item"""
    existing = await db.timeline_items.find_one({"item_id": item_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Item not found")
    
    # Check permission
    if existing.get("created_by_user_id") != user.user_id and user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to delete this item")
    
    # System events cannot be deleted
    config = ACTIVITY_TYPE_CONFIG.get(existing.get("activity_type"), {})
    if not config.get("user_created", True) and user.role != "admin":
        raise HTTPException(status_code=400, detail="Cannot delete system events")
    
    await db.timeline_items.update_one(
        {"item_id": item_id},
        {"$set": {
            "is_deleted": True,
            "deleted_at": datetime.now(timezone.utc).isoformat(),
            "deleted_by": user.user_id
        }}
    )
    
    # Decrement parent's reply count
    if existing.get("parent_id"):
        await db.timeline_items.update_one(
            {"item_id": existing["parent_id"]},
            {"$inc": {"reply_count": -1}}
        )
    
    return {"success": True, "message": "Item deleted"}


@router.post("/items/{item_id}/pin")
async def toggle_pin_item(
    item_id: str,
    user: User = Depends(get_current_user)
):
    """Pin/unpin a timeline item"""
    if user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Only managers can pin items")
    
    existing = await db.timeline_items.find_one({"item_id": item_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Item not found")
    
    new_pinned = not existing.get("is_pinned", False)
    
    await db.timeline_items.update_one(
        {"item_id": item_id},
        {"$set": {
            "is_pinned": new_pinned,
            "pinned_at": datetime.now(timezone.utc).isoformat() if new_pinned else None,
            "pinned_by": user.user_id if new_pinned else None
        }}
    )
    
    return {"success": True, "is_pinned": new_pinned}


# ==================== RECORD FOLLOWS ====================

@router.post("/follow/{entity_type}/{entity_id}")
async def follow_record(
    entity_type: str,
    entity_id: str,
    notify_on: List[str] = ["chat_post", "comment", "stage_changed", "mention"],
    user: User = Depends(get_current_user)
):
    """Follow a record to get notifications"""
    # Check if already following
    existing = await db.record_follows.find_one({
        "user_id": user.user_id,
        "entity_type": entity_type,
        "entity_id": entity_id
    })
    
    if existing:
        # Update notification preferences
        await db.record_follows.update_one(
            {"follow_id": existing["follow_id"]},
            {"$set": {"notify_on": notify_on}}
        )
        return {"success": True, "message": "Follow preferences updated", "follow_id": existing["follow_id"]}
    
    now = datetime.now(timezone.utc).isoformat()
    follow_doc = {
        "follow_id": generate_id("follow"),
        "user_id": user.user_id,
        "user_name": user.name,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "notify_on": notify_on,
        "created_at": now
    }
    
    await db.record_follows.insert_one(follow_doc)
    follow_doc.pop("_id", None)
    
    return {"success": True, "message": "Now following", "follow": follow_doc}


@router.delete("/follow/{entity_type}/{entity_id}")
async def unfollow_record(
    entity_type: str,
    entity_id: str,
    user: User = Depends(get_current_user)
):
    """Unfollow a record"""
    result = await db.record_follows.delete_one({
        "user_id": user.user_id,
        "entity_type": entity_type,
        "entity_id": entity_id
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not following this record")
    
    return {"success": True, "message": "Unfollowed"}


@router.get("/follow/{entity_type}/{entity_id}")
async def get_follow_status(
    entity_type: str,
    entity_id: str,
    user: User = Depends(get_current_user)
):
    """Check if user is following a record"""
    follow = await db.record_follows.find_one({
        "user_id": user.user_id,
        "entity_type": entity_type,
        "entity_id": entity_id
    }, {"_id": 0})
    
    return {
        "is_following": follow is not None,
        "follow": follow
    }


@router.get("/followers/{entity_type}/{entity_id}")
async def get_record_followers(
    entity_type: str,
    entity_id: str,
    user: User = Depends(get_current_user)
):
    """Get list of users following a record"""
    followers = await db.record_follows.find({
        "entity_type": entity_type,
        "entity_id": entity_id
    }, {"_id": 0}).to_list(100)
    
    return {"followers": followers, "count": len(followers)}


# ==================== NOTIFICATIONS ====================

@router.get("/notifications")
async def get_notifications(
    is_read: Optional[bool] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user)
):
    """Get user's notifications"""
    query = {"user_id": user.user_id}
    if is_read is not None:
        query["is_read"] = is_read
    
    total = await db.timeline_notifications.count_documents(query)
    skip = (page - 1) * page_size
    
    notifications = await db.timeline_notifications.find(query, {"_id": 0}).sort(
        "created_at", -1
    ).skip(skip).limit(page_size).to_list(page_size)
    
    # Count unread
    unread_count = await db.timeline_notifications.count_documents({
        "user_id": user.user_id,
        "is_read": False
    })
    
    return {
        "notifications": notifications,
        "unread_count": unread_count,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": total
        }
    }


@router.put("/notifications/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    user: User = Depends(get_current_user)
):
    """Mark a notification as read"""
    result = await db.timeline_notifications.update_one(
        {"notification_id": notification_id, "user_id": user.user_id},
        {"$set": {"is_read": True, "read_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    return {"success": True}


@router.put("/notifications/read-all")
async def mark_all_notifications_read(user: User = Depends(get_current_user)):
    """Mark all notifications as read"""
    now = datetime.now(timezone.utc).isoformat()
    
    await db.timeline_notifications.update_many(
        {"user_id": user.user_id, "is_read": False},
        {"$set": {"is_read": True, "read_at": now}}
    )
    
    return {"success": True}


# ==================== SYSTEM EVENT LOGGING ====================

async def log_system_event(
    entity_type: str,
    entity_id: str,
    activity_type: str,
    body: str,
    metadata: dict = None,
    user_id: str = None,
    user_name: str = None
):
    """Log a system event to the timeline (called from other routers)"""
    item_id = generate_id("tl")
    now = datetime.now(timezone.utc).isoformat()
    
    entity_name = await get_entity_name(entity_type, entity_id)
    
    item_doc = {
        "item_id": item_id,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "entity_name": entity_name,
        "activity_type": activity_type,
        "body": body,
        "visibility": "public",
        "parent_id": None,
        "metadata": metadata or {},
        "attachments": [],
        "mentions": [],
        "is_pinned": False,
        "is_edited": False,
        "is_deleted": False,
        "reply_count": 0,
        "created_by_user_id": user_id,
        "created_by_name": user_name or "System",
        "created_at": now,
        "updated_at": now
    }
    
    await db.timeline_items.insert_one(item_doc)
    
    # Notify followers of system events
    if user_id:
        await notify_followers(
            entity_type, entity_id, activity_type,
            user_id, user_name or "System", item_id
        )
    
    return item_id


async def get_entity_name(entity_type: str, entity_id: str) -> str:
    """Get the name/title of an entity for display"""
    collection_map = {
        "account": ("crm_accounts", "name"),
        "contact": ("crm_contacts", "full_name"),
        "lead": ("crm_leads", "full_name"),
        "opportunity": ("crm_opportunities", "name"),
        "customer": ("customers", "email"),
        "quote": ("crm_quotes", "quote_name"),
        "order": ("orders", "name"),
        "task": ("crm_tasks", "subject")
    }
    
    if entity_type not in collection_map:
        return entity_id
    
    collection_name, name_field = collection_map[entity_type]
    collection = getattr(db, collection_name, None)
    if collection is None:
        return entity_id
    
    # Try to find by various id fields
    id_fields = [f"{entity_type}_id", "id", f"{entity_type.replace('_', '')}Id"]
    for id_field in id_fields:
        record = await collection.find_one({id_field: entity_id})
        if record:
            return record.get(name_field, entity_id)
    
    return entity_id


# ==================== ACTIVITY TYPE CONFIGURATIONS ====================

@router.get("/activity-types")
async def get_activity_types(user: User = Depends(get_current_user)):
    """Get list of activity types with configurations"""
    types = []
    for activity_type, config in ACTIVITY_TYPE_CONFIG.items():
        types.append({
            "type": activity_type.value if hasattr(activity_type, 'value') else str(activity_type),
            **config
        })
    return {"activity_types": types}


# ==================== QUICK ACTIONS ====================

@router.post("/quick/note")
async def quick_add_note(
    entity_type: str,
    entity_id: str,
    content: str,
    user: User = Depends(get_current_user)
):
    """Quick add a note to a record"""
    item = TimelineItemCreate(
        entity_type=EntityType(entity_type),
        entity_id=entity_id,
        activity_type=ActivityType.NOTE,
        body=content
    )
    return await create_timeline_item(item, user)


@router.post("/quick/call")
async def quick_log_call(
    entity_type: str,
    entity_id: str,
    notes: str,
    duration_minutes: int = 0,
    outcome: str = None,
    user: User = Depends(get_current_user)
):
    """Quick log a call"""
    item = TimelineItemCreate(
        entity_type=EntityType(entity_type),
        entity_id=entity_id,
        activity_type=ActivityType.CALL_LOG,
        body=notes,
        call_duration_minutes=duration_minutes,
        call_outcome=outcome,
        metadata={"duration_minutes": duration_minutes, "outcome": outcome}
    )
    return await create_timeline_item(item, user)


@router.post("/quick/task")
async def quick_create_task(
    entity_type: str,
    entity_id: str,
    subject: str,
    due_date: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Quick create a task and log to timeline"""
    from datetime import datetime
    
    # Create the task
    task_id = generate_id("task")
    now = datetime.now(timezone.utc).isoformat()
    
    task_doc = {
        "task_id": task_id,
        "subject": subject,
        "description": None,
        "priority": "medium",
        "status": "not_started",
        "due_date": due_date,
        f"{entity_type}_id": entity_id,
        "assigned_to": user.user_id,
        "created_by": user.user_id,
        "created_by_name": user.name,
        "created_at": now,
        "updated_at": now
    }
    
    await db.crm_tasks.insert_one(task_doc)
    
    # Log to timeline
    await log_system_event(
        entity_type=entity_type,
        entity_id=entity_id,
        activity_type="task_created",
        body=f"Task created: {subject}",
        metadata={"task_id": task_id, "subject": subject, "due_date": due_date},
        user_id=user.user_id,
        user_name=user.name
    )
    
    task_doc.pop("_id", None)
    return {"success": True, "task": task_doc}
