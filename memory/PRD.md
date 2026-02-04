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

### 4. Order Fulfillment
- Fulfillment stages: Print List → Mount → Finish → Pack & Ship
- Order-based batches route to Print List stage
- Time tracking for fulfillment process

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

## Known Issues
- Custom domain login requires re-linking after deployment (platform issue)
