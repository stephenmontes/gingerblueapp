from fastapi import APIRouter, HTTPException, Request, Response, Depends
from datetime import datetime, timezone, timedelta
import uuid
import httpx
import logging
import os

from database import db
from models.user import User
from dependencies import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])
logger = logging.getLogger(__name__)

# Auth service URL from environment
AUTH_SERVICE_URL = os.environ.get("AUTH_SERVICE_URL", "https://demobackend.emergentagent.com")

@router.post("/session")
async def create_session(request: Request, response: Response):
    """Exchange session_id for session_token"""
    body = await request.json()
    session_id = body.get("session_id")
    
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id required")
    
    # Call Emergent auth to get user data
    async with httpx.AsyncClient() as client:
        try:
            auth_response = await client.get(
                f"{AUTH_SERVICE_URL}/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": session_id},
                timeout=10.0
            )
            auth_response.raise_for_status()
            user_data = auth_response.json()
        except Exception as e:
            logger.error(f"Auth error: {e}")
            raise HTTPException(status_code=401, detail="Invalid session_id")
    
    # Generate user_id
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    email = user_data.get("email", "")
    
    # Check if user exists
    existing_user = await db.users.find_one({"email": email}, {"_id": 0})
    if existing_user:
        user_id = existing_user["user_id"]
        # Update user data
        await db.users.update_one(
            {"email": email},
            {"$set": {
                "name": user_data.get("name", ""),
                "picture": user_data.get("picture", "")
            }}
        )
    else:
        # Create new user (first user is admin)
        user_count = await db.users.count_documents({})
        role = "admin" if user_count == 0 else "worker"
        
        new_user = {
            "user_id": user_id,
            "email": email,
            "name": user_data.get("name", ""),
            "picture": user_data.get("picture", ""),
            "role": role,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.users.insert_one(new_user)
    
    # Create session
    session_token = user_data.get("session_token", f"sess_{uuid.uuid4().hex}")
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    
    session_doc = {
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Remove old sessions for this user
    await db.user_sessions.delete_many({"user_id": user_id})
    await db.user_sessions.insert_one(session_doc)
    
    # Set cookie
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="lax",
        path="/",
        max_age=7 * 24 * 60 * 60
    )
    
    # Get updated user
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    
    return user_doc

@router.get("/me")
async def get_me(user: User = Depends(get_current_user)):
    """Get current authenticated user"""
    return user.model_dump()

@router.post("/logout")
async def logout(request: Request, response: Response):
    """Logout user"""
    session_token = request.cookies.get("session_token")
    if session_token:
        await db.user_sessions.delete_many({"session_token": session_token})
    
    response.delete_cookie(key="session_token", path="/", samesite="lax", secure=True)
    return {"message": "Logged out"}
