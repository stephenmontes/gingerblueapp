# ShopFactory - Manufacturing & Fulfillment Hub

## Original Problem Statement
Build a manufacturing and fulfillment app for Shopify websites with:
- Manufacturing workflow tracking with time tracking, reporting, average products per hour
- Tracking per user for moving parts through production stages
- Connect to 2 Shopify stores and 1 Etsy store for live order syncing
- Implement webhooks for real-time updates
- Users must log in with their company Google email
- Modern dark theme UI

### Production Queue V2 ("Frame Production") Requirements:
1. Rename "Production Queue" to "Frame Production" with sub-tabs for stages
2. Allow selecting multiple orders from the "Orders" tab to create a production "batch"
3. Display a consolidated list of all items from the batched orders
4. Group items by color and size (derived from SKU)
5. Show subtotals for each identical item group
6. QTY to cut and QTY completed input boxes per item group
7. Allow individual item groups to be moved to the next production stage
8. **Time tracker per user, per stage** - Each user works on one stage and hands off to the next user
9. Performance metrics: avg items per hour per user per stage

## Architecture

### Tech Stack
- **Backend:** FastAPI, Pydantic, MongoDB (motor), JWT sessions
- **Frontend:** React, shadcn/ui, Tailwind CSS, sonner for toasts
- **Authentication:** Emergent-managed Google OAuth
- **Integrations:** Shopify API, Etsy API

### File Structure
```
/app/
├── backend/
│   └── server.py              # FastAPI app with all routes and models
└── frontend/
    └── src/
        ├── App.js             # Main router and auth logic
        ├── components/
        │   ├── Layout.jsx     # Sidebar navigation
        │   └── production/    # Refactored production components
        │       ├── BatchCard.jsx
        │       ├── BatchList.jsx
        │       ├── StageTabs.jsx
        │       ├── ItemRow.jsx
        │       ├── StageContent.jsx
        │       ├── BatchHeader.jsx
        │       ├── BatchDetailView.jsx
        │       ├── StageTimer.jsx
        │       └── index.js
        └── pages/
            ├── Dashboard.jsx
            ├── Login.jsx
            ├── Orders.jsx
            ├── Production.jsx
            ├── Reports.jsx
            ├── Settings.jsx
            └── Team.jsx
```

### Key API Endpoints

**Authentication:**
- `POST /api/auth/session` - Create user session
- `GET /api/auth/me` - Get current user

**Batches:**
- `POST /api/batches` - Create production batch from orders
- `GET /api/batches` - List all batches
- `GET /api/batches/{id}` - Get batch details
- `GET /api/batches/{id}/stage-summary` - Get items grouped by stage

**Items:**
- `PUT /api/items/{id}/update` - Update item qty_completed
- `PUT /api/items/{id}/move-stage` - Move item to next stage (increments user's items_processed)

**Stage Timers (Per-User, Per-Stage):**
- `POST /api/stages/{stage_id}/start-timer` - Start user's timer for a stage
- `POST /api/stages/{stage_id}/stop-timer` - Stop timer, records duration & items
- `GET /api/stages/{stage_id}/active-timer` - Check if user has active timer
- `GET /api/user/active-timers` - Get all user's active timers
- `GET /api/user/time-stats` - Get user's performance stats (avg items/hour per stage)
- `GET /api/stages/active-workers` - See who is working on which stage

**Stores:**
- `POST /api/stores/{id}/sync` - Manual store sync
- `POST /api/webhooks/shopify` - Shopify webhook
- `POST /api/webhooks/etsy` - Etsy webhook

**Reports:**
- `GET /api/reports/export` - Export reports (format=csv|pdf)

### Database Schema

**users:**
```json
{ "user_id", "email", "name", "picture", "role" }
```

**stores:**
```json
{ "store_id", "name", "platform", "api_key", "shop_url", "access_token" }
```

**orders:**
```json
{ "order_id", "external_id", "store_id", "customer_name", "items", "total", "status", "batch_id" }
```

**production_stages:**
```json
{ "stage_id", "name", "order", "color" }
```
Default stages: New Orders → Cutting → Assembly → Quality Check → Packing → Ready to Ship

**batches:**
```json
{ "batch_id", "name", "order_ids", "current_stage_id", "status", "total_items", "items_completed" }
```

**production_items:**
```json
{ "item_id", "batch_id", "order_id", "sku", "name", "color", "size", "qty_required", "qty_completed", "current_stage_id", "status" }
```

**time_logs (Per-User, Per-Stage):**
```json
{
  "log_id", "user_id", "user_name", "stage_id", "stage_name",
  "started_at", "completed_at", "duration_minutes", "items_processed",
  "action" // started, stopped
}
```

## What's Been Implemented

### Completed (Feb 2025)
- ✅ Full-stack app with Dashboard, Orders, Team, Reports, Settings pages
- ✅ Google OAuth authentication (Emergent-managed)
- ✅ Dark theme UI with modern design
- ✅ Shopify/Etsy store integration (API keys, webhooks)
- ✅ Manual order sync from stores
- ✅ CSV/PDF export for reports
- ✅ Frame Production page structure with batch management
- ✅ **Fixed critical build error** - Refactored Production.jsx into smaller components
- ✅ **Per-user, per-stage time tracking** - Each user tracks their own time on their assigned stage

### In Progress
- 🔄 End-to-end testing of timer flow
- 🔄 User performance stats display

## Prioritized Backlog

### P0 - Critical
- [ ] End-to-end test: Create batch → Start timer → Move items → Stop timer
- [ ] Verify items_processed increments correctly
- [ ] Test with multiple users on different stages

### P1 - Important
- [ ] Display user time stats on Dashboard or Team page
- [ ] Show active workers per stage in Production view
- [ ] Fix ESLint warnings

### P2 - Nice to Have
- [ ] Real store data testing (requires API credentials)
- [ ] Historical performance reports
- [ ] Stage assignment preferences per user

## Known Issues
- ESLint warnings in `Orders.jsx` and `BatchHeader.jsx` - missing useEffect dependencies
- Store integration requires user to provide API credentials

## 3rd Party Integrations
- **Emergent Google Auth** - User login
- **Shopify API** - Order syncing (requires user API key)
- **Etsy API** - Order syncing (requires user API key)
