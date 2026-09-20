import { useCallback, useState } from 'react';
import * as categoriesApi from '../api/categories';
import type { Category, Service } from '../types';
import type { CategoryDetail, GetCategoryServicesParams } from '../api/categories';

/**
 * Custom hook for category browsing operations
 * Provides category listing, details, and service filtering
 */
export const useCategories = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [currentCategory, setCurrentCategory] = useState<CategoryDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  /**
   * Fetch all categories with optional status filter
   * @param status - Optional status filter (e.g., 'active', 'coming_soon')
   */
  const fetchCategories = useCallback(async (status?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await categoriesApi.getCategories(status);
      setCategories(data);
      return data;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to fetch categories');
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Fetch single category by ID with all services
   * @param categoryId - UUID of the category
   */
  const fetchCategoryById = useCallback(async (categoryId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await categoriesApi.getCategoryById(categoryId);
      setCurrentCategory(data);
      return data;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to fetch category');
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Fetch services for a category with optional filters
   * @param categoryId - UUID of the category
   * @param params - Optional filters (paymentType, minPrice, maxPrice)
   */
  const fetchCategoryServices = useCallback(async (
    categoryId: string,
    params?: GetCategoryServicesParams
  ) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await categoriesApi.getCategoryServices(categoryId, params);
      return data;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to fetch services');
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Clear current category
   */
  const clearCurrentCategory = useCallback(() => {
    setCurrentCategory(null);
  }, []);

  return {
    // State
    categories,
    currentCategory,
    isLoading,
    error,
    
    // Actions
    fetchCategories,
    fetchCategoryById,
    fetchCategoryServices,
    clearCurrentCategory,
  };
};
