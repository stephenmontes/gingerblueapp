"""
ShipStation Integration Service
Handles all interactions with the ShipStation API for shipping and fulfillment
"""
import httpx
import os
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone

class ShipStationService:
    BASE_URL = "https://ssapi.shipstation.com"
    
    def __init__(self):
        self.api_key = os.environ.get("SHIPSTATION_API_KEY", "")
        self.api_secret = os.environ.get("SHIPSTATION_API_SECRET", "")
        self.headers = {
            "Authorization": f"Basic {self._encode_auth()}",
            "Content-Type": "application/json"
        }
    
    def _encode_auth(self) -> str:
        """Encode API key and secret for Basic auth"""
        import base64
        auth_string = f"{self.api_key}:{self.api_secret}"
        return base64.b64encode(auth_string.encode()).decode()
    
    async def test_connection(self) -> Dict[str, Any]:
        """Test the ShipStation API connection"""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    f"{self.BASE_URL}/accounts",
                    headers=self.headers
                )
                if response.status_code == 200:
                    return {"success": True, "message": "Connected to ShipStation"}
                elif response.status_code == 401:
                    return {"success": False, "error": "Invalid API key"}
                else:
                    return {"success": False, "error": f"API error: {response.status_code}"}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    async def get_carriers(self) -> List[Dict]:
        """Get list of available shipping carriers"""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    f"{self.BASE_URL}/carriers",
                    headers=self.headers
                )
                response.raise_for_status()
                return response.json()
        except Exception as e:
            return []
    
    async def get_services(self, carrier_code: str) -> List[Dict]:
        """Get available services for a carrier"""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    f"{self.BASE_URL}/carriers/listservices?carrierCode={carrier_code}",
                    headers=self.headers
                )
                response.raise_for_status()
                return response.json()
        except Exception as e:
            return []
    
    async def get_shipping_rates(self, rate_request: Dict) -> List[Dict]:
        """
        Get shipping rates for a shipment
        
        rate_request should include:
        - carrierCode: str (e.g., 'fedex', 'ups', 'usps')
        - fromPostalCode: str
        - toPostalCode: str
        - toCountry: str (two-letter code)
        - weight: {"value": float, "units": "ounces" or "pounds"}
        - dimensions (optional): {"length": float, "width": float, "height": float, "units": "inches"}
        """
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{self.BASE_URL}/shipments/getrates",
                    json=rate_request,
                    headers=self.headers
                )
                response.raise_for_status()
                return response.json()
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 429:
                return {"error": "Rate limit exceeded. Please try again later."}
            return {"error": f"API error: {e.response.text}"}
        except Exception as e:
            return {"error": str(e)}
    
    async def create_order(self, order_data: Dict) -> Dict:
        """
        Create or update an order in ShipStation
        
        order_data should include:
        - orderNumber: str
        - orderDate: str (ISO format)
        - orderStatus: str ('awaiting_shipment', 'shipped', etc.)
        - customerEmail: str
        - billTo: address object
        - shipTo: address object
        - items: list of line items
        """
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{self.BASE_URL}/orders/createorder",
                    json=order_data,
                    headers=self.headers
                )
                response.raise_for_status()
                return response.json()
        except httpx.HTTPStatusError as e:
            return {"error": f"Failed to create order: {e.response.text}"}
        except Exception as e:
            return {"error": str(e)}
    
    async def list_orders(self, filters: Optional[Dict] = None) -> Dict:
        """List orders from ShipStation with optional filters"""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                params = filters or {}
                response = await client.get(
                    f"{self.BASE_URL}/orders",
                    params=params,
                    headers=self.headers
                )
                response.raise_for_status()
                return response.json()
        except Exception as e:
            return {"error": str(e), "orders": []}
    
    async def get_order(self, order_id: int) -> Dict:
        """Get a specific order from ShipStation"""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    f"{self.BASE_URL}/orders/{order_id}",
                    headers=self.headers
                )
                response.raise_for_status()
                return response.json()
        except Exception as e:
            return {"error": str(e)}
    
    async def create_label(self, label_request: Dict) -> Dict:
        """
        Create a shipping label
        
        label_request should include:
        - carrierCode: str
        - serviceCode: str
        - packageCode: str
        - shipDate: str (YYYY-MM-DD)
        - weight: {"value": float, "units": "ounces"}
        - shipFrom: address object
        - shipTo: address object
        - testLabel: bool (optional, for testing)
        """
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    f"{self.BASE_URL}/shipments/createlabel",
                    json=label_request,
                    headers=self.headers
                )
                response.raise_for_status()
                return response.json()
        except httpx.HTTPStatusError as e:
            return {"error": f"Failed to create label: {e.response.text}"}
        except Exception as e:
            return {"error": str(e)}
    
    async def void_label(self, shipment_id: int) -> Dict:
        """Void a shipping label"""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{self.BASE_URL}/shipments/voidlabel",
                    json={"shipmentId": shipment_id},
                    headers=self.headers
                )
                response.raise_for_status()
                return response.json()
        except Exception as e:
            return {"error": str(e)}
    
    async def list_shipments(self, filters: Optional[Dict] = None) -> Dict:
        """List shipments from ShipStation"""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                params = filters or {}
                response = await client.get(
                    f"{self.BASE_URL}/shipments",
                    params=params,
                    headers=self.headers
                )
                response.raise_for_status()
                return response.json()
        except Exception as e:
            return {"error": str(e), "shipments": []}
    
    async def get_stores(self) -> List[Dict]:
        """Get list of stores connected to ShipStation"""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    f"{self.BASE_URL}/stores",
                    headers=self.headers
                )
                response.raise_for_status()
                return response.json()
        except Exception as e:
            return []
    
    async def mark_order_shipped(self, order_id: int, tracking_number: str, carrier_code: str) -> Dict:
        """Mark an order as shipped in ShipStation"""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{self.BASE_URL}/orders/markasshipped",
                    json={
                        "orderId": order_id,
                        "trackingNumber": tracking_number,
                        "carrierCode": carrier_code,
                        "shipDate": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                        "notifyCustomer": True,
                        "notifySalesChannel": True
                    },
                    headers=self.headers
                )
                response.raise_for_status()
                return response.json()
        except Exception as e:
            return {"error": str(e)}


# Singleton instance
shipstation_service = ShipStationService()
