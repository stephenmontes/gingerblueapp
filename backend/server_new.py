from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware
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
    reports_router
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Create the main app
app = FastAPI(title="ShopFactory API", version="1.0.0")

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

# Root endpoint
@api_router.get("/")
async def root():
    return {"message": "ShopFactory API", "status": "running"}

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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
