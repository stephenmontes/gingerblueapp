# ShopFactory - Manufacturing & Fulfillment Hub

## Original Problem Statement
Build a manufacturing and fulfillment app for Shopify websites with:
- Manufacturing workflow tracking with time tracking, reporting, average products per hour
- Tracking per user for moving parts through production stages
- Connect to 2 Shopify stores and 1 Etsy store for live order syncing
- Implement webhooks for real-time updates
- Users must log in with their company Google email
- Modern dark theme UI

### Production Workflow Requirements:
1. **Frame Production** page with sub-tabs for stages
2. Select multiple orders to create production "batches"
3. Display consolidated list of items grouped by color/size (from SKU)
4. QTY to cut and QTY completed inputs per item
5. Move items through stages: New Orders → Cutting → Assembly → Sand → Paint → Quality Check
6. **Per-user, per-stage time tracking** - Each user works on one stage
7. **Quality Check stage** - Track rejected frames, add good frames to inventory
8. **Batch KPIs** - Combined hours, labor cost ($22/hr), avg cost per frame, rejection rate

## Architecture

### Tech Stack
- **Backend:** FastAPI, Pydantic, MongoDB (motor), JWT sessions
- **Frontend:** React, shadcn/ui, Tailwind CSS, sonner for toasts
- **Authentication:** Emergent-managed Google OAuth
- **Integrations:** Shopify API, Etsy API

### Backend Structure (Refactored Feb 2026)
```
/app/backend/
├── server.py          # Entry point (65 lines) - imports all routers
├── config.py          # Environment configuration
├── database.py        # MongoDB connection
├── dependencies.py    # Auth helpers (get_current_user)
├── models/
│   ├── user.py        # User, UserSession
│   ├── store.py       # Store, StoreCreate
│   ├── order.py       # Order, OrderCreate
│   ├── production.py  # ProductionStage, ProductionBatch, ProductionItem
│   ├── time_log.py    # TimeLog
│   ├── inventory.py   # InventoryItem, InventoryCreate
│   └── product.py     # Product, ProductVariant, ProductImage (Shopify sync)
├── routers/
│   ├── auth.py        # /api/auth/* - login, logout, session
│   ├── users.py       # /api/users/*
│   ├── stores.py      # /api/stores/*
│   ├── stages.py      # /api/stages/*
│   ├── timers.py      # Timer start/stop/pause/resume
│   ├── batches.py     # /api/batches/* - create, stats, items
│   ├── products.py    # /api/products/* - sync, list, search (NEW)
├── services/
│   └── shopify_service.py  # Shopify API integration (NEW)
│   ├── items.py       # /api/items/* - update, move, add to inventory
│   ├── orders.py      # /api/orders/*
│   ├── inventory.py   # /api/inventory/* - CRUD, adjust, reject
│   ├── reports.py     # /api/stats/*, /api/time-logs
│   └── exports.py     # /api/export/* - CSV/PDF exports
└── services/
    └── sku_parser.py  # SKU parsing utilities
```

### Frontend Structure
```
/app/frontend/src/
├── App.js
├── utils/
│   └── api.js           # Dynamic backend URL configuration (NEW Feb 2026)
├── components/
│   ├── Layout.jsx
│   ├── ThemeToggle.jsx  # Light/Dark theme toggle (NEW Feb 2026)
│   ├── production/   # Production page components
│   │   ├── BatchCard.jsx, BatchList.jsx, StageTabs.jsx
│   │   ├── ItemRow.jsx, StageContent.jsx, BatchHeader.jsx
│   │   ├── BatchDetailView.jsx, BatchStats.jsx, StageTimer.jsx
│   │   └── index.js
│   ├── reports/      # Reports page components
│   │   ├── KpiCards.jsx, QualityTab.jsx, QualityMetrics.jsx
│   │   ├── CostAnalysis.jsx, BatchPerformance.jsx
│   │   ├── UsersTab.jsx, StagesTab.jsx, OverviewTab.jsx
│   │   └── index.js
│   ├── inventory/    # Inventory page components (REFACTORED Feb 2026)
│   │   ├── InventoryStats.jsx    # Stats cards (53 lines)
│   │   ├── InventoryForm.jsx     # Add/Edit form (92 lines)
│   │   ├── InventoryRow.jsx      # Table row (150 lines)
│   │   ├── InventoryTable.jsx    # Table + search (89 lines)
│   │   ├── AdjustmentDialog.jsx  # Qty adjustment (158 lines)
│   │   ├── RejectionDialog.jsx   # Reject dialog (147 lines)
│   │   └── index.js
│   └── ui/           # Shadcn UI components
├── contexts/
│   └── ThemeContext.jsx  # Theme provider (NEW Feb 2026)
└── pages/
    ├── Dashboard.jsx
    ├── Login.jsx
    ├── Orders.jsx
    ├── Production.jsx
    ├── FrameInventory.jsx  # (289 lines - refactored from 838)
    ├── Reports.jsx
    ├── Settings.jsx
    └── Team.jsx
```

### Production Stages (in order)
1. New Orders (stage_new)
2. Cutting (stage_cutting)
3. Assembly (stage_assembly)
4. Sand (stage_qc)
5. Paint (stage_packing)
6. Quality Check (stage_ready) - Final stage with inventory transfer

### Key API Endpoints

**Stage Timers (Per-User):**
- `POST /api/stages/{stage_id}/start-timer`
- `POST /api/stages/{stage_id}/stop-timer`
- `GET /api/stages/{stage_id}/active-timer`
- `GET /api/user/time-stats`

**Production Items:**
- `PUT /api/items/{id}/update?qty_completed=X`
- `PUT /api/items/{id}/reject?qty_rejected=X`
- `PUT /api/items/{id}/move-stage`
- `POST /api/items/{id}/add-to-inventory`

**Batch Stats:**
- `GET /api/batches/{id}/stats` - Returns:
  - Combined hours (all users)
  - Labor cost (hours × $22)
  - Avg cost per frame
  - Rejection rate & count
  - Worker breakdown

**Inventory:**
- `GET /api/inventory`
- `POST /api/inventory`
- `PUT /api/inventory/{id}`
- `DELETE /api/inventory/{id}`

### Database Schema

**production_items:**
```json
{
  "item_id", "batch_id", "order_id", "sku", "name", "color", "size",
  "qty_required", "qty_completed", "qty_rejected",
  "current_stage_id", "status", "added_to_inventory"
}
```

**time_logs:**
```json
{
  "log_id", "user_id", "user_name", "stage_id", "stage_name",
  "started_at", "completed_at", "duration_minutes", "items_processed"
}
```

**inventory:**
```json
{
  "item_id", "sku", "name", "color", "size",
  "quantity", "min_stock", "location"
}
```

## What's Been Implemented

### Completed (Feb 2025 - Feb 2026)
- ✅ Full-stack app with all pages
- ✅ Google OAuth authentication
- ✅ Dark theme UI
- ✅ Shopify/Etsy store integration
- ✅ CSV/PDF export for reports
- ✅ Frame Production with batch management
- ✅ Per-user, per-stage time tracking
- ✅ **Qty can exceed required** (for cutting extras)
- ✅ **Stage names: Sand, Paint, Quality Check**
- ✅ **Frame Inventory page** with full CRUD
- ✅ **Rejected frames tracking** in Quality Check
- ✅ **Add to Frame Inventory button** (auto-creates inventory)
- ✅ **Batch Stats KPIs** - Combined hours, labor cost, avg cost/frame, rejection rate
- ✅ **FrameInventory.jsx refactored** (Feb 2026) - Split 838-line file into 7 components to prevent RangeError build errors
- ✅ **User Stage KPIs on Production page** (Feb 2026) - Shows user's personal stats (time, qty made, avg/hr) while time tracking
- ✅ **Order Fulfillment page** (Feb 2026) - New page with 5 stages: Orders, Print List, Mount List, Finish, Pack and Ship
- ✅ **Batch-Fulfillment Integration** (Feb 2026) - When batch is created, orders are automatically sent to Order Fulfillment as individual items
- ✅ **Inventory-Fulfillment Integration** (Feb 2026):
  - Auto-deduct inventory when orders move to "Pack and Ship" stage
  - Stock status badges showing in-stock, partial, or out-of-stock for each order
  - Inventory allocation tracking (which inventory items used for which order)
  - Low stock alerts banner showing orders with insufficient inventory
- ✅ **Print List Consolidated View** (Feb 2026):
  - Items sorted by SIZE (second-to-last SKU group): S → L → XL → HS → HX → XX → XXX
  - Unknown sizes sorted alphabetically
  - Size column displayed prominently with badge
- ✅ **Order Worksheet** (Feb 2026):
  - Click order number to open worksheet dialog
  - Items sorted by size (S → L → XL → HS → HX → XX → XXX)
  - Qty needed and Qty done columns for each item
  - Mark items as done checkbox
  - Progress bar showing completion status
  - "Mark All Done" button for quick completion
  - "Move to Next Stage" button enabled when all items complete
  - Save Progress button to persist worksheet state
  - Print button for physical worksheets
- ✅ **Stage Cards Popup** (Feb 2026): Click summary cards at top of Order Fulfillment to see orders in that stage in a popup
- ✅ **Batch Number in Order Fulfillment** (Feb 2026): Orders display their associated batch name/ID in the fulfillment view
- ✅ **Batch Click-Through** (Feb 2026): Clicking batch badge navigates to Frame Production with that batch auto-selected
- ✅ **Order Fulfillment Timer & KPI System** (Feb 2026):
  - Timer start/stop/pause/resume functionality per stage
  - FulfillmentTimerBanner shows active timer with live countdown
  - User KPIs displayed in banner (Time, Orders, Avg/hr)
  - Active workers badge shows who's working on each stage
  - Timer history tracking for performance analytics
  - Full API: `/api/fulfillment/stages/{id}/start-timer`, `/stop-timer`, `/pause-timer`, `/resume-timer`
  - KPI endpoints: `/api/fulfillment/stats/user-kpis`, `/api/fulfillment/stats/stage-kpis`
- ✅ **User Date Report & Daily Work Limit System** (Feb 2026):
  - Hours by User & Date report with daily/weekly/monthly period selector
  - Grouped data by date with subtotals (hours, labor cost, orders, items)
  - Individual user rows with expandable time entry details
  - Automatic highlighting of users exceeding 9-hour daily limit
  - DailyLimitWarning modal that appears when user exceeds limit
  - 15-minute auto-logout countdown if no response
  - Continue/Logout options with server-side acknowledgment tracking
  - API endpoints: `/api/fulfillment/reports/hours-by-user-date`, `/api/fulfillment/user/daily-hours-check`, `/api/fulfillment/user/acknowledge-limit-exceeded`, `/api/fulfillment/user/check-limit-acknowledged`
- ✅ **Print Order Functionality** (Feb 2026):
  - Print button in Order Worksheet dialog
  - Print option in order row dropdown menu (all stages)
  - PrintOrderDialog with professional print-friendly layout
  - Includes: order number, date, stage, customer info, shipping address
  - Items table sorted by size with checkboxes for completion tracking
  - Notes section and printed timestamp footer
  - Opens in new window for clean printing
- ✅ **Shopify Product Sync** (Feb 2026):
  - New Products page with sync controls, stats, and product table
  - Backend Shopify API integration (`/app/backend/services/shopify_service.py`)
  - Product sync endpoints: `/api/products/sync/{store_id}`, `/api/products/sync/{store_id}/test`
  - Product data model with variants, images, barcodes, SKUs
  - Enhanced SkuLink component to show product images from synced data
  - Filter by store, vendor, search by title/SKU/barcode
  - Product details modal with variants table and image gallery
  - API: `/api/products`, `/api/products/stats`, `/api/products/by-sku/{sku}`, `/api/products/image/{sku}`
- ✅ **Shopify Order Sync** (Feb 2026):
  - Auto-sync orders from Shopify stores to Order Fulfillment
  - Sync controls on Orders page with per-store sync buttons
  - "Sync All Stores" button for batch syncing
  - Order sync status cards showing last sync time and order count
  - Configurable days_back filter (default 30 days)
  - Automatic skipping of already-fulfilled orders
  - Preserves local order status/stage when updating
  - API: `/api/orders/sync/{store_id}`, `/api/orders/sync/status`
- ✅ **Etsy Order Sync** (Feb 2026):
  - Full Etsy Open API v3 integration for order syncing
  - Etsy service with OAuth 2.0 PKCE support ready
  - Receipt/transaction transformation to unified order format
  - Support for Etsy-specific fields: variations, gift messages, buyer notes
  - Same sync UI as Shopify - unified experience
  - Platform badge differentiation (green for Shopify, orange for Etsy)
  - API: Uses same `/api/orders/sync/{store_id}` endpoint
- ✅ **Shopify Product Sync** (Feb 2026):
  - Full product sync from Shopify stores via Admin REST API 2024-10
  - Syncs: products, variants, images, SKUs, barcodes, inventory quantities
  - Products page with search, filter by store/vendor/type
  - Product details modal with variants table and image gallery
  - Sync status cards showing last sync time per store
  - Product stats dashboard (total products, variants, inventory)
  - SkuLink component auto-fetches product images from synced data
  - API endpoints: `/api/products`, `/api/products/sync/{store_id}`, `/api/products/by-sku/{sku}`, `/api/products/image/{sku}`
  - Backend service: `shopify_service.py` with pagination support
- ✅ **Dropship CSV Upload** (Feb 2026):
  - Added "Dropship (CSV Upload)" platform type in Settings page
  - Updated CSV parser to support Antique Farmhouse format columns:
    - Order Number, Full Name, Address 1, City, State, Zip, Item Number, Price, Qty, Order Comments, Order Date
  - Also supports generic lowercase column names (order_number, customer_name, sku, etc.)
  - Groups multiple rows with same order number into single order with multiple items
  - Created test store "Antique Farmhouse" with dropship platform
  - Updated template download to use Antique Farmhouse format
  - API: `POST /api/orders/upload-csv/{store_id}`, `GET /api/orders/csv-template`
- ✅ **Frame-Centric Production Workflow** (Feb 2026):
  - Refactored production to aggregate items by size/color into "frames"
  - New `batch_frames` collection stores aggregated production items
  - Frames move through stages as a unit instead of individual items
  - FrameList component shows all frames filtered by current stage
  - API: `GET /api/batches/{id}/frames`, `PUT /api/batches/{id}/frames/{frame_id}`, `POST /api/batches/{id}/frames/{frame_id}/move`
- ✅ **Timer Banner Prop Fix** (Feb 2026):
  - Fixed ActiveTimerBanner to receive activeTimer as prop from Production.jsx
  - Timer banner now updates correctly when timer is stopped from another stage
- ✅ **Quality Check Rejection Tracking** (Feb 2026):
  - Added "Qty Rejected" column in Quality Check stage only
  - Orange styling for rejection input and totals
  - Backend already supports qty_rejected parameter in frame update endpoint
- ✅ **Webhook Integration for Real-Time Order Sync** (Feb 2026):
  - Shopify webhooks: orders/create, orders/updated, orders/cancelled
  - Etsy webhook support via push notifications
  - Webhook signature verification for Shopify
  - Webhook logs for debugging (`/api/webhooks/logs`)
  - Status endpoint (`/api/webhooks/status`) shows configuration
  - Endpoints: `/api/webhooks/shopify/orders/create`, `/api/webhooks/shopify/orders/updated`, `/api/webhooks/shopify/orders/cancelled`, `/api/webhooks/etsy/orders/create`
- ✅ **Export Team Stats** (Feb 2026):
  - Added "Export Stats" button to Team page
  - CSV export with period filtering (Today, Week, Month, Custom Range)
  - Includes: User Name, Email, Role, Items Processed, Hours, Sessions, Items/Hour, Stages Worked, Labor Cost
  - Totals row at bottom of export
  - Endpoint: `/api/export/team-stats?period=day|week|month` or `?start_date=&end_date=`
- ✅ **Training Mode** (Feb 2026):
  - Separate database (`test_database_training`) for training sessions
  - Activated by `TRAINING_MODE=true` in backend/.env
  - Yellow UI banner indicates when training mode is active
  - Prevents test data from appearing in production
- ✅ **Light/Dark Theme Toggle** (Feb 2026):
  - Theme toggle switch in user sidebar
  - CSS variables for theming in index.css
  - ThemeContext for managing theme state
- ✅ **Dynamic Backend URL for Custom Domains** (Feb 2026):
  - Centralized API URL utility (`/app/frontend/src/utils/api.js`)
  - Auto-detects environment: preview, custom domain, or localhost
  - Resolves "unsupported protocol error" on custom domain deployments
  - All components import from centralized utility
- ✅ **ShipStation Order Sync** (Feb 2026):
  - Added ShipStation platform support to `/api/orders/sync/{store_id}` endpoint
  - Stores with `platform: "shipstation"` can now sync orders via ShipStation API
  - Syncs orders from Antique Farmhouse (dropship) and GingerBlueCo (Etsy via ShipStation)
- ✅ **Shopify Order Webhooks** (Feb 2026):
  - Real-time order notifications from Shopify stores
  - Webhook endpoints: `/api/webhooks/shopify/orders/create`, `/updated`, `/cancelled`
  - Webhook management API: `/api/webhooks/shopify/register/{store_id}`, `/list/{store_id}`
  - UI in Settings page to register webhooks with one click
  - Supports multiple Shopify stores with individual webhook management
  - Webhooks registered for: GB Decor, GB Home → https://gingerblueapp.com

## Prioritized Backlog

### P1 - Important (Next Tasks)
- [ ] ShipStation Fulfillment UI - Get shipping rates and create labels
- [ ] Order Audit Log - Track changes to order status/details
- [ ] Bulk "Mark All Complete" per stage - One-click completion
- [ ] Auto-sync products on a schedule (webhooks or polling)

### P2 - Nice to Have
- [ ] "Undo" Functionality - Revert major actions like bulk moves
- [ ] UI State Persistence - Remember user preferences (collapsed states)
- [ ] Auto-Timer Prompt - Suggest starting timer when entering stage
- [ ] Inventory Adjustment Audit Log - Track all manual inventory changes
- [ ] Rejection trends report over time
- [ ] Export batch stats to CSV/PDF
- [ ] Real store data testing

## 3rd Party Integrations
- **Emergent Google Auth** - User login
- **Shopify API** - Order syncing
- **Etsy API** - Order syncing
