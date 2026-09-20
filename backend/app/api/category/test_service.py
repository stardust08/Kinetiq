"""
Unit tests for CategoryService.

This module tests the CategoryService business logic including:
- Listing all categories with optional status filtering
- Retrieving individual category details
- Fetching services within a category with filters
"""

import pytest
from unittest.mock import AsyncMock, MagicMock
from app.api.category.service import CategoryService
from app.core.exceptions import NotFoundException


@pytest.fixture
def mock_db(monkeypatch):
    """Mock the database client."""
    mock = MagicMock()
    monkeypatch.setattr("app.api.category.service.db", mock)
    return mock


@pytest.mark.asyncio
class TestGetAllCategories:
    """Test get_all_categories() method."""
    
    async def test_get_all_categories_no_filter(self, mock_db):
        """Test getting all categories without status filter."""
        # Mock data
        mock_category_1 = MagicMock()
        mock_category_1.model_dump.return_value = {
            "id": "cat-1",
            "name": "Knee Pain & Arthritis",
            "slug": "knee-pain-arthritis",
            "description": "Treatment for knee pain",
            "imageUrl": "https://example.com/knee.jpg",
            "status": "ACTIVE",
            "createdAt": "2024-01-01T00:00:00Z",
            "services": [{"id": "svc-1"}, {"id": "svc-2"}]
        }
        
        mock_category_2 = MagicMock()
        mock_category_2.model_dump.return_value = {
            "id": "cat-2",
            "name": "Back Pain",
            "slug": "back-pain",
            "description": "Treatment for back pain",
            "imageUrl": "https://example.com/back.jpg",
            "status": "ACTIVE",
            "createdAt": "2024-01-02T00:00:00Z",
            "services": [{"id": "svc-3"}]
        }
        
        mock_db.category.find_many = AsyncMock(return_value=[mock_category_1, mock_category_2])
        
        # Execute
        result = await CategoryService.get_all_categories()
        
        # Verify
        assert len(result) == 2
        assert result[0]["name"] == "Knee Pain & Arthritis"
        assert result[0]["serviceCount"] == 2
        assert "services" not in result[0]  # Services list should be removed
        assert result[1]["name"] == "Back Pain"
        assert result[1]["serviceCount"] == 1
        
        # Verify database call
        mock_db.category.find_many.assert_called_once_with(
            where={},
            include={"services": True},
            order={"createdAt": "desc"}
        )
    
    async def test_get_all_categories_with_status_filter(self, mock_db):
        """Test getting categories filtered by status."""
        # Mock data
        mock_category = MagicMock()
        mock_category.model_dump.return_value = {
            "id": "cat-1",
            "name": "Knee Pain & Arthritis",
            "slug": "knee-pain-arthritis",
            "status": "ACTIVE",
            "createdAt": "2024-01-01T00:00:00Z",
            "services": []
        }
        
        mock_db.category.find_many = AsyncMock(return_value=[mock_category])
        
        # Execute
        result = await CategoryService.get_all_categories(status="ACTIVE")
        
        # Verify
        assert len(result) == 1
        assert result[0]["status"] == "ACTIVE"
        assert result[0]["serviceCount"] == 0
        
        # Verify database call with status filter
        mock_db.category.find_many.assert_called_once_with(
            where={"status": "ACTIVE"},
            include={"services": True},
            order={"createdAt": "desc"}
        )
    
    async def test_get_all_categories_empty_result(self, mock_db):
        """Test getting categories when none exist."""
        mock_db.category.find_many = AsyncMock(return_value=[])
        
        # Execute
        result = await CategoryService.get_all_categories()
        
        # Verify
        assert result == []
        assert len(result) == 0
    
    async def test_get_all_categories_service_count_calculation(self, mock_db):
        """Test that service count is correctly calculated."""
        # Mock category with multiple services
        mock_category = MagicMock()
        mock_category.model_dump.return_value = {
            "id": "cat-1",
            "name": "Test Category",
            "slug": "test-category",
            "status": "ACTIVE",
            "createdAt": "2024-01-01T00:00:00Z",
            "services": [
                {"id": "svc-1", "name": "Service 1"},
                {"id": "svc-2", "name": "Service 2"},
                {"id": "svc-3", "name": "Service 3"},
                {"id": "svc-4", "name": "Service 4"},
                {"id": "svc-5", "name": "Service 5"}
            ]
        }
        
        mock_db.category.find_many = AsyncMock(return_value=[mock_category])
        
        # Execute
        result = await CategoryService.get_all_categories()
        
        # Verify
        assert len(result) == 1
        assert result[0]["serviceCount"] == 5
        assert "services" not in result[0]


@pytest.mark.asyncio
class TestGetCategoryById:
    """Test get_category_by_id() method."""
    
    async def test_get_category_by_id_success(self, mock_db):
        """Test successfully retrieving a category by ID."""
        # Mock data
        mock_category = MagicMock()
        mock_category.model_dump.return_value = {
            "id": "cat-1",
            "name": "Knee Pain & Arthritis",
            "slug": "knee-pain-arthritis",
            "description": "Treatment for knee pain",
            "status": "ACTIVE",
            "createdAt": "2024-01-01T00:00:00Z",
            "services": [
                {"id": "svc-1", "name": "Service 1"},
                {"id": "svc-2", "name": "Service 2"}
            ]
        }
        
        mock_db.category.find_unique = AsyncMock(return_value=mock_category)
        
        # Execute
        result = await CategoryService.get_category_by_id("cat-1")
        
        # Verify
        assert result["id"] == "cat-1"
        assert result["name"] == "Knee Pain & Arthritis"
        assert len(result["services"]) == 2
        
        # Verify database call
        mock_db.category.find_unique.assert_called_once_with(
            where={"id": "cat-1"},
            include={"services": True}
        )
    
    async def test_get_category_by_id_not_found(self, mock_db):
        """Test that NotFoundException is raised when category doesn't exist."""
        mock_db.category.find_unique = AsyncMock(return_value=None)
        
        # Execute and verify exception
        with pytest.raises(NotFoundException) as exc_info:
            await CategoryService.get_category_by_id("non-existent-id")
        
        assert "Category with ID 'non-existent-id' not found" in str(exc_info.value)


@pytest.mark.asyncio
class TestGetCategoryServices:
    """Test get_category_services() method."""
    
    async def test_get_category_services_no_filters(self, mock_db):
        """Test getting services for a category without filters."""
        # Mock data
        mock_service_1 = MagicMock()
        mock_service_1.model_dump.return_value = {
            "id": "svc-1",
            "name": "Service 1",
            "basePrice": 100.0,
            "categoryId": "cat-1"
        }
        
        mock_service_2 = MagicMock()
        mock_service_2.model_dump.return_value = {
            "id": "svc-2",
            "name": "Service 2",
            "basePrice": 200.0,
            "categoryId": "cat-1"
        }
        
        mock_db.service.find_many = AsyncMock(return_value=[mock_service_1, mock_service_2])
        
        # Execute
        result = await CategoryService.get_category_services("cat-1", {})
        
        # Verify
        assert len(result) == 2
        assert result[0]["basePrice"] == 100.0
        assert result[1]["basePrice"] == 200.0
        
        # Verify database call
        mock_db.service.find_many.assert_called_once_with(
            where={"categoryId": "cat-1"},
            include={"category": True},
            order={"basePrice": "asc"}
        )
    
    async def test_get_category_services_with_payment_type_filter(self, mock_db):
        """Test filtering services by payment type."""
        mock_service = MagicMock()
        mock_service.model_dump.return_value = {
            "id": "svc-1",
            "name": "Service 1",
            "paymentType": "FULL",
            "categoryId": "cat-1"
        }
        
        mock_db.service.find_many = AsyncMock(return_value=[mock_service])
        
        # Execute
        filters = {"paymentType": "FULL"}
        result = await CategoryService.get_category_services("cat-1", filters)
        
        # Verify
        assert len(result) == 1
        assert result[0]["paymentType"] == "FULL"
        
        # Verify database call includes payment type filter
        mock_db.service.find_many.assert_called_once_with(
            where={"categoryId": "cat-1", "paymentType": "FULL"},
            include={"category": True},
            order={"basePrice": "asc"}
        )
    
    async def test_get_category_services_with_price_range_filter(self, mock_db):
        """Test filtering services by price range."""
        mock_service = MagicMock()
        mock_service.model_dump.return_value = {
            "id": "svc-1",
            "name": "Service 1",
            "basePrice": 150.0,
            "categoryId": "cat-1"
        }
        
        mock_db.service.find_many = AsyncMock(return_value=[mock_service])
        
        # Execute
        filters = {"minPrice": 100.0, "maxPrice": 200.0}
        result = await CategoryService.get_category_services("cat-1", filters)
        
        # Verify
        assert len(result) == 1
        assert result[0]["basePrice"] == 150.0
        
        # Verify database call includes price range filter
        mock_db.service.find_many.assert_called_once_with(
            where={
                "categoryId": "cat-1",
                "basePrice": {"gte": 100.0, "lte": 200.0}
            },
            include={"category": True},
            order={"basePrice": "asc"}
        )
    
    async def test_get_category_services_with_min_price_only(self, mock_db):
        """Test filtering services with only minimum price."""
        mock_db.service.find_many = AsyncMock(return_value=[])
        
        # Execute
        filters = {"minPrice": 100.0}
        await CategoryService.get_category_services("cat-1", filters)
        
        # Verify database call includes only min price
        mock_db.service.find_many.assert_called_once_with(
            where={
                "categoryId": "cat-1",
                "basePrice": {"gte": 100.0}
            },
            include={"category": True},
            order={"basePrice": "asc"}
        )
    
    async def test_get_category_services_with_max_price_only(self, mock_db):
        """Test filtering services with only maximum price."""
        mock_db.service.find_many = AsyncMock(return_value=[])
        
        # Execute
        filters = {"maxPrice": 500.0}
        await CategoryService.get_category_services("cat-1", filters)
        
        # Verify database call includes only max price
        mock_db.service.find_many.assert_called_once_with(
            where={
                "categoryId": "cat-1",
                "basePrice": {"lte": 500.0}
            },
            include={"category": True},
            order={"basePrice": "asc"}
        )
    
    async def test_get_category_services_with_all_filters(self, mock_db):
        """Test filtering services with all filters combined."""
        mock_db.service.find_many = AsyncMock(return_value=[])
        
        # Execute
        filters = {
            "paymentType": "PARTIAL",
            "minPrice": 100.0,
            "maxPrice": 500.0
        }
        await CategoryService.get_category_services("cat-1", filters)
        
        # Verify database call includes all filters
        mock_db.service.find_many.assert_called_once_with(
            where={
                "categoryId": "cat-1",
                "paymentType": "PARTIAL",
                "basePrice": {"gte": 100.0, "lte": 500.0}
            },
            include={"category": True},
            order={"basePrice": "asc"}
        )
    
    async def test_get_category_services_empty_result(self, mock_db):
        """Test getting services when none match the filters."""
        mock_db.service.find_many = AsyncMock(return_value=[])
        
        # Execute
        result = await CategoryService.get_category_services("cat-1", {})
        
        # Verify
        assert result == []
        assert len(result) == 0
