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
- **Faire Order # Column** (NEW - Feb 2026)
  - Displays Faire order number for orders synced from Faire marketplace
  - Extracts from Shopify's note_attributes ("Faire order number" field)
  - Shows in orange color in both table and order detail dialog
  - Blank for non-Faire orders
- **Store Name Column** - Shows store name with platform badge

### 3. Frame Production Time Tracking
- **Stop Timer Dialog** (NEW - Feb 2026)
  - When stopping a timer, prompts user to enter number of items processed
  - Context-aware labels (e.g., "frames cut", "frames sanded", "frames assembled")
  - Records items_processed for productivity calculations
- **Frame Number Reminder** (NEW - Feb 2026)
  - Visual reminder near Stop Timer button in Active Timer Banner
  - Amber warning text: "Enter frame numbers before stopping"
  - AlertTriangle icon for visibility
  - Positioned below timer controls for user attention
- **User Production Report** (NEW - Feb 2026)
  - Per-user, per-stage breakdown of time tracked and items processed
  - Items per hour calculation for each user at each stage
  - Filterable by day, week, month, or custom date range
  - Summary cards: Active Workers, Total Hours, Total Items, Avg Items/Hour
  - Located in Reports > Productivity tab

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

### 8. Point of Sale (POS) - COMPLETE (Feb 2026)
- **Store Selection** - Choose from connected Shopify stores
- **Product Search** - Search by barcode, SKU, title, or tag with auto-fill
- **Variant Selection** - Dropdown to select product variants
- **Barcode Scanner** - Enter key triggers barcode search
- **Enhanced Customer Search** - Auto-fill search by name, email, phone, company, city, address
  - Results show company, address, orders count, total spent
- **Custom Items** - Add non-catalog products
- **Cart Management** - Quantity controls (+/-), remove items
- **Item Discounts** - Apply percentage or fixed discount per item
- **Order Discount** - Apply percentage or fixed discount to entire order
- **Shipping Presets** - Dropdown with percentage-based shipping (30%, 25%, 20%, 18%, 15%, 12%, 10%, Free)
- **Tax Exempt Toggle** - Mark order as tax exempt
- **Order Notes & Tags** - Add notes and custom tags
- **Auto-Generated Order Numbers** - Format: pos21000, pos21001, etc.
- **Draft Orders** - Save order as draft without syncing to Shopify
- **Print Receipt** - Thermal-printer-friendly receipt with item thumbnails
- **Reprint Button** - Reprint last order receipt
- **Shopify Sync** - Live orders sync automatically to selected Shopify store

### POS API Endpoints
- `GET /api/pos/stores` - List Shopify stores
- `GET /api/pos/next-order-number` - Get next POS order number
- `GET /api/pos/products/search` - Search products with variant info
- `GET /api/pos/customers/search` - Search customers with enhanced fields
- `POST /api/pos/customers` - Create new customer
- `POST /api/pos/orders` - Create order (live or draft)
- `GET /api/pos/drafts` - List draft orders
- `GET /api/pos/drafts/{id}` - Get draft order details
- `DELETE /api/pos/drafts/{id}` - Delete draft order
- `POST /api/pos/drafts/{id}/complete` - Convert draft to live order

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
- **Timer Corruption Fix** - Added force cleanup for corrupted timers
- **Time Entry Management Sorting** - Added sort/filter controls
- **CSV Import Duplicate Handling** - Enhanced feedback for duplicate order updates
- **CSV Export** - Local CSV download for selected orders (`/api/export/orders-selected`)
- **Deployment Fixes** - Added `/health` endpoint, fixed hardcoded URLs
- **Navigation Menu Scrollable Fix** - Made sidebar navigation scrollable on mobile/tablet devices so all menu items are accessible
- **POS Refactoring (Feb 2026)** - Broke down monolithic 2782-line POS.jsx into modular components:
  - Custom hooks: `usePOSCart`, `usePOSDrafts`, `usePOSProducts`, `usePOSCustomers`
  - Components: `POSCart`, `POSProductSearch`, `POSOrderSummary`, `POSDialogs`
  - Main POS.jsx reduced from 2782 to 1053 lines
  - Improved maintainability and testability
- **POS iPhone Optimization (Feb 2026)** - Mobile-first redesign for iPhone/small screens:
  - Compact header with "POS" title, order number badge, drafts button, store selector
  - Floating action bar at bottom with: total, item count, settings, save draft, create order buttons
  - "Order Options" dialog accessible via settings button for customer, shipping, discounts
  - Responsive breakpoints for iPhone SE (375px) to iPhone 14 Pro Max (430px)
  - Fixed variant Add buttons not visible on mobile (removed ScrollArea, optimized flex layout)
  - Desktop layout unchanged (3-column grid)
- **Scheduling Calendar Enhancement (Feb 2026)** - Integrated POS orders with ship dates:
  - Backend `/api/calendar/orders-with-dates` now returns both Shopify and POS orders
  - Calendar sync `/api/calendar/sync-orders` handles both order sources
  - UI shows source badges (blue=POS, orange=Shopify, green=synced)
  - Updated legend, table with Source column
  - Color-coded calendar events (orange for Shopify, green for POS)
- **Ship Date Calendar Picker (Feb 2026)** - Replaced date input with visual calendar picker:
  - Shows month view with navigation
  - Disables past dates
  - Clear date button
  - Formatted date display (e.g., "February 20th, 2026")
- **Customer Draft Orders Tab (Feb 2026)** - Added Draft Orders tab to Customer detail:
  - New backend endpoint `/api/pos/drafts/by-customer/{customer_id}`
  - Shows all POS draft orders for selected customer
  - Displays order number, items, total, ship date, notes, store
  - Order color indicator preserved
- **Point of Sale (POS)** - COMPLETE - In-store order creation with Shopify sync:
  - Store selector for Shopify stores
  - Product search by barcode, SKU, title, or tag
  - Variant selection dropdown for multi-variant products
  - Barcode scanner support (Enter key triggers search)
  - **Enhanced Customer Search (Feb 2026):**
    - Auto-fill/autocomplete with 300ms debounce
    - Search by name, first/last name, email, phone, company, city, state, address
    - Results display company, email, phone, address, orders count, total spent
    - Tax Exempt badge, Select button per result
    - X button to remove selected customer
  - Customer creation with full Shopify fields
  - Tax exempt toggle, ship all items toggle
  - Custom item creation for non-catalog products
  - Cart management with quantity controls (+/-)
  - Shipping method and cost configuration
  - Order notes and tags
  - Auto-sync to Shopify on order creation
  - **Testing: 100% pass rate (Feb 2026)**
  - **Android Scrolling & Cart Optimization (Feb 2026):**
    - Fixed page scrolling issue on Android devices
    - Removed fixed max-height on mobile cart container
    - Cart items flow naturally, allowing full page scroll
    - Optimized cart item layout for mobile:
      - Smaller thumbnails (32px vs 48px on desktop)
      - Compact text sizes and spacing
      - Inline quantity controls and actions
      - Responsive icons and buttons
    - Moved floating action bar to bottom-0 with safe-area padding
    - Increased page bottom padding (pb-32) for action bar clearance
    - Desktop retains internal cart scroll (lg:max-h-[400px])

### 9. Barcode Label Printing - COMPLETE (Feb 2026)
- **Products Page Barcode Printing:**
  - Individual variant labels (2"x1") with title, barcode, barcode number, and SKU
  - All variants on single 4"x6" label with title header and barcode grid
  - Configurable label quantity (1-100)
  - JsBarcode CODE128 format integration
- **Orders Page Barcode Printing (NEW - Feb 2026):**
  - Print 1 barcode label per item quantity in an order
  - Example: Order with 3x Item A + 2x Item B generates 5 labels
  - Blue barcode button in Actions column (data-testid="barcode-order-{id}")
  - Print preview window with "Print X Labels" and "Close" buttons
  - Error handling for empty orders (toast notification)
  - Handles both 'items'/'line_items' and 'qty'/'quantity' field names

### 10. Mobile Optimization - COMPLETE (Feb 2026)
- **Order Fulfillment Page (Android Mobile):**
  - Header: Compact title (text-xl), icon-only refresh button
  - KPI Cards: 2-column grid on mobile with responsive text sizes
  - Stage Tabs: Horizontal scroll with scroll hint gradient
  - Timer Banner: Stacked layout with full-width Start Timer button
  - Orders List: Mobile card view replaces table on small screens
  - Mobile Order Cards: Order #, customer, items, stock status, action buttons
  - Touch Targets: All buttons ≥32px for finger-friendly interaction
  - Tested on Pixel 6 viewport (412x915)

### 11. Auto-Logout Feature - COMPLETE (Feb 2026)
- **9-Hour Session Timeout:**
  - Automatic logout after 9 hours of session activity
  - 60-second countdown warning dialog before logout
  - "Continue Working" button extends session for 9 more hours
  - "Log Out Now" button for immediate logout
  - Session start time persisted in localStorage across page refreshes
- **Timer Cleanup on Logout:**
  - All active fulfillment timers stopped on logout (`POST /api/fulfillment/timers/stop-all`)
  - All active production timers stopped on logout (`POST /api/production/timers/stop-all`)
  - Timers marked with `stopped_reason: "session_timeout"` for audit trail
- **Activity Heartbeat:**
  - Frontend sends heartbeat every 60 seconds (`POST /api/activity/heartbeat`)

### 12. Salesforce-Style CRM Module - PHASE 1 COMPLETE (Feb 2026)
- **Sales Dashboard (/crm):**
  - Period selector (Today, This Week, This Month, This Quarter, This Year)
  - Key metrics: Total Pipeline, Closed Won, Win Rate, Weighted Pipeline
  - Secondary metrics: Open Opps, New Leads, Converted, Conversion Rate, Tasks Overdue
  - Pipeline by Stage visualization with progress bars
  - Stale Opportunities (14+ days no activity)
  - Closing This Month section
  - Quick action buttons
- **Leads Management (/crm/leads):**
  - Create, edit, delete leads
  - Lead sources: Website, Trade Show, Referral, Cold Call, Social Media, Other
  - Lead statuses: New, Contacted, Qualified, Unqualified, Converted
  - Search and filter by status/source
  - Convert lead to Account + Contact + optional Opportunity
  - Duplicate prevention by email
- **Accounts Management (/crm/accounts):**
  - Create, edit, delete accounts (companies)
  - Account types: Prospect, Customer, Vendor, Partner
  - Account status: Active, Inactive, Churned
  - Industry and territory classification
  - Rollup fields: Total Opportunities, Open Opps, Total Revenue, Pipeline Value
  - Account detail view with contacts, opportunities, tasks, activities
  - Link to existing ERP customer data
- **Opportunities Pipeline (/crm/opportunities):**
  - **Kanban View (default):** Drag-drop stage changes
  - **List View:** Sortable, filterable table
  - Stages (editable): Prospecting(10%) → Qualification(20%) → Needs Analysis(40%) → Proposal(60%) → Negotiation(80%) → Closed Won(100%) / Closed Lost(0%)
  - Automatic probability update on stage change
  - Stage history tracking with timestamps and user
  - Forecast categories: Pipeline, Best Case, Commit, Closed, Omitted
  - Won/Lost buttons with immediate close
- **Navigation:**
  - Sidebar "CRM & SALES" section
  - Links: Sales Dashboard, Leads, Accounts, Opportunities
- **Backend APIs:**
  - `GET/POST/PUT/DELETE /api/crm/accounts` - Account CRUD
  - `GET/POST/PUT/DELETE /api/crm/contacts` - Contact CRUD
  - `GET/POST/PUT/DELETE /api/crm/leads` - Lead CRUD
  - `POST /api/crm/leads/{id}/convert` - Lead conversion
  - `GET/POST/PUT/DELETE /api/crm/opportunities` - Opportunity CRUD
  - `GET /api/crm/opportunities/pipeline` - Kanban data
  - `GET/POST/PUT/DELETE /api/crm/tasks` - Task CRUD
  - `GET/POST/PUT/DELETE /api/crm/notes` - Note CRUD
  - `GET/POST /api/crm/events` - Event/Meeting CRUD
  - `GET /api/crm/settings` - Editable stages and sources
  - `GET /api/crm/search` - Global search
  - `GET /api/crm/reports/dashboard` - Dashboard metrics
  - `GET /api/crm/reports/pipeline-by-stage` - Pipeline breakdown
  - `GET /api/crm/reports/stale-opportunities` - Stale deals
  - `GET /api/crm/reports/closing-soon` - Deals closing soon
- **Data Model:**
  - MongoDB collections: crm_accounts, crm_contacts, crm_leads, crm_opportunities, crm_tasks, crm_notes, crm_events, crm_quotes, crm_activity_log, crm_settings
  - Full audit trail with activity logging
  - Proper indexing for search performance
- **Testing:** 100% pass rate (28 backend tests, all frontend flows verified)

### 13. Customer/Account Data Separation Architecture - COMPLETE (Feb 2026)
- **Data Structure:**
  - `customers` collection: Shopify-synced data (name, email, address, orders_count, etc.)
  - `customer_crm` collection: CRM-owned fields (1:1 with customers, keyed by customer_id)
  - Physical separation prevents Shopify sync from overwriting CRM data
- **Field Ownership Rules:**
  - **Shopify-Owned** (read-only from CRM): email, first_name, last_name, phone, addresses, orders_count, total_spent, accepts_marketing, tags, note
  - **CRM-Owned** (editable, never synced): owner_user_id, account_status, crm_tags, industry, account_type, territory, region, lead_source, credit_limit, payment_terms, crm_notes, custom_fields
  - **ERP-Calculated** (read-only): total_orders, total_revenue, pipeline_value, open_orders, last_order_date
- **Unified Account View:**
  - Joins customers + customer_crm + ERP rollups
  - Shows all data in organized panels with clear ownership indicators
  - Lock icon for Shopify fields, unlock icon for CRM fields
- **Lead Conversion Flow:**
  - Creates Customer record (if not exists)
  - Creates Customer_CRM record (always)
  - Links to CRM Account for opportunity tracking
  - Creates Contact and optional Opportunity
- **API Endpoints:**
  - `GET /api/customer-crm/accounts` - Unified account list
  - `GET /api/customer-crm/accounts/{id}` - Full account view with rollups
  - `PUT /api/customer-crm/accounts/{id}/crm` - Update CRM fields only
  - `POST /api/customer-crm/leads/{id}/convert-to-customer` - Lead conversion
  - `GET /api/customer-crm/field-ownership` - Document field rules
  - `POST /api/customer-crm/accounts/bulk-assign` - Bulk owner assignment
  - `POST /api/customer-crm/accounts/bulk-tag` - Bulk tagging
- **Frontend:**
  - `/crm/accounts` now shows unified view
  - Detail modal with tabs: Overview, Shopify Data (read-only), CRM Data (editable), Orders & Activity
  - Edit button only for CRM fields

## CRM Module Roadmap

### Phase 2 - Sales Operations 
#### Quote Object - COMPLETE (Feb 2026)
- **Quote Creation:**
  - Create quotes from opportunities with Shopify product integration
  - Product line items with SKU, quantity, unit price, discount
  - Subtotal, order-level discount %, tax %, shipping calculation
  - Auto-generate quote numbers (Q-00001 format)
  - Associate with account, opportunity, and optional contact
- **Quote Versioning:**
  - Automatic version increment per opportunity
  - Clone existing quotes to create new versions
  - View all versions linked to the same opportunity
- **Quote Status Workflow:**
  - Draft → Sent → Accepted/Rejected → Converted
  - Only draft quotes can be edited or deleted
  - Accepting quote updates opportunity amount
- **Convert to Order:**
  - Convert accepted quote to sales order
  - Automatically marks opportunity as Closed Won
  - Sets forecast to "closed"
- **Shopify Product Search:**
  - Search products from synced Shopify catalog
  - Returns variant details: SKU, barcode, price, inventory
  - Add products directly to quote line items
- **API Endpoints:**
  - `GET /api/crm/quotes` - List with filtering/pagination
  - `POST /api/crm/quotes` - Create quote
  - `GET /api/crm/quotes/{id}` - Get with related data
  - `PUT /api/crm/quotes/{id}` - Update draft only
  - `DELETE /api/crm/quotes/{id}` - Delete draft only
  - `POST /api/crm/quotes/{id}/send` - Mark as sent
  - `POST /api/crm/quotes/{id}/accept` - Accept and update opportunity
  - `POST /api/crm/quotes/{id}/reject` - Reject with reason
  - `POST /api/crm/quotes/{id}/clone` - Create new version
  - `POST /api/crm/quotes/{id}/convert-to-order` - Convert accepted quote
  - `GET /api/crm/quotes/products/search?q={term}` - Shopify product search
- **Frontend (/crm/quotes):**
  - Quotes list with status badges and version indicators
  - Create Quote dialog with product search
  - Quote detail view with line items and totals
  - Status-specific workflow buttons
  - Other Versions section
- **Testing:** 100% pass rate (17 backend tests, all UI flows verified)

#### Additional Reports/Dashboards (Planned)
- Win/Loss analysis
- Forecast by month
- Leads by source report
- Activity reports by rep
- Top accounts report

#### Communication Log (Planned)
- Manual email/call logging
- Associate communications to records

### 14. Configurable CRM Framework - COMPLETE (Feb 2026)
- **Admin Setup Page** (`/crm/setup`):
  - 4 tabs: Stages, Picklists, Custom Fields, Automation
  - Access restricted to admin/manager roles
- **Pipeline Stages Configuration:**
  - Add/edit/delete opportunity stages
  - Configure: name, probability, forecast category, color, order
  - Reorder stages with up/down arrows
  - Mark stages as closed (won/lost)
  - Cannot delete system stages (closed_won, closed_lost)
- **Picklist Management:**
  - 7 system picklists: Lead Source, Industry, Territory, Account Type, Lead Status, Task Priority, Task Status
  - Add/remove options from any picklist
  - Set option colors
  - Shows which objects use each picklist
- **Custom Fields:**
  - Add custom fields to any CRM object (Account, Contact, Lead, Opportunity, Customer CRM)
  - Field types: Text, Text Area, Number, Currency, Percent, Date, Checkbox, Picklist, Email, Phone, URL
  - Configure: required, visible on list view, description
  - Picklist fields support custom options
- **Backend Collections:**
  - `crm_config_stages`: Pipeline stage definitions
  - `crm_config_picklists`: Picklist configurations
  - `crm_config_fields`: Custom field definitions
  - `crm_config_layouts`: Page layout configurations
  - `crm_config_automation`: Automation rule definitions
  - `crm_config_assignment`: Assignment rule definitions
- **API Endpoints:**
  - `GET/POST/PUT/DELETE /api/crm/admin/stages` - Stage CRUD
  - `POST /api/crm/admin/stages/reorder` - Reorder stages
  - `GET/POST/PUT /api/crm/admin/picklists` - Picklist CRUD
  - `POST/DELETE /api/crm/admin/picklists/{id}/options` - Add/remove options
  - `GET/POST/PUT/DELETE /api/crm/admin/fields` - Custom field CRUD
  - `GET /api/crm/admin/fields/{object_type}` - Get all fields for object
  - `GET/PUT /api/crm/admin/layouts/{object_type}` - Page layouts
  - `GET /api/crm/admin/export` - Export full configuration

### Phase 3 - CRM Advanced Features - COMPLETE (Feb 2026)

#### Gmail Integration - COMPLETE
- **OAuth Flow:**
  - Connect Gmail via Google OAuth at `/crm/setup` (Integrations tab)
  - Stores access/refresh tokens per user
  - Auto-refresh expired tokens
  - CSRF protection with state parameter
- **Email Operations:**
  - List Gmail messages (`GET /api/gmail/messages`)
  - Get message details with full body (`GET /api/gmail/messages/{id}`)
  - Send emails via Gmail (`POST /api/gmail/send`)
  - Search emails by contact address (`GET /api/gmail/search-by-email`)
- **CRM Integration:**
  - Link emails to Leads, Opportunities, Accounts, Contacts
  - View linked emails for any CRM record (`GET /api/gmail/linked-emails`)
  - Email history for contacts (`GET /api/gmail/contact-emails/{id}`)
  - Logs outbound emails to `crm_email_logs` collection
- **Frontend (`/crm/setup` → Integrations tab):**
  - Gmail connection status indicator
  - Connect/Disconnect buttons
  - Shows connected email address and date
  - Feature description when connected

#### Approval Workflows (Discount Approvals) - COMPLETE
- **Approval Rules:**
  - Configure discount approval thresholds (`/crm/setup` → Automation tab)
  - Trigger types: discount_percent, discount_amount, quote_total
  - Set threshold value and comparison operator (≥ or >)
  - Assign multiple approvers (managers/admins)
  - Auto-approve option for below-threshold values
  - Active/Inactive status toggle
- **Approval Requests:**
  - Automatic approval request creation when threshold exceeded
  - In-app notifications for approvers
  - Approve/Reject with notes and reason
  - Timeline logging for all approval events
  - "My Pending Approvals" quick view
- **API Endpoints:**
  - `GET/POST/PUT/DELETE /api/automation/approval-rules` - Rule CRUD
  - `GET /api/automation/approval-requests` - List requests with filters
  - `GET /api/automation/my-pending-approvals` - Pending for current user
  - `POST /api/automation/approval-requests/{id}/approve` - Approve request
  - `POST /api/automation/approval-requests/{id}/reject` - Reject request
- **Testing:** 100% pass rate (14 backend tests + all frontend flows)

#### Campaign Management - COMPLETE
- **Campaign CRUD:**
  - Create marketing campaigns with name, type, status, budget
  - Campaign types: email, social_media, trade_show, webinar, advertising, content_marketing, referral, direct_mail, telemarketing, other
  - Statuses: planned, in_progress, completed, paused, cancelled
  - Track dates, budget, expected revenue, target audience
- **Campaign Attribution:**
  - Link leads and opportunities to campaigns
  - Automatic metric calculation (leads_generated, opportunities_created, revenue_won)
  - Cost per lead calculation
  - ROI calculation: ((revenue - budget) / budget * 100)
- **Campaign Reports:**
  - Summary report: total campaigns, budget, leads, revenue, overall ROI
  - Performance report: per-campaign metrics including conversion rates and win rates
- **API Endpoints:**
  - `GET/POST/PUT/DELETE /api/campaigns` - Campaign CRUD
  - `GET /api/campaigns/{id}` - Details with metrics, leads, opportunities
  - `POST /api/campaigns/{id}/attribute-lead/{lead_id}` - Attribution
  - `POST /api/campaigns/{id}/attribute-opportunity/{opp_id}` - Attribution
  - `GET /api/campaigns/reports/summary` - Overall summary
  - `GET /api/campaigns/reports/performance` - Per-campaign analytics
  - `GET /api/campaigns/config/types` - Available types and statuses
- **Frontend (`/crm/campaigns`):**
  - Campaign list with filters (status, type, search)
  - Summary cards: Total Campaigns, Leads Generated, Revenue Won, Overall ROI
  - New Campaign dialog with all fields
  - Campaign detail dialog with Overview/Leads/Opportunities tabs
  - Metrics visualization (cost per lead, ROI)
- **Testing:** 100% pass rate (16 backend tests + all frontend flows)

#### Case Management (Support Tickets) - COMPLETE (Feb 2026)
- **Case CRUD:**
  - Create/edit/delete support cases linked to accounts and contacts
  - Auto-generated case numbers (CS-00001 format)
  - Case statuses: new, in_progress, waiting_customer, escalated, resolved, closed
  - Case priorities: low, medium, high, critical
  - Categories: Product Issue, Shipping/Delivery, Billing/Payment, Returns/Refunds, Order Inquiry, Technical Support, Account Issue, General Question, Complaint, Other
  - Origins: Email, Phone, Web Form, Chat, Social Media, Walk-in, Internal
  - Contact information (name, email, phone) stored on case
  - Due date tracking with overdue highlighting
- **Case Activities:**
  - Internal and public comments on cases
  - Activity feed with timestamps and user attribution
  - Status change history tracking
  - First response time tracking
- **Case Dashboard:**
  - Stats cards: Open Cases, My Cases, Critical/High, Overdue, Resolved Today
  - Filter by status, priority, assigned user
  - Search by case number, subject, description, contact info
- **Quick Actions:**
  - Start Working, Waiting on Customer, Resolve, Escalate, Close
  - Automatic timestamp updates for resolved_at, closed_at
- **Bulk Operations:**
  - Bulk assign cases to user
  - Bulk update status
  - Admin/Manager role required
- **API Endpoints:**
  - `GET/POST/PUT/DELETE /api/cases` - Case CRUD
  - `GET /api/cases/{id}` - Details with activities, related cases
  - `POST /api/cases/{id}/comments` - Add comment
  - `GET /api/cases/stats` - Dashboard statistics
  - `GET /api/cases/config` - Statuses, priorities, categories, origins
  - `GET /api/cases/by-account/{id}` - Cases by account
  - `GET /api/cases/by-contact/{id}` - Cases by contact
  - `POST /api/cases/bulk-assign` - Bulk assign
  - `POST /api/cases/bulk-status` - Bulk status update
- **Frontend (`/crm/cases`):**
  - Cases list with filters and stats
  - New Case dialog with all fields
  - Case detail dialog with Details/Activity/Related tabs
  - Quick action buttons for status changes
  - Comment form with public/internal toggle
- **Testing:** 100% pass rate (21 backend tests + all frontend flows)

### Phase 4 - Future Enhancements (Backlog)
- **Custom Object Builder:**
  - Admin can create custom objects with fields
- **Additional Reports:**
  - Win/Loss analysis
  - Forecast by month
  - Leads by source report
  - Activity reports by rep
  - Top accounts report

### 15. Activity Timeline (Salesforce-style Chatter) - COMPLETE (Feb 2026)
- **Core Features:**
  - Unified activity feed on CRM records (Opportunities, Accounts)
  - Multiple activity types: Post, Note, Call Log, Email Log, Meeting Log, **Onboarding** (custom)
  - User-created posts with rich text
  - System-generated events (stage changes, owner changes)
  - Threaded replies/comments
  - @mentions with notification support
  - File attachment support (UI ready, cloud storage not integrated)
  - Pin/Unpin important posts
  - Follow/Unfollow records with notification preferences
  - Activity type filtering
  - Pagination and auto-polling (30 second refresh)
- **Timeline Composer:**
  - Tab-based activity type selector
  - Call log with duration and outcome fields
  - Attachment picker (images, documents)
  - Cancel/Post actions
- **System Event Logging:**
  - Automatic timeline entries when Opportunity stage changes
  - Shows old value → new value transition
  - Attributed to user who made the change
- **API Endpoints:**
  - `POST /api/timeline/items` - Create timeline item
  - `GET /api/timeline/items/{entity_type}/{entity_id}` - Get paginated timeline
  - `PUT /api/timeline/items/{item_id}` - Update item (edit window: 15 min)
  - `DELETE /api/timeline/items/{item_id}` - Soft delete item
  - `POST /api/timeline/items/{item_id}/pin` - Toggle pin status
  - `POST /api/timeline/follow/{entity_type}/{entity_id}` - Follow record
  - `DELETE /api/timeline/follow/{entity_type}/{entity_id}` - Unfollow
  - `GET /api/timeline/follow/{entity_type}/{entity_id}` - Get follow status
  - `GET /api/timeline/followers/{entity_type}/{entity_id}` - List followers
  - `GET /api/timeline/notifications` - Get user notifications
  - `PUT /api/timeline/notifications/{id}/read` - Mark as read
  - `PUT /api/timeline/notifications/read-all` - Mark all read
  - `GET /api/timeline/activity-types` - List activity type configs
  - `POST /api/timeline/quick/note` - Quick add note
  - `POST /api/timeline/quick/call` - Quick log call
  - `POST /api/timeline/quick/task` - Quick create task
- **Database Collections:**
  - `timeline_items` - All timeline entries with indexed entity_type/entity_id
  - `record_follows` - User follow subscriptions
  - `timeline_notifications` - User notifications
- **Frontend Integration:**
  - Timeline tab in Opportunity detail dialog
  - Timeline tab in Customer Account detail dialog
  - ActivityTimeline React component (reusable)
- **Testing:** 100% pass rate (16 backend tests, all UI flows verified)

### 16. Automation Rule Engine - COMPLETE (Feb 2026)
- **Lead Assignment Rules:**
  - Trigger: On lead creation (when no owner explicitly set)
  - Methods: Round Robin, By Territory, By Lead Source, Specific User
  - Configurable assignee pool per rule
  - Priority-based rule evaluation (lower = higher priority)
  - Round-robin index tracking for fair distribution
  - Background task execution via FastAPI BackgroundTasks
  - Auto-logs assignment to timeline with rule details
- **Stale Opportunity Reminders:**
  - Daily check scheduled at 8:00 AM EST via APScheduler
  - Configurable days threshold (default: 14 days)
  - Filter by applicable stages (or all open stages)
  - In-app notifications to opportunity owner
  - Can manually trigger via API
  - Logs stale reminder events to timeline
- **Enhanced Chatter Events:**
  - Record lifecycle: record_created, record_deleted
  - High-signal field changes: amount_changed, close_date_changed, owner_changed
  - Opportunity lifecycle: opportunity_won, opportunity_lost
  - Automation events: auto_assigned, stale_reminder
  - System events are read-only (no delete/edit)
- **API Endpoints:**
  - `GET/POST /api/automation/lead-assignment-rules` - CRUD for lead assignment rules
  - `PUT/DELETE /api/automation/lead-assignment-rules/{rule_id}` - Update/Delete rules
  - `GET/POST /api/automation/stale-opportunity-rules` - CRUD for stale rules
  - `PUT/DELETE /api/automation/stale-opportunity-rules/{rule_id}` - Update/Delete rules
  - `POST /api/automation/run-stale-check` - Manual trigger (admin only)
  - `POST /api/automation/test-assignment/{lead_id}` - Test assignment dry run
- **Database Collections:**
  - `automation_lead_assignment` - Lead assignment rules with round-robin tracking
  - `automation_stale_opportunity` - Stale opportunity rules with last_run_at
- **Frontend Integration:**
  - Automation tab in CRM Setup page
  - Lead Assignment Rules section with Add/Edit/Delete
  - Stale Opportunity Rules section with Add/Edit/Delete
  - Manual Triggers section with Run Stale Check button
  - Full dialog forms for rule configuration
- **Testing:** 100% pass rate (18 backend tests, all UI flows verified)

### 17. Individual Order Pack & Ship - COMPLETE (Feb 2026)
- **Feature:** Move orders from Finish to Pack & Ship independently within batches
- **Use Case:** GB Decor, Ginger Blue Decor, GB Home, Ginger Blue Home, and Etsy stores
  - Orders are printed, mounted, and finished as a batch
  - Individual orders can be packed and shipped independently
  - Batch timing continues for reporting purposes
- **GB Home Special Handling:**
  - GB Home batches use individual order workflow
  - Can move orders to Pack & Ship at **any stage** (not just Finish)
  - "Shipped" button appears for completed orders
- **API Endpoints:**
  - `POST /api/fulfillment-batches/{batch_id}/orders/move-to-pack-ship` - Move selected orders
  - `POST /api/fulfillment-batches/{batch_id}/orders/{order_id}/mark-shipped` - Mark as shipped
  - `GET /api/fulfillment-batches/{batch_id}/pack-ship-orders` - Get orders at Pack & Ship
  - `GET /api/fulfillment-batches/{batch_id}/orders-by-stage` - Orders grouped by stage
- **Frontend Features:**
  - Blue "Pack & Ship" badge for orders moved independently
  - Green "Shipped" badge for completed orders
  - Multi-select orders with "Ship X" button
  - Visual indicator for batches with split orders
- **Data Fields Added:**
  - `individual_order_status` - Tracks each order's independent stage
  - `has_split_orders` - Flag when batch has orders at different stages
  - `individual_stage_override` - Order-level flag for independent movement
- **Auto-Archive on All Shipped:**
  - When all orders in a batch are marked as shipped, batch automatically moves to "archived" status
  - Toast notification: "All orders shipped! Batch has been archived."
  - Detail view closes and list refreshes automatically
- **Shipping Progress on Batch Cards:**
  - Shows "X left" with truck icon for remaining orders to ship
  - Shows "All shipped" with green truck icon when complete
  - Progress tracked via `shipped_count`, `total_orders`, `orders_remaining` fields

## Pending Verification from User
1. POS Order Creation fix (ObjectId serialization) - applied, needs user test
2. Frame Production KPIs calculation fix (timezone) - applied, needs user test

### 18. Order Search Box in Fulfillment - COMPLETE (Feb 2026)
- **Feature:** Search box to find orders and their batch/stage in Order Fulfillment page
- **Location:** Below the stage tabs (Print List, Mount List, Finish, Pack and Ship)
- **Search Capabilities:**
  - Search by order number (partial match)
  - Search by order name (partial match)
  - Search by customer name (partial match)
  - Case-insensitive regex matching
- **Results Dropdown:**
  - Shows matching orders with order number, name, customer
  - Displays batch name and current stage with color indicator
  - Shows "Shipped" badge for shipped orders
  - Keyboard navigation (Up/Down arrows, Enter to select, Escape to close)
- **On Order Selection:**
  - Opens the batch containing the order
  - Switches to the correct stage tab
  - Toast notification: "Found order in batch X at Y Stage"
  - Handles orders in both active and archived batches
- **API Endpoint:**
  - `GET /api/fulfillment-batches/search-orders?q={query}&limit={limit}`
  - Returns order with batch info, current stage, and shipped status

### 19. Batch/Stage Column on Orders Page - COMPLETE (Feb 2026)
- **Feature:** Added Batch/Stage column to Orders page table
- **Column Shows:**
  - Batch name (truncated to fit)
  - Current stage badge with stage name
  - "—" for orders not in a fulfillment batch
- **Click Action:**
  - Navigates to `/fulfillment?batch={id}&stage={stageId}`
  - Order Fulfillment page reads URL params and opens the batch
  - Switches to the correct stage tab
  - Shows toast: "Navigated to batch X"
- **Backend Enhancement:**
  - Orders API now returns `fulfillment_batch_id`, `fulfillment_batch_name`, `fulfillment_stage_id`, `fulfillment_stage_name`
  - Enriches order data with batch info from fulfillment_batches collection

### 20. Archive Button on Batch Summary Cards - COMPLETE (Feb 2026)
- **Feature:** Archive button added to fulfillment batch summary cards
- **Location:** Next to the existing Undo button on each batch card
- **Visibility:** Admin/Manager only, not shown for history or completed batches
- **Archive Dialog:**
  - Shows batch name, order count, current stage, shipped count
  - Confirmation required before archiving
  - Orange "Archive Batch" button
- **Archive Action:**
  - Sets batch status to "archived"
  - Stops any running timers and accumulates time
  - Records archived_by user and timestamp
  - Logs archive action to fulfillment_logs
  - Moves batch to History tab
- **API Endpoint:**
  - `POST /api/fulfillment-batches/{batch_id}/archive`
  - Admin/Manager permission required


### 21. Task Assignment to Management - COMPLETE (Feb 2026)
- **Feature:** Allow workers to assign tasks to admin/managers
- **Backend Changes:**
  - New endpoint: `GET /api/users/managers-admins` - Returns users with admin/manager roles
  - Accessible by all authenticated users (including workers)
  - Returns: user_id, name, email, role, picture
- **Frontend Changes:**
  - Updated "Assign To" dropdown in Tasks page to show "Management" section
  - Workers see only management staff in dropdown
  - Admins/Managers see both Management and All Team Members sections
  - Helper text for workers: "Assign tasks to management for review or action"
  - TaskCreateButton component also updated with same functionality
- **Notifications:**
  - In-app notification sent to assigned user when task is created
- **Task Status Tracking:**
  - Status flow: Pending → In Progress → Completed
  - Status can be changed via Kanban drag-drop or detail dialog

### Bug Fixes (Feb 2026)
- **Order Time & Cost Report Fix:**
  - Fixed KeyError 'total_minutes' in `/api/fulfillment/reports/order-kpis` endpoint
  - Issue: Code was accessing `user_data["total_minutes"]` but data was stored as `user_data["minutes"]`
  - Report now correctly displays order-level time tracking, labor costs, and cost per frame
  - Added `order_total` and `cost_percent` fields to show labor cost as percentage of order value
- **Batch Cost Breakdown Fix:**
  - Corrected aggregation logic to map fulfillment time logs to production batches via shared `order_id`
  - Now properly calculates combined production + fulfillment costs per batch
- **Stage Analysis Report Fix:**
  - Fixed divide-by-zero error when `items_processed` is zero
  - Added conditional check before calculating `avg_minutes_per_item`
- **Stage KPIs Date Filtering Fix:**
  - Stage KPIs now correctly filter by selected date range
  - Added `start_date` and `end_date` parameters to `/api/v1/stats/user-kpis-by-stage`
- **Hours by User Report Fix:**
  - Fixed timezone bug that displayed wrong day of week
  - Added custom date range filter with date picker
  - Properly converts UTC to EST for date grouping

### Regression Testing (Feb 2026)
- Comprehensive regression test completed: 100% backend (19/19 tests), 100% frontend
- All report tabs verified working: Overview, Batch Reports, Stage KPIs, Quality & Costs, User Performance, Stage Analysis, Productivity
- Test report: `/app/test_reports/iteration_21.json`

