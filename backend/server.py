"""
ShopFactory Backend - Refactored Modular Structure
This file serves as the entry point that supervisor expects (server:app)
All logic is organized in separate modules under routers/, models/, services/
"""

from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging

# Import all routers
from routers import (
    auth_router,
    users_router,
    stores_router,
    stages_router,
    timers_router,
    batches_router,
    items_router,
    orders_router,
    inventory_router,
    reports_router,
    exports_router,
    fulfillment_router,
    fulfillment_timers_router,
    products_router,
    webhooks_router
)
from routers.shipstation import router as shipstation_router
from routers.calendar import router as calendar_router
from routers.customers import router as customers_router
from routers.tasks import router as tasks_router
from routers.notifications import router as notifications_router
from routers.fulfillment_batches import router as fulfillment_batches_router
from routers.production_timers import router as production_timers_router
from routers.timer_recovery import router as timer_recovery_router
from database import create_indexes
from services.scheduler import start_scheduler, stop_scheduler

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events"""
    # Startup: Create database indexes
    await create_indexes()
    # Start the scheduler for daily order sync
    start_scheduler()
    logger.info("Scheduler started for daily 7 AM EST order sync")
    yield
    # Shutdown: cleanup
    stop_scheduler()
    logger.info("Scheduler stopped")

# Create the main app with lifespan
app = FastAPI(title="ShopFactory API", version="2.0.0", lifespan=lifespan)

# Create main API router with /api prefix
api_router = APIRouter(prefix="/api")

# Include all routers
api_router.include_router(auth_router)
api_router.include_router(users_router)
api_router.include_router(stores_router)
api_router.include_router(stages_router)
api_router.include_router(timers_router)
api_router.include_router(batches_router)
api_router.include_router(items_router)
api_router.include_router(orders_router)
api_router.include_router(inventory_router)
api_router.include_router(reports_router)
api_router.include_router(exports_router)
api_router.include_router(fulfillment_router)
api_router.include_router(fulfillment_timers_router)
api_router.include_router(products_router)
api_router.include_router(webhooks_router)
api_router.include_router(shipstation_router, prefix="/shipstation", tags=["shipstation"])
api_router.include_router(calendar_router)
api_router.include_router(customers_router)
api_router.include_router(tasks_router)
api_router.include_router(notifications_router)
api_router.include_router(fulfillment_batches_router)
api_router.include_router(production_timers_router)

# Root endpoint
@api_router.get("/")
async def root():
    return {"message": "ShopFactory API", "status": "running", "version": "2.0.0"}

# Include the main router
app.include_router(api_router)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
