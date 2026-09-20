"""
Category schemas for request/response validation.

This module contains Pydantic models for category endpoints including
category listing, details, and service filtering.
"""

from pydantic import BaseModel, Field, field_validator, ConfigDict
from typing import Optional, List, Dict, Any
from datetime import datetime
import re


# =========================
# Base Schemas
# =========================

class CategoryBase(BaseModel):
    """Base schema for category data."""
    name: str = Field(..., description="Category name")
    slug: str = Field(..., description="URL-friendly category identifier")
    description: Optional[str] = Field(None, description="Category description")
    imageUrl: Optional[str] = Field(None, description="Category image URL")
    status: Optional[str] = Field(None, description="Category status (e.g., 'active', 'coming_soon')")
    
    @field_validator('slug')
    @classmethod
    def validate_slug(cls, v):
        """Validate slug format (lowercase, hyphens only)."""
        if not re.match(r'^[a-z0-9]+(?:-[a-z0-9]+)*$', v):
            raise ValueError('Slug must be lowercase with hyphens only (e.g., "knee-pain-arthritis")')
        return v


# =========================
# Response Schemas
# =========================

class CategoryOut(CategoryBase):
    """Response schema for category list."""
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "id": "cm5abc123xyz",
                "name": "Knee Pain & Arthritis",
                "slug": "knee-pain-arthritis",
                "description": "Comprehensive care for knee pain and arthritis",
                "imageUrl": "https://example.com/images/knee-pain.jpg",
                "status": "active",
                "serviceCount": 5,
                "createdAt": "2024-01-01T00:00:00Z"
            }
        }
    )
    
    id: str = Field(..., description="Category ID")
    serviceCount: int = Field(..., description="Number of services in this category")
    createdAt: datetime = Field(..., description="Category creation timestamp")


class CategoryDetail(CategoryBase):
    """Response schema for detailed category view with services."""
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "id": "cm5abc123xyz",
                "name": "Knee Pain & Arthritis",
                "slug": "knee-pain-arthritis",
                "description": "Comprehensive care for knee pain and arthritis",
                "imageUrl": "https://example.com/images/knee-pain.jpg",
                "status": "active",
                "services": [],
                "createdAt": "2024-01-01T00:00:00Z"
            }
        }
    )
    
    id: str = Field(..., description="Category ID")
    services: List[Dict[str, Any]] = Field(default_factory=list, description="List of services in this category")
    createdAt: datetime = Field(..., description="Category creation timestamp")


# =========================
# Query Parameter Schemas
# =========================

class CategoryFilters(BaseModel):
    """Query parameters for filtering categories."""
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "status": "active"
            }
        }
    )
    
    status: Optional[str] = Field(None, description="Filter by category status")


class CategoryServiceFilters(BaseModel):
    """Query parameters for filtering services within a category."""
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "paymentType": "FULL",
                "minPrice": 0,
                "maxPrice": 10000
            }
        }
    )
    
    paymentType: Optional[str] = Field(None, description="Filter by payment type (FULL or PARTIAL)")
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


# =========================
# Response Wrapper Schemas
# =========================

class CategoryListResponse(BaseModel):
    """Response wrapper for category list."""
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "data": [],
                "total": 0
            }
        }
    )
    
    data: List[CategoryOut] = Field(..., description="List of categories")
    total: int = Field(..., description="Total number of categories")


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
    
    data: List[Dict[str, Any]] = Field(..., description="List of services")
    total: int = Field(..., description="Total number of services")
