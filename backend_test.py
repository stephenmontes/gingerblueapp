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
    def __init__(self, base_url="https://shopifactory.preview.emergentagent.com"):
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
        """Test authentication flow - create test session"""
        print("\n🔐 Testing Authentication...")
        
        # Create test session directly (simulating OAuth flow)
        test_session_id = f"test_session_{uuid.uuid4().hex[:12]}"
        
        # Test session creation endpoint
        session_data = {"session_id": test_session_id}
        success, status, data = self.make_request('POST', 'auth/session', session_data, 401)
        
        # Expected to fail with invalid session_id, but endpoint should exist
        endpoint_exists = status in [400, 401, 422]
        self.log_test("Auth Session Endpoint Exists", endpoint_exists, 
                     f"Status: {status} (expected 400/401/422)")
        
        # For testing purposes, we'll create a mock session token
        # In real scenario, this would come from Emergent Auth
        self.session_token = f"test_token_{uuid.uuid4().hex}"
        self.user_id = f"test_user_{uuid.uuid4().hex[:12]}"
        
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
        
        success, status, data = self.make_request('POST', 'demo/seed', expected_status=403)
        
        # Expected to fail without proper admin auth, but endpoint should exist
        endpoint_exists = status in [403, 401, 422]
        self.log_test("Demo Seed Endpoint Exists", endpoint_exists, 
                     f"Status: {status} (expected 403/401 without admin)")
        
        return endpoint_exists

    def test_time_logs_endpoints(self):
        """Test time logging endpoints"""
        print("\n⏱️ Testing Time Logs...")
        
        success, status, data = self.make_request('GET', 'time-logs')
        self.log_test("Get Time Logs", success, f"Status: {status}")
        
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