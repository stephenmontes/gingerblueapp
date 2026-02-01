from fastapi import APIRouter, HTTPException, Depends

from database import db
from models.user import User
from dependencies import get_current_user

router = APIRouter(prefix="/users", tags=["users"])

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
