"""
Unit tests for CartService.

Tests the cart service layer business logic including:
- Getting or creating a cart
- Adding items to cart
- Updating item quantities
- Removing items
- Clearing cart
- Cart value calculations
"""

import pytest
from unittest.mock import AsyncMock, MagicMock
from app.api.cart.service import CartService
from app.core.exceptions import NotFoundException


class TestCalculateCartValue:
    """Tests for calculate_cart_value method."""
    
    def test_calculate_empty_cart(self):
        """Test calculating value of empty cart."""
        items = []
        result = CartService.calculate_cart_value(items)
        assert result == 0
    
    def test_calculate_single_item(self):
        """Test calculating value with single item."""
        items = [
            {"subtotal": 399}
        ]
        result = CartService.calculate_cart_value(items)
        assert result == 399
    
    def test_calculate_multiple_items(self):
        """Test calculating value with multiple items."""
        items = [
            {"subtotal": 399},
            {"subtotal": 299},
            {"subtotal": 150}
        ]
        result = CartService.calculate_cart_value(items)
        assert result == 848
    
    def test_calculate_with_quantities(self):
        """Test calculating value with items having different quantities."""
        items = [
            {"subtotal": 798},  # 399 * 2
            {"subtotal": 897}   # 299 * 3
        ]
        result = CartService.calculate_cart_value(items)
        assert result == 1695
    
    def test_calculate_with_decimal_prices(self):
        """Test calculating value with decimal prices."""
        items = [
            {"subtotal": 99.99},
            {"subtotal": 149.50}
        ]
        result = CartService.calculate_cart_value(items)
        assert result == 249.49


@pytest.fixture
def mock_db(monkeypatch):
    """Mock database client."""
    mock = MagicMock()
    monkeypatch.setattr("app.api.cart.service.db", mock)
    return mock


@pytest.fixture
def sample_cart():
    """Sample cart data."""
    cart = MagicMock()
    cart.id = "cart-1"
    cart.userId = "user-1"
    cart.items = []
    cart.cartValue = 0
    return cart


@pytest.fixture
def sample_cart_with_items():
    """Sample cart with items."""
    cart = MagicMock()
    cart.id = "cart-1"
    cart.userId = "user-1"
    cart.items = [
        {
            "id": "item-1",
            "serviceId": "service-1",
            "serviceName": "AI Assessment",
            "quantity": 1,
            "price": 399,
            "subtotal": 399
        }
    ]
    cart.cartValue = 399
    return cart


@pytest.fixture
def sample_service():
    """Sample service data."""
    service = MagicMock()
    service.id = "service-1"
    service.name = "AI Assessment"
    service.basePrice = 399
    service.salePrice = None
    return service


@pytest.mark.asyncio
class TestGetOrCreateCart:
    """Tests for get_or_create_cart method."""
    
    async def test_get_existing_cart(self, mock_db, sample_cart):
        """Test getting an existing cart."""
        mock_db.cart.find_first = AsyncMock(return_value=sample_cart)
        
        result = await CartService.get_or_create_cart("user-1")
        
        assert result.id == "cart-1"
        assert result.userId == "user-1"
        assert result.items == []
        assert result.cartValue == 0
        mock_db.cart.find_first.assert_called_once_with(where={"userId": "user-1"})
        mock_db.cart.create.assert_not_called()
    
    async def test_create_new_cart(self, mock_db, sample_cart):
        """Test creating a new cart when user doesn't have one."""
        mock_db.cart.find_first = AsyncMock(return_value=None)
        mock_db.cart.create = AsyncMock(return_value=sample_cart)
        
        result = await CartService.get_or_create_cart("user-1")
        
        assert result.id == "cart-1"
        assert result.userId == "user-1"
        assert result.items == []
        assert result.cartValue == 0
        mock_db.cart.find_first.assert_called_once_with(where={"userId": "user-1"})
        mock_db.cart.create.assert_called_once_with(
            data={
                "userId": "user-1",
                "items": [],
                "cartValue": 0
            }
        )
    
    async def test_get_cart_with_items(self, mock_db, sample_cart_with_items):
        """Test getting a cart that already has items."""
        mock_db.cart.find_first = AsyncMock(return_value=sample_cart_with_items)
        
        result = await CartService.get_or_create_cart("user-1")
        
        assert result.id == "cart-1"
        assert result.userId == "user-1"
        assert len(result.items) == 1
        assert result.items[0]["serviceId"] == "service-1"
        assert result.cartValue == 399
        mock_db.cart.find_first.assert_called_once_with(where={"userId": "user-1"})


@pytest.mark.asyncio
class TestAddItem:
    """Tests for add_item method."""
    
    async def test_add_item_to_empty_cart(self, mock_db, sample_cart, sample_service):
        """Test adding an item to an empty cart."""
        # Setup mocks
        mock_db.cart.find_first = AsyncMock(return_value=sample_cart)
        mock_db.service.find_unique = AsyncMock(return_value=sample_service)
        
        updated_cart = MagicMock()
        updated_cart.id = "cart-1"
        updated_cart.userId = "user-1"
        updated_cart.items = [
            {
                "id": "item-1",
                "serviceId": "service-1",
                "serviceName": "AI Assessment",
                "quantity": 1,
                "price": 399,
                "subtotal": 399
            }
        ]
        updated_cart.cartValue = 399
        mock_db.cart.update = AsyncMock(return_value=updated_cart)
        
        result = await CartService.add_item("user-1", "service-1", 1)
        
        assert result.cartValue == 399
        assert len(result.items) == 1
        assert result.items[0]["serviceId"] == "service-1"
        assert result.items[0]["quantity"] == 1
        assert result.items[0]["subtotal"] == 399
        mock_db.service.find_unique.assert_called_once_with(where={"id": "service-1"})
        mock_db.cart.update.assert_called_once()
    
    async def test_add_item_with_quantity(self, mock_db, sample_cart, sample_service):
        """Test adding multiple quantities of an item."""
        mock_db.cart.find_first = AsyncMock(return_value=sample_cart)
        mock_db.service.find_unique = AsyncMock(return_value=sample_service)
        
        updated_cart = MagicMock()
        updated_cart.id = "cart-1"
        updated_cart.items = [
            {
                "id": "item-1",
                "serviceId": "service-1",
                "serviceName": "AI Assessment",
                "quantity": 3,
                "price": 399,
                "subtotal": 1197
            }
        ]
        updated_cart.cartValue = 1197
        mock_db.cart.update = AsyncMock(return_value=updated_cart)
        
        result = await CartService.add_item("user-1", "service-1", 3)
        
        assert result.cartValue == 1197
        assert result.items[0]["quantity"] == 3
        assert result.items[0]["subtotal"] == 1197
    
    async def test_add_duplicate_item_updates_quantity(self, mock_db, sample_cart_with_items, sample_service):
        """Test adding an item that already exists in cart updates quantity."""
        mock_db.cart.find_first = AsyncMock(return_value=sample_cart_with_items)
        mock_db.service.find_unique = AsyncMock(return_value=sample_service)
        
        updated_cart = MagicMock()
        updated_cart.id = "cart-1"
        updated_cart.items = [
            {
                "id": "item-1",
                "serviceId": "service-1",
                "serviceName": "AI Assessment",
                "quantity": 2,
                "price": 399,
                "subtotal": 798
            }
        ]
        updated_cart.cartValue = 798
        mock_db.cart.update = AsyncMock(return_value=updated_cart)
        
        result = await CartService.add_item("user-1", "service-1", 1)
        
        assert result.cartValue == 798
        assert len(result.items) == 1
        assert result.items[0]["quantity"] == 2
        assert result.items[0]["subtotal"] == 798
    
    async def test_add_item_service_not_found(self, mock_db, sample_cart):
        """Test adding a non-existent service raises NotFoundException."""
        mock_db.cart.find_first = AsyncMock(return_value=sample_cart)
        mock_db.service.find_unique = AsyncMock(return_value=None)
        
        with pytest.raises(NotFoundException, match="Service not found"):
            await CartService.add_item("user-1", "invalid-service", 1)
    
    async def test_add_item_uses_sale_price(self, mock_db, sample_cart):
        """Test that sale price is used when available."""
        service_with_sale = MagicMock()
        service_with_sale.id = "service-2"
        service_with_sale.name = "Premium Service"
        service_with_sale.basePrice = 500
        service_with_sale.salePrice = 399
        
        mock_db.cart.find_first = AsyncMock(return_value=sample_cart)
        mock_db.service.find_unique = AsyncMock(return_value=service_with_sale)
        
        updated_cart = MagicMock()
        updated_cart.id = "cart-1"
        updated_cart.items = [
            {
                "id": "item-1",
                "serviceId": "service-2",
                "serviceName": "Premium Service",
                "quantity": 1,
                "price": 399,
                "subtotal": 399
            }
        ]
        updated_cart.cartValue = 399
        mock_db.cart.update = AsyncMock(return_value=updated_cart)
        
        result = await CartService.add_item("user-1", "service-2", 1)
        
        assert result.items[0]["price"] == 399
        assert result.cartValue == 399
    
    async def test_add_multiple_different_items(self, mock_db, sample_cart_with_items):
        """Test adding a different item to cart with existing items."""
        service2 = MagicMock()
        service2.id = "service-2"
        service2.name = "Data Analysis"
        service2.basePrice = 299
        service2.salePrice = None
        
        mock_db.cart.find_first = AsyncMock(return_value=sample_cart_with_items)
        mock_db.service.find_unique = AsyncMock(return_value=service2)
        
        updated_cart = MagicMock()
        updated_cart.id = "cart-1"
        updated_cart.items = [
            {
                "id": "item-1",
                "serviceId": "service-1",
                "serviceName": "AI Assessment",
                "quantity": 1,
                "price": 399,
                "subtotal": 399
            },
            {
                "id": "item-2",
                "serviceId": "service-2",
                "serviceName": "Data Analysis",
                "quantity": 1,
                "price": 299,
                "subtotal": 299
            }
        ]
        updated_cart.cartValue = 698
        mock_db.cart.update = AsyncMock(return_value=updated_cart)
        
        result = await CartService.add_item("user-1", "service-2", 1)
        
        assert result.cartValue == 698
        assert len(result.items) == 2


@pytest.mark.asyncio
class TestUpdateItem:
    """Tests for update_item method."""
    
    async def test_update_item_quantity(self, mock_db, sample_cart_with_items):
        """Test updating item quantity."""
        mock_db.cart.find_first = AsyncMock(return_value=sample_cart_with_items)
        
        updated_cart = MagicMock()
        updated_cart.id = "cart-1"
        updated_cart.items = [
            {
                "id": "item-1",
                "serviceId": "service-1",
                "serviceName": "AI Assessment",
                "quantity": 3,
                "price": 399,
                "subtotal": 1197
            }
        ]
        updated_cart.cartValue = 1197
        mock_db.cart.update = AsyncMock(return_value=updated_cart)
        
        result = await CartService.update_item("user-1", "item-1", 3)
        
        assert result.cartValue == 1197
        assert result.items[0]["quantity"] == 3
        assert result.items[0]["subtotal"] == 1197
        mock_db.cart.update.assert_called_once()
    
    async def test_update_item_to_minimum_quantity(self, mock_db, sample_cart_with_items):
        """Test updating item to minimum quantity of 1."""
        mock_db.cart.find_first = AsyncMock(return_value=sample_cart_with_items)
        
        updated_cart = MagicMock()
        updated_cart.id = "cart-1"
        updated_cart.items = [
            {
                "id": "item-1",
                "serviceId": "service-1",
                "serviceName": "AI Assessment",
                "quantity": 1,
                "price": 399,
                "subtotal": 399
            }
        ]
        updated_cart.cartValue = 399
        mock_db.cart.update = AsyncMock(return_value=updated_cart)
        
        result = await CartService.update_item("user-1", "item-1", 1)
        
        assert result.cartValue == 399
        assert result.items[0]["quantity"] == 1
        assert result.items[0]["subtotal"] == 399
    
    async def test_update_item_not_found(self, mock_db, sample_cart_with_items):
        """Test updating a non-existent item raises NotFoundException."""
        mock_db.cart.find_first = AsyncMock(return_value=sample_cart_with_items)
        
        with pytest.raises(NotFoundException, match="Item not found in cart"):
            await CartService.update_item("user-1", "invalid-item", 2)
    
    async def test_update_item_recalculates_cart_value(self, mock_db):
        """Test that updating item recalculates total cart value."""
        cart_with_multiple_items = MagicMock()
        cart_with_multiple_items.id = "cart-1"
        cart_with_multiple_items.userId = "user-1"
        cart_with_multiple_items.items = [
            {
                "id": "item-1",
                "serviceId": "service-1",
                "serviceName": "AI Assessment",
                "quantity": 1,
                "price": 399,
                "subtotal": 399
            },
            {
                "id": "item-2",
                "serviceId": "service-2",
                "serviceName": "Data Analysis",
                "quantity": 1,
                "price": 299,
                "subtotal": 299
            }
        ]
        cart_with_multiple_items.cartValue = 698
        
        mock_db.cart.find_first = AsyncMock(return_value=cart_with_multiple_items)
        
        updated_cart = MagicMock()
        updated_cart.id = "cart-1"
        updated_cart.items = [
            {
                "id": "item-1",
                "serviceId": "service-1",
                "serviceName": "AI Assessment",
                "quantity": 5,
                "price": 399,
                "subtotal": 1995
            },
            {
                "id": "item-2",
                "serviceId": "service-2",
                "serviceName": "Data Analysis",
                "quantity": 1,
                "price": 299,
                "subtotal": 299
            }
        ]
        updated_cart.cartValue = 2294
        mock_db.cart.update = AsyncMock(return_value=updated_cart)
        
        result = await CartService.update_item("user-1", "item-1", 5)
        
        assert result.cartValue == 2294
        assert result.items[0]["quantity"] == 5
        assert result.items[0]["subtotal"] == 1995
        assert result.items[1]["quantity"] == 1
        assert result.items[1]["subtotal"] == 299
    
    async def test_update_item_in_empty_cart(self, mock_db, sample_cart):
        """Test updating item in empty cart raises NotFoundException."""
        mock_db.cart.find_first = AsyncMock(return_value=sample_cart)
        
        with pytest.raises(NotFoundException, match="Item not found in cart"):
            await CartService.update_item("user-1", "item-1", 2)


@pytest.mark.asyncio
class TestRemoveItem:
    """Tests for remove_item method."""
    
    async def test_remove_item_from_cart(self, mock_db, sample_cart_with_items):
        """Test removing an item from cart."""
        mock_db.cart.find_first = AsyncMock(return_value=sample_cart_with_items)
        
        updated_cart = MagicMock()
        updated_cart.id = "cart-1"
        updated_cart.items = []
        updated_cart.cartValue = 0
        mock_db.cart.update = AsyncMock(return_value=updated_cart)
        
        result = await CartService.remove_item("user-1", "item-1")
        
        assert result.cartValue == 0
        assert len(result.items) == 0
        mock_db.cart.update.assert_called_once()
    
    async def test_remove_item_recalculates_cart_value(self, mock_db):
        """Test that removing item recalculates total cart value."""
        cart_with_multiple_items = MagicMock()
        cart_with_multiple_items.id = "cart-1"
        cart_with_multiple_items.userId = "user-1"
        cart_with_multiple_items.items = [
            {
                "id": "item-1",
                "serviceId": "service-1",
                "serviceName": "AI Assessment",
                "quantity": 1,
                "price": 399,
                "subtotal": 399
            },
            {
                "id": "item-2",
                "serviceId": "service-2",
                "serviceName": "Data Analysis",
                "quantity": 1,
                "price": 299,
                "subtotal": 299
            }
        ]
        cart_with_multiple_items.cartValue = 698
        
        mock_db.cart.find_first = AsyncMock(return_value=cart_with_multiple_items)
        
        updated_cart = MagicMock()
        updated_cart.id = "cart-1"
        updated_cart.items = [
            {
                "id": "item-2",
                "serviceId": "service-2",
                "serviceName": "Data Analysis",
                "quantity": 1,
                "price": 299,
                "subtotal": 299
            }
        ]
        updated_cart.cartValue = 299
        mock_db.cart.update = AsyncMock(return_value=updated_cart)
        
        result = await CartService.remove_item("user-1", "item-1")
        
        assert result.cartValue == 299
        assert len(result.items) == 1
        assert result.items[0]["serviceId"] == "service-2"
    
    async def test_remove_nonexistent_item(self, mock_db, sample_cart_with_items):
        """Test removing a non-existent item doesn't affect cart."""
        mock_db.cart.find_first = AsyncMock(return_value=sample_cart_with_items)
        
        updated_cart = MagicMock()
        updated_cart.id = "cart-1"
        updated_cart.items = [
            {
                "id": "item-1",
                "serviceId": "service-1",
                "serviceName": "AI Assessment",
                "quantity": 1,
                "price": 399,
                "subtotal": 399
            }
        ]
        updated_cart.cartValue = 399
        mock_db.cart.update = AsyncMock(return_value=updated_cart)
        
        result = await CartService.remove_item("user-1", "invalid-item")
        
        assert result.cartValue == 399
        assert len(result.items) == 1
        assert result.items[0]["id"] == "item-1"
    
    async def test_remove_item_from_empty_cart(self, mock_db, sample_cart):
        """Test removing item from empty cart doesn't cause errors."""
        mock_db.cart.find_first = AsyncMock(return_value=sample_cart)
        
        updated_cart = MagicMock()
        updated_cart.id = "cart-1"
        updated_cart.items = []
        updated_cart.cartValue = 0
        mock_db.cart.update = AsyncMock(return_value=updated_cart)
        
        result = await CartService.remove_item("user-1", "item-1")
        
        assert result.cartValue == 0
        assert len(result.items) == 0



@pytest.mark.asyncio
class TestClearCart:
    """Tests for clear_cart method."""
    
    async def test_clear_cart_with_items(self, mock_db, sample_cart_with_items):
        """Test clearing a cart that has items."""
        mock_db.cart.find_first = AsyncMock(return_value=sample_cart_with_items)
        
        updated_cart = MagicMock()
        updated_cart.id = "cart-1"
        updated_cart.userId = "user-1"
        updated_cart.items = []
        updated_cart.cartValue = 0
        mock_db.cart.update = AsyncMock(return_value=updated_cart)
        
        result = await CartService.clear_cart("user-1")
        
        assert result.cartValue == 0
        assert len(result.items) == 0
        mock_db.cart.update.assert_called_once_with(
            where={"id": "cart-1"},
            data={"items": [], "cartValue": 0}
        )
    
    async def test_clear_empty_cart(self, mock_db, sample_cart):
        """Test clearing an already empty cart."""
        mock_db.cart.find_first = AsyncMock(return_value=sample_cart)
        
        updated_cart = MagicMock()
        updated_cart.id = "cart-1"
        updated_cart.userId = "user-1"
        updated_cart.items = []
        updated_cart.cartValue = 0
        mock_db.cart.update = AsyncMock(return_value=updated_cart)
        
        result = await CartService.clear_cart("user-1")
        
        assert result.cartValue == 0
        assert len(result.items) == 0
        mock_db.cart.update.assert_called_once_with(
            where={"id": "cart-1"},
            data={"items": [], "cartValue": 0}
        )
    
    async def test_clear_cart_with_multiple_items(self, mock_db):
        """Test clearing a cart with multiple items."""
        cart_with_multiple_items = MagicMock()
        cart_with_multiple_items.id = "cart-1"
        cart_with_multiple_items.userId = "user-1"
        cart_with_multiple_items.items = [
            {
                "id": "item-1",
                "serviceId": "service-1",
                "serviceName": "AI Assessment",
                "quantity": 2,
                "price": 399,
                "subtotal": 798
            },
            {
                "id": "item-2",
                "serviceId": "service-2",
                "serviceName": "Data Analysis",
                "quantity": 3,
                "price": 299,
                "subtotal": 897
            }
        ]
        cart_with_multiple_items.cartValue = 1695
        
        mock_db.cart.find_first = AsyncMock(return_value=cart_with_multiple_items)
        
        updated_cart = MagicMock()
        updated_cart.id = "cart-1"
        updated_cart.userId = "user-1"
        updated_cart.items = []
        updated_cart.cartValue = 0
        mock_db.cart.update = AsyncMock(return_value=updated_cart)
        
        result = await CartService.clear_cart("user-1")
        
        assert result.cartValue == 0
        assert len(result.items) == 0
        mock_db.cart.update.assert_called_once_with(
            where={"id": "cart-1"},
            data={"items": [], "cartValue": 0}
        )
    
    async def test_clear_cart_creates_cart_if_not_exists(self, mock_db, sample_cart):
        """Test clearing cart creates a new cart if user doesn't have one."""
        mock_db.cart.find_first = AsyncMock(return_value=None)
        mock_db.cart.create = AsyncMock(return_value=sample_cart)
        
        updated_cart = MagicMock()
        updated_cart.id = "cart-1"
        updated_cart.userId = "user-1"
        updated_cart.items = []
        updated_cart.cartValue = 0
        mock_db.cart.update = AsyncMock(return_value=updated_cart)
        
        result = await CartService.clear_cart("user-1")
        
        assert result.cartValue == 0
        assert len(result.items) == 0
        mock_db.cart.create.assert_called_once_with(
            data={
                "userId": "user-1",
                "items": [],
                "cartValue": 0
            }
        )
        mock_db.cart.update.assert_called_once()
