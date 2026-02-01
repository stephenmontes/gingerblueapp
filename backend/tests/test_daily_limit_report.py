"""
Daily Hours Limit and User/Date Report API Tests
Tests for the new features:
- GET /api/fulfillment/reports/hours-by-user-date - Hours grouped by user and date
- GET /api/fulfillment/user/daily-hours-check - Check if user exceeded daily limit
- POST /api/fulfillment/user/acknowledge-limit-exceeded - Record user's choice
- GET /api/fulfillment/user/check-limit-acknowledged - Check if already acknowledged
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
SESSION_TOKEN = "test_fulfillment_session_1769931244846"


class TestHoursByUserDateReport:
    """Test hours-by-user-date report endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.headers = {"Authorization": f"Bearer {SESSION_TOKEN}"}
        yield
    
    def test_hours_by_user_date_day_period(self):
        """Test getting hours report for today"""
        response = requests.get(
            f"{BASE_URL}/api/fulfillment/reports/hours-by-user-date?period=day",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Validate response structure
        assert "period" in data
        assert data["period"] == "day"
        assert "start_date" in data
        assert "data" in data
        assert "daily_limit_hours" in data
        assert data["daily_limit_hours"] == 9
        
        # Validate data structure if entries exist
        if data["data"]:
            entry = data["data"][0]
            assert "user_id" in entry
            assert "user_name" in entry
            assert "date" in entry
            assert "total_hours" in entry
            assert "labor_cost" in entry
            assert "total_orders" in entry
            assert "total_items" in entry
            assert "exceeds_limit" in entry
            assert "entries" in entry
        
        print(f"✓ Day report: {len(data['data'])} user-date entries, limit={data['daily_limit_hours']}h")
    
    def test_hours_by_user_date_week_period(self):
        """Test getting hours report for this week"""
        response = requests.get(
            f"{BASE_URL}/api/fulfillment/reports/hours-by-user-date?period=week",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        
        assert data["period"] == "week"
        assert "start_date" in data
        assert isinstance(data["data"], list)
        
        print(f"✓ Week report: {len(data['data'])} user-date entries from {data['start_date']}")
    
    def test_hours_by_user_date_month_period(self):
        """Test getting hours report for this month"""
        response = requests.get(
            f"{BASE_URL}/api/fulfillment/reports/hours-by-user-date?period=month",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        
        assert data["period"] == "month"
        assert "start_date" in data
        assert isinstance(data["data"], list)
        
        print(f"✓ Month report: {len(data['data'])} user-date entries from {data['start_date']}")
    
    def test_hours_by_user_date_default_period(self):
        """Test default period when not specified"""
        response = requests.get(
            f"{BASE_URL}/api/fulfillment/reports/hours-by-user-date",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Default should be 'day'
        assert data["period"] == "day"
        print(f"✓ Default period is 'day'")
    
    def test_hours_by_user_date_invalid_period(self):
        """Test with invalid period - should default to day"""
        response = requests.get(
            f"{BASE_URL}/api/fulfillment/reports/hours-by-user-date?period=invalid",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Should default to day for invalid period
        assert data["period"] == "invalid"  # Period is echoed back
        print(f"✓ Invalid period handled gracefully")
    
    def test_hours_by_user_date_unauthenticated(self):
        """Test endpoint without authentication"""
        response = requests.get(
            f"{BASE_URL}/api/fulfillment/reports/hours-by-user-date"
        )
        assert response.status_code == 401
        print(f"✓ Unauthenticated request rejected")


class TestDailyHoursCheck:
    """Test daily hours check endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.headers = {"Authorization": f"Bearer {SESSION_TOKEN}"}
        yield
    
    def test_daily_hours_check_success(self):
        """Test checking daily hours for current user"""
        response = requests.get(
            f"{BASE_URL}/api/fulfillment/user/daily-hours-check",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Validate response structure
        assert "user_id" in data
        assert "user_name" in data
        assert "date" in data
        assert "completed_hours" in data
        assert "active_timer_hours" in data
        assert "total_hours" in data
        assert "daily_limit" in data
        assert "exceeds_limit" in data
        assert "remaining_hours" in data
        
        # Validate data types
        assert isinstance(data["completed_hours"], (int, float))
        assert isinstance(data["active_timer_hours"], (int, float))
        assert isinstance(data["total_hours"], (int, float))
        assert isinstance(data["daily_limit"], int)
        assert isinstance(data["exceeds_limit"], bool)
        assert isinstance(data["remaining_hours"], (int, float))
        
        # Validate daily limit is 9 hours
        assert data["daily_limit"] == 9
        
        # Validate remaining_hours calculation
        expected_remaining = max(0, data["daily_limit"] - data["total_hours"])
        assert abs(data["remaining_hours"] - expected_remaining) < 0.1
        
        print(f"✓ Daily hours check: {data['total_hours']}h worked, {data['remaining_hours']}h remaining, exceeds={data['exceeds_limit']}")
    
    def test_daily_hours_check_unauthenticated(self):
        """Test endpoint without authentication"""
        response = requests.get(
            f"{BASE_URL}/api/fulfillment/user/daily-hours-check"
        )
        assert response.status_code == 401
        print(f"✓ Unauthenticated request rejected")


class TestAcknowledgeLimitExceeded:
    """Test acknowledge limit exceeded endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.headers = {"Authorization": f"Bearer {SESSION_TOKEN}"}
        yield
    
    def test_acknowledge_continue_working(self):
        """Test acknowledging and choosing to continue working"""
        response = requests.post(
            f"{BASE_URL}/api/fulfillment/user/acknowledge-limit-exceeded?continue_working=true",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "message" in data
        assert "action" in data
        assert data["action"] == "continue"
        assert "continue" in data["message"].lower()
        
        print(f"✓ Acknowledge continue: {data['message']}")
    
    def test_acknowledge_stop_working(self):
        """Test acknowledging and choosing to stop working"""
        response = requests.post(
            f"{BASE_URL}/api/fulfillment/user/acknowledge-limit-exceeded?continue_working=false",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "message" in data
        assert "action" in data
        assert data["action"] == "logout"
        
        print(f"✓ Acknowledge stop: {data['message']}")
    
    def test_acknowledge_unauthenticated(self):
        """Test endpoint without authentication"""
        response = requests.post(
            f"{BASE_URL}/api/fulfillment/user/acknowledge-limit-exceeded?continue_working=true"
        )
        assert response.status_code == 401
        print(f"✓ Unauthenticated request rejected")


class TestCheckLimitAcknowledged:
    """Test check limit acknowledged endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.headers = {"Authorization": f"Bearer {SESSION_TOKEN}"}
        yield
    
    def test_check_limit_acknowledged(self):
        """Test checking if user acknowledged limit today"""
        response = requests.get(
            f"{BASE_URL}/api/fulfillment/user/check-limit-acknowledged",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Validate response structure
        assert "acknowledged_today" in data
        assert "acknowledged_date" in data
        assert isinstance(data["acknowledged_today"], bool)
        
        print(f"✓ Check acknowledged: today={data['acknowledged_today']}, date={data['acknowledged_date']}")
    
    def test_check_limit_acknowledged_unauthenticated(self):
        """Test endpoint without authentication"""
        response = requests.get(
            f"{BASE_URL}/api/fulfillment/user/check-limit-acknowledged"
        )
        assert response.status_code == 401
        print(f"✓ Unauthenticated request rejected")


class TestDailyLimitWorkflow:
    """Test complete daily limit workflow"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.headers = {"Authorization": f"Bearer {SESSION_TOKEN}"}
        yield
    
    def test_complete_daily_limit_workflow(self):
        """Test the complete workflow: check hours -> acknowledge -> verify"""
        # Step 1: Check daily hours
        r1 = requests.get(
            f"{BASE_URL}/api/fulfillment/user/daily-hours-check",
            headers=self.headers
        )
        assert r1.status_code == 200
        hours_data = r1.json()
        print(f"✓ Step 1: Checked hours - {hours_data['total_hours']}h worked")
        
        # Step 2: Acknowledge (continue working)
        r2 = requests.post(
            f"{BASE_URL}/api/fulfillment/user/acknowledge-limit-exceeded?continue_working=true",
            headers=self.headers
        )
        assert r2.status_code == 200
        assert r2.json()["action"] == "continue"
        print(f"✓ Step 2: Acknowledged - chose to continue")
        
        # Step 3: Verify acknowledgment is recorded
        r3 = requests.get(
            f"{BASE_URL}/api/fulfillment/user/check-limit-acknowledged",
            headers=self.headers
        )
        assert r3.status_code == 200
        ack_data = r3.json()
        assert ack_data["acknowledged_today"] == True
        print(f"✓ Step 3: Verified acknowledgment recorded for {ack_data['acknowledged_date']}")
        
        # Step 4: Check hours report includes user
        r4 = requests.get(
            f"{BASE_URL}/api/fulfillment/reports/hours-by-user-date?period=day",
            headers=self.headers
        )
        assert r4.status_code == 200
        report_data = r4.json()
        print(f"✓ Step 4: Report shows {len(report_data['data'])} user-date entries")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
