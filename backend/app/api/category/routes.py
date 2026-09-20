"""
Category routes for the API.

This module provides FastAPI endpoints for browsing categories and services,
including category listing, category details, and service filtering within
categories.
"""

from fastapi import APIRouter, Query
from typing import Optional, List
from app.api.category.service import CategoryService
from app.api.category.schemas import (
    CategoryOut,
    CategoryDetail,
    CategoryListResponse,
    ServiceListResponse
)

# Create category router with /categories prefix
category_router = APIRouter(prefix="/categories", tags=["categories"])


@category_router.get("/", response_model=List[CategoryOut])
async def get_categories(
    status: Optional[str] = Query(None, description="Filter by category status (e.g., 'active', 'coming_soon')")
):
    """
    Get all categories with optional status filter.
    
    Retrieves all categories from the database, optionally filtered by status.
    Each category includes a serviceCount field showing the number of services
    in that category. Categories are sorted by creation date (newest first).
    
    Args:
        status: Optional status filter (e.g., "active", "coming_soon")
        
    Returns:
        List[CategoryOut]: List of categories with service counts
        
    Example:
        GET /api/categories
        GET /api/categories?status=active
        
        Response:
        [
            {
                "id": "cm5abc123xyz",
                "name": "Knee Pain & Arthritis",
                "slug": "knee-pain-arthritis",
                "description": "Comprehensive care for knee pain and arthritis",
                "imageUrl": "https://example.com/images/knee-pain.jpg",
                "status": "active",
                "serviceCount": 5,
                "createdAt": "2024-01-01T00:00:00Z"
            }
        ]
        
    Note:
        Implements requirement US-3.1: Browse all categories
    """
    categories = await CategoryService.get_all_categories(status)
    return categories


@category_router.get("/{category_id}", response_model=CategoryDetail)
async def get_category(category_id: str):
    """
    Get single category by ID with all services.
    
    Retrieves a specific category including all its related services.
    This endpoint is used for the category detail view.
    
    Args:
        category_id: UUID of the category to retrieve
        
    Returns:
        CategoryDetail: Category with full service list
        
    Raises:
        NotFoundException: If category with given ID doesn't exist (404)
        
    Example:
        GET /api/categories/cm5abc123xyz
        
        Response:
        {
            "id": "cm5abc123xyz",
            "name": "Knee Pain & Arthritis",
            "slug": "knee-pain-arthritis",
            "description": "Comprehensive care for knee pain and arthritis",
            "imageUrl": "https://example.com/images/knee-pain.jpg",
            "status": "active",
            "services": [
                {
                    "id": "cm5def456uvw",
                    "name": "AI Assessment",
                    "basePrice": 399,
                    ...
                }
            ],
            "createdAt": "2024-01-01T00:00:00Z"
        }
        
    Note:
        Implements requirement US-3.2: View services in a category
    """
    category = await CategoryService.get_category_by_id(category_id)
    return category


@category_router.get("/{category_id}/services", response_model=ServiceListResponse)
async def get_category_services(
    category_id: str,
    paymentType: Optional[str] = Query(None, description="Filter by payment type (FULL or PARTIAL)"),
    minPrice: Optional[float] = Query(None, ge=0, description="Minimum price filter (inclusive)"),
    maxPrice: Optional[float] = Query(None, ge=0, description="Maximum price filter (inclusive)")
):
    """
    Get services for a category with optional filters.
    
    Retrieves all services belonging to a specific category, with optional
    filtering by payment type and price range. Services are sorted by
    base price (lowest first).
    
    Args:
        category_id: UUID of the category
        paymentType: Optional filter by "FULL" or "PARTIAL"
        minPrice: Optional minimum base price (inclusive)
        maxPrice: Optional maximum base price (inclusive)
        
    Returns:
        ServiceListResponse: List of services with total count
        
    Example:
        GET /api/categories/cm5abc123xyz/services
        GET /api/categories/cm5abc123xyz/services?paymentType=FULL
        GET /api/categories/cm5abc123xyz/services?minPrice=100&maxPrice=500
        
        Response:
        {
            "data": [
                {
                    "id": "cm5def456uvw",
                    "categoryId": "cm5abc123xyz",
                    "name": "AI Assessment",
                    "slug": "ai-assessment",
                    "basePrice": 399,
                    "paymentType": "FULL",
                    "category": {
                        "id": "cm5abc123xyz",
                        "name": "Knee Pain & Arthritis",
                        "slug": "knee-pain-arthritis"
                    },
                    ...
                }
            ],
            "total": 1
        }
        
    Note:
        - Implements requirement US-3.2: View services in a category
        - Implements requirement US-3.5: Filter services
        - Services are sorted by basePrice ascending (lowest first)
        - All filters are optional and can be combined
    """
    # Build filters dictionary
    filters = {
        "paymentType": paymentType,
        "minPrice": minPrice,
        "maxPrice": maxPrice
    }
    
    # Get filtered services
    services = await CategoryService.get_category_services(category_id, filters)
    
    # Return with total count
    return {
        "data": services,
        "total": len(services)
    }
