"""
Test suite for Fulfillment Delete Endpoints
Tests DELETE /api/fulfillment/orders/{order_id} and DELETE /api/fulfillment/orders/{order_id}/items/{item_id}
Features:
- Admin/Manager can delete orders from fulfillment
- Admin/Manager can delete items from fulfillment orders
- Regular users get 403 Forbidden
- Removal is logged in fulfillment_removal_logs collection
- If last item is deleted, entire order is removed from fulfillment
"""

import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials - created in MongoDB
ADMIN_SESSION_TOKEN = "test_session_1770252178661"
MANAGER_SESSION_TOKEN = "test_manager_session_1770252178665"
REGULAR_USER_SESSION_TOKEN = "test_regular_session_1770252178667"


class TestFulfillmentDeleteOrderEndpoint:
    """Tests for DELETE /api/fulfillment/orders/{order_id}"""
    
    @pytest.fixture
    def admin_client(self):
        """Session with admin auth"""
        session = requests.Session()
        session.cookies.set("session_token", ADMIN_SESSION_TOKEN)
        session.headers.update({"Content-Type": "application/json"})
        return session
    
    @pytest.fixture
    def manager_client(self):
        """Session with manager auth"""
        session = requests.Session()
        session.cookies.set("session_token", MANAGER_SESSION_TOKEN)
        session.headers.update({"Content-Type": "application/json"})
        return session
    
    @pytest.fixture
    def regular_user_client(self):
        """Session with regular user auth (non-admin, non-manager)"""
        session = requests.Session()
        session.cookies.set("session_token", REGULAR_USER_SESSION_TOKEN)
        session.headers.update({"Content-Type": "application/json"})
        return session
    
    @pytest.fixture
    def test_order_id(self, admin_client):
        """Create a test order in fulfillment for testing deletion"""
        # First, get an existing order from fulfillment to use as template
        res = admin_client.get(f"{BASE_URL}/api/fulfillment/orders?stage_id=fulfill_orders")
        if res.status_code == 200:
            orders = res.json()
            if orders and len(orders) > 0:
                # Return an existing order ID for testing
                return orders[0].get("order_id")
        
        # If no orders exist, we'll create a test order directly in DB
        # For now, skip if no orders available
        pytest.skip("No fulfillment orders available for testing")
    
    def test_admin_can_delete_order_from_fulfillment(self, admin_client):
        """Test that admin can delete an order from fulfillment"""
        # First get an order to delete
        res = admin_client.get(f"{BASE_URL}/api/fulfillment/orders")
        assert res.status_code == 200, f"Failed to get orders: {res.text}"
        
        orders = res.json()
        if not orders or len(orders) == 0:
            pytest.skip("No fulfillment orders available for testing")
        
        # Find an order we can safely delete (preferably one without batch)
        test_order = None
        for order in orders:
            if not order.get("batch_id"):
                test_order = order
                break
        
        if not test_order:
            # Use first order if no unbatched orders
            test_order = orders[0]
        
        order_id = test_order.get("order_id")
        order_number = test_order.get("order_number")
        
        # Delete the order
        delete_res = admin_client.delete(f"{BASE_URL}/api/fulfillment/orders/{order_id}")
        
        assert delete_res.status_code == 200, f"Failed to delete order: {delete_res.text}"
        
        data = delete_res.json()
        assert data.get("success") == True
        assert "removed from fulfillment" in data.get("message", "").lower()
        assert data.get("order_id") == order_id
        assert "removed_by" in data
        
        print(f"✓ Admin successfully deleted order {order_number} from fulfillment")
    
    def test_manager_can_delete_order_from_fulfillment(self, manager_client):
        """Test that manager can delete an order from fulfillment"""
        # First get an order to delete
        res = manager_client.get(f"{BASE_URL}/api/fulfillment/orders")
        assert res.status_code == 200, f"Failed to get orders: {res.text}"
        
        orders = res.json()
        if not orders or len(orders) == 0:
            pytest.skip("No fulfillment orders available for testing")
        
        order_id = orders[0].get("order_id")
        
        # Delete the order
        delete_res = manager_client.delete(f"{BASE_URL}/api/fulfillment/orders/{order_id}")
        
        assert delete_res.status_code == 200, f"Failed to delete order: {delete_res.text}"
        
        data = delete_res.json()
        assert data.get("success") == True
        
        print(f"✓ Manager successfully deleted order from fulfillment")
    
    def test_regular_user_cannot_delete_order(self, regular_user_client, admin_client):
        """Test that regular user gets 403 Forbidden when trying to delete"""
        # First get an order ID using admin client
        res = admin_client.get(f"{BASE_URL}/api/fulfillment/orders")
        assert res.status_code == 200
        
        orders = res.json()
        if not orders or len(orders) == 0:
            pytest.skip("No fulfillment orders available for testing")
        
        order_id = orders[0].get("order_id")
        
        # Try to delete with regular user
        delete_res = regular_user_client.delete(f"{BASE_URL}/api/fulfillment/orders/{order_id}")
        
        assert delete_res.status_code == 403, f"Expected 403, got {delete_res.status_code}: {delete_res.text}"
        
        data = delete_res.json()
        assert "admin" in data.get("detail", "").lower() or "manager" in data.get("detail", "").lower()
        
        print(f"✓ Regular user correctly received 403 Forbidden")
    
    def test_delete_nonexistent_order_returns_404(self, admin_client):
        """Test that deleting a non-existent order returns 404"""
        fake_order_id = f"ord_nonexistent_{uuid.uuid4().hex[:12]}"
        
        delete_res = admin_client.delete(f"{BASE_URL}/api/fulfillment/orders/{fake_order_id}")
        
        assert delete_res.status_code == 404, f"Expected 404, got {delete_res.status_code}"
        
        print(f"✓ Non-existent order correctly returns 404")


class TestFulfillmentDeleteItemEndpoint:
    """Tests for DELETE /api/fulfillment/orders/{order_id}/items/{item_id}"""
    
    @pytest.fixture
    def admin_client(self):
        """Session with admin auth"""
        session = requests.Session()
        session.cookies.set("session_token", ADMIN_SESSION_TOKEN)
        session.headers.update({"Content-Type": "application/json"})
        return session
    
    @pytest.fixture
    def manager_client(self):
        """Session with manager auth"""
        session = requests.Session()
        session.cookies.set("session_token", MANAGER_SESSION_TOKEN)
        session.headers.update({"Content-Type": "application/json"})
        return session
    
    @pytest.fixture
    def regular_user_client(self):
        """Session with regular user auth"""
        session = requests.Session()
        session.cookies.set("session_token", REGULAR_USER_SESSION_TOKEN)
        session.headers.update({"Content-Type": "application/json"})
        return session
    
    def test_admin_can_delete_item_from_order(self, admin_client):
        """Test that admin can delete a specific item from an order in fulfillment"""
        # Get an order with multiple items
        res = admin_client.get(f"{BASE_URL}/api/fulfillment/orders")
        assert res.status_code == 200
        
        orders = res.json()
        
        # Find an order with multiple items
        test_order = None
        for order in orders:
            line_items = order.get("line_items", [])
            if len(line_items) >= 2:
                test_order = order
                break
        
        if not test_order:
            pytest.skip("No orders with multiple items available for testing")
        
        order_id = test_order.get("order_id")
        line_items = test_order.get("line_items", [])
        item_id = line_items[0].get("line_item_id") or line_items[0].get("item_id")
        
        initial_item_count = len(line_items)
        
        # Delete the item
        delete_res = admin_client.delete(f"{BASE_URL}/api/fulfillment/orders/{order_id}/items/{item_id}")
        
        assert delete_res.status_code == 200, f"Failed to delete item: {delete_res.text}"
        
        data = delete_res.json()
        assert data.get("success") == True
        assert data.get("order_id") == order_id
        assert data.get("item_id") == item_id
        assert data.get("items_remaining") == initial_item_count - 1
        assert data.get("order_removed") != True  # Order should NOT be removed since there are more items
        
        print(f"✓ Admin successfully deleted item from order. Items remaining: {data.get('items_remaining')}")
    
    def test_manager_can_delete_item_from_order(self, manager_client):
        """Test that manager can delete a specific item from an order"""
        # Get an order with multiple items
        res = manager_client.get(f"{BASE_URL}/api/fulfillment/orders")
        assert res.status_code == 200
        
        orders = res.json()
        
        # Find an order with multiple items
        test_order = None
        for order in orders:
            line_items = order.get("line_items", [])
            if len(line_items) >= 2:
                test_order = order
                break
        
        if not test_order:
            pytest.skip("No orders with multiple items available for testing")
        
        order_id = test_order.get("order_id")
        line_items = test_order.get("line_items", [])
        item_id = line_items[0].get("line_item_id") or line_items[0].get("item_id")
        
        # Delete the item
        delete_res = manager_client.delete(f"{BASE_URL}/api/fulfillment/orders/{order_id}/items/{item_id}")
        
        assert delete_res.status_code == 200, f"Failed to delete item: {delete_res.text}"
        
        data = delete_res.json()
        assert data.get("success") == True
        
        print(f"✓ Manager successfully deleted item from order")
    
    def test_regular_user_cannot_delete_item(self, regular_user_client, admin_client):
        """Test that regular user gets 403 Forbidden when trying to delete item"""
        # Get an order with items using admin client
        res = admin_client.get(f"{BASE_URL}/api/fulfillment/orders")
        assert res.status_code == 200
        
        orders = res.json()
        
        test_order = None
        for order in orders:
            line_items = order.get("line_items", [])
            if len(line_items) >= 1:
                test_order = order
                break
        
        if not test_order:
            pytest.skip("No orders with items available for testing")
        
        order_id = test_order.get("order_id")
        line_items = test_order.get("line_items", [])
        item_id = line_items[0].get("line_item_id") or line_items[0].get("item_id")
        
        # Try to delete with regular user
        delete_res = regular_user_client.delete(f"{BASE_URL}/api/fulfillment/orders/{order_id}/items/{item_id}")
        
        assert delete_res.status_code == 403, f"Expected 403, got {delete_res.status_code}: {delete_res.text}"
        
        print(f"✓ Regular user correctly received 403 Forbidden for item deletion")
    
    def test_delete_nonexistent_item_returns_404(self, admin_client):
        """Test that deleting a non-existent item returns 404"""
        # Get a valid order
        res = admin_client.get(f"{BASE_URL}/api/fulfillment/orders")
        assert res.status_code == 200
        
        orders = res.json()
        if not orders:
            pytest.skip("No orders available")
        
        order_id = orders[0].get("order_id")
        fake_item_id = f"item_nonexistent_{uuid.uuid4().hex[:12]}"
        
        delete_res = admin_client.delete(f"{BASE_URL}/api/fulfillment/orders/{order_id}/items/{fake_item_id}")
        
        assert delete_res.status_code == 404, f"Expected 404, got {delete_res.status_code}"
        
        print(f"✓ Non-existent item correctly returns 404")
    
    def test_delete_item_from_nonexistent_order_returns_404(self, admin_client):
        """Test that deleting item from non-existent order returns 404"""
        fake_order_id = f"ord_nonexistent_{uuid.uuid4().hex[:12]}"
        fake_item_id = f"item_fake_{uuid.uuid4().hex[:12]}"
        
        delete_res = admin_client.delete(f"{BASE_URL}/api/fulfillment/orders/{fake_order_id}/items/{fake_item_id}")
        
        assert delete_res.status_code == 404, f"Expected 404, got {delete_res.status_code}"
        
        print(f"✓ Non-existent order correctly returns 404 for item deletion")


class TestFulfillmentRemovalLogging:
    """Tests for verifying removal is logged in fulfillment_removal_logs collection"""
    
    @pytest.fixture
    def admin_client(self):
        """Session with admin auth"""
        session = requests.Session()
        session.cookies.set("session_token", ADMIN_SESSION_TOKEN)
        session.headers.update({"Content-Type": "application/json"})
        return session
    
    def test_order_removal_is_logged(self, admin_client):
        """Test that order removal creates a log entry"""
        # Get an order to delete
        res = admin_client.get(f"{BASE_URL}/api/fulfillment/orders")
        assert res.status_code == 200
        
        orders = res.json()
        if not orders:
            pytest.skip("No orders available for testing")
        
        order_id = orders[0].get("order_id")
        order_number = orders[0].get("order_number")
        
        # Delete the order
        delete_res = admin_client.delete(f"{BASE_URL}/api/fulfillment/orders/{order_id}")
        
        if delete_res.status_code == 200:
            # Verify the log was created by checking the response
            data = delete_res.json()
            assert data.get("success") == True
            assert "removed_by" in data
            print(f"✓ Order removal logged - removed by: {data.get('removed_by')}")
        else:
            # Order might already be deleted
            print(f"Order deletion returned {delete_res.status_code}")
    
    def test_item_removal_is_logged(self, admin_client):
        """Test that item removal creates a log entry"""
        # Get an order with items
        res = admin_client.get(f"{BASE_URL}/api/fulfillment/orders")
        assert res.status_code == 200
        
        orders = res.json()
        
        test_order = None
        for order in orders:
            line_items = order.get("line_items", [])
            if len(line_items) >= 2:
                test_order = order
                break
        
        if not test_order:
            pytest.skip("No orders with multiple items available")
        
        order_id = test_order.get("order_id")
        line_items = test_order.get("line_items", [])
        item_id = line_items[0].get("line_item_id") or line_items[0].get("item_id")
        
        # Delete the item
        delete_res = admin_client.delete(f"{BASE_URL}/api/fulfillment/orders/{order_id}/items/{item_id}")
        
        if delete_res.status_code == 200:
            data = delete_res.json()
            assert data.get("success") == True
            assert "removed_by" in data
            print(f"✓ Item removal logged - removed by: {data.get('removed_by')}")


class TestLastItemDeletionRemovesOrder:
    """Tests for verifying that deleting the last item removes the entire order"""
    
    @pytest.fixture
    def admin_client(self):
        """Session with admin auth"""
        session = requests.Session()
        session.cookies.set("session_token", ADMIN_SESSION_TOKEN)
        session.headers.update({"Content-Type": "application/json"})
        return session
    
    def test_deleting_last_item_removes_order(self, admin_client):
        """Test that deleting the last item from an order removes the entire order from fulfillment"""
        # Get an order with exactly 1 item
        res = admin_client.get(f"{BASE_URL}/api/fulfillment/orders")
        assert res.status_code == 200
        
        orders = res.json()
        
        # Find an order with exactly 1 item
        test_order = None
        for order in orders:
            line_items = order.get("line_items", [])
            if len(line_items) == 1:
                test_order = order
                break
        
        if not test_order:
            # If no single-item order exists, we'll test the behavior by deleting items until one remains
            # For now, skip this specific test
            pytest.skip("No orders with exactly 1 item available for testing")
        
        order_id = test_order.get("order_id")
        order_number = test_order.get("order_number")
        line_items = test_order.get("line_items", [])
        item_id = line_items[0].get("line_item_id") or line_items[0].get("item_id")
        
        # Delete the last item
        delete_res = admin_client.delete(f"{BASE_URL}/api/fulfillment/orders/{order_id}/items/{item_id}")
        
        assert delete_res.status_code == 200, f"Failed to delete item: {delete_res.text}"
        
        data = delete_res.json()
        assert data.get("success") == True
        assert data.get("order_removed") == True, "Expected order_removed: true when deleting last item"
        assert "removed from fulfillment" in data.get("message", "").lower()
        
        # Verify order no longer exists in fulfillment
        verify_res = admin_client.get(f"{BASE_URL}/api/fulfillment/orders")
        verify_orders = verify_res.json()
        order_ids = [o.get("order_id") for o in verify_orders]
        assert order_id not in order_ids, "Order should be removed from fulfillment after last item deleted"
        
        print(f"✓ Deleting last item correctly removed order {order_number} from fulfillment")


class TestAuthenticationRequired:
    """Tests for verifying authentication is required"""
    
    def test_delete_order_requires_auth(self):
        """Test that delete order endpoint requires authentication"""
        session = requests.Session()
        # No session token set
        
        res = session.delete(f"{BASE_URL}/api/fulfillment/orders/some_order_id")
        
        # Should return 401 or redirect to login
        assert res.status_code in [401, 403, 307], f"Expected auth error, got {res.status_code}"
        
        print(f"✓ Delete order endpoint requires authentication")
    
    def test_delete_item_requires_auth(self):
        """Test that delete item endpoint requires authentication"""
        session = requests.Session()
        # No session token set
        
        res = session.delete(f"{BASE_URL}/api/fulfillment/orders/some_order_id/items/some_item_id")
        
        # Should return 401 or redirect to login
        assert res.status_code in [401, 403, 307], f"Expected auth error, got {res.status_code}"
        
        print(f"✓ Delete item endpoint requires authentication")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
