"""
Category Service for business logic.

This module provides the CategoryService class for handling category-related
operations including listing categories, retrieving category details, and
fetching services within a category with filtering capabilities.
"""

from typing import Optional, Dict, Any, List
from app.db.client import db
from app.core.exceptions import NotFoundException


class CategoryService:
    """
    Service for category operations.
    
    This class handles all business logic related to categories including:
    - Listing all categories with optional status filtering
    - Retrieving individual category details
    - Fetching services within a category with price and payment type filters
    - Calculating service counts for categories
    """
    
    @staticmethod
    async def get_all_categories(status: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Get all categories with optional status filter.
        
        Retrieves all categories from the database, optionally filtered by status.
        Each category includes a calculated serviceCount field showing the number
        of services in that category. Categories are sorted by creation date
        (newest first).
        
        Args:
            status: Optional status filter (e.g., "active", "coming_soon")
            
        Returns:
            List[Dict[str, Any]]: List of category dictionaries with serviceCount
            
        Example:
            >>> categories = await CategoryService.get_all_categories("active")
            >>> print(categories[0]["name"])
            'Knee Pain & Arthritis'
            >>> print(categories[0]["serviceCount"])
            5
            
        Note:
            Categories are sorted by createdAt in descending order (newest first)
            as per requirement US-3.1.
        """
        # Build where clause for filtering
        where = {}
        if status:
            where["status"] = status
        
        # Fetch categories with related services
        categories = await db.category.find_many(
            where=where,
            include={"services": True},
            order={"createdAt": "desc"}
        )
        
        # Transform results to include service count
        result = []
        for cat in categories:
            cat_dict = cat.model_dump()
            # Calculate service count from included services
            service_count = len(cat_dict.get("services", []))
            # Remove services list and add count
            cat_dict.pop("services", None)
            cat_dict["serviceCount"] = service_count
            result.append(cat_dict)
        
        return result
    
    @staticmethod
    async def get_category_by_id(category_id: str) -> Dict[str, Any]:
        """
        Get single category by ID with all services.
        
        Retrieves a specific category including all its related services.
        This is used for the category detail view.
        
        Args:
            category_id: UUID of the category to retrieve
            
        Returns:
            Dict[str, Any]: Category dictionary with services list
            
        Raises:
            NotFoundException: If category with given ID doesn't exist
            
        Example:
            >>> category = await CategoryService.get_category_by_id("cm5abc123xyz")
            >>> print(category["name"])
            'Knee Pain & Arthritis'
            >>> print(len(category["services"]))
            5
            
        Note:
            Returns full service objects in the services list for detailed
            category view as per requirement US-3.2.
        """
        # Fetch category with related services
        category = await db.category.find_unique(
            where={"id": category_id},
            include={"services": True}
        )
        
        if not category:
            raise NotFoundException(f"Category with ID '{category_id}' not found")
        
        return category.model_dump()
    
    @staticmethod
    async def get_category_services(
        category_id: str,
        filters: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """
        Get services for a category with filters.
        
        Retrieves all services belonging to a specific category, with optional
        filtering by payment type and price range. Services are sorted by
        base price (lowest first) as per requirement US-3.2.
        
        Args:
            category_id: UUID of the category
            filters: Dictionary containing optional filters:
                - paymentType: Filter by "FULL" or "PARTIAL"
                - minPrice: Minimum base price (inclusive)
                - maxPrice: Maximum base price (inclusive)
                
        Returns:
            List[Dict[str, Any]]: List of service dictionaries with category info
            
        Example:
            >>> filters = {"paymentType": "FULL", "minPrice": 100, "maxPrice": 500}
            >>> services = await CategoryService.get_category_services("cm5abc123xyz", filters)
            >>> print(services[0]["name"])
            'AI Assessment'
            >>> print(services[0]["basePrice"])
            399
            
        Note:
            - Services include related category information
            - Results are sorted by basePrice ascending (lowest first)
            - All filters are optional and can be combined
        """
        # Build where clause with category filter
        where: Dict[str, Any] = {"categoryId": category_id}
        
        # Add payment type filter if provided
        if filters.get("paymentType"):
            where["paymentType"] = filters["paymentType"]
        
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
