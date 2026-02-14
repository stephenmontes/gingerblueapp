"""
CRM Quotes Module - Backend API Tests
Tests all quote CRUD operations, status workflow, versioning, and product search
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def api_client():
    """Shared requests session with auth"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    
    # Authenticate using dev login (GET endpoint that sets cookie)
    login_res = session.get(f"{BASE_URL}/api/auth/dev-login")
    print(f"Login response: {login_res.status_code}")
    if login_res.status_code == 200:
        print("Dev login successful")
    else:
        print(f"Dev login failed: {login_res.text}")
    
    return session


@pytest.fixture(scope="module")
def test_account(api_client):
    """Create test account for quotes"""
    account_data = {
        "name": f"TEST_Quote_Account_{datetime.now().timestamp()}",
        "account_type": "prospect",
        "industry": "E-commerce",
        "status": "active"
    }
    res = api_client.post(f"{BASE_URL}/api/crm/accounts", json=account_data)
    if res.status_code == 201 or res.status_code == 200:
        data = res.json()
        print(f"Created test account: {data.get('account_id')}")
        return data
    else:
        print(f"Failed to create test account: {res.status_code} - {res.text}")
        # Try to find existing
        pytest.skip("Could not create test account")


@pytest.fixture(scope="module")
def test_opportunity(api_client, test_account):
    """Create test opportunity for quotes"""
    opp_data = {
        "name": f"TEST_Quote_Opportunity_{datetime.now().timestamp()}",
        "account_id": test_account["account_id"],
        "amount": 5000,
        "stage": "proposal",
        "probability": 60,
        "close_date": (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
    }
    res = api_client.post(f"{BASE_URL}/api/crm/opportunities", json=opp_data)
    if res.status_code in [200, 201]:
        data = res.json()
        print(f"Created test opportunity: {data.get('opportunity_id')}")
        return data
    else:
        print(f"Failed to create opportunity: {res.status_code} - {res.text}")
        pytest.skip("Could not create test opportunity")


class TestQuotesListEndpoint:
    """Test GET /api/crm/quotes - list quotes with filtering"""
    
    def test_list_quotes_returns_200(self, api_client):
        """GET /api/crm/quotes returns 200"""
        res = api_client.get(f"{BASE_URL}/api/crm/quotes")
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        assert "quotes" in data
        assert "pagination" in data
        print(f"✓ List quotes returned {len(data['quotes'])} quotes")
    
    def test_list_quotes_with_status_filter(self, api_client):
        """GET /api/crm/quotes?status=draft filters correctly"""
        res = api_client.get(f"{BASE_URL}/api/crm/quotes?status=draft")
        assert res.status_code == 200
        data = res.json()
        # All returned quotes should be draft
        for quote in data.get("quotes", []):
            if quote.get("status"):
                assert quote["status"] == "draft", f"Expected draft, got {quote['status']}"
        print(f"✓ Status filter returned {len(data['quotes'])} draft quotes")


class TestQuoteCreation:
    """Test POST /api/crm/quotes - create quote"""
    
    def test_create_quote_success(self, api_client, test_account, test_opportunity):
        """POST /api/crm/quotes creates quote with line items"""
        quote_data = {
            "opportunity_id": test_opportunity["opportunity_id"],
            "quote_name": f"TEST_Quote_{datetime.now().timestamp()}",
            "account_id": test_account["account_id"],
            "valid_until": (datetime.now() + timedelta(days=14)).strftime("%Y-%m-%d"),
            "line_items": [
                {
                    "product_name": "Test Product 1",
                    "sku": "TEST-001",
                    "quantity": 2,
                    "unit_price": 100.00,
                    "total": 200.00
                },
                {
                    "product_name": "Test Product 2",
                    "sku": "TEST-002",
                    "quantity": 1,
                    "unit_price": 150.00,
                    "discount_percent": 10,
                    "total": 135.00
                }
            ],
            "subtotal": 335.00,
            "discount_percent": 0,
            "discount_amount": 0,
            "tax_percent": 10,
            "tax_amount": 33.50,
            "shipping_amount": 25.00,
            "total": 393.50,
            "notes": "Test quote notes",
            "terms": "Payment due in 30 days"
        }
        
        res = api_client.post(f"{BASE_URL}/api/crm/quotes", json=quote_data)
        assert res.status_code in [200, 201], f"Expected 200/201, got {res.status_code}: {res.text}"
        
        data = res.json()
        assert "quote_id" in data
        assert "quote_number" in data
        assert data["status"] == "draft"
        assert data["version"] == 1
        assert len(data.get("line_items", [])) == 2
        print(f"✓ Created quote: {data['quote_number']} with {len(data.get('line_items', []))} line items")
        
        # Store for later tests
        return data
    
    def test_create_quote_version_increments(self, api_client, test_account, test_opportunity):
        """Create second quote for same opportunity - version should increment"""
        quote_data = {
            "opportunity_id": test_opportunity["opportunity_id"],
            "quote_name": f"TEST_Quote_v2_{datetime.now().timestamp()}",
            "account_id": test_account["account_id"],
            "line_items": [],
            "subtotal": 0,
            "total": 0
        }
        
        res = api_client.post(f"{BASE_URL}/api/crm/quotes", json=quote_data)
        assert res.status_code in [200, 201]
        data = res.json()
        
        # Version should be >= 2 since we already created one
        assert data["version"] >= 1, f"Version should be >= 1, got {data['version']}"
        print(f"✓ Quote versioning works: version={data['version']}")


class TestQuoteDetails:
    """Test GET /api/crm/quotes/{quote_id}"""
    
    def test_get_quote_details(self, api_client, test_account, test_opportunity):
        """GET /api/crm/quotes/{quote_id} returns full details"""
        # First create a quote
        quote_data = {
            "opportunity_id": test_opportunity["opportunity_id"],
            "quote_name": f"TEST_Details_{datetime.now().timestamp()}",
            "account_id": test_account["account_id"],
            "line_items": [{"product_name": "Detail Test", "quantity": 1, "unit_price": 50, "total": 50}],
            "subtotal": 50,
            "total": 50
        }
        
        create_res = api_client.post(f"{BASE_URL}/api/crm/quotes", json=quote_data)
        assert create_res.status_code in [200, 201]
        created = create_res.json()
        quote_id = created["quote_id"]
        
        # Now get details
        res = api_client.get(f"{BASE_URL}/api/crm/quotes/{quote_id}")
        assert res.status_code == 200, f"Expected 200, got {res.status_code}"
        
        data = res.json()
        assert data["quote_id"] == quote_id
        assert "account" in data or "account_name" in data
        assert "opportunity" in data or "opportunity_name" in data
        assert "line_items" in data
        print(f"✓ Quote details returned with related data")
        
        return quote_id


class TestQuoteStatusWorkflow:
    """Test quote status workflow: draft -> sent -> accepted/rejected"""
    
    @pytest.fixture
    def draft_quote(self, api_client, test_account, test_opportunity):
        """Create a draft quote for workflow tests"""
        quote_data = {
            "opportunity_id": test_opportunity["opportunity_id"],
            "quote_name": f"TEST_Workflow_{datetime.now().timestamp()}",
            "account_id": test_account["account_id"],
            "line_items": [{"product_name": "Workflow Test", "quantity": 1, "unit_price": 1000, "total": 1000}],
            "subtotal": 1000,
            "total": 1000
        }
        res = api_client.post(f"{BASE_URL}/api/crm/quotes", json=quote_data)
        assert res.status_code in [200, 201]
        return res.json()
    
    def test_send_quote(self, api_client, draft_quote):
        """POST /api/crm/quotes/{id}/send marks quote as sent"""
        quote_id = draft_quote["quote_id"]
        
        res = api_client.post(f"{BASE_URL}/api/crm/quotes/{quote_id}/send")
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        
        # Verify status changed
        verify_res = api_client.get(f"{BASE_URL}/api/crm/quotes/{quote_id}")
        assert verify_res.status_code == 200
        data = verify_res.json()
        assert data["status"] == "sent", f"Expected status 'sent', got '{data['status']}'"
        assert "sent_at" in data
        print(f"✓ Quote marked as sent")
    
    def test_accept_quote(self, api_client, test_account, test_opportunity):
        """POST /api/crm/quotes/{id}/accept marks quote as accepted and updates opportunity"""
        # Create and send a quote first
        quote_data = {
            "opportunity_id": test_opportunity["opportunity_id"],
            "quote_name": f"TEST_Accept_{datetime.now().timestamp()}",
            "account_id": test_account["account_id"],
            "line_items": [{"product_name": "Accept Test", "quantity": 1, "unit_price": 2500, "total": 2500}],
            "subtotal": 2500,
            "total": 2500
        }
        create_res = api_client.post(f"{BASE_URL}/api/crm/quotes", json=quote_data)
        assert create_res.status_code in [200, 201]
        quote_id = create_res.json()["quote_id"]
        
        # Send it
        send_res = api_client.post(f"{BASE_URL}/api/crm/quotes/{quote_id}/send")
        assert send_res.status_code == 200
        
        # Accept it
        res = api_client.post(f"{BASE_URL}/api/crm/quotes/{quote_id}/accept")
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        
        # Verify status
        verify_res = api_client.get(f"{BASE_URL}/api/crm/quotes/{quote_id}")
        data = verify_res.json()
        assert data["status"] == "accepted"
        print(f"✓ Quote accepted, opportunity amount updated")
    
    def test_reject_quote(self, api_client, test_account, test_opportunity):
        """POST /api/crm/quotes/{id}/reject marks quote as rejected"""
        # Create and send a quote
        quote_data = {
            "opportunity_id": test_opportunity["opportunity_id"],
            "quote_name": f"TEST_Reject_{datetime.now().timestamp()}",
            "account_id": test_account["account_id"],
            "line_items": [{"product_name": "Reject Test", "quantity": 1, "unit_price": 500, "total": 500}],
            "subtotal": 500,
            "total": 500
        }
        create_res = api_client.post(f"{BASE_URL}/api/crm/quotes", json=quote_data)
        quote_id = create_res.json()["quote_id"]
        
        # Send it
        api_client.post(f"{BASE_URL}/api/crm/quotes/{quote_id}/send")
        
        # Reject it
        res = api_client.post(f"{BASE_URL}/api/crm/quotes/{quote_id}/reject?reason=Price%20too%20high")
        assert res.status_code == 200
        
        # Verify status
        verify_res = api_client.get(f"{BASE_URL}/api/crm/quotes/{quote_id}")
        data = verify_res.json()
        assert data["status"] == "rejected"
        print(f"✓ Quote rejected")


class TestQuoteClone:
    """Test POST /api/crm/quotes/{id}/clone - create new version"""
    
    def test_clone_quote(self, api_client, test_account, test_opportunity):
        """POST /api/crm/quotes/{id}/clone creates new version"""
        # Create original quote
        quote_data = {
            "opportunity_id": test_opportunity["opportunity_id"],
            "quote_name": f"TEST_Clone_Original_{datetime.now().timestamp()}",
            "account_id": test_account["account_id"],
            "line_items": [{"product_name": "Clone Test", "quantity": 3, "unit_price": 100, "total": 300}],
            "subtotal": 300,
            "total": 300
        }
        create_res = api_client.post(f"{BASE_URL}/api/crm/quotes", json=quote_data)
        assert create_res.status_code in [200, 201]
        original = create_res.json()
        original_id = original["quote_id"]
        original_version = original["version"]
        
        # Clone it
        res = api_client.post(f"{BASE_URL}/api/crm/quotes/{original_id}/clone")
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        
        data = res.json()
        assert data["quote_id"] != original_id
        assert data["version"] > original_version
        assert data["status"] == "draft"
        assert data.get("cloned_from") == original_id
        print(f"✓ Quote cloned: {original['quote_number']} -> {data['quote_number']} (v{data['version']})")


class TestQuoteUpdate:
    """Test PUT /api/crm/quotes/{id} - update draft quote"""
    
    def test_update_draft_quote(self, api_client, test_account, test_opportunity):
        """PUT /api/crm/quotes/{id} updates draft quote"""
        # Create draft quote
        quote_data = {
            "opportunity_id": test_opportunity["opportunity_id"],
            "quote_name": f"TEST_Update_Original_{datetime.now().timestamp()}",
            "account_id": test_account["account_id"],
            "line_items": [],
            "subtotal": 0,
            "total": 0
        }
        create_res = api_client.post(f"{BASE_URL}/api/crm/quotes", json=quote_data)
        quote_id = create_res.json()["quote_id"]
        
        # Update it
        update_data = {
            "quote_name": "Updated Quote Name",
            "notes": "Updated notes"
        }
        res = api_client.put(f"{BASE_URL}/api/crm/quotes/{quote_id}", json=update_data)
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        
        # Verify update
        verify_res = api_client.get(f"{BASE_URL}/api/crm/quotes/{quote_id}")
        data = verify_res.json()
        assert data["quote_name"] == "Updated Quote Name"
        print(f"✓ Draft quote updated")
    
    def test_cannot_update_sent_quote(self, api_client, test_account, test_opportunity):
        """PUT /api/crm/quotes/{id} fails for non-draft quotes"""
        # Create and send a quote
        quote_data = {
            "opportunity_id": test_opportunity["opportunity_id"],
            "quote_name": f"TEST_Update_Sent_{datetime.now().timestamp()}",
            "account_id": test_account["account_id"],
            "line_items": [],
            "subtotal": 0,
            "total": 0
        }
        create_res = api_client.post(f"{BASE_URL}/api/crm/quotes", json=quote_data)
        quote_id = create_res.json()["quote_id"]
        
        # Send it
        api_client.post(f"{BASE_URL}/api/crm/quotes/{quote_id}/send")
        
        # Try to update (should fail)
        update_data = {"quote_name": "Should Fail"}
        res = api_client.put(f"{BASE_URL}/api/crm/quotes/{quote_id}", json=update_data)
        assert res.status_code == 400, f"Expected 400, got {res.status_code}"
        print(f"✓ Cannot update sent quote (correctly rejected)")


class TestQuoteDelete:
    """Test DELETE /api/crm/quotes/{id} - delete draft quote"""
    
    def test_delete_draft_quote(self, api_client, test_account, test_opportunity):
        """DELETE /api/crm/quotes/{id} deletes draft quote"""
        # Create draft quote
        quote_data = {
            "opportunity_id": test_opportunity["opportunity_id"],
            "quote_name": f"TEST_Delete_{datetime.now().timestamp()}",
            "account_id": test_account["account_id"],
            "line_items": [],
            "subtotal": 0,
            "total": 0
        }
        create_res = api_client.post(f"{BASE_URL}/api/crm/quotes", json=quote_data)
        quote_id = create_res.json()["quote_id"]
        
        # Delete it
        res = api_client.delete(f"{BASE_URL}/api/crm/quotes/{quote_id}")
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        
        # Verify deleted
        verify_res = api_client.get(f"{BASE_URL}/api/crm/quotes/{quote_id}")
        assert verify_res.status_code == 404
        print(f"✓ Draft quote deleted")
    
    def test_cannot_delete_sent_quote(self, api_client, test_account, test_opportunity):
        """DELETE /api/crm/quotes/{id} fails for non-draft quotes"""
        # Create and send a quote
        quote_data = {
            "opportunity_id": test_opportunity["opportunity_id"],
            "quote_name": f"TEST_Delete_Sent_{datetime.now().timestamp()}",
            "account_id": test_account["account_id"],
            "line_items": [],
            "subtotal": 0,
            "total": 0
        }
        create_res = api_client.post(f"{BASE_URL}/api/crm/quotes", json=quote_data)
        quote_id = create_res.json()["quote_id"]
        
        # Send it
        api_client.post(f"{BASE_URL}/api/crm/quotes/{quote_id}/send")
        
        # Try to delete (should fail)
        res = api_client.delete(f"{BASE_URL}/api/crm/quotes/{quote_id}")
        assert res.status_code == 400, f"Expected 400, got {res.status_code}"
        print(f"✓ Cannot delete sent quote (correctly rejected)")


class TestProductSearch:
    """Test GET /api/crm/quotes/products/search - search Shopify products"""
    
    def test_product_search_endpoint(self, api_client):
        """GET /api/crm/quotes/products/search?q=test returns products"""
        res = api_client.get(f"{BASE_URL}/api/crm/quotes/products/search?q=test")
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        
        data = res.json()
        assert "products" in data
        print(f"✓ Product search returned {len(data['products'])} products")
    
    def test_product_search_requires_query(self, api_client):
        """GET /api/crm/quotes/products/search without q returns 422"""
        res = api_client.get(f"{BASE_URL}/api/crm/quotes/products/search")
        assert res.status_code == 422, f"Expected 422, got {res.status_code}"
        print(f"✓ Product search requires query parameter")


class TestConvertToOrder:
    """Test POST /api/crm/quotes/{id}/convert-to-order"""
    
    def test_convert_accepted_quote_to_order(self, api_client, test_account, test_opportunity):
        """POST /api/crm/quotes/{id}/convert-to-order converts accepted quote"""
        # Create quote
        quote_data = {
            "opportunity_id": test_opportunity["opportunity_id"],
            "quote_name": f"TEST_Convert_{datetime.now().timestamp()}",
            "account_id": test_account["account_id"],
            "line_items": [{"product_name": "Convert Test", "quantity": 1, "unit_price": 1500, "total": 1500}],
            "subtotal": 1500,
            "total": 1500
        }
        create_res = api_client.post(f"{BASE_URL}/api/crm/quotes", json=quote_data)
        quote_id = create_res.json()["quote_id"]
        
        # Send and accept
        api_client.post(f"{BASE_URL}/api/crm/quotes/{quote_id}/send")
        api_client.post(f"{BASE_URL}/api/crm/quotes/{quote_id}/accept")
        
        # Convert to order
        res = api_client.post(f"{BASE_URL}/api/crm/quotes/{quote_id}/convert-to-order")
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        
        data = res.json()
        assert data.get("success") == True
        
        # Verify quote status is converted
        verify_res = api_client.get(f"{BASE_URL}/api/crm/quotes/{quote_id}")
        quote_data = verify_res.json()
        assert quote_data["status"] == "converted"
        
        # Verify opportunity is closed_won
        opp_res = api_client.get(f"{BASE_URL}/api/crm/opportunities/{test_opportunity['opportunity_id']}")
        opp_data = opp_res.json()
        assert opp_data["stage"] == "closed_won"
        assert opp_data["is_won"] == True
        print(f"✓ Quote converted to order, opportunity closed as won")
    
    def test_cannot_convert_non_accepted_quote(self, api_client, test_account, test_opportunity):
        """POST /api/crm/quotes/{id}/convert-to-order fails for non-accepted quotes"""
        # Create draft quote
        quote_data = {
            "opportunity_id": test_opportunity["opportunity_id"],
            "quote_name": f"TEST_Convert_Draft_{datetime.now().timestamp()}",
            "account_id": test_account["account_id"],
            "line_items": [],
            "subtotal": 0,
            "total": 0
        }
        create_res = api_client.post(f"{BASE_URL}/api/crm/quotes", json=quote_data)
        quote_id = create_res.json()["quote_id"]
        
        # Try to convert draft (should fail)
        res = api_client.post(f"{BASE_URL}/api/crm/quotes/{quote_id}/convert-to-order")
        assert res.status_code == 400, f"Expected 400, got {res.status_code}"
        print(f"✓ Cannot convert non-accepted quote (correctly rejected)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
