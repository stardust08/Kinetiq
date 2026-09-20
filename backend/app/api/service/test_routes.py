"""
Integration tests for service routes.

Tests the service API endpoints including:
- GET /services with filters
- GET /services/{id}
- GET /services/slug/{slug}
- Error handling and validation
"""

import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
from app.main import app
from app.core.exceptions import NotFoundException

client = TestClient(app)


@pytest.fixture
def sample_service():
    """Sample service data."""
    return {
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


class TestGetServices:
    """Tests for GET /api/services endpoint."""
    
    @patch("app.api.service.routes.ServiceService.get_all_services")
    def test_get_services_no_filters(self, mock_get_all, sample_service):
        """Test getting all services without filters."""
        mock_get_all.return_value = [sample_service]
        
        response = client.get("/api/services")
        
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["name"] == "AI Assessment"
        mock_get_all.assert_called_once()
    
    @patch("app.api.service.routes.ServiceService.get_all_services")
    def test_get_services_with_category_filter(self, mock_get_all, sample_service):
        """Test filtering services by category."""
        mock_get_all.return_value = [sample_service]
        
        response = client.get("/api/services?categoryId=category-1")
        
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["categoryId"] == "category-1"
    
    @patch("app.api.service.routes.ServiceService.get_all_services")
    def test_get_services_with_search(self, mock_get_all, sample_service):
        """Test searching services by name."""
        mock_get_all.return_value = [sample_service]
        
        response = client.get("/api/services?search=assessment")
        
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert "assessment" in data[0]["name"].lower()
    
    @patch("app.api.service.routes.ServiceService.get_all_services")
    def test_get_services_with_payment_type(self, mock_get_all, sample_service):
        """Test filtering services by payment type."""
        mock_get_all.return_value = [sample_service]
        
        response = client.get("/api/services?paymentType=FULL")
        
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["paymentType"] == "FULL"
    
    @patch("app.api.service.routes.ServiceService.get_all_services")
    def test_get_services_with_delivery_mode(self, mock_get_all, sample_service):
        """Test filtering services by delivery mode."""
        mock_get_all.return_value = [sample_service]
        
        response = client.get("/api/services?deliveryMode=Online")
        
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["deliveryMode"] == "Online"
    
    @patch("app.api.service.routes.ServiceService.get_all_services")
    def test_get_services_with_price_range(self, mock_get_all, sample_service):
        """Test filtering services by price range."""
        mock_get_all.return_value = [sample_service]
        
        response = client.get("/api/services?minPrice=100&maxPrice=500")
        
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert 100 <= data[0]["basePrice"] <= 500
    
    @patch("app.api.service.routes.ServiceService.get_all_services")
    def test_get_services_with_multiple_filters(self, mock_get_all, sample_service):
        """Test combining multiple filters."""
        mock_get_all.return_value = [sample_service]
        
        response = client.get(
            "/api/services?categoryId=category-1&search=assessment&paymentType=FULL&deliveryMode=Online&minPrice=100&maxPrice=500"
        )
        
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1


class TestGetServiceById:
    """Tests for GET /api/services/{id} endpoint."""
    
    @patch("app.api.service.routes.ServiceService.get_service_by_id")
    def test_get_service_by_id_success(self, mock_get_by_id, sample_service):
        """Test getting service by ID successfully."""
        mock_get_by_id.return_value = sample_service
        
        response = client.get("/api/services/service-1")
        
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == "service-1"
        assert data["name"] == "AI Assessment"
        assert data["category"]["name"] == "Knee Pain & Arthritis"
    
    @patch("app.api.service.routes.ServiceService.get_service_by_id")
    def test_get_service_by_id_not_found(self, mock_get_by_id):
        """Test getting service by ID when not found."""
        mock_get_by_id.side_effect = NotFoundException("Service with ID 'nonexistent' not found")
        
        response = client.get("/api/services/nonexistent")
        
        assert response.status_code == 404
        assert "not found" in response.json()["error"].lower()


class TestGetServiceBySlug:
    """Tests for GET /api/services/slug/{slug} endpoint."""
    
    @patch("app.api.service.routes.ServiceService.get_service_by_slug")
    def test_get_service_by_slug_success(self, mock_get_by_slug, sample_service):
        """Test getting service by slug successfully."""
        mock_get_by_slug.return_value = sample_service
        
        response = client.get("/api/services/slug/ai-assessment")
        
        assert response.status_code == 200
        data = response.json()
        assert data["slug"] == "ai-assessment"
        assert data["name"] == "AI Assessment"
        assert data["category"]["name"] == "Knee Pain & Arthritis"
    
    @patch("app.api.service.routes.ServiceService.get_service_by_slug")
    def test_get_service_by_slug_not_found(self, mock_get_by_slug):
        """Test getting service by slug when not found."""
        mock_get_by_slug.side_effect = NotFoundException("Service with slug 'nonexistent' not found")
        
        response = client.get("/api/services/slug/nonexistent")
        
        assert response.status_code == 404
        assert "not found" in response.json()["error"].lower()
