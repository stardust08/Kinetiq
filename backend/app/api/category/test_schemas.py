"""
Unit tests for category schemas.

Tests validation logic for category schemas including slug format,
price range validation, and payment type validation.
"""

import pytest
from datetime import datetime
from pydantic import ValidationError
from app.api.category.schemas import (
    CategoryBase,
    CategoryOut,
    CategoryDetail,
    CategoryFilters,
    CategoryServiceFilters,
    CategoryListResponse,
    ServiceListResponse
)


class TestCategoryBase:
    """Test CategoryBase schema validation."""
    
    def test_valid_category_base(self):
        """Test creating a valid CategoryBase instance."""
        category = CategoryBase(
            name="Knee Pain & Arthritis",
            slug="knee-pain-arthritis",
            description="Comprehensive care",
            imageUrl="https://example.com/image.jpg",
            status="active"
        )
        assert category.name == "Knee Pain & Arthritis"
        assert category.slug == "knee-pain-arthritis"
    
    def test_valid_slug_formats(self):
        """Test various valid slug formats."""
        valid_slugs = [
            "knee-pain",
            "knee-pain-arthritis",
            "back-pain-123",
            "test",
            "a-b-c-d-e"
        ]
        for slug in valid_slugs:
            category = CategoryBase(name="Test", slug=slug)
            assert category.slug == slug
    
    def test_invalid_slug_uppercase(self):
        """Test that uppercase letters in slug are rejected."""
        with pytest.raises(ValidationError) as exc_info:
            CategoryBase(name="Test", slug="Knee-Pain")
        assert "Slug must be lowercase" in str(exc_info.value)
    
    def test_invalid_slug_spaces(self):
        """Test that spaces in slug are rejected."""
        with pytest.raises(ValidationError) as exc_info:
            CategoryBase(name="Test", slug="knee pain")
        assert "Slug must be lowercase" in str(exc_info.value)
    
    def test_invalid_slug_special_chars(self):
        """Test that special characters in slug are rejected."""
        with pytest.raises(ValidationError) as exc_info:
            CategoryBase(name="Test", slug="knee_pain")
        assert "Slug must be lowercase" in str(exc_info.value)
    
    def test_optional_fields(self):
        """Test that optional fields can be None."""
        category = CategoryBase(name="Test", slug="test")
        assert category.description is None
        assert category.imageUrl is None
        assert category.status is None


class TestCategoryOut:
    """Test CategoryOut schema."""
    
    def test_valid_category_out(self):
        """Test creating a valid CategoryOut instance."""
        category = CategoryOut(
            id="cm5abc123xyz",
            name="Knee Pain",
            slug="knee-pain",
            serviceCount=5,
            createdAt=datetime.now()
        )
        assert category.id == "cm5abc123xyz"
        assert category.serviceCount == 5
        assert isinstance(category.createdAt, datetime)


class TestCategoryDetail:
    """Test CategoryDetail schema."""
    
    def test_valid_category_detail(self):
        """Test creating a valid CategoryDetail instance."""
        category = CategoryDetail(
            id="cm5abc123xyz",
            name="Knee Pain",
            slug="knee-pain",
            services=[],
            createdAt=datetime.now()
        )
        assert category.id == "cm5abc123xyz"
        assert category.services == []
    
    def test_category_detail_with_services(self):
        """Test CategoryDetail with services data."""
        services = [
            {"id": "svc1", "name": "Service 1"},
            {"id": "svc2", "name": "Service 2"}
        ]
        category = CategoryDetail(
            id="cm5abc123xyz",
            name="Knee Pain",
            slug="knee-pain",
            services=services,
            createdAt=datetime.now()
        )
        assert len(category.services) == 2


class TestCategoryServiceFilters:
    """Test CategoryServiceFilters schema validation."""
    
    def test_valid_filters(self):
        """Test creating valid service filters."""
        filters = CategoryServiceFilters(
            paymentType="FULL",
            minPrice=100.0,
            maxPrice=500.0
        )
        assert filters.paymentType == "FULL"
        assert filters.minPrice == 100.0
        assert filters.maxPrice == 500.0
    
    def test_valid_payment_types(self):
        """Test valid payment type values."""
        for payment_type in ["FULL", "PARTIAL"]:
            filters = CategoryServiceFilters(paymentType=payment_type)
            assert filters.paymentType == payment_type
    
    def test_invalid_payment_type(self):
        """Test that invalid payment type is rejected."""
        with pytest.raises(ValidationError) as exc_info:
            CategoryServiceFilters(paymentType="INVALID")
        assert "paymentType must be either" in str(exc_info.value)
    
    def test_negative_price_rejected(self):
        """Test that negative prices are rejected."""
        with pytest.raises(ValidationError):
            CategoryServiceFilters(minPrice=-100)
    
    def test_max_less_than_min_rejected(self):
        """Test that maxPrice < minPrice is rejected."""
        with pytest.raises(ValidationError) as exc_info:
            CategoryServiceFilters(minPrice=500, maxPrice=100)
        assert "maxPrice must be greater than or equal to minPrice" in str(exc_info.value)
    
    def test_equal_min_max_allowed(self):
        """Test that equal min and max prices are allowed."""
        filters = CategoryServiceFilters(minPrice=100, maxPrice=100)
        assert filters.minPrice == 100
        assert filters.maxPrice == 100
    
    def test_optional_filters(self):
        """Test that all filters are optional."""
        filters = CategoryServiceFilters()
        assert filters.paymentType is None
        assert filters.minPrice is None
        assert filters.maxPrice is None


class TestResponseWrappers:
    """Test response wrapper schemas."""
    
    def test_category_list_response(self):
        """Test CategoryListResponse schema."""
        response = CategoryListResponse(
            data=[],
            total=0
        )
        assert response.data == []
        assert response.total == 0
    
    def test_service_list_response(self):
        """Test ServiceListResponse schema."""
        response = ServiceListResponse(
            data=[],
            total=0
        )
        assert response.data == []
        assert response.total == 0
