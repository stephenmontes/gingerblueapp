#!/usr/bin/env python3
"""
Manufacturing & Fulfillment App - Backend API Testing
Tests all backend endpoints for the Shopify manufacturing app
"""

import requests
import sys
import json
from datetime import datetime, timezone
import uuid

class ManufacturingAPITester:
    def __init__(self, base_url="https://batch-frame-tracker.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.session_token = None
        self.user_id = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []

    def log_test(self, name, success, details=""):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name}")
        else:
            print(f"❌ {name} - {details}")
        
        self.test_results.append({
            "test": name,
            "success": success,
            "details": details
        })

    def make_request(self, method, endpoint, data=None, expected_status=200):
        """Make API request with proper headers"""
        url = f"{self.api_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        
        if self.session_token:
            headers['Authorization'] = f'Bearer {self.session_token}'

        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=10)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers, timeout=10)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=10)

            success = response.status_code == expected_status
            response_data = {}
            
            try:
                response_data = response.json()
            except:
                response_data = {"text": response.text}

            return success, response.status_code, response_data

        except Exception as e:
            return False, 0, {"error": str(e)}

    def test_root_endpoint(self):
        """Test root API endpoint"""
        success, status, data = self.make_request('GET', '')
        self.log_test("Root API Endpoint", success and "Manufacturing" in str(data), 
                     f"Status: {status}, Response: {data}")
        return success

    def test_auth_flow(self):
        """Test authentication flow - use existing test session"""
        print("\n🔐 Testing Authentication...")
        
        # Use the existing test session mentioned in review request
        test_session_id = "test_session_admin_123"
        
        # Test session creation endpoint
        session_data = {"session_id": test_session_id}
        success, status, data = self.make_request('POST', 'auth/session', session_data, 401)
        
        # Expected to fail with invalid session_id, but endpoint should exist
        endpoint_exists = status in [400, 401, 422]
        self.log_test("Auth Session Endpoint Exists", endpoint_exists, 
                     f"Status: {status} (expected 400/401/422)")
        
        # Try to use the test session token directly if it exists in MongoDB
        # For testing purposes, we'll use a known test token
        self.session_token = "test_session_admin_123"
        self.user_id = "test_user_admin_123"
        
        # Test if we can access protected endpoint with this token
        success, status, data = self.make_request('GET', 'auth/me')
        if success:
            self.log_test("Test Session Authentication", True, "Successfully authenticated with test session")
            return True
        else:
            # If test session doesn't work, create a mock token for testing
            self.session_token = f"test_token_{uuid.uuid4().hex}"
            self.log_test("Test Session Authentication", False, f"Test session failed, using mock token. Status: {status}")
            return endpoint_exists

    def test_protected_endpoints_without_auth(self):
        """Test that protected endpoints require authentication"""
        print("\n🔒 Testing Protected Endpoints (No Auth)...")
        
        # Temporarily remove session token
        temp_token = self.session_token
        self.session_token = None
        
        protected_endpoints = [
            ('GET', 'auth/me'),
            ('GET', 'orders'),
            ('GET', 'stores'),
            ('GET', 'stages'),
            ('GET', 'stats/dashboard'),
        ]
        
        all_protected = True
        for method, endpoint in protected_endpoints:
            success, status, data = self.make_request(method, endpoint, expected_status=401)
            is_protected = status == 401
            self.log_test(f"Protected: {method} /{endpoint}", is_protected, 
                         f"Status: {status}")
            if not is_protected:
                all_protected = False
        
        # Restore session token
        self.session_token = temp_token
        return all_protected

    def test_stores_endpoints(self):
        """Test store management endpoints"""
        print("\n🏪 Testing Store Endpoints...")
        
        # Get stores
        success, status, data = self.make_request('GET', 'stores')
        self.log_test("Get Stores", success, f"Status: {status}")
        
        if success:
            stores = data if isinstance(data, list) else []
            print(f"   Found {len(stores)} stores")
        
        return success

    def test_stages_endpoints(self):
        """Test production stages endpoints"""
        print("\n⚙️ Testing Production Stages...")
        
        # Get stages (should auto-create default stages)
        success, status, data = self.make_request('GET', 'stages')
        self.log_test("Get Production Stages", success, f"Status: {status}")
        
        if success:
            stages = data if isinstance(data, list) else []
            print(f"   Found {len(stages)} stages")
            
            # Verify default stages exist
            expected_stages = ["New Orders", "Cutting", "Assembly", "Quality Check", "Packing", "Ready to Ship"]
            stage_names = [s.get('name', '') for s in stages]
            has_defaults = all(name in stage_names for name in expected_stages)
            self.log_test("Default Stages Created", has_defaults, 
                         f"Expected: {expected_stages}, Got: {stage_names}")
        
        return success

    def test_orders_endpoints(self):
        """Test order management endpoints"""
        print("\n📦 Testing Order Endpoints...")
        
        # Get orders
        success, status, data = self.make_request('GET', 'orders')
        self.log_test("Get Orders", success, f"Status: {status}")
        
        if success:
            orders = data if isinstance(data, list) else []
            print(f"   Found {len(orders)} orders")
        
        # Test order filters
        success, status, data = self.make_request('GET', 'orders?status=pending')
        self.log_test("Filter Orders by Status", success, f"Status: {status}")
        
        return success

    def test_dashboard_stats(self):
        """Test dashboard statistics endpoint"""
        print("\n📊 Testing Dashboard Stats...")
        
        success, status, data = self.make_request('GET', 'stats/dashboard')
        self.log_test("Dashboard Stats", success, f"Status: {status}")
        
        if success and isinstance(data, dict):
            required_keys = ['orders', 'avg_items_per_hour', 'orders_by_store', 'daily_production']
            has_all_keys = all(key in data for key in required_keys)
            self.log_test("Dashboard Stats Structure", has_all_keys, 
                         f"Keys: {list(data.keys())}")
            
            # Check orders structure
            if 'orders' in data and isinstance(data['orders'], dict):
                order_keys = ['total', 'pending', 'in_production', 'completed']
                has_order_stats = all(key in data['orders'] for key in order_keys)
                self.log_test("Order Stats Structure", has_order_stats,
                             f"Order keys: {list(data['orders'].keys())}")
        
        return success

    def test_user_stats(self):
        """Test user statistics endpoint"""
        print("\n👥 Testing User Stats...")
        
        success, status, data = self.make_request('GET', 'stats/users')
        self.log_test("User Stats", success, f"Status: {status}")
        
        return success

    def test_demo_data_seeding(self):
        """Test demo data seeding (admin only)"""
        print("\n🌱 Testing Demo Data Seeding...")
        
        success, status, data = self.make_request('POST', 'demo/seed')
        
        if status == 200:
            # Test session has admin privileges
            self.log_test("Demo Seed Endpoint (Admin Access)", success, 
                         f"Status: {status} - Admin access confirmed")
        else:
            # Expected to fail without proper admin auth, but endpoint should exist
            endpoint_exists = status in [403, 401, 422]
            self.log_test("Demo Seed Endpoint Exists", endpoint_exists, 
                         f"Status: {status} (expected 403/401 without admin)")
        
        return success or status in [403, 401, 422]

    def test_time_logs_endpoints(self):
        """Test time logging endpoints"""
        print("\n⏱️ Testing Time Logs...")
        
        success, status, data = self.make_request('GET', 'time-logs')
        self.log_test("Get Time Logs", success, f"Status: {status}")
        
        return success

    def test_store_sync_endpoints(self):
        """Test store sync endpoints"""
        print("\n🔄 Testing Store Sync Endpoints...")
        
        # Test sync all stores endpoint
        success, status, data = self.make_request('POST', 'stores/sync-all')
        
        if status == 200:
            # Test session has admin/manager privileges
            self.log_test("Sync All Stores Endpoint (Admin Access)", success, 
                         f"Status: {status} - Admin/Manager access confirmed")
        else:
            # Expected to fail without proper admin auth, but endpoint should exist
            endpoint_exists = status in [403, 401, 422]
            self.log_test("Sync All Stores Endpoint", endpoint_exists, 
                         f"Status: {status} (expected 403/401 without admin)")
        
        # Test individual store sync (using a test store ID)
        test_store_id = "store_test_123"
        success2, status2, data2 = self.make_request('POST', f'stores/{test_store_id}/sync', expected_status=404)
        endpoint_exists = status2 in [404, 403, 401]  # Expected to fail - store not found or no auth
        self.log_test("Individual Store Sync Endpoint", endpoint_exists,
                     f"Status: {status2} (expected 404/403/401)")
        
        return (success or status in [403, 401, 422]) and endpoint_exists

    def test_webhook_endpoints(self):
        """Test webhook endpoints"""
        print("\n🪝 Testing Webhook Endpoints...")
        
        test_store_id = "store_test_123"
        
        # Test Shopify webhook endpoint
        webhook_data = {"test": "data"}
        success, status, data = self.make_request('POST', f'webhooks/shopify/{test_store_id}', webhook_data)
        self.log_test("Shopify Webhook Endpoint", success, f"Status: {status}")
        
        # Test Etsy webhook endpoint  
        success, status, data = self.make_request('POST', f'webhooks/etsy/{test_store_id}', webhook_data)
        self.log_test("Etsy Webhook Endpoint", success, f"Status: {status}")
        
        return success

    def test_export_endpoints(self):
        """Test export endpoints"""
        print("\n📤 Testing Export Endpoints...")
        
        # Test Orders CSV export
        success, status, data = self.make_request('GET', 'export/orders')
        self.log_test("Export Orders CSV", success, f"Status: {status}")
        
        # Test Time Logs CSV export
        success, status, data = self.make_request('GET', 'export/time-logs')
        self.log_test("Export Time Logs CSV", success, f"Status: {status}")
        
        # Test User Stats CSV export
        success, status, data = self.make_request('GET', 'export/user-stats')
        self.log_test("Export User Stats CSV", success, f"Status: {status}")
        
        # Test Report PDF export
        success, status, data = self.make_request('GET', 'export/report-pdf')
        self.log_test("Export Report PDF", success, f"Status: {status}")
        
        return success

    def run_all_tests(self):
        """Run comprehensive backend API tests"""
        print("🚀 Starting Manufacturing App Backend API Tests")
        print(f"Testing API: {self.api_url}")
        print("=" * 60)
        
        # Test sequence
        tests = [
            self.test_root_endpoint,
            self.test_auth_flow,
            self.test_protected_endpoints_without_auth,
            self.test_stores_endpoints,
            self.test_stages_endpoints,
            self.test_orders_endpoints,
            self.test_dashboard_stats,
            self.test_user_stats,
            self.test_demo_data_seeding,
            self.test_time_logs_endpoints,
            self.test_store_sync_endpoints,
            self.test_webhook_endpoints,
            self.test_export_endpoints,
        ]
        
        for test in tests:
            try:
                test()
            except Exception as e:
                self.log_test(f"ERROR in {test.__name__}", False, str(e))
        
        # Print summary
        print("\n" + "=" * 60)
        print(f"📊 Test Summary: {self.tests_passed}/{self.tests_run} tests passed")
        
        if self.tests_passed == self.tests_run:
            print("🎉 All tests passed!")
            return 0
        else:
            print(f"⚠️  {self.tests_run - self.tests_passed} tests failed")
            
            # Print failed tests
            print("\nFailed Tests:")
            for result in self.test_results:
                if not result['success']:
                    print(f"  ❌ {result['test']}: {result['details']}")
            
            return 1

def main():
    """Main test runner"""
    tester = ManufacturingAPITester()
    return tester.run_all_tests()

if __name__ == "__main__":
    sys.exit(main())