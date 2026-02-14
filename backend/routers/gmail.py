"""
Gmail Integration Router - OAuth and Email Operations for CRM
Links emails to CRM records (Leads, Opportunities, Accounts)
"""
from fastapi import APIRouter, HTTPException, Depends, Query, Request
from fastapi.responses import RedirectResponse
from datetime import datetime, timezone, timedelta
from typing import Optional, List
import os
import uuid
import base64
import warnings
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from google_auth_oauthlib.flow import Flow
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request as GoogleRequest
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from database import db
from models.user import User
from dependencies import get_current_user

router = APIRouter(prefix="/gmail", tags=["gmail"])

# Gmail OAuth Configuration
GOOGLE_GMAIL_CLIENT_ID = os.environ.get("GOOGLE_GMAIL_CLIENT_ID")
GOOGLE_GMAIL_CLIENT_SECRET = os.environ.get("GOOGLE_GMAIL_CLIENT_SECRET")
GOOGLE_GMAIL_REDIRECT_URI = os.environ.get("GOOGLE_GMAIL_REDIRECT_URI")

# Gmail API Scopes
GMAIL_SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.labels",
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile"
]

def get_oauth_flow():
    """Create OAuth flow for Gmail"""
    if not GOOGLE_GMAIL_CLIENT_ID or not GOOGLE_GMAIL_CLIENT_SECRET:
        raise HTTPException(status_code=500, detail="Gmail OAuth credentials not configured")
    
    return Flow.from_client_config(
        {
            "web": {
                "client_id": GOOGLE_GMAIL_CLIENT_ID,
                "client_secret": GOOGLE_GMAIL_CLIENT_SECRET,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token"
            }
        },
        scopes=GMAIL_SCOPES,
        redirect_uri=GOOGLE_GMAIL_REDIRECT_URI
    )


async def get_gmail_credentials(user_id: str) -> Optional[Credentials]:
    """Get Gmail credentials for a user, refreshing if needed"""
    token_doc = await db.gmail_tokens.find_one({"user_id": user_id})
    if not token_doc:
        return None
    
    creds = Credentials(
        token=token_doc.get("access_token"),
        refresh_token=token_doc.get("refresh_token"),
        token_uri="https://oauth2.googleapis.com/token",
        client_id=GOOGLE_GMAIL_CLIENT_ID,
        client_secret=GOOGLE_GMAIL_CLIENT_SECRET
    )
    
    # Check if token is expired
    expires_at = token_doc.get("expires_at")
    if expires_at:
        if isinstance(expires_at, str):
            expires_at = datetime.fromisoformat(expires_at.replace('Z', '+00:00'))
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        
        if datetime.now(timezone.utc) >= expires_at:
            # Refresh the token
            try:
                creds.refresh(GoogleRequest())
                # Update stored token
                new_expires = datetime.now(timezone.utc) + timedelta(seconds=3600)
                await db.gmail_tokens.update_one(
                    {"user_id": user_id},
                    {"$set": {
                        "access_token": creds.token,
                        "expires_at": new_expires.isoformat()
                    }}
                )
            except Exception:
                # Token refresh failed, user needs to re-authenticate
                await db.gmail_tokens.delete_one({"user_id": user_id})
                return None
    
    return creds


def get_gmail_service(credentials: Credentials):
    """Build Gmail API service"""
    return build('gmail', 'v1', credentials=credentials)


# ==================== OAuth Endpoints ====================

@router.get("/auth/start")
async def start_gmail_auth(user: User = Depends(get_current_user)):
    """Start Gmail OAuth flow"""
    flow = get_oauth_flow()
    
    # Generate state for CSRF protection
    state = f"{user.user_id}:{uuid.uuid4().hex}"
    
    # Store state in database with TTL
    await db.gmail_oauth_states.insert_one({
        "state": state,
        "user_id": user.user_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()
    })
    
    authorization_url, _ = flow.authorization_url(
        access_type='offline',
        prompt='consent',
        state=state
    )
    
    return {"authorization_url": authorization_url}


@router.get("/auth/callback")
async def gmail_auth_callback(code: str, state: str, error: Optional[str] = None):
    """Handle Gmail OAuth callback"""
    if error:
        # Redirect to frontend with error
        return RedirectResponse(f"/crm/settings?gmail_error={error}")
    
    # Verify state
    state_doc = await db.gmail_oauth_states.find_one({"state": state})
    if not state_doc:
        return RedirectResponse("/crm/settings?gmail_error=invalid_state")
    
    # Check expiry
    expires_at = datetime.fromisoformat(state_doc["expires_at"].replace('Z', '+00:00'))
    if datetime.now(timezone.utc) > expires_at:
        await db.gmail_oauth_states.delete_one({"state": state})
        return RedirectResponse("/crm/settings?gmail_error=state_expired")
    
    user_id = state_doc["user_id"]
    
    # Clean up state
    await db.gmail_oauth_states.delete_one({"state": state})
    
    # Exchange code for tokens
    try:
        flow = get_oauth_flow()
        
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            flow.fetch_token(code=code)
        
        credentials = flow.credentials
        
        # Get user's Gmail address
        service = build('gmail', 'v1', credentials=credentials)
        profile = service.users().getProfile(userId='me').execute()
        gmail_address = profile.get('emailAddress')
        
        # Store tokens
        token_doc = {
            "user_id": user_id,
            "gmail_address": gmail_address,
            "access_token": credentials.token,
            "refresh_token": credentials.refresh_token,
            "expires_at": (datetime.now(timezone.utc) + timedelta(seconds=3600)).isoformat(),
            "connected_at": datetime.now(timezone.utc).isoformat(),
            "scopes": GMAIL_SCOPES
        }
        
        await db.gmail_tokens.update_one(
            {"user_id": user_id},
            {"$set": token_doc},
            upsert=True
        )
        
        return RedirectResponse("/crm/settings?gmail_connected=true")
        
    except Exception as e:
        print(f"Gmail OAuth error: {e}")
        return RedirectResponse("/crm/settings?gmail_error=auth_failed")


@router.get("/status")
async def get_gmail_status(user: User = Depends(get_current_user)):
    """Check if user has Gmail connected"""
    token_doc = await db.gmail_tokens.find_one({"user_id": user.user_id}, {"_id": 0})
    
    if not token_doc:
        return {"connected": False}
    
    return {
        "connected": True,
        "gmail_address": token_doc.get("gmail_address"),
        "connected_at": token_doc.get("connected_at")
    }


@router.post("/disconnect")
async def disconnect_gmail(user: User = Depends(get_current_user)):
    """Disconnect Gmail account"""
    result = await db.gmail_tokens.delete_one({"user_id": user.user_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Gmail not connected")
    
    return {"success": True, "message": "Gmail disconnected"}


# ==================== Email Operations ====================

@router.get("/messages")
async def list_messages(
    query: Optional[str] = None,
    max_results: int = Query(20, le=100),
    page_token: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """List Gmail messages"""
    creds = await get_gmail_credentials(user.user_id)
    if not creds:
        raise HTTPException(status_code=401, detail="Gmail not connected. Please connect your Gmail account.")
    
    try:
        service = get_gmail_service(creds)
        
        # Build query
        kwargs = {
            "userId": "me",
            "maxResults": max_results
        }
        if query:
            kwargs["q"] = query
        if page_token:
            kwargs["pageToken"] = page_token
        
        result = service.users().messages().list(**kwargs).execute()
        
        messages = []
        for msg in result.get("messages", []):
            # Get message details
            msg_detail = service.users().messages().get(
                userId="me",
                id=msg["id"],
                format="metadata",
                metadataHeaders=["From", "To", "Subject", "Date"]
            ).execute()
            
            headers = {h["name"]: h["value"] for h in msg_detail.get("payload", {}).get("headers", [])}
            
            messages.append({
                "id": msg["id"],
                "thread_id": msg["threadId"],
                "snippet": msg_detail.get("snippet", ""),
                "from": headers.get("From", ""),
                "to": headers.get("To", ""),
                "subject": headers.get("Subject", ""),
                "date": headers.get("Date", ""),
                "label_ids": msg_detail.get("labelIds", []),
                "is_unread": "UNREAD" in msg_detail.get("labelIds", [])
            })
        
        return {
            "messages": messages,
            "next_page_token": result.get("nextPageToken"),
            "result_size_estimate": result.get("resultSizeEstimate", 0)
        }
        
    except HttpError as e:
        if e.resp.status == 401:
            # Token expired or revoked
            await db.gmail_tokens.delete_one({"user_id": user.user_id})
            raise HTTPException(status_code=401, detail="Gmail authentication expired. Please reconnect.")
        raise HTTPException(status_code=500, detail=f"Gmail API error: {str(e)}")


@router.get("/messages/{message_id}")
async def get_message(message_id: str, user: User = Depends(get_current_user)):
    """Get a specific Gmail message with full content"""
    creds = await get_gmail_credentials(user.user_id)
    if not creds:
        raise HTTPException(status_code=401, detail="Gmail not connected")
    
    try:
        service = get_gmail_service(creds)
        
        msg = service.users().messages().get(
            userId="me",
            id=message_id,
            format="full"
        ).execute()
        
        headers = {h["name"]: h["value"] for h in msg.get("payload", {}).get("headers", [])}
        
        # Extract body
        body = ""
        payload = msg.get("payload", {})
        
        if "body" in payload and payload["body"].get("data"):
            body = base64.urlsafe_b64decode(payload["body"]["data"]).decode("utf-8")
        elif "parts" in payload:
            for part in payload["parts"]:
                if part["mimeType"] == "text/plain" and part.get("body", {}).get("data"):
                    body = base64.urlsafe_b64decode(part["body"]["data"]).decode("utf-8")
                    break
                elif part["mimeType"] == "text/html" and part.get("body", {}).get("data"):
                    body = base64.urlsafe_b64decode(part["body"]["data"]).decode("utf-8")
        
        return {
            "id": msg["id"],
            "thread_id": msg["threadId"],
            "from": headers.get("From", ""),
            "to": headers.get("To", ""),
            "cc": headers.get("Cc", ""),
            "subject": headers.get("Subject", ""),
            "date": headers.get("Date", ""),
            "body": body,
            "snippet": msg.get("snippet", ""),
            "label_ids": msg.get("labelIds", []),
            "is_unread": "UNREAD" in msg.get("labelIds", [])
        }
        
    except HttpError as e:
        raise HTTPException(status_code=500, detail=f"Gmail API error: {str(e)}")


@router.post("/send")
async def send_email(
    to: str,
    subject: str,
    body: str,
    cc: Optional[str] = None,
    bcc: Optional[str] = None,
    is_html: bool = False,
    # CRM linking
    link_to_lead: Optional[str] = None,
    link_to_opportunity: Optional[str] = None,
    link_to_account: Optional[str] = None,
    link_to_contact: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Send an email via Gmail and optionally link to CRM record"""
    creds = await get_gmail_credentials(user.user_id)
    if not creds:
        raise HTTPException(status_code=401, detail="Gmail not connected")
    
    try:
        service = get_gmail_service(creds)
        
        # Get sender's email
        token_doc = await db.gmail_tokens.find_one({"user_id": user.user_id})
        from_email = token_doc.get("gmail_address", "")
        
        # Create message
        if is_html:
            message = MIMEMultipart("alternative")
            message.attach(MIMEText(body, "html"))
        else:
            message = MIMEText(body)
        
        message["to"] = to
        message["from"] = from_email
        message["subject"] = subject
        
        if cc:
            message["cc"] = cc
        if bcc:
            message["bcc"] = bcc
        
        # Encode and send
        raw = base64.urlsafe_b64encode(message.as_bytes()).decode()
        
        sent_message = service.users().messages().send(
            userId="me",
            body={"raw": raw}
        ).execute()
        
        # Log to CRM
        now = datetime.now(timezone.utc).isoformat()
        email_log = {
            "email_id": sent_message["id"],
            "thread_id": sent_message["threadId"],
            "direction": "outbound",
            "from_address": from_email,
            "to_address": to,
            "cc_address": cc,
            "subject": subject,
            "body_preview": body[:500] if body else "",
            "sent_at": now,
            "sent_by": user.user_id,
            "sent_by_name": user.name,
            "lead_id": link_to_lead,
            "opportunity_id": link_to_opportunity,
            "account_id": link_to_account,
            "contact_id": link_to_contact,
            "created_at": now
        }
        
        await db.crm_email_logs.insert_one(email_log)
        
        return {
            "success": True,
            "message_id": sent_message["id"],
            "thread_id": sent_message["threadId"]
        }
        
    except HttpError as e:
        raise HTTPException(status_code=500, detail=f"Failed to send email: {str(e)}")


@router.post("/messages/{message_id}/link")
async def link_email_to_crm(
    message_id: str,
    lead_id: Optional[str] = None,
    opportunity_id: Optional[str] = None,
    account_id: Optional[str] = None,
    contact_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Link an existing email to a CRM record"""
    creds = await get_gmail_credentials(user.user_id)
    if not creds:
        raise HTTPException(status_code=401, detail="Gmail not connected")
    
    try:
        service = get_gmail_service(creds)
        
        # Get message details
        msg = service.users().messages().get(
            userId="me",
            id=message_id,
            format="metadata",
            metadataHeaders=["From", "To", "Subject", "Date"]
        ).execute()
        
        headers = {h["name"]: h["value"] for h in msg.get("payload", {}).get("headers", [])}
        
        # Get sender's email
        token_doc = await db.gmail_tokens.find_one({"user_id": user.user_id})
        user_email = token_doc.get("gmail_address", "")
        
        # Determine direction
        from_addr = headers.get("From", "")
        direction = "outbound" if user_email.lower() in from_addr.lower() else "inbound"
        
        now = datetime.now(timezone.utc).isoformat()
        
        # Create or update email log
        email_log = {
            "email_id": message_id,
            "thread_id": msg["threadId"],
            "direction": direction,
            "from_address": headers.get("From", ""),
            "to_address": headers.get("To", ""),
            "subject": headers.get("Subject", ""),
            "date": headers.get("Date", ""),
            "snippet": msg.get("snippet", ""),
            "lead_id": lead_id,
            "opportunity_id": opportunity_id,
            "account_id": account_id,
            "contact_id": contact_id,
            "linked_by": user.user_id,
            "linked_at": now,
            "created_at": now
        }
        
        await db.crm_email_logs.update_one(
            {"email_id": message_id},
            {"$set": email_log},
            upsert=True
        )
        
        return {"success": True, "message": "Email linked to CRM record"}
        
    except HttpError as e:
        raise HTTPException(status_code=500, detail=f"Gmail API error: {str(e)}")


@router.get("/linked-emails")
async def get_linked_emails(
    lead_id: Optional[str] = None,
    opportunity_id: Optional[str] = None,
    account_id: Optional[str] = None,
    contact_id: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, le=100),
    user: User = Depends(get_current_user)
):
    """Get emails linked to a specific CRM record"""
    query = {}
    
    if lead_id:
        query["lead_id"] = lead_id
    if opportunity_id:
        query["opportunity_id"] = opportunity_id
    if account_id:
        query["account_id"] = account_id
    if contact_id:
        query["contact_id"] = contact_id
    
    if not query:
        raise HTTPException(status_code=400, detail="At least one CRM record ID is required")
    
    total = await db.crm_email_logs.count_documents(query)
    skip = (page - 1) * page_size
    
    emails = await db.crm_email_logs.find(query, {"_id": 0}).sort(
        "created_at", -1
    ).skip(skip).limit(page_size).to_list(page_size)
    
    return {
        "emails": emails,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": (total + page_size - 1) // page_size
        }
    }


@router.get("/search-by-email")
async def search_emails_by_address(
    email_address: str,
    max_results: int = Query(20, le=50),
    user: User = Depends(get_current_user)
):
    """Search Gmail for emails from/to a specific address"""
    creds = await get_gmail_credentials(user.user_id)
    if not creds:
        raise HTTPException(status_code=401, detail="Gmail not connected")
    
    try:
        service = get_gmail_service(creds)
        
        # Search for emails from or to this address
        query = f"from:{email_address} OR to:{email_address}"
        
        result = service.users().messages().list(
            userId="me",
            q=query,
            maxResults=max_results
        ).execute()
        
        messages = []
        for msg in result.get("messages", []):
            msg_detail = service.users().messages().get(
                userId="me",
                id=msg["id"],
                format="metadata",
                metadataHeaders=["From", "To", "Subject", "Date"]
            ).execute()
            
            headers = {h["name"]: h["value"] for h in msg_detail.get("payload", {}).get("headers", [])}
            
            messages.append({
                "id": msg["id"],
                "thread_id": msg["threadId"],
                "snippet": msg_detail.get("snippet", ""),
                "from": headers.get("From", ""),
                "to": headers.get("To", ""),
                "subject": headers.get("Subject", ""),
                "date": headers.get("Date", ""),
                "is_unread": "UNREAD" in msg_detail.get("labelIds", [])
            })
        
        return {
            "email_address": email_address,
            "messages": messages,
            "total_found": len(messages)
        }
        
    except HttpError as e:
        raise HTTPException(status_code=500, detail=f"Gmail API error: {str(e)}")


# ==================== CRM Integration Helpers ====================

@router.get("/contact-emails/{contact_id}")
async def get_contact_email_history(
    contact_id: str,
    max_results: int = Query(30, le=100),
    user: User = Depends(get_current_user)
):
    """Get email history for a CRM contact"""
    # Get contact email
    contact = await db.crm_contacts.find_one({"contact_id": contact_id}, {"_id": 0, "email": 1, "full_name": 1})
    if not contact or not contact.get("email"):
        return {"emails": [], "message": "Contact has no email address"}
    
    # Get linked emails from database
    linked_emails = await db.crm_email_logs.find(
        {"contact_id": contact_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    # Also search Gmail if connected
    creds = await get_gmail_credentials(user.user_id)
    gmail_emails = []
    
    if creds:
        try:
            service = get_gmail_service(creds)
            query = f"from:{contact['email']} OR to:{contact['email']}"
            
            result = service.users().messages().list(
                userId="me",
                q=query,
                maxResults=max_results
            ).execute()
            
            linked_ids = {e["email_id"] for e in linked_emails}
            
            for msg in result.get("messages", []):
                if msg["id"] not in linked_ids:
                    msg_detail = service.users().messages().get(
                        userId="me",
                        id=msg["id"],
                        format="metadata",
                        metadataHeaders=["From", "To", "Subject", "Date"]
                    ).execute()
                    
                    headers = {h["name"]: h["value"] for h in msg_detail.get("payload", {}).get("headers", [])}
                    
                    gmail_emails.append({
                        "id": msg["id"],
                        "thread_id": msg["threadId"],
                        "snippet": msg_detail.get("snippet", ""),
                        "from": headers.get("From", ""),
                        "to": headers.get("To", ""),
                        "subject": headers.get("Subject", ""),
                        "date": headers.get("Date", ""),
                        "is_linked": False
                    })
        except Exception as e:
            print(f"Error fetching Gmail for contact: {e}")
    
    return {
        "contact": contact,
        "linked_emails": linked_emails,
        "gmail_emails": gmail_emails,
        "gmail_connected": creds is not None
    }
