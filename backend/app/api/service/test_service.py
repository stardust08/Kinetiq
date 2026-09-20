"""
Unit tests for ServiceService.

Tests the service layer business logic including:
- Listing services with filters
- Searching services
- Retrieving services by ID and slug
- Error handling for not found cases
"""

import pytest
from unittest.mock import AsyncMock, MagicMock
from app.api.service.service import ServiceService
from app.core.exceptions import NotFoundException


@pytest.fixture
def mock_db(monkeypatch):
    """Mock database client."""
    mock = MagicMock()
    monkeypatch.setattr("app.api.service.service.db", mock)
    return mock


@pytest.fixture
def sample_service():
    """Sample service data."""
    service = MagicMock()
    service.model_dump.return_value = {
        "id": "service-1",
        "categoryId": "category-1",
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
            "id": "category-1",
            "name": "Knee Pain & Arthritis",
            "slug": "knee-pain-arthritis"
        },
        "createdAt": "2024-01-01T00:00:00Z"
    }
    return service


@pytest.mark.asyncio
class TestGetAllServices:
    """Tests for get_all_services method."""
    
    async def test_get_all_services_no_filters(self, mock_db, sample_service):
        """Test getting all services without filters."""
        mock_db.service.find_many = AsyncMock(return_value=[sample_service])
        
        result = await ServiceService.get_all_services({})
        
        assert len(result) == 1
        assert result[0]["name"] == "AI Assessment"
        mock_db.service.find_many.assert_called_once()
        call_args = mock_db.service.find_many.call_args[1]
        assert call_args["where"] == {}
        assert call_args["order"] == {"basePrice": "asc"}
    
    async def test_get_all_services_with_category_filter(self, mock_db, sample_service):
        """Test filtering services by category."""
        mock_db.service.find_many = AsyncMock(return_value=[sample_service])
        
        filters = {"categoryId": "category-1"}
        result = await ServiceService.get_all_services(filters)
        
        assert len(result) == 1
        call_args = mock_db.service.find_many.call_args[1]
        assert call_args["where"]["categoryId"] == "category-1"
    
    async def test_get_all_services_with_search(self, mock_db, sample_service):
        """Test searching services by name."""
        mock_db.service.find_many = AsyncMock(return_value=[sample_service])
        
        filters = {"search": "assessment"}
        result = await ServiceService.get_all_services(filters)
        
        assert len(result) == 1
        call_args = mock_db.service.find_many.call_args[1]
        assert call_args["where"]["name"]["contains"] == "assessment"
        assert call_args["where"]["name"]["mode"] == "insensitive"
    
    async def test_get_all_services_with_payment_type(self, mock_db, sample_service):
        """Test filtering services by payment type."""
        mock_db.service.find_many = AsyncMock(return_value=[sample_service])
        
        filters = {"paymentType": "FULL"}
        result = await ServiceService.get_all_services(filters)
        
        assert len(result) == 1
        call_args = mock_db.service.find_many.call_args[1]
        assert call_args["where"]["paymentType"] == "FULL"
    
    async def test_get_all_services_with_delivery_mode(self, mock_db, sample_service):
        """Test filtering services by delivery mode."""
        mock_db.service.find_many = AsyncMock(return_value=[sample_service])
        
        filters = {"deliveryMode": "Online"}
        result = await ServiceService.get_all_services(filters)
        
        assert len(result) == 1
        call_args = mock_db.service.find_many.call_args[1]
        assert call_args["where"]["deliveryMode"] == "Online"
    
    async def test_get_all_services_with_price_range(self, mock_db, sample_service):
        """Test filtering services by price range."""
        mock_db.service.find_many = AsyncMock(return_value=[sample_service])
        
        filters = {"minPrice": 100, "maxPrice": 500}
        result = await ServiceService.get_all_services(filters)
        
        assert len(result) == 1
        call_args = mock_db.service.find_many.call_args[1]
        assert call_args["where"]["basePrice"]["gte"] == 100
        assert call_args["where"]["basePrice"]["lte"] == 500
    
    async def test_get_all_services_with_multiple_filters(self, mock_db, sample_service):
        """Test combining multiple filters."""
        mock_db.service.find_many = AsyncMock(return_value=[sample_service])
        
        filters = {
            "categoryId": "category-1",
            "search": "assessment",
            "paymentType": "FULL",
            "deliveryMode": "Online",
            "minPrice": 100,
            "maxPrice": 500
        }
        result = await ServiceService.get_all_services(filters)
        
        assert len(result) == 1
        call_args = mock_db.service.find_many.call_args[1]
        assert call_args["where"]["categoryId"] == "category-1"
        assert call_args["where"]["name"]["contains"] == "assessment"
        assert call_args["where"]["paymentType"] == "FULL"
        assert call_args["where"]["deliveryMode"] == "Online"
        assert call_args["where"]["basePrice"]["gte"] == 100
        assert call_args["where"]["basePrice"]["lte"] == 500


@pytest.mark.asyncio
class TestGetServiceById:
    """Tests for get_service_by_id method."""
    
    async def test_get_service_by_id_success(self, mock_db, sample_service):
        """Test getting service by ID successfully."""
        mock_db.service.find_unique = AsyncMock(return_value=sample_service)
        
        result = await ServiceService.get_service_by_id("service-1")
        
        assert result["id"] == "service-1"
        assert result["name"] == "AI Assessment"
        assert result["category"]["name"] == "Knee Pain & Arthritis"
        mock_db.service.find_unique.assert_called_once()
    
    async def test_get_service_by_id_not_found(self, mock_db):
        """Test getting service by ID when not found."""
        mock_db.service.find_unique = AsyncMock(return_value=None)
        
        with pytest.raises(NotFoundException) as exc_info:
            await ServiceService.get_service_by_id("nonexistent")
        
        assert "Service with ID 'nonexistent' not found" in str(exc_info.value)


@pytest.mark.asyncio
class TestGetServiceBySlug:
    """Tests for get_service_by_slug method."""
    
    async def test_get_service_by_slug_success(self, mock_db, sample_service):
        """Test getting service by slug successfully."""
        mock_db.service.find_unique = AsyncMock(return_value=sample_service)
        
        result = await ServiceService.get_service_by_slug("ai-assessment")
        
        assert result["slug"] == "ai-assessment"
        assert result["name"] == "AI Assessment"
        assert result["category"]["name"] == "Knee Pain & Arthritis"
        mock_db.service.find_unique.assert_called_once()
    
    async def test_get_service_by_slug_not_found(self, mock_db):
        """Test getting service by slug when not found."""
        mock_db.service.find_unique = AsyncMock(return_value=None)
        
        with pytest.raises(NotFoundException) as exc_info:
            await ServiceService.get_service_by_slug("nonexistent")
        
        assert "Service with slug 'nonexistent' not found" in str(exc_info.value)
