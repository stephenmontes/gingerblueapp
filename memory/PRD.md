# ShopFactory - Manufacturing & Fulfillment App PRD

## Original Problem Statement
Build a manufacturing and fulfillment app for Shopify websites with:
- Manufacturing workflow with detailed production stages
- Time tracking, reporting, avg products per hour
- Per-user tracking for moving parts through production stages
- Multi-store support: 2 Shopify stores + 1 Etsy store
- Modern dark theme
- Google login with company email

## Architecture

### Tech Stack
- **Frontend**: React 19 + Tailwind CSS + shadcn/ui
- **Backend**: FastAPI (Python)
- **Database**: MongoDB
- **Authentication**: Emergent Google OAuth

### Key Components
- `/app/backend/server.py` - Main API server with all endpoints
- `/app/frontend/src/App.js` - Main router with auth handling
- `/app/frontend/src/pages/` - Page components (Dashboard, Orders, Production, Team, Reports, Settings)
- `/app/frontend/src/components/Layout.jsx` - Sidebar navigation layout

## User Personas

1. **Admin** - Full access, can manage stores, users, seed demo data
2. **Manager** - Can add stores, view all reports
3. **Worker** - Can move orders through production stages, tracked time

## Core Requirements (Static)

### Authentication
- [x] Google OAuth via Emergent Auth
- [x] First user becomes admin automatically
- [x] Role-based access (admin/manager/worker)
- [x] Session persistence with cookies

### Multi-Store Support
- [x] Connect multiple Shopify stores
- [x] Connect Etsy store
- [x] Store management in Settings
- [x] Platform badges (Shopify/Etsy)

### Production Workflow
- [x] 6 default stages: New Orders → Cutting → Assembly → Quality Check → Packing → Ready to Ship
- [x] Kanban board view
- [x] Move orders between stages with button click
- [x] Time logging when moving orders

### Reporting
- [x] Dashboard KPIs (total orders, pending, in production, completed)
- [x] Orders by store pie chart
- [x] Daily production bar chart
- [x] User performance stats
- [x] Stage analysis

## What's Been Implemented (Feb 1, 2026)

### Backend API Endpoints
- `POST /api/auth/session` - Exchange session_id for session_token
- `GET /api/auth/me` - Get current user
- `POST /api/auth/logout` - Logout user
- `GET /api/users` - List all users
- `PUT /api/users/{id}/role` - Update user role
- `GET /api/stores` - List stores
- `POST /api/stores` - Add store
- `DELETE /api/stores/{id}` - Remove store
- `GET /api/stages` - List production stages
- `GET /api/orders` - List orders with filters
- `POST /api/orders` - Create order
- `PUT /api/orders/{id}/stage` - Move order to new stage
- `GET /api/time-logs` - Get time logs
- `GET /api/stats/dashboard` - Dashboard statistics
- `GET /api/stats/users` - User performance stats
- `GET /api/stats/stages` - Stage statistics
- `POST /api/demo/seed` - Seed demo data

### Frontend Pages
- Login (Google OAuth)
- Dashboard (KPIs, charts, quick actions)
- Orders (table with search/filters)
- Production (Kanban board)
- Team (member list, role management)
- Reports (charts, tabs for different views)
- Settings (stores, stages)

### Design
- Modern dark theme with "Tactical Industrial" aesthetic
- Chivo + Manrope + JetBrains Mono fonts
- Color palette: #09090B background, #3B82F6 primary, #22C55E secondary

## Prioritized Backlog

### P0 (Critical - Not implemented)
- Shopify API integration for order syncing
- Etsy API integration for order syncing

### P1 (Important)
- Real-time order sync webhooks
- Email notifications for order status changes
- Export reports to CSV/PDF

### P2 (Nice to have)
- Custom production stage creation
- Drag-and-drop Kanban cards
- Dark/light theme toggle
- Mobile responsive improvements

## Next Tasks

1. **Shopify Integration** - Add real API key input and sync functionality
2. **Etsy Integration** - Add OAuth flow for Etsy API
3. **Webhooks** - Set up real-time order syncing
4. **Time Reports** - Add date range filters to reports
5. **Notifications** - Email/push notifications for critical events
