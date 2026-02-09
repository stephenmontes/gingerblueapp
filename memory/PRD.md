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

