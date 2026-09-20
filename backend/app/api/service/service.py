"""
Service Service for business logic.

This module provides the ServiceService class for handling service-related
operations including listing services with filters, searching, and retrieving
individual service details by ID or slug.
"""

from typing import Optional, Dict, Any, List
from app.db.client import db
from app.core.exceptions import NotFoundException


class ServiceService:
    """
    Service for service operations.
    
    This class handles all business logic related to services including:
    - Listing all services with optional filtering and search
    - Retrieving individual service details by ID
    - Retrieving individual service details by slug
    - Filtering by category, payment type, delivery mode, and price range
    - Case-insensitive search by service name
    """
    
    @staticmethod
    async def get_all_services(filters: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Get all services with optional filters.
        
        Retrieves all services from the database with optional filtering by
        category, search term, payment type, delivery mode, and price range.
        Services are sorted by base price (lowest first) and include related
        category information.
        
        Args:
            filters: Dictionary containing optional filters:
                - categoryId: Filter by category UUID
                - search: Search by service name (case-insensitive)
                - paymentType: Filter by "FULL" or "PARTIAL"
                - deliveryMode: Filter by "Online" or "In-person"
                - minPrice: Minimum base price (inclusive)
                - maxPrice: Maximum base price (inclusive)
                
        Returns:
            List[Dict[str, Any]]: List of service dictionaries with category info
            
        Example:
            >>> filters = {"search": "assessment", "paymentType": "FULL"}
            >>> services = await ServiceService.get_all_services(filters)
            >>> print(services[0]["name"])
            'AI Assessment'
            >>> print(services[0]["category"]["name"])
            'Knee Pain & Arthritis'
            
        Note:
            - Implements requirement US-3.4: Search for services
            - Implements requirement US-3.5: Filter services
            - Services are sorted by basePrice ascending (lowest first)
            - All filters are optional and can be combined
        """
        # Build where clause for filtering
        where: Dict[str, Any] = {}
        
        # Add category filter if provided
        if filters.get("categoryId"):
            where["categoryId"] = filters["categoryId"]
        
        # Add search filter if provided (case-insensitive)
        if filters.get("search"):
            where["name"] = {
                "contains": filters["search"],
                "mode": "insensitive"
            }
        
        # Add payment type filter if provided
        if filters.get("paymentType"):
            where["paymentType"] = filters["paymentType"]
        
        # Add delivery mode filter if provided
        if filters.get("deliveryMode"):
            where["deliveryMode"] = filters["deliveryMode"]
        
        # Add price range filters if provided
        if filters.get("minPrice") is not None or filters.get("maxPrice") is not None:
            where["basePrice"] = {}
            
            if filters.get("minPrice") is not None:
                where["basePrice"]["gte"] = filters["minPrice"]
            
            if filters.get("maxPrice") is not None:
                where["basePrice"]["lte"] = filters["maxPrice"]
        
        # Fetch services with related category
        services = await db.service.find_many(
            where=where,
            include={"category": True},
            order={"basePrice": "asc"}
        )
        
        # Convert to dictionaries
        return [service.model_dump() for service in services]
    
    @staticmethod
    async def get_service_by_id(service_id: str) -> Dict[str, Any]:
        """
        Get single service by ID.
        
        Retrieves a specific service including its related category information.
        This is used for the service detail view.
        
        Args:
            service_id: UUID of the service to retrieve
            
        Returns:
            Dict[str, Any]: Service dictionary with category info
            
        Raises:
            NotFoundException: If service with given ID doesn't exist
            
        Example:
            >>> service = await ServiceService.get_service_by_id("cm5def456uvw")
            >>> print(service["name"])
            'AI Assessment'
            >>> print(service["category"]["name"])
            'Knee Pain & Arthritis'
            
        Note:
            Implements requirement US-3.3: View service details
        """
        # Fetch service with related category
        service = await db.service.find_unique(
            where={"id": service_id},
            include={"category": True}
        )
        
        if not service:
            raise NotFoundException(f"Service with ID '{service_id}' not found")
        
        return service.model_dump()
    
    @staticmethod
    async def get_service_by_slug(slug: str) -> Dict[str, Any]:
        """
        Get single service by slug.
        
        Retrieves a specific service by its URL-friendly slug identifier,
        including related category information. This is used for SEO-friendly
        URLs in the service detail view.
        
        Args:
            slug: URL-friendly slug of the service (e.g., "ai-assessment")
            
        Returns:
            Dict[str, Any]: Service dictionary with category info
            
        Raises:
            NotFoundException: If service with given slug doesn't exist
            
        Example:
            >>> service = await ServiceService.get_service_by_slug("ai-assessment")
            >>> print(service["name"])
            'AI Assessment'
            >>> print(service["basePrice"])
            399
            
        Note:
            Implements requirement US-3.3: View service details
            Supports SEO-friendly URLs as per requirement TR-3.1
        """
        # Fetch service with related category
        service = await db.service.find_unique(
            where={"slug": slug},
            include={"category": True}
        )
        
        if not service:
            raise NotFoundException(f"Service with slug '{slug}' not found")
        
        return service.model_dump()
