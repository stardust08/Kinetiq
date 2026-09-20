"""
Integration tests for cart routes.

Tests the cart API endpoints including:
- GET /cart (view cart)
- POST /cart/items (add item)
- PUT /cart/items/{id} (update quantity)
- DELETE /cart/items/{id} (remove item)
- DELETE /cart (clear cart)
- Authentication requirements
"""

import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
from app.main import app
from app.core.exceptions import NotFoundException
from app.core.dependencies import get_current_active_user

client = TestClient(app)


@pytest.fixture
def auth_headers():
    """Mock authentication headers with valid JWT token."""
    return {"Authorization": "Bearer valid-test-token"}


@pytest.fixture
def mock_user():
    """Mock authenticated user."""
    return type('User', (), {
        'id': 'user-123',
        'email': 'test@example.com',
        'status': 'ACTIVE'
    })()


@pytest.fixture
def sample_cart():
    """Sample cart data."""
    return {
        "id": "cart-456",
        "userId": "user-123",
        "items": [
            {
                "id": "item-789",
                "serviceId": "service-1",
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


@pytest.fixture
def empty_cart():
    """Empty cart data."""
    return {
        "id": "cart-456",
        "userId": "user-123",
        "items": [],
        "cartValue": 0.0,
        "itemCount": 0,
        "updatedAt": "2024-01-01T00:00:00Z"
    }


def override_get_current_active_user(mock_user):
    """Create a dependency override for authentication."""
    async def _override():
        return mock_user
    return _override


class TestAuthentication:
    """Tests for authentication requirements on cart endpoints."""
    
    def test_get_cart_requires_auth(self):
        """Test that GET /cart requires authentication."""
        response = client.get("/api/cart")
        assert response.status_code == 401
    
    def test_add_item_requires_auth(self):
        """Test that POST /cart/items requires authentication."""
        response = client.post("/api/cart/items", json={"serviceId": "service-1", "quantity": 1})
        assert response.status_code == 401
    
    def test_update_item_requires_auth(self):
        """Test that PUT /cart/items/{id} requires authentication."""
        response = client.put("/api/cart/items/item-123", json={"quantity": 2})
        assert response.status_code == 401
    
    def test_remove_item_requires_auth(self):
        """Test that DELETE /cart/items/{id} requires authentication."""
        response = client.delete("/api/cart/items/item-123")
        assert response.status_code == 401
    
    def test_clear_cart_requires_auth(self):
        """Test that DELETE /cart requires authentication."""
        response = client.delete("/api/cart")
        assert response.status_code == 401


class TestGetCart:
    """Tests for GET /api/cart endpoint."""
    
    @patch("app.api.cart.routes.CartService.get_or_create_cart")
    def test_get_cart_success(self, mock_get_cart, auth_headers, mock_user, sample_cart):
        """Test getting cart successfully."""
        app.dependency_overrides[get_current_active_user] = override_get_current_active_user(mock_user)
        mock_get_cart.return_value = sample_cart
        
        try:
            response = client.get("/api/cart", headers=auth_headers)
            
            assert response.status_code == 200
            data = response.json()
            assert data["data"]["id"] == "cart-456"
            assert data["data"]["userId"] == "user-123"
            assert len(data["data"]["items"]) == 1
            assert data["data"]["cartValue"] == 399.0
        finally:
            app.dependency_overrides.clear()
    
    @patch("app.api.cart.routes.CartService.get_or_create_cart")
    def test_get_empty_cart(self, mock_get_cart, auth_headers, mock_user, empty_cart):
        """Test getting empty cart."""
        app.dependency_overrides[get_current_active_user] = override_get_current_active_user(mock_user)
        mock_get_cart.return_value = empty_cart
        
        try:
            response = client.get("/api/cart", headers=auth_headers)
            
            assert response.status_code == 200
            data = response.json()
            assert data["data"]["items"] == []
            assert data["data"]["cartValue"] == 0.0
            assert data["data"]["itemCount"] == 0
        finally:
            app.dependency_overrides.clear()


class TestAddItem:
    """Tests for POST /api/cart/items endpoint."""
    
    @patch("app.api.cart.routes.CartService.add_item")
    def test_add_item_success(self, mock_add_item, auth_headers, mock_user, sample_cart):
        """Test adding item to cart successfully."""
        app.dependency_overrides[get_current_active_user] = override_get_current_active_user(mock_user)
        mock_add_item.return_value = sample_cart
        
        try:
            response = client.post(
                "/api/cart/items",
                headers=auth_headers,
                json={"serviceId": "service-1", "quantity": 1}
            )
            
            assert response.status_code == 200
            data = response.json()
            assert data["message"] == "Item added to cart"
            assert data["data"]["cartValue"] == 399.0
            mock_add_item.assert_called_once_with("user-123", "service-1", 1)
        finally:
            app.dependency_overrides.clear()
    
    @patch("app.api.cart.routes.CartService.add_item")
    def test_add_item_with_quantity(self, mock_add_item, auth_headers, mock_user, sample_cart):
        """Test adding item with specific quantity."""
        app.dependency_overrides[get_current_active_user] = override_get_current_active_user(mock_user)
        sample_cart["items"][0]["quantity"] = 3
        sample_cart["items"][0]["subtotal"] = 1197.0
        sample_cart["cartValue"] = 1197.0
        mock_add_item.return_value = sample_cart
        
        try:
            response = client.post(
                "/api/cart/items",
                headers=auth_headers,
                json={"serviceId": "service-1", "quantity": 3}
            )
            
            assert response.status_code == 200
            data = response.json()
            assert data["data"]["items"][0]["quantity"] == 3
            assert data["data"]["cartValue"] == 1197.0
        finally:
            app.dependency_overrides.clear()
    
    @patch("app.api.cart.routes.CartService.add_item")
    def test_add_item_service_not_found(self, mock_add_item, auth_headers, mock_user):
        """Test adding item when service doesn't exist."""
        app.dependency_overrides[get_current_active_user] = override_get_current_active_user(mock_user)
        mock_add_item.side_effect = NotFoundException("Service not found")
        
        try:
            response = client.post(
                "/api/cart/items",
                headers=auth_headers,
                json={"serviceId": "nonexistent", "quantity": 1}
            )
            
            assert response.status_code == 404
            assert "not found" in response.json()["error"].lower()
        finally:
            app.dependency_overrides.clear()
    
    def test_add_item_invalid_quantity(self, auth_headers, mock_user):
        """Test adding item with invalid quantity (less than 1)."""
        app.dependency_overrides[get_current_active_user] = override_get_current_active_user(mock_user)
        
        try:
            response = client.post(
                "/api/cart/items",
                headers=auth_headers,
                json={"serviceId": "service-1", "quantity": 0}
            )
            
            assert response.status_code == 422  # Validation error
        finally:
            app.dependency_overrides.clear()


class TestUpdateItem:
    """Tests for PUT /api/cart/items/{id} endpoint."""
    
    @patch("app.api.cart.routes.CartService.update_item")
    def test_update_item_success(self, mock_update_item, auth_headers, mock_user, sample_cart):
        """Test updating item quantity successfully."""
        app.dependency_overrides[get_current_active_user] = override_get_current_active_user(mock_user)
        sample_cart["items"][0]["quantity"] = 2
        sample_cart["items"][0]["subtotal"] = 798.0
        sample_cart["cartValue"] = 798.0
        mock_update_item.return_value = sample_cart
        
        try:
            response = client.put(
                "/api/cart/items/item-789",
                headers=auth_headers,
                json={"quantity": 2}
            )
            
            assert response.status_code == 200
            data = response.json()
            assert data["message"] == "Cart updated"
            assert data["data"]["items"][0]["quantity"] == 2
            assert data["data"]["cartValue"] == 798.0
            mock_update_item.assert_called_once_with("user-123", "item-789", 2)
        finally:
            app.dependency_overrides.clear()
    
    @patch("app.api.cart.routes.CartService.update_item")
    def test_update_item_not_found(self, mock_update_item, auth_headers, mock_user):
        """Test updating item that doesn't exist in cart."""
        app.dependency_overrides[get_current_active_user] = override_get_current_active_user(mock_user)
        mock_update_item.side_effect = NotFoundException("Item not found in cart")
        
        try:
            response = client.put(
                "/api/cart/items/nonexistent",
                headers=auth_headers,
                json={"quantity": 2}
            )
            
            assert response.status_code == 404
            assert "not found" in response.json()["error"].lower()
        finally:
            app.dependency_overrides.clear()
    
    def test_update_item_invalid_quantity(self, auth_headers, mock_user):
        """Test updating item with invalid quantity (less than 1)."""
        app.dependency_overrides[get_current_active_user] = override_get_current_active_user(mock_user)
        
        try:
            response = client.put(
                "/api/cart/items/item-789",
                headers=auth_headers,
                json={"quantity": 0}
            )
            
            assert response.status_code == 422  # Validation error
        finally:
            app.dependency_overrides.clear()


class TestRemoveItem:
    """Tests for DELETE /api/cart/items/{id} endpoint."""
    
    @patch("app.api.cart.routes.CartService.remove_item")
    def test_remove_item_success(self, mock_remove_item, auth_headers, mock_user, empty_cart):
        """Test removing item from cart successfully."""
        app.dependency_overrides[get_current_active_user] = override_get_current_active_user(mock_user)
        mock_remove_item.return_value = empty_cart
        
        try:
            response = client.delete("/api/cart/items/item-789", headers=auth_headers)
            
            assert response.status_code == 200
            data = response.json()
            assert data["message"] == "Item removed"
            assert data["data"]["items"] == []
            assert data["data"]["cartValue"] == 0.0
            mock_remove_item.assert_called_once_with("user-123", "item-789")
        finally:
            app.dependency_overrides.clear()


class TestClearCart:
    """Tests for DELETE /api/cart endpoint."""
    
    @patch("app.api.cart.routes.CartService.clear_cart")
    def test_clear_cart_success(self, mock_clear_cart, auth_headers, mock_user, empty_cart):
        """Test clearing cart successfully."""
        app.dependency_overrides[get_current_active_user] = override_get_current_active_user(mock_user)
        mock_clear_cart.return_value = empty_cart
        
        try:
            response = client.delete("/api/cart", headers=auth_headers)
            
            assert response.status_code == 200
            data = response.json()
            assert data["message"] == "Cart cleared"
            assert data["data"]["items"] == []
            assert data["data"]["cartValue"] == 0.0
            mock_clear_cart.assert_called_once_with("user-123")
        finally:
            app.dependency_overrides.clear()
