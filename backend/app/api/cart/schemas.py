"""
Cart schemas for request/response validation.

This module contains Pydantic models for cart endpoints including
adding items, updating quantities, and cart responses.
"""

from pydantic import BaseModel, Field, ConfigDict
from typing import List


# =========================
# Request Schemas
# =========================

class AddItemRequest(BaseModel):
    """Request schema for adding an item to cart."""
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "serviceId": "cm5def456uvw",
                "quantity": 1
            }
        }
    )
    
    serviceId: str = Field(..., description="Service ID to add to cart")
    quantity: int = Field(default=1, ge=1, description="Quantity of the service (minimum 1)")


class UpdateItemRequest(BaseModel):
    """Request schema for updating cart item quantity."""
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "quantity": 2
            }
        }
    )
    
    quantity: int = Field(..., ge=1, description="New quantity for the item (minimum 1)")


# =========================
# Response Schemas
# =========================

class CartItemOut(BaseModel):
    """Response schema for a cart item."""
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "id": "item-uuid-123",
                "serviceId": "cm5def456uvw",
                "serviceName": "AI Assessment",
                "quantity": 1,
                "price": 399.0,
                "subtotal": 399.0
            }
        }
    )
    
    id: str = Field(..., description="Cart item ID")
    serviceId: str = Field(..., description="Service ID")
    serviceName: str = Field(..., description="Service name")
    quantity: int = Field(..., description="Quantity of the service")
    price: float = Field(..., description="Price per unit at time of adding")
    subtotal: float = Field(..., description="Subtotal (price × quantity)")


class CartOut(BaseModel):
    """Response schema for cart."""
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "id": "cart-uuid-456",
                "userId": "user-uuid-789",
                "items": [
                    {
                        "id": "item-uuid-123",
                        "serviceId": "cm5def456uvw",
                        "serviceName": "AI Assessment",
                        "quantity": 1,
                        "price": 399.0,
                        "subtotal": 399.0
                    }
                ],
                "cartValue": 399.0,
                "itemCount": 1,
                "updatedAt": "2024-01-01T00:00:00Z"
            }
        }
    )
    
    id: str = Field(..., description="Cart ID")
    userId: str = Field(..., description="User ID who owns the cart")
    items: List[CartItemOut] = Field(..., description="List of items in the cart")
    cartValue: float = Field(..., description="Total cart value")
    itemCount: int = Field(..., description="Total number of items in cart")
    updatedAt: str = Field(..., description="Last update timestamp")
