"""
CRM Module API Tests - Phase 1 MVP
Tests for: Dashboard, Accounts, Leads, Lead Conversion, Opportunities, Settings
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def api_client():
    """Authenticated API client session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    
    # Authenticate using dev-login endpoint
    login_res = session.get(f"{BASE_URL}/api/auth/dev-login")
    assert login_res.status_code == 200, f"Login failed: {login_res.text}"
    
    # Store cookies for authenticated requests
    return session


# ==================== CRM Dashboard Tests ====================

class TestCRMDashboard:
    """CRM Dashboard API tests"""
    
    def test_dashboard_loads_this_month(self, api_client):
        """GET /api/crm/reports/dashboard returns correct structure"""
        response = api_client.get(f"{BASE_URL}/api/crm/reports/dashboard?period=this_month")
        assert response.status_code == 200, f"Dashboard failed: {response.text}"
        
        data = response.json()
        assert "period" in data
        assert "period_label" in data
        assert "metrics" in data
        assert "pipeline_by_stage" in data
        
        # Validate metrics structure
        metrics = data["metrics"]
        assert "total_pipeline" in metrics
        assert "weighted_pipeline" in metrics
        assert "open_opportunities" in metrics
        assert "closed_won" in metrics
        assert "win_rate" in metrics
        assert "new_leads" in metrics
        print(f"Dashboard metrics: Pipeline=${metrics['total_pipeline']}, Won=${metrics['closed_won']}, Win Rate={metrics['win_rate']}%")
    
    def test_dashboard_different_periods(self, api_client):
        """Dashboard supports multiple periods"""
        periods = ["today", "this_week", "this_month", "this_quarter", "this_year"]
        for period in periods:
            response = api_client.get(f"{BASE_URL}/api/crm/reports/dashboard?period={period}")
            assert response.status_code == 200, f"Dashboard {period} failed"
            data = response.json()
            assert data["period"] == period
            print(f"Dashboard period '{period}': {data.get('period_label')}")
    
    def test_stale_opportunities_endpoint(self, api_client):
        """GET /api/crm/reports/stale-opportunities returns opportunities"""
        response = api_client.get(f"{BASE_URL}/api/crm/reports/stale-opportunities?days=14")
        assert response.status_code == 200
        data = response.json()
        assert "days_threshold" in data
        assert "count" in data
        assert "opportunities" in data
        print(f"Stale opportunities (14 days): {data['count']}")
    
    def test_closing_soon_endpoint(self, api_client):
        """GET /api/crm/reports/closing-soon returns opportunities"""
        response = api_client.get(f"{BASE_URL}/api/crm/reports/closing-soon?days=30")
        assert response.status_code == 200
        data = response.json()
        assert "days" in data
        assert "count" in data
        assert "total_amount" in data
        assert "opportunities" in data
        print(f"Closing soon (30 days): {data['count']} deals worth ${data['total_amount']}")


# ==================== Accounts CRUD Tests ====================

class TestAccountsCRUD:
    """Accounts CRUD API tests"""
    
    def test_list_accounts(self, api_client):
        """GET /api/crm/accounts returns accounts list"""
        response = api_client.get(f"{BASE_URL}/api/crm/accounts")
        assert response.status_code == 200
        data = response.json()
        assert "accounts" in data
        assert "pagination" in data
        print(f"Accounts list: {len(data['accounts'])} accounts, total {data['pagination']['total']}")
    
    def test_create_account(self, api_client):
        """POST /api/crm/accounts creates new account"""
        account_data = {
            "name": "TEST_CRM_Account_Pytest",
            "account_type": "prospect",
            "industry": "E-commerce",
            "phone": "555-1234",
            "website": "https://test-account.com"
        }
        response = api_client.post(f"{BASE_URL}/api/crm/accounts", json=account_data)
        assert response.status_code == 200, f"Create account failed: {response.text}"
        
        created = response.json()
        assert "account_id" in created
        assert created["name"] == account_data["name"]
        assert created["account_type"] == "prospect"
        print(f"Created account: {created['account_id']} - {created['name']}")
        
        # Store for later tests
        pytest.test_account_id = created["account_id"]
    
    def test_get_account_details(self, api_client):
        """GET /api/crm/accounts/{id} returns account details with related data"""
        account_id = getattr(pytest, 'test_account_id', None)
        if not account_id:
            pytest.skip("No test account created")
        
        response = api_client.get(f"{BASE_URL}/api/crm/accounts/{account_id}")
        assert response.status_code == 200
        
        data = response.json()
        assert data["account_id"] == account_id
        assert "contacts" in data
        assert "opportunities" in data
        assert "tasks" in data
        print(f"Account {data['name']}: {len(data['contacts'])} contacts, {len(data['opportunities'])} opps")
    
    def test_update_account(self, api_client):
        """PUT /api/crm/accounts/{id} updates account"""
        account_id = getattr(pytest, 'test_account_id', None)
        if not account_id:
            pytest.skip("No test account created")
        
        update_data = {"industry": "Manufacturing", "phone": "555-9999"}
        response = api_client.put(f"{BASE_URL}/api/crm/accounts/{account_id}", json=update_data)
        assert response.status_code == 200
        
        # Verify update persisted
        verify_res = api_client.get(f"{BASE_URL}/api/crm/accounts/{account_id}")
        assert verify_res.status_code == 200
        data = verify_res.json()
        assert data["industry"] == "Manufacturing"
        print(f"Account updated: industry={data['industry']}")
    
    def test_search_accounts(self, api_client):
        """GET /api/crm/accounts with search filter"""
        response = api_client.get(f"{BASE_URL}/api/crm/accounts?search=TEST_CRM")
        assert response.status_code == 200
        data = response.json()
        print(f"Search 'TEST_CRM': Found {len(data['accounts'])} accounts")


# ==================== Leads CRUD Tests ====================

class TestLeadsCRUD:
    """Leads CRUD API tests"""
    
    def test_list_leads(self, api_client):
        """GET /api/crm/leads returns leads list"""
        response = api_client.get(f"{BASE_URL}/api/crm/leads")
        assert response.status_code == 200
        data = response.json()
        assert "leads" in data
        assert "pagination" in data
        print(f"Leads list: {len(data['leads'])} leads, total {data['pagination']['total']}")
    
    def test_create_lead(self, api_client):
        """POST /api/crm/leads creates new lead"""
        lead_data = {
            "first_name": "Test",
            "last_name": "LeadPytest",
            "company": "TEST_CRM_Lead_Company",
            "email": "test.lead.pytest@example.com",
            "phone": "555-LEAD",
            "source": "website"
        }
        response = api_client.post(f"{BASE_URL}/api/crm/leads", json=lead_data)
        assert response.status_code == 200, f"Create lead failed: {response.text}"
        
        created = response.json()
        assert "lead_id" in created
        assert created["full_name"] == "Test LeadPytest"
        assert created["source"] == "website"
        print(f"Created lead: {created['lead_id']} - {created['full_name']}")
        
        pytest.test_lead_id = created["lead_id"]
    
    def test_get_lead_details(self, api_client):
        """GET /api/crm/leads/{id} returns lead details"""
        lead_id = getattr(pytest, 'test_lead_id', None)
        if not lead_id:
            pytest.skip("No test lead created")
        
        response = api_client.get(f"{BASE_URL}/api/crm/leads/{lead_id}")
        assert response.status_code == 200
        
        data = response.json()
        assert data["lead_id"] == lead_id
        assert "activities" in data
        assert "notes" in data
        print(f"Lead {data['full_name']}: company={data.get('company')}, status={data['status']}")
    
    def test_update_lead(self, api_client):
        """PUT /api/crm/leads/{id} updates lead"""
        lead_id = getattr(pytest, 'test_lead_id', None)
        if not lead_id:
            pytest.skip("No test lead created")
        
        update_data = {"status": "contacted", "phone": "555-UPDATED"}
        response = api_client.put(f"{BASE_URL}/api/crm/leads/{lead_id}", json=update_data)
        assert response.status_code == 200
        
        # Verify update
        verify_res = api_client.get(f"{BASE_URL}/api/crm/leads/{lead_id}")
        data = verify_res.json()
        assert data["status"] == "contacted"
        print(f"Lead updated: status={data['status']}")
    
    def test_filter_leads_by_source(self, api_client):
        """GET /api/crm/leads with source filter"""
        response = api_client.get(f"{BASE_URL}/api/crm/leads?source=website")
        assert response.status_code == 200
        data = response.json()
        print(f"Website leads: {len(data['leads'])}")
    
    def test_filter_leads_by_status(self, api_client):
        """GET /api/crm/leads with status filter"""
        response = api_client.get(f"{BASE_URL}/api/crm/leads?status=new")
        assert response.status_code == 200
        data = response.json()
        print(f"New leads: {len(data['leads'])}")


# ==================== Lead Conversion Tests ====================

class TestLeadConversion:
    """Lead to Account + Opportunity conversion tests"""
    
    def test_convert_lead_with_opportunity(self, api_client):
        """POST /api/crm/leads/{id}/convert creates Account + Contact + Opportunity"""
        # Create a fresh lead for conversion
        lead_data = {
            "first_name": "Convert",
            "last_name": "TestLead",
            "company": "TEST_ConvertCo",
            "email": "convert.test@example.com",
            "source": "trade_show"
        }
        create_res = api_client.post(f"{BASE_URL}/api/crm/leads", json=lead_data)
        assert create_res.status_code == 200
        lead_id = create_res.json()["lead_id"]
        
        # Convert the lead
        convert_data = {
            "create_opportunity": True,
            "opportunity_name": "TEST_Converted Deal",
            "opportunity_amount": 50000
        }
        response = api_client.post(f"{BASE_URL}/api/crm/leads/{lead_id}/convert", json=convert_data)
        assert response.status_code == 200, f"Convert failed: {response.text}"
        
        result = response.json()
        assert result["success"] == True
        assert "account_id" in result or result.get("account_created")
        assert "contact_id" in result
        assert "opportunity_id" in result
        print(f"Lead converted: Account={result.get('account_id')}, Opp={result.get('opportunity_id')}")
        
        # Store opportunity for later tests
        pytest.converted_opp_id = result["opportunity_id"]
    
    def test_convert_lead_without_opportunity(self, api_client):
        """POST /api/crm/leads/{id}/convert can create Account without Opportunity"""
        # Create a fresh lead
        lead_data = {
            "first_name": "NoOpp",
            "last_name": "TestLead",
            "company": "TEST_NoOppCo",
            "email": "noopp.test@example.com",
            "source": "website"
        }
        create_res = api_client.post(f"{BASE_URL}/api/crm/leads", json=lead_data)
        assert create_res.status_code == 200
        lead_id = create_res.json()["lead_id"]
        
        # Convert without opportunity
        convert_data = {"create_opportunity": False}
        response = api_client.post(f"{BASE_URL}/api/crm/leads/{lead_id}/convert", json=convert_data)
        assert response.status_code == 200
        
        result = response.json()
        assert result["success"] == True
        assert "contact_id" in result
        assert "opportunity_id" not in result or result.get("opportunity_id") is None
        print(f"Lead converted without opportunity: Contact={result.get('contact_id')}")
    
    def test_cannot_convert_already_converted_lead(self, api_client):
        """Cannot convert a lead that's already converted"""
        # Create and convert a lead
        lead_data = {
            "first_name": "Double",
            "last_name": "Convert",
            "company": "TEST_DoubleCo",
            "email": "double.convert@example.com",
            "source": "website"
        }
        create_res = api_client.post(f"{BASE_URL}/api/crm/leads", json=lead_data)
        lead_id = create_res.json()["lead_id"]
        
        # First conversion
        api_client.post(f"{BASE_URL}/api/crm/leads/{lead_id}/convert", json={"create_opportunity": False})
        
        # Try to convert again - should fail
        response = api_client.post(f"{BASE_URL}/api/crm/leads/{lead_id}/convert", json={"create_opportunity": False})
        assert response.status_code == 400
        print("Correctly prevented double conversion")


# ==================== Opportunities CRUD Tests ====================

class TestOpportunitiesCRUD:
    """Opportunities CRUD API tests"""
    
    def test_list_opportunities(self, api_client):
        """GET /api/crm/opportunities returns opportunities list"""
        response = api_client.get(f"{BASE_URL}/api/crm/opportunities")
        assert response.status_code == 200
        data = response.json()
        assert "opportunities" in data
        assert "pagination" in data
        print(f"Opportunities list: {len(data['opportunities'])} opps, total {data['pagination']['total']}")
    
    def test_get_pipeline_kanban(self, api_client):
        """GET /api/crm/opportunities/pipeline returns grouped data for Kanban"""
        response = api_client.get(f"{BASE_URL}/api/crm/opportunities/pipeline")
        assert response.status_code == 200
        
        data = response.json()
        assert "pipeline" in data
        assert "totals" in data
        
        # Check pipeline structure by stage
        pipeline = data["pipeline"]
        expected_stages = ["prospecting", "qualification", "needs_analysis", "proposal", "negotiation"]
        for stage in expected_stages:
            assert stage in pipeline, f"Missing stage: {stage}"
            assert "opportunities" in pipeline[stage]
            assert "count" in pipeline[stage]
            assert "total_amount" in pipeline[stage]
        
        print(f"Pipeline totals: {data['totals']['total_count']} deals worth ${data['totals']['total_amount']}")
    
    def test_create_opportunity(self, api_client):
        """POST /api/crm/opportunities creates new opportunity"""
        # First get or create an account
        account_id = getattr(pytest, 'test_account_id', None)
        if not account_id:
            acc_res = api_client.post(f"{BASE_URL}/api/crm/accounts", json={
                "name": "TEST_OppAccount",
                "account_type": "prospect"
            })
            account_id = acc_res.json()["account_id"]
        
        opp_data = {
            "name": "TEST_Big Deal Q1",
            "account_id": account_id,
            "amount": 75000,
            "stage": "qualification",
            "close_date": "2026-03-31",
            "probability": 20
        }
        response = api_client.post(f"{BASE_URL}/api/crm/opportunities", json=opp_data)
        assert response.status_code == 200, f"Create opp failed: {response.text}"
        
        created = response.json()
        assert "opportunity_id" in created
        assert created["name"] == opp_data["name"]
        assert created["amount"] == 75000
        assert "stage_history" in created
        print(f"Created opportunity: {created['opportunity_id']} - {created['name']} (${created['amount']})")
        
        pytest.test_opp_id = created["opportunity_id"]
    
    def test_get_opportunity_details(self, api_client):
        """GET /api/crm/opportunities/{id} returns opportunity with related data"""
        opp_id = getattr(pytest, 'test_opp_id', None)
        if not opp_id:
            pytest.skip("No test opportunity created")
        
        response = api_client.get(f"{BASE_URL}/api/crm/opportunities/{opp_id}")
        assert response.status_code == 200
        
        data = response.json()
        assert data["opportunity_id"] == opp_id
        assert "account" in data
        assert "activities" in data
        assert "notes" in data
        assert "stage_history" in data
        print(f"Opportunity {data['name']}: stage={data['stage']}, amount=${data['amount']}")


# ==================== Opportunity Stage Change Tests ====================

class TestOpportunityStageChange:
    """Opportunity stage progression tests"""
    
    def test_update_opportunity_stage(self, api_client):
        """PUT /api/crm/opportunities/{id} updates stage and tracks history"""
        opp_id = getattr(pytest, 'test_opp_id', None)
        if not opp_id:
            pytest.skip("No test opportunity created")
        
        # Move from qualification to needs_analysis
        response = api_client.put(f"{BASE_URL}/api/crm/opportunities/{opp_id}", json={
            "stage": "needs_analysis"
        })
        assert response.status_code == 200
        
        # Verify stage change and probability update
        verify_res = api_client.get(f"{BASE_URL}/api/crm/opportunities/{opp_id}")
        data = verify_res.json()
        assert data["stage"] == "needs_analysis"
        assert data["probability"] == 40  # Auto-updated based on stage
        assert len(data["stage_history"]) >= 2  # Initial + update
        print(f"Stage changed to needs_analysis, probability auto-set to {data['probability']}%")
    
    def test_update_to_closed_won(self, api_client):
        """Closing as won updates forecast category and marks as won"""
        # Create a fresh opportunity to close
        acc_res = api_client.post(f"{BASE_URL}/api/crm/accounts", json={
            "name": "TEST_ClosedWonAccount",
            "account_type": "prospect"
        })
        account_id = acc_res.json()["account_id"]
        
        opp_res = api_client.post(f"{BASE_URL}/api/crm/opportunities", json={
            "name": "TEST_Will Win Deal",
            "account_id": account_id,
            "amount": 10000,
            "stage": "negotiation",
            "close_date": "2026-01-31"
        })
        opp_id = opp_res.json()["opportunity_id"]
        
        # Close as won
        response = api_client.put(f"{BASE_URL}/api/crm/opportunities/{opp_id}", json={
            "stage": "closed_won"
        })
        assert response.status_code == 200
        
        # Verify closed state
        verify_res = api_client.get(f"{BASE_URL}/api/crm/opportunities/{opp_id}")
        data = verify_res.json()
        assert data["stage"] == "closed_won"
        assert data["probability"] == 100
        assert data["forecast_category"] == "closed"
        assert data.get("is_won") == True
        print(f"Deal closed won: {data['name']} (${data['amount']})")
    
    def test_update_to_closed_lost(self, api_client):
        """Closing as lost updates forecast category and marks as lost"""
        acc_res = api_client.post(f"{BASE_URL}/api/crm/accounts", json={
            "name": "TEST_ClosedLostAccount",
            "account_type": "prospect"
        })
        account_id = acc_res.json()["account_id"]
        
        opp_res = api_client.post(f"{BASE_URL}/api/crm/opportunities", json={
            "name": "TEST_Will Lose Deal",
            "account_id": account_id,
            "amount": 5000,
            "stage": "proposal",
            "close_date": "2026-01-31"
        })
        opp_id = opp_res.json()["opportunity_id"]
        
        # Close as lost
        response = api_client.put(f"{BASE_URL}/api/crm/opportunities/{opp_id}", json={
            "stage": "closed_lost"
        })
        assert response.status_code == 200
        
        verify_res = api_client.get(f"{BASE_URL}/api/crm/opportunities/{opp_id}")
        data = verify_res.json()
        assert data["stage"] == "closed_lost"
        assert data["probability"] == 0
        assert data["forecast_category"] == "omitted"
        assert data.get("is_won") == False
        print(f"Deal closed lost: {data['name']}")


# ==================== CRM Settings Tests ====================

class TestCRMSettings:
    """CRM Settings API tests"""
    
    def test_get_settings_returns_stages(self, api_client):
        """GET /api/crm/settings returns editable stages"""
        response = api_client.get(f"{BASE_URL}/api/crm/settings")
        assert response.status_code == 200
        
        data = response.json()
        assert "opportunity_stages" in data
        assert "lead_sources" in data
        
        # Verify stage structure
        stages = data["opportunity_stages"]
        assert len(stages) >= 7  # Default Salesforce stages
        
        # Check each stage has required fields
        for stage in stages:
            assert "stage_id" in stage
            assert "name" in stage
            assert "probability" in stage
            assert "is_closed" in stage
        
        # Verify lead sources include website and trade_show
        assert "website" in data["lead_sources"]
        assert "trade_show" in data["lead_sources"]
        
        print(f"Settings: {len(stages)} stages, {len(data['lead_sources'])} lead sources")


# ==================== Cleanup Tests ====================

class TestCleanup:
    """Cleanup test data"""
    
    def test_delete_test_leads(self, api_client):
        """Delete test leads created during testing"""
        response = api_client.get(f"{BASE_URL}/api/crm/leads?search=TEST_&page_size=100")
        leads = response.json().get("leads", [])
        
        deleted = 0
        for lead in leads:
            if "TEST_" in lead.get("company", "") or "test" in lead.get("email", "").lower():
                del_res = api_client.delete(f"{BASE_URL}/api/crm/leads/{lead['lead_id']}")
                if del_res.status_code == 200:
                    deleted += 1
        print(f"Cleaned up {deleted} test leads")
    
    def test_delete_test_accounts(self, api_client):
        """Delete test accounts created during testing"""
        response = api_client.get(f"{BASE_URL}/api/crm/accounts?search=TEST_&page_size=100")
        accounts = response.json().get("accounts", [])
        
        deleted = 0
        for account in accounts:
            if "TEST_" in account.get("name", ""):
                del_res = api_client.delete(f"{BASE_URL}/api/crm/accounts/{account['account_id']}")
                if del_res.status_code == 200:
                    deleted += 1
        print(f"Cleaned up {deleted} test accounts")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
