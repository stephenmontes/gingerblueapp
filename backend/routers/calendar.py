"""
Google Calendar Integration for Order Scheduling
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import RedirectResponse
from typing import Optional, List
from datetime import datetime, timezone, timedelta
import os
import requests

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request as GoogleRequest
from googleapiclient.discovery import build

from database import db
from models.user import User
from dependencies import get_current_user

router = APIRouter(prefix="/calendar", tags=["calendar"])

# Google OAuth Config
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")
CALENDAR_SCOPES = ["https://www.googleapis.com/auth/calendar"]


def get_redirect_uri():
    """Get the OAuth redirect URI based on environment"""
    # Use AUTH_SERVICE_URL if available, otherwise construct from request
    auth_url = os.environ.get("AUTH_SERVICE_URL", "")
    if auth_url:
        return f"{auth_url}/api/calendar/oauth/callback"
    return "http://localhost:8001/api/calendar/oauth/callback"


@router.get("/oauth/connect")
async def connect_calendar(user: User = Depends(get_current_user)):
    """Initiate Google Calendar OAuth flow"""
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(status_code=500, detail="Google Calendar not configured")
    
    redirect_uri = get_redirect_uri()
    
    # Build authorization URL
    auth_url = (
        "https://accounts.google.com/o/oauth2/v2/auth?"
        f"client_id={GOOGLE_CLIENT_ID}&"
        f"redirect_uri={redirect_uri}&"
        "response_type=code&"
        f"scope={'%20'.join(CALENDAR_SCOPES)}&"
        "access_type=offline&"
        "prompt=consent&"
        f"state={user.user_id}"
    )
    
    return {"authorization_url": auth_url}


@router.get("/oauth/callback")
async def calendar_oauth_callback(code: str, state: str):
    """Handle Google Calendar OAuth callback"""
    redirect_uri = get_redirect_uri()
    
    # Exchange code for tokens
    token_response = requests.post(
        "https://oauth2.googleapis.com/token",
        data={
            "code": code,
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code"
        }
    )
    
    if token_response.status_code != 200:
        raise HTTPException(status_code=400, detail="Failed to exchange authorization code")
    
    tokens = token_response.json()
    
    # Save tokens to user record
    await db.users.update_one(
        {"user_id": state},
        {"$set": {
            "calendar_tokens": {
                "access_token": tokens.get("access_token"),
                "refresh_token": tokens.get("refresh_token"),
                "expires_at": (datetime.now(timezone.utc) + timedelta(seconds=tokens.get("expires_in", 3600))).isoformat()
            },
            "calendar_connected": True
        }}
    )
    
    # Redirect back to the scheduling page
    frontend_url = os.environ.get("FRONTEND_URL", "")
    if not frontend_url:
        # Try to construct from AUTH_SERVICE_URL
        auth_url = os.environ.get("AUTH_SERVICE_URL", "")
        if auth_url:
            frontend_url = auth_url.replace("/api", "").replace(":8001", ":3000")
        else:
            frontend_url = "http://localhost:3000"
    
    return RedirectResponse(f"{frontend_url}/scheduling?connected=true")


async def get_calendar_credentials(user_id: str) -> Optional[Credentials]:
    """Get valid Google Calendar credentials for a user"""
    user = await db.users.find_one({"user_id": user_id})
    if not user or not user.get("calendar_tokens"):
        return None
    
    tokens = user["calendar_tokens"]
    
    creds = Credentials(
        token=tokens.get("access_token"),
        refresh_token=tokens.get("refresh_token"),
        token_uri="https://oauth2.googleapis.com/token",
        client_id=GOOGLE_CLIENT_ID,
        client_secret=GOOGLE_CLIENT_SECRET
    )
    
    # Refresh if expired
    if creds.expired and creds.refresh_token:
        try:
            creds.refresh(GoogleRequest())
            # Update stored tokens
            await db.users.update_one(
                {"user_id": user_id},
                {"$set": {
                    "calendar_tokens.access_token": creds.token,
                    "calendar_tokens.expires_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
                }}
            )
        except Exception as e:
            # Token refresh failed, user needs to re-authenticate
            await db.users.update_one(
                {"user_id": user_id},
                {"$set": {"calendar_connected": False}}
            )
            return None
    
    return creds


@router.get("/status")
async def get_calendar_status(user: User = Depends(get_current_user)):
    """Check if user has connected Google Calendar"""
    user_data = await db.users.find_one({"user_id": user.user_id})
    return {
        "connected": user_data.get("calendar_connected", False) if user_data else False,
        "has_tokens": bool(user_data.get("calendar_tokens")) if user_data else False
    }


@router.post("/disconnect")
async def disconnect_calendar(user: User = Depends(get_current_user)):
    """Disconnect Google Calendar"""
    await db.users.update_one(
        {"user_id": user.user_id},
        {"$unset": {"calendar_tokens": ""}, "$set": {"calendar_connected": False}}
    )
    return {"message": "Calendar disconnected"}


@router.get("/events")
async def get_calendar_events(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get calendar events"""
    creds = await get_calendar_credentials(user.user_id)
    if not creds:
        raise HTTPException(status_code=401, detail="Calendar not connected")
    
    try:
        service = build("calendar", "v3", credentials=creds)
        
        # Default to current month if no dates specified
        if not start_date:
            start_date = datetime.now(timezone.utc).replace(day=1).isoformat()
        if not end_date:
            # End of next month
            now = datetime.now(timezone.utc)
            if now.month == 12:
                end_date = now.replace(year=now.year + 1, month=2, day=1).isoformat()
            else:
                end_date = now.replace(month=now.month + 2, day=1).isoformat()
        
        events_result = service.events().list(
            calendarId="primary",
            timeMin=start_date,
            timeMax=end_date,
            maxResults=250,
            singleEvents=True,
            orderBy="startTime"
        ).execute()
        
        events = events_result.get("items", [])
        
        return {"events": events}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch events: {str(e)}")


@router.post("/events")
async def create_calendar_event(
    title: str,
    date: str,
    description: Optional[str] = None,
    all_day: bool = True,
    user: User = Depends(get_current_user)
):
    """Create a calendar event"""
    creds = await get_calendar_credentials(user.user_id)
    if not creds:
        raise HTTPException(status_code=401, detail="Calendar not connected")
    
    try:
        service = build("calendar", "v3", credentials=creds)
        
        if all_day:
            event_body = {
                "summary": title,
                "description": description or "",
                "start": {"date": date},
                "end": {"date": date}
            }
        else:
            event_body = {
                "summary": title,
                "description": description or "",
                "start": {"dateTime": f"{date}T09:00:00", "timeZone": "UTC"},
                "end": {"dateTime": f"{date}T17:00:00", "timeZone": "UTC"}
            }
        
        event = service.events().insert(calendarId="primary", body=event_body).execute()
        
        return {"event": event}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create event: {str(e)}")


@router.delete("/events/{event_id}")
async def delete_calendar_event(event_id: str, user: User = Depends(get_current_user)):
    """Delete a calendar event"""
    creds = await get_calendar_credentials(user.user_id)
    if not creds:
        raise HTTPException(status_code=401, detail="Calendar not connected")
    
    try:
        service = build("calendar", "v3", credentials=creds)
        service.events().delete(calendarId="primary", eventId=event_id).execute()
        return {"message": "Event deleted"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete event: {str(e)}")


@router.post("/sync-orders")
async def sync_orders_to_calendar(
    order_ids: Optional[List[str]] = None,
    user: User = Depends(get_current_user)
):
    """Sync orders with requested ship dates to Google Calendar"""
    creds = await get_calendar_credentials(user.user_id)
    if not creds:
        raise HTTPException(status_code=401, detail="Calendar not connected")
    
    try:
        service = build("calendar", "v3", credentials=creds)
        
        # Get orders with ship dates
        query = {"requested_ship_date": {"$exists": True, "$ne": None}}
        if order_ids:
            query["order_id"] = {"$in": order_ids}
        
        orders = await db.fulfillment_orders.find(query, {"_id": 0}).to_list(500)
        
        created = 0
        updated = 0
        skipped = 0
        
        for order in orders:
            ship_date = order.get("requested_ship_date")
            if not ship_date:
                skipped += 1
                continue
            
            order_number = order.get("order_number", order.get("order_id", "")[:8])
            customer = order.get("customer_name", "Unknown")
            items_count = len(order.get("items", []))
            store_name = order.get("store_name", "")
            
            event_title = f"Ship Order #{order_number} - {customer}"
            event_description = (
                f"Order: #{order_number}\n"
                f"Customer: {customer}\n"
                f"Store: {store_name}\n"
                f"Items: {items_count}\n"
                f"Total: ${order.get('total_price', 0):.2f}"
            )
            
            # Check if event already exists for this order
            existing_event_id = order.get("calendar_event_id")
            
            event_body = {
                "summary": event_title,
                "description": event_description,
                "start": {"date": ship_date},
                "end": {"date": ship_date},
                "extendedProperties": {
                    "private": {
                        "order_id": order.get("order_id"),
                        "source": "shopfactory"
                    }
                }
            }
            
            try:
                if existing_event_id:
                    # Update existing event
                    service.events().update(
                        calendarId="primary",
                        eventId=existing_event_id,
                        body=event_body
                    ).execute()
                    updated += 1
                else:
                    # Create new event
                    event = service.events().insert(calendarId="primary", body=event_body).execute()
                    
                    # Save event ID to order
                    await db.fulfillment_orders.update_one(
                        {"order_id": order.get("order_id")},
                        {"$set": {"calendar_event_id": event.get("id")}}
                    )
                    created += 1
            except Exception as e:
                print(f"Failed to sync order {order_number}: {e}")
                skipped += 1
        
        return {
            "success": True,
            "created": created,
            "updated": updated,
            "skipped": skipped,
            "total": len(orders)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to sync orders: {str(e)}")


@router.get("/orders-with-dates")
async def get_orders_with_ship_dates(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get orders with requested ship dates for calendar display"""
    query = {"requested_ship_date": {"$exists": True, "$ne": None}}
    
    if start_date and end_date:
        query["requested_ship_date"] = {"$gte": start_date, "$lte": end_date}
    
    orders = await db.fulfillment_orders.find(
        query,
        {
            "_id": 0,
            "order_id": 1,
            "order_number": 1,
            "customer_name": 1,
            "store_name": 1,
            "requested_ship_date": 1,
            "items": 1,
            "total_price": 1,
            "status": 1,
            "calendar_event_id": 1
        }
    ).to_list(500)
    
    return {"orders": orders}
