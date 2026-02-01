"""
Timer Enforcement Tests
Tests for per-user, per-stage time tracking with timer enforcement
- Timer must be started before updating quantities
- Timer must be started before marking items complete
- Only one timer allowed per user at a time
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
SESSION_TOKEN = "test123"

class TestTimerEnforcement:
    """Test timer enforcement for production stages"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - ensure no active timers before each test"""
        self.headers = {"Authorization": f"Bearer {SESSION_TOKEN}"}
        # Stop any active timers
        active_timers = requests.get(
            f"{BASE_URL}/api/user/active-timers",
            headers=self.headers
        ).json()
        for timer in active_timers:
            requests.post(
                f"{BASE_URL}/api/stages/{timer['stage_id']}/stop-timer?items_processed=0",
                headers=self.headers
            )
        yield
        # Cleanup - stop any timers after test
        active_timers = requests.get(
            f"{BASE_URL}/api/user/active-timers",
            headers=self.headers
        ).json()
        for timer in active_timers:
            requests.post(
                f"{BASE_URL}/api/stages/{timer['stage_id']}/stop-timer?items_processed=0",
                headers=self.headers
            )
    
    def test_auth_me_works(self):
        """Test authentication is working"""
        response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "user_id" in data
        assert data["email"] == "test@test.com"
        print(f"✓ Auth working for user: {data['name']}")
    
    def test_get_stages(self):
        """Test getting production stages"""
        response = requests.get(
            f"{BASE_URL}/api/stages",
            headers=self.headers
        )
        assert response.status_code == 200
        stages = response.json()
        assert len(stages) >= 6
        stage_names = [s["name"] for s in stages]
        assert "Cutting" in stage_names
        assert "Assembly" in stage_names
        print(f"✓ Got {len(stages)} stages: {stage_names}")
    
    def test_start_timer_success(self):
        """Test starting a timer for a stage"""
        response = requests.post(
            f"{BASE_URL}/api/stages/stage_cutting/start-timer",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "Timer started" in data["message"]
        assert data["stage_id"] == "stage_cutting"
        assert data["stage_name"] == "Cutting"
        assert "started_at" in data
        print(f"✓ Timer started: {data['message']}")
    
    def test_only_one_timer_allowed(self):
        """Test that only one timer is allowed per user at a time"""
        # Start first timer
        response1 = requests.post(
            f"{BASE_URL}/api/stages/stage_cutting/start-timer",
            headers=self.headers
        )
        assert response1.status_code == 200
        
        # Try to start second timer - should fail
        response2 = requests.post(
            f"{BASE_URL}/api/stages/stage_assembly/start-timer",
            headers=self.headers
        )
        assert response2.status_code == 400
        data = response2.json()
        assert "already have an active timer" in data["detail"]
        print(f"✓ Second timer blocked: {data['detail']}")
    
    def test_check_active_timer(self):
        """Test checking if user has active timer for a stage"""
        # Start timer
        requests.post(
            f"{BASE_URL}/api/stages/stage_cutting/start-timer",
            headers=self.headers
        )
        
        # Check active timer
        response = requests.get(
            f"{BASE_URL}/api/stages/stage_cutting/active-timer",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["active"] == True
        assert "started_at" in data
        assert data["stage_name"] == "Cutting"
        print(f"✓ Active timer check: {data}")
    
    def test_check_no_active_timer(self):
        """Test checking when no active timer exists"""
        response = requests.get(
            f"{BASE_URL}/api/stages/stage_cutting/active-timer",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["active"] == False
        print(f"✓ No active timer: {data}")
    
    def test_stop_timer_success(self):
        """Test stopping an active timer"""
        # Start timer
        requests.post(
            f"{BASE_URL}/api/stages/stage_cutting/start-timer",
            headers=self.headers
        )
        
        # Stop timer
        response = requests.post(
            f"{BASE_URL}/api/stages/stage_cutting/stop-timer?items_processed=5",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "Timer stopped"
        assert data["items_processed"] == 5
        assert "duration_minutes" in data
        print(f"✓ Timer stopped: {data}")
    
    def test_stop_timer_no_active(self):
        """Test stopping timer when none is active"""
        response = requests.post(
            f"{BASE_URL}/api/stages/stage_cutting/stop-timer?items_processed=0",
            headers=self.headers
        )
        assert response.status_code == 400
        data = response.json()
        assert "No active timer" in data["detail"]
        print(f"✓ Stop timer blocked when none active: {data['detail']}")
    
    def test_get_user_active_timers(self):
        """Test getting all active timers for user"""
        # Start timer
        requests.post(
            f"{BASE_URL}/api/stages/stage_cutting/start-timer",
            headers=self.headers
        )
        
        # Get active timers
        response = requests.get(
            f"{BASE_URL}/api/user/active-timers",
            headers=self.headers
        )
        assert response.status_code == 200
        timers = response.json()
        assert len(timers) == 1
        assert timers[0]["stage_id"] == "stage_cutting"
        print(f"✓ User active timers: {len(timers)} timer(s)")
    
    def test_timer_workflow(self):
        """Test complete timer workflow: start -> work -> stop -> start new"""
        # Start timer for cutting
        r1 = requests.post(
            f"{BASE_URL}/api/stages/stage_cutting/start-timer",
            headers=self.headers
        )
        assert r1.status_code == 200
        print("✓ Started cutting timer")
        
        # Verify active
        r2 = requests.get(
            f"{BASE_URL}/api/stages/stage_cutting/active-timer",
            headers=self.headers
        )
        assert r2.json()["active"] == True
        print("✓ Verified cutting timer active")
        
        # Stop timer
        r3 = requests.post(
            f"{BASE_URL}/api/stages/stage_cutting/stop-timer?items_processed=10",
            headers=self.headers
        )
        assert r3.status_code == 200
        print(f"✓ Stopped cutting timer: {r3.json()['duration_minutes']} minutes")
        
        # Now can start assembly timer
        r4 = requests.post(
            f"{BASE_URL}/api/stages/stage_assembly/start-timer",
            headers=self.headers
        )
        assert r4.status_code == 200
        print("✓ Started assembly timer after stopping cutting")


class TestBatchAndItems:
    """Test batch and item operations"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup"""
        self.headers = {"Authorization": f"Bearer {SESSION_TOKEN}"}
        yield
    
    def test_get_batches(self):
        """Test getting production batches"""
        response = requests.get(
            f"{BASE_URL}/api/batches",
            headers=self.headers
        )
        assert response.status_code == 200
        batches = response.json()
        assert isinstance(batches, list)
        print(f"✓ Got {len(batches)} batches")
        return batches
    
    def test_get_batch_details(self):
        """Test getting batch details with items"""
        # Get batches first
        batches = requests.get(
            f"{BASE_URL}/api/batches",
            headers=self.headers
        ).json()
        
        if not batches:
            pytest.skip("No batches available for testing")
        
        batch_id = batches[0]["batch_id"]
        response = requests.get(
            f"{BASE_URL}/api/batches/{batch_id}",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert "orders" in data
        print(f"✓ Batch {batch_id} has {len(data['items'])} items")
    
    def test_get_batch_stage_summary(self):
        """Test getting batch stage summary"""
        batches = requests.get(
            f"{BASE_URL}/api/batches",
            headers=self.headers
        ).json()
        
        if not batches:
            pytest.skip("No batches available for testing")
        
        batch_id = batches[0]["batch_id"]
        response = requests.get(
            f"{BASE_URL}/api/batches/{batch_id}/stage-summary",
            headers=self.headers
        )
        assert response.status_code == 200
        summary = response.json()
        assert isinstance(summary, list)
        print(f"✓ Stage summary has {len(summary)} stages")


class TestStageActiveWorkers:
    """Test active workers per stage"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup"""
        self.headers = {"Authorization": f"Bearer {SESSION_TOKEN}"}
        # Stop any active timers
        active_timers = requests.get(
            f"{BASE_URL}/api/user/active-timers",
            headers=self.headers
        ).json()
        for timer in active_timers:
            requests.post(
                f"{BASE_URL}/api/stages/{timer['stage_id']}/stop-timer?items_processed=0",
                headers=self.headers
            )
        yield
        # Cleanup
        active_timers = requests.get(
            f"{BASE_URL}/api/user/active-timers",
            headers=self.headers
        ).json()
        for timer in active_timers:
            requests.post(
                f"{BASE_URL}/api/stages/{timer['stage_id']}/stop-timer?items_processed=0",
                headers=self.headers
            )
    
    def test_get_active_workers(self):
        """Test getting active workers across all stages"""
        # Start a timer
        requests.post(
            f"{BASE_URL}/api/stages/stage_cutting/start-timer",
            headers=self.headers
        )
        
        response = requests.get(
            f"{BASE_URL}/api/stages/active-workers",
            headers=self.headers
        )
        assert response.status_code == 200
        workers = response.json()
        assert isinstance(workers, list)
        
        # Find cutting stage
        cutting_workers = [w for w in workers if w["stage_id"] == "stage_cutting"]
        assert len(cutting_workers) == 1
        assert len(cutting_workers[0]["workers"]) >= 1
        print(f"✓ Active workers: {workers}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
