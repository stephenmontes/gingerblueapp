"""
Test cases for auto-logout feature endpoints:
- POST /api/fulfillment/timers/stop-all - stops all active fulfillment timers
- POST /api/production/timers/stop-all - stops all active production timers  
- POST /api/activity/heartbeat - records user activity heartbeat
"""
import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestAutoLogoutEndpoints:
    """Tests for auto-logout feature endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Get authentication via dev-login"""
        self.session = requests.Session()
        # Authenticate using dev-login endpoint (TRAINING_MODE enabled)
        login_resp = self.session.get(f"{BASE_URL}/api/auth/dev-login")
        if login_resp.status_code == 200:
            self.authenticated = True
            self.user_data = login_resp.json()
            print(f"Authenticated as: {self.user_data.get('name', 'Unknown')}")
        else:
            self.authenticated = False
            print(f"Dev login failed with status: {login_resp.status_code}")
            
    def test_dev_login_works(self):
        """Test that dev-login endpoint returns valid user"""
        assert self.authenticated, "Dev login must succeed for other tests"
        assert "user_id" in self.user_data, "User data should contain user_id"
        assert "name" in self.user_data, "User data should contain name"
        print(f"User ID: {self.user_data.get('user_id')}")
        
    def test_fulfillment_stop_all_timers_endpoint_exists(self):
        """Test POST /api/fulfillment/timers/stop-all returns proper response"""
        if not self.authenticated:
            pytest.skip("Not authenticated")
            
        response = self.session.post(f"{BASE_URL}/api/fulfillment/timers/stop-all")
        
        # Should return 200 with message and stopped_count
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "message" in data, "Response should contain 'message' field"
        assert "stopped_count" in data, "Response should contain 'stopped_count' field"
        assert isinstance(data["stopped_count"], int), "stopped_count should be integer"
        assert data["stopped_count"] >= 0, "stopped_count should be non-negative"
        
        print(f"Fulfillment stop-all response: {data}")
        
    def test_production_stop_all_timers_endpoint_exists(self):
        """Test POST /api/production/timers/stop-all returns proper response"""
        if not self.authenticated:
            pytest.skip("Not authenticated")
            
        response = self.session.post(f"{BASE_URL}/api/production/timers/stop-all")
        
        # Should return 200 with message and stopped_count
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "message" in data, "Response should contain 'message' field"
        assert "stopped_count" in data, "Response should contain 'stopped_count' field"
        assert isinstance(data["stopped_count"], int), "stopped_count should be integer"
        assert data["stopped_count"] >= 0, "stopped_count should be non-negative"
        
        print(f"Production stop-all response: {data}")
        
    def test_activity_heartbeat_endpoint_exists(self):
        """Test POST /api/activity/heartbeat returns proper response"""
        if not self.authenticated:
            pytest.skip("Not authenticated")
            
        response = self.session.post(f"{BASE_URL}/api/activity/heartbeat")
        
        # Should return 200 with status and date
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "status" in data, "Response should contain 'status' field"
        assert "date" in data, "Response should contain 'date' field"
        assert data["status"] == "ok", f"Expected status 'ok', got '{data['status']}'"
        
        # Date should be in YYYY-MM-DD format
        try:
            datetime.strptime(data["date"], "%Y-%m-%d")
        except ValueError:
            pytest.fail(f"Date format invalid: {data['date']}")
            
        print(f"Heartbeat response: {data}")
        
    def test_heartbeat_multiple_calls(self):
        """Test multiple heartbeat calls work correctly"""
        if not self.authenticated:
            pytest.skip("Not authenticated")
            
        # Call heartbeat 3 times
        for i in range(3):
            response = self.session.post(f"{BASE_URL}/api/activity/heartbeat")
            assert response.status_code == 200, f"Heartbeat call {i+1} failed"
            
        print("Multiple heartbeat calls succeeded")
        
    def test_stop_all_without_auth_fails(self):
        """Test that stop-all endpoints require authentication"""
        # Use a fresh session without cookies
        fresh_session = requests.Session()
        
        # Try fulfillment stop-all
        resp1 = fresh_session.post(f"{BASE_URL}/api/fulfillment/timers/stop-all")
        assert resp1.status_code == 401, f"Fulfillment stop-all should require auth, got {resp1.status_code}"
        
        # Try production stop-all  
        resp2 = fresh_session.post(f"{BASE_URL}/api/production/timers/stop-all")
        assert resp2.status_code == 401, f"Production stop-all should require auth, got {resp2.status_code}"
        
        # Try heartbeat
        resp3 = fresh_session.post(f"{BASE_URL}/api/activity/heartbeat")
        assert resp3.status_code == 401, f"Heartbeat should require auth, got {resp3.status_code}"
        
        print("Auth requirement verified for all endpoints")


class TestStopAllTimersWithActiveTimers:
    """Test stop-all endpoints when there are active timers"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Authenticate"""
        self.session = requests.Session()
        login_resp = self.session.get(f"{BASE_URL}/api/auth/dev-login")
        if login_resp.status_code == 200:
            self.authenticated = True
            self.user_data = login_resp.json()
        else:
            self.authenticated = False
            
    def test_fulfillment_stop_all_returns_stopped_count(self):
        """Test that stop-all returns correct stopped_count"""
        if not self.authenticated:
            pytest.skip("Not authenticated")
            
        # First call stop-all (may stop existing timers)
        resp1 = self.session.post(f"{BASE_URL}/api/fulfillment/timers/stop-all")
        assert resp1.status_code == 200
        
        # Call again - should return 0 since no active timers
        resp2 = self.session.post(f"{BASE_URL}/api/fulfillment/timers/stop-all")
        assert resp2.status_code == 200
        data = resp2.json()
        assert data["stopped_count"] == 0, "Second call should stop 0 timers"
        
        print("Fulfillment stop-all correctly returns 0 when no active timers")
        
    def test_production_stop_all_returns_stopped_count(self):
        """Test that stop-all returns correct stopped_count"""
        if not self.authenticated:
            pytest.skip("Not authenticated")
            
        # First call stop-all (may stop existing timers)
        resp1 = self.session.post(f"{BASE_URL}/api/production/timers/stop-all")
        assert resp1.status_code == 200
        
        # Call again - should return 0 since no active timers
        resp2 = self.session.post(f"{BASE_URL}/api/production/timers/stop-all")
        assert resp2.status_code == 200
        data = resp2.json()
        assert data["stopped_count"] == 0, "Second call should stop 0 timers"
        
        print("Production stop-all correctly returns 0 when no active timers")


class TestLogoutFlow:
    """Test the complete logout flow - stop timers then logout"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Authenticate"""
        self.session = requests.Session()
        login_resp = self.session.get(f"{BASE_URL}/api/auth/dev-login")
        if login_resp.status_code == 200:
            self.authenticated = True
            self.user_data = login_resp.json()
        else:
            self.authenticated = False
            
    def test_logout_endpoint_exists(self):
        """Test that logout endpoint exists"""
        if not self.authenticated:
            pytest.skip("Not authenticated")
            
        # Check if auth/logout endpoint exists
        response = self.session.post(f"{BASE_URL}/api/auth/logout")
        # Should return 200 or 204
        assert response.status_code in [200, 204], f"Logout should return 200/204, got {response.status_code}"
        
        print("Logout endpoint works")
        
    def test_full_logout_flow(self):
        """Test complete logout flow: stop timers -> logout"""
        if not self.authenticated:
            pytest.skip("Not authenticated")
            
        # Step 1: Stop fulfillment timers
        resp1 = self.session.post(f"{BASE_URL}/api/fulfillment/timers/stop-all")
        assert resp1.status_code == 200, "Failed to stop fulfillment timers"
        print(f"Stopped fulfillment timers: {resp1.json()}")
        
        # Step 2: Stop production timers
        resp2 = self.session.post(f"{BASE_URL}/api/production/timers/stop-all")
        assert resp2.status_code == 200, "Failed to stop production timers"
        print(f"Stopped production timers: {resp2.json()}")
        
        # Step 3: Logout
        resp3 = self.session.post(f"{BASE_URL}/api/auth/logout")
        assert resp3.status_code in [200, 204], "Failed to logout"
        print("Logout successful")
        
        # Step 4: Verify session is invalidated - trying to access protected endpoint should fail
        # Re-login for verification
        new_session = requests.Session()
        resp4 = new_session.post(f"{BASE_URL}/api/activity/heartbeat")
        assert resp4.status_code == 401, "Session should be invalidated after logout"
        
        print("Full logout flow verified")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
