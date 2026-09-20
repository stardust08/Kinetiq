"""
Integration tests for Category routes.

This module tests the category API endpoints including:
- GET /categories
- GET /categories/{id}
- GET /categories/{category_id}/services with filters
"""

import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.db.client import db


@pytest.fixture
async def client():
    """Create test client."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test", follow_redirects=True) as ac:
        yield ac


@pytest.fixture(autouse=True)
async def setup_db():
    """Setup and teardown database connection."""
    await db.connect()
    yield
    await db.disconnect()


@pytest.mark.asyncio
class TestGetCategoriesRoute:
    """Test GET /categories endpoint."""
    
    async def test_get_all_categories(self, client):
        """Test getting all categories without filters."""
        response = await client.get("/api/categories")
        
        # Verify response
        assert response.status_code == 200
        categories = response.json()
        assert isinstance(categories, list)
        
        # Verify each category has required fields
        for category in categories:
            assert "id" in category
            assert "name" in category
            assert "slug" in category
            assert "serviceCount" in category
            assert "createdAt" in category
            assert isinstance(category["serviceCount"], int)
    
    async def test_get_categories_with_status_filter(self, client):
        """Test filtering categories by status."""
        response = await client.get("/api/categories", params={"status": "active"})
        
        # Verify response
        assert response.status_code == 200
        categories = response.json()
        assert isinstance(categories, list)
        
        # Verify all categories have active status
        for category in categories:
            assert category.get("status") == "active"
    
    async def test_get_categories_sorted_by_created_at(self, client):
        """Test that categories are sorted by creation date (newest first)."""
        response = await client.get("/api/categories")
        
        # Verify response
        assert response.status_code == 200
        categories = response.json()
        
        # Verify sorting if there are multiple categories
        if len(categories) > 1:
            from datetime import datetime
            dates = [datetime.fromisoformat(cat["createdAt"].replace("Z", "+00:00")) for cat in categories]
            # Check that dates are in descending order (newest first)
            for i in range(len(dates) - 1):
                assert dates[i] >= dates[i + 1], "Categories should be sorted by createdAt descending"


@pytest.mark.asyncio
class TestGetCategoryByIdRoute:
    """Test GET /categories/{id} endpoint."""
    
    async def test_get_category_by_id(self, client):
        """Test getting a single category by ID."""
        # First, get a category to use for testing
        categories_response = await client.get("/api/categories")
        assert categories_response.status_code == 200
        categories = categories_response.json()
        
        if len(categories) == 0:
            pytest.skip("No categories in database")
        
        category_id = categories[0]["id"]
        
        # Get the specific category
        response = await client.get(f"/api/categories/{category_id}")
        
        # Verify response
        assert response.status_code == 200
        category = response.json()
        assert category["id"] == category_id
        assert "name" in category
        assert "slug" in category
        assert "services" in category
        assert isinstance(category["services"], list)
    
    async def test_get_category_by_id_not_found(self, client):
        """Test getting a category with non-existent ID."""
        fake_id = "00000000-0000-0000-0000-000000000000"
        response = await client.get(f"/api/categories/{fake_id}")
        
        # Verify 404 response
        assert response.status_code == 404
        error = response.json()
        assert "error" in error
    
    async def test_get_category_includes_services(self, client):
        """Test that category detail includes services list."""
        # Get a category
        categories_response = await client.get("/api/categories")
        assert categories_response.status_code == 200
        categories = categories_response.json()
        
        if len(categories) == 0:
            pytest.skip("No categories in database")
        
        # Find a category with services
        category_with_services = None
        for cat in categories:
            if cat["serviceCount"] > 0:
                category_with_services = cat
                break
        
        if not category_with_services:
            pytest.skip("No categories with services in database")
        
        # Get the category detail
        response = await client.get(f"/api/categories/{category_with_services['id']}")
        
        # Verify response
        assert response.status_code == 200
        category = response.json()
        assert len(category["services"]) > 0
        
        # Verify service structure
        service = category["services"][0]
        assert "id" in service
        assert "name" in service
        assert "basePrice" in service


@pytest.mark.asyncio
class TestGetCategoryServicesRoute:
    """Test GET /categories/{category_id}/services endpoint."""
    
    async def test_get_category_services_no_filters(self, client):
        """Test getting services for a category without filters."""
        # First, get a category to use for testing
        categories_response = await client.get("/api/categories")
        assert categories_response.status_code == 200
        categories = categories_response.json()
        
        if len(categories) == 0:
            pytest.skip("No categories in database")
        
        category_id = categories[0]["id"]
        
        # Get services for the category
        response = await client.get(f"/api/categories/{category_id}/services")
        
        # Verify response
        assert response.status_code == 200
        data = response.json()
        assert "data" in data
        assert "total" in data
        assert isinstance(data["data"], list)
        assert isinstance(data["total"], int)
        assert data["total"] == len(data["data"])
        
        # Verify services are sorted by basePrice (ascending)
        if len(data["data"]) > 1:
            prices = [svc["basePrice"] for svc in data["data"]]
            assert prices == sorted(prices), "Services should be sorted by basePrice ascending"
    
    async def test_get_category_services_with_payment_type_filter(self, client):
        """Test filtering services by payment type."""
        # Get a category
        categories_response = await client.get("/api/categories")
        assert categories_response.status_code == 200
        categories = categories_response.json()
        
        if len(categories) == 0:
            pytest.skip("No categories in database")
        
        category_id = categories[0]["id"]
        
        # Get services with FULL payment type filter
        response = await client.get(
            f"/api/categories/{category_id}/services",
            params={"paymentType": "FULL"}
        )
        
        # Verify response
        assert response.status_code == 200
        data = response.json()
        assert "data" in data
        assert "total" in data
        
        # Verify all services have FULL payment type
        for service in data["data"]:
            assert service["paymentType"] == "FULL", f"Service {service['name']} has wrong payment type"
    
    async def test_get_category_services_with_price_range_filter(self, client):
        """Test filtering services by price range."""
        # Get a category
        categories_response = await client.get("/api/categories")
        assert categories_response.status_code == 200
        categories = categories_response.json()
        
        if len(categories) == 0:
            pytest.skip("No categories in database")
        
        category_id = categories[0]["id"]
        
        # Get services with price range filter
        min_price = 100.0
        max_price = 500.0
        response = await client.get(
            f"/api/categories/{category_id}/services",
            params={"minPrice": min_price, "maxPrice": max_price}
        )
        
        # Verify response
        assert response.status_code == 200
        data = response.json()
        assert "data" in data
        assert "total" in data
        
        # Verify all services are within price range
        for service in data["data"]:
            base_price = service["basePrice"]
            assert min_price <= base_price <= max_price, \
                f"Service {service['name']} price {base_price} not in range [{min_price}, {max_price}]"
    
    async def test_get_category_services_with_min_price_only(self, client):
        """Test filtering services with only minimum price."""
        # Get a category
        categories_response = await client.get("/api/categories")
        assert categories_response.status_code == 200
        categories = categories_response.json()
        
        if len(categories) == 0:
            pytest.skip("No categories in database")
        
        category_id = categories[0]["id"]
        
        # Get services with min price filter
        min_price = 200.0
        response = await client.get(
            f"/api/categories/{category_id}/services",
            params={"minPrice": min_price}
        )
        
        # Verify response
        assert response.status_code == 200
        data = response.json()
        
        # Verify all services meet minimum price
        for service in data["data"]:
            assert service["basePrice"] >= min_price, \
                f"Service {service['name']} price {service['basePrice']} below minimum {min_price}"
    
    async def test_get_category_services_with_max_price_only(self, client):
        """Test filtering services with only maximum price."""
        # Get a category
        categories_response = await client.get("/api/categories")
        assert categories_response.status_code == 200
        categories = categories_response.json()
        
        if len(categories) == 0:
            pytest.skip("No categories in database")
        
        category_id = categories[0]["id"]
        
        # Get services with max price filter
        max_price = 1000.0
        response = await client.get(
            f"/api/categories/{category_id}/services",
            params={"maxPrice": max_price}
        )
        
        # Verify response
        assert response.status_code == 200
        data = response.json()
        
        # Verify all services meet maximum price
        for service in data["data"]:
            assert service["basePrice"] <= max_price, \
                f"Service {service['name']} price {service['basePrice']} above maximum {max_price}"
    
    async def test_get_category_services_with_all_filters(self, client):
        """Test filtering services with all filters combined."""
        # Get a category
        categories_response = await client.get("/api/categories")
        assert categories_response.status_code == 200
        categories = categories_response.json()
        
        if len(categories) == 0:
            pytest.skip("No categories in database")
        
        category_id = categories[0]["id"]
        
        # Get services with all filters
        response = await client.get(
            f"/api/categories/{category_id}/services",
            params={
                "paymentType": "FULL",
                "minPrice": 100.0,
                "maxPrice": 1000.0
            }
        )
        
        # Verify response
        assert response.status_code == 200
        data = response.json()
        
        # Verify all services meet all criteria
        for service in data["data"]:
            assert service["paymentType"] == "FULL"
            assert 100.0 <= service["basePrice"] <= 1000.0
    
    async def test_get_category_services_includes_category_info(self, client):
        """Test that services include related category information."""
        # Get a category
        categories_response = await client.get("/api/categories")
        assert categories_response.status_code == 200
        categories = categories_response.json()
        
        if len(categories) == 0:
            pytest.skip("No categories in database")
        
        category_id = categories[0]["id"]
        category_name = categories[0]["name"]
        
        # Get services for the category
        response = await client.get(f"/api/categories/{category_id}/services")
        
        # Verify response
        assert response.status_code == 200
        data = response.json()
        
        # Verify each service includes category information
        for service in data["data"]:
            assert "category" in service, "Service should include category information"
            assert service["category"]["id"] == category_id
            assert service["category"]["name"] == category_name
    
    async def test_get_category_services_empty_result(self, client):
        """Test getting services with filters that match nothing."""
        # Get a category
        categories_response = await client.get("/api/categories")
        assert categories_response.status_code == 200
        categories = categories_response.json()
        
        if len(categories) == 0:
            pytest.skip("No categories in database")
        
        category_id = categories[0]["id"]
        
        # Use filters that likely won't match anything
        response = await client.get(
            f"/api/categories/{category_id}/services",
            params={"minPrice": 999999.0}
        )
        
        # Verify response
        assert response.status_code == 200
        data = response.json()
        assert data["data"] == []
        assert data["total"] == 0
