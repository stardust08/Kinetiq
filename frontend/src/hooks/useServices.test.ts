import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useServices } from './useServices';
import * as servicesApi from '../api/services';
import type { Service } from '../types';

// Mock the services API
vi.mock('../api/services');

describe('useServices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockService: Service = {
    id: 'svc-1',
    categoryId: 'cat-1',
    name: 'Individual Therapy',
    slug: 'individual-therapy',
    description: 'One-on-one therapy sessions',
    basePrice: 100,
    salePrice: 80,
    discount: 20,
    paymentType: 'PARTIAL',
    advancePercent: 30,
    advanceAmount: 30,
    duration: '60 minutes',
    serviceType: 'therapy',
    features: ['Video call', 'Chat support'],
    reviewCount: 10,
    deliveryMode: 'online',
    sessionCount: 1,
    category: {
      id: 'cat-1',
      name: 'Therapy',
      slug: 'therapy',
    },
    createdAt: '2024-01-01T00:00:00Z',
  };

  const mockServices: Service[] = [
    mockService,
    {
      ...mockService,
      id: 'svc-2',
      name: 'Group Therapy',
      slug: 'group-therapy',
      basePrice: 50,
      paymentType: 'FULL',
    },
  ];

  it('should return initial state', () => {
    const { result } = renderHook(() => useServices());

    expect(result.current.services).toEqual([]);
    expect(result.current.currentService).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should fetch services successfully', async () => {
    vi.mocked(servicesApi.getServices).mockResolvedValue(mockServices);

    const { result } = renderHook(() => useServices());

    await act(async () => {
      const data = await result.current.fetchServices();
      expect(data).toEqual(mockServices);
    });

    expect(servicesApi.getServices).toHaveBeenCalledWith(undefined);
    expect(result.current.services).toEqual(mockServices);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should fetch services with filters', async () => {
    const filters = {
      categoryId: 'cat-1',
      search: 'therapy',
      paymentType: 'PARTIAL' as const,
      deliveryMode: 'online',
      minPrice: 50,
      maxPrice: 150,
    };
    vi.mocked(servicesApi.getServices).mockResolvedValue(mockServices);

    const { result } = renderHook(() => useServices());

    await act(async () => {
      await result.current.fetchServices(filters);
    });

    expect(servicesApi.getServices).toHaveBeenCalledWith(filters);
    expect(result.current.services).toEqual(mockServices);
  });

  it('should handle fetch services error', async () => {
    const error = new Error('Failed to fetch services');
    vi.mocked(servicesApi.getServices).mockRejectedValue(error);

    const { result } = renderHook(() => useServices());

    await act(async () => {
      try {
        await result.current.fetchServices();
      } catch (err) {
        expect(err).toEqual(error);
      }
    });

    expect(result.current.error).toEqual(error);
    expect(result.current.isLoading).toBe(false);
  });

  it('should fetch service by ID successfully', async () => {
    vi.mocked(servicesApi.getServiceById).mockResolvedValue(mockService);

    const { result } = renderHook(() => useServices());

    await act(async () => {
      const data = await result.current.fetchServiceById('svc-1');
      expect(data).toEqual(mockService);
    });

    expect(servicesApi.getServiceById).toHaveBeenCalledWith('svc-1');
    expect(result.current.currentService).toEqual(mockService);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should handle fetch service by ID error', async () => {
    const error = new Error('Failed to fetch service');
    vi.mocked(servicesApi.getServiceById).mockRejectedValue(error);

    const { result } = renderHook(() => useServices());

    await act(async () => {
      await expect(result.current.fetchServiceById('svc-1')).rejects.toThrow('Failed to fetch service');
    });

    expect(result.current.error).toEqual(error);
    expect(result.current.isLoading).toBe(false);
  });

  it('should fetch service by slug successfully', async () => {
    vi.mocked(servicesApi.getServiceBySlug).mockResolvedValue(mockService);

    const { result } = renderHook(() => useServices());

    await act(async () => {
      const data = await result.current.fetchServiceBySlug('individual-therapy');
      expect(data).toEqual(mockService);
    });

    expect(servicesApi.getServiceBySlug).toHaveBeenCalledWith('individual-therapy');
    expect(result.current.currentService).toEqual(mockService);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should handle fetch service by slug error', async () => {
    const error = new Error('Failed to fetch service');
    vi.mocked(servicesApi.getServiceBySlug).mockRejectedValue(error);

    const { result } = renderHook(() => useServices());

    await act(async () => {
      await expect(result.current.fetchServiceBySlug('invalid-slug')).rejects.toThrow('Failed to fetch service');
    });

    expect(result.current.error).toEqual(error);
    expect(result.current.isLoading).toBe(false);
  });

  it('should clear current service', async () => {
    const { result } = renderHook(() => useServices());

    vi.mocked(servicesApi.getServiceById).mockResolvedValue(mockService);

    // Set a current service first
    await act(async () => {
      await result.current.fetchServiceById('svc-1');
    });

    expect(result.current.currentService).toEqual(mockService);

    // Clear it
    act(() => {
      result.current.clearCurrentService();
    });

    expect(result.current.currentService).toBeNull();
  });
});
