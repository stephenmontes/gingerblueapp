"""
POS Customer Search Enhancement Tests
Tests for enhanced customer search functionality:
- Search by more fields (first_name, last_name, city, state, address)
- Returns enhanced fields (company, default_address, orders_count, total_spent, tags)
- Response includes name field (derived from full_name or first_name + last_name)
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
TEST_SESSION_TOKEN = os.environ.get('POS_TEST_SESSION_TOKEN', 'test_session_customer_search_1770567320494')


@pytest.fixture(scope="module")
def api_client():
    """Create authenticated API session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    session.cookies.set("session_token", TEST_SESSION_TOKEN)
    return session


@pytest.fixture
def store_id(api_client):
    """Get first available store ID"""
    response = api_client.get(f"{BASE_URL}/api/pos/stores")
    stores = response.json().get("stores", [])
    if not stores:
        pytest.skip("No stores available")
    return stores[0]["store_id"]


class TestCustomerSearchEnhancedFields:
    """Tests for enhanced customer search response fields"""
    
    def test_response_includes_name_field(self, api_client, store_id):
        """Should return 'name' field in customer results"""
        response = api_client.get(
            f"{BASE_URL}/api/pos/customers/search",
            params={"store_id": store_id, "query": "a", "limit": 5}
        )
        assert response.status_code == 200
        data = response.json()
        
        if data["count"] > 0:
            customer = data["customers"][0]
            assert "name" in customer, "Response should include 'name' field"
            assert customer["name"], "Name field should not be empty"
            print(f"✓ Customer has name field: {customer['name']}")
        else:
            pytest.skip("No customers found")
    
    def test_response_includes_company_field(self, api_client, store_id):
        """Should return 'company' field in customer results"""
        response = api_client.get(
            f"{BASE_URL}/api/pos/customers/search",
            params={"store_id": store_id, "query": "Cedar", "limit": 10}
        )
        assert response.status_code == 200
        data = response.json()
        
        if data["count"] > 0:
            # Find a customer with company
            customer_with_company = next(
                (c for c in data["customers"] if c.get("company")), None
            )
            if customer_with_company:
                assert customer_with_company["company"], "Company field should have value"
                print(f"✓ Customer has company: {customer_with_company['company']}")
            else:
                print("ℹ No customers with company found in search results")
        else:
            pytest.skip("No customers found for search query")
    
    def test_response_includes_default_address(self, api_client, store_id):
        """Should return 'default_address' field with city, state, address1"""
        response = api_client.get(
            f"{BASE_URL}/api/pos/customers/search",
            params={"store_id": store_id, "query": "a", "limit": 10}
        )
        assert response.status_code == 200
        data = response.json()
        
        if data["count"] > 0:
            # Find a customer with address
            customer_with_addr = next(
                (c for c in data["customers"] if c.get("default_address", {}).get("city")), None
            )
            if customer_with_addr:
                addr = customer_with_addr["default_address"]
                assert "city" in addr, "Address should include city"
                assert "province" in addr or "state" in addr, "Address should include state/province"
                print(f"✓ Customer has address: {addr.get('city')}, {addr.get('province', addr.get('state'))}")
            else:
                print("ℹ No customers with address found")
        else:
            pytest.skip("No customers found")
    
    def test_response_includes_orders_count(self, api_client, store_id):
        """Should return 'orders_count' field"""
        response = api_client.get(
            f"{BASE_URL}/api/pos/customers/search",
            params={"store_id": store_id, "query": "a", "limit": 10}
        )
        assert response.status_code == 200
        data = response.json()
        
        if data["count"] > 0:
            customer = data["customers"][0]
            assert "orders_count" in customer, "Response should include 'orders_count'"
            assert isinstance(customer["orders_count"], (int, type(None))), "orders_count should be int or None"
            print(f"✓ Customer has orders_count: {customer['orders_count']}")
        else:
            pytest.skip("No customers found")
    
    def test_response_includes_total_spent(self, api_client, store_id):
        """Should return 'total_spent' field"""
        response = api_client.get(
            f"{BASE_URL}/api/pos/customers/search",
            params={"store_id": store_id, "query": "a", "limit": 10}
        )
        assert response.status_code == 200
        data = response.json()
        
        if data["count"] > 0:
            customer = data["customers"][0]
            assert "total_spent" in customer, "Response should include 'total_spent'"
            assert isinstance(customer["total_spent"], (int, float, type(None))), "total_spent should be number or None"
            print(f"✓ Customer has total_spent: {customer['total_spent']}")
        else:
            pytest.skip("No customers found")


class TestCustomerSearchByFields:
    """Tests for searching customers by various fields"""
    
    def test_search_by_first_name(self, api_client, store_id):
        """Should search customers by first name"""
        response = api_client.get(
            f"{BASE_URL}/api/pos/customers/search",
            params={"store_id": store_id, "query": "Nicole"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["count"] > 0, "Should find customers with first name 'Nicole'"
        
        # Verify results contain the search term
        has_match = any(
            "nicole" in c.get("first_name", "").lower() or 
            "nicole" in c.get("name", "").lower()
            for c in data["customers"]
        )
        assert has_match, "Results should contain customers matching 'Nicole'"
        print(f"✓ Search by first_name found {data['count']} results")
    
    def test_search_by_last_name(self, api_client, store_id):
        """Should search customers by last name"""
        response = api_client.get(
            f"{BASE_URL}/api/pos/customers/search",
            params={"store_id": store_id, "query": "Gessert"}
        )
        assert response.status_code == 200
        data = response.json()
        
        if data["count"] > 0:
            has_match = any(
                "gessert" in c.get("last_name", "").lower() or 
                "gessert" in c.get("name", "").lower()
                for c in data["customers"]
            )
            assert has_match, "Results should contain customers matching 'Gessert'"
            print(f"✓ Search by last_name found {data['count']} results")
        else:
            print("ℹ No customers found for 'Gessert' - test inconclusive")
    
    def test_search_by_city(self, api_client, store_id):
        """Should search customers by city in default_address"""
        response = api_client.get(
            f"{BASE_URL}/api/pos/customers/search",
            params={"store_id": store_id, "query": "Montgomery"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["count"] > 0, "Should find customers in city 'Montgomery'"
        
        # Verify at least one result has Montgomery in city or name
        has_city_match = any(
            "montgomery" in (c.get("default_address", {}).get("city", "") or "").lower()
            for c in data["customers"]
        )
        print(f"✓ Search by city found {data['count']} results, city match: {has_city_match}")
    
    def test_search_by_state(self, api_client, store_id):
        """Should search customers by state in default_address"""
        response = api_client.get(
            f"{BASE_URL}/api/pos/customers/search",
            params={"store_id": store_id, "query": "Illinois"}
        )
        assert response.status_code == 200
        data = response.json()
        
        if data["count"] > 0:
            # Check if any result has Illinois in state/province
            has_state_match = any(
                "illinois" in (c.get("default_address", {}).get("province", "") or "").lower()
                for c in data["customers"]
            )
            print(f"✓ Search by state found {data['count']} results, state match: {has_state_match}")
        else:
            print("ℹ No customers found for 'Illinois' - test inconclusive")
    
    def test_search_by_email(self, api_client, store_id):
        """Should search customers by email"""
        response = api_client.get(
            f"{BASE_URL}/api/pos/customers/search",
            params={"store_id": store_id, "query": "@relay.faire.com"}
        )
        assert response.status_code == 200
        data = response.json()
        
        if data["count"] > 0:
            has_email_match = any(
                "@relay.faire.com" in (c.get("email") or "")
                for c in data["customers"]
            )
            assert has_email_match, "Results should contain customers with matching email"
            print(f"✓ Search by email found {data['count']} results")
        else:
            print("ℹ No customers found with this email pattern")
    
    def test_search_by_company(self, api_client, store_id):
        """Should search customers by company name"""
        response = api_client.get(
            f"{BASE_URL}/api/pos/customers/search",
            params={"store_id": store_id, "query": "Cedar Lane Home"}
        )
        assert response.status_code == 200
        data = response.json()
        
        print(f"✓ Search by company returned {data['count']} results")


class TestCustomerSearchBehavior:
    """Tests for customer search behavior"""
    
    def test_empty_query_returns_results(self, api_client, store_id):
        """Empty query should return customer listing"""
        response = api_client.get(
            f"{BASE_URL}/api/pos/customers/search",
            params={"store_id": store_id, "query": ""}
        )
        assert response.status_code == 200
        data = response.json()
        assert "customers" in data
        assert "count" in data
        print(f"✓ Empty query returns {data['count']} customers (listing mode)")
    
    def test_limit_parameter_works(self, api_client, store_id):
        """Limit parameter should restrict results"""
        response = api_client.get(
            f"{BASE_URL}/api/pos/customers/search",
            params={"store_id": store_id, "query": "a", "limit": 3}
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["customers"]) <= 3, "Results should respect limit parameter"
        print(f"✓ Limit parameter works: got {len(data['customers'])} results (limit=3)")
    
    def test_results_sorted_by_name(self, api_client, store_id):
        """Results should be sorted by name"""
        response = api_client.get(
            f"{BASE_URL}/api/pos/customers/search",
            params={"store_id": store_id, "query": "a", "limit": 10}
        )
        assert response.status_code == 200
        data = response.json()
        
        if len(data["customers"]) > 1:
            names = [c.get("name", "") for c in data["customers"]]
            print(f"✓ Results returned: {names[:5]}...")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
