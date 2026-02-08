"""
POS (Point of Sale) Backend API Tests
Tests cover:
- Store listing endpoint
- Product search (query, SKU, barcode)
- Customer search
- Order creation endpoint structure
"""

import pytest
import requests
import os
from datetime import datetime, timezone

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test session token will be set dynamically
TEST_SESSION_TOKEN = os.environ.get('POS_TEST_SESSION_TOKEN', 'test_session_pos_1770566781351')


@pytest.fixture(scope="module")
def api_client():
    """Create authenticated API session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    session.cookies.set("session_token", TEST_SESSION_TOKEN)
    return session


class TestPOSStores:
    """Tests for GET /api/pos/stores endpoint"""
    
    def test_get_stores_authenticated(self, api_client):
        """Should return stores list for authenticated user"""
        response = api_client.get(f"{BASE_URL}/api/pos/stores")
        assert response.status_code == 200
        data = response.json()
        assert "stores" in data
        assert isinstance(data["stores"], list)
        print(f"✓ GET /api/pos/stores returns {len(data['stores'])} stores")
    
    def test_get_stores_returns_shopify_stores(self, api_client):
        """Should return stores with required fields"""
        response = api_client.get(f"{BASE_URL}/api/pos/stores")
        assert response.status_code == 200
        data = response.json()
        
        if len(data["stores"]) > 0:
            store = data["stores"][0]
            assert "store_id" in store
            assert "name" in store
            assert "shop_url" in store
            print(f"✓ Store has required fields: store_id, name, shop_url")
        else:
            pytest.skip("No stores available in database")
    
    def test_get_stores_unauthenticated(self):
        """Should return 401 for unauthenticated request"""
        response = requests.get(f"{BASE_URL}/api/pos/stores")
        assert response.status_code == 401
        print(f"✓ Unauthenticated request returns 401")


class TestPOSProductSearch:
    """Tests for GET /api/pos/products/search endpoint"""
    
    @pytest.fixture
    def store_id(self, api_client):
        """Get first available store ID"""
        response = api_client.get(f"{BASE_URL}/api/pos/stores")
        stores = response.json().get("stores", [])
        if not stores:
            pytest.skip("No stores available")
        return stores[0]["store_id"]
    
    def test_search_products_by_query(self, api_client, store_id):
        """Should search products by text query"""
        response = api_client.get(
            f"{BASE_URL}/api/pos/products/search",
            params={"store_id": store_id, "query": "frame"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "products" in data
        assert "count" in data
        print(f"✓ Product search by query returns {data['count']} products")
    
    def test_search_products_response_structure(self, api_client, store_id):
        """Should return products with expected fields"""
        response = api_client.get(
            f"{BASE_URL}/api/pos/products/search",
            params={"store_id": store_id, "query": "frame", "limit": 5}
        )
        assert response.status_code == 200
        data = response.json()
        
        if data["count"] > 0:
            product = data["products"][0]
            # Check required fields
            assert "product_id" in product
            assert "title" in product
            assert "variants" in product
            print(f"✓ Product has required fields: product_id, title, variants")
            
            # Check variants have required fields
            if product["variants"]:
                variant = product["variants"][0]
                assert "variant_id" in variant
                assert "price" in variant
                assert "sku" in variant
                print(f"✓ Variant has required fields: variant_id, price, sku")
    
    def test_search_products_by_sku(self, api_client, store_id):
        """Should search products by SKU"""
        response = api_client.get(
            f"{BASE_URL}/api/pos/products/search",
            params={"store_id": store_id, "sku": "BWF"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "products" in data
        print(f"✓ Product search by SKU returns {data['count']} products")
    
    def test_search_products_empty_query(self, api_client, store_id):
        """Should return empty results for empty query"""
        response = api_client.get(
            f"{BASE_URL}/api/pos/products/search",
            params={"store_id": store_id, "query": ""}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["count"] == 0
        print(f"✓ Empty query returns no products")
    
    def test_search_products_missing_store_id(self, api_client):
        """Should handle missing store_id parameter"""
        response = api_client.get(
            f"{BASE_URL}/api/pos/products/search",
            params={"query": "test"}
        )
        # Should return 422 for missing required field or empty result
        assert response.status_code in [422, 200]
        print(f"✓ Missing store_id handled correctly")


class TestPOSCustomerSearch:
    """Tests for GET /api/pos/customers/search endpoint"""
    
    @pytest.fixture
    def store_id(self, api_client):
        """Get first available store ID"""
        response = api_client.get(f"{BASE_URL}/api/pos/stores")
        stores = response.json().get("stores", [])
        if not stores:
            pytest.skip("No stores available")
        return stores[0]["store_id"]
    
    def test_search_customers_by_query(self, api_client, store_id):
        """Should search customers by query"""
        response = api_client.get(
            f"{BASE_URL}/api/pos/customers/search",
            params={"store_id": store_id, "query": "test"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "customers" in data
        assert "count" in data
        print(f"✓ Customer search returns {data['count']} customers")
    
    def test_search_customers_response_structure(self, api_client, store_id):
        """Should return customers with expected fields"""
        response = api_client.get(
            f"{BASE_URL}/api/pos/customers/search",
            params={"store_id": store_id, "query": "test"}
        )
        assert response.status_code == 200
        data = response.json()
        
        if data["count"] > 0:
            customer = data["customers"][0]
            assert "customer_id" in customer
            assert "email" in customer
            print(f"✓ Customer has required fields: customer_id, email")
    
    def test_search_customers_empty_query(self, api_client, store_id):
        """Should return empty for empty query"""
        response = api_client.get(
            f"{BASE_URL}/api/pos/customers/search",
            params={"store_id": store_id, "query": ""}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["count"] == 0
        print(f"✓ Empty customer query returns no results")


class TestPOSOrderCreation:
    """Tests for POST /api/pos/orders endpoint structure validation"""
    
    @pytest.fixture
    def store_id(self, api_client):
        """Get first available store ID"""
        response = api_client.get(f"{BASE_URL}/api/pos/stores")
        stores = response.json().get("stores", [])
        if not stores:
            pytest.skip("No stores available")
        return stores[0]["store_id"]
    
    def test_create_order_empty_cart(self, api_client, store_id):
        """Should handle empty cart validation"""
        order_data = {
            "store_id": store_id,
            "line_items": [],
            "ship_all_items": True,
            "tax_exempt": False,
            "financial_status": "pending"
        }
        response = api_client.post(f"{BASE_URL}/api/pos/orders", json=order_data)
        # Shopify will reject empty orders
        assert response.status_code in [400, 422, 500]
        print(f"✓ Empty cart order handled with status {response.status_code}")
    
    def test_create_order_invalid_store(self, api_client):
        """Should return error for invalid store ID"""
        order_data = {
            "store_id": "invalid_store_id",
            "line_items": [{"title": "Test", "quantity": 1, "price": 10.0}],
            "ship_all_items": True,
            "tax_exempt": False,
            "financial_status": "pending"
        }
        response = api_client.post(f"{BASE_URL}/api/pos/orders", json=order_data)
        assert response.status_code == 404
        print(f"✓ Invalid store ID returns 404")
    
    def test_create_order_request_validation(self, api_client, store_id):
        """Should validate order request structure"""
        # Missing required fields
        order_data = {
            "store_id": store_id
            # Missing line_items
        }
        response = api_client.post(f"{BASE_URL}/api/pos/orders", json=order_data)
        assert response.status_code == 422
        print(f"✓ Missing fields returns 422 validation error")


class TestPOSProductBarcode:
    """Tests for GET /api/pos/products/barcode/{barcode} endpoint"""
    
    @pytest.fixture
    def store_id(self, api_client):
        """Get first available store ID"""
        response = api_client.get(f"{BASE_URL}/api/pos/stores")
        stores = response.json().get("stores", [])
        if not stores:
            pytest.skip("No stores available")
        return stores[0]["store_id"]
    
    def test_barcode_lookup_not_found(self, api_client, store_id):
        """Should return 404 for unknown barcode"""
        response = api_client.get(
            f"{BASE_URL}/api/pos/products/barcode/INVALID_BARCODE_12345",
            params={"store_id": store_id}
        )
        assert response.status_code == 404
        print(f"✓ Unknown barcode returns 404")
    
    def test_barcode_lookup_valid(self, api_client, store_id):
        """Should return product for valid barcode"""
        # First get a product with barcode
        search_response = api_client.get(
            f"{BASE_URL}/api/pos/products/search",
            params={"store_id": store_id, "query": "frame", "limit": 1}
        )
        if search_response.status_code != 200:
            pytest.skip("No products to test barcode lookup")
        
        products = search_response.json().get("products", [])
        if not products:
            pytest.skip("No products available")
        
        # Find a variant with barcode
        barcode = None
        for product in products:
            for variant in product.get("variants", []):
                if variant.get("barcode"):
                    barcode = variant["barcode"]
                    break
            if barcode:
                break
        
        if not barcode:
            pytest.skip("No products with barcodes found")
        
        response = api_client.get(
            f"{BASE_URL}/api/pos/products/barcode/{barcode}",
            params={"store_id": store_id}
        )
        assert response.status_code == 200
        data = response.json()
        assert "product" in data
        print(f"✓ Valid barcode returns product")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
