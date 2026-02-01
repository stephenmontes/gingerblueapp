from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
from datetime import datetime, timezone
import uuid

class ProductVariant(BaseModel):
    """Product variant with inventory/pricing details"""
    variant_id: str
    external_variant_id: str  # Shopify/Etsy variant ID
    sku: Optional[str] = None
    barcode: Optional[str] = None
    title: str = "Default"
    price: float = 0.0
    compare_at_price: Optional[float] = None
    inventory_quantity: int = 0
    weight: Optional[float] = None
    weight_unit: str = "lb"
    option1: Optional[str] = None  # Size, Color, etc.
    option2: Optional[str] = None
    option3: Optional[str] = None
    requires_shipping: bool = True
    taxable: bool = True
    image_url: Optional[str] = None

class ProductImage(BaseModel):
    """Product image"""
    image_id: str
    external_image_id: str
    src: str
    alt: Optional[str] = None
    position: int = 1
    width: Optional[int] = None
    height: Optional[int] = None
    variant_ids: List[str] = []

class Product(BaseModel):
    """Synced product from Shopify/Etsy"""
    model_config = ConfigDict(extra="ignore")
    
    product_id: str = Field(default_factory=lambda: f"prod_{uuid.uuid4().hex[:12]}")
    external_id: str  # Shopify/Etsy product ID
    store_id: str
    platform: str  # shopify, etsy
    
    # Basic info
    title: str
    handle: Optional[str] = None
    description: Optional[str] = None
    vendor: Optional[str] = None
    product_type: Optional[str] = None
    tags: List[str] = []
    
    # Status
    status: str = "active"  # active, archived, draft
    is_synced: bool = True
    
    # Variants and images
    variants: List[ProductVariant] = []
    images: List[ProductImage] = []
    
    # Options (e.g., Size, Color)
    options: List[dict] = []  # [{name: "Size", values: ["S", "M", "L"]}]
    
    # Timestamps
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_synced_at: Optional[datetime] = None
    external_created_at: Optional[str] = None
    external_updated_at: Optional[str] = None

class ProductCreate(BaseModel):
    """For manually creating products"""
    title: str
    store_id: str
    description: Optional[str] = None
    vendor: Optional[str] = None
    product_type: Optional[str] = None
    tags: List[str] = []
    variants: List[dict] = []
    images: List[dict] = []

class ProductSyncResult(BaseModel):
    """Result of a product sync operation"""
    store_id: str
    store_name: str
    platform: str
    total_products: int = 0
    synced: int = 0
    created: int = 0
    updated: int = 0
    failed: int = 0
    errors: List[str] = []
    synced_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
