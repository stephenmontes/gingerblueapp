# MFGFlow - Manufacturing & Fulfillment Application

## Original Problem Statement
Build a manufacturing and fulfillment app for Shopify websites with detailed time tracking, reporting, and user performance metrics.

## Core Features Implemented

### 1. Authentication
- Emergent-managed Google OAuth for user login

### 2. Order Management
- Multi-store sync (Shopify, Etsy via ShipStation, CSV dropship)
- Real-time Shopify webhooks for order sync
- Search across all orders including archived/fulfilled
- Editable ship dates
- Archive/unarchive functionality

### 3. Production Workflow
- Frame-centric batch processing
- Production stages: Cutting → Assembly → Sand → Paint → QC
- On-demand batches for inventory creation
- Time tracking per stage and user
- **Auto-archive batches when all items sent to inventory** (NEW - Feb 2026)
  - Batches automatically move to History when empty
  - Shows "Auto-completed" indicator in History tab
  - Toast notification when batch completes

### 4. Order Fulfillment
- Fulfillment stages: Print List → Mount → Finish → Pack & Ship
- Order-based batches route to Print List stage
- Time tracking for fulfillment process
- **Persistent Timer System** (NEW - Feb 2026)
  - Global timer banner at top of Order Fulfillment page
  - Start/Stop/Pause timer controls from page level AND within each stage
  - "Go to Stage" button navigates to the active timer's stage
  - Timer persists across all stages
  - Users can only complete stage tasks with an active timer
- **My Timer History** (NEW - Feb 2026)
  - Collapsible section showing user's timer sessions for today/yesterday/this week
  - Shows total time, sessions count, orders, and items processed
  - Breakdown by stage with expandable session details
  - Active timer indicator with current elapsed time
  - Auto-refreshes every 60 seconds
- **Enhanced Etsy/ShipStation Batch Workflow** (NEW - Feb 2026)
  - Item-level quantity tracking with +/- buttons
  - Auto-mark items complete when qty reaches required
  - Auto-mark orders complete when all items done
  - Progress resets when moving to new stage
  - Timer persists across stages (no stop on stage move)
  - Multiple workers can work on same batch simultaneously
  - **Order Selection & Bulk Actions** (NEW)
    - Checkbox selection for individual orders
    - Select All / Deselect All functionality
    - "Mark Selected Complete" button to bulk complete all items in selected orders
  - **Pause/Resume Timer for Batch Workers** (NEW)
    - Individual users can pause their timer while staying on batch
    - Paused users shown in yellow in the workers list
    - Resume to continue tracking
  - Comprehensive batch report with:
    - Per-worker time breakdown
    - Items per hour metrics
    - Cost per hour and total cost
    - Combined production + fulfillment time

### 5. CRM System (NEW - Feb 2026)
- Customer import from all connected Shopify stores
- Automatic sync with Shopify tags/segments
- Customer profile with contact info, orders, lifetime value
- Shared notes (general, call, email, meeting, issue types)
- Custom tags and segments (VIP, Wholesale, Retail, etc.)
- Bulk actions for tagging and segmentation
- Customer statistics and analytics

### 6. Reporting
- Batch reports with production + fulfillment time breakdown
- Cost per frame calculations
- User performance metrics
- Stage-level KPIs
- **Date Range Filtering** (NEW - Feb 2026)
  - Filter reports by: Today, Last 7 Days, This Month, Last Month, Custom Range
  - Custom date picker for start and end dates
  - Date filters applied to: Dashboard stats, Production KPIs, User stats, Stage stats
  - Backend APIs updated: `/stats/dashboard`, `/stats/production-kpis`, `/stats/users`, `/stats/stages`

### 7. Scheduling
- Google Calendar integration for order ship dates

## API Endpoints

### Customers (NEW)
- `GET /api/customers` - List with search/filter/pagination
- `GET /api/customers/stats` - Overall statistics
- `GET /api/customers/segments` - Unique segments/tags
- `GET /api/customers/{id}` - Customer detail with orders/activities
- `PUT /api/customers/{id}` - Update custom fields
- `POST /api/customers/{id}/notes` - Add note
- `POST /api/customers/{id}/tags` - Add tag
- `DELETE /api/customers/{id}/tags/{tag}` - Remove tag
- `POST /api/customers/sync` - Sync from Shopify stores
- `POST /api/customers/bulk-tag` - Bulk add tag
- `POST /api/customers/bulk-segment` - Bulk set segment

### Batch Reports
- `GET /api/stats/batch/{batch_id}` - Detailed batch report
- `GET /api/stats/batches-summary` - All batches summary

## Database Collections
- `customers` - Customer profiles
- `customer_activities` - Notes and activity log
- `fulfillment_orders` - Orders
- `production_batches` - Batches
- `batch_frames` - Frame items in batches
- `time_logs` - Production time tracking
- `fulfillment_time_logs` - Fulfillment time tracking
- `stores` - Connected stores

## Tech Stack
- Frontend: React + Vite + Tailwind + shadcn/ui
- Backend: FastAPI + Python
- Database: MongoDB
- Auth: Emergent Google OAuth

## Integrations
- Shopify (orders, products, customers, webhooks)
- ShipStation (order sync for Etsy + dropship)
- Google Calendar (scheduling)

## Upcoming Tasks
- ShipStation Fulfillment UI (rates, labels)
- Order Audit Log
- Etsy Webhooks
- Bulk Print (combined packing slips)
- UI State Persistence (remember filters/sorting)

## Pending User Verification
- **Report Button on Frame Production Page** - User needs to verify visibility after frontend restart

## Known Issues
- Custom domain login requires re-linking after deployment (platform issue)
- "Failed to update progress" error for Antique Farmhouse orders (enhanced logging added, needs debugging)

## Recent Changes (Feb 2026)
- Implemented date range filtering on Reports page (backend + frontend)
- Enhanced time-based aggregations across all report endpoints
- **Timer Corruption Fix** - Added force cleanup for corrupted timers:
  - New `/api/fulfillment/force-cleanup-my-timer` endpoint for self-service cleanup
  - New `/api/admin/force-cleanup-user/{user_id}` endpoint for admin cleanup
  - FulfillmentTimerBanner now detects and handles corrupted timer data (NaN display)
  - Automatic fallback to force cleanup when regular stop fails
  - Visual warning when timer data appears corrupted
  - "Force Reset" button on Team page for admins
- **Time Entry Management Sorting** - Added sort/filter controls (User → Date, Date desc, User A-Z)
- **CSV Import Duplicate Handling** - Enhanced feedback for duplicate order updates
- **Google Drive Export** - New feature to export selected orders directly to Google Drive:
  - New `/api/drive/*` endpoints for OAuth and export
  - Export button in Orders page selection bar
  - Google Drive integration settings in Settings page
  - Exports include order data + batch info as CSV
