from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional

from database import db
from models.user import User
from dependencies import get_current_user

router = APIRouter(prefix="/users", tags=["users"])


class HourlyRateUpdate(BaseModel):
    hourly_rate: float


@router.get("")
async def get_users(user: User = Depends(get_current_user)):
    """Get all users (managers and admins only)"""
    if user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    users = await db.users.find({}, {"_id": 0}).to_list(1000)
    return users


@router.put("/{user_id}/role")
async def update_user_role(user_id: str, role: str, user: User = Depends(get_current_user)):
    """Update user role (admin only)"""
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    
    if role not in ["admin", "manager", "worker"]:
        raise HTTPException(status_code=400, detail="Invalid role")
    
    result = await db.users.update_one(
        {"user_id": user_id},
        {"$set": {"role": role}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {"message": "Role updated"}


@router.put("/{user_id}/hourly-rate")
async def update_user_hourly_rate(
    user_id: str, 
    rate_update: HourlyRateUpdate, 
    user: User = Depends(get_current_user)
):
    """Update user's hourly rate (admin only)
    
    This rate is used to calculate labor costs in production and fulfillment reports.
    """
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can update hourly rates")
    
    if rate_update.hourly_rate < 0:
        raise HTTPException(status_code=400, detail="Hourly rate cannot be negative")
    
    # Check if user exists
    target_user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    result = await db.users.update_one(
        {"user_id": user_id},
        {"$set": {"hourly_rate": rate_update.hourly_rate}}
    )
    
    return {
        "message": "Hourly rate updated",
        "user_id": user_id,
        "hourly_rate": rate_update.hourly_rate
    }


@router.get("/{user_id}")
async def get_user(user_id: str, user: User = Depends(get_current_user)):
    """Get a specific user's details"""
    if user.role not in ["admin", "manager"] and user.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    target_user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return target_user
