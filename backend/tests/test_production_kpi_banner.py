"""
Test Production KPI Banner - Overall KPIs Endpoint
Tests the GET /api/production/stats/overall-kpis endpoint for the Production KPI Banner feature
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestProductionOverallKpis:
    """Tests for GET /api/production/stats/overall-kpis endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.cookies.set('session_token', 'test_session_1770348463892')
    
    def test_overall_kpis_default_period(self):
        """Test overall KPIs with default period (this_week)"""
        response = self.session.get(f"{BASE_URL}/api/production/stats/overall-kpis")
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "total_hours" in data
        assert "total_items" in data
        assert "labor_cost" in data
        assert "cost_per_item" in data
        assert "avg_time_per_item" in data
        assert "session_count" in data
        assert "period" in data
        assert "period_label" in data
        assert "date_range" in data
        
        # Verify default period is this_week
        assert data["period"] == "this_week"
        assert data["period_label"] == "This Week"
    
    def test_overall_kpis_today(self):
        """Test overall KPIs with period=today"""
        response = self.session.get(f"{BASE_URL}/api/production/stats/overall-kpis?period=today")
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["period"] == "today"
        assert data["period_label"] == "Today"
        # Date range should be a single date like "Feb 06"
        assert len(data["date_range"]) < 15
    
    def test_overall_kpis_yesterday(self):
        """Test overall KPIs with period=yesterday"""
        response = self.session.get(f"{BASE_URL}/api/production/stats/overall-kpis?period=yesterday")
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["period"] == "yesterday"
        assert data["period_label"] == "Yesterday"
    
    def test_overall_kpis_this_week(self):
        """Test overall KPIs with period=this_week"""
        response = self.session.get(f"{BASE_URL}/api/production/stats/overall-kpis?period=this_week")
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["period"] == "this_week"
        assert data["period_label"] == "This Week"
        # Date range should be like "Feb 02 - Feb 08"
        assert " - " in data["date_range"]
    
    def test_overall_kpis_last_week(self):
        """Test overall KPIs with period=last_week"""
        response = self.session.get(f"{BASE_URL}/api/production/stats/overall-kpis?period=last_week")
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["period"] == "last_week"
        assert data["period_label"] == "Last Week"
        assert " - " in data["date_range"]
    
    def test_overall_kpis_this_month(self):
        """Test overall KPIs with period=this_month"""
        response = self.session.get(f"{BASE_URL}/api/production/stats/overall-kpis?period=this_month")
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["period"] == "this_month"
        assert data["period_label"] == "This Month"
        # Date range should be like "February 2026"
        assert "2026" in data["date_range"] or "2025" in data["date_range"]
    
    def test_overall_kpis_last_month(self):
        """Test overall KPIs with period=last_month"""
        response = self.session.get(f"{BASE_URL}/api/production/stats/overall-kpis?period=last_month")
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["period"] == "last_month"
        assert data["period_label"] == "Last Month"
    
    def test_overall_kpis_all_time(self):
        """Test overall KPIs with period=all_time"""
        response = self.session.get(f"{BASE_URL}/api/production/stats/overall-kpis?period=all_time")
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["period"] == "all_time"
        assert data["period_label"] == "All Time"
        assert data["date_range"] == "All Time"
    
    def test_overall_kpis_invalid_period_defaults_to_this_week(self):
        """Test that invalid period defaults to this_week"""
        response = self.session.get(f"{BASE_URL}/api/production/stats/overall-kpis?period=invalid_period")
        
        assert response.status_code == 200
        data = response.json()
        
        # Should default to this_week behavior
        assert data["period_label"] == "This Week"
    
    def test_overall_kpis_requires_authentication(self):
        """Test that endpoint requires authentication"""
        # Create new session without auth
        unauthenticated_session = requests.Session()
        response = unauthenticated_session.get(f"{BASE_URL}/api/production/stats/overall-kpis")
        
        assert response.status_code == 401
        data = response.json()
        assert "detail" in data
    
    def test_overall_kpis_data_types(self):
        """Test that response data types are correct"""
        response = self.session.get(f"{BASE_URL}/api/production/stats/overall-kpis")
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify data types
        assert isinstance(data["total_hours"], (int, float))
        assert isinstance(data["total_items"], int)
        assert isinstance(data["labor_cost"], (int, float))
        assert isinstance(data["cost_per_item"], (int, float))
        assert isinstance(data["avg_time_per_item"], (int, float))
        assert isinstance(data["session_count"], int)
        assert isinstance(data["period"], str)
        assert isinstance(data["period_label"], str)
        assert isinstance(data["date_range"], str)
    
    def test_overall_kpis_labor_cost_calculation(self):
        """Test that labor cost is calculated correctly ($30/hour)"""
        response = self.session.get(f"{BASE_URL}/api/production/stats/overall-kpis?period=all_time")
        
        assert response.status_code == 200
        data = response.json()
        
        # Labor cost should be total_hours * 30
        expected_labor_cost = round(data["total_hours"] * 30, 2)
        assert data["labor_cost"] == expected_labor_cost
    
    def test_overall_kpis_cost_per_item_calculation(self):
        """Test that cost per item is calculated correctly"""
        response = self.session.get(f"{BASE_URL}/api/production/stats/overall-kpis?period=all_time")
        
        assert response.status_code == 200
        data = response.json()
        
        if data["total_items"] > 0:
            expected_cost_per_item = round(data["labor_cost"] / data["total_items"], 2)
            assert data["cost_per_item"] == expected_cost_per_item
        else:
            assert data["cost_per_item"] == 0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
