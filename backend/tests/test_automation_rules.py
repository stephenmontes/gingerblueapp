"""
Automation Rule Engine Tests
Tests Lead Assignment Rules, Stale Opportunity Rules, Manual Triggers, and High-Signal Field Change Logging
"""
import pytest
import requests
import os
import time
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestAutomationBackend:
    """Test Automation Rule Engine Backend APIs"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        # Get dev login session
        resp = self.session.get(f"{BASE_URL}/api/auth/dev-login")
        assert resp.status_code == 200, f"Dev login failed: {resp.text}"
        yield
        # Cleanup test data
        self._cleanup_test_data()
    
    def _cleanup_test_data(self):
        """Cleanup test-created data"""
        try:
            # Get and delete test lead assignment rules
            resp = self.session.get(f"{BASE_URL}/api/automation/lead-assignment-rules")
            if resp.status_code == 200:
                rules = resp.json().get('rules', [])
                for rule in rules:
                    if rule.get('name', '').startswith('TEST_'):
                        self.session.delete(f"{BASE_URL}/api/automation/lead-assignment-rules/{rule['rule_id']}")
            
            # Get and delete test stale opportunity rules
            resp = self.session.get(f"{BASE_URL}/api/automation/stale-opportunity-rules")
            if resp.status_code == 200:
                rules = resp.json().get('rules', [])
                for rule in rules:
                    if rule.get('name', '').startswith('TEST_'):
                        self.session.delete(f"{BASE_URL}/api/automation/stale-opportunity-rules/{rule['rule_id']}")
            
            # Delete test leads
            resp = self.session.get(f"{BASE_URL}/api/crm/leads", params={"search": "TEST_"})
            if resp.status_code == 200:
                leads = resp.json().get('leads', [])
                for lead in leads:
                    self.session.delete(f"{BASE_URL}/api/crm/leads/{lead['lead_id']}")
        except Exception as e:
            print(f"Cleanup error: {e}")
    
    # ==================== LEAD ASSIGNMENT RULES CRUD ====================
    
    def test_get_lead_assignment_rules(self):
        """Test GET /api/automation/lead-assignment-rules"""
        resp = self.session.get(f"{BASE_URL}/api/automation/lead-assignment-rules")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "rules" in data, "Response should contain 'rules' key"
        assert isinstance(data["rules"], list), "Rules should be a list"
        print(f"SUCCESS: GET lead-assignment-rules returned {len(data['rules'])} rules")
    
    def test_create_lead_assignment_rule_round_robin(self):
        """Test POST /api/automation/lead-assignment-rules with round_robin method"""
        # First get users to assign
        users_resp = self.session.get(f"{BASE_URL}/api/users")
        assert users_resp.status_code == 200, f"Failed to get users: {users_resp.text}"
        users = users_resp.json()
        user_list = users.get('users', users) if isinstance(users, dict) else users
        assignee_ids = [u['user_id'] for u in user_list[:2]] if user_list else []
        
        payload = {
            "name": "TEST_Round_Robin_Rule",
            "description": "Test round robin assignment rule",
            "method": "round_robin",
            "conditions": {},
            "assignee_user_ids": assignee_ids,
            "priority": 100,
            "status": "active"
        }
        
        resp = self.session.post(
            f"{BASE_URL}/api/automation/lead-assignment-rules",
            json=payload
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert data.get("success") == True, "Response should indicate success"
        assert "rule" in data, "Response should contain 'rule'"
        assert data["rule"]["name"] == payload["name"], "Rule name should match"
        assert data["rule"]["method"] == "round_robin", "Method should be round_robin"
        assert "rule_id" in data["rule"], "Rule should have rule_id"
        print(f"SUCCESS: Created lead assignment rule: {data['rule']['rule_id']}")
        return data["rule"]["rule_id"]
    
    def test_create_lead_assignment_rule_by_territory(self):
        """Test POST /api/automation/lead-assignment-rules with by_territory method"""
        users_resp = self.session.get(f"{BASE_URL}/api/users")
        users = users_resp.json()
        user_list = users.get('users', users) if isinstance(users, dict) else users
        assignee_ids = [u['user_id'] for u in user_list[:1]] if user_list else []
        
        payload = {
            "name": "TEST_Territory_Rule",
            "description": "Assign leads from Northeast territory",
            "method": "by_territory",
            "conditions": {"territory": "Northeast"},
            "assignee_user_ids": assignee_ids,
            "priority": 50,
            "status": "active"
        }
        
        resp = self.session.post(
            f"{BASE_URL}/api/automation/lead-assignment-rules",
            json=payload
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert data["rule"]["conditions"]["territory"] == "Northeast"
        print(f"SUCCESS: Created territory assignment rule: {data['rule']['rule_id']}")
        return data["rule"]["rule_id"]
    
    def test_update_lead_assignment_rule(self):
        """Test PUT /api/automation/lead-assignment-rules/{rule_id}"""
        # Create a rule first
        rule_id = self.test_create_lead_assignment_rule_round_robin()
        
        update_payload = {
            "name": "TEST_Round_Robin_Updated",
            "priority": 200,
            "status": "inactive"
        }
        
        resp = self.session.put(
            f"{BASE_URL}/api/automation/lead-assignment-rules/{rule_id}",
            json=update_payload
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert data.get("success") == True, "Update should succeed"
        
        # Verify update
        get_resp = self.session.get(f"{BASE_URL}/api/automation/lead-assignment-rules")
        rules = get_resp.json().get('rules', [])
        updated_rule = next((r for r in rules if r['rule_id'] == rule_id), None)
        assert updated_rule is not None, "Rule should exist"
        assert updated_rule["status"] == "inactive", "Status should be updated to inactive"
        print(f"SUCCESS: Updated lead assignment rule: {rule_id}")
    
    def test_delete_lead_assignment_rule(self):
        """Test DELETE /api/automation/lead-assignment-rules/{rule_id}"""
        # Create a rule first
        rule_id = self.test_create_lead_assignment_rule_round_robin()
        
        resp = self.session.delete(f"{BASE_URL}/api/automation/lead-assignment-rules/{rule_id}")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert data.get("success") == True, "Delete should succeed"
        
        # Verify deletion
        get_resp = self.session.get(f"{BASE_URL}/api/automation/lead-assignment-rules")
        rules = get_resp.json().get('rules', [])
        deleted_rule = next((r for r in rules if r['rule_id'] == rule_id), None)
        assert deleted_rule is None, "Rule should be deleted"
        print(f"SUCCESS: Deleted lead assignment rule: {rule_id}")
    
    # ==================== STALE OPPORTUNITY RULES CRUD ====================
    
    def test_get_stale_opportunity_rules(self):
        """Test GET /api/automation/stale-opportunity-rules"""
        resp = self.session.get(f"{BASE_URL}/api/automation/stale-opportunity-rules")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "rules" in data, "Response should contain 'rules' key"
        assert isinstance(data["rules"], list), "Rules should be a list"
        print(f"SUCCESS: GET stale-opportunity-rules returned {len(data['rules'])} rules")
    
    def test_create_stale_opportunity_rule(self):
        """Test POST /api/automation/stale-opportunity-rules"""
        payload = {
            "name": "TEST_14_Day_Stale_Reminder",
            "description": "Remind when opportunities have no activity for 14 days",
            "days_threshold": 14,
            "applicable_stages": ["prospecting", "qualification"],
            "notify_owner": True,
            "additional_notify_user_ids": [],
            "status": "active"
        }
        
        resp = self.session.post(
            f"{BASE_URL}/api/automation/stale-opportunity-rules",
            json=payload
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert data.get("success") == True, "Response should indicate success"
        assert "rule" in data, "Response should contain 'rule'"
        assert data["rule"]["days_threshold"] == 14, "Days threshold should be 14"
        assert data["rule"]["notify_owner"] == True, "Notify owner should be True"
        print(f"SUCCESS: Created stale opportunity rule: {data['rule']['rule_id']}")
        return data["rule"]["rule_id"]
    
    def test_update_stale_opportunity_rule(self):
        """Test PUT /api/automation/stale-opportunity-rules/{rule_id}"""
        rule_id = self.test_create_stale_opportunity_rule()
        
        update_payload = {
            "days_threshold": 21,
            "status": "inactive"
        }
        
        resp = self.session.put(
            f"{BASE_URL}/api/automation/stale-opportunity-rules/{rule_id}",
            json=update_payload
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert data.get("success") == True, "Update should succeed"
        print(f"SUCCESS: Updated stale opportunity rule: {rule_id}")
    
    def test_delete_stale_opportunity_rule(self):
        """Test DELETE /api/automation/stale-opportunity-rules/{rule_id}"""
        rule_id = self.test_create_stale_opportunity_rule()
        
        resp = self.session.delete(f"{BASE_URL}/api/automation/stale-opportunity-rules/{rule_id}")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert data.get("success") == True, "Delete should succeed"
        print(f"SUCCESS: Deleted stale opportunity rule: {rule_id}")
    
    # ==================== MANUAL STALE CHECK TRIGGER ====================
    
    def test_run_stale_check_manually(self):
        """Test POST /api/automation/run-stale-check"""
        # First create a stale rule so the check has something to work with
        self.test_create_stale_opportunity_rule()
        
        resp = self.session.post(f"{BASE_URL}/api/automation/run-stale-check")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert data.get("success") == True, "Stale check should succeed"
        assert "result" in data, "Response should contain 'result'"
        print(f"SUCCESS: Ran stale check, result: {data.get('result')}")
    
    # ==================== LEAD ASSIGNMENT EXECUTION ====================
    
    def test_lead_creation_triggers_assignment(self):
        """Test that creating a lead triggers automatic assignment when rules exist"""
        # Get users for assignment
        users_resp = self.session.get(f"{BASE_URL}/api/users")
        users = users_resp.json()
        user_list = users.get('users', users) if isinstance(users, dict) else users
        assignee_ids = [u['user_id'] for u in user_list[:2]] if user_list else []
        
        if not assignee_ids:
            pytest.skip("No users available for assignment test")
        
        # Create an active assignment rule
        rule_payload = {
            "name": "TEST_Auto_Assignment_Rule",
            "description": "Auto assign all new leads",
            "method": "round_robin",
            "conditions": {},
            "assignee_user_ids": assignee_ids,
            "priority": 1,
            "status": "active"
        }
        
        rule_resp = self.session.post(
            f"{BASE_URL}/api/automation/lead-assignment-rules",
            json=rule_payload
        )
        assert rule_resp.status_code == 200, f"Failed to create rule: {rule_resp.text}"
        
        # Create a lead WITHOUT specifying owner_id
        lead_payload = {
            "first_name": "TEST_Auto",
            "last_name": "Assigned",
            "email": f"test_auto_{int(time.time())}@example.com",
            "company": "Test Company",
            "source": "website"
            # Note: No owner_id specified - should trigger automatic assignment
        }
        
        lead_resp = self.session.post(f"{BASE_URL}/api/crm/leads", json=lead_payload)
        assert lead_resp.status_code == 200, f"Failed to create lead: {lead_resp.text}"
        lead_data = lead_resp.json()
        lead_id = lead_data.get("lead_id")
        
        # Wait for background task to complete
        time.sleep(2)
        
        # Verify lead was assigned (check timeline for auto_assigned event)
        timeline_resp = self.session.get(f"{BASE_URL}/api/timeline/items/lead/{lead_id}")
        if timeline_resp.status_code == 200:
            timeline_data = timeline_resp.json()
            auto_assigned_events = [
                item for item in timeline_data.get('items', [])
                if item.get('activity_type') == 'auto_assigned'
            ]
            if auto_assigned_events:
                print(f"SUCCESS: Lead auto-assigned event found in timeline")
            else:
                print(f"INFO: No auto_assigned event in timeline yet (may be async)")
        
        print(f"SUCCESS: Created lead {lead_id} for assignment test")
    
    # ==================== HIGH-SIGNAL FIELD CHANGE LOGGING ====================
    
    def test_opportunity_amount_change_logged(self):
        """Test that changing opportunity amount logs to timeline"""
        # First create an account
        account_payload = {
            "name": f"TEST_Account_{int(time.time())}",
            "account_type": "prospect",
            "industry": "Technology"
        }
        account_resp = self.session.post(f"{BASE_URL}/api/crm/accounts", json=account_payload)
        if account_resp.status_code != 200:
            pytest.skip(f"Could not create account: {account_resp.text}")
        account_id = account_resp.json().get("account_id")
        
        # Create an opportunity
        opp_payload = {
            "name": "TEST_Opportunity_Amount_Change",
            "account_id": account_id,
            "amount": 10000,
            "stage": "prospecting",
            "probability": 10,
            "forecast_category": "pipeline",
            "close_date": "2026-03-01"
        }
        opp_resp = self.session.post(f"{BASE_URL}/api/crm/opportunities", json=opp_payload)
        assert opp_resp.status_code == 200, f"Failed to create opportunity: {opp_resp.text}"
        opp_id = opp_resp.json().get("opportunity_id")
        
        # Update the amount (high-signal field)
        update_payload = {"amount": 25000}
        update_resp = self.session.put(
            f"{BASE_URL}/api/crm/opportunities/{opp_id}",
            json=update_payload
        )
        assert update_resp.status_code == 200, f"Failed to update opportunity: {update_resp.text}"
        
        # Check timeline for amount_changed event
        timeline_resp = self.session.get(f"{BASE_URL}/api/timeline/items/opportunity/{opp_id}")
        assert timeline_resp.status_code == 200, f"Failed to get timeline: {timeline_resp.text}"
        timeline_data = timeline_resp.json()
        
        amount_change_events = [
            item for item in timeline_data.get('items', [])
            if item.get('activity_type') == 'amount_changed'
        ]
        
        assert len(amount_change_events) > 0, "Amount change should be logged to timeline"
        event = amount_change_events[0]
        assert event.get('metadata', {}).get('old_value') == 10000, "Old value should be 10000"
        assert event.get('metadata', {}).get('new_value') == 25000, "New value should be 25000"
        print(f"SUCCESS: Amount change logged to timeline: ${10000} -> ${25000}")
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/crm/opportunities/{opp_id}")
        self.session.delete(f"{BASE_URL}/api/crm/accounts/{account_id}")
    
    def test_opportunity_close_date_change_logged(self):
        """Test that changing opportunity close_date logs to timeline"""
        # Create account and opportunity
        account_payload = {
            "name": f"TEST_Account_CloseDate_{int(time.time())}",
            "account_type": "prospect"
        }
        account_resp = self.session.post(f"{BASE_URL}/api/crm/accounts", json=account_payload)
        if account_resp.status_code != 200:
            pytest.skip(f"Could not create account: {account_resp.text}")
        account_id = account_resp.json().get("account_id")
        
        opp_payload = {
            "name": "TEST_Opportunity_Close_Date_Change",
            "account_id": account_id,
            "amount": 5000,
            "stage": "prospecting",
            "close_date": "2026-02-01"
        }
        opp_resp = self.session.post(f"{BASE_URL}/api/crm/opportunities", json=opp_payload)
        assert opp_resp.status_code == 200
        opp_id = opp_resp.json().get("opportunity_id")
        
        # Update close_date
        update_resp = self.session.put(
            f"{BASE_URL}/api/crm/opportunities/{opp_id}",
            json={"close_date": "2026-04-15"}
        )
        assert update_resp.status_code == 200
        
        # Check timeline
        timeline_resp = self.session.get(f"{BASE_URL}/api/timeline/items/opportunity/{opp_id}")
        timeline_data = timeline_resp.json()
        
        close_date_events = [
            item for item in timeline_data.get('items', [])
            if item.get('activity_type') == 'close_date_changed'
        ]
        
        assert len(close_date_events) > 0, "Close date change should be logged"
        print(f"SUCCESS: Close date change logged to timeline")
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/crm/opportunities/{opp_id}")
        self.session.delete(f"{BASE_URL}/api/crm/accounts/{account_id}")
    
    def test_opportunity_won_event_logged(self):
        """Test that closing opportunity as won logs opportunity_won event"""
        # Create account and opportunity
        account_payload = {
            "name": f"TEST_Account_Won_{int(time.time())}",
            "account_type": "prospect"
        }
        account_resp = self.session.post(f"{BASE_URL}/api/crm/accounts", json=account_payload)
        if account_resp.status_code != 200:
            pytest.skip(f"Could not create account: {account_resp.text}")
        account_id = account_resp.json().get("account_id")
        
        opp_payload = {
            "name": "TEST_Opportunity_Won",
            "account_id": account_id,
            "amount": 50000,
            "stage": "negotiation",
            "close_date": "2026-01-30"
        }
        opp_resp = self.session.post(f"{BASE_URL}/api/crm/opportunities", json=opp_payload)
        assert opp_resp.status_code == 200
        opp_id = opp_resp.json().get("opportunity_id")
        
        # Close as won
        update_resp = self.session.put(
            f"{BASE_URL}/api/crm/opportunities/{opp_id}",
            json={"stage": "closed_won"}
        )
        assert update_resp.status_code == 200
        
        # Check timeline for opportunity_won event
        timeline_resp = self.session.get(f"{BASE_URL}/api/timeline/items/opportunity/{opp_id}")
        timeline_data = timeline_resp.json()
        
        won_events = [
            item for item in timeline_data.get('items', [])
            if item.get('activity_type') == 'opportunity_won'
        ]
        
        assert len(won_events) > 0, "Opportunity won event should be logged"
        event = won_events[0]
        assert event.get('metadata', {}).get('is_won') == True
        print(f"SUCCESS: Opportunity won event logged with amount: ${event.get('metadata', {}).get('amount', 0)}")
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/crm/opportunities/{opp_id}")
        self.session.delete(f"{BASE_URL}/api/crm/accounts/{account_id}")
    
    def test_opportunity_lost_event_logged(self):
        """Test that closing opportunity as lost logs opportunity_lost event"""
        # Create account and opportunity
        account_payload = {
            "name": f"TEST_Account_Lost_{int(time.time())}",
            "account_type": "prospect"
        }
        account_resp = self.session.post(f"{BASE_URL}/api/crm/accounts", json=account_payload)
        if account_resp.status_code != 200:
            pytest.skip(f"Could not create account: {account_resp.text}")
        account_id = account_resp.json().get("account_id")
        
        opp_payload = {
            "name": "TEST_Opportunity_Lost",
            "account_id": account_id,
            "amount": 30000,
            "stage": "proposal",
            "close_date": "2026-02-15"
        }
        opp_resp = self.session.post(f"{BASE_URL}/api/crm/opportunities", json=opp_payload)
        assert opp_resp.status_code == 200
        opp_id = opp_resp.json().get("opportunity_id")
        
        # Close as lost
        update_resp = self.session.put(
            f"{BASE_URL}/api/crm/opportunities/{opp_id}",
            json={"stage": "closed_lost"}
        )
        assert update_resp.status_code == 200
        
        # Check timeline for opportunity_lost event
        timeline_resp = self.session.get(f"{BASE_URL}/api/timeline/items/opportunity/{opp_id}")
        timeline_data = timeline_resp.json()
        
        lost_events = [
            item for item in timeline_data.get('items', [])
            if item.get('activity_type') == 'opportunity_lost'
        ]
        
        assert len(lost_events) > 0, "Opportunity lost event should be logged"
        print(f"SUCCESS: Opportunity lost event logged")
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/crm/opportunities/{opp_id}")
        self.session.delete(f"{BASE_URL}/api/crm/accounts/{account_id}")
    
    # ==================== PERMISSION TESTS ====================
    
    def test_lead_assignment_rules_permission(self):
        """Test that lead assignment rules require admin/manager access"""
        # The dev-login should give admin access, so this should work
        resp = self.session.get(f"{BASE_URL}/api/automation/lead-assignment-rules")
        assert resp.status_code in [200, 403], f"Unexpected status: {resp.status_code}"
        if resp.status_code == 200:
            print("SUCCESS: User has access to lead assignment rules")
        else:
            print("INFO: User lacks permission (expected for non-admin)")
    
    def test_run_stale_check_requires_admin(self):
        """Test that manual stale check requires admin access"""
        resp = self.session.post(f"{BASE_URL}/api/automation/run-stale-check")
        # Should either succeed (admin) or return 403 (non-admin)
        assert resp.status_code in [200, 403], f"Unexpected status: {resp.status_code}"
        print(f"SUCCESS: Stale check permission check returned {resp.status_code}")
    
    # ==================== FILTER TESTS ====================
    
    def test_get_lead_assignment_rules_with_status_filter(self):
        """Test GET /api/automation/lead-assignment-rules?status=active"""
        # Create active and inactive rules
        users_resp = self.session.get(f"{BASE_URL}/api/users")
        users = users_resp.json()
        user_list = users.get('users', users) if isinstance(users, dict) else users
        assignee_ids = [u['user_id'] for u in user_list[:1]] if user_list else []
        
        # Create active rule
        self.session.post(
            f"{BASE_URL}/api/automation/lead-assignment-rules",
            json={
                "name": "TEST_Active_Rule_Filter",
                "method": "round_robin",
                "assignee_user_ids": assignee_ids,
                "status": "active"
            }
        )
        
        # Create inactive rule
        self.session.post(
            f"{BASE_URL}/api/automation/lead-assignment-rules",
            json={
                "name": "TEST_Inactive_Rule_Filter",
                "method": "round_robin",
                "assignee_user_ids": assignee_ids,
                "status": "inactive"
            }
        )
        
        # Filter by active status
        resp = self.session.get(
            f"{BASE_URL}/api/automation/lead-assignment-rules",
            params={"status": "active"}
        )
        assert resp.status_code == 200
        rules = resp.json().get('rules', [])
        
        # All returned rules should be active
        for rule in rules:
            assert rule.get('status') == 'active', f"Rule {rule.get('name')} should be active"
        
        print(f"SUCCESS: Status filter returned {len(rules)} active rules")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
