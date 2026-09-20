import { apiClient } from './client';
import { Category, Service } from '../types';

/**
 * Category API functions for browsing categories and services
 */

export interface CategoryDetail extends Category {
  services: Service[];
}

export interface ServiceListResponse {
  data: Service[];
  total: number;
}

export interface GetCategoryServicesParams {
  paymentType?: 'FULL' | 'PARTIAL';
  minPrice?: number;
  maxPrice?: number;
}

/**
 * Get all categories with optional status filter
 * @param status - Optional status filter (e.g., 'active', 'coming_soon')
 * @returns Promise with list of categories
 */
export const getCategories = async (status?: string): Promise<Category[]> => {
  const params = status ? { status } : {};
  const response = await apiClient.get<Category[]>('/api/categories', { params });
  return response.data;
};

/**
 * Get single category by ID with all services
 * @param categoryId - UUID of the category
 * @returns Promise with category details including services
 */
export const getCategoryById = async (categoryId: string): Promise<CategoryDetail> => {
  const response = await apiClient.get<CategoryDetail>(`/api/categories/${categoryId}`);
  return response.data;
};

/**
 * Get services for a category with optional filters
 * @param categoryId - UUID of the category
 * @param params - Optional filters (paymentType, minPrice, maxPrice)
 * @returns Promise with filtered services and total count
 */
export const getCategoryServices = async (
  categoryId: string,
  params?: GetCategoryServicesParams
): Promise<ServiceListResponse> => {
  const response = await apiClient.get<ServiceListResponse>(
    `/api/categories/${categoryId}/services`,
    { params }
  );
  return response.data;
};

/**
 * Category API object for convenient access to all category operations
 */
export const categoryAPI = {
  getAll: getCategories,
  getById: getCategoryById,
  getServices: getCategoryServices,
};
