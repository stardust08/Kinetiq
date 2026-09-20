"""
Cart routes for the API.

This module provides FastAPI endpoints for shopping cart management,
including viewing cart, adding items, updating quantities, removing items,
and clearing the cart. All endpoints require authentication.
"""

from fastapi import APIRouter, Depends
from app.core.dependencies import get_current_active_user
from app.api.cart.service import CartService
from app.api.cart.schemas import AddItemRequest, UpdateItemRequest, CartOut

# Create cart router with /cart prefix
cart_router = APIRouter(prefix="/cart", tags=["cart"])


@cart_router.get("/", response_model=dict)
async def get_cart(user = Depends(get_current_active_user)):
    """
    Get user's shopping cart.
    
    Retrieves the current user's cart including all items, quantities,
    prices, and total cart value. If the user doesn't have a cart yet,
    an empty cart is created and returned.
    
    Args:
        user: Current authenticated user (injected by dependency)
        
    Returns:
        dict: Response with cart data
        
    Example:
        GET /api/cart
        
        Response:
        {
            "data": {
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
        
    Note:
        - Implements requirement US-4.2: View cart
        - Requires authentication (all cart endpoints)
        - Cart persists across sessions (TR-4.3)
    """
    cart = await CartService.get_or_create_cart(user.id)
    return {"data": cart}


@cart_router.post("/items", response_model=dict)
async def add_item(
    request: AddItemRequest,
    user = Depends(get_current_active_user)
):
    """
    Add item to cart.
    
    Adds a service to the user's cart with the specified quantity.
    If the service already exists in the cart, the quantity is incremented.
    Prices are captured at the time of adding (not dynamic).
    
    Args:
        request: AddItemRequest with serviceId and quantity
        user: Current authenticated user (injected by dependency)
        
    Returns:
        dict: Response with updated cart data and success message
        
    Raises:
        NotFoundException: If service with given ID doesn't exist (404)
        
    Example:
        POST /api/cart/items
        Body: {"serviceId": "cm5def456uvw", "quantity": 1}
        
        Response:
        {
            "data": {
                "id": "cart-uuid-456",
                "userId": "user-uuid-789",
                "items": [...],
                "cartValue": 399.0,
                "itemCount": 1,
                "updatedAt": "2024-01-01T00:00:00Z"
            },
            "message": "Item added to cart"
        }
        
    Note:
        - Implements requirement US-4.1: Add service to cart
        - If service already in cart, quantity is updated (US-4.1)
        - Prices captured at time of adding (TR-4.3)
        - Cart total recalculated automatically (US-4.1)
    """
    cart = await CartService.add_item(user.id, request.serviceId, request.quantity)
    return {"data": cart, "message": "Item added to cart"}


@cart_router.put("/items/{item_id}", response_model=dict)
async def update_item(
    item_id: str,
    request: UpdateItemRequest,
    user = Depends(get_current_active_user)
):
    """
    Update cart item quantity.
    
    Updates the quantity of a specific cart item. The quantity must be at least 1.
    Cart total is automatically recalculated.
    
    Args:
        item_id: UUID of the cart item to update
        request: UpdateItemRequest with new quantity
        user: Current authenticated user (injected by dependency)
        
    Returns:
        dict: Response with updated cart data and success message
        
    Raises:
        NotFoundException: If item not found in cart (404)
        
    Example:
        PUT /api/cart/items/item-uuid-123
        Body: {"quantity": 3}
        
        Response:
        {
            "data": {
                "id": "cart-uuid-456",
                "userId": "user-uuid-789",
                "items": [...],
                "cartValue": 1197.0,
                "itemCount": 3,
                "updatedAt": "2024-01-01T00:00:00Z"
            },
            "message": "Cart updated"
        }
        
    Note:
        - Implements requirement US-4.3: Update cart item quantity
        - Quantity must be at least 1 (US-4.3)
        - Cart total updates automatically (US-4.3)
        - Changes are persisted to database (US-4.3)
    """
    cart = await CartService.update_item(user.id, item_id, request.quantity)
    return {"data": cart, "message": "Cart updated"}


@cart_router.delete("/items/{item_id}", response_model=dict)
async def remove_item(
    item_id: str,
    user = Depends(get_current_active_user)
):
    """
    Remove item from cart.
    
    Removes a specific item from the cart and recalculates the cart total.
    The item is deleted from the database.
    
    Args:
        item_id: UUID of the cart item to remove
        user: Current authenticated user (injected by dependency)
        
    Returns:
        dict: Response with updated cart data and success message
        
    Example:
        DELETE /api/cart/items/item-uuid-123
        
        Response:
        {
            "data": {
                "id": "cart-uuid-456",
                "userId": "user-uuid-789",
                "items": [],
                "cartValue": 0.0,
                "itemCount": 0,
                "updatedAt": "2024-01-01T00:00:00Z"
            },
            "message": "Item removed"
        }
        
    Note:
        - Implements requirement US-4.4: Remove items from cart
        - Removed items are deleted from database (US-4.4)
        - Cart total updates automatically (US-4.4)
        - User receives confirmation (US-4.4)
    """
    cart = await CartService.remove_item(user.id, item_id)
    return {"data": cart, "message": "Item removed"}


@cart_router.delete("/", response_model=dict)
async def clear_cart(user = Depends(get_current_active_user)):
    """
    Clear entire cart.
    
    Removes all items from the cart and resets the cart value to 0.
    The cart itself is not deleted, only emptied.
    
    Args:
        user: Current authenticated user (injected by dependency)
        
    Returns:
        dict: Response with empty cart data and success message
        
    Example:
        DELETE /api/cart
        
        Response:
        {
            "data": {
                "id": "cart-uuid-456",
                "userId": "user-uuid-789",
                "items": [],
                "cartValue": 0.0,
                "itemCount": 0,
                "updatedAt": "2024-01-01T00:00:00Z"
            },
            "message": "Cart cleared"
        }
        
    Note:
        - Implements requirement US-4.5: Clear entire cart
        - Cart is emptied in database (US-4.5)
        - User sees empty cart message (US-4.5)
    """
    cart = await CartService.clear_cart(user.id)
    return {"data": cart, "message": "Cart cleared"}
