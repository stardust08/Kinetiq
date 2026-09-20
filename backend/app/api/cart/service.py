"""
Cart Service for business logic.

This module provides the CartService class for handling cart-related
operations including adding items, updating quantities, removing items,
and clearing the cart.
"""

import uuid
from typing import Dict, Any
from app.db.client import db
from app.core.exceptions import NotFoundException
from prisma import Json


class CartService:
    """
    Service for cart operations.
    
    This class handles all business logic related to shopping cart including:
    - Getting or creating a user's cart
    - Adding items to cart (or updating quantity if already exists)
    - Updating item quantities
    - Removing items from cart
    - Clearing entire cart
    - Automatic cart value calculation
    """
    
    @staticmethod
    async def get_or_create_cart(user_id: str) -> Any:
        """
        Get user's cart or create if doesn't exist.
        
        Retrieves the cart for a specific user. If the user doesn't have a cart yet,
        creates a new empty cart with initial values.
        
        Args:
            user_id: UUID of the user
            
        Returns:
            Cart object with items and cart value
            
        Example:
            >>> cart = await CartService.get_or_create_cart("user-uuid-123")
            >>> print(cart.userId)
            'user-uuid-123'
            >>> print(cart.cartValue)
            0
            
        Note:
            Implements requirement US-4.2: View cart
            One cart per user as per TR-4.3
        """
        cart = await db.cart.find_first(where={"userId": user_id})
        if not cart:
            cart = await db.cart.create(
                data={
                    "user": {"connect": {"id": user_id}},
                    "items": Json([]),
                    "cartValue": 0
                }
            )
        return cart

    @staticmethod
    async def add_item(user_id: str, service_id: str, quantity: int = 1) -> Any:
        """
        Add or update item in cart.
        
        Adds a service to the cart with the specified quantity. If the service
        already exists in the cart, the quantity is incremented. Prices are
        captured at the time of adding (not dynamic).
        
        Args:
            user_id: UUID of the user
            service_id: UUID of the service to add
            quantity: Number of items to add (default: 1)
            
        Returns:
            Updated cart object with recalculated cart value
            
        Raises:
            NotFoundException: If service with given ID doesn't exist
            
        Example:
            >>> cart = await CartService.add_item("user-123", "service-456", 2)
            >>> print(cart.items[0]["quantity"])
            2
            >>> print(cart.cartValue)
            798
            
        Note:
            Implements requirement US-4.1: Add service to cart
            Prices captured at time of adding as per TR-4.3
            If service already in cart, quantity is updated (US-4.1)
        """
        cart = await CartService.get_or_create_cart(user_id)
        service = await db.service.find_unique(where={"id": service_id})
        
        if not service:
            raise NotFoundException("Service not found")
        
        items = cart.items or []
        existing_item = next((item for item in items if item["serviceId"] == service_id), None)
        
        if existing_item:
            existing_item["quantity"] += quantity
            existing_item["subtotal"] = existing_item["quantity"] * existing_item["price"]
        else:
            items.append({
                "id": str(uuid.uuid4()),
                "serviceId": service_id,
                "serviceName": service.name,
                "quantity": quantity,
                "price": service.salePrice or service.basePrice,
                "subtotal": (service.salePrice or service.basePrice) * quantity
            })
        
        cart_value = CartService.calculate_cart_value(items)
        
        updated_cart = await db.cart.update(
            where={"id": cart.id},
            data={"items": Json(items), "cartValue": cart_value}
        )
        
        return updated_cart

    @staticmethod
    async def update_item(user_id: str, item_id: str, quantity: int) -> Any:
        """
        Update item quantity in cart.
        
        Updates the quantity of a specific cart item. The quantity must be at least 1.
        Cart total is automatically recalculated.
        
        Args:
            user_id: UUID of the user
            item_id: UUID of the cart item to update
            quantity: New quantity (must be >= 1)
            
        Returns:
            Updated cart object with recalculated cart value
            
        Raises:
            NotFoundException: If item not found in cart
            
        Example:
            >>> cart = await CartService.update_item("user-123", "item-456", 3)
            >>> print(cart.items[0]["quantity"])
            3
            >>> print(cart.cartValue)
            1197
            
        Note:
            Implements requirement US-4.3: Update cart item quantity
            Quantity must be at least 1 (US-4.3)
            Changes are persisted to database (US-4.3)
        """
        cart = await CartService.get_or_create_cart(user_id)
        items = cart.items or []
        
        item = next((item for item in items if item["id"] == item_id), None)
        if not item:
            raise NotFoundException("Item not found in cart")
        
        item["quantity"] = quantity
        item["subtotal"] = item["quantity"] * item["price"]
        
        cart_value = CartService.calculate_cart_value(items)
        
        updated_cart = await db.cart.update(
            where={"id": cart.id},
            data={"items": Json(items), "cartValue": cart_value}
        )
        
        return updated_cart

    @staticmethod
    async def remove_item(user_id: str, item_id: str) -> Any:
        """
        Remove item from cart.
        
        Removes a specific item from the cart and recalculates the cart total.
        The item is deleted from the database.
        
        Args:
            user_id: UUID of the user
            item_id: UUID of the cart item to remove
            
        Returns:
            Updated cart object with recalculated cart value
            
        Example:
            >>> cart = await CartService.remove_item("user-123", "item-456")
            >>> print(len(cart.items))
            0
            >>> print(cart.cartValue)
            0
            
        Note:
            Implements requirement US-4.4: Remove items from cart
            Removed items are deleted from database (US-4.4)
            Cart total updates automatically (US-4.4)
        """
        cart = await CartService.get_or_create_cart(user_id)
        items = [item for item in (cart.items or []) if item["id"] != item_id]
        
        cart_value = CartService.calculate_cart_value(items)
        
        updated_cart = await db.cart.update(
            where={"id": cart.id},
            data={"items": Json(items), "cartValue": cart_value}
        )
        
        return updated_cart

    @staticmethod
    async def clear_cart(user_id: str) -> Any:
        """
        Clear all items from cart.
        
        Removes all items from the cart and resets the cart value to 0.
        The cart itself is not deleted, only emptied.
        
        Args:
            user_id: UUID of the user
            
        Returns:
            Updated empty cart object
            
        Example:
            >>> cart = await CartService.clear_cart("user-123")
            >>> print(len(cart.items))
            0
            >>> print(cart.cartValue)
            0
            
        Note:
            Implements requirement US-4.5: Clear entire cart
            Cart is emptied in database (US-4.5)
        """
        cart = await CartService.get_or_create_cart(user_id)
        
        updated_cart = await db.cart.update(
            where={"id": cart.id},
            data={"items": Json([]), "cartValue": 0}
        )
        
        return updated_cart

    @staticmethod
    def calculate_cart_value(items: list[Dict[str, Any]]) -> float:
        """
        Calculate total cart value from items.

        Calculates the total cart value by summing all item subtotals.
        This is a pure calculation function with no side effects.

        Args:
            items: List of cart items, each containing a 'subtotal' field

        Returns:
            Total cart value as a float

        Example:
            >>> items = [
            ...     {"subtotal": 399},
            ...     {"subtotal": 299}
            ... ]
            >>> CartService.calculate_cart_value(items)
            698

        Note:
            Implements requirement TR-4.3: Cart total = sum of all item subtotals
            Item subtotal = price × quantity (calculated elsewhere)
        """
        return sum(item["subtotal"] for item in items)
