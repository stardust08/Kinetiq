import { useCallback, useState } from 'react';
import * as servicesApi from '../api/services';
import type { Service } from '../types';
import type { ServiceFilters } from '../api/services';

/**
 * Custom hook for service browsing and search operations
 * Provides service listing, filtering, and detail fetching
 */
export const useServices = () => {
  const [services, setServices] = useState<Service[]>([]);
  const [currentService, setCurrentService] = useState<Service | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  /**
   * Fetch all services with optional filters
   * @param params - Optional filters (categoryId, search, paymentType, deliveryMode, minPrice, maxPrice)
   */
  const fetchServices = useCallback(async (params?: ServiceFilters) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await servicesApi.getServices(params);
      setServices(data);
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
   * Fetch single service by ID
   * @param serviceId - UUID of the service
   */
  const fetchServiceById = useCallback(async (serviceId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await servicesApi.getServiceById(serviceId);
      setCurrentService(data);
      return data;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to fetch service');
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /*
   * fetchServiceBySlug was removed. It called servicesApi.getServiceBySlug, which does
   * not exist and never has - the API exposes getServices and getServiceById only, and
   * there is no slug endpoint behind it. Nothing imported this hook, so the call was
   * never made and the mismatch sat in the type errors that `vite build` does not read.
   * Restore it when the backend grows a slug route; resolving a slug through
   * getServiceById would just be wrong.
   */

  /**
   * Clear current service
   */
  const clearCurrentService = useCallback(() => {
    setCurrentService(null);
  }, []);

  return {
    // State
    services,
    currentService,
    isLoading,
    error,
    
    // Actions
    fetchServices,
    fetchServiceById,
    clearCurrentService,
  };
};
