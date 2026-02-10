"""
Google Drive Integration for Order Exports
Company-wide shared Drive - one connection for all users
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import RedirectResponse
from typing import Optional, List
from datetime import datetime, timezone
import os
import io
import csv
import requests
import logging

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request as GoogleRequest
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload

from database import db
from models.user import User
from dependencies import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/drive", tags=["drive"])

# Google OAuth Config
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")
DRIVE_SCOPES = [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/userinfo.email"
]

# Collection name for company-wide settings
COMPANY_SETTINGS_COLLECTION = "company_settings"
COMPANY_DRIVE_ID = "company_drive"


def get_redirect_uri():
    """Get the OAuth redirect URI based on environment"""
    # Use APP_URL if set, otherwise construct from AUTH_SERVICE_URL
    app_url = os.environ.get("APP_URL", "")
    if app_url:
        return f"{app_url}/api/drive/oauth/callback"
    
    # Fallback: check if we have AUTH_SERVICE_URL (deployed environment)
    auth_url = os.environ.get("AUTH_SERVICE_URL", "")
    if auth_url:
        # Production deployment
        return "https://gingerblueapp.com/api/drive/oauth/callback"
    
    # Preview/development
    return "https://auto-logout-timer.preview.emergentagent.com/api/drive/oauth/callback"


@router.get("/oauth/connect")
async def connect_drive(user: User = Depends(get_current_user)):
    """Initiate Google Drive OAuth flow (admin/manager only)"""
    if user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Only admins and managers can connect the company drive")
    
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(status_code=500, detail="Google Drive not configured")
    
    redirect_uri = get_redirect_uri()
    
    # Suggest the company account for login (configurable via env)
    login_hint = os.environ.get("COMPANY_GOOGLE_EMAIL", "info@gingerbluehome.com")
    
    # Build authorization URL
    auth_url = (
        "https://accounts.google.com/o/oauth2/v2/auth?"
        f"client_id={GOOGLE_CLIENT_ID}&"
        f"redirect_uri={redirect_uri}&"
        "response_type=code&"
        f"scope={'%20'.join(DRIVE_SCOPES)}&"
        "access_type=offline&"
        "prompt=consent&"
        f"login_hint={login_hint}&"
        f"state={user.user_id}"
    )
    
    return {"authorization_url": auth_url}


@router.get("/oauth/callback")
async def drive_oauth_callback(
    code: str = None, 
    state: str = None,
    error: str = None,
    error_description: str = None
):
    """Handle Google Drive OAuth callback - stores company-wide credentials"""
    # Handle OAuth errors
    if error:
        logger.error(f"OAuth error: {error} - {error_description}")
        frontend_url = os.environ.get("REACT_APP_BACKEND_URL", "https://auto-logout-timer.preview.emergentagent.com")
        return RedirectResponse(url=f"{frontend_url}/settings?drive_error={error}")
    
    if not code or not state:
        raise HTTPException(status_code=400, detail="Missing code or state parameter")
    
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
        logger.error(f"Token exchange failed: {token_response.text}")
        raise HTTPException(status_code=400, detail="Failed to get access token")
    
    tokens = token_response.json()
    
    # Get user info to store connected email
    connected_email = None
    try:
        userinfo_response = requests.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {tokens.get('access_token')}"}
        )
        if userinfo_response.status_code == 200:
            userinfo = userinfo_response.json()
            connected_email = userinfo.get("email")
            logger.info(f"Drive connected to account: {connected_email}")
    except Exception as e:
        logger.warning(f"Could not fetch user info: {e}")
    
    # Store company-wide credentials
    await db[COMPANY_SETTINGS_COLLECTION].update_one(
        {"setting_id": COMPANY_DRIVE_ID},
        {"$set": {
            "setting_id": COMPANY_DRIVE_ID,
            "access_token": tokens.get("access_token"),
            "refresh_token": tokens.get("refresh_token"),
            "token_uri": "https://oauth2.googleapis.com/token",
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "scopes": DRIVE_SCOPES,
            "expiry": datetime.now(timezone.utc).isoformat(),
            "connected_by": state,
            "connected_email": connected_email,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }},
        upsert=True
    )
    
    logger.info(f"Google Drive connected by user {state}")
    
    # Redirect to frontend settings page
    frontend_url = os.environ.get("APP_URL", "")
    if not frontend_url:
        auth_url = os.environ.get("AUTH_SERVICE_URL", "")
        if auth_url:
            frontend_url = "https://gingerblueapp.com"
        else:
            frontend_url = "https://auto-logout-timer.preview.emergentagent.com"
    return RedirectResponse(url=f"{frontend_url}/settings?drive_connected=true")


@router.get("/status")
async def get_drive_status(user: User = Depends(get_current_user)):
    """Check if Google Drive is connected"""
    settings = await db[COMPANY_SETTINGS_COLLECTION].find_one(
        {"setting_id": COMPANY_DRIVE_ID},
        {"_id": 0, "access_token": 0, "refresh_token": 0, "client_secret": 0}
    )
    
    if not settings:
        return {"connected": False}
    
    return {
        "connected": True,
        "connected_by": settings.get("connected_by"),
        "connected_email": settings.get("connected_email"),
        "updated_at": settings.get("updated_at")
    }


async def get_company_drive_credentials() -> Optional[Credentials]:
    """Get company-wide Drive credentials with auto-refresh"""
    settings = await db[COMPANY_SETTINGS_COLLECTION].find_one(
        {"setting_id": COMPANY_DRIVE_ID}
    )
    
    if not settings or not settings.get("access_token"):
        return None
    
    creds = Credentials(
        token=settings["access_token"],
        refresh_token=settings.get("refresh_token"),
        token_uri=settings["token_uri"],
        client_id=settings["client_id"],
        client_secret=settings["client_secret"],
        scopes=settings.get("scopes", DRIVE_SCOPES)
    )
    
    # Auto-refresh if expired
    if creds.expired and creds.refresh_token:
        try:
            creds.refresh(GoogleRequest())
            # Update stored credentials
            await db[COMPANY_SETTINGS_COLLECTION].update_one(
                {"setting_id": COMPANY_DRIVE_ID},
                {"$set": {
                    "access_token": creds.token,
                    "expiry": creds.expiry.isoformat() if creds.expiry else None,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }}
            )
            logger.info("Drive credentials refreshed successfully")
        except Exception as e:
            logger.error(f"Failed to refresh Drive credentials: {e}")
            return None
    
    return creds


@router.post("/export-orders")
async def export_orders_to_drive(
    order_ids: List[str],
    folder_name: Optional[str] = "MFGFlow Exports",
    user: User = Depends(get_current_user)
):
    """Export selected orders to Google Drive as CSV"""
    if not order_ids:
        raise HTTPException(status_code=400, detail="No orders selected for export")
    
    creds = await get_company_drive_credentials()
    if not creds:
        raise HTTPException(
            status_code=400, 
            detail="Google Drive not connected. Please connect Drive in Settings first."
        )
    
    try:
        # Build Drive service
        service = build("drive", "v3", credentials=creds)
        
        # Get orders with batch info
        orders = await db.orders.find(
            {"order_id": {"$in": order_ids}},
            {"_id": 0}
        ).to_list(len(order_ids))
        
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
        
        # Get CSV content
        csv_content = csv_buffer.getvalue()
        csv_buffer.close()
        
        # Find or create folder
        folder_id = None
        folder_query = f"name='{folder_name}' and mimeType='application/vnd.google-apps.folder' and trashed=false"
        results = service.files().list(q=folder_query, spaces='drive', fields='files(id, name)').execute()
        folders = results.get('files', [])
        
        if folders:
            folder_id = folders[0]['id']
        else:
            # Create folder
            folder_metadata = {
                'name': folder_name,
                'mimeType': 'application/vnd.google-apps.folder'
            }
            folder = service.files().create(body=folder_metadata, fields='id').execute()
            folder_id = folder.get('id')
            logger.info(f"Created Drive folder: {folder_name}")
        
        # Upload CSV file
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"orders_export_{timestamp}.csv"
        
        file_metadata = {
            'name': filename,
            'parents': [folder_id]
        }
        
        media = MediaIoBaseUpload(
            io.BytesIO(csv_content.encode('utf-8')),
            mimetype='text/csv',
            resumable=True
        )
        
        file = service.files().create(
            body=file_metadata,
            media_body=media,
            fields='id, name, webViewLink'
        ).execute()
        
        logger.info(f"Exported {len(orders)} orders to Drive: {filename}")
        
        return {
            "success": True,
            "message": f"Exported {len(orders)} orders to Google Drive",
            "file_name": filename,
            "file_id": file.get('id'),
            "file_url": file.get('webViewLink'),
            "folder_name": folder_name,
            "orders_exported": len(orders)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_detail = traceback.format_exc()
        logger.error(f"Failed to export to Drive: {str(e)}\n{error_detail}")
        raise HTTPException(status_code=500, detail=f"Export failed: {str(e)}")


@router.delete("/disconnect")
async def disconnect_drive(user: User = Depends(get_current_user)):
    """Disconnect Google Drive (admin only)"""
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can disconnect Drive")
    
    result = await db[COMPANY_SETTINGS_COLLECTION].delete_one(
        {"setting_id": COMPANY_DRIVE_ID}
    )
    
    if result.deleted_count > 0:
        logger.info(f"Google Drive disconnected by {user.email}")
        return {"message": "Google Drive disconnected"}
    
    return {"message": "Google Drive was not connected"}
