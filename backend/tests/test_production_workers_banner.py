"""
Tests for Production Workers Banner feature
Tests the /api/stages/active-workers endpoint that returns workers grouped by stage
"""
import pytest
import requests
import os
from datetime import datetime, timezone

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')

class TestProductionWorkersBanner:
    """Tests for the active-workers endpoint used by ProductionWorkersBanner"""
    
    @pytest.fixture(autouse=True)
    def setup(self, api_client, auth_token):
        """Setup for each test"""
        self.client = api_client
        self.token = auth_token
        self.headers = {"Cookie": f"session_token={auth_token}"}
    
    def test_active_workers_endpoint_returns_200(self, api_client, auth_token):
        """Test that /api/stages/active-workers returns 200 OK"""
        response = api_client.get(
            f"{BASE_URL}/api/stages/active-workers",
            headers={"Cookie": f"session_token={auth_token}"}
        )
        assert response.status_code == 200
        
    def test_active_workers_returns_dict(self, api_client, auth_token):
        """Test that response is a dictionary (workers grouped by stage)"""
        response = api_client.get(
            f"{BASE_URL}/api/stages/active-workers",
            headers={"Cookie": f"session_token={auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)
        
    def test_active_workers_grouped_by_stage(self, api_client, auth_token):
        """Test that workers are grouped by stage_id"""
        response = api_client.get(
            f"{BASE_URL}/api/stages/active-workers",
            headers={"Cookie": f"session_token={auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Each key should be a stage_id, each value should be a list
        for stage_id, workers in data.items():
            assert isinstance(stage_id, str)
            assert isinstance(workers, list)
            
    def test_worker_data_structure(self, api_client, auth_token):
        """Test that each worker has required fields"""
        response = api_client.get(
            f"{BASE_URL}/api/stages/active-workers",
            headers={"Cookie": f"session_token={auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Check worker structure if there are any workers
        for stage_id, workers in data.items():
            for worker in workers:
                assert "user_id" in worker
                assert "user_name" in worker
                assert "started_at" in worker
                assert "is_paused" in worker
                assert "accumulated_minutes" in worker
                
    def test_worker_is_paused_is_boolean(self, api_client, auth_token):
        """Test that is_paused field is a boolean"""
        response = api_client.get(
            f"{BASE_URL}/api/stages/active-workers",
            headers={"Cookie": f"session_token={auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        for stage_id, workers in data.items():
            for worker in workers:
                assert isinstance(worker["is_paused"], bool)
                
    def test_worker_started_at_is_iso_format(self, api_client, auth_token):
        """Test that started_at is in ISO format"""
        response = api_client.get(
            f"{BASE_URL}/api/stages/active-workers",
            headers={"Cookie": f"session_token={auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        for stage_id, workers in data.items():
            for worker in workers:
                # Should be parseable as ISO datetime
                try:
                    datetime.fromisoformat(worker["started_at"].replace('Z', '+00:00'))
                except ValueError:
                    pytest.fail(f"started_at is not valid ISO format: {worker['started_at']}")
                    
    def test_endpoint_requires_authentication(self, api_client):
        """Test that endpoint returns 401 without authentication"""
        response = api_client.get(f"{BASE_URL}/api/stages/active-workers")
        assert response.status_code == 401
        
    def test_stages_endpoint_returns_200(self, api_client, auth_token):
        """Test that /api/stages returns 200 OK (used for stage info)"""
        response = api_client.get(
            f"{BASE_URL}/api/stages",
            headers={"Cookie": f"session_token={auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        
    def test_stages_have_required_fields(self, api_client, auth_token):
        """Test that stages have required fields for banner display"""
        response = api_client.get(
            f"{BASE_URL}/api/stages",
            headers={"Cookie": f"session_token={auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        for stage in data:
            assert "stage_id" in stage
            assert "name" in stage
            assert "color" in stage


@pytest.fixture
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture
def auth_token():
    """Get authentication token from test session"""
    return "test_session_1770350235642"
