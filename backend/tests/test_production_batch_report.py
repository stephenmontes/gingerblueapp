"""
Test Production Batch Report Feature
Tests the GET /api/batches/{batch_id}/report endpoint for Frame Production page
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
SESSION_TOKEN = "test_session_1770347741585"

@pytest.fixture
def api_client():
    """Shared requests session with auth"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    session.cookies.set("session_token", SESSION_TOKEN)
    return session


class TestProductionBatchReportEndpoint:
    """Tests for GET /api/batches/{batch_id}/report endpoint"""
    
    def test_report_endpoint_returns_200(self, api_client):
        """Test that report endpoint returns 200 for valid batch"""
        # Use the test batch we created
        batch_id = "batch_1bb07e58a801"
        response = api_client.get(f"{BASE_URL}/api/batches/{batch_id}/report")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    
    def test_report_returns_correct_structure(self, api_client):
        """Test that report returns all required fields"""
        batch_id = "batch_1bb07e58a801"
        response = api_client.get(f"{BASE_URL}/api/batches/{batch_id}/report")
        assert response.status_code == 200
        
        data = response.json()
        
        # Check top-level fields
        assert "batch_id" in data
        assert "batch_name" in data
        assert "batch_type" in data
        assert "status" in data
        assert "created_at" in data
        
        # Check production_summary
        assert "production_summary" in data
        summary = data["production_summary"]
        assert "total_frames" in summary
        assert "frames_completed" in summary
        assert "frames_rejected" in summary
        assert "completion_rate" in summary
        
        # Check time_summary
        assert "time_summary" in data
        time_sum = data["time_summary"]
        assert "total_minutes" in time_sum
        assert "total_hours" in time_sum
        assert "total_cost" in time_sum
        assert "active_timers_count" in time_sum
        
        # Check stage_breakdown
        assert "stage_breakdown" in data
        assert isinstance(data["stage_breakdown"], list)
        
        # Check worker_breakdown
        assert "worker_breakdown" in data
        assert isinstance(data["worker_breakdown"], list)
        
        # Check metrics
        assert "metrics" in data
        metrics = data["metrics"]
        assert "items_per_hour" in metrics
        assert "cost_per_item" in metrics
        assert "avg_hourly_rate" in metrics
    
    def test_report_production_summary_values(self, api_client):
        """Test that production summary has correct values"""
        batch_id = "batch_1bb07e58a801"
        response = api_client.get(f"{BASE_URL}/api/batches/{batch_id}/report")
        assert response.status_code == 200
        
        data = response.json()
        summary = data["production_summary"]
        
        # Total frames should be 10 (5+3+2 from our test batch)
        assert summary["total_frames"] == 10
        # Completion rate should be calculated correctly
        assert 0 <= summary["completion_rate"] <= 100
        # Rejected should be >= 0
        assert summary["frames_rejected"] >= 0
    
    def test_report_stage_breakdown_structure(self, api_client):
        """Test that stage breakdown has correct structure"""
        batch_id = "batch_1bb07e58a801"
        response = api_client.get(f"{BASE_URL}/api/batches/{batch_id}/report")
        assert response.status_code == 200
        
        data = response.json()
        stages = data["stage_breakdown"]
        
        # We added time logs for cutting and assembly
        assert len(stages) >= 2
        
        for stage in stages:
            assert "stage_id" in stage
            assert "stage_name" in stage
            assert "total_minutes" in stage
            assert "total_hours" in stage
            assert "total_cost" in stage
            assert "workers" in stage
            assert isinstance(stage["workers"], list)
    
    def test_report_worker_breakdown_structure(self, api_client):
        """Test that worker breakdown has correct structure"""
        batch_id = "batch_1bb07e58a801"
        response = api_client.get(f"{BASE_URL}/api/batches/{batch_id}/report")
        assert response.status_code == 200
        
        data = response.json()
        workers = data["worker_breakdown"]
        
        # We have at least one worker
        assert len(workers) >= 1
        
        for worker in workers:
            assert "user_id" in worker
            assert "user_name" in worker
            assert "total_minutes" in worker
            assert "total_hours" in worker
            assert "hourly_rate" in worker
            assert "cost" in worker
            assert "items_processed" in worker
            assert "items_per_hour" in worker
            assert "is_active" in worker
    
    def test_report_metrics_values(self, api_client):
        """Test that metrics are calculated correctly"""
        batch_id = "batch_1bb07e58a801"
        response = api_client.get(f"{BASE_URL}/api/batches/{batch_id}/report")
        assert response.status_code == 200
        
        data = response.json()
        metrics = data["metrics"]
        
        # Items per hour should be >= 0
        assert metrics["items_per_hour"] >= 0
        # Cost per item should be >= 0
        assert metrics["cost_per_item"] >= 0
        # Avg hourly rate should be > 0 (default is 30)
        assert metrics["avg_hourly_rate"] > 0
    
    def test_report_404_for_invalid_batch(self, api_client):
        """Test that report returns 404 for non-existent batch"""
        response = api_client.get(f"{BASE_URL}/api/batches/invalid_batch_id/report")
        assert response.status_code == 404
    
    def test_report_time_summary_totals(self, api_client):
        """Test that time summary totals are correct"""
        batch_id = "batch_1bb07e58a801"
        response = api_client.get(f"{BASE_URL}/api/batches/{batch_id}/report")
        assert response.status_code == 200
        
        data = response.json()
        time_sum = data["time_summary"]
        
        # We added 30 + 20 = 50 minutes of time logs
        assert time_sum["total_minutes"] >= 50
        # Hours should be minutes / 60
        assert time_sum["total_hours"] >= 0.8
        # Cost should be calculated
        assert time_sum["total_cost"] >= 0


class TestReportWithNewBatch:
    """Tests for report with a freshly created batch"""
    
    def test_report_empty_batch(self, api_client):
        """Test report for batch with no time logs"""
        # Create a new on-demand batch
        create_response = api_client.post(f"{BASE_URL}/api/batches/on-demand", json={
            "name": "Empty Report Test Batch",
            "frames": [{"size": "S", "color": "W", "qty": 2}]
        })
        assert create_response.status_code == 200
        batch_id = create_response.json()["batch_id"]
        
        # Get report
        response = api_client.get(f"{BASE_URL}/api/batches/{batch_id}/report")
        assert response.status_code == 200
        
        data = response.json()
        
        # Should have 0 time logged
        assert data["time_summary"]["total_minutes"] == 0
        assert data["time_summary"]["total_hours"] == 0
        assert data["time_summary"]["total_cost"] == 0
        
        # Should have empty breakdowns
        assert len(data["stage_breakdown"]) == 0
        assert len(data["worker_breakdown"]) == 0
        
        # Production summary should show frames
        assert data["production_summary"]["total_frames"] == 2
        assert data["production_summary"]["frames_completed"] == 0
        
        # Cleanup - delete the batch
        api_client.delete(f"{BASE_URL}/api/batches/{batch_id}")


class TestReportAuthentication:
    """Tests for report endpoint authentication"""
    
    def test_report_requires_auth(self):
        """Test that report endpoint requires authentication"""
        session = requests.Session()
        response = session.get(f"{BASE_URL}/api/batches/batch_1bb07e58a801/report")
        # Should return 401 or redirect
        assert response.status_code in [401, 403, 307]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
