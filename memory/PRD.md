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
│   └── inventory.py   # InventoryItem, InventoryCreate
├── routers/
│   ├── auth.py        # /api/auth/* - login, logout, session
│   ├── users.py       # /api/users/*
│   ├── stores.py      # /api/stores/*
│   ├── stages.py      # /api/stages/*
│   ├── timers.py      # Timer start/stop/pause/resume
│   ├── batches.py     # /api/batches/* - create, stats, items
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
├── components/
│   ├── Layout.jsx
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

### Completed (Feb 2025)
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
  - Items List view for Print List, Mount List, and Finish stages
  - Items sorted by SKU: 2nd group (color) → 3rd group (number) → 4th group (size)
  - Identical items grouped with subtotals
  - Expandable rows showing order breakdown
  - Print-friendly layout with grand total

## Prioritized Backlog

### P0 - Critical
- [ ] End-to-end test full production workflow
- [ ] Test batch stats calculations

### P1 - Important
- [ ] Rejection trends report over time
- [ ] Export batch stats to CSV/PDF

### P2 - Nice to Have
- [ ] Real store data testing
- [ ] Auto-deduct inventory on production start

## 3rd Party Integrations
- **Emergent Google Auth** - User login
- **Shopify API** - Order syncing
- **Etsy API** - Order syncing
