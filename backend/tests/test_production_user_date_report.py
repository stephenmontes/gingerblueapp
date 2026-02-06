"""
Test Production User Date Report - Hours by User & Date endpoint
Tests the /api/production/reports/hours-by-user-date endpoint
"""
import pytest
import requests
import os
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test session token - will be created in setup
SESSION_TOKEN = None
USER_ID = None


@pytest.fixture(scope="module", autouse=True)
def setup_test_data():
    """Create test user, session, and time logs for testing."""
    global SESSION_TOKEN, USER_ID
    
    import subprocess
    
    # Create test user and session
    timestamp = int(datetime.now().timestamp() * 1000)
    USER_ID = f"test-user-report-{timestamp}"
    SESSION_TOKEN = f"test_session_report_{timestamp}"
    
    # Create user and session in MongoDB
    mongo_script = f"""
    use('test_database');
    db.users.insertOne({{
        user_id: '{USER_ID}',
        email: 'test.report.{timestamp}@example.com',
        name: 'Report Test User',
        picture: 'https://via.placeholder.com/150',
        role: 'admin',
        created_at: new Date()
    }});
    db.user_sessions.insertOne({{
        user_id: '{USER_ID}',
        session_token: '{SESSION_TOKEN}',
        expires_at: new Date(Date.now() + 7*24*60*60*1000),
        created_at: new Date()
    }});
    """
    subprocess.run(['mongosh', '--eval', mongo_script], capture_output=True)
    
    # Create test time logs for production workflow
    now = datetime.now(timezone.utc)
    today = now.strftime("%Y-%m-%d")
    
    # Create time logs for today
    time_logs_script = f"""
    use('test_database');
    
    // Create time logs for today
    db.time_logs.insertMany([
        {{
            log_id: 'report_test_log_1_{timestamp}',
            user_id: '{USER_ID}',
            user_name: 'Report Test User',
            stage_id: 'stage_cutting',
            stage_name: 'Cutting',
            batch_id: 'batch_test_report_{timestamp}',
            workflow_type: 'production',
            action: 'complete',
            started_at: '{(now - timedelta(hours=2)).isoformat()}',
            completed_at: '{(now - timedelta(hours=1)).isoformat()}',
            duration_minutes: 60,
            items_processed: 10,
            is_paused: false,
            accumulated_minutes: 0
        }},
        {{
            log_id: 'report_test_log_2_{timestamp}',
            user_id: '{USER_ID}',
            user_name: 'Report Test User',
            stage_id: 'stage_assembly',
            stage_name: 'Assembly',
            batch_id: 'batch_test_report_{timestamp}',
            workflow_type: 'production',
            action: 'complete',
            started_at: '{(now - timedelta(hours=1)).isoformat()}',
            completed_at: '{now.isoformat()}',
            duration_minutes: 45,
            items_processed: 8,
            is_paused: false,
            accumulated_minutes: 0
        }}
    ]);
    """
    subprocess.run(['mongosh', '--eval', time_logs_script], capture_output=True)
    
    yield
    
    # Cleanup test data
    cleanup_script = f"""
    use('test_database');
    db.users.deleteOne({{ user_id: '{USER_ID}' }});
    db.user_sessions.deleteOne({{ session_token: '{SESSION_TOKEN}' }});
    db.time_logs.deleteMany({{ log_id: {{ $regex: 'report_test_log.*{timestamp}' }} }});
    """
    subprocess.run(['mongosh', '--eval', cleanup_script], capture_output=True)


@pytest.fixture
def api_client():
    """Create requests session with auth cookie."""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    session.cookies.set("session_token", SESSION_TOKEN)
    return session


class TestProductionHoursByUserDateEndpoint:
    """Test the /api/production/reports/hours-by-user-date endpoint."""
    
    def test_endpoint_returns_200_with_day_period(self, api_client):
        """Test endpoint returns 200 OK with day period."""
        response = api_client.get(f"{BASE_URL}/api/production/reports/hours-by-user-date?period=day")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    
    def test_endpoint_returns_200_with_week_period(self, api_client):
        """Test endpoint returns 200 OK with week period."""
        response = api_client.get(f"{BASE_URL}/api/production/reports/hours-by-user-date?period=week")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    
    def test_endpoint_returns_200_with_month_period(self, api_client):
        """Test endpoint returns 200 OK with month period."""
        response = api_client.get(f"{BASE_URL}/api/production/reports/hours-by-user-date?period=month")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    
    def test_response_structure(self, api_client):
        """Test response has correct structure."""
        response = api_client.get(f"{BASE_URL}/api/production/reports/hours-by-user-date?period=day")
        assert response.status_code == 200
        
        data = response.json()
        
        # Check top-level fields
        assert "period" in data, "Response should have 'period' field"
        assert "start_date" in data, "Response should have 'start_date' field"
        assert "data" in data, "Response should have 'data' field"
        assert "daily_limit_hours" in data, "Response should have 'daily_limit_hours' field"
        
        # Check period value
        assert data["period"] == "day", f"Expected period 'day', got '{data['period']}'"
        
        # Check daily_limit_hours is 9
        assert data["daily_limit_hours"] == 9, f"Expected daily_limit_hours 9, got {data['daily_limit_hours']}"
    
    def test_data_array_structure(self, api_client):
        """Test data array items have correct structure."""
        response = api_client.get(f"{BASE_URL}/api/production/reports/hours-by-user-date?period=week")
        assert response.status_code == 200
        
        data = response.json()
        
        # Data should be a list
        assert isinstance(data["data"], list), "data should be a list"
        
        # If there's data, check structure
        if len(data["data"]) > 0:
            item = data["data"][0]
            
            # Required fields for each user-date entry
            required_fields = [
                "user_id", "user_name", "date", "total_minutes", 
                "total_items", "entries", "exceeds_limit", 
                "total_hours", "labor_cost"
            ]
            
            for field in required_fields:
                assert field in item, f"Data item should have '{field}' field"
    
    def test_entries_array_structure(self, api_client):
        """Test entries array items have correct structure."""
        response = api_client.get(f"{BASE_URL}/api/production/reports/hours-by-user-date?period=week")
        assert response.status_code == 200
        
        data = response.json()
        
        # Find an item with entries
        for item in data["data"]:
            if len(item.get("entries", [])) > 0:
                entry = item["entries"][0]
                
                # Required fields for each entry
                required_fields = [
                    "log_id", "stage_name", "duration_minutes", 
                    "items_processed", "completed_at"
                ]
                
                for field in required_fields:
                    assert field in entry, f"Entry should have '{field}' field"
                
                # batch_id is optional but should be present if exists
                break
    
    def test_total_hours_calculation(self, api_client):
        """Test total_hours is correctly calculated from total_minutes."""
        response = api_client.get(f"{BASE_URL}/api/production/reports/hours-by-user-date?period=week")
        assert response.status_code == 200
        
        data = response.json()
        
        for item in data["data"]:
            expected_hours = round(item["total_minutes"] / 60, 2)
            assert item["total_hours"] == expected_hours, \
                f"total_hours should be {expected_hours}, got {item['total_hours']}"
    
    def test_labor_cost_calculation(self, api_client):
        """Test labor_cost is correctly calculated ($30/hour)."""
        response = api_client.get(f"{BASE_URL}/api/production/reports/hours-by-user-date?period=week")
        assert response.status_code == 200
        
        data = response.json()
        
        for item in data["data"]:
            expected_cost = round(item["total_hours"] * 30, 2)
            assert item["labor_cost"] == expected_cost, \
                f"labor_cost should be {expected_cost}, got {item['labor_cost']}"
    
    def test_exceeds_limit_flag(self, api_client):
        """Test exceeds_limit flag is correctly set based on daily_limit_hours."""
        response = api_client.get(f"{BASE_URL}/api/production/reports/hours-by-user-date?period=week")
        assert response.status_code == 200
        
        data = response.json()
        daily_limit = data["daily_limit_hours"]
        
        for item in data["data"]:
            expected_exceeds = item["total_hours"] > daily_limit
            assert item["exceeds_limit"] == expected_exceeds, \
                f"exceeds_limit should be {expected_exceeds} for {item['total_hours']}h (limit: {daily_limit}h)"
    
    def test_endpoint_requires_authentication(self):
        """Test endpoint returns 401 without authentication."""
        session = requests.Session()
        response = session.get(f"{BASE_URL}/api/production/reports/hours-by-user-date?period=day")
        assert response.status_code == 401, f"Expected 401 without auth, got {response.status_code}"
    
    def test_default_period_is_day(self, api_client):
        """Test default period is 'day' when not specified."""
        response = api_client.get(f"{BASE_URL}/api/production/reports/hours-by-user-date")
        assert response.status_code == 200
        
        data = response.json()
        assert data["period"] == "day", f"Default period should be 'day', got '{data['period']}'"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
