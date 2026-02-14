"""
Campaign Management API Tests - CRM Phase 3
Tests for /api/campaigns/* endpoints
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def api_client():
    """Shared requests session with authentication"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    
    # Dev login for testing
    login_resp = session.get(f"{BASE_URL}/api/auth/dev-login")
    assert login_resp.status_code == 200, f"Dev login failed: {login_resp.text}"
    
    return session


@pytest.fixture(scope="module")
def test_campaign(api_client):
    """Create a test campaign for use in tests"""
    params = {
        "name": "TEST_CampaignModuleTest",
        "campaign_type": "email",
        "status": "planned",
        "budget": "10000",
        "expected_revenue": "50000",
        "description": "Test campaign for pytest"
    }
    resp = api_client.post(f"{BASE_URL}/api/campaigns", params=params)
    assert resp.status_code == 200, f"Failed to create test campaign: {resp.text}"
    campaign = resp.json()
    
    yield campaign
    
    # Cleanup: Delete test campaign
    api_client.delete(f"{BASE_URL}/api/campaigns/{campaign['campaign_id']}")


class TestCampaignCRUD:
    """Campaign CRUD endpoint tests"""
    
    def test_list_campaigns(self, api_client):
        """GET /api/campaigns - List campaigns"""
        resp = api_client.get(f"{BASE_URL}/api/campaigns")
        assert resp.status_code == 200
        data = resp.json()
        assert "campaigns" in data
        assert "pagination" in data
        assert isinstance(data["campaigns"], list)
        print(f"✓ List campaigns: Found {len(data['campaigns'])} campaigns")
    
    def test_create_campaign(self, api_client):
        """POST /api/campaigns - Create campaign"""
        params = {
            "name": "TEST_NewCampaign",
            "campaign_type": "social_media",
            "status": "planned",
            "budget": "5000"
        }
        resp = api_client.post(f"{BASE_URL}/api/campaigns", params=params)
        assert resp.status_code == 200
        campaign = resp.json()
        
        # Validate response structure
        assert "campaign_id" in campaign
        assert campaign["name"] == "TEST_NewCampaign"
        assert campaign["campaign_type"] == "social_media"
        assert campaign["status"] == "planned"
        assert campaign["budget"] == 5000.0
        assert "owner_id" in campaign
        assert "created_at" in campaign
        print(f"✓ Created campaign: {campaign['campaign_id']}")
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/campaigns/{campaign['campaign_id']}")
    
    def test_get_campaign_detail(self, api_client, test_campaign):
        """GET /api/campaigns/{id} - Get campaign details with metrics"""
        resp = api_client.get(f"{BASE_URL}/api/campaigns/{test_campaign['campaign_id']}")
        assert resp.status_code == 200
        data = resp.json()
        
        # Validate campaign data
        assert data["campaign_id"] == test_campaign["campaign_id"]
        assert data["name"] == test_campaign["name"]
        
        # Validate metrics section
        assert "metrics" in data
        assert "leads_generated" in data["metrics"]
        assert "opportunities_created" in data["metrics"]
        assert "revenue_won" in data["metrics"]
        assert "cost_per_lead" in data["metrics"]
        assert "roi" in data["metrics"]
        
        # Validate leads and opportunities arrays
        assert "leads" in data
        assert "opportunities" in data
        assert isinstance(data["leads"], list)
        assert isinstance(data["opportunities"], list)
        print(f"✓ Get campaign detail: {test_campaign['campaign_id']}")
    
    def test_get_campaign_not_found(self, api_client):
        """GET /api/campaigns/{id} - Returns 404 for non-existent campaign"""
        resp = api_client.get(f"{BASE_URL}/api/campaigns/nonexistent_campaign")
        assert resp.status_code == 404
        assert "not found" in resp.json()["detail"].lower()
        print("✓ Non-existent campaign returns 404")
    
    def test_update_campaign(self, api_client, test_campaign):
        """PUT /api/campaigns/{id} - Update campaign"""
        params = {
            "status": "in_progress",
            "description": "Updated description"
        }
        resp = api_client.put(
            f"{BASE_URL}/api/campaigns/{test_campaign['campaign_id']}", 
            params=params
        )
        assert resp.status_code == 200
        assert resp.json()["success"] == True
        
        # Verify update persisted
        get_resp = api_client.get(f"{BASE_URL}/api/campaigns/{test_campaign['campaign_id']}")
        assert get_resp.status_code == 200
        updated = get_resp.json()
        assert updated["status"] == "in_progress"
        assert updated["description"] == "Updated description"
        print("✓ Campaign updated successfully")
    
    def test_delete_campaign(self, api_client):
        """DELETE /api/campaigns/{id} - Soft delete campaign"""
        # Create a campaign to delete
        params = {"name": "TEST_ToDelete", "campaign_type": "webinar"}
        create_resp = api_client.post(f"{BASE_URL}/api/campaigns", params=params)
        assert create_resp.status_code == 200
        campaign_id = create_resp.json()["campaign_id"]
        
        # Delete
        delete_resp = api_client.delete(f"{BASE_URL}/api/campaigns/{campaign_id}")
        assert delete_resp.status_code == 200
        assert delete_resp.json()["success"] == True
        
        # Verify soft-deleted (not in list)
        list_resp = api_client.get(f"{BASE_URL}/api/campaigns")
        campaigns = [c for c in list_resp.json()["campaigns"] if c["campaign_id"] == campaign_id]
        assert len(campaigns) == 0
        print("✓ Campaign soft-deleted successfully")
    
    def test_delete_nonexistent_campaign(self, api_client):
        """DELETE /api/campaigns/{id} - Returns 404 for non-existent"""
        resp = api_client.delete(f"{BASE_URL}/api/campaigns/nonexistent")
        assert resp.status_code == 404
        print("✓ Delete non-existent campaign returns 404")


class TestCampaignFilters:
    """Campaign filtering tests"""
    
    def test_filter_by_status(self, api_client, test_campaign):
        """GET /api/campaigns?status=planned - Filter by status"""
        resp = api_client.get(f"{BASE_URL}/api/campaigns?status=planned")
        assert resp.status_code == 200
        # All results should have status=planned
        campaigns = resp.json()["campaigns"]
        for c in campaigns:
            assert c["status"] == "planned"
        print(f"✓ Filter by status: Found {len(campaigns)} planned campaigns")
    
    def test_filter_by_type(self, api_client, test_campaign):
        """GET /api/campaigns?campaign_type=email - Filter by type"""
        resp = api_client.get(f"{BASE_URL}/api/campaigns?campaign_type=email")
        assert resp.status_code == 200
        campaigns = resp.json()["campaigns"]
        for c in campaigns:
            assert c["campaign_type"] == "email"
        print(f"✓ Filter by type: Found {len(campaigns)} email campaigns")
    
    def test_search_campaigns(self, api_client, test_campaign):
        """GET /api/campaigns?search=TEST - Search campaigns"""
        resp = api_client.get(f"{BASE_URL}/api/campaigns?search=TEST")
        assert resp.status_code == 200
        campaigns = resp.json()["campaigns"]
        # All results should contain TEST in name
        for c in campaigns:
            assert "test" in c["name"].lower() or "test" in (c.get("description") or "").lower()
        print(f"✓ Search campaigns: Found {len(campaigns)} matching campaigns")


class TestCampaignReports:
    """Campaign reports endpoint tests"""
    
    def test_summary_report(self, api_client):
        """GET /api/campaigns/reports/summary - Get summary report"""
        resp = api_client.get(f"{BASE_URL}/api/campaigns/reports/summary")
        assert resp.status_code == 200
        data = resp.json()
        
        # Validate summary structure
        assert "summary" in data
        summary = data["summary"]
        assert "total_campaigns" in summary
        assert "total_budget" in summary
        assert "total_expected_revenue" in summary
        assert "total_leads" in summary
        assert "total_opportunities" in summary
        assert "total_revenue_won" in summary
        assert "overall_roi" in summary
        
        # Validate campaigns list
        assert "campaigns" in data
        assert isinstance(data["campaigns"], list)
        print(f"✓ Summary report: {summary['total_campaigns']} campaigns, ROI: {summary['overall_roi']}%")
    
    def test_performance_report(self, api_client):
        """GET /api/campaigns/reports/performance - Get performance metrics"""
        resp = api_client.get(f"{BASE_URL}/api/campaigns/reports/performance")
        assert resp.status_code == 200
        data = resp.json()
        
        assert "performance" in data
        performance = data["performance"]
        assert isinstance(performance, list)
        
        # Validate performance metrics structure
        if len(performance) > 0:
            p = performance[0]
            assert "campaign_id" in p
            assert "name" in p
            assert "leads_generated" in p
            assert "leads_converted" in p
            assert "lead_conversion_rate" in p
            assert "opportunities_created" in p
            assert "win_rate" in p
            assert "revenue_won" in p
            assert "cost_per_lead" in p
            assert "roi" in p
        print(f"✓ Performance report: {len(performance)} campaigns")


class TestCampaignConfig:
    """Campaign configuration endpoint tests"""
    
    def test_get_campaign_types(self, api_client):
        """GET /api/campaigns/config/types - Get campaign types"""
        resp = api_client.get(f"{BASE_URL}/api/campaigns/config/types")
        assert resp.status_code == 200
        data = resp.json()
        
        assert "types" in data
        assert "statuses" in data
        
        # Validate expected types
        expected_types = ["email", "social_media", "trade_show", "webinar", "advertising"]
        for t in expected_types:
            assert t in data["types"]
        
        # Validate expected statuses
        expected_statuses = ["planned", "in_progress", "completed", "paused", "cancelled"]
        for s in expected_statuses:
            assert s in data["statuses"]
        
        print(f"✓ Config types: {len(data['types'])} types, {len(data['statuses'])} statuses")


class TestCampaignAttribution:
    """Campaign lead/opportunity attribution tests"""
    
    def test_attribute_lead_to_campaign(self, api_client, test_campaign):
        """POST /api/campaigns/{id}/attribute-lead/{lead_id} - Attribute lead"""
        # First get a lead
        leads_resp = api_client.get(f"{BASE_URL}/api/crm/leads?page_size=1")
        if leads_resp.status_code != 200 or len(leads_resp.json().get("leads", [])) == 0:
            pytest.skip("No leads available for attribution test")
        
        lead_id = leads_resp.json()["leads"][0]["lead_id"]
        
        # Attribute lead to campaign
        resp = api_client.post(
            f"{BASE_URL}/api/campaigns/{test_campaign['campaign_id']}/attribute-lead/{lead_id}"
        )
        assert resp.status_code == 200
        assert resp.json()["success"] == True
        
        # Verify lead shows in campaign
        campaign_resp = api_client.get(f"{BASE_URL}/api/campaigns/{test_campaign['campaign_id']}")
        assert campaign_resp.status_code == 200
        leads = campaign_resp.json()["leads"]
        lead_ids = [l["lead_id"] for l in leads]
        assert lead_id in lead_ids
        print(f"✓ Lead {lead_id} attributed to campaign")
    
    def test_attribute_lead_not_found(self, api_client, test_campaign):
        """POST /api/campaigns/{id}/attribute-lead/{lead_id} - Lead not found"""
        resp = api_client.post(
            f"{BASE_URL}/api/campaigns/{test_campaign['campaign_id']}/attribute-lead/nonexistent_lead"
        )
        assert resp.status_code == 404
        assert "lead not found" in resp.json()["detail"].lower()
        print("✓ Attribute non-existent lead returns 404")
    
    def test_attribute_to_nonexistent_campaign(self, api_client):
        """POST /api/campaigns/{id}/attribute-lead/{lead_id} - Campaign not found"""
        resp = api_client.post(
            f"{BASE_URL}/api/campaigns/nonexistent/attribute-lead/lead123"
        )
        assert resp.status_code == 404
        assert "campaign not found" in resp.json()["detail"].lower()
        print("✓ Attribute to non-existent campaign returns 404")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
