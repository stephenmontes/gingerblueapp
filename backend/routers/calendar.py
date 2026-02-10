"""
Google Calendar Integration for Order Scheduling
Company-wide shared calendar - one connection for all users
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

# Collection name for company-wide settings
COMPANY_SETTINGS_COLLECTION = "company_settings"
COMPANY_CALENDAR_ID = "company_calendar"


def get_redirect_uri():
    """Get the OAuth redirect URI based on environment"""
    app_url = os.environ.get("APP_URL", "")
    if app_url:
        return f"{app_url}/api/calendar/oauth/callback"
    
    auth_url = os.environ.get("AUTH_SERVICE_URL", "")
    if auth_url:
        # For deployed environment, use the custom domain
        return "https://gingerblueapp.com/api/calendar/oauth/callback"
    return "http://localhost:8001/api/calendar/oauth/callback"


@router.get("/oauth/connect")
async def connect_calendar(user: User = Depends(get_current_user)):
    """Initiate Google Calendar OAuth flow (admin/manager only)"""
    if user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Only admins and managers can connect the company calendar")
    
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(status_code=500, detail="Google Calendar not configured")
    
    redirect_uri = get_redirect_uri()
    
    # Suggest the company account for login (configurable via env)
    login_hint = os.environ.get("COMPANY_GOOGLE_EMAIL", "info@gingerbluehome.com")
    
    # Build authorization URL
    auth_url = (
        "https://accounts.google.com/o/oauth2/v2/auth?"
        f"client_id={GOOGLE_CLIENT_ID}&"
        f"redirect_uri={redirect_uri}&"
        "response_type=code&"
        f"scope={'%20'.join(CALENDAR_SCOPES)}&"
        "access_type=offline&"
        "prompt=consent&"
        f"login_hint={login_hint}&"
        f"state={user.user_id}"
    )
    
    return {"authorization_url": auth_url}


@router.get("/oauth/callback")
async def calendar_oauth_callback(code: str, state: str):
    """Handle Google Calendar OAuth callback - stores company-wide credentials"""
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
    
    # Get the user's email for reference
    user_info = requests.get(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        headers={"Authorization": f"Bearer {tokens.get('access_token')}"}
    ).json()
    
    # Save tokens to company-wide settings (not per-user)
    await db[COMPANY_SETTINGS_COLLECTION].update_one(
        {"setting_id": COMPANY_CALENDAR_ID},
        {"$set": {
            "setting_id": COMPANY_CALENDAR_ID,
            "calendar_tokens": {
                "access_token": tokens.get("access_token"),
                "refresh_token": tokens.get("refresh_token"),
                "expires_at": (datetime.now(timezone.utc) + timedelta(seconds=tokens.get("expires_in", 3600))).isoformat()
            },
            "calendar_connected": True,
            "connected_by": state,
            "connected_email": user_info.get("email"),
            "connected_at": datetime.now(timezone.utc).isoformat()
        }},
        upsert=True
    )
    
    # Redirect back to the scheduling page
    frontend_url = os.environ.get("APP_URL", "")
    if not frontend_url:
        auth_url = os.environ.get("AUTH_SERVICE_URL", "")
        if auth_url:
            frontend_url = "https://gingerblueapp.com"
        else:
            frontend_url = "https://sales-chatter.preview.emergentagent.com"
    return RedirectResponse(f"{frontend_url}/scheduling?connected=true")


async def get_company_calendar_credentials() -> Optional[Credentials]:
    """Get valid Google Calendar credentials for the company calendar"""
    settings = await db[COMPANY_SETTINGS_COLLECTION].find_one({"setting_id": COMPANY_CALENDAR_ID})
    if not settings or not settings.get("calendar_tokens"):
        return None
    
    tokens = settings["calendar_tokens"]
    
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
            await db[COMPANY_SETTINGS_COLLECTION].update_one(
                {"setting_id": COMPANY_CALENDAR_ID},
                {"$set": {
                    "calendar_tokens.access_token": creds.token,
                    "calendar_tokens.expires_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
                }}
            )
        except Exception:
            # Token refresh failed, needs to re-authenticate
            await db[COMPANY_SETTINGS_COLLECTION].update_one(
                {"setting_id": COMPANY_CALENDAR_ID},
                {"$set": {"calendar_connected": False}}
            )
            return None
    
    return creds


@router.get("/status")
async def get_calendar_status(user: User = Depends(get_current_user)):
    """Check if company Google Calendar is connected"""
    settings = await db[COMPANY_SETTINGS_COLLECTION].find_one({"setting_id": COMPANY_CALENDAR_ID})
    
    if not settings:
        return {
            "connected": False,
            "has_tokens": False,
            "connected_by": None,
            "connected_email": None
        }
    
    return {
        "connected": settings.get("calendar_connected", False),
        "has_tokens": bool(settings.get("calendar_tokens")),
        "connected_by": settings.get("connected_by"),
        "connected_email": settings.get("connected_email"),
        "connected_at": settings.get("connected_at")
    }


@router.post("/disconnect")
async def disconnect_calendar(user: User = Depends(get_current_user)):
    """Disconnect company Google Calendar (admin/manager only)"""
    if user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Only admins and managers can disconnect the company calendar")
    
    await db[COMPANY_SETTINGS_COLLECTION].update_one(
        {"setting_id": COMPANY_CALENDAR_ID},
        {"$unset": {"calendar_tokens": ""}, "$set": {"calendar_connected": False}}
    )
    return {"message": "Company calendar disconnected"}


@router.get("/debug")
async def debug_calendar(user: User = Depends(get_current_user)):
    """Debug endpoint to check calendar connection and list available calendars"""
    if user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Admin only")
    
    creds = await get_company_calendar_credentials()
    if not creds:
        return {"error": "Calendar not connected", "connected": False}
    
    try:
        service = build("calendar", "v3", credentials=creds)
        
        # Get list of all calendars
        calendar_list = service.calendarList().list().execute()
        calendars = []
        for cal in calendar_list.get("items", []):
            calendars.append({
                "id": cal.get("id"),
                "summary": cal.get("summary"),
                "primary": cal.get("primary", False),
                "accessRole": cal.get("accessRole")
            })
        
        # Get primary calendar info
        primary = service.calendars().get(calendarId="primary").execute()
        
        return {
            "connected": True,
            "primary_calendar": {
                "id": primary.get("id"),
                "summary": primary.get("summary"),
                "timeZone": primary.get("timeZone")
            },
            "all_calendars": calendars,
            "total_calendars": len(calendars)
        }
    except Exception as e:
        return {"error": str(e), "connected": True, "credentials_valid": False}


@router.get("/events")
async def get_calendar_events(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get calendar events from company calendar"""
    import logging
    logger = logging.getLogger(__name__)
    
    creds = await get_company_calendar_credentials()
    if not creds:
        raise HTTPException(status_code=401, detail="Company calendar not connected")
    
    try:
        service = build("calendar", "v3", credentials=creds)
        
        # Default to current month if no dates specified
        now = datetime.now(timezone.utc)
        if not start_date:
            start_dt = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            start_date = start_dt.isoformat()
        else:
            # Ensure proper ISO format with timezone
            if not start_date.endswith('Z') and '+' not in start_date:
                start_date = start_date + 'Z' if 'T' in start_date else start_date + 'T00:00:00Z'
        
        if not end_date:
            # End of next month
            if now.month == 12:
                end_dt = now.replace(year=now.year + 1, month=2, day=1, hour=0, minute=0, second=0, microsecond=0)
            else:
                end_dt = now.replace(month=now.month + 2, day=1, hour=0, minute=0, second=0, microsecond=0)
            end_date = end_dt.isoformat()
        else:
            # Ensure proper ISO format with timezone
            if not end_date.endswith('Z') and '+' not in end_date:
                end_date = end_date + 'Z' if 'T' in end_date else end_date + 'T23:59:59Z'
        
        logger.info(f"Fetching calendar events from {start_date} to {end_date}")
        
        events_result = service.events().list(
            calendarId="primary",
            timeMin=start_date,
            timeMax=end_date,
            maxResults=500,
            singleEvents=True,
            orderBy="startTime"
        ).execute()
        
        events = events_result.get("items", [])
        logger.info(f"Found {len(events)} calendar events")
        
        return {"events": events, "count": len(events)}
    except Exception as e:
        logger.error(f"Failed to fetch calendar events: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch events: {str(e)}")


@router.post("/events")
async def create_calendar_event(
    title: str,
    date: str,
    description: Optional[str] = None,
    all_day: bool = True,
    user: User = Depends(get_current_user)
):
    """Create a calendar event on company calendar"""
    creds = await get_company_calendar_credentials()
    if not creds:
        raise HTTPException(status_code=401, detail="Company calendar not connected")
    
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
    """Delete a calendar event from company calendar"""
    creds = await get_company_calendar_credentials()
    if not creds:
        raise HTTPException(status_code=401, detail="Company calendar not connected")
    
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
    """Sync orders with requested ship dates to company Google Calendar (includes both Shopify and POS orders)"""
    creds = await get_company_calendar_credentials()
    if not creds:
        raise HTTPException(status_code=401, detail="Company calendar not connected")
    
    try:
        service = build("calendar", "v3", credentials=creds)
        
        # Get orders with ship dates from fulfillment_orders
        query = {"requested_ship_date": {"$exists": True, "$nin": [None, ""]}}
        if order_ids:
            query["order_id"] = {"$in": order_ids}
        
        fulfillment_orders = await db.fulfillment_orders.find(query, {"_id": 0}).to_list(500)
        
        # Get POS orders with ship dates
        pos_query = {
            **query,
            "is_draft": {"$ne": True}
        }
        pos_orders = await db.orders.find(pos_query, {"_id": 0}).to_list(500)
        
        created = 0
        updated = 0
        skipped = 0
        
        async def sync_order(order, collection_name):
            nonlocal created, updated, skipped
            
            ship_date = order.get("requested_ship_date")
            if not ship_date:
                skipped += 1
                return
            
            # Get order number (handle both Shopify and POS orders)
            order_number = order.get("pos_order_number") or order.get("order_number") or order.get("order_id", "")[:8]
            
            # Get customer name
            customer = order.get("customer_name")
            if not customer and order.get("customer"):
                customer = order["customer"].get("name", "Walk-in")
            customer = customer or "Unknown"
            
            items_count = len(order.get("items", []) or order.get("line_items", []))
            store_name = order.get("store_name", "")
            total_price = order.get("total_price") or order.get("total") or 0
            source = "POS" if collection_name == "orders" else "Shopify"
            
            event_title = f"🚚 Ship #{order_number} - {customer}"
            event_description = (
                f"Order: #{order_number}\n"
                f"Customer: {customer}\n"
                f"Store: {store_name}\n"
                f"Source: {source}\n"
                f"Items: {items_count}\n"
                f"Total: ${total_price:.2f}\n"
                f"---\n"
                f"Synced by: {user.name or user.email}"
            )
            
            existing_event_id = order.get("calendar_event_id")
            
            event_body = {
                "summary": event_title,
                "description": event_description,
                "start": {"date": ship_date},
                "end": {"date": ship_date},
                "colorId": "6" if collection_name == "fulfillment_orders" else "10",  # Orange for Shopify, Green for POS
                "extendedProperties": {
                    "private": {
                        "order_id": order.get("order_id"),
                        "source": source.lower()
                    }
                }
            }
            
            try:
                if existing_event_id:
                    service.events().update(
                        calendarId="primary",
                        eventId=existing_event_id,
                        body=event_body
                    ).execute()
                    updated += 1
                else:
                    event = service.events().insert(calendarId="primary", body=event_body).execute()
                    
                    # Save event ID to order
                    await db[collection_name].update_one(
                        {"order_id": order.get("order_id")},
                        {"$set": {"calendar_event_id": event.get("id")}}
                    )
                    created += 1
            except Exception as e:
                print(f"Failed to sync order {order_number}: {e}")
                skipped += 1
        
        # Sync fulfillment orders
        for order in fulfillment_orders:
            await sync_order(order, "fulfillment_orders")
        
        # Sync POS orders
        for order in pos_orders:
            await sync_order(order, "orders")
        
        return {
            "success": True,
            "created": created,
            "updated": updated,
            "skipped": skipped,
            "total": len(fulfillment_orders) + len(pos_orders)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to sync orders: {str(e)}")


@router.post("/remove-order-event/{order_id}")
async def remove_order_from_calendar(order_id: str, user: User = Depends(get_current_user)):
    """Remove a specific order's event from the calendar"""
    creds = await get_company_calendar_credentials()
    if not creds:
        raise HTTPException(status_code=401, detail="Company calendar not connected")
    
    # Get the order to find the event ID
    order = await db.fulfillment_orders.find_one({"order_id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    event_id = order.get("calendar_event_id")
    if not event_id:
        return {"message": "Order has no calendar event"}
    
    try:
        service = build("calendar", "v3", credentials=creds)
        service.events().delete(calendarId="primary", eventId=event_id).execute()
        
        # Clear the event ID from the order
        await db.fulfillment_orders.update_one(
            {"order_id": order_id},
            {"$unset": {"calendar_event_id": ""}}
        )
        
        return {"message": "Event removed from calendar"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to remove event: {str(e)}")


@router.get("/orders-with-dates")
async def get_orders_with_ship_dates(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get orders with requested ship dates for calendar display (includes both Shopify and POS orders)"""
    query = {"requested_ship_date": {"$exists": True, "$nin": [None, ""]}}
    
    if start_date and end_date:
        query["requested_ship_date"] = {"$gte": start_date, "$lte": end_date}
    
    projection = {
        "_id": 0,
        "order_id": 1,
        "order_number": 1,
        "pos_order_number": 1,
        "customer_name": 1,
        "store_name": 1,
        "requested_ship_date": 1,
        "items": 1,
        "total_price": 1,
        "status": 1,
        "calendar_event_id": 1,
        "is_draft": 1,
        "source": 1
    }
    
    # Get orders from fulfillment_orders (Shopify orders)
    fulfillment_orders = await db.fulfillment_orders.find(
        query,
        projection
    ).sort("requested_ship_date", 1).to_list(500)
    
    # Add source identifier
    for order in fulfillment_orders:
        order["source"] = "shopify"
        if not order.get("order_number"):
            order["order_number"] = order.get("order_id", "")[:8]
    
    # Get orders from orders collection (POS orders)
    pos_query = {
        **query,
        "is_draft": {"$ne": True}  # Exclude draft orders
    }
    pos_orders = await db.orders.find(
        pos_query,
        projection
    ).sort("requested_ship_date", 1).to_list(500)
    
    # Format POS orders
    for order in pos_orders:
        order["source"] = "pos"
        # Use pos_order_number as order_number for display
        if order.get("pos_order_number"):
            order["order_number"] = order["pos_order_number"]
        elif not order.get("order_number"):
            order["order_number"] = order.get("order_id", "")[:8]
        # Get customer name from customer data
        if not order.get("customer_name") and order.get("customer"):
            order["customer_name"] = order["customer"].get("name", "Walk-in")
    
    # Combine and sort all orders
    all_orders = fulfillment_orders + pos_orders
    all_orders.sort(key=lambda x: x.get("requested_ship_date", ""))
    
    return {"orders": all_orders}
