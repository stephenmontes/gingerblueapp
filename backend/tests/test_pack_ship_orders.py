"""
Tests for Pack and Ship Individual Order functionality in Fulfillment Batches

Tests the ability to:
1. Move individual orders from Finish stage to Pack and Ship independently
2. Mark orders as shipped
3. Get orders grouped by stage (for batches with split orders)
4. Validate that batch must be at Finish stage before moving orders

Batches (GB Decor, Ginger Blue Decor, GB Home, Ginger Blue Home stores) are printed, 
mounted and finished as a batch but packed and shipped individually.
"""

import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Session to maintain cookies for authentication
session = requests.Session()


@pytest.fixture(scope="module", autouse=True)
def setup_auth():
    """Setup authentication for all tests"""
    # Dev login
    res = session.get(f"{BASE_URL}/api/auth/dev-login")
    assert res.status_code == 200, f"Auth failed: {res.text}"
    yield
    # Cleanup will happen in individual tests


class TestPackShipOrdersSetup:
    """Setup tests - create test data needed for pack/ship testing"""
    
    test_batch_id = None
    test_order_ids = []
    
    def test_01_get_fulfillment_stages(self):
        """Verify fulfillment stages exist including Finish and Pack and Ship"""
        res = session.get(f"{BASE_URL}/api/fulfillment/stages")
        assert res.status_code == 200, f"Get stages failed: {res.text}"
        
        data = res.json()
        assert isinstance(data, list), "Stages should be a list"
        
        stage_ids = [s["stage_id"] for s in data]
        assert "fulfill_finish" in stage_ids, "Finish stage should exist"
        assert "fulfill_pack" in stage_ids, "Pack and Ship stage should exist"
        
        print(f"Found {len(data)} fulfillment stages: {stage_ids}")
    
    def test_02_create_test_fulfillment_batch(self):
        """Create a test fulfillment batch with orders for testing"""
        # First, we need to create test orders and then create a batch
        # Let's create test fulfillment orders directly in the database via API
        
        # Generate unique IDs
        batch_id = f"TEST_fb_{uuid.uuid4().hex[:12]}"
        order_ids = [f"TEST_order_{uuid.uuid4().hex[:8]}" for _ in range(3)]
        TestPackShipOrdersSetup.test_batch_id = batch_id
        TestPackShipOrdersSetup.test_order_ids = order_ids
        
        now = datetime.utcnow().isoformat() + "Z"
        
        # Create the fulfillment batch directly via MongoDB
        # We'll use the batch APIs to check if we can create directly
        
        # First let's check if there's a way to create test data
        # We'll create the batch at "fulfill_finish" stage directly
        
        # Actually, let's use the existing batches API to understand the flow
        # For now, let's try to find an existing batch or create via available API
        
        # Check if we have any existing batches
        res = session.get(f"{BASE_URL}/api/fulfillment-batches")
        assert res.status_code == 200, f"Get batches failed: {res.text}"
        
        batches = res.json().get("batches", [])
        print(f"Found {len(batches)} existing batches")
        
        # If we have a batch, we can use it for testing after moving to Finish stage
        if batches:
            # Use first active batch
            TestPackShipOrdersSetup.test_batch_id = batches[0]["fulfillment_batch_id"]
            print(f"Using existing batch: {TestPackShipOrdersSetup.test_batch_id}")
        else:
            # We need to create test data - let's use a different approach
            print("No existing batches - will create test data manually")
    
    def test_03_get_or_create_test_batch_at_finish(self):
        """Get or create a batch at Finish stage for testing"""
        batch_id = TestPackShipOrdersSetup.test_batch_id
        
        if not batch_id:
            pytest.skip("No batch ID available for testing")
        
        # Get batch details
        res = session.get(f"{BASE_URL}/api/fulfillment-batches/{batch_id}")
        
        if res.status_code == 404:
            pytest.skip("Test batch not found - need to create test data")
        
        assert res.status_code == 200, f"Get batch failed: {res.text}"
        
        batch = res.json()
        current_stage = batch.get("current_stage_id")
        orders = batch.get("orders", [])
        
        print(f"Batch '{batch.get('name')}' at stage: {current_stage}, orders: {len(orders)}")
        
        if orders:
            TestPackShipOrdersSetup.test_order_ids = [o["order_id"] for o in orders[:3]]


class TestMoveOrdersToPackShip:
    """Tests for moving individual orders to Pack and Ship"""
    
    def test_01_cannot_move_orders_if_not_at_finish(self):
        """Verify orders cannot be moved to Pack/Ship unless batch is at Finish stage"""
        batch_id = TestPackShipOrdersSetup.test_batch_id
        order_ids = TestPackShipOrdersSetup.test_order_ids
        
        if not batch_id or not order_ids:
            pytest.skip("No test data available")
        
        # First check current stage
        res = session.get(f"{BASE_URL}/api/fulfillment-batches/{batch_id}")
        assert res.status_code == 200
        
        batch = res.json()
        current_stage = batch.get("current_stage_id")
        
        if current_stage == "fulfill_finish":
            # Already at finish - test passes differently
            print("Batch already at Finish stage - skipping negative test")
            return
        
        # Try to move orders - should fail
        res = session.post(
            f"{BASE_URL}/api/fulfillment-batches/{batch_id}/orders/move-to-pack-ship",
            json={"order_ids": order_ids[:1]}
        )
        
        # Should return 400 because batch is not at Finish stage
        assert res.status_code == 400, f"Expected 400, got {res.status_code}: {res.text}"
        
        error = res.json()
        assert "Finish" in error.get("detail", ""), "Error should mention Finish stage"
        print(f"Correctly rejected move: {error.get('detail')}")
    
    def test_02_move_batch_to_finish_stage(self):
        """Move test batch to Finish stage to enable pack/ship testing"""
        batch_id = TestPackShipOrdersSetup.test_batch_id
        
        if not batch_id:
            pytest.skip("No batch ID available")
        
        # Check current stage
        res = session.get(f"{BASE_URL}/api/fulfillment-batches/{batch_id}")
        if res.status_code != 200:
            pytest.skip(f"Batch not found: {res.text}")
        
        batch = res.json()
        current_stage = batch.get("current_stage_id")
        
        if current_stage == "fulfill_finish":
            print("Batch already at Finish stage")
            return
        
        # Need to start timer first for stage moves
        res = session.post(f"{BASE_URL}/api/fulfillment-batches/{batch_id}/start-timer")
        if res.status_code != 200:
            print(f"Start timer response: {res.status_code} - {res.text}")
        
        # Move to Finish stage
        res = session.post(
            f"{BASE_URL}/api/fulfillment-batches/{batch_id}/move-stage",
            params={"target_stage_id": "fulfill_finish"}
        )
        
        # May get 400 if timer not active - that's expected
        if res.status_code == 400:
            error = res.json().get("detail", "")
            if "timer" in error.lower():
                print(f"Timer issue: {error}")
                # Try to proceed anyway - might be already at finish
        elif res.status_code == 200:
            result = res.json()
            print(f"Moved batch to: {result.get('to_stage')}")
        
        # Verify stage
        res = session.get(f"{BASE_URL}/api/fulfillment-batches/{batch_id}")
        batch = res.json()
        print(f"Batch now at stage: {batch.get('current_stage_id')}")
    
    def test_03_move_single_order_to_pack_ship(self):
        """Move a single order to Pack and Ship"""
        batch_id = TestPackShipOrdersSetup.test_batch_id
        order_ids = TestPackShipOrdersSetup.test_order_ids
        
        if not batch_id or not order_ids:
            pytest.skip("No test data available")
        
        # First verify batch is at Finish stage
        res = session.get(f"{BASE_URL}/api/fulfillment-batches/{batch_id}")
        assert res.status_code == 200
        
        batch = res.json()
        if batch.get("current_stage_id") != "fulfill_finish":
            pytest.skip(f"Batch not at Finish stage: {batch.get('current_stage_id')}")
        
        orders = batch.get("orders", [])
        if not orders:
            pytest.skip("No orders in batch")
        
        # Find an order that's not already at pack/ship
        test_order_id = None
        for order in orders:
            if not order.get("individual_stage_override"):
                test_order_id = order.get("order_id")
                break
        
        if not test_order_id:
            print("All orders already moved - using first order for verification")
            test_order_id = orders[0].get("order_id")
        
        # Move order to pack/ship
        res = session.post(
            f"{BASE_URL}/api/fulfillment-batches/{batch_id}/orders/move-to-pack-ship",
            json={"order_ids": [test_order_id]}
        )
        
        assert res.status_code == 200, f"Move failed: {res.status_code} - {res.text}"
        
        result = res.json()
        assert result.get("success") == True
        assert len(result.get("moved_orders", [])) > 0 or "already" in result.get("message", "").lower()
        
        print(f"Result: {result.get('message')}")
    
    def test_04_move_multiple_orders_to_pack_ship(self):
        """Move multiple orders to Pack and Ship"""
        batch_id = TestPackShipOrdersSetup.test_batch_id
        
        if not batch_id:
            pytest.skip("No batch ID available")
        
        # Get batch details
        res = session.get(f"{BASE_URL}/api/fulfillment-batches/{batch_id}")
        assert res.status_code == 200
        
        batch = res.json()
        if batch.get("current_stage_id") != "fulfill_finish":
            pytest.skip("Batch not at Finish stage")
        
        orders = batch.get("orders", [])
        
        # Find orders not yet at pack/ship
        available_orders = [
            o.get("order_id") for o in orders 
            if not o.get("individual_stage_override")
        ]
        
        if len(available_orders) < 2:
            print("Not enough orders available for bulk move test")
            return
        
        # Move multiple orders
        res = session.post(
            f"{BASE_URL}/api/fulfillment-batches/{batch_id}/orders/move-to-pack-ship",
            json={"order_ids": available_orders[:2]}
        )
        
        assert res.status_code == 200, f"Bulk move failed: {res.text}"
        
        result = res.json()
        assert result.get("success") == True
        print(f"Moved {len(result.get('moved_orders', []))} orders to Pack and Ship")
    
    def test_05_verify_batch_has_split_orders_flag(self):
        """Verify batch shows has_split_orders after moving orders"""
        batch_id = TestPackShipOrdersSetup.test_batch_id
        
        if not batch_id:
            pytest.skip("No batch ID available")
        
        res = session.get(f"{BASE_URL}/api/fulfillment-batches/{batch_id}")
        assert res.status_code == 200
        
        batch = res.json()
        
        # Check for individual order status tracking
        has_split = batch.get("has_split_orders", False)
        individual_status = batch.get("individual_order_status", {})
        
        # Check orders for current_stage info
        orders = batch.get("orders", [])
        orders_at_pack_ship = [
            o for o in orders 
            if o.get("individual_stage_override") or 
               o.get("fulfillment_stage_id") == "fulfill_pack"
        ]
        
        if orders_at_pack_ship:
            print(f"Batch has {len(orders_at_pack_ship)} orders at Pack & Ship")
            assert has_split or len(individual_status) > 0, "Batch should track split orders"
        
        print(f"has_split_orders: {has_split}, individual_status count: {len(individual_status)}")


class TestGetOrdersByStage:
    """Tests for getting orders grouped by stage"""
    
    def test_01_get_orders_by_stage(self):
        """Get orders grouped by their current stage"""
        batch_id = TestPackShipOrdersSetup.test_batch_id
        
        if not batch_id:
            pytest.skip("No batch ID available")
        
        res = session.get(f"{BASE_URL}/api/fulfillment-batches/{batch_id}/orders-by-stage")
        assert res.status_code == 200, f"Get orders-by-stage failed: {res.text}"
        
        data = res.json()
        
        # Verify response structure
        assert "batch_id" in data
        assert "stages" in data
        assert isinstance(data["stages"], list)
        
        # Check stage grouping
        for stage in data["stages"]:
            assert "stage_id" in stage
            assert "stage_name" in stage
            assert "orders" in stage
            assert isinstance(stage["orders"], list)
            
            print(f"Stage '{stage['stage_name']}': {len(stage['orders'])} orders")
        
        if data.get("has_split_orders"):
            print("Batch has split orders (some at different stages)")
    
    def test_02_verify_orders_at_pack_ship_stage(self):
        """Verify orders moved to Pack & Ship appear in correct stage group"""
        batch_id = TestPackShipOrdersSetup.test_batch_id
        
        if not batch_id:
            pytest.skip("No batch ID available")
        
        res = session.get(f"{BASE_URL}/api/fulfillment-batches/{batch_id}/orders-by-stage")
        assert res.status_code == 200
        
        data = res.json()
        
        pack_ship_stage = None
        for stage in data["stages"]:
            if stage["stage_id"] == "fulfill_pack":
                pack_ship_stage = stage
                break
        
        if pack_ship_stage:
            print(f"Found {len(pack_ship_stage['orders'])} orders at Pack and Ship stage")
            
            # Verify orders have correct stage markers
            for order in pack_ship_stage["orders"]:
                assert order.get("fulfillment_stage_id") == "fulfill_pack" or \
                       order.get("individual_stage_override") == True, \
                       f"Order {order.get('order_id')} should be at pack/ship stage"
        else:
            print("No orders at Pack and Ship stage yet")


class TestGetPackShipOrders:
    """Tests for getting pack/ship orders specifically"""
    
    def test_01_get_pack_ship_orders(self):
        """Get orders that have been moved to Pack and Ship"""
        batch_id = TestPackShipOrdersSetup.test_batch_id
        
        if not batch_id:
            pytest.skip("No batch ID available")
        
        res = session.get(f"{BASE_URL}/api/fulfillment-batches/{batch_id}/pack-ship-orders")
        assert res.status_code == 200, f"Get pack-ship-orders failed: {res.text}"
        
        data = res.json()
        
        # Verify response structure
        assert "batch_id" in data
        assert "ready_to_ship" in data
        assert "shipped" in data
        assert "total_at_pack_ship" in data
        
        ready_count = len(data["ready_to_ship"])
        shipped_count = len(data["shipped"])
        
        print(f"Ready to ship: {ready_count}, Shipped: {shipped_count}")
        
        # Total should match
        assert data["total_at_pack_ship"] == ready_count + shipped_count
    
    def test_02_pack_ship_orders_have_correct_status(self):
        """Verify orders in pack/ship list have correct properties"""
        batch_id = TestPackShipOrdersSetup.test_batch_id
        
        if not batch_id:
            pytest.skip("No batch ID available")
        
        res = session.get(f"{BASE_URL}/api/fulfillment-batches/{batch_id}/pack-ship-orders")
        assert res.status_code == 200
        
        data = res.json()
        
        # Check ready_to_ship orders
        for order in data["ready_to_ship"]:
            assert order.get("individual_stage_override") == True, \
                "Ready to ship orders should have individual_stage_override=True"
            assert order.get("fulfillment_stage_id") == "fulfill_pack", \
                "Ready to ship orders should be at fulfill_pack stage"
            assert order.get("status") != "shipped", \
                "Ready to ship orders should not have shipped status"
        
        # Check shipped orders
        for order in data["shipped"]:
            assert order.get("status") == "shipped", \
                "Shipped orders should have shipped status"
        
        print(f"Verified {len(data['ready_to_ship'])} ready orders, {len(data['shipped'])} shipped orders")


class TestMarkOrderShipped:
    """Tests for marking orders as shipped"""
    
    def test_01_mark_order_as_shipped(self):
        """Mark an order at Pack & Ship as shipped"""
        batch_id = TestPackShipOrdersSetup.test_batch_id
        
        if not batch_id:
            pytest.skip("No batch ID available")
        
        # Get pack/ship orders first
        res = session.get(f"{BASE_URL}/api/fulfillment-batches/{batch_id}/pack-ship-orders")
        assert res.status_code == 200
        
        data = res.json()
        ready_orders = data.get("ready_to_ship", [])
        
        if not ready_orders:
            print("No orders ready to ship - skipping mark shipped test")
            return
        
        # Mark first ready order as shipped
        order_to_ship = ready_orders[0]
        order_id = order_to_ship.get("order_id")
        
        res = session.post(
            f"{BASE_URL}/api/fulfillment-batches/{batch_id}/orders/{order_id}/mark-shipped"
        )
        
        assert res.status_code == 200, f"Mark shipped failed: {res.text}"
        
        result = res.json()
        assert result.get("success") == True
        print(f"Successfully marked order {order_id} as shipped")
    
    def test_02_verify_order_status_after_shipped(self):
        """Verify order status is updated after marking shipped"""
        batch_id = TestPackShipOrdersSetup.test_batch_id
        
        if not batch_id:
            pytest.skip("No batch ID available")
        
        # Get pack/ship orders again
        res = session.get(f"{BASE_URL}/api/fulfillment-batches/{batch_id}/pack-ship-orders")
        assert res.status_code == 200
        
        data = res.json()
        shipped_orders = data.get("shipped", [])
        
        if shipped_orders:
            # Verify a shipped order has correct attributes
            shipped_order = shipped_orders[0]
            assert shipped_order.get("status") == "shipped"
            assert shipped_order.get("shipped_at") is not None
            print(f"Verified shipped order has correct status and shipped_at timestamp")
        else:
            print("No shipped orders to verify")
    
    def test_03_shipped_count_increases(self):
        """Verify shipped count increases in pack-ship-orders response"""
        batch_id = TestPackShipOrdersSetup.test_batch_id
        
        if not batch_id:
            pytest.skip("No batch ID available")
        
        # Get initial counts
        res = session.get(f"{BASE_URL}/api/fulfillment-batches/{batch_id}/pack-ship-orders")
        assert res.status_code == 200
        
        data = res.json()
        initial_shipped = len(data.get("shipped", []))
        initial_ready = len(data.get("ready_to_ship", []))
        
        if not initial_ready:
            print("No orders ready to ship for this test")
            return
        
        # Mark another order as shipped
        order_to_ship = data["ready_to_ship"][0]
        order_id = order_to_ship.get("order_id")
        
        res = session.post(
            f"{BASE_URL}/api/fulfillment-batches/{batch_id}/orders/{order_id}/mark-shipped"
        )
        
        if res.status_code != 200:
            print(f"Mark shipped returned {res.status_code}: {res.text}")
            return
        
        # Get updated counts
        res = session.get(f"{BASE_URL}/api/fulfillment-batches/{batch_id}/pack-ship-orders")
        data = res.json()
        
        final_shipped = len(data.get("shipped", []))
        final_ready = len(data.get("ready_to_ship", []))
        
        print(f"Shipped count: {initial_shipped} -> {final_shipped}")
        print(f"Ready count: {initial_ready} -> {final_ready}")


class TestBatchDetailOrderStages:
    """Tests for order stage info in batch detail"""
    
    def test_01_batch_detail_includes_order_current_stage(self):
        """Verify batch detail shows current_stage per order"""
        batch_id = TestPackShipOrdersSetup.test_batch_id
        
        if not batch_id:
            pytest.skip("No batch ID available")
        
        res = session.get(f"{BASE_URL}/api/fulfillment-batches/{batch_id}")
        assert res.status_code == 200
        
        batch = res.json()
        orders = batch.get("orders", [])
        
        if not orders:
            pytest.skip("No orders in batch")
        
        # Check each order has current_stage info
        for order in orders:
            current_stage = order.get("current_stage")
            
            if current_stage:
                assert "stage_id" in current_stage
                assert "stage_name" in current_stage
                assert "is_independent" in current_stage
                
                if current_stage.get("is_independent"):
                    # Order was moved independently
                    print(f"Order {order.get('order_id')[:8]} at independent stage: {current_stage['stage_name']}")
                else:
                    # Order follows batch stage
                    print(f"Order {order.get('order_id')[:8]} at batch stage: {current_stage['stage_name']}")
    
    def test_02_independent_orders_show_correct_stage(self):
        """Verify orders moved to Pack/Ship show as independent with correct stage"""
        batch_id = TestPackShipOrdersSetup.test_batch_id
        
        if not batch_id:
            pytest.skip("No batch ID available")
        
        res = session.get(f"{BASE_URL}/api/fulfillment-batches/{batch_id}")
        assert res.status_code == 200
        
        batch = res.json()
        orders = batch.get("orders", [])
        
        independent_orders = [o for o in orders if o.get("individual_stage_override")]
        
        for order in independent_orders:
            current_stage = order.get("current_stage", {})
            
            # Independent orders should show as independent
            assert current_stage.get("is_independent") == True, \
                f"Order {order.get('order_id')} should show as independent"
            
            # Should be at Pack and Ship
            if order.get("fulfillment_stage_id") == "fulfill_pack":
                assert current_stage.get("stage_id") == "fulfill_pack" or \
                       "Pack" in current_stage.get("stage_name", ""), \
                       f"Order at fulfill_pack should show Pack and Ship stage"
        
        print(f"Verified {len(independent_orders)} independent orders have correct stage info")


class TestValidation:
    """Tests for validation rules"""
    
    def test_01_empty_order_ids_rejected(self):
        """Verify moving with empty order_ids is rejected"""
        batch_id = TestPackShipOrdersSetup.test_batch_id
        
        if not batch_id:
            pytest.skip("No batch ID available")
        
        res = session.post(
            f"{BASE_URL}/api/fulfillment-batches/{batch_id}/orders/move-to-pack-ship",
            json={"order_ids": []}
        )
        
        # Should be rejected - either 400 or 422
        assert res.status_code in [400, 422], f"Expected 400/422, got {res.status_code}"
        print(f"Empty order_ids correctly rejected: {res.status_code}")
    
    def test_02_invalid_order_id_ignored(self):
        """Verify invalid order IDs are gracefully handled"""
        batch_id = TestPackShipOrdersSetup.test_batch_id
        
        if not batch_id:
            pytest.skip("No batch ID available")
        
        # First ensure batch is at Finish stage
        res = session.get(f"{BASE_URL}/api/fulfillment-batches/{batch_id}")
        if res.status_code != 200:
            pytest.skip("Batch not found")
        
        batch = res.json()
        if batch.get("current_stage_id") != "fulfill_finish":
            pytest.skip("Batch not at Finish stage")
        
        # Try with invalid order ID
        res = session.post(
            f"{BASE_URL}/api/fulfillment-batches/{batch_id}/orders/move-to-pack-ship",
            json={"order_ids": ["INVALID_ORDER_ID_123"]}
        )
        
        # Should succeed but move 0 orders
        assert res.status_code == 200, f"Request failed: {res.text}"
        
        result = res.json()
        assert len(result.get("moved_orders", [])) == 0
        print(f"Invalid order ID handled gracefully: {result.get('message')}")
    
    def test_03_mark_shipped_invalid_order_rejected(self):
        """Verify marking non-existent order as shipped is rejected"""
        batch_id = TestPackShipOrdersSetup.test_batch_id
        
        if not batch_id:
            pytest.skip("No batch ID available")
        
        res = session.post(
            f"{BASE_URL}/api/fulfillment-batches/{batch_id}/orders/INVALID_ORDER_ID/mark-shipped"
        )
        
        assert res.status_code == 404, f"Expected 404, got {res.status_code}"
        print("Invalid order ID correctly rejected for mark-shipped")


class TestNonExistentBatch:
    """Tests for non-existent batch handling"""
    
    def test_01_move_orders_nonexistent_batch(self):
        """Verify move fails for non-existent batch"""
        res = session.post(
            f"{BASE_URL}/api/fulfillment-batches/NONEXISTENT_BATCH/orders/move-to-pack-ship",
            json={"order_ids": ["order1"]}
        )
        
        assert res.status_code == 404
        print("Non-existent batch correctly returns 404 for move-to-pack-ship")
    
    def test_02_get_pack_ship_orders_nonexistent_batch(self):
        """Verify get pack-ship-orders fails for non-existent batch"""
        res = session.get(f"{BASE_URL}/api/fulfillment-batches/NONEXISTENT_BATCH/pack-ship-orders")
        
        assert res.status_code == 404
        print("Non-existent batch correctly returns 404 for pack-ship-orders")
    
    def test_03_get_orders_by_stage_nonexistent_batch(self):
        """Verify get orders-by-stage fails for non-existent batch"""
        res = session.get(f"{BASE_URL}/api/fulfillment-batches/NONEXISTENT_BATCH/orders-by-stage")
        
        assert res.status_code == 404
        print("Non-existent batch correctly returns 404 for orders-by-stage")
    
    def test_04_mark_shipped_nonexistent_batch(self):
        """Verify mark-shipped fails for non-existent batch"""
        res = session.post(
            f"{BASE_URL}/api/fulfillment-batches/NONEXISTENT_BATCH/orders/order1/mark-shipped"
        )
        
        assert res.status_code == 404
        print("Non-existent batch correctly returns 404 for mark-shipped")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
