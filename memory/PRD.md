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
8. Time tracker per batch with user assignment and performance metrics

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
- `POST /api/auth/session` - Create user session
- `GET /api/auth/me` - Get current user
- `POST /api/batches` - Create production batch
- `GET /api/batches` - List batches
- `GET /api/batches/{id}` - Get batch details
- `GET /api/batches/{id}/stage-summary` - Get batch stage summary
- `POST /api/batches/{id}/start-timer` - Start batch timer
- `POST /api/batches/{id}/stop-timer` - Stop batch timer
- `PUT /api/items/{id}/update` - Update item quantity
- `PUT /api/items/{id}/move-stage` - Move item to next stage
- `GET /api/orders` - Get orders (filter: unbatched=true)
- `POST /api/stores/{id}/sync` - Manual store sync
- `GET /api/reports/export` - Export reports (format=csv|pdf)

### Database Schema
- **users:** `{_id, email, name, picture, role}`
- **stores:** `{_id, user_id, platform, store_url, api_key, access_token}`
- **orders:** `{_id, external_id, store_id, customer_name, items, total, status, batch_id}`
- **production_stages:** `{_id, name, order, color}`
- **batches:** `{_id, name, user_id, status, order_ids, time_started, time_completed, assigned_user_id}`
- **time_logs:** `{_id, user_id, batch_id, stage_id, started_at, ended_at}`

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

### In Progress
- 🔄 Frame Production feature end-to-end testing
- 🔄 Item grouping by SKU (color/size parsing)
- 🔄 Timer functionality verification

## Prioritized Backlog

### P0 - Critical
- [ ] End-to-end test Frame Production workflow
- [ ] Verify batch creation from Orders page
- [ ] Test timer start/stop functionality

### P1 - Important
- [ ] Fix ESLint warning in Orders.jsx
- [ ] User performance metrics (avg items/stage)
- [ ] Batch completion status tracking

### P2 - Nice to Have
- [ ] Real store data testing (requires API credentials)
- [ ] Additional reporting metrics
- [ ] UI/UX refinements

## Known Issues
- ESLint warning in `Orders.jsx` - missing useEffect dependency
- Store integration requires user to provide API credentials

## 3rd Party Integrations
- **Emergent Google Auth** - User login
- **Shopify API** - Order syncing (requires user API key)
- **Etsy API** - Order syncing (requires user API key)
