"""
ShipStation API Routes
Handles shipping rates, labels, and order management through ShipStation
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import Optional, Dict, List
from pydantic import BaseModel
from services.shipstation_service import shipstation_service
from models.user import User
from dependencies import get_current_user

router = APIRouter()


class RateRequest(BaseModel):
    carrier_code: str
    from_postal_code: str
    to_postal_code: str
    to_country: str = "US"
    to_state: Optional[str] = None
    to_city: Optional[str] = None
    weight_value: float
    weight_units: str = "ounces"
    length: Optional[float] = None
    width: Optional[float] = None
    height: Optional[float] = None


class LabelRequest(BaseModel):
    carrier_code: str
    service_code: str
    package_code: str = "package"
    ship_date: str
    weight_value: float
    weight_units: str = "ounces"
    ship_from: Dict
    ship_to: Dict
    test_label: bool = False


class PushOrderRequest(BaseModel):
    order_id: str  # Our internal order ID


@router.get("/test-connection")
async def test_shipstation_connection(user: User = Depends(get_current_user)):
    """Test the ShipStation API connection"""
    if user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    result = await shipstation_service.test_connection()
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Connection failed"))
    
    return result


@router.get("/carriers")
async def get_carriers(user: User = Depends(get_current_user)):
    """Get list of available shipping carriers"""
    carriers = await shipstation_service.get_carriers()
    return {"carriers": carriers}


@router.get("/carriers/{carrier_code}/services")
async def get_carrier_services(carrier_code: str, user: User = Depends(get_current_user)):
    """Get available services for a specific carrier"""
    services = await shipstation_service.get_services(carrier_code)
    return {"services": services}


@router.post("/rates")
async def get_shipping_rates(request: RateRequest, user: User = Depends(get_current_user)):
    """Get shipping rates for a shipment"""
    rate_request = {
        "carrierCode": request.carrier_code,
        "fromPostalCode": request.from_postal_code,
        "toPostalCode": request.to_postal_code,
        "toCountry": request.to_country,
        "weight": {
            "value": request.weight_value,
            "units": request.weight_units
        }
    }
    
    if request.to_state:
        rate_request["toState"] = request.to_state
    if request.to_city:
        rate_request["toCity"] = request.to_city
    
    if request.length and request.width and request.height:
        rate_request["dimensions"] = {
            "length": request.length,
            "width": request.width,
            "height": request.height,
            "units": "inches"
        }
    
    rates = await shipstation_service.get_shipping_rates(rate_request)
    
    if isinstance(rates, dict) and "error" in rates:
        raise HTTPException(status_code=400, detail=rates["error"])
    
    return {"rates": rates}


@router.post("/labels")
async def create_shipping_label(request: LabelRequest, user: User = Depends(get_current_user)):
    """Create a shipping label"""
    if user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    label_request = {
        "carrierCode": request.carrier_code,
        "serviceCode": request.service_code,
        "packageCode": request.package_code,
        "shipDate": request.ship_date,
        "weight": {
            "value": request.weight_value,
            "units": request.weight_units
        },
        "shipFrom": request.ship_from,
        "shipTo": request.ship_to,
        "testLabel": request.test_label
    }
    
    result = await shipstation_service.create_label(label_request)
    
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    
    return {
        "shipment_id": result.get("shipmentId"),
        "tracking_number": result.get("trackingNumber"),
        "label_url": result.get("labelData"),  # Base64 or URL
        "shipment_cost": result.get("shipmentCost"),
        "insurance_cost": result.get("insuranceCost")
    }


@router.get("/stores")
async def get_shipstation_stores(user: User = Depends(get_current_user)):
    """Get stores connected to ShipStation"""
    stores = await shipstation_service.get_stores()
    return {"stores": stores}


@router.get("/orders")
async def list_shipstation_orders(
    order_status: Optional[str] = None,
    page: int = 1,
    page_size: int = 100,
    user: User = Depends(get_current_user)
):
    """List orders from ShipStation"""
    filters = {
        "page": page,
        "pageSize": page_size
    }
    if order_status:
        filters["orderStatus"] = order_status
    
    result = await shipstation_service.list_orders(filters)
    
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    
    return result


@router.get("/shipments")
async def list_shipments(
    tracking_number: Optional[str] = None,
    page: int = 1,
    page_size: int = 100,
    user: User = Depends(get_current_user)
):
    """List shipments from ShipStation"""
    filters = {
        "page": page,
        "pageSize": page_size
    }
    if tracking_number:
        filters["trackingNumber"] = tracking_number
    
    result = await shipstation_service.list_shipments(filters)
    
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    
    return result


@router.post("/void-label/{shipment_id}")
async def void_shipping_label(shipment_id: int, user: User = Depends(get_current_user)):
    """Void a shipping label"""
    if user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    result = await shipstation_service.void_label(shipment_id)
    
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    
    return result
