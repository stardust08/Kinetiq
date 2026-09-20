import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getCategories, getCategoryById, getCategoryServices } from './categories';
import { apiClient } from './client';

vi.mock('./client');

describe('Categories API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getCategories', () => {
    it('should fetch all categories without filter', async () => {
      const mockCategories = [
        {
          id: '1',
          name: 'Knee Pain',
          slug: 'knee-pain',
          serviceCount: 5,
          createdAt: '2024-01-01T00:00:00Z',
        },
      ];

      vi.mocked(apiClient.get).mockResolvedValue({ data: mockCategories });

      const result = await getCategories();

      expect(apiClient.get).toHaveBeenCalledWith('/api/categories', { params: {} });
      expect(result).toEqual(mockCategories);
    });

    it('should fetch categories with status filter', async () => {
      const mockCategories = [
        {
          id: '1',
          name: 'Knee Pain',
          slug: 'knee-pain',
          status: 'active',
          serviceCount: 5,
          createdAt: '2024-01-01T00:00:00Z',
        },
      ];

      vi.mocked(apiClient.get).mockResolvedValue({ data: mockCategories });

      const result = await getCategories('active');

      expect(apiClient.get).toHaveBeenCalledWith('/api/categories', {
        params: { status: 'active' },
      });
      expect(result).toEqual(mockCategories);
    });
  });

  describe('getCategoryById', () => {
    it('should fetch category by ID with services', async () => {
      const mockCategory = {
        id: '1',
        name: 'Knee Pain',
        slug: 'knee-pain',
        serviceCount: 2,
        services: [
          {
            id: 's1',
            categoryId: '1',
            name: 'AI Assessment',
            slug: 'ai-assessment',
            basePrice: 399,
            paymentType: 'FULL' as const,
            reviewCount: 10,
            createdAt: '2024-01-01T00:00:00Z',
          },
        ],
        createdAt: '2024-01-01T00:00:00Z',
      };

      vi.mocked(apiClient.get).mockResolvedValue({ data: mockCategory });

      const result = await getCategoryById('1');

      expect(apiClient.get).toHaveBeenCalledWith('/api/categories/1');
      expect(result).toEqual(mockCategory);
      expect(result.services).toHaveLength(1);
    });
  });

  describe('getCategoryServices', () => {
    it('should fetch services without filters', async () => {
      const mockResponse = {
        data: [
          {
            id: 's1',
            categoryId: '1',
            name: 'AI Assessment',
            slug: 'ai-assessment',
            basePrice: 399,
            paymentType: 'FULL' as const,
            reviewCount: 10,
            createdAt: '2024-01-01T00:00:00Z',
          },
        ],
        total: 1,
      };

      vi.mocked(apiClient.get).mockResolvedValue({ data: mockResponse });

      const result = await getCategoryServices('1');

      expect(apiClient.get).toHaveBeenCalledWith('/api/categories/1/services', {
        params: undefined,
      });
      expect(result).toEqual(mockResponse);
    });

    it('should fetch services with payment type filter', async () => {
      const mockResponse = {
        data: [
          {
            id: 's1',
            categoryId: '1',
            name: 'AI Assessment',
            slug: 'ai-assessment',
            basePrice: 399,
            paymentType: 'FULL' as const,
            reviewCount: 10,
            createdAt: '2024-01-01T00:00:00Z',
          },
        ],
        total: 1,
      };

      vi.mocked(apiClient.get).mockResolvedValue({ data: mockResponse });

      const result = await getCategoryServices('1', { paymentType: 'FULL' });

      expect(apiClient.get).toHaveBeenCalledWith('/api/categories/1/services', {
        params: { paymentType: 'FULL' },
      });
      expect(result).toEqual(mockResponse);
    });

    it('should fetch services with price range filters', async () => {
      const mockResponse = {
        data: [],
        total: 0,
      };

      vi.mocked(apiClient.get).mockResolvedValue({ data: mockResponse });

      const result = await getCategoryServices('1', {
        minPrice: 100,
        maxPrice: 500,
      });

      expect(apiClient.get).toHaveBeenCalledWith('/api/categories/1/services', {
        params: { minPrice: 100, maxPrice: 500 },
      });
      expect(result).toEqual(mockResponse);
    });

    it('should fetch services with all filters combined', async () => {
      const mockResponse = {
        data: [],
        total: 0,
      };

      vi.mocked(apiClient.get).mockResolvedValue({ data: mockResponse });

      const result = await getCategoryServices('1', {
        paymentType: 'PARTIAL',
        minPrice: 200,
        maxPrice: 1000,
      });

      expect(apiClient.get).toHaveBeenCalledWith('/api/categories/1/services', {
        params: { paymentType: 'PARTIAL', minPrice: 200, maxPrice: 1000 },
      });
      expect(result).toEqual(mockResponse);
    });
  });
});
