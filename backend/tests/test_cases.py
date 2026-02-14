"""
CRM Phase 4 - Case Management API Tests
Tests for support ticket management endpoints
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
SESSION_TOKEN = "test_session_1771098064084"

# Test data to cleanup
CREATED_CASE_IDS = []


class TestCasesConfig:
    """Test case configuration endpoint"""
    
    def test_get_case_config(self):
        """GET /api/cases/config - should return statuses, priorities, categories, origins"""
        response = requests.get(
            f"{BASE_URL}/api/cases/config",
            cookies={"session_token": SESSION_TOKEN}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify all config sections exist
        assert "statuses" in data, "Missing statuses in config"
        assert "priorities" in data, "Missing priorities in config"
        assert "categories" in data, "Missing categories in config"
        assert "origins" in data, "Missing origins in config"
        
        # Verify statuses have correct structure
        assert len(data["statuses"]) == 6, f"Expected 6 statuses, got {len(data['statuses'])}"
        status_values = [s["value"] for s in data["statuses"]]
        assert "new" in status_values
        assert "in_progress" in status_values
        assert "resolved" in status_values
        assert "closed" in status_values
        
        # Verify priorities
        assert len(data["priorities"]) == 4, f"Expected 4 priorities, got {len(data['priorities'])}"
        priority_values = [p["value"] for p in data["priorities"]]
        assert "low" in priority_values
        assert "critical" in priority_values
        
        print("PASSED: GET /api/cases/config - returns all configuration options")


class TestCaseCRUD:
    """Test Case CRUD operations"""
    
    def test_create_case(self):
        """POST /api/cases - create new case with auto-generated case number"""
        payload = {
            "subject": "TEST_Case_Subject_1",
            "description": "Test case description for testing purposes",
            "status": "new",
            "priority": "medium",
            "category": "Technical Support",
            "origin": "Email",
            "contact_name": "Test Customer",
            "contact_email": "customer@test.com",
            "contact_phone": "(555) 123-4567"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/cases",
            json=payload,
            cookies={"session_token": SESSION_TOKEN}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify case_id and case_number generated
        assert "case_id" in data, "Missing case_id"
        assert "case_number" in data, "Missing case_number"
        assert data["case_number"].startswith("CS-"), f"Invalid case_number format: {data['case_number']}"
        
        # Verify data matches
        assert data["subject"] == payload["subject"]
        assert data["description"] == payload["description"]
        assert data["status"] == "new"
        assert data["priority"] == "medium"
        assert data["category"] == payload["category"]
        assert data["origin"] == payload["origin"]
        assert data["contact_name"] == payload["contact_name"]
        assert data["contact_email"] == payload["contact_email"]
        
        # Store for cleanup
        CREATED_CASE_IDS.append(data["case_id"])
        print(f"PASSED: POST /api/cases - created case {data['case_number']}")
    
    def test_list_cases(self):
        """GET /api/cases - list cases with pagination"""
        response = requests.get(
            f"{BASE_URL}/api/cases",
            cookies={"session_token": SESSION_TOKEN}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert "cases" in data, "Missing cases array"
        assert "pagination" in data, "Missing pagination"
        assert "total" in data["pagination"]
        assert "page" in data["pagination"]
        assert "page_size" in data["pagination"]
        
        print(f"PASSED: GET /api/cases - returned {len(data['cases'])} cases")
    
    def test_get_case_detail(self):
        """GET /api/cases/{id} - get case with activities"""
        # First create a case
        payload = {
            "subject": "TEST_Case_For_Detail",
            "description": "Test case for detail view",
            "status": "new",
            "priority": "high"
        }
        
        create_res = requests.post(
            f"{BASE_URL}/api/cases",
            json=payload,
            cookies={"session_token": SESSION_TOKEN}
        )
        assert create_res.status_code == 200
        case_id = create_res.json()["case_id"]
        CREATED_CASE_IDS.append(case_id)
        
        # Get case detail
        response = requests.get(
            f"{BASE_URL}/api/cases/{case_id}",
            cookies={"session_token": SESSION_TOKEN}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify case fields
        assert data["case_id"] == case_id
        assert data["subject"] == payload["subject"]
        assert data["status"] == "new"
        assert data["priority"] == "high"
        
        # Verify activities array exists
        assert "activities" in data, "Missing activities array"
        assert isinstance(data["activities"], list)
        
        # Verify status_history exists
        assert "status_history" in data, "Missing status_history"
        
        print(f"PASSED: GET /api/cases/{case_id} - returned case detail with activities")
    
    def test_get_nonexistent_case(self):
        """GET /api/cases/nonexistent - should return 404"""
        response = requests.get(
            f"{BASE_URL}/api/cases/nonexistent_case_id",
            cookies={"session_token": SESSION_TOKEN}
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("PASSED: GET /api/cases/nonexistent - returns 404")
    
    def test_update_case(self):
        """PUT /api/cases/{id} - update case status and priority"""
        # First create a case
        payload = {
            "subject": "TEST_Case_For_Update",
            "status": "new",
            "priority": "low"
        }
        
        create_res = requests.post(
            f"{BASE_URL}/api/cases",
            json=payload,
            cookies={"session_token": SESSION_TOKEN}
        )
        assert create_res.status_code == 200
        case_id = create_res.json()["case_id"]
        CREATED_CASE_IDS.append(case_id)
        
        # Update the case
        update_payload = {
            "status": "in_progress",
            "priority": "high",
            "description": "Updated description"
        }
        
        response = requests.put(
            f"{BASE_URL}/api/cases/{case_id}",
            json=update_payload,
            cookies={"session_token": SESSION_TOKEN}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Verify update by fetching case
        get_res = requests.get(
            f"{BASE_URL}/api/cases/{case_id}",
            cookies={"session_token": SESSION_TOKEN}
        )
        updated_case = get_res.json()
        assert updated_case["status"] == "in_progress", "Status not updated"
        assert updated_case["priority"] == "high", "Priority not updated"
        assert updated_case["description"] == "Updated description", "Description not updated"
        
        # Verify status_history was updated
        assert len(updated_case["status_history"]) >= 2, "Status history not updated"
        
        print(f"PASSED: PUT /api/cases/{case_id} - case updated successfully")
    
    def test_update_nonexistent_case(self):
        """PUT /api/cases/nonexistent - should return 404"""
        response = requests.put(
            f"{BASE_URL}/api/cases/nonexistent_case_id",
            json={"status": "in_progress"},
            cookies={"session_token": SESSION_TOKEN}
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("PASSED: PUT /api/cases/nonexistent - returns 404")
    
    def test_resolve_case(self):
        """PUT /api/cases/{id} - resolve case sets resolved_at timestamp"""
        # Create case
        create_res = requests.post(
            f"{BASE_URL}/api/cases",
            json={"subject": "TEST_Case_For_Resolve", "status": "new"},
            cookies={"session_token": SESSION_TOKEN}
        )
        assert create_res.status_code == 200
        case_id = create_res.json()["case_id"]
        CREATED_CASE_IDS.append(case_id)
        
        # Resolve the case
        response = requests.put(
            f"{BASE_URL}/api/cases/{case_id}",
            json={"status": "resolved", "resolution": "Issue fixed"},
            cookies={"session_token": SESSION_TOKEN}
        )
        assert response.status_code == 200
        
        # Verify resolved_at is set
        get_res = requests.get(
            f"{BASE_URL}/api/cases/{case_id}",
            cookies={"session_token": SESSION_TOKEN}
        )
        resolved_case = get_res.json()
        assert resolved_case["status"] == "resolved"
        assert resolved_case["resolved_at"] is not None, "resolved_at not set"
        
        print(f"PASSED: Resolve case - resolved_at timestamp set")


class TestCaseComments:
    """Test case comments/activities"""
    
    def test_add_comment(self):
        """POST /api/cases/{id}/comments - add comment to case"""
        # Create case
        create_res = requests.post(
            f"{BASE_URL}/api/cases",
            json={"subject": "TEST_Case_For_Comments"},
            cookies={"session_token": SESSION_TOKEN}
        )
        assert create_res.status_code == 200
        case_id = create_res.json()["case_id"]
        CREATED_CASE_IDS.append(case_id)
        
        # Add comment
        comment_text = "Test comment from automated tests"
        response = requests.post(
            f"{BASE_URL}/api/cases/{case_id}/comments",
            params={"comment": comment_text, "is_public": False},
            cookies={"session_token": SESSION_TOKEN}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Verify comment was added
        get_res = requests.get(
            f"{BASE_URL}/api/cases/{case_id}",
            cookies={"session_token": SESSION_TOKEN}
        )
        case_data = get_res.json()
        activities = case_data.get("activities", [])
        
        # Find the comment activity
        comment_found = any(
            act.get("activity_type") == "comment" and comment_text in act.get("description", "")
            for act in activities
        )
        assert comment_found, f"Comment not found in activities: {activities}"
        
        print(f"PASSED: POST /api/cases/{case_id}/comments - comment added")
    
    def test_add_public_comment_sets_first_response(self):
        """POST /api/cases/{id}/comments - public comment sets first_response_at"""
        # Create case
        create_res = requests.post(
            f"{BASE_URL}/api/cases",
            json={"subject": "TEST_Case_For_First_Response"},
            cookies={"session_token": SESSION_TOKEN}
        )
        assert create_res.status_code == 200
        case_id = create_res.json()["case_id"]
        CREATED_CASE_IDS.append(case_id)
        
        # Add public comment
        response = requests.post(
            f"{BASE_URL}/api/cases/{case_id}/comments",
            params={"comment": "Public response to customer", "is_public": True},
            cookies={"session_token": SESSION_TOKEN}
        )
        assert response.status_code == 200
        
        # Verify first_response_at is set
        get_res = requests.get(
            f"{BASE_URL}/api/cases/{case_id}",
            cookies={"session_token": SESSION_TOKEN}
        )
        case_data = get_res.json()
        assert case_data.get("first_response_at") is not None, "first_response_at not set"
        
        print(f"PASSED: Public comment sets first_response_at")
    
    def test_comment_on_nonexistent_case(self):
        """POST /api/cases/nonexistent/comments - should return 404"""
        response = requests.post(
            f"{BASE_URL}/api/cases/nonexistent_case_id/comments",
            params={"comment": "Test comment"},
            cookies={"session_token": SESSION_TOKEN}
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("PASSED: Comment on nonexistent case returns 404")


class TestCaseFilters:
    """Test case filtering endpoints"""
    
    def test_filter_by_status(self):
        """GET /api/cases?status=new - filter cases by status"""
        response = requests.get(
            f"{BASE_URL}/api/cases",
            params={"status": "new"},
            cookies={"session_token": SESSION_TOKEN}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        # All cases should have status "new"
        for case in data["cases"]:
            assert case["status"] == "new", f"Found case with status {case['status']}"
        
        print(f"PASSED: Filter by status=new works")
    
    def test_filter_by_priority(self):
        """GET /api/cases?priority=high - filter cases by priority"""
        # Create a high priority case first
        requests.post(
            f"{BASE_URL}/api/cases",
            json={"subject": "TEST_High_Priority_Case", "priority": "high"},
            cookies={"session_token": SESSION_TOKEN}
        )
        
        response = requests.get(
            f"{BASE_URL}/api/cases",
            params={"priority": "high"},
            cookies={"session_token": SESSION_TOKEN}
        )
        assert response.status_code == 200
        data = response.json()
        
        for case in data["cases"]:
            assert case["priority"] == "high", f"Found case with priority {case['priority']}"
        
        print(f"PASSED: Filter by priority=high works")
    
    def test_search_cases(self):
        """GET /api/cases?search=TEST - search cases by subject/description"""
        response = requests.get(
            f"{BASE_URL}/api/cases",
            params={"search": "TEST_Case"},
            cookies={"session_token": SESSION_TOKEN}
        )
        assert response.status_code == 200
        data = response.json()
        
        # All cases should contain TEST_Case in subject or description
        for case in data["cases"]:
            match = "TEST_Case" in (case.get("subject") or "") or "TEST_Case" in (case.get("description") or "")
            assert match, f"Case {case['case_id']} doesn't match search"
        
        print(f"PASSED: Search cases works - found {len(data['cases'])} matching cases")


class TestCaseStats:
    """Test case statistics endpoint"""
    
    def test_get_case_stats(self):
        """GET /api/cases/stats - get case statistics"""
        response = requests.get(
            f"{BASE_URL}/api/cases/stats",
            cookies={"session_token": SESSION_TOKEN}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify stat fields exist
        assert "total_open" in data, "Missing total_open"
        assert "by_status" in data, "Missing by_status"
        assert "by_priority" in data, "Missing by_priority"
        assert "overdue" in data, "Missing overdue"
        assert "created_today" in data, "Missing created_today"
        assert "resolved_today" in data, "Missing resolved_today"
        assert "my_open_cases" in data, "Missing my_open_cases"
        assert "unassigned" in data, "Missing unassigned"
        assert "critical_high" in data, "Missing critical_high"
        
        print(f"PASSED: GET /api/cases/stats - total_open={data['total_open']}, overdue={data['overdue']}")


class TestCasesByAccount:
    """Test cases by account endpoint"""
    
    def test_get_cases_by_account(self):
        """GET /api/cases/by-account/{account_id} - get cases for account"""
        # Create an account first
        account_res = requests.post(
            f"{BASE_URL}/api/crm/accounts",
            json={"name": "TEST_Account_For_Cases", "account_type": "Customer"},
            cookies={"session_token": SESSION_TOKEN}
        )
        if account_res.status_code == 200:
            account_id = account_res.json().get("account_id")
            
            # Create case linked to account
            case_res = requests.post(
                f"{BASE_URL}/api/cases",
                json={
                    "subject": "TEST_Case_For_Account",
                    "account_id": account_id
                },
                cookies={"session_token": SESSION_TOKEN}
            )
            if case_res.status_code == 200:
                CREATED_CASE_IDS.append(case_res.json()["case_id"])
            
            # Get cases by account
            response = requests.get(
                f"{BASE_URL}/api/cases/by-account/{account_id}",
                cookies={"session_token": SESSION_TOKEN}
            )
            assert response.status_code == 200, f"Expected 200, got {response.status_code}"
            data = response.json()
            
            assert "cases" in data
            assert "pagination" in data
            
            # Verify all cases belong to this account
            for case in data["cases"]:
                assert case.get("account_id") == account_id
            
            print(f"PASSED: GET /api/cases/by-account/{account_id} - found {len(data['cases'])} cases")
        else:
            print(f"SKIPPED: Could not create test account for by-account test")


class TestBulkOperations:
    """Test bulk case operations"""
    
    def test_bulk_status_update(self):
        """POST /api/cases/bulk-status - bulk update case status"""
        # Create test cases
        case_ids = []
        for i in range(2):
            res = requests.post(
                f"{BASE_URL}/api/cases",
                json={"subject": f"TEST_Bulk_Case_{i}", "status": "new"},
                cookies={"session_token": SESSION_TOKEN}
            )
            if res.status_code == 200:
                case_ids.append(res.json()["case_id"])
                CREATED_CASE_IDS.append(res.json()["case_id"])
        
        if len(case_ids) < 2:
            pytest.skip("Could not create test cases for bulk operation")
        
        # Bulk update status - case_ids as body, status as query param
        response = requests.post(
            f"{BASE_URL}/api/cases/bulk-status",
            params={"status": "in_progress"},
            json=case_ids,
            cookies={"session_token": SESSION_TOKEN}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("success") == True
        assert data.get("updated") == 2
        
        # Verify cases were updated
        for case_id in case_ids:
            get_res = requests.get(
                f"{BASE_URL}/api/cases/{case_id}",
                cookies={"session_token": SESSION_TOKEN}
            )
            assert get_res.json()["status"] == "in_progress"
        
        print(f"PASSED: POST /api/cases/bulk-status - updated {data['updated']} cases")
    
    def test_bulk_status_invalid_status(self):
        """POST /api/cases/bulk-status - invalid status returns 400"""
        response = requests.post(
            f"{BASE_URL}/api/cases/bulk-status",
            params={"status": "invalid_status"},
            json=["test_case_1"],
            cookies={"session_token": SESSION_TOKEN}
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("PASSED: Bulk status with invalid status returns 400")


class TestCaseDelete:
    """Test case deletion (admin/manager only)"""
    
    def test_delete_case(self):
        """DELETE /api/cases/{id} - delete case"""
        # Create case
        create_res = requests.post(
            f"{BASE_URL}/api/cases",
            json={"subject": "TEST_Case_To_Delete"},
            cookies={"session_token": SESSION_TOKEN}
        )
        assert create_res.status_code == 200
        case_id = create_res.json()["case_id"]
        
        # Delete case
        response = requests.delete(
            f"{BASE_URL}/api/cases/{case_id}",
            cookies={"session_token": SESSION_TOKEN}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Verify case is deleted
        get_res = requests.get(
            f"{BASE_URL}/api/cases/{case_id}",
            cookies={"session_token": SESSION_TOKEN}
        )
        assert get_res.status_code == 404, "Case should not exist after deletion"
        
        print(f"PASSED: DELETE /api/cases/{case_id} - case deleted successfully")
    
    def test_delete_nonexistent_case(self):
        """DELETE /api/cases/nonexistent - should return 404"""
        response = requests.delete(
            f"{BASE_URL}/api/cases/nonexistent_case_id",
            cookies={"session_token": SESSION_TOKEN}
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("PASSED: DELETE nonexistent case returns 404")


class TestCleanup:
    """Cleanup test data"""
    
    def test_cleanup_test_cases(self):
        """Clean up all TEST_ prefixed cases"""
        # Get all test cases
        response = requests.get(
            f"{BASE_URL}/api/cases",
            params={"search": "TEST_", "page_size": 100},
            cookies={"session_token": SESSION_TOKEN}
        )
        
        if response.status_code == 200:
            cases = response.json().get("cases", [])
            deleted = 0
            for case in cases:
                if case.get("subject", "").startswith("TEST_"):
                    del_res = requests.delete(
                        f"{BASE_URL}/api/cases/{case['case_id']}",
                        cookies={"session_token": SESSION_TOKEN}
                    )
                    if del_res.status_code == 200:
                        deleted += 1
            
            print(f"PASSED: Cleaned up {deleted} test cases")
        else:
            print("SKIPPED: Cleanup - could not fetch cases")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
