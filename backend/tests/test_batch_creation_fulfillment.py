"""
Test batch creation from Orders page - verify orders get assigned to Print List stage

Bug fix verification:
- When creating a batch from orders on the Orders page, those orders should appear 
  in the Order Fulfillment page under 'Print List' stage (fulfill_print)
- NOT 'In Production' stage (fulfill_orders) as was happening before the fix
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
SESSION_TOKEN = "test_session_1769977085456"

# Test order IDs that are unbatched
TEST_ORDER_IDS = [
    "ord_fa966705fdb6",  # Order #6916
    "ord_c28b8030a1be",  # Order #6915
]


@pytest.fixture
def api_client():
    """Shared requests session with auth"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    session.cookies.set("session_token", SESSION_TOKEN)
    return session


class TestBatchCreationFulfillmentStage:
    """Test that batch creation assigns orders to Print List (fulfill_print) stage"""
    
    def test_fulfillment_stages_exist(self, api_client):
        """Verify fulfillment stages are configured correctly"""
        response = api_client.get(f"{BASE_URL}/api/fulfillment/stages")
        assert response.status_code == 200, f"Failed to get stages: {response.text}"
        
        stages = response.json()
        assert len(stages) >= 5, "Expected at least 5 fulfillment stages"
        
        # Verify stage order and IDs
        stage_ids = [s["stage_id"] for s in stages]
        assert "fulfill_orders" in stage_ids, "Missing 'In Production' stage"
        assert "fulfill_print" in stage_ids, "Missing 'Print List' stage"
        
        # Verify fulfill_print comes after fulfill_orders
        orders_idx = stage_ids.index("fulfill_orders")
        print_idx = stage_ids.index("fulfill_print")
        assert print_idx > orders_idx, "Print List should come after In Production"
        
        print(f"✓ Fulfillment stages configured correctly: {stage_ids}")
    
    def test_orders_are_unbatched(self, api_client):
        """Verify test orders are unbatched before creating batch"""
        for order_id in TEST_ORDER_IDS:
            response = api_client.get(f"{BASE_URL}/api/orders/{order_id}")
            if response.status_code == 200:
                order = response.json()
                # Order should not have a batch_id
                assert order.get("batch_id") is None, f"Order {order_id} already has batch_id"
                print(f"✓ Order {order_id} is unbatched")
            else:
                # Try fulfillment_orders collection
                response = api_client.get(f"{BASE_URL}/api/fulfillment/orders?stage_id=fulfill_print")
                print(f"Order {order_id} lookup returned {response.status_code}")
    
    def test_create_batch_assigns_to_print_list(self, api_client):
        """
        CRITICAL TEST: Create batch and verify orders go to Print List stage
        
        This is the main bug fix verification:
        - Before fix: Orders went to fulfill_orders (In Production)
        - After fix: Orders should go to fulfill_print (Print List)
        """
        batch_name = f"Test Batch {uuid.uuid4().hex[:8]}"
        
        # Create batch with test orders
        response = api_client.post(
            f"{BASE_URL}/api/batches",
            json={
                "name": batch_name,
                "order_ids": TEST_ORDER_IDS
            }
        )
        
        assert response.status_code == 200, f"Failed to create batch: {response.text}"
        
        batch_data = response.json()
        batch_id = batch_data.get("batch_id")
        assert batch_id is not None, "Batch ID not returned"
        
        print(f"✓ Created batch: {batch_id} ({batch_name})")
        print(f"  Items count: {batch_data.get('items_count', 0)}")
        
        # Store batch_id for cleanup
        self.__class__.created_batch_id = batch_id
        
        # Verify batch was created with correct type
        assert batch_data.get("batch_type") == "order_based", "Batch should be order_based type"
        
        return batch_id
    
    def test_orders_have_print_list_stage(self, api_client):
        """Verify orders in the batch have fulfillment_stage_id = fulfill_print"""
        # Get orders from Print List stage
        response = api_client.get(f"{BASE_URL}/api/fulfillment/stages/fulfill_print/orders")
        assert response.status_code == 200, f"Failed to get Print List orders: {response.text}"
        
        data = response.json()
        orders = data.get("orders", [])
        
        # Find our test orders
        found_orders = []
        for order in orders:
            if order.get("order_id") in TEST_ORDER_IDS:
                found_orders.append(order)
                
                # CRITICAL ASSERTION: Verify fulfillment_stage_id is fulfill_print
                assert order.get("fulfillment_stage_id") == "fulfill_print", \
                    f"Order {order['order_id']} has wrong stage: {order.get('fulfillment_stage_id')}"
                
                # Verify stage name
                assert order.get("fulfillment_stage_name") == "Print List", \
                    f"Order {order['order_id']} has wrong stage name: {order.get('fulfillment_stage_name')}"
                
                print(f"✓ Order {order['order_id']} is in Print List stage")
        
        assert len(found_orders) == len(TEST_ORDER_IDS), \
            f"Expected {len(TEST_ORDER_IDS)} orders in Print List, found {len(found_orders)}"
        
        print(f"✓ All {len(found_orders)} orders correctly assigned to Print List stage")
    
    def test_orders_not_in_production_stage(self, api_client):
        """Verify orders are NOT in the In Production stage (the bug behavior)"""
        response = api_client.get(f"{BASE_URL}/api/fulfillment/stages/fulfill_orders/orders")
        assert response.status_code == 200, f"Failed to get In Production orders: {response.text}"
        
        data = response.json()
        orders = data.get("orders", [])
        
        # Our test orders should NOT be in In Production
        for order in orders:
            assert order.get("order_id") not in TEST_ORDER_IDS, \
                f"BUG: Order {order['order_id']} is in In Production instead of Print List!"
        
        print("✓ Test orders are NOT in In Production stage (bug is fixed)")
    
    def test_batch_in_production_batches(self, api_client):
        """Verify batch was created in production_batches collection"""
        batch_id = getattr(self.__class__, 'created_batch_id', None)
        if not batch_id:
            pytest.skip("No batch was created in previous test")
        
        response = api_client.get(f"{BASE_URL}/api/batches/{batch_id}")
        assert response.status_code == 200, f"Failed to get batch: {response.text}"
        
        batch = response.json()
        assert batch.get("batch_type") == "order_based", "Batch should be order_based"
        assert batch.get("status") == "active", "Batch should be active"
        assert set(batch.get("order_ids", [])) == set(TEST_ORDER_IDS), "Batch should contain test orders"
        
        print(f"✓ Batch {batch_id} exists with correct data")
        print(f"  Type: {batch.get('batch_type')}")
        print(f"  Status: {batch.get('status')}")
        print(f"  Orders: {batch.get('order_ids')}")


class TestBatchCreationCleanup:
    """Cleanup tests - delete the batch and verify orders return to unbatched state"""
    
    def test_delete_batch(self, api_client):
        """Delete the test batch"""
        batch_id = getattr(TestBatchCreationFulfillmentStage, 'created_batch_id', None)
        if not batch_id:
            pytest.skip("No batch to delete")
        
        response = api_client.delete(f"{BASE_URL}/api/batches/{batch_id}")
        assert response.status_code == 200, f"Failed to delete batch: {response.text}"
        
        print(f"✓ Deleted batch {batch_id}")
    
    def test_orders_returned_to_unbatched(self, api_client):
        """Verify orders are unbatched after batch deletion"""
        # Orders should no longer be in Print List
        response = api_client.get(f"{BASE_URL}/api/fulfillment/stages/fulfill_print/orders")
        assert response.status_code == 200
        
        data = response.json()
        orders = data.get("orders", [])
        
        for order in orders:
            if order.get("order_id") in TEST_ORDER_IDS:
                # After batch deletion, orders should have batch_id cleared
                assert order.get("batch_id") is None, \
                    f"Order {order['order_id']} still has batch_id after deletion"
        
        print("✓ Orders returned to unbatched state")


class TestFulfillmentSummary:
    """Test fulfillment summary endpoint"""
    
    def test_summary_endpoint(self, api_client):
        """Verify summary endpoint returns stage counts"""
        response = api_client.get(f"{BASE_URL}/api/fulfillment/summary")
        assert response.status_code == 200, f"Failed to get summary: {response.text}"
        
        summary = response.json()
        assert "stages" in summary, "Summary should have stages"
        
        for stage in summary["stages"]:
            print(f"  {stage.get('name', 'Unknown')}: {stage.get('count', 0)} orders")
        
        print("✓ Fulfillment summary endpoint works")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
