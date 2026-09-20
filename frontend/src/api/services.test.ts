import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getServices, getServiceById } from './services';
import { apiClient } from './client';

vi.mock('./client');

describe('Services API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getServices', () => {
    it('should fetch all services without filters', async () => {
      const mockServices = [
        {
          id: 's1',
          categoryId: '1',
          name: 'AI Assessment',
          slug: 'ai-assessment',
          basePrice: 399,
          paymentType: 'FULL' as const,
          reviewCount: 150,
          createdAt: '2024-01-01T00:00:00Z',
        },
      ];

      vi.mocked(apiClient.get).mockResolvedValue({ data: mockServices });

      const result = await getServices();

      expect(apiClient.get).toHaveBeenCalledWith('/api/services', { params: undefined });
      expect(result).toEqual(mockServices);
    });

    it('should fetch services with category filter', async () => {
      const mockServices = [
        {
          id: 's1',
          categoryId: '1',
          name: 'AI Assessment',
          slug: 'ai-assessment',
          basePrice: 399,
          paymentType: 'FULL' as const,
          reviewCount: 150,
          createdAt: '2024-01-01T00:00:00Z',
        },
      ];

      vi.mocked(apiClient.get).mockResolvedValue({ data: mockServices });

      const result = await getServices({ categoryId: '1' });

      expect(apiClient.get).toHaveBeenCalledWith('/api/services', {
        params: { categoryId: '1' },
      });
      expect(result).toEqual(mockServices);
    });

    it('should fetch services with search filter', async () => {
      const mockServices = [
        {
          id: 's1',
          categoryId: '1',
          name: 'AI Assessment',
          slug: 'ai-assessment',
          basePrice: 399,
          paymentType: 'FULL' as const,
          reviewCount: 150,
          createdAt: '2024-01-01T00:00:00Z',
        },
      ];

      vi.mocked(apiClient.get).mockResolvedValue({ data: mockServices });

      const result = await getServices({ search: 'assessment' });

      expect(apiClient.get).toHaveBeenCalledWith('/api/services', {
        params: { search: 'assessment' },
      });
      expect(result).toEqual(mockServices);
    });

    it('should fetch services with payment type filter', async () => {
      const mockServices = [
        {
          id: 's1',
          categoryId: '1',
          name: 'AI Assessment',
          slug: 'ai-assessment',
          basePrice: 399,
          paymentType: 'FULL' as const,
          reviewCount: 150,
          createdAt: '2024-01-01T00:00:00Z',
        },
      ];

      vi.mocked(apiClient.get).mockResolvedValue({ data: mockServices });

      const result = await getServices({ paymentType: 'FULL' });

      expect(apiClient.get).toHaveBeenCalledWith('/api/services', {
        params: { paymentType: 'FULL' },
      });
      expect(result).toEqual(mockServices);
    });

    it('should fetch services with delivery mode filter', async () => {
      const mockServices = [
        {
          id: 's1',
          categoryId: '1',
          name: 'AI Assessment',
          slug: 'ai-assessment',
          basePrice: 399,
          paymentType: 'FULL' as const,
          deliveryMode: 'Online',
          reviewCount: 150,
          createdAt: '2024-01-01T00:00:00Z',
        },
      ];

      vi.mocked(apiClient.get).mockResolvedValue({ data: mockServices });

      const result = await getServices({ deliveryMode: 'Online' });

      expect(apiClient.get).toHaveBeenCalledWith('/api/services', {
        params: { deliveryMode: 'Online' },
      });
      expect(result).toEqual(mockServices);
    });

    it('should fetch services with price range filters', async () => {
      const mockServices = [
        {
          id: 's1',
          categoryId: '1',
          name: 'AI Assessment',
          slug: 'ai-assessment',
          basePrice: 399,
          paymentType: 'FULL' as const,
          reviewCount: 150,
          createdAt: '2024-01-01T00:00:00Z',
        },
      ];

      vi.mocked(apiClient.get).mockResolvedValue({ data: mockServices });

      const result = await getServices({ minPrice: 100, maxPrice: 500 });

      expect(apiClient.get).toHaveBeenCalledWith('/api/services', {
        params: { minPrice: 100, maxPrice: 500 },
      });
      expect(result).toEqual(mockServices);
    });

    it('should fetch services with all filters combined', async () => {
      const mockServices = [
        {
          id: 's1',
          categoryId: '1',
          name: 'AI Assessment',
          slug: 'ai-assessment',
          basePrice: 399,
          paymentType: 'FULL' as const,
          deliveryMode: 'Online',
          reviewCount: 150,
          createdAt: '2024-01-01T00:00:00Z',
        },
      ];

      vi.mocked(apiClient.get).mockResolvedValue({ data: mockServices });

      const result = await getServices({
        categoryId: '1',
        search: 'assessment',
        paymentType: 'FULL',
        deliveryMode: 'Online',
        minPrice: 100,
        maxPrice: 500,
      });

      expect(apiClient.get).toHaveBeenCalledWith('/api/services', {
        params: {
          categoryId: '1',
          search: 'assessment',
          paymentType: 'FULL',
          deliveryMode: 'Online',
          minPrice: 100,
          maxPrice: 500,
        },
      });
      expect(result).toEqual(mockServices);
    });
  });

  describe('getServiceById', () => {
    it('should fetch service by ID', async () => {
      const mockService = {
        id: 's1',
        categoryId: '1',
        name: 'AI Assessment',
        slug: 'ai-assessment',
        description: 'AI-based movement analysis',
        basePrice: 399,
        paymentType: 'FULL' as const,
        reviewCount: 150,
        deliveryMode: 'Online',
        features: ['AI-based movement analysis', 'Detailed report'],
        category: {
          id: '1',
          name: 'Knee Pain & Arthritis',
          slug: 'knee-pain-arthritis',
        },
        createdAt: '2024-01-01T00:00:00Z',
      };

      vi.mocked(apiClient.get).mockResolvedValue({ data: mockService });

      const result = await getServiceById('s1');

      expect(apiClient.get).toHaveBeenCalledWith('/api/services/s1');
      expect(result).toEqual(mockService);
      expect(result.category).toBeDefined();
    });
  });
});
