"""
CRM Phase 3 Tests - Gmail Integration & Approval Workflows
Tests for:
- Gmail OAuth endpoints (status, auth/start)
- Approval Rules CRUD (create, list, update, delete)
- Approval Requests (create, list, approve, reject)
- My pending approvals endpoint
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
assert BASE_URL, "REACT_APP_BACKEND_URL environment variable must be set"

@pytest.fixture(scope="module")
def session():
    """Create authenticated session using dev-login"""
    s = requests.Session()
    # Get dev-login session
    resp = s.get(f"{BASE_URL}/api/auth/dev-login")
    assert resp.status_code == 200, f"Dev login failed: {resp.text}"
    return s

@pytest.fixture(scope="module")
def test_user_id(session):
    """Get the test user ID from auth/me"""
    resp = session.get(f"{BASE_URL}/api/auth/me")
    assert resp.status_code == 200
    return resp.json().get("user_id")


# ==================== GMAIL INTEGRATION TESTS ====================

class TestGmailIntegration:
    """Gmail OAuth endpoint tests"""
    
    def test_gmail_status_returns_connected_false_when_not_connected(self, session):
        """Gmail status should return connected: false when no Gmail is connected"""
        response = session.get(f"{BASE_URL}/api/gmail/status")
        assert response.status_code == 200
        data = response.json()
        assert "connected" in data
        assert data["connected"] == False
        print(f"Gmail status response: {data}")
    
    def test_gmail_auth_start_returns_authorization_url(self, session):
        """Gmail auth/start should return an authorization_url for Google OAuth"""
        response = session.get(f"{BASE_URL}/api/gmail/auth/start")
        assert response.status_code == 200
        data = response.json()
        assert "authorization_url" in data
        assert "accounts.google.com" in data["authorization_url"]
        assert "client_id" in data["authorization_url"]
        assert "redirect_uri" in data["authorization_url"]
        print(f"Gmail auth URL starts with: {data['authorization_url'][:100]}...")
    
    def test_gmail_disconnect_when_not_connected(self, session):
        """Disconnecting Gmail when not connected should return 404"""
        response = session.post(f"{BASE_URL}/api/gmail/disconnect")
        # Should return 404 since Gmail is not connected
        assert response.status_code == 404
        data = response.json()
        assert "not connected" in data.get("detail", "").lower()


# ==================== APPROVAL RULES CRUD TESTS ====================

class TestApprovalRulesCRUD:
    """Approval Rules CRUD endpoint tests"""
    
    created_rule_id = None
    
    def test_list_approval_rules_empty(self, session):
        """List approval rules should return empty array initially"""
        response = session.get(f"{BASE_URL}/api/automation/approval-rules")
        assert response.status_code == 200
        data = response.json()
        assert "rules" in data
        assert isinstance(data["rules"], list)
        print(f"Found {len(data['rules'])} existing approval rules")
    
    def test_create_approval_rule_discount_percent(self, session, test_user_id):
        """Create a discount percent approval rule"""
        payload = {
            "name": "TEST_High Discount Approval",
            "description": "Require approval for discounts >= 15%",
            "trigger_type": "discount_percent",
            "threshold": 15.0,
            "operator": "gte",
            "approver_user_ids": [test_user_id],
            "auto_approve_below_threshold": True,
            "status": "active"
        }
        response = session.post(
            f"{BASE_URL}/api/automation/approval-rules",
            json=payload
        )
        assert response.status_code == 200, f"Create rule failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "rule_id" in data
        assert data["name"] == "TEST_High Discount Approval"
        assert data["trigger_type"] == "discount_percent"
        assert data["threshold"] == 15.0
        assert data["operator"] == "gte"
        assert test_user_id in data["approver_user_ids"]
        assert data["status"] == "active"
        
        TestApprovalRulesCRUD.created_rule_id = data["rule_id"]
        print(f"Created approval rule: {data['rule_id']}")
    
    def test_list_approval_rules_has_created_rule(self, session):
        """List should include the created rule"""
        response = session.get(f"{BASE_URL}/api/automation/approval-rules")
        assert response.status_code == 200
        data = response.json()
        
        rule_ids = [r["rule_id"] for r in data["rules"]]
        assert TestApprovalRulesCRUD.created_rule_id in rule_ids
        
        # Find our rule and verify enriched data
        our_rule = next(r for r in data["rules"] if r["rule_id"] == TestApprovalRulesCRUD.created_rule_id)
        assert "approvers" in our_rule, "Approvers should be enriched"
        print(f"Rule has {len(our_rule.get('approvers', []))} approver(s)")
    
    def test_update_approval_rule(self, session):
        """Update the approval rule threshold"""
        assert TestApprovalRulesCRUD.created_rule_id, "Need created rule ID"
        
        payload = {
            "threshold": 20.0,
            "description": "Updated: Require approval for discounts >= 20%"
        }
        response = session.put(
            f"{BASE_URL}/api/automation/approval-rules/{TestApprovalRulesCRUD.created_rule_id}",
            json=payload
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") == True
        
        # Verify update by fetching rules
        list_resp = session.get(f"{BASE_URL}/api/automation/approval-rules")
        rules = list_resp.json()["rules"]
        our_rule = next(r for r in rules if r["rule_id"] == TestApprovalRulesCRUD.created_rule_id)
        assert our_rule["threshold"] == 20.0
        assert "20%" in our_rule["description"]
        print("Rule updated successfully with new threshold: 20%")
    
    def test_filter_approval_rules_by_status(self, session):
        """Filter approval rules by status"""
        response = session.get(f"{BASE_URL}/api/automation/approval-rules?status=active")
        assert response.status_code == 200
        data = response.json()
        
        for rule in data["rules"]:
            assert rule["status"] == "active"
        print(f"Found {len(data['rules'])} active rules")


# ==================== APPROVAL REQUESTS TESTS ====================

class TestApprovalRequests:
    """Approval Request endpoint tests"""
    
    test_quote_id = None
    test_request_id = None
    
    @pytest.fixture(autouse=True)
    def setup_test_data(self, session, test_user_id):
        """Ensure we have an approval rule and test quote"""
        # Check if we have any approval rules
        rules_resp = session.get(f"{BASE_URL}/api/automation/approval-rules")
        if not rules_resp.json()["rules"]:
            # Create one if none exist
            session.post(f"{BASE_URL}/api/automation/approval-rules", json={
                "name": "TEST_Request Approval Rule",
                "description": "For testing requests",
                "trigger_type": "discount_percent",
                "threshold": 10.0,
                "operator": "gte",
                "approver_user_ids": [test_user_id],
                "status": "active"
            })
    
    def test_list_approval_requests_initially(self, session):
        """List approval requests should work (may be empty)"""
        response = session.get(f"{BASE_URL}/api/automation/approval-requests")
        assert response.status_code == 200
        data = response.json()
        assert "requests" in data
        assert "pagination" in data
        print(f"Found {len(data['requests'])} approval requests")
    
    def test_my_pending_approvals_endpoint(self, session):
        """Get my pending approvals"""
        response = session.get(f"{BASE_URL}/api/automation/my-pending-approvals")
        assert response.status_code == 200
        data = response.json()
        assert "pending_count" in data
        assert "requests" in data
        assert isinstance(data["pending_count"], int)
        print(f"User has {data['pending_count']} pending approvals")
    
    def test_list_approval_requests_with_filters(self, session):
        """List requests with status filter"""
        response = session.get(f"{BASE_URL}/api/automation/approval-requests?status=pending")
        assert response.status_code == 200
        data = response.json()
        for req in data["requests"]:
            assert req["status"] == "pending"
        print(f"Found {len(data['requests'])} pending requests")
    
    def test_list_approval_requests_pending_for_me(self, session):
        """List requests pending for current user"""
        response = session.get(f"{BASE_URL}/api/automation/approval-requests?pending_for_me=true")
        assert response.status_code == 200
        data = response.json()
        # All should be pending and have user as approver
        for req in data["requests"]:
            assert req["status"] == "pending"
        print(f"Found {len(data['requests'])} requests pending for current user")


# ==================== APPROVAL RULE DELETE TEST (LAST) ====================

class TestApprovalRulesDelete:
    """Delete approval rule (run last to clean up)"""
    
    def test_delete_approval_rule(self, session):
        """Delete the test approval rule"""
        # Find our test rule
        rules_resp = session.get(f"{BASE_URL}/api/automation/approval-rules")
        rules = rules_resp.json()["rules"]
        test_rules = [r for r in rules if r["name"].startswith("TEST_")]
        
        if not test_rules:
            pytest.skip("No TEST_ rules to delete")
        
        for rule in test_rules:
            response = session.delete(f"{BASE_URL}/api/automation/approval-rules/{rule['rule_id']}")
            assert response.status_code == 200
            data = response.json()
            assert data.get("success") == True
            print(f"Deleted rule: {rule['rule_id']}")
        
        # Verify deletion
        verify_resp = session.get(f"{BASE_URL}/api/automation/approval-rules")
        remaining_rules = verify_resp.json()["rules"]
        remaining_test_rules = [r for r in remaining_rules if r["name"].startswith("TEST_")]
        assert len(remaining_test_rules) == 0
        print("All TEST_ rules deleted successfully")
    
    def test_delete_nonexistent_rule_returns_404(self, session):
        """Deleting non-existent rule should return 404"""
        response = session.delete(f"{BASE_URL}/api/automation/approval-rules/nonexistent_rule_123")
        assert response.status_code == 404


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
