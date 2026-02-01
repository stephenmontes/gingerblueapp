"""
Fulfillment Timer API Tests
Tests for fulfillment stage time tracking with timer operations:
- Start/Stop/Pause/Resume timer
- Active timer retrieval
- Active workers per stage
- User KPIs and Stage KPIs
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
SESSION_TOKEN = "test_fulfillment_session_1769931244846"

# Fulfillment stage IDs
STAGE_ORDERS = "fulfill_orders"
STAGE_PRINT = "fulfill_print"
STAGE_MOUNT = "fulfill_mount"
STAGE_FINISH = "fulfill_finish"
STAGE_PACK = "fulfill_pack"


class TestFulfillmentTimerAuth:
    """Test authentication for fulfillment timer endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.headers = {"Authorization": f"Bearer {SESSION_TOKEN}"}
        yield
    
    def test_auth_me_works(self):
        """Test authentication is working"""
        response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "user_id" in data
        assert "email" in data
        print(f"✓ Auth working for user: {data['name']}")


class TestFulfillmentTimerOperations:
    """Test fulfillment timer start/stop/pause/resume operations"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - ensure no active timers before each test"""
        self.headers = {"Authorization": f"Bearer {SESSION_TOKEN}"}
        # Stop any active fulfillment timers
        active_timers = requests.get(
            f"{BASE_URL}/api/fulfillment/user/active-timer",
            headers=self.headers
        ).json()
        for timer in active_timers:
            requests.post(
                f"{BASE_URL}/api/fulfillment/stages/{timer['stage_id']}/stop-timer?orders_processed=0&items_processed=0",
                headers=self.headers
            )
        yield
        # Cleanup - stop any timers after test
        active_timers = requests.get(
            f"{BASE_URL}/api/fulfillment/user/active-timer",
            headers=self.headers
        ).json()
        for timer in active_timers:
            requests.post(
                f"{BASE_URL}/api/fulfillment/stages/{timer['stage_id']}/stop-timer?orders_processed=0&items_processed=0",
                headers=self.headers
            )
    
    def test_start_timer_success(self):
        """Test starting a fulfillment timer for a stage"""
        response = requests.post(
            f"{BASE_URL}/api/fulfillment/stages/{STAGE_ORDERS}/start-timer",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "Timer started" in data["message"]
        assert data["stage_id"] == STAGE_ORDERS
        assert data["stage_name"] == "Orders"
        assert "started_at" in data
        assert "log_id" in data
        print(f"✓ Timer started: {data['message']}")
    
    def test_start_timer_invalid_stage(self):
        """Test starting timer for non-existent stage"""
        response = requests.post(
            f"{BASE_URL}/api/fulfillment/stages/invalid_stage/start-timer",
            headers=self.headers
        )
        assert response.status_code == 404
        data = response.json()
        assert "not found" in data["detail"].lower()
        print(f"✓ Invalid stage rejected: {data['detail']}")
    
    def test_only_one_timer_allowed(self):
        """Test that only one fulfillment timer is allowed per user at a time"""
        # Start first timer
        response1 = requests.post(
            f"{BASE_URL}/api/fulfillment/stages/{STAGE_ORDERS}/start-timer",
            headers=self.headers
        )
        assert response1.status_code == 200
        
        # Try to start second timer - should fail
        response2 = requests.post(
            f"{BASE_URL}/api/fulfillment/stages/{STAGE_PRINT}/start-timer",
            headers=self.headers
        )
        assert response2.status_code == 400
        data = response2.json()
        assert "already have an active timer" in data["detail"]
        print(f"✓ Second timer blocked: {data['detail']}")
    
    def test_pause_timer_success(self):
        """Test pausing an active fulfillment timer"""
        # Start timer first
        requests.post(
            f"{BASE_URL}/api/fulfillment/stages/{STAGE_ORDERS}/start-timer",
            headers=self.headers
        )
        
        # Pause timer
        response = requests.post(
            f"{BASE_URL}/api/fulfillment/stages/{STAGE_ORDERS}/pause-timer",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "Timer paused"
        assert "accumulated_minutes" in data
        print(f"✓ Timer paused: accumulated {data['accumulated_minutes']} minutes")
    
    def test_pause_timer_no_active(self):
        """Test pausing when no active timer exists"""
        response = requests.post(
            f"{BASE_URL}/api/fulfillment/stages/{STAGE_ORDERS}/pause-timer",
            headers=self.headers
        )
        assert response.status_code == 400
        data = response.json()
        assert "No active timer" in data["detail"]
        print(f"✓ Pause blocked when no timer: {data['detail']}")
    
    def test_pause_timer_already_paused(self):
        """Test pausing an already paused timer"""
        # Start and pause timer
        requests.post(
            f"{BASE_URL}/api/fulfillment/stages/{STAGE_ORDERS}/start-timer",
            headers=self.headers
        )
        requests.post(
            f"{BASE_URL}/api/fulfillment/stages/{STAGE_ORDERS}/pause-timer",
            headers=self.headers
        )
        
        # Try to pause again
        response = requests.post(
            f"{BASE_URL}/api/fulfillment/stages/{STAGE_ORDERS}/pause-timer",
            headers=self.headers
        )
        assert response.status_code == 400
        data = response.json()
        assert "already paused" in data["detail"]
        print(f"✓ Double pause blocked: {data['detail']}")
    
    def test_resume_timer_success(self):
        """Test resuming a paused fulfillment timer"""
        # Start and pause timer
        requests.post(
            f"{BASE_URL}/api/fulfillment/stages/{STAGE_ORDERS}/start-timer",
            headers=self.headers
        )
        requests.post(
            f"{BASE_URL}/api/fulfillment/stages/{STAGE_ORDERS}/pause-timer",
            headers=self.headers
        )
        
        # Resume timer
        response = requests.post(
            f"{BASE_URL}/api/fulfillment/stages/{STAGE_ORDERS}/resume-timer",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "Timer resumed"
        assert "started_at" in data
        print(f"✓ Timer resumed at: {data['started_at']}")
    
    def test_resume_timer_not_paused(self):
        """Test resuming a timer that is not paused"""
        # Start timer (not paused)
        requests.post(
            f"{BASE_URL}/api/fulfillment/stages/{STAGE_ORDERS}/start-timer",
            headers=self.headers
        )
        
        # Try to resume
        response = requests.post(
            f"{BASE_URL}/api/fulfillment/stages/{STAGE_ORDERS}/resume-timer",
            headers=self.headers
        )
        assert response.status_code == 400
        data = response.json()
        assert "not paused" in data["detail"]
        print(f"✓ Resume blocked when not paused: {data['detail']}")
    
    def test_stop_timer_success(self):
        """Test stopping an active fulfillment timer"""
        # Start timer
        requests.post(
            f"{BASE_URL}/api/fulfillment/stages/{STAGE_ORDERS}/start-timer",
            headers=self.headers
        )
        
        # Stop timer with processed counts
        response = requests.post(
            f"{BASE_URL}/api/fulfillment/stages/{STAGE_ORDERS}/stop-timer?orders_processed=5&items_processed=10",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "Timer stopped"
        assert data["stage_id"] == STAGE_ORDERS
        assert data["orders_processed"] == 5
        assert data["items_processed"] == 10
        assert "duration_minutes" in data
        print(f"✓ Timer stopped: {data['duration_minutes']} minutes, {data['orders_processed']} orders")
    
    def test_stop_timer_no_active(self):
        """Test stopping when no active timer exists"""
        response = requests.post(
            f"{BASE_URL}/api/fulfillment/stages/{STAGE_ORDERS}/stop-timer?orders_processed=0&items_processed=0",
            headers=self.headers
        )
        assert response.status_code == 400
        data = response.json()
        assert "No active timer" in data["detail"]
        print(f"✓ Stop blocked when no timer: {data['detail']}")


class TestFulfillmentActiveTimer:
    """Test active timer retrieval endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.headers = {"Authorization": f"Bearer {SESSION_TOKEN}"}
        # Stop any active fulfillment timers
        active_timers = requests.get(
            f"{BASE_URL}/api/fulfillment/user/active-timer",
            headers=self.headers
        ).json()
        for timer in active_timers:
            requests.post(
                f"{BASE_URL}/api/fulfillment/stages/{timer['stage_id']}/stop-timer?orders_processed=0&items_processed=0",
                headers=self.headers
            )
        yield
        # Cleanup
        active_timers = requests.get(
            f"{BASE_URL}/api/fulfillment/user/active-timer",
            headers=self.headers
        ).json()
        for timer in active_timers:
            requests.post(
                f"{BASE_URL}/api/fulfillment/stages/{timer['stage_id']}/stop-timer?orders_processed=0&items_processed=0",
                headers=self.headers
            )
    
    def test_get_active_timer_empty(self):
        """Test getting active timer when none exists"""
        response = requests.get(
            f"{BASE_URL}/api/fulfillment/user/active-timer",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 0
        print("✓ No active timer returns empty array")
    
    def test_get_active_timer_with_timer(self):
        """Test getting active timer when one exists"""
        # Start timer
        requests.post(
            f"{BASE_URL}/api/fulfillment/stages/{STAGE_ORDERS}/start-timer",
            headers=self.headers
        )
        
        # Get active timer
        response = requests.get(
            f"{BASE_URL}/api/fulfillment/user/active-timer",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 1
        timer = data[0]
        assert timer["stage_id"] == STAGE_ORDERS
        assert timer["stage_name"] == "Orders"
        assert "started_at" in timer
        assert "is_paused" in timer
        assert timer["is_paused"] == False
        print(f"✓ Active timer found: {timer['stage_name']}")
    
    def test_get_active_timer_paused_state(self):
        """Test active timer shows paused state correctly"""
        # Start and pause timer
        requests.post(
            f"{BASE_URL}/api/fulfillment/stages/{STAGE_ORDERS}/start-timer",
            headers=self.headers
        )
        requests.post(
            f"{BASE_URL}/api/fulfillment/stages/{STAGE_ORDERS}/pause-timer",
            headers=self.headers
        )
        
        # Get active timer
        response = requests.get(
            f"{BASE_URL}/api/fulfillment/user/active-timer",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        timer = data[0]
        assert timer["is_paused"] == True
        assert timer["accumulated_minutes"] > 0 or timer["accumulated_minutes"] == 0
        print(f"✓ Paused timer state correct: is_paused={timer['is_paused']}")


class TestFulfillmentActiveWorkers:
    """Test active workers per stage endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.headers = {"Authorization": f"Bearer {SESSION_TOKEN}"}
        # Stop any active fulfillment timers
        active_timers = requests.get(
            f"{BASE_URL}/api/fulfillment/user/active-timer",
            headers=self.headers
        ).json()
        for timer in active_timers:
            requests.post(
                f"{BASE_URL}/api/fulfillment/stages/{timer['stage_id']}/stop-timer?orders_processed=0&items_processed=0",
                headers=self.headers
            )
        yield
        # Cleanup
        active_timers = requests.get(
            f"{BASE_URL}/api/fulfillment/user/active-timer",
            headers=self.headers
        ).json()
        for timer in active_timers:
            requests.post(
                f"{BASE_URL}/api/fulfillment/stages/{timer['stage_id']}/stop-timer?orders_processed=0&items_processed=0",
                headers=self.headers
            )
    
    def test_get_active_workers_empty(self):
        """Test getting active workers when none exist"""
        response = requests.get(
            f"{BASE_URL}/api/fulfillment/stages/{STAGE_PRINT}/active-workers",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Active workers for {STAGE_PRINT}: {len(data)} workers")
    
    def test_get_active_workers_with_timer(self):
        """Test getting active workers when user has timer"""
        # Start timer
        requests.post(
            f"{BASE_URL}/api/fulfillment/stages/{STAGE_ORDERS}/start-timer",
            headers=self.headers
        )
        
        # Get active workers
        response = requests.get(
            f"{BASE_URL}/api/fulfillment/stages/{STAGE_ORDERS}/active-workers",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 1
        
        # Find our user
        our_worker = next((w for w in data if "test-user-fulfillment" in w["user_id"]), None)
        assert our_worker is not None
        assert "user_name" in our_worker
        assert "started_at" in our_worker
        assert "is_paused" in our_worker
        print(f"✓ Found {len(data)} active workers including test user")


class TestFulfillmentKPIs:
    """Test KPI endpoints for fulfillment stages"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.headers = {"Authorization": f"Bearer {SESSION_TOKEN}"}
        yield
    
    def test_get_user_kpis(self):
        """Test getting user KPIs aggregated by stage"""
        response = requests.get(
            f"{BASE_URL}/api/fulfillment/stats/user-kpis",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "user_id" in data
        assert "user_name" in data
        assert "stages" in data
        assert "totals" in data
        assert isinstance(data["stages"], list)
        assert "total_hours" in data["totals"]
        assert "total_orders" in data["totals"]
        assert "total_sessions" in data["totals"]
        print(f"✓ User KPIs: {data['totals']['total_orders']} orders, {data['totals']['total_hours']} hours")
    
    def test_get_user_kpis_with_stage_filter(self):
        """Test getting user KPIs filtered by stage"""
        response = requests.get(
            f"{BASE_URL}/api/fulfillment/stats/user-kpis?stage_id={STAGE_ORDERS}",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "stages" in data
        # All stages should be for the filtered stage
        for stage in data["stages"]:
            assert stage["stage_id"] == STAGE_ORDERS
        print(f"✓ Filtered user KPIs for {STAGE_ORDERS}")
    
    def test_get_stage_kpis(self):
        """Test getting stage KPIs by user"""
        response = requests.get(
            f"{BASE_URL}/api/fulfillment/stats/stage-kpis",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 5  # Should have all fulfillment stages
        
        for stage in data:
            assert "stage_id" in stage
            assert "stage_name" in stage
            assert "users" in stage
            assert "totals" in stage
            assert isinstance(stage["users"], list)
            assert "total_hours" in stage["totals"]
            assert "total_orders" in stage["totals"]
            assert "worker_count" in stage["totals"]
        
        stage_ids = [s["stage_id"] for s in data]
        assert STAGE_ORDERS in stage_ids
        assert STAGE_PRINT in stage_ids
        print(f"✓ Stage KPIs for {len(data)} stages")


class TestFulfillmentTimerWorkflow:
    """Test complete timer workflow scenarios"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.headers = {"Authorization": f"Bearer {SESSION_TOKEN}"}
        # Stop any active fulfillment timers
        active_timers = requests.get(
            f"{BASE_URL}/api/fulfillment/user/active-timer",
            headers=self.headers
        ).json()
        for timer in active_timers:
            requests.post(
                f"{BASE_URL}/api/fulfillment/stages/{timer['stage_id']}/stop-timer?orders_processed=0&items_processed=0",
                headers=self.headers
            )
        yield
        # Cleanup
        active_timers = requests.get(
            f"{BASE_URL}/api/fulfillment/user/active-timer",
            headers=self.headers
        ).json()
        for timer in active_timers:
            requests.post(
                f"{BASE_URL}/api/fulfillment/stages/{timer['stage_id']}/stop-timer?orders_processed=0&items_processed=0",
                headers=self.headers
            )
    
    def test_complete_timer_workflow(self):
        """Test complete workflow: start -> pause -> resume -> stop"""
        # 1. Start timer
        r1 = requests.post(
            f"{BASE_URL}/api/fulfillment/stages/{STAGE_PRINT}/start-timer",
            headers=self.headers
        )
        assert r1.status_code == 200
        print("✓ Step 1: Timer started")
        
        # 2. Verify active
        r2 = requests.get(
            f"{BASE_URL}/api/fulfillment/user/active-timer",
            headers=self.headers
        )
        assert len(r2.json()) == 1
        assert r2.json()[0]["stage_id"] == STAGE_PRINT
        print("✓ Step 2: Timer verified active")
        
        # 3. Pause timer
        r3 = requests.post(
            f"{BASE_URL}/api/fulfillment/stages/{STAGE_PRINT}/pause-timer",
            headers=self.headers
        )
        assert r3.status_code == 200
        print(f"✓ Step 3: Timer paused, accumulated: {r3.json()['accumulated_minutes']} min")
        
        # 4. Verify paused state
        r4 = requests.get(
            f"{BASE_URL}/api/fulfillment/user/active-timer",
            headers=self.headers
        )
        assert r4.json()[0]["is_paused"] == True
        print("✓ Step 4: Paused state verified")
        
        # 5. Resume timer
        r5 = requests.post(
            f"{BASE_URL}/api/fulfillment/stages/{STAGE_PRINT}/resume-timer",
            headers=self.headers
        )
        assert r5.status_code == 200
        print(f"✓ Step 5: Timer resumed at {r5.json()['started_at']}")
        
        # 6. Stop timer
        r6 = requests.post(
            f"{BASE_URL}/api/fulfillment/stages/{STAGE_PRINT}/stop-timer?orders_processed=3&items_processed=7",
            headers=self.headers
        )
        assert r6.status_code == 200
        assert r6.json()["orders_processed"] == 3
        assert r6.json()["items_processed"] == 7
        print(f"✓ Step 6: Timer stopped, duration: {r6.json()['duration_minutes']} min")
        
        # 7. Verify no active timer
        r7 = requests.get(
            f"{BASE_URL}/api/fulfillment/user/active-timer",
            headers=self.headers
        )
        assert len(r7.json()) == 0
        print("✓ Step 7: No active timer after stop")
    
    def test_switch_stages_workflow(self):
        """Test switching between stages: stop one, start another"""
        # Start timer for Orders
        r1 = requests.post(
            f"{BASE_URL}/api/fulfillment/stages/{STAGE_ORDERS}/start-timer",
            headers=self.headers
        )
        assert r1.status_code == 200
        print("✓ Started Orders timer")
        
        # Stop Orders timer
        r2 = requests.post(
            f"{BASE_URL}/api/fulfillment/stages/{STAGE_ORDERS}/stop-timer?orders_processed=2&items_processed=4",
            headers=self.headers
        )
        assert r2.status_code == 200
        print("✓ Stopped Orders timer")
        
        # Start Print timer
        r3 = requests.post(
            f"{BASE_URL}/api/fulfillment/stages/{STAGE_PRINT}/start-timer",
            headers=self.headers
        )
        assert r3.status_code == 200
        assert r3.json()["stage_id"] == STAGE_PRINT
        print("✓ Started Print timer after stopping Orders")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
