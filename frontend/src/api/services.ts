import { apiClient } from './client';
import { Service } from '../types';

/**
 * Service API functions for browsing and searching services
 */

export interface ServiceFilters {
  categoryId?: string;
  search?: string;
  paymentType?: 'FULL' | 'PARTIAL';
  deliveryMode?: string;
  minPrice?: number;
  maxPrice?: number;
}

/**
 * Get all services with optional filters
 * @param filters - Optional filters (categoryId, search, paymentType, deliveryMode, minPrice, maxPrice)
 * @returns Promise with list of services
 */
export const getServices = async (filters?: ServiceFilters): Promise<Service[]> => {
  const response = await apiClient.get<Service[]>('/api/services', { params: filters });
  return response.data;
};

/**
 * Get single service by ID
 * @param serviceId - UUID of the service
 * @returns Promise with service details
 */
export const getServiceById = async (serviceId: string): Promise<Service> => {
  const response = await apiClient.get<Service>(`/api/services/${serviceId}`);
  return response.data;
};

/**
 * Service API object for convenient access to all service operations
 */
export const serviceAPI = {
  getAll: getServices,
  getById: getServiceById,
};
