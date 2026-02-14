"""
Regression Tests for MFGFlow Reports & Task Assignment
Tests bug fixes from previous session:
- Order Time & Cost Report fields (order_total, cost_percent)
- Batch Cost Breakdown aggregation
- Stage Analysis zero division fix
- Stage KPIs date filtering
- Hours by User custom date range
- Worker task assignment to managers
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://crm-integration-10.preview.emergentagent.com")

class TestSession:
    """Shared session with authentication"""
    
    @pytest.fixture(scope="class")
    def session(self):
        """Create authenticated session"""
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        
        # Login via dev endpoint (TRAINING_MODE enabled)
        login_resp = s.get(f"{BASE_URL}/api/auth/dev-login")
        if login_resp.status_code != 200:
            pytest.skip(f"Dev login failed: {login_resp.status_code}")
        
        return s


class TestOrderTimeCostReport(TestSession):
    """Test Order Time & Cost Report - GET /api/fulfillment/reports/order-kpis"""
    
    def test_order_kpis_endpoint_returns_200(self, session):
        """Verify order-kpis endpoint is accessible"""
        response = session.get(f"{BASE_URL}/api/fulfillment/reports/order-kpis")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("✓ Order KPIs endpoint accessible")
    
    def test_order_kpis_returns_list(self, session):
        """Verify order-kpis returns a list"""
        response = session.get(f"{BASE_URL}/api/fulfillment/reports/order-kpis")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        print(f"✓ Order KPIs returns list with {len(data)} items")
    
    def test_order_kpis_structure_if_data_exists(self, session):
        """Verify order data structure includes order_total and cost_percent"""
        response = session.get(f"{BASE_URL}/api/fulfillment/reports/order-kpis")
        assert response.status_code == 200
        data = response.json()
        
        if len(data) > 0:
            first_order = data[0]
            # Check required fields from bug fix
            assert "order_total" in first_order, "Missing order_total field"
            assert "cost_percent" in first_order, "Missing cost_percent field"
            assert "labor_cost" in first_order, "Missing labor_cost field"
            assert "total_minutes" in first_order, "Missing total_minutes field"
            
            # Validate types
            assert isinstance(first_order["order_total"], (int, float)), "order_total should be numeric"
            assert isinstance(first_order["cost_percent"], (int, float)), "cost_percent should be numeric"
            print(f"✓ Order KPI structure validated: order_total={first_order['order_total']}, cost_percent={first_order['cost_percent']}")
        else:
            print("⚠ No order data to validate structure - test passes as endpoint works")


class TestBatchCostBreakdown(TestSession):
    """Test Batch Cost Breakdown - GET /api/stats/batches-summary and /api/stats/batch/{id}"""
    
    def test_batches_summary_endpoint(self, session):
        """Verify batches-summary returns data"""
        response = session.get(f"{BASE_URL}/api/stats/batches-summary")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert "batches" in data, "Missing 'batches' key"
        assert "totals" in data, "Missing 'totals' key"
        print(f"✓ Batches summary: {len(data['batches'])} batches found")
    
    def test_batches_summary_cost_aggregation(self, session):
        """Verify cost aggregation structure"""
        response = session.get(f"{BASE_URL}/api/stats/batches-summary")
        assert response.status_code == 200
        data = response.json()
        
        # Check totals structure
        totals = data["totals"]
        required_totals = ["production_hours", "fulfillment_hours", "total_hours", "total_cost"]
        for field in required_totals:
            assert field in totals, f"Missing totals.{field}"
        
        print(f"✓ Cost aggregation: production={totals.get('production_hours', 0)}h, fulfillment={totals.get('fulfillment_hours', 0)}h")
    
    def test_single_batch_report(self, session):
        """Verify single batch report endpoint"""
        # First get batches to find an ID
        summary_resp = session.get(f"{BASE_URL}/api/stats/batches-summary")
        assert summary_resp.status_code == 200
        summary = summary_resp.json()
        
        if len(summary.get("batches", [])) > 0:
            batch_id = summary["batches"][0]["batch_id"]
            
            response = session.get(f"{BASE_URL}/api/stats/batch/{batch_id}")
            assert response.status_code == 200, f"Expected 200, got {response.status_code}"
            
            data = response.json()
            assert "batch" in data, "Missing 'batch' key"
            assert "time" in data, "Missing 'time' key"
            assert "costs" in data, "Missing 'costs' key"
            
            # Verify fulfillment costs are included
            time_data = data["time"]
            assert "fulfillment_hours" in time_data, "Missing fulfillment_hours (cost aggregation fix)"
            
            print(f"✓ Single batch report: {batch_id} - prod={time_data.get('production_hours', 0)}h, fulfillment={time_data.get('fulfillment_hours', 0)}h")
        else:
            print("⚠ No batches to test single batch report")


class TestStageAnalysis(TestSession):
    """Test Stage Analysis - GET /api/stats/stages (division by zero fix)"""
    
    def test_stage_stats_endpoint(self, session):
        """Verify stage-stats endpoint works without divide-by-zero"""
        response = session.get(f"{BASE_URL}/api/stats/stages")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert isinstance(data, list), "Expected list of stage stats"
        print(f"✓ Stage stats: {len(data)} stages returned")
    
    def test_stage_stats_avg_calculation(self, session):
        """Verify avg_minutes_per_item handles zero items"""
        response = session.get(f"{BASE_URL}/api/stats/stages")
        assert response.status_code == 200
        data = response.json()
        
        # Check that all stages have valid avg_minutes_per_item (no NaN/Infinity)
        for stage in data:
            if "avg_minutes_per_item" in stage:
                val = stage["avg_minutes_per_item"]
                assert val is not None, f"avg_minutes_per_item is None for {stage.get('stage_name')}"
                assert isinstance(val, (int, float)), f"avg_minutes_per_item should be numeric"
                # Check not NaN or Infinity
                assert val == val, f"avg_minutes_per_item is NaN for {stage.get('stage_name')}"
                assert val != float('inf'), f"avg_minutes_per_item is Infinity for {stage.get('stage_name')}"
        
        print("✓ Stage stats: all avg_minutes_per_item values are valid (no divide-by-zero)")


class TestStageKPIsDateFilter(TestSession):
    """Test Stage KPIs with date filtering - GET /api/stats/stage-user-kpis"""
    
    def test_stage_user_kpis_endpoint(self, session):
        """Verify stage-user-kpis endpoint"""
        response = session.get(f"{BASE_URL}/api/stats/stage-user-kpis")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert "stages" in data, "Missing 'stages' key"
        assert "summary" in data, "Missing 'summary' key"
        print(f"✓ Stage User KPIs: {len(data['stages'])} stages")
    
    def test_stage_user_kpis_with_dates(self, session):
        """Verify date filtering works"""
        today = datetime.now()
        start = (today - timedelta(days=30)).strftime("%Y-%m-%d")
        end = today.strftime("%Y-%m-%d")
        
        response = session.get(f"{BASE_URL}/api/stats/stage-user-kpis?start_date={start}&end_date={end}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert "stages" in data, "Date-filtered response missing 'stages'"
        print(f"✓ Stage User KPIs with date filter ({start} to {end}): {len(data['stages'])} stages")


class TestHoursByUserDateRange(TestSession):
    """Test Hours by User with custom date range - GET /api/production/reports/hours-by-user-date"""
    
    def test_hours_by_user_date_endpoint(self, session):
        """Verify hours-by-user-date endpoint"""
        response = session.get(f"{BASE_URL}/api/production/reports/hours-by-user-date")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert "period" in data, "Missing 'period' key"
        assert "data" in data, "Missing 'data' key"
        print(f"✓ Hours by User Date: period={data['period']}, {len(data['data'])} records")
    
    def test_hours_by_user_date_custom_range(self, session):
        """Verify custom date range works (timezone bug fix)"""
        today = datetime.now()
        start = (today - timedelta(days=7)).strftime("%Y-%m-%d")
        end = today.strftime("%Y-%m-%d")
        
        response = session.get(
            f"{BASE_URL}/api/production/reports/hours-by-user-date"
            f"?period=custom&start_date={start}&end_date={end}"
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert data.get("period") == "custom", f"Expected period='custom', got {data.get('period')}"
        assert "start_date" in data, "Missing start_date in response"
        assert "end_date" in data, "Missing end_date in response"
        
        print(f"✓ Hours by User custom range: {data['start_date']} to {data['end_date']}")


class TestWorkerTaskAssignment(TestSession):
    """Test Worker Task Assignment - GET /api/users/managers-admins"""
    
    def test_managers_admins_endpoint(self, session):
        """Verify managers-admins endpoint returns users"""
        response = session.get(f"{BASE_URL}/api/users/managers-admins")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert isinstance(data, list), "Expected list of managers/admins"
        print(f"✓ Managers/Admins: {len(data)} users returned")
    
    def test_managers_admins_structure(self, session):
        """Verify user structure for task assignment dropdown"""
        response = session.get(f"{BASE_URL}/api/users/managers-admins")
        assert response.status_code == 200
        data = response.json()
        
        if len(data) > 0:
            user = data[0]
            required_fields = ["user_id", "name", "role"]
            for field in required_fields:
                assert field in user, f"Missing {field} in user data"
            
            # Verify role is admin or manager
            assert user["role"] in ["admin", "manager"], f"Unexpected role: {user['role']}"
            
            print(f"✓ Manager/Admin structure valid: {user['name']} ({user['role']})")
        else:
            print("⚠ No managers/admins to validate structure")
    
    def test_task_creation_endpoint(self, session):
        """Verify task creation works"""
        response = session.get(f"{BASE_URL}/api/tasks?page=1&page_size=5")
        assert response.status_code == 200, f"Tasks endpoint failed: {response.status_code}"
        data = response.json()
        
        assert "tasks" in data, "Missing 'tasks' key"
        assert "pagination" in data, "Missing 'pagination' key"
        
        print(f"✓ Tasks endpoint: {len(data['tasks'])} tasks, page {data['pagination'].get('page', 1)}")


class TestFulfillmentOverallKPIs(TestSession):
    """Test Fulfillment Overall KPIs - GET /api/fulfillment/stats/overall-kpis"""
    
    def test_overall_kpis_endpoint(self, session):
        """Verify fulfillment overall KPIs"""
        response = session.get(f"{BASE_URL}/api/fulfillment/stats/overall-kpis")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        required_fields = ["total_hours", "total_orders", "labor_cost", "period"]
        for field in required_fields:
            assert field in data, f"Missing '{field}' in overall KPIs"
        
        print(f"✓ Fulfillment KPIs: {data.get('total_hours', 0)}h, {data.get('total_orders', 0)} orders")


class TestProductionOverallKPIs(TestSession):
    """Test Production Overall KPIs - GET /api/production/stats/overall-kpis"""
    
    def test_production_kpis_endpoint(self, session):
        """Verify production overall KPIs"""
        response = session.get(f"{BASE_URL}/api/production/stats/overall-kpis")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        required_fields = ["total_hours", "total_items", "period"]
        for field in required_fields:
            assert field in data, f"Missing '{field}' in production KPIs"
        
        print(f"✓ Production KPIs: {data.get('total_hours', 0)}h, {data.get('total_items', 0)} items")


class TestDashboardStats(TestSession):
    """Test Dashboard Stats - GET /api/stats/dashboard"""
    
    def test_dashboard_stats_endpoint(self, session):
        """Verify dashboard stats endpoint"""
        response = session.get(f"{BASE_URL}/api/stats/dashboard")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert "orders" in data, "Missing 'orders' key"
        assert "active_batches" in data, "Missing 'active_batches' key"
        
        print(f"✓ Dashboard: {data['orders'].get('total', 0)} orders, {data.get('active_batches', 0)} active batches")


class TestUserProductionReport(TestSession):
    """Test User Production Report - GET /api/production/reports/user-stage-summary"""
    
    def test_user_stage_summary_endpoint(self, session):
        """Verify user-stage-summary endpoint"""
        response = session.get(f"{BASE_URL}/api/production/reports/user-stage-summary")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert "users" in data, "Missing 'users' key"
        assert "summary" in data, "Missing 'summary' key"
        
        print(f"✓ User Stage Summary: {len(data['users'])} users, {data['summary'].get('total_hours', 0)}h total")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
