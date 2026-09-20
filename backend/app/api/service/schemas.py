"""
Service schemas for request/response validation.

This module contains Pydantic models for service endpoints including
service listing, details, and filtering capabilities.
"""

from pydantic import BaseModel, Field, field_validator, ConfigDict
from typing import Optional, List, Dict, Any
from datetime import datetime


# =========================
# Base Schemas
# =========================

class ServiceBase(BaseModel):
    """Base schema for service data."""
    name: str = Field(..., description="Service name")
    slug: str = Field(..., description="URL-friendly service identifier")
    description: Optional[str] = Field(None, description="Service description")
    basePrice: float = Field(..., description="Base price of the service")
    salePrice: Optional[float] = Field(None, description="Sale price if on discount")
    discount: Optional[float] = Field(None, description="Discount percentage")
    paymentType: str = Field(..., description="Payment type (FULL or PARTIAL)")
    advancePercent: Optional[float] = Field(None, description="Advance payment percentage for PARTIAL")
    advanceAmount: Optional[float] = Field(None, description="Advance payment amount for PARTIAL")
    duration: Optional[str] = Field(None, description="Service duration description")
    serviceType: Optional[str] = Field(None, description="Type of service")
    features: Optional[List[str]] = Field(None, description="List of service features")
    reviewCount: int = Field(..., description="Number of reviews")
    deliveryMode: Optional[str] = Field(None, description="Delivery mode (Online or In-person)")
    sessionCount: Optional[int] = Field(None, description="Number of sessions")


# =========================
# Response Schemas
# =========================

class ServiceOut(ServiceBase):
    """Response schema for service with category information."""
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "id": "cm5def456uvw",
                "categoryId": "cm5abc123xyz",
                "name": "AI Assessment",
                "slug": "ai-assessment",
                "description": "AI-based movement analysis",
                "basePrice": 399,
                "salePrice": None,
                "discount": None,
                "paymentType": "FULL",
                "advancePercent": None,
                "advanceAmount": None,
                "duration": "One-time assessment",
                "serviceType": "Assessment",
                "features": ["AI-based movement analysis", "Detailed report"],
                "reviewCount": 150,
                "deliveryMode": "Online",
                "sessionCount": None,
                "category": {
                    "id": "cm5abc123xyz",
                    "name": "Knee Pain & Arthritis",
                    "slug": "knee-pain-arthritis"
                },
                "createdAt": "2024-01-01T00:00:00Z"
            }
        }
    )
    
    id: str = Field(..., description="Service ID")
    categoryId: str = Field(..., description="Category ID this service belongs to")
    category: Dict[str, Any] = Field(..., description="Related category information")
    createdAt: datetime = Field(..., description="Service creation timestamp")


# =========================
# Query Parameter Schemas
# =========================

class ServiceFilters(BaseModel):
    """Query parameters for filtering services."""
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "categoryId": "cm5abc123xyz",
                "search": "assessment",
                "paymentType": "FULL",
                "deliveryMode": "Online",
                "minPrice": 0,
                "maxPrice": 1000
            }
        }
    )
    
    categoryId: Optional[str] = Field(None, description="Filter by category ID")
    search: Optional[str] = Field(None, description="Search by service name (case-insensitive)")
    paymentType: Optional[str] = Field(None, description="Filter by payment type (FULL or PARTIAL)")
    deliveryMode: Optional[str] = Field(None, description="Filter by delivery mode (Online or In-person)")
    minPrice: Optional[float] = Field(None, ge=0, description="Minimum price filter")
    maxPrice: Optional[float] = Field(None, ge=0, description="Maximum price filter")
    
    @field_validator('maxPrice')
    @classmethod
    def validate_price_range(cls, v, info):
        """Validate that maxPrice is greater than minPrice if both are provided."""
        min_price = info.data.get('minPrice')
        if min_price is not None and v is not None and v < min_price:
            raise ValueError('maxPrice must be greater than or equal to minPrice')
        return v
    
    @field_validator('paymentType')
    @classmethod
    def validate_payment_type(cls, v):
        """Validate payment type enum."""
        if v is not None and v not in ['FULL', 'PARTIAL']:
            raise ValueError('paymentType must be either "FULL" or "PARTIAL"')
        return v
    
    @field_validator('deliveryMode')
    @classmethod
    def validate_delivery_mode(cls, v):
        """Validate delivery mode enum."""
        if v is not None and v not in ['Online', 'In-person']:
            raise ValueError('deliveryMode must be either "Online" or "In-person"')
        return v


# =========================
# Response Wrapper Schemas
# =========================

class ServiceListResponse(BaseModel):
    """Response wrapper for service list."""
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "data": [],
                "total": 0
            }
        }
    )
    
    data: List[ServiceOut] = Field(..., description="List of services")
    total: int = Field(..., description="Total number of services")
