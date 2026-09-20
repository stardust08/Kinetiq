import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCategories } from './useCategories';
import * as categoriesApi from '../api/categories';
import type { Category, Service } from '../types';
import type { CategoryDetail } from '../api/categories';

// Mock the categories API
vi.mock('../api/categories');

describe('useCategories', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockCategories: Category[] = [
    {
      id: 'cat-1',
      name: 'Therapy',
      slug: 'therapy',
      description: 'Mental health therapy services',
      serviceCount: 5,
      status: 'active',
      createdAt: '2024-01-01T00:00:00Z',
    },
    {
      id: 'cat-2',
      name: 'Counseling',
      slug: 'counseling',
      description: 'Professional counseling services',
      serviceCount: 3,
      status: 'active',
      createdAt: '2024-01-02T00:00:00Z',
    },
  ];

  const mockService: Service = {
    id: 'svc-1',
    categoryId: 'cat-1',
    name: 'Individual Therapy',
    slug: 'individual-therapy',
    description: 'One-on-one therapy sessions',
    basePrice: 100,
    paymentType: 'PARTIAL',
    advancePercent: 30,
    reviewCount: 10,
    createdAt: '2024-01-01T00:00:00Z',
  };

  const mockCategoryDetail: CategoryDetail = {
    ...mockCategories[0],
    services: [mockService],
  };

  it('should return initial state', () => {
    const { result } = renderHook(() => useCategories());

    expect(result.current.categories).toEqual([]);
    expect(result.current.currentCategory).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should fetch categories successfully', async () => {
    vi.mocked(categoriesApi.getCategories).mockResolvedValue(mockCategories);

    const { result } = renderHook(() => useCategories());

    await act(async () => {
      const data = await result.current.fetchCategories();
      expect(data).toEqual(mockCategories);
    });

    expect(categoriesApi.getCategories).toHaveBeenCalledWith(undefined);
    expect(result.current.categories).toEqual(mockCategories);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should fetch categories with status filter', async () => {
    vi.mocked(categoriesApi.getCategories).mockResolvedValue(mockCategories);

    const { result } = renderHook(() => useCategories());

    await act(async () => {
      await result.current.fetchCategories('active');
    });

    expect(categoriesApi.getCategories).toHaveBeenCalledWith('active');
  });

  it('should handle fetch categories error', async () => {
    const error = new Error('Failed to fetch categories');
    vi.mocked(categoriesApi.getCategories).mockRejectedValue(error);

    const { result } = renderHook(() => useCategories());

    await act(async () => {
      try {
        await result.current.fetchCategories();
      } catch (err) {
        expect(err).toEqual(error);
      }
    });

    expect(result.current.error).toEqual(error);
    expect(result.current.isLoading).toBe(false);
  });

  it('should fetch category by ID successfully', async () => {
    vi.mocked(categoriesApi.getCategoryById).mockResolvedValue(mockCategoryDetail);

    const { result } = renderHook(() => useCategories());

    await act(async () => {
      const data = await result.current.fetchCategoryById('cat-1');
      expect(data).toEqual(mockCategoryDetail);
    });

    expect(categoriesApi.getCategoryById).toHaveBeenCalledWith('cat-1');
    expect(result.current.currentCategory).toEqual(mockCategoryDetail);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should handle fetch category by ID error', async () => {
    const error = new Error('Failed to fetch category');
    vi.mocked(categoriesApi.getCategoryById).mockRejectedValue(error);

    const { result } = renderHook(() => useCategories());

    await act(async () => {
      await expect(result.current.fetchCategoryById('cat-1')).rejects.toThrow('Failed to fetch category');
    });

    expect(result.current.error).toEqual(error);
    expect(result.current.isLoading).toBe(false);
  });

  it('should fetch category services successfully', async () => {
    const mockResponse = {
      data: [mockService],
      total: 1,
    };
    vi.mocked(categoriesApi.getCategoryServices).mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useCategories());

    await act(async () => {
      const data = await result.current.fetchCategoryServices('cat-1');
      expect(data).toEqual(mockResponse);
    });

    expect(categoriesApi.getCategoryServices).toHaveBeenCalledWith('cat-1', undefined);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should fetch category services with filters', async () => {
    const mockResponse = {
      data: [mockService],
      total: 1,
    };
    const filters = {
      paymentType: 'PARTIAL' as const,
      minPrice: 50,
      maxPrice: 150,
    };
    vi.mocked(categoriesApi.getCategoryServices).mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useCategories());

    await act(async () => {
      await result.current.fetchCategoryServices('cat-1', filters);
    });

    expect(categoriesApi.getCategoryServices).toHaveBeenCalledWith('cat-1', filters);
  });

  it('should handle fetch category services error', async () => {
    const error = new Error('Failed to fetch services');
    vi.mocked(categoriesApi.getCategoryServices).mockRejectedValue(error);

    const { result } = renderHook(() => useCategories());

    await act(async () => {
      try {
        await result.current.fetchCategoryServices('cat-1');
      } catch (err) {
        expect(err).toEqual(error);
      }
    });

    expect(result.current.error).toEqual(error);
    expect(result.current.isLoading).toBe(false);
  });

  it('should clear current category', async () => {
    const { result } = renderHook(() => useCategories());

    vi.mocked(categoriesApi.getCategoryById).mockResolvedValue(mockCategoryDetail);

    // Set a current category first
    await act(async () => {
      await result.current.fetchCategoryById('cat-1');
    });

    expect(result.current.currentCategory).toEqual(mockCategoryDetail);

    // Clear it
    act(() => {
      result.current.clearCurrentCategory();
    });

    expect(result.current.currentCategory).toBeNull();
  });
});
