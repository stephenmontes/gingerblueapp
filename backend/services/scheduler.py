"""
Scheduled tasks for order synchronization
Runs daily at 7 AM EST for all stores
"""
import logging
import asyncio
from datetime import datetime, timezone
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger(__name__)

# Global scheduler instance
scheduler = AsyncIOScheduler()


async def sync_all_stores():
    """Sync orders from all active stores"""
    from database import db
    from services.shopify_service import sync_orders_from_store
    from services.etsy_service import sync_orders_from_etsy_store
    from services.shipstation_sync import sync_orders_from_shipstation
    
    logger.info("Starting scheduled sync for all stores...")
    
    # Get all active stores
    stores = await db.stores.find(
        {"is_active": {"$ne": False}},
        {"_id": 0}
    ).to_list(100)
    
    results = []
    
    for store in stores:
        store_id = store["store_id"]
        store_name = store.get("name", store_id)
        platform = store.get("platform")
        
        try:
            logger.info(f"Syncing store: {store_name} ({platform})")
            
            if platform == "shopify":
                result = await sync_orders_from_store(store_id, status="any", days_back=7)
            elif platform == "etsy":
                result = await sync_orders_from_etsy_store(store_id, days_back=7)
            elif platform == "shipstation":
                shipstation_store_id = store.get("shipstation_store_id")
                if shipstation_store_id:
                    result = await sync_orders_from_shipstation(store_id=shipstation_store_id, days_back=7)
                else:
                    result = {"success": False, "error": "No ShipStation store ID configured"}
            else:
                result = {"success": False, "error": f"Unknown platform: {platform}"}
            
            results.append({
                "store_id": store_id,
                "store_name": store_name,
                "platform": platform,
                "result": result
            })
            
            # Update last_order_sync timestamp
            await db.stores.update_one(
                {"store_id": store_id},
                {"$set": {"last_order_sync": datetime.now(timezone.utc).isoformat()}}
            )
            
            logger.info(f"Sync complete for {store_name}: {result}")
            
        except Exception as e:
            logger.error(f"Error syncing store {store_name}: {e}")
            results.append({
                "store_id": store_id,
                "store_name": store_name,
                "platform": platform,
                "result": {"success": False, "error": str(e)}
            })
    
    # Log sync summary
    await db.scheduled_sync_logs.insert_one({
        "sync_type": "daily_order_sync",
        "triggered_at": datetime.now(timezone.utc).isoformat(),
        "stores_synced": len(results),
        "results": results
    })
    
    logger.info(f"Scheduled sync complete. Synced {len(results)} stores.")
    return results


def start_scheduler():
    """Start the APScheduler with daily sync job at 7 AM EST"""
    # 7 AM EST = 12:00 UTC (EST is UTC-5)
    # Note: During daylight saving time (EDT), it would be 11:00 UTC
    # Using America/New_York timezone to handle DST automatically
    
    scheduler.add_job(
        sync_all_stores,
        CronTrigger(hour=7, minute=0, timezone="America/New_York"),
        id="daily_order_sync",
        name="Daily Order Sync (7 AM EST)",
        replace_existing=True
    )
    
    scheduler.start()
    logger.info("Scheduler started - Daily order sync scheduled for 7:00 AM EST")


def stop_scheduler():
    """Stop the scheduler"""
    if scheduler.running:
        scheduler.shutdown()
        logger.info("Scheduler stopped")


def get_scheduler_status():
    """Get status of scheduled jobs"""
    jobs = []
    for job in scheduler.get_jobs():
        jobs.append({
            "id": job.id,
            "name": job.name,
            "next_run": job.next_run_time.isoformat() if job.next_run_time else None,
            "trigger": str(job.trigger)
        })
    return {
        "running": scheduler.running,
        "jobs": jobs
    }
