"""
Test suite for P0 (Orders page) and P1 (Team page) bug fixes
- P0: Orders page should display all 254 active orders
- P1: Team page should load correctly with user statistics
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test session token - created for testing
SESSION_TOKEN = "test_session_1769977085456"

@pytest.fixture
def api_client():
    """Shared requests session with auth cookie"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    session.cookies.set("session_token", SESSION_TOKEN)
    return session


class TestOrdersAPI:
    """P0: Orders API tests - verify active orders filtering"""
    
    def test_orders_active_status_returns_254(self, api_client):
        """P0: GET /api/orders?status=active should return 254 orders"""
        response = api_client.get(f"{BASE_URL}/api/orders?status=active")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        assert len(data) == 254, f"Expected 254 active orders, got {len(data)}"
    
    def test_orders_active_excludes_shipped(self, api_client):
        """P0: Active orders should NOT include shipped orders"""
        response = api_client.get(f"{BASE_URL}/api/orders?status=active")
        assert response.status_code == 200
        
        data = response.json()
        shipped_orders = [o for o in data if o.get("status") == "shipped"]
        assert len(shipped_orders) == 0, f"Found {len(shipped_orders)} shipped orders in active list"
    
    def test_orders_active_excludes_cancelled(self, api_client):
        """P0: Active orders should NOT include cancelled orders"""
        response = api_client.get(f"{BASE_URL}/api/orders?status=active")
        assert response.status_code == 200
        
        data = response.json()
        cancelled_orders = [o for o in data if o.get("status") == "cancelled"]
        assert len(cancelled_orders) == 0, f"Found {len(cancelled_orders)} cancelled orders in active list"
    
    def test_orders_active_excludes_completed(self, api_client):
        """P0: Active orders should NOT include completed orders"""
        response = api_client.get(f"{BASE_URL}/api/orders?status=active")
        assert response.status_code == 200
        
        data = response.json()
        completed_orders = [o for o in data if o.get("status") == "completed"]
        assert len(completed_orders) == 0, f"Found {len(completed_orders)} completed orders in active list"
    
    def test_orders_all_status_returns_more(self, api_client):
        """Verify 'all' status returns more orders than 'active'"""
        response = api_client.get(f"{BASE_URL}/api/orders?status=all")
        assert response.status_code == 200
        
        data = response.json()
        assert len(data) > 254, f"Expected more than 254 orders with status=all, got {len(data)}"
    
    def test_orders_with_store_filter(self, api_client):
        """Test orders API with store filter"""
        # First get all orders to find a store_id
        response = api_client.get(f"{BASE_URL}/api/orders?status=active")
        assert response.status_code == 200
        
        data = response.json()
        if data:
            store_id = data[0].get("store_id")
            if store_id:
                # Filter by store
                response = api_client.get(f"{BASE_URL}/api/orders?status=active&store_id={store_id}")
                assert response.status_code == 200
                filtered_data = response.json()
                # All returned orders should have the same store_id
                for order in filtered_data:
                    assert order.get("store_id") == store_id
    
    def test_orders_response_structure(self, api_client):
        """Verify order response has expected fields"""
        response = api_client.get(f"{BASE_URL}/api/orders?status=active")
        assert response.status_code == 200
        
        data = response.json()
        if data:
            order = data[0]
            # Check essential fields exist
            assert "order_id" in order or "external_id" in order
            assert "status" in order
            assert "store_id" in order or "store_name" in order


class TestTeamAPI:
    """P1: Team page API tests"""
    
    def test_users_endpoint(self, api_client):
        """P1: GET /api/users should return list of users"""
        response = api_client.get(f"{BASE_URL}/api/users")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        assert len(data) >= 1, "Should have at least 1 user"
    
    def test_users_response_structure(self, api_client):
        """Verify user response has expected fields"""
        response = api_client.get(f"{BASE_URL}/api/users")
        assert response.status_code == 200
        
        data = response.json()
        if data:
            user = data[0]
            assert "user_id" in user, "User should have user_id"
            assert "email" in user, "User should have email"
            assert "name" in user, "User should have name"
            assert "role" in user, "User should have role"
    
    def test_stats_users_endpoint(self, api_client):
        """P1: GET /api/stats/users should return user statistics"""
        response = api_client.get(f"{BASE_URL}/api/stats/users")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
    
    def test_stats_users_with_period_day(self, api_client):
        """Test user stats with day period filter"""
        response = api_client.get(f"{BASE_URL}/api/stats/users?period=day")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
    
    def test_stats_users_with_period_week(self, api_client):
        """Test user stats with week period filter"""
        response = api_client.get(f"{BASE_URL}/api/stats/users?period=week")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
    
    def test_stats_users_with_period_month(self, api_client):
        """Test user stats with month period filter"""
        response = api_client.get(f"{BASE_URL}/api/stats/users?period=month")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
    
    def test_stats_users_response_structure(self, api_client):
        """Verify stats response structure when data exists"""
        response = api_client.get(f"{BASE_URL}/api/stats/users")
        assert response.status_code == 200
        
        data = response.json()
        # If there are stats, verify structure
        if data:
            stat = data[0]
            assert "user_id" in stat, "Stat should have user_id"
            assert "total_items" in stat, "Stat should have total_items"
            assert "total_hours" in stat, "Stat should have total_hours"


class TestAuthRequired:
    """Test that endpoints require authentication"""
    
    def test_orders_requires_auth(self):
        """Orders endpoint should require authentication"""
        response = requests.get(f"{BASE_URL}/api/orders?status=active")
        assert response.status_code == 401 or response.status_code == 403
    
    def test_users_requires_auth(self):
        """Users endpoint should require authentication"""
        response = requests.get(f"{BASE_URL}/api/users")
        assert response.status_code == 401 or response.status_code == 403
    
    def test_stats_users_requires_auth(self):
        """Stats users endpoint should require authentication"""
        response = requests.get(f"{BASE_URL}/api/stats/users")
        assert response.status_code == 401 or response.status_code == 403
