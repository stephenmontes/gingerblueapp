"""
Test Production Timers Router - Time Entry Management for Frame Production
Tests the new production time tracking endpoints that mirror fulfillment functionality
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test session tokens (created in test setup)
ADMIN_SESSION = "test_session_1770347171200"
WORKER_SESSION = "test_worker_session_1770347209279"


class TestProductionTimerEndpoints:
    """Test production timer GET endpoints"""
    
    def test_get_overall_kpis_this_week(self):
        """GET /api/production/stats/overall-kpis - This week period"""
        response = requests.get(
            f"{BASE_URL}/api/production/stats/overall-kpis?period=this_week",
            cookies={"session_token": ADMIN_SESSION}
        )
        assert response.status_code == 200
        data = response.json()
        assert "total_hours" in data
        assert "total_items" in data
        assert "labor_cost" in data
        assert "cost_per_item" in data
        assert "avg_time_per_item" in data
        assert "session_count" in data
        assert data["period"] == "this_week"
        assert data["period_label"] == "This Week"
        assert "date_range" in data
    
    def test_get_overall_kpis_today(self):
        """GET /api/production/stats/overall-kpis - Today period"""
        response = requests.get(
            f"{BASE_URL}/api/production/stats/overall-kpis?period=today",
            cookies={"session_token": ADMIN_SESSION}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["period"] == "today"
        assert data["period_label"] == "Today"
    
    def test_get_overall_kpis_all_time(self):
        """GET /api/production/stats/overall-kpis - All time period"""
        response = requests.get(
            f"{BASE_URL}/api/production/stats/overall-kpis?period=all_time",
            cookies={"session_token": ADMIN_SESSION}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["period"] == "all_time"
        assert data["period_label"] == "All Time"
    
    def test_get_user_kpis(self):
        """GET /api/production/stats/user-kpis - User's own KPIs"""
        response = requests.get(
            f"{BASE_URL}/api/production/stats/user-kpis",
            cookies={"session_token": ADMIN_SESSION}
        )
        assert response.status_code == 200
        data = response.json()
        assert "user_id" in data
        assert "user_name" in data
        assert "stages" in data
        assert "totals" in data
        assert isinstance(data["stages"], list)
        assert "total_hours" in data["totals"]
        assert "total_items" in data["totals"]
        assert "total_sessions" in data["totals"]
    
    def test_get_stage_kpis(self):
        """GET /api/production/stats/stage-kpis - KPIs by stage"""
        response = requests.get(
            f"{BASE_URL}/api/production/stats/stage-kpis",
            cookies={"session_token": ADMIN_SESSION}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # Should have production stages
        if len(data) > 0:
            stage = data[0]
            assert "stage_id" in stage
            assert "stage_name" in stage
            assert "users" in stage
            assert "totals" in stage
    
    def test_get_timer_history(self):
        """GET /api/production/timers/history - Timer history"""
        response = requests.get(
            f"{BASE_URL}/api/production/timers/history?limit=10",
            cookies={"session_token": ADMIN_SESSION}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_get_daily_hours_check(self):
        """GET /api/production/user/daily-hours-check - Daily hours check"""
        response = requests.get(
            f"{BASE_URL}/api/production/user/daily-hours-check",
            cookies={"session_token": ADMIN_SESSION}
        )
        assert response.status_code == 200
        data = response.json()
        assert "user_id" in data
        assert "user_name" in data
        assert "date" in data
        assert "completed_hours" in data
        assert "active_timer_hours" in data
        assert "total_hours" in data
        assert "daily_limit" in data
        assert data["daily_limit"] == 9
        assert "exceeds_limit" in data
        assert "remaining_hours" in data


class TestAdminTimeEntryCRUD:
    """Test admin CRUD operations for time entries"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data"""
        self.created_log_ids = []
        yield
        # Cleanup: Delete any created entries
        for log_id in self.created_log_ids:
            requests.delete(
                f"{BASE_URL}/api/production/admin/time-entries/{log_id}",
                cookies={"session_token": ADMIN_SESSION}
            )
    
    def test_get_admin_time_entries(self):
        """GET /api/production/admin/time-entries - Admin can view all entries"""
        response = requests.get(
            f"{BASE_URL}/api/production/admin/time-entries?limit=10",
            cookies={"session_token": ADMIN_SESSION}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_add_manual_time_entry(self):
        """POST /api/production/admin/time-entries/add - Add manual entry"""
        response = requests.post(
            f"{BASE_URL}/api/production/admin/time-entries/add",
            params={
                "user_id": "test-user-1770347171200",
                "user_name": "Test Admin User",
                "stage_id": "stage_cutting",
                "stage_name": "Cutting",
                "duration_minutes": 30,
                "items_processed": 5,
                "notes": "Pytest test entry"
            },
            cookies={"session_token": ADMIN_SESSION}
        )
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert data["message"] == "Manual time entry added"
        assert "log_id" in data
        self.created_log_ids.append(data["log_id"])
        
        # Verify entry was created
        verify_response = requests.get(
            f"{BASE_URL}/api/production/admin/time-entries?limit=10",
            cookies={"session_token": ADMIN_SESSION}
        )
        entries = verify_response.json()
        created_entry = next((e for e in entries if e["log_id"] == data["log_id"]), None)
        assert created_entry is not None
        assert created_entry["duration_minutes"] == 30
        assert created_entry["items_processed"] == 5
        assert created_entry["manual_entry"] == True
        assert created_entry["workflow_type"] == "production"
    
    def test_update_time_entry(self):
        """PUT /api/production/admin/time-entries/{log_id} - Update entry"""
        # First create an entry
        create_response = requests.post(
            f"{BASE_URL}/api/production/admin/time-entries/add",
            params={
                "user_id": "test-user-1770347171200",
                "user_name": "Test Admin User",
                "stage_id": "stage_assembly",
                "stage_name": "Assembly",
                "duration_minutes": 20,
                "items_processed": 3
            },
            cookies={"session_token": ADMIN_SESSION}
        )
        log_id = create_response.json()["log_id"]
        self.created_log_ids.append(log_id)
        
        # Update the entry
        update_response = requests.put(
            f"{BASE_URL}/api/production/admin/time-entries/{log_id}",
            params={
                "duration_minutes": 45,
                "items_processed": 8,
                "notes": "Updated via pytest"
            },
            cookies={"session_token": ADMIN_SESSION}
        )
        assert update_response.status_code == 200
        data = update_response.json()
        assert data["message"] == "Time entry updated"
        
        # Verify update
        verify_response = requests.get(
            f"{BASE_URL}/api/production/admin/time-entries?limit=10",
            cookies={"session_token": ADMIN_SESSION}
        )
        entries = verify_response.json()
        updated_entry = next((e for e in entries if e["log_id"] == log_id), None)
        assert updated_entry is not None
        assert updated_entry["duration_minutes"] == 45
        assert updated_entry["items_processed"] == 8
        assert updated_entry["admin_notes"] == "Updated via pytest"
        assert "edited_at" in updated_entry
        assert "original_duration_minutes" in updated_entry
        assert updated_entry["original_duration_minutes"] == 20
    
    def test_delete_time_entry(self):
        """DELETE /api/production/admin/time-entries/{log_id} - Delete entry"""
        # First create an entry
        create_response = requests.post(
            f"{BASE_URL}/api/production/admin/time-entries/add",
            params={
                "user_id": "test-user-1770347171200",
                "user_name": "Test Admin User",
                "stage_id": "stage_qc",
                "stage_name": "Sand",
                "duration_minutes": 15,
                "items_processed": 2
            },
            cookies={"session_token": ADMIN_SESSION}
        )
        log_id = create_response.json()["log_id"]
        
        # Delete the entry
        delete_response = requests.delete(
            f"{BASE_URL}/api/production/admin/time-entries/{log_id}",
            cookies={"session_token": ADMIN_SESSION}
        )
        assert delete_response.status_code == 200
        data = delete_response.json()
        assert data["message"] == "Time entry deleted"
        
        # Verify deletion
        verify_response = requests.get(
            f"{BASE_URL}/api/production/admin/time-entries?limit=100",
            cookies={"session_token": ADMIN_SESSION}
        )
        entries = verify_response.json()
        deleted_entry = next((e for e in entries if e["log_id"] == log_id), None)
        assert deleted_entry is None
    
    def test_delete_nonexistent_entry(self):
        """DELETE /api/production/admin/time-entries/{log_id} - 404 for nonexistent"""
        response = requests.delete(
            f"{BASE_URL}/api/production/admin/time-entries/nonexistent_log_id",
            cookies={"session_token": ADMIN_SESSION}
        )
        assert response.status_code == 404


class TestRoleBasedAccess:
    """Test role-based access control for admin endpoints"""
    
    def test_worker_cannot_view_admin_entries(self):
        """Worker role cannot access admin time entries"""
        response = requests.get(
            f"{BASE_URL}/api/production/admin/time-entries",
            cookies={"session_token": WORKER_SESSION}
        )
        assert response.status_code == 403
        assert "Only admins and managers" in response.json()["detail"]
    
    def test_worker_cannot_add_manual_entry(self):
        """Worker role cannot add manual time entries"""
        response = requests.post(
            f"{BASE_URL}/api/production/admin/time-entries/add",
            params={
                "user_id": "test",
                "user_name": "Test",
                "stage_id": "stage_cutting",
                "stage_name": "Cutting",
                "duration_minutes": 30
            },
            cookies={"session_token": WORKER_SESSION}
        )
        assert response.status_code == 403
        assert "Only admins and managers" in response.json()["detail"]
    
    def test_worker_cannot_update_entry(self):
        """Worker role cannot update time entries"""
        response = requests.put(
            f"{BASE_URL}/api/production/admin/time-entries/some_log_id",
            params={"duration_minutes": 60},
            cookies={"session_token": WORKER_SESSION}
        )
        assert response.status_code == 403
    
    def test_worker_cannot_delete_entry(self):
        """Worker role cannot delete time entries"""
        response = requests.delete(
            f"{BASE_URL}/api/production/admin/time-entries/some_log_id",
            cookies={"session_token": WORKER_SESSION}
        )
        assert response.status_code == 403
    
    def test_worker_can_access_user_kpis(self):
        """Worker role can access their own KPIs"""
        response = requests.get(
            f"{BASE_URL}/api/production/stats/user-kpis",
            cookies={"session_token": WORKER_SESSION}
        )
        assert response.status_code == 200
    
    def test_worker_can_access_daily_hours(self):
        """Worker role can check their daily hours"""
        response = requests.get(
            f"{BASE_URL}/api/production/user/daily-hours-check",
            cookies={"session_token": WORKER_SESSION}
        )
        assert response.status_code == 200


class TestKPIPeriods:
    """Test different KPI period calculations"""
    
    @pytest.mark.parametrize("period,expected_label", [
        ("today", "Today"),
        ("yesterday", "Yesterday"),
        ("this_week", "This Week"),
        ("last_week", "Last Week"),
        ("this_month", "This Month"),
        ("last_month", "Last Month"),
        ("all_time", "All Time"),
    ])
    def test_kpi_periods(self, period, expected_label):
        """Test all KPI period options"""
        response = requests.get(
            f"{BASE_URL}/api/production/stats/overall-kpis?period={period}",
            cookies={"session_token": ADMIN_SESSION}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["period"] == period
        assert data["period_label"] == expected_label


class TestAuthRequired:
    """Test authentication is required for all endpoints"""
    
    def test_no_auth_overall_kpis(self):
        """Overall KPIs requires authentication"""
        response = requests.get(f"{BASE_URL}/api/production/stats/overall-kpis")
        assert response.status_code == 401
    
    def test_no_auth_user_kpis(self):
        """User KPIs requires authentication"""
        response = requests.get(f"{BASE_URL}/api/production/stats/user-kpis")
        assert response.status_code == 401
    
    def test_no_auth_admin_entries(self):
        """Admin time entries requires authentication"""
        response = requests.get(f"{BASE_URL}/api/production/admin/time-entries")
        assert response.status_code == 401
    
    def test_no_auth_daily_hours(self):
        """Daily hours check requires authentication"""
        response = requests.get(f"{BASE_URL}/api/production/user/daily-hours-check")
        assert response.status_code == 401
