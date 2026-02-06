"""
Test Admin Active Timers Feature
- GET /api/admin/all-active-timers - Get all active timers across users
- POST /api/admin/stop-user-timer/{user_id} - Stop another user's timer
"""
import pytest
import requests
import os
from datetime import datetime, timezone

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAdminActiveTimers:
    """Test admin active timer endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data"""
        import subprocess
        
        # Create admin user and session
        result = subprocess.run([
            'mongosh', '--quiet', '--eval', '''
            use('test_database');
            var adminUserId = 'test-admin-timers-' + Date.now();
            var adminSessionToken = 'test_admin_timers_session_' + Date.now();
            
            db.users.insertOne({
              user_id: adminUserId,
              email: 'test.admin.timers.' + Date.now() + '@example.com',
              name: 'Test Admin Timers',
              picture: 'https://via.placeholder.com/150',
              role: 'admin',
              created_at: new Date()
            });
            
            db.user_sessions.insertOne({
              user_id: adminUserId,
              session_token: adminSessionToken,
              expires_at: new Date(Date.now() + 7*24*60*60*1000),
              created_at: new Date()
            });
            
            // Create worker user with active production timer
            var workerUserId = 'test-worker-timers-' + Date.now();
            db.users.insertOne({
              user_id: workerUserId,
              email: 'test.worker.timers.' + Date.now() + '@example.com',
              name: 'Test Worker Timers',
              picture: 'https://via.placeholder.com/150',
              role: 'worker',
              created_at: new Date()
            });
            
            var workerSessionToken = 'test_worker_timers_session_' + Date.now();
            db.user_sessions.insertOne({
              user_id: workerUserId,
              session_token: workerSessionToken,
              expires_at: new Date(Date.now() + 7*24*60*60*1000),
              created_at: new Date()
            });
            
            // Create active production timer
            var prodLogId = 'log_test_admin_prod_' + Date.now();
            db.time_logs.insertOne({
              log_id: prodLogId,
              user_id: workerUserId,
              user_name: 'Test Worker Timers',
              stage_id: 'stage_cutting',
              stage_name: 'Cutting',
              batch_id: 'batch_admin_test_123',
              workflow_type: 'production',
              action: 'started',
              started_at: new Date(Date.now() - 10*60*1000).toISOString(),
              items_processed: 0,
              created_at: new Date().toISOString(),
              completed_at: null
            });
            
            // Create worker2 with fulfillment timer
            var worker2UserId = 'test-worker2-timers-' + Date.now();
            db.users.insertOne({
              user_id: worker2UserId,
              email: 'test.worker2.timers.' + Date.now() + '@example.com',
              name: 'Test Worker2 Timers',
              picture: 'https://via.placeholder.com/150',
              role: 'worker',
              created_at: new Date()
            });
            
            // Create active fulfillment timer
            var fulfillLogId = 'log_test_admin_fulfill_' + Date.now();
            db.fulfillment_time_logs.insertOne({
              log_id: fulfillLogId,
              user_id: worker2UserId,
              user_name: 'Test Worker2 Timers',
              stage_id: 'stage_packing',
              stage_name: 'Packing',
              fulfillment_batch_id: 'fulfill_admin_test_456',
              action: 'started',
              started_at: new Date(Date.now() - 20*60*1000).toISOString(),
              items_processed: 0,
              created_at: new Date().toISOString(),
              completed_at: null
            });
            
            print('ADMIN_SESSION=' + adminSessionToken);
            print('ADMIN_USER_ID=' + adminUserId);
            print('WORKER_SESSION=' + workerSessionToken);
            print('WORKER_USER_ID=' + workerUserId);
            print('WORKER2_USER_ID=' + worker2UserId);
            print('PROD_LOG_ID=' + prodLogId);
            print('FULFILL_LOG_ID=' + fulfillLogId);
            '''
        ], capture_output=True, text=True)
        
        output = result.stdout
        self.admin_session = None
        self.admin_user_id = None
        self.worker_session = None
        self.worker_user_id = None
        self.worker2_user_id = None
        self.prod_log_id = None
        self.fulfill_log_id = None
        
        for line in output.split('\n'):
            if line.startswith('ADMIN_SESSION='):
                self.admin_session = line.split('=')[1]
            elif line.startswith('ADMIN_USER_ID='):
                self.admin_user_id = line.split('=')[1]
            elif line.startswith('WORKER_SESSION='):
                self.worker_session = line.split('=')[1]
            elif line.startswith('WORKER_USER_ID='):
                self.worker_user_id = line.split('=')[1]
            elif line.startswith('WORKER2_USER_ID='):
                self.worker2_user_id = line.split('=')[1]
            elif line.startswith('PROD_LOG_ID='):
                self.prod_log_id = line.split('=')[1]
            elif line.startswith('FULFILL_LOG_ID='):
                self.fulfill_log_id = line.split('=')[1]
        
        yield
        
        # Cleanup
        subprocess.run([
            'mongosh', '--quiet', '--eval', f'''
            use('test_database');
            db.users.deleteMany({{user_id: /^test-(admin|worker|worker2)-timers-/}});
            db.user_sessions.deleteMany({{session_token: /^test_(admin|worker)_timers_session_/}});
            db.time_logs.deleteMany({{log_id: /^log_test_admin_/}});
            db.fulfillment_time_logs.deleteMany({{log_id: /^log_test_admin_/}});
            '''
        ], capture_output=True, text=True)
    
    def test_get_all_active_timers_returns_200(self):
        """Test GET /api/admin/all-active-timers returns 200 for admin"""
        response = requests.get(
            f"{BASE_URL}/api/admin/all-active-timers",
            cookies={"session_token": self.admin_session}
        )
        assert response.status_code == 200
    
    def test_get_all_active_timers_returns_list(self):
        """Test GET /api/admin/all-active-timers returns a list"""
        response = requests.get(
            f"{BASE_URL}/api/admin/all-active-timers",
            cookies={"session_token": self.admin_session}
        )
        data = response.json()
        assert isinstance(data, list)
    
    def test_active_timers_have_required_fields(self):
        """Test active timers have all required fields"""
        response = requests.get(
            f"{BASE_URL}/api/admin/all-active-timers",
            cookies={"session_token": self.admin_session}
        )
        data = response.json()
        
        # Find our test timers
        test_timers = [t for t in data if t.get('log_id', '').startswith('log_test_admin_')]
        assert len(test_timers) >= 1, "Should have at least one test timer"
        
        required_fields = [
            'log_id', 'user_id', 'user_name', 'workflow_type', 
            'stage_id', 'stage_name', 'started_at', 'elapsed_minutes', 
            'is_paused', 'items_processed'
        ]
        
        for timer in test_timers:
            for field in required_fields:
                assert field in timer, f"Timer missing required field: {field}"
    
    def test_active_timers_include_production_type(self):
        """Test active timers include production workflow type"""
        response = requests.get(
            f"{BASE_URL}/api/admin/all-active-timers",
            cookies={"session_token": self.admin_session}
        )
        data = response.json()
        
        production_timers = [t for t in data if t.get('workflow_type') == 'production' and t.get('log_id', '').startswith('log_test_admin_')]
        assert len(production_timers) >= 1, "Should have at least one production timer"
    
    def test_active_timers_include_fulfillment_type(self):
        """Test active timers include fulfillment workflow type"""
        response = requests.get(
            f"{BASE_URL}/api/admin/all-active-timers",
            cookies={"session_token": self.admin_session}
        )
        data = response.json()
        
        fulfillment_timers = [t for t in data if t.get('workflow_type') == 'fulfillment' and t.get('log_id', '').startswith('log_test_admin_')]
        assert len(fulfillment_timers) >= 1, "Should have at least one fulfillment timer"
    
    def test_elapsed_minutes_calculated_correctly(self):
        """Test elapsed_minutes is calculated and positive"""
        response = requests.get(
            f"{BASE_URL}/api/admin/all-active-timers",
            cookies={"session_token": self.admin_session}
        )
        data = response.json()
        
        test_timers = [t for t in data if t.get('log_id', '').startswith('log_test_admin_')]
        for timer in test_timers:
            assert timer['elapsed_minutes'] > 0, "Elapsed minutes should be positive"
            assert isinstance(timer['elapsed_minutes'], (int, float)), "Elapsed minutes should be numeric"
    
    def test_worker_cannot_access_admin_endpoint(self):
        """Test worker role cannot access admin active timers endpoint"""
        response = requests.get(
            f"{BASE_URL}/api/admin/all-active-timers",
            cookies={"session_token": self.worker_session}
        )
        assert response.status_code == 403
        assert "Only admins and managers" in response.json().get('detail', '')
    
    def test_stop_user_timer_production(self):
        """Test POST /api/admin/stop-user-timer stops production timer"""
        response = requests.post(
            f"{BASE_URL}/api/admin/stop-user-timer/{self.worker_user_id}?workflow_type=production",
            cookies={"session_token": self.admin_session}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert 'message' in data
        assert 'duration_minutes' in data
        assert data['duration_minutes'] > 0
    
    def test_stop_user_timer_fulfillment(self):
        """Test POST /api/admin/stop-user-timer stops fulfillment timer"""
        response = requests.post(
            f"{BASE_URL}/api/admin/stop-user-timer/{self.worker2_user_id}?workflow_type=fulfillment",
            cookies={"session_token": self.admin_session}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert 'message' in data
        assert 'duration_minutes' in data
    
    def test_stop_nonexistent_timer_returns_404(self):
        """Test stopping a non-existent timer returns 404"""
        response = requests.post(
            f"{BASE_URL}/api/admin/stop-user-timer/nonexistent-user-id?workflow_type=production",
            cookies={"session_token": self.admin_session}
        )
        assert response.status_code == 404
    
    def test_worker_cannot_stop_timer(self):
        """Test worker role cannot stop another user's timer"""
        response = requests.post(
            f"{BASE_URL}/api/admin/stop-user-timer/some-user-id?workflow_type=production",
            cookies={"session_token": self.worker_session}
        )
        assert response.status_code == 403
        assert "Only admins and managers" in response.json().get('detail', '')
    
    def test_unauthenticated_request_returns_401(self):
        """Test unauthenticated request returns 401"""
        response = requests.get(f"{BASE_URL}/api/admin/all-active-timers")
        assert response.status_code == 401


class TestManagerActiveTimers:
    """Test manager role can also access admin timer endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup manager test data"""
        import subprocess
        
        result = subprocess.run([
            'mongosh', '--quiet', '--eval', '''
            use('test_database');
            var managerUserId = 'test-manager-timers-' + Date.now();
            var managerSessionToken = 'test_manager_timers_session_' + Date.now();
            
            db.users.insertOne({
              user_id: managerUserId,
              email: 'test.manager.timers.' + Date.now() + '@example.com',
              name: 'Test Manager Timers',
              picture: 'https://via.placeholder.com/150',
              role: 'manager',
              created_at: new Date()
            });
            
            db.user_sessions.insertOne({
              user_id: managerUserId,
              session_token: managerSessionToken,
              expires_at: new Date(Date.now() + 7*24*60*60*1000),
              created_at: new Date()
            });
            
            print('MANAGER_SESSION=' + managerSessionToken);
            '''
        ], capture_output=True, text=True)
        
        output = result.stdout
        self.manager_session = None
        
        for line in output.split('\n'):
            if line.startswith('MANAGER_SESSION='):
                self.manager_session = line.split('=')[1]
        
        yield
        
        # Cleanup
        subprocess.run([
            'mongosh', '--quiet', '--eval', '''
            use('test_database');
            db.users.deleteMany({user_id: /^test-manager-timers-/});
            db.user_sessions.deleteMany({session_token: /^test_manager_timers_session_/});
            '''
        ], capture_output=True, text=True)
    
    def test_manager_can_access_all_active_timers(self):
        """Test manager role can access all active timers endpoint"""
        response = requests.get(
            f"{BASE_URL}/api/admin/all-active-timers",
            cookies={"session_token": self.manager_session}
        )
        assert response.status_code == 200
        assert isinstance(response.json(), list)
