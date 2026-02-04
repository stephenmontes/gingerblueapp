"""
Task Management Router
Handles tasks, checklists, assignments, and notifications
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from datetime import datetime, timezone
from typing import Optional, List
from pydantic import BaseModel, Field
import uuid

from database import db
from models.user import User
from dependencies import get_current_user

router = APIRouter(prefix="/tasks", tags=["tasks"])


# Pydantic Models
class ChecklistItem(BaseModel):
    text: str
    completed: bool = False


class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    due_date: Optional[str] = None
    priority: str = "medium"  # low, medium, high, urgent
    assigned_to: Optional[str] = None  # user_id
    customer_id: Optional[str] = None
    order_id: Optional[str] = None
    checklist: Optional[List[ChecklistItem]] = []
    shared_with: Optional[List[str]] = []  # user_ids


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    due_date: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    assigned_to: Optional[str] = None
    shared_with: Optional[List[str]] = None


class ChecklistItemCreate(BaseModel):
    text: str


class ChecklistItemUpdate(BaseModel):
    text: Optional[str] = None
    completed: Optional[bool] = None


class TaskComment(BaseModel):
    content: str


# Helper Functions
async def create_notification(
    user_id: str,
    title: str,
    message: str,
    task_id: str = None,
    notification_type: str = "task"
):
    """Create a notification for a user"""
    notification = {
        "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
        "user_id": user_id,
        "title": title,
        "message": message,
        "type": notification_type,
        "task_id": task_id,
        "read": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.notifications.insert_one(notification)
    return notification


async def log_task_activity(
    task_id: str,
    action: str,
    user_id: str,
    user_name: str,
    details: dict = None
):
    """Log task activity for history"""
    activity = {
        "activity_id": f"tact_{uuid.uuid4().hex[:12]}",
        "task_id": task_id,
        "action": action,
        "user_id": user_id,
        "user_name": user_name,
        "details": details or {},
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.task_activities.insert_one(activity)
    return activity


async def get_user_name(user_id: str) -> str:
    """Get user name by ID"""
    if not user_id:
        return None
    user = await db.users.find_one({"user_id": user_id}, {"name": 1})
    return user.get("name") if user else None


# API Endpoints
@router.get("")
async def get_tasks(
    status: Optional[str] = None,
    priority: Optional[str] = None,
    assigned_to: Optional[str] = None,
    customer_id: Optional[str] = None,
    order_id: Optional[str] = None,
    my_tasks: Optional[bool] = False,
    include_shared: Optional[bool] = True,
    search: Optional[str] = None,
    sort_by: str = Query("due_date", description="Field to sort by"),
    sort_order: str = Query("asc", description="asc or desc"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user: User = Depends(get_current_user)
):
    """Get tasks with filtering and pagination"""
    query = {}
    
    # Base query - tasks assigned to user, created by user, or shared with user
    if my_tasks:
        query["$or"] = [
            {"assigned_to": user.user_id},
            {"created_by": user.user_id},
            {"shared_with": user.user_id}
        ]
    elif include_shared:
        # Show all tasks user has access to
        query["$or"] = [
            {"assigned_to": user.user_id},
            {"created_by": user.user_id},
            {"shared_with": user.user_id},
            {"visibility": "team"}  # Team-visible tasks
        ]
    
    if status:
        if status == "open":
            query["status"] = {"$in": ["pending", "in_progress"]}
        elif status == "closed":
            query["status"] = {"$in": ["completed", "cancelled"]}
        else:
            query["status"] = status
    
    if priority:
        query["priority"] = priority
    
    if assigned_to:
        query["assigned_to"] = assigned_to
    
    if customer_id:
        query["customer_id"] = customer_id
    
    if order_id:
        query["order_id"] = order_id
    
    if search:
        search_regex = {"$regex": search, "$options": "i"}
        if "$or" in query:
            # Combine with existing $or using $and
            query = {"$and": [
                {"$or": query["$or"]},
                {"$or": [
                    {"title": search_regex},
                    {"description": search_regex}
                ]}
            ]}
        else:
            query["$or"] = [
                {"title": search_regex},
                {"description": search_regex}
            ]
    
    # Count total
    total_count = await db.tasks.count_documents(query)
    
    # Sort
    sort_direction = 1 if sort_order == "asc" else -1
    sort_field_map = {
        "due_date": "due_date",
        "created_at": "created_at",
        "priority": "priority_order",
        "status": "status",
        "title": "title"
    }
    sort_field = sort_field_map.get(sort_by, "due_date")
    
    # Pagination
    skip = (page - 1) * page_size
    
    tasks = await db.tasks.find(query, {"_id": 0}).sort([
        (sort_field, sort_direction),
        ("created_at", -1)
    ]).skip(skip).limit(page_size).to_list(page_size)
    
    return {
        "tasks": tasks,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total_count": total_count,
            "total_pages": (total_count + page_size - 1) // page_size
        }
    }


@router.get("/stats")
async def get_task_stats(user: User = Depends(get_current_user)):
    """Get task statistics for dashboard"""
    # Get counts by status for user's tasks
    base_query = {"$or": [
        {"assigned_to": user.user_id},
        {"created_by": user.user_id},
        {"shared_with": user.user_id}
    ]}
    
    pipeline = [
        {"$match": base_query},
        {"$group": {
            "_id": "$status",
            "count": {"$sum": 1}
        }}
    ]
    status_counts = await db.tasks.aggregate(pipeline).to_list(10)
    
    # Overdue tasks
    now = datetime.now(timezone.utc).isoformat()
    overdue_count = await db.tasks.count_documents({
        **base_query,
        "status": {"$in": ["pending", "in_progress"]},
        "due_date": {"$lt": now, "$ne": None}
    })
    
    # Due today
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0).isoformat()
    today_end = datetime.now(timezone.utc).replace(hour=23, minute=59, second=59).isoformat()
    due_today = await db.tasks.count_documents({
        **base_query,
        "status": {"$in": ["pending", "in_progress"]},
        "due_date": {"$gte": today_start, "$lte": today_end}
    })
    
    status_map = {s["_id"]: s["count"] for s in status_counts}
    
    return {
        "total": sum(s["count"] for s in status_counts),
        "pending": status_map.get("pending", 0),
        "in_progress": status_map.get("in_progress", 0),
        "completed": status_map.get("completed", 0),
        "cancelled": status_map.get("cancelled", 0),
        "overdue": overdue_count,
        "due_today": due_today
    }


@router.get("/{task_id}")
async def get_task(task_id: str, user: User = Depends(get_current_user)):
    """Get a single task with full details"""
    task = await db.tasks.find_one({"task_id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Get activity history
    activities = await db.task_activities.find(
        {"task_id": task_id},
        {"_id": 0}
    ).sort("created_at", -1).limit(50).to_list(50)
    
    # Get comments
    comments = await db.task_comments.find(
        {"task_id": task_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    # Get related customer/order info
    customer = None
    order = None
    if task.get("customer_id"):
        customer = await db.customers.find_one(
            {"customer_id": task["customer_id"]},
            {"_id": 0, "customer_id": 1, "full_name": 1, "email": 1}
        )
    if task.get("order_id"):
        order = await db.fulfillment_orders.find_one(
            {"order_id": task["order_id"]},
            {"_id": 0, "order_id": 1, "order_number": 1, "customer_name": 1}
        )
    
    return {
        **task,
        "activities": activities,
        "comments": comments,
        "customer": customer,
        "order": order
    }


@router.post("")
async def create_task(task_data: TaskCreate, user: User = Depends(get_current_user)):
    """Create a new task"""
    now = datetime.now(timezone.utc).isoformat()
    task_id = f"task_{uuid.uuid4().hex[:12]}"
    
    # Get assigned user name
    assigned_name = await get_user_name(task_data.assigned_to) if task_data.assigned_to else None
    
    # Priority order for sorting (lower = higher priority)
    priority_order = {"urgent": 0, "high": 1, "medium": 2, "low": 3}.get(task_data.priority, 2)
    
    # Prepare checklist with IDs
    checklist = []
    for item in (task_data.checklist or []):
        checklist.append({
            "item_id": f"chk_{uuid.uuid4().hex[:8]}",
            "text": item.text,
            "completed": item.completed,
            "created_at": now
        })
    
    # Get customer/order names for display
    customer_name = None
    order_number = None
    if task_data.customer_id:
        cust = await db.customers.find_one({"customer_id": task_data.customer_id}, {"full_name": 1})
        customer_name = cust.get("full_name") if cust else None
    if task_data.order_id:
        ord = await db.fulfillment_orders.find_one({"order_id": task_data.order_id}, {"order_number": 1})
        order_number = ord.get("order_number") if ord else None
    
    task = {
        "task_id": task_id,
        "title": task_data.title,
        "description": task_data.description,
        "due_date": task_data.due_date,
        "priority": task_data.priority,
        "priority_order": priority_order,
        "status": "pending",
        "assigned_to": task_data.assigned_to,
        "assigned_name": assigned_name,
        "customer_id": task_data.customer_id,
        "customer_name": customer_name,
        "order_id": task_data.order_id,
        "order_number": order_number,
        "checklist": checklist,
        "checklist_progress": 0,
        "shared_with": task_data.shared_with or [],
        "visibility": "private",
        "created_by": user.user_id,
        "created_by_name": user.name,
        "created_at": now,
        "updated_at": now
    }
    
    await db.tasks.insert_one(task)
    
    # Log activity
    await log_task_activity(task_id, "created", user.user_id, user.name, {
        "title": task_data.title
    })
    
    # Add note to associated order if task was created from an order
    if task_data.order_id:
        order_activity = {
            "activity_id": f"oact_{uuid.uuid4().hex[:12]}",
            "order_id": task_data.order_id,
            "type": "note",
            "note_type": "task",
            "content": f"Task created: {task_data.title}" + (f"\n{task_data.description}" if task_data.description else ""),
            "task_id": task_id,
            "user_id": user.user_id,
            "user_name": user.name,
            "created_at": now
        }
        await db.order_activities.insert_one(order_activity)
    
    # Add note to associated customer if task was created from a customer
    if task_data.customer_id:
        customer_activity = {
            "activity_id": f"act_{uuid.uuid4().hex[:12]}",
            "customer_id": task_data.customer_id,
            "type": "note",
            "note_type": "task",
            "content": f"Task created: {task_data.title}" + (f"\n{task_data.description}" if task_data.description else ""),
            "task_id": task_id,
            "user_id": user.user_id,
            "user_name": user.name,
            "created_at": now
        }
        await db.customer_activities.insert_one(customer_activity)
    
    # Send notification to assigned user
    if task_data.assigned_to and task_data.assigned_to != user.user_id:
        await create_notification(
            user_id=task_data.assigned_to,
            title="New Task Assigned",
            message=f"{user.name} assigned you a task: {task_data.title}",
            task_id=task_id,
            notification_type="task_assigned"
        )
    
    # Send notifications to shared users
    for shared_user_id in (task_data.shared_with or []):
        if shared_user_id != user.user_id and shared_user_id != task_data.assigned_to:
            await create_notification(
                user_id=shared_user_id,
                title="Task Shared With You",
                message=f"{user.name} shared a task with you: {task_data.title}",
                task_id=task_id,
                notification_type="task_shared"
            )
    
    return {"success": True, "task_id": task_id, "task": {k: v for k, v in task.items() if k != "_id"}}


@router.put("/{task_id}")
async def update_task(
    task_id: str,
    updates: TaskUpdate,
    user: User = Depends(get_current_user)
):
    """Update a task"""
    task = await db.tasks.find_one({"task_id": task_id})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    now = datetime.now(timezone.utc).isoformat()
    update_doc = {"updated_at": now}
    changes = []
    
    if updates.title is not None:
        update_doc["title"] = updates.title
        changes.append(f"title changed to '{updates.title}'")
    
    if updates.description is not None:
        update_doc["description"] = updates.description
        changes.append("description updated")
    
    if updates.due_date is not None:
        update_doc["due_date"] = updates.due_date
        changes.append(f"due date set to {updates.due_date[:10] if updates.due_date else 'none'}")
    
    if updates.priority is not None:
        update_doc["priority"] = updates.priority
        update_doc["priority_order"] = {"urgent": 0, "high": 1, "medium": 2, "low": 3}.get(updates.priority, 2)
        changes.append(f"priority changed to {updates.priority}")
    
    if updates.status is not None:
        old_status = task.get("status")
        update_doc["status"] = updates.status
        changes.append(f"status changed from {old_status} to {updates.status}")
        
        if updates.status == "completed":
            update_doc["completed_at"] = now
            update_doc["completed_by"] = user.user_id
    
    if updates.assigned_to is not None:
        old_assignee = task.get("assigned_to")
        new_assignee = updates.assigned_to
        
        update_doc["assigned_to"] = new_assignee
        update_doc["assigned_name"] = await get_user_name(new_assignee) if new_assignee else None
        changes.append(f"assigned to {update_doc['assigned_name'] or 'unassigned'}")
        
        # Notify new assignee
        if new_assignee and new_assignee != user.user_id and new_assignee != old_assignee:
            await create_notification(
                user_id=new_assignee,
                title="Task Assigned to You",
                message=f"{user.name} assigned you a task: {task.get('title')}",
                task_id=task_id,
                notification_type="task_assigned"
            )
    
    if updates.shared_with is not None:
        old_shared = set(task.get("shared_with", []))
        new_shared = set(updates.shared_with)
        update_doc["shared_with"] = updates.shared_with
        
        # Notify newly shared users
        newly_shared = new_shared - old_shared
        for shared_user_id in newly_shared:
            if shared_user_id != user.user_id:
                await create_notification(
                    user_id=shared_user_id,
                    title="Task Shared With You",
                    message=f"{user.name} shared a task with you: {task.get('title')}",
                    task_id=task_id,
                    notification_type="task_shared"
                )
    
    await db.tasks.update_one({"task_id": task_id}, {"$set": update_doc})
    
    # Log activity
    if changes:
        await log_task_activity(task_id, "updated", user.user_id, user.name, {
            "changes": changes
        })
    
    return {"success": True, "message": "Task updated"}


@router.delete("/{task_id}")
async def delete_task(task_id: str, user: User = Depends(get_current_user)):
    """Delete a task"""
    task = await db.tasks.find_one({"task_id": task_id})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Only creator or admin can delete
    if task.get("created_by") != user.user_id and user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to delete this task")
    
    await db.tasks.delete_one({"task_id": task_id})
    await db.task_activities.delete_many({"task_id": task_id})
    await db.task_comments.delete_many({"task_id": task_id})
    
    return {"success": True, "message": "Task deleted"}


# Checklist endpoints
@router.post("/{task_id}/checklist")
async def add_checklist_item(
    task_id: str,
    item: ChecklistItemCreate,
    user: User = Depends(get_current_user)
):
    """Add a checklist item to a task"""
    task = await db.tasks.find_one({"task_id": task_id})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    now = datetime.now(timezone.utc).isoformat()
    new_item = {
        "item_id": f"chk_{uuid.uuid4().hex[:8]}",
        "text": item.text,
        "completed": False,
        "created_at": now
    }
    
    await db.tasks.update_one(
        {"task_id": task_id},
        {
            "$push": {"checklist": new_item},
            "$set": {"updated_at": now}
        }
    )
    
    # Update progress
    await update_checklist_progress(task_id)
    
    await log_task_activity(task_id, "checklist_added", user.user_id, user.name, {
        "item": item.text
    })
    
    return {"success": True, "item": new_item}


@router.put("/{task_id}/checklist/{item_id}")
async def update_checklist_item(
    task_id: str,
    item_id: str,
    updates: ChecklistItemUpdate,
    user: User = Depends(get_current_user)
):
    """Update a checklist item"""
    update_fields = {}
    if updates.text is not None:
        update_fields["checklist.$.text"] = updates.text
    if updates.completed is not None:
        update_fields["checklist.$.completed"] = updates.completed
        update_fields["checklist.$.completed_at"] = datetime.now(timezone.utc).isoformat() if updates.completed else None
        update_fields["checklist.$.completed_by"] = user.user_id if updates.completed else None
    
    update_fields["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    result = await db.tasks.update_one(
        {"task_id": task_id, "checklist.item_id": item_id},
        {"$set": update_fields}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Checklist item not found")
    
    # Update progress
    await update_checklist_progress(task_id)
    
    if updates.completed is not None:
        action = "checklist_completed" if updates.completed else "checklist_uncompleted"
        await log_task_activity(task_id, action, user.user_id, user.name, {
            "item_id": item_id
        })
    
    return {"success": True, "message": "Checklist item updated"}


@router.delete("/{task_id}/checklist/{item_id}")
async def delete_checklist_item(
    task_id: str,
    item_id: str,
    user: User = Depends(get_current_user)
):
    """Delete a checklist item"""
    result = await db.tasks.update_one(
        {"task_id": task_id},
        {
            "$pull": {"checklist": {"item_id": item_id}},
            "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}
        }
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Update progress
    await update_checklist_progress(task_id)
    
    return {"success": True, "message": "Checklist item deleted"}


async def update_checklist_progress(task_id: str):
    """Update checklist progress percentage"""
    task = await db.tasks.find_one({"task_id": task_id}, {"checklist": 1})
    if task and task.get("checklist"):
        total = len(task["checklist"])
        completed = sum(1 for item in task["checklist"] if item.get("completed"))
        progress = int((completed / total) * 100) if total > 0 else 0
        await db.tasks.update_one(
            {"task_id": task_id},
            {"$set": {"checklist_progress": progress}}
        )


# Comments
@router.post("/{task_id}/comments")
async def add_comment(
    task_id: str,
    comment: TaskComment,
    user: User = Depends(get_current_user)
):
    """Add a comment to a task"""
    task = await db.tasks.find_one({"task_id": task_id})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    now = datetime.now(timezone.utc).isoformat()
    comment_doc = {
        "comment_id": f"cmt_{uuid.uuid4().hex[:12]}",
        "task_id": task_id,
        "content": comment.content,
        "user_id": user.user_id,
        "user_name": user.name,
        "created_at": now
    }
    
    await db.task_comments.insert_one(comment_doc)
    
    # Notify task owner and assignee
    notify_users = set()
    if task.get("created_by") and task["created_by"] != user.user_id:
        notify_users.add(task["created_by"])
    if task.get("assigned_to") and task["assigned_to"] != user.user_id:
        notify_users.add(task["assigned_to"])
    
    for notify_user_id in notify_users:
        await create_notification(
            user_id=notify_user_id,
            title="New Comment on Task",
            message=f"{user.name} commented on: {task.get('title')}",
            task_id=task_id,
            notification_type="task_comment"
        )
    
    await log_task_activity(task_id, "comment_added", user.user_id, user.name)
    
    return {"success": True, "comment": {k: v for k, v in comment_doc.items() if k != "_id"}}


# Share task
@router.post("/{task_id}/share")
async def share_task(
    task_id: str,
    user_ids: List[str],
    user: User = Depends(get_current_user)
):
    """Share a task with users"""
    task = await db.tasks.find_one({"task_id": task_id})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    current_shared = set(task.get("shared_with", []))
    new_shared = set(user_ids)
    newly_added = new_shared - current_shared
    
    await db.tasks.update_one(
        {"task_id": task_id},
        {
            "$addToSet": {"shared_with": {"$each": user_ids}},
            "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}
        }
    )
    
    # Notify newly shared users
    for shared_user_id in newly_added:
        if shared_user_id != user.user_id:
            await create_notification(
                user_id=shared_user_id,
                title="Task Shared With You",
                message=f"{user.name} shared a task with you: {task.get('title')}",
                task_id=task_id,
                notification_type="task_shared"
            )
    
    return {"success": True, "message": f"Task shared with {len(newly_added)} users"}
