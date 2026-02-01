from routers.auth import router as auth_router
from routers.users import router as users_router
from routers.stores import router as stores_router
from routers.stages import router as stages_router
from routers.timers import router as timers_router
from routers.batches import router as batches_router
from routers.items import router as items_router
from routers.orders import router as orders_router
from routers.inventory import router as inventory_router
from routers.reports import router as reports_router

__all__ = [
    "auth_router",
    "users_router", 
    "stores_router",
    "stages_router",
    "timers_router",
    "batches_router",
    "items_router",
    "orders_router",
    "inventory_router",
    "reports_router"
]
