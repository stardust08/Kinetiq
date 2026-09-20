"""
Service routes for the API.

This module provides FastAPI endpoints for browsing and searching services,
including service listing with filters, service details by ID, and service
details by slug.
"""

from fastapi import APIRouter, Query
from typing import Optional, List
from app.api.service.service import ServiceService
from app.api.service.schemas import ServiceOut, ServiceListResponse

# Create service router with /services prefix
service_router = APIRouter(prefix="/services", tags=["services"])


@service_router.get("/", response_model=List[ServiceOut])
async def get_services(
    categoryId: Optional[str] = Query(None, description="Filter by category ID"),
    search: Optional[str] = Query(None, description="Search by service name (case-insensitive)"),
    paymentType: Optional[str] = Query(None, description="Filter by payment type (FULL or PARTIAL)"),
    deliveryMode: Optional[str] = Query(None, description="Filter by delivery mode (Online or In-person)"),
    minPrice: Optional[float] = Query(None, ge=0, description="Minimum price filter (inclusive)"),
    maxPrice: Optional[float] = Query(None, ge=0, description="Maximum price filter (inclusive)")
):
    """
    Get all services with optional filters.
    
    Retrieves all services from the database with optional filtering by
    category, search term, payment type, delivery mode, and price range.
    Services are sorted by base price (lowest first) and include related
    category information.
    
    Args:
        categoryId: Optional filter by category UUID
        search: Optional search by service name (case-insensitive)
        paymentType: Optional filter by "FULL" or "PARTIAL"
        deliveryMode: Optional filter by "Online" or "In-person"
        minPrice: Optional minimum base price (inclusive)
        maxPrice: Optional maximum base price (inclusive)
        
    Returns:
        List[ServiceOut]: List of services with category information
        
    Example:
        GET /api/services
        GET /api/services?search=assessment
        GET /api/services?categoryId=cm5abc123xyz&paymentType=FULL
        GET /api/services?minPrice=100&maxPrice=500
        
        Response:
        [
            {
                "id": "cm5def456uvw",
                "categoryId": "cm5abc123xyz",
                "name": "AI Assessment",
                "slug": "ai-assessment",
                "description": "AI-based movement analysis",
                "basePrice": 399,
                "salePrice": null,
                "discount": null,
                "paymentType": "FULL",
                "advancePercent": null,
                "advanceAmount": null,
                "duration": "One-time assessment",
                "serviceType": "Assessment",
                "features": ["AI-based movement analysis", "Detailed report"],
                "reviewCount": 150,
                "deliveryMode": "Online",
                "sessionCount": null,
                "category": {
                    "id": "cm5abc123xyz",
                    "name": "Knee Pain & Arthritis",
                    "slug": "knee-pain-arthritis"
                },
                "createdAt": "2024-01-01T00:00:00Z"
            }
        ]
        
    Note:
        - Implements requirement US-3.4: Search for services
        - Implements requirement US-3.5: Filter services
        - Services are sorted by basePrice ascending (lowest first)
        - All filters are optional and can be combined
    """
    # Build filters dictionary
    filters = {
        "categoryId": categoryId,
        "search": search,
        "paymentType": paymentType,
        "deliveryMode": deliveryMode,
        "minPrice": minPrice,
        "maxPrice": maxPrice
    }
    
    # Get filtered services
    services = await ServiceService.get_all_services(filters)
    
    return services


@service_router.get("/{service_id}", response_model=ServiceOut)
async def get_service(service_id: str):
    """
    Get single service by ID.
    
    Retrieves a specific service including its related category information.
    This endpoint is used for the service detail view.
    
    Args:
        service_id: UUID of the service to retrieve
        
    Returns:
        ServiceOut: Service with category information
        
    Raises:
        NotFoundException: If service with given ID doesn't exist (404)
        
    Example:
        GET /api/services/cm5def456uvw
        
        Response:
        {
            "id": "cm5def456uvw",
            "categoryId": "cm5abc123xyz",
            "name": "AI Assessment",
            "slug": "ai-assessment",
            "description": "AI-based movement analysis",
            "basePrice": 399,
            "salePrice": null,
            "discount": null,
            "paymentType": "FULL",
            "advancePercent": null,
            "advanceAmount": null,
            "duration": "One-time assessment",
            "serviceType": "Assessment",
            "features": ["AI-based movement analysis", "Detailed report"],
            "reviewCount": 150,
            "deliveryMode": "Online",
            "sessionCount": null,
            "category": {
                "id": "cm5abc123xyz",
                "name": "Knee Pain & Arthritis",
                "slug": "knee-pain-arthritis"
            },
            "createdAt": "2024-01-01T00:00:00Z"
        }
        
    Note:
        Implements requirement US-3.3: View service details
    """
    service = await ServiceService.get_service_by_id(service_id)
    return service


@service_router.get("/slug/{slug}", response_model=ServiceOut)
async def get_service_by_slug(slug: str):
    """
    Get single service by slug.
    
    Retrieves a specific service by its URL-friendly slug identifier,
    including related category information. This endpoint is used for
    SEO-friendly URLs in the service detail view.
    
    Args:
        slug: URL-friendly slug of the service (e.g., "ai-assessment")
        
    Returns:
        ServiceOut: Service with category information
        
    Raises:
        NotFoundException: If service with given slug doesn't exist (404)
        
    Example:
        GET /api/services/slug/ai-assessment
        
        Response:
        {
            "id": "cm5def456uvw",
            "categoryId": "cm5abc123xyz",
            "name": "AI Assessment",
            "slug": "ai-assessment",
            "description": "AI-based movement analysis",
            "basePrice": 399,
            "salePrice": null,
            "discount": null,
            "paymentType": "FULL",
            "advancePercent": null,
            "advanceAmount": null,
            "duration": "One-time assessment",
            "serviceType": "Assessment",
            "features": ["AI-based movement analysis", "Detailed report"],
            "reviewCount": 150,
            "deliveryMode": "Online",
            "sessionCount": null,
            "category": {
                "id": "cm5abc123xyz",
                "name": "Knee Pain & Arthritis",
                "slug": "knee-pain-arthritis"
            },
            "createdAt": "2024-01-01T00:00:00Z"
        }
        
    Note:
        - Implements requirement US-3.3: View service details
        - Supports SEO-friendly URLs as per requirement TR-3.1
    """
    service = await ServiceService.get_service_by_slug(slug)
    return service
