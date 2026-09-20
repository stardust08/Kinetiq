import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConditionsSection } from './conditions-section';
import { categoryAPI } from '../../api/categories';
import { cartAPI } from '../../api/cart';
import { toast } from 'sonner';

// Mock the category API
vi.mock('../../api/categories', () => ({
  categoryAPI: {
    getAll: vi.fn(),
    getById: vi.fn(),
    getServices: vi.fn(),
  },
}));

// Mock the cart API
vi.mock('../../api/cart', () => ({
  cartAPI: {
    addItem: vi.fn(),
  },
}));

// Mock the cart store
const mockSyncWithServer = vi.fn();
vi.mock('../../store/cartStore', () => ({
  useCartStore: vi.fn((selector) => {
    const state = {
      syncWithServer: mockSyncWithServer,
    };
    return selector(state);
  }),
}));

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('ConditionsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSyncWithServer.mockClear();
  });

  it('renders the component', async () => {
    vi.mocked(categoryAPI.getAll).mockResolvedValue([]);
    vi.mocked(categoryAPI.getServices).mockResolvedValue({ data: [], total: 0 });
    render(<ConditionsSection />);
    expect(screen.getByText('Explore By Category')).toBeInTheDocument();
  });

  it('shows loading skeletons while categories are loading', async () => {
    // Create a promise that we can control
    let resolveCategories: (value: any) => void;
    const categoriesPromise = new Promise((resolve) => {
      resolveCategories = resolve;
    });

    vi.mocked(categoryAPI.getAll).mockReturnValue(categoriesPromise as any);
    vi.mocked(categoryAPI.getServices).mockResolvedValue({ data: [], total: 0 });

    render(<ConditionsSection />);

    // Check that skeleton elements are present
    const skeletons = screen.getAllByTestId('skeleton');
    expect(skeletons.length).toBeGreaterThan(0);

    // Resolve the promise
    resolveCategories!([]);
    
    // Wait for skeletons to disappear
    await waitFor(() => {
      expect(screen.queryAllByTestId('skeleton').length).toBe(0);
    });
  });

  it('shows loading skeletons while services are loading', async () => {
    const mockCategories = [
      {
        id: 'cat-1',
        name: 'Test Category',
        slug: 'test-category',
        serviceCount: 2,
        createdAt: '2024-01-01',
      },
    ];

    // Create a promise that we can control for services
    let resolveServices: (value: any) => void;
    const servicesPromise = new Promise((resolve) => {
      resolveServices = resolve;
    });

    vi.mocked(categoryAPI.getAll).mockResolvedValue(mockCategories);
    vi.mocked(categoryAPI.getServices).mockReturnValue(servicesPromise as any);

    render(<ConditionsSection />);

    // Wait for categories to load
    await waitFor(() => {
      expect(screen.getByText('Test Category')).toBeInTheDocument();
    });

    // Check that service skeleton elements are present
    const skeletons = screen.getAllByTestId('skeleton');
    expect(skeletons.length).toBeGreaterThan(0);

    // Resolve the services promise
    resolveServices!({ data: [], total: 0 });
    
    // Wait for skeletons to disappear
    await waitFor(() => {
      expect(screen.queryAllByTestId('skeleton').length).toBe(0);
    });
  });

  it('renders categories from API', async () => {
    const mockCategories = [
      {
        id: '1',
        name: 'Knee Pain & Arthritis',
        slug: 'knee-pain',
        serviceCount: 5,
        createdAt: '2024-01-01',
      },
      {
        id: '2',
        name: 'Back Pain & Sciatica',
        slug: 'back-pain',
        serviceCount: 3,
        createdAt: '2024-01-02',
      },
    ];

    vi.mocked(categoryAPI.getAll).mockResolvedValue(mockCategories);
    vi.mocked(categoryAPI.getServices).mockResolvedValue({ data: [], total: 0 });
    
    render(<ConditionsSection />);
    
    // Wait for categories to load
    await waitFor(() => {
      expect(screen.getByText('Knee Pain & Arthritis')).toBeInTheDocument();
      expect(screen.getByText('Back Pain & Sciatica')).toBeInTheDocument();
    });
  });

  it('loads categories on mount', async () => {
    const mockCategories = [
      {
        id: '1',
        name: 'Test Category 1',
        slug: 'test-category-1',
        serviceCount: 5,
        createdAt: '2024-01-01',
      },
      {
        id: '2',
        name: 'Test Category 2',
        slug: 'test-category-2',
        serviceCount: 3,
        createdAt: '2024-01-02',
      },
    ];

    vi.mocked(categoryAPI.getAll).mockResolvedValue(mockCategories);
    vi.mocked(categoryAPI.getServices).mockResolvedValue({ data: [], total: 0 });

    render(<ConditionsSection />);

    // Wait for the API call to complete
    await waitFor(() => {
      expect(categoryAPI.getAll).toHaveBeenCalledTimes(1);
    });
  });

  it('handles category loading errors gracefully', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    vi.mocked(categoryAPI.getAll).mockRejectedValue(new Error('API Error'));
    vi.mocked(categoryAPI.getServices).mockResolvedValue({ data: [], total: 0 });

    render(<ConditionsSection />);

    // Wait for the error to be logged and error message to appear
    await waitFor(() => {
      expect(screen.getByText('Failed to load categories. Please try again.')).toBeInTheDocument();
    });

    // Check that retry button is present
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();

    consoleErrorSpy.mockRestore();
  });

  it('loads services when a category is selected', async () => {
    const mockCategories = [
      {
        id: 'cat-1',
        name: 'Test Category',
        slug: 'test-category',
        serviceCount: 2,
        createdAt: '2024-01-01',
      },
    ];

    const mockServices = [
      {
        id: 'svc-1',
        name: 'Test Service 1',
        slug: 'test-service-1',
        categoryId: 'cat-1',
        basePrice: 100,
        salePrice: 80,
        paymentType: 'FULL' as const,
        reviewCount: 50,
        createdAt: '2024-01-01',
      },
      {
        id: 'svc-2',
        name: 'Test Service 2',
        slug: 'test-service-2',
        categoryId: 'cat-1',
        basePrice: 200,
        salePrice: 150,
        paymentType: 'FULL' as const,
        reviewCount: 75,
        createdAt: '2024-01-01',
      },
    ];

    vi.mocked(categoryAPI.getAll).mockResolvedValue(mockCategories);
    vi.mocked(categoryAPI.getServices).mockResolvedValue({
      data: mockServices,
      total: 2,
    });

    render(<ConditionsSection />);

    // Wait for categories to load and services to be fetched
    await waitFor(() => {
      expect(categoryAPI.getAll).toHaveBeenCalledTimes(1);
      expect(categoryAPI.getServices).toHaveBeenCalledWith('cat-1');
    });
  });

  it('handles service loading errors gracefully', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    const mockCategories = [
      {
        id: 'cat-1',
        name: 'Test Category',
        slug: 'test-category',
        serviceCount: 2,
        createdAt: '2024-01-01',
      },
    ];

    vi.mocked(categoryAPI.getAll).mockResolvedValue(mockCategories);
    vi.mocked(categoryAPI.getServices).mockRejectedValue(new Error('Service API Error'));

    render(<ConditionsSection />);

    // Wait for the error to be logged and error message to appear
    await waitFor(() => {
      expect(screen.getByText('Failed to load services. Please try again.')).toBeInTheDocument();
    });

    // Check that retry button is present
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();

    consoleErrorSpy.mockRestore();
  });

  it('renders services with correct pricing and details', async () => {
    const mockCategories = [
      {
        id: 'cat-1',
        name: 'Test Category',
        slug: 'test-category',
        serviceCount: 2,
        createdAt: '2024-01-01',
      },
    ];

    const mockServices = [
      {
        id: 'svc-1',
        name: 'AI Assessment',
        slug: 'ai-assessment',
        categoryId: 'cat-1',
        basePrice: 399,
        duration: 'One-time assessment',
        reviewCount: 150,
        features: ['AI-based movement analysis', 'Detailed assessment report'],
        paymentType: 'FULL' as const,
        deliveryMode: 'Online',
        createdAt: '2024-01-01',
      },
      {
        id: 'svc-2',
        name: '4 Week Program',
        slug: '4-week-program',
        categoryId: 'cat-1',
        basePrice: 5999,
        salePrice: 3999,
        sessionCount: 12,
        duration: 'Takes 4-5 weeks',
        reviewCount: 200,
        features: ['Expert-designed rehab plan', 'Up to 12 guided sessions'],
        paymentType: 'PARTIAL' as const,
        advanceAmount: 333,
        deliveryMode: 'Online',
        createdAt: '2024-01-01',
      },
    ];

    vi.mocked(categoryAPI.getAll).mockResolvedValue(mockCategories);
    vi.mocked(categoryAPI.getServices).mockResolvedValue({
      data: mockServices,
      total: 2,
    });

    render(<ConditionsSection />);

    // Wait for services to load
    await waitFor(() => {
      expect(screen.getByText('AI Assessment')).toBeInTheDocument();
      expect(screen.getByText('4 Week Program')).toBeInTheDocument();
    });

    // Check pricing display
    expect(screen.getByText('₹399')).toBeInTheDocument();
    expect(screen.getByText('₹3,999')).toBeInTheDocument();
    
    // Check features
    expect(screen.getByText('AI-based movement analysis')).toBeInTheDocument();
    expect(screen.getByText('Expert-designed rehab plan')).toBeInTheDocument();
    
    // Check badges
    expect(screen.getByText('Combo')).toBeInTheDocument();
  });

  it('retries loading categories when retry button is clicked', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    const mockCategories = [
      {
        id: 'cat-1',
        name: 'Test Category',
        slug: 'test-category',
        serviceCount: 2,
        createdAt: '2024-01-01',
      },
    ];

    // First call fails, second call succeeds
    vi.mocked(categoryAPI.getAll)
      .mockRejectedValueOnce(new Error('API Error'))
      .mockResolvedValue(mockCategories);
    vi.mocked(categoryAPI.getServices).mockResolvedValue({ data: [], total: 0 });

    render(<ConditionsSection />);

    // Wait for error message
    await waitFor(() => {
      expect(screen.getByText('Failed to load categories. Please try again.')).toBeInTheDocument();
    });

    const initialCallCount = vi.mocked(categoryAPI.getAll).mock.calls.length;

    // Click retry button
    const retryButton = screen.getByRole('button', { name: /retry/i });
    retryButton.click();

    // Wait for categories to load successfully
    await waitFor(() => {
      expect(screen.getByText('Test Category')).toBeInTheDocument();
    });

    // Verify retry was called
    expect(categoryAPI.getAll).toHaveBeenCalledTimes(initialCallCount + 1);

    consoleErrorSpy.mockRestore();
  });

  it('retries loading services when retry button is clicked', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    const mockCategories = [
      {
        id: 'cat-1',
        name: 'Test Category',
        slug: 'test-category',
        serviceCount: 2,
        createdAt: '2024-01-01',
      },
    ];

    const mockServices = [
      {
        id: 'svc-1',
        name: 'Test Service',
        slug: 'test-service',
        categoryId: 'cat-1',
        basePrice: 100,
        paymentType: 'FULL' as const,
        reviewCount: 50,
        createdAt: '2024-01-01',
      },
    ];

    vi.mocked(categoryAPI.getAll).mockResolvedValue(mockCategories);
    // First call fails, second call succeeds
    vi.mocked(categoryAPI.getServices)
      .mockRejectedValueOnce(new Error('Service API Error'))
      .mockResolvedValue({ data: mockServices, total: 1 });

    render(<ConditionsSection />);

    // Wait for error message
    await waitFor(() => {
      expect(screen.getByText('Failed to load services. Please try again.')).toBeInTheDocument();
    });

    const initialCallCount = vi.mocked(categoryAPI.getServices).mock.calls.length;

    // Click retry button
    const retryButton = screen.getByRole('button', { name: /retry/i });
    retryButton.click();

    // Wait for services to load successfully
    await waitFor(() => {
      expect(screen.getByText('Test Service')).toBeInTheDocument();
    });

    // Verify retry was called
    expect(categoryAPI.getServices).toHaveBeenCalledTimes(initialCallCount + 1);

    consoleErrorSpy.mockRestore();
  });

  it('shows empty state when no services are available', async () => {
    const mockCategories = [
      {
        id: 'cat-1',
        name: 'Test Category',
        slug: 'test-category',
        serviceCount: 0,
        createdAt: '2024-01-01',
      },
    ];

    vi.mocked(categoryAPI.getAll).mockResolvedValue(mockCategories);
    vi.mocked(categoryAPI.getServices).mockResolvedValue({ data: [], total: 0 });

    render(<ConditionsSection />);

    // Wait for empty state message
    await waitFor(() => {
      expect(screen.getByText('No services available for this category yet.')).toBeInTheDocument();
    });
  });

  it('adds item to cart when Book button is clicked', async () => {
    const user = userEvent.setup();
    
    const mockCategories = [
      {
        id: 'cat-1',
        name: 'Test Category',
        slug: 'test-category',
        serviceCount: 1,
        createdAt: '2024-01-01',
      },
    ];

    const mockServices = [
      {
        id: 'svc-1',
        name: 'Test Service',
        slug: 'test-service',
        categoryId: 'cat-1',
        basePrice: 399,
        duration: 'One-time assessment',
        reviewCount: 150,
        features: ['Feature 1', 'Feature 2'],
        paymentType: 'FULL' as const,
        deliveryMode: 'Online',
        createdAt: '2024-01-01',
      },
    ];

    const mockCart = {
      id: 'cart-1',
      userId: 'user-1',
      items: [
        {
          id: 'item-1',
          serviceId: 'svc-1',
          serviceName: 'Test Service',
          quantity: 1,
          price: 399,
          subtotal: 399,
        },
      ],
      cartValue: 399,
      itemCount: 1,
      updatedAt: '2024-01-01',
    };

    vi.mocked(categoryAPI.getAll).mockResolvedValue(mockCategories);
    vi.mocked(categoryAPI.getServices).mockResolvedValue({
      data: mockServices,
      total: 1,
    });
    vi.mocked(cartAPI.addItem).mockResolvedValue(mockCart);

    render(<ConditionsSection />);

    // Wait for services to load
    await waitFor(() => {
      expect(screen.getByText('Test Service')).toBeInTheDocument();
    });

    // Click the Book button
    const bookButton = screen.getByRole('button', { name: /book at/i });
    await user.click(bookButton);

    // Verify cart API was called and store was synced
    await waitFor(() => {
      expect(cartAPI.addItem).toHaveBeenCalledWith('svc-1', 1);
      expect(mockSyncWithServer).toHaveBeenCalledWith(mockCart);
      // The toast is raised with a closeButton option.
      expect(toast.success).toHaveBeenCalledWith('Added to cart!', {
        closeButton: true,
      });
    });
  });

  it('shows error toast when adding to cart fails', async () => {
    const user = userEvent.setup();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    const mockCategories = [
      {
        id: 'cat-1',
        name: 'Test Category',
        slug: 'test-category',
        serviceCount: 1,
        createdAt: '2024-01-01',
      },
    ];

    const mockServices = [
      {
        id: 'svc-1',
        name: 'Test Service',
        slug: 'test-service',
        categoryId: 'cat-1',
        basePrice: 399,
        duration: 'One-time assessment',
        reviewCount: 150,
        features: ['Feature 1', 'Feature 2'],
        paymentType: 'FULL' as const,
        deliveryMode: 'Online',
        createdAt: '2024-01-01',
      },
    ];

    vi.mocked(categoryAPI.getAll).mockResolvedValue(mockCategories);
    vi.mocked(categoryAPI.getServices).mockResolvedValue({
      data: mockServices,
      total: 1,
    });
    vi.mocked(cartAPI.addItem).mockRejectedValue(new Error('Cart API Error'));

    render(<ConditionsSection />);

    // Wait for services to load
    await waitFor(() => {
      expect(screen.getByText('Test Service')).toBeInTheDocument();
    });

    // Click the Book button
    const bookButton = screen.getByRole('button', { name: /book at/i });
    await user.click(bookButton);

    // Verify error handling
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to add item to cart. Please try again.');
    });

    consoleErrorSpy.mockRestore();
  });
});


it('loads services automatically when first category is selected', async () => {
  const mockCategories = [
    {
      id: 'cat-1',
      name: 'First Category',
      slug: 'first-category',
      serviceCount: 2,
      createdAt: '2024-01-01',
    },
    {
      id: 'cat-2',
      name: 'Second Category',
      slug: 'second-category',
      serviceCount: 1,
      createdAt: '2024-01-02',
    },
  ];

  const mockServices = [
    {
      id: 'svc-1',
      name: 'Service 1',
      slug: 'service-1',
      categoryId: 'cat-1',
      basePrice: 100,
      paymentType: 'FULL' as const,
      reviewCount: 50,
      createdAt: '2024-01-01',
    },
  ];

  vi.mocked(categoryAPI.getAll).mockResolvedValue(mockCategories);
  vi.mocked(categoryAPI.getServices).mockResolvedValue({
    data: mockServices,
    total: 1,
  });

  render(<ConditionsSection />);

  // Wait for categories and services to load
  await waitFor(() => {
    expect(categoryAPI.getServices).toHaveBeenCalledWith('cat-1');
    expect(screen.getByText('Service 1')).toBeInTheDocument();
  });
  
  // Verify getAll was called
  expect(categoryAPI.getAll).toHaveBeenCalled();
});

it('reloads services when category selection changes', async () => {
  const user = userEvent.setup();

  const mockCategories = [
    {
      id: 'cat-1',
      name: 'Category 1',
      slug: 'category-1',
      serviceCount: 1,
      createdAt: '2024-01-01',
    },
    {
      id: 'cat-2',
      name: 'Category 2',
      slug: 'category-2',
      serviceCount: 1,
      createdAt: '2024-01-02',
    },
  ];

  const mockServicesCategory1 = [
    {
      id: 'svc-1',
      name: 'Service from Category 1',
      slug: 'service-1',
      categoryId: 'cat-1',
      basePrice: 100,
      paymentType: 'FULL' as const,
      reviewCount: 50,
      createdAt: '2024-01-01',
    },
  ];

  const mockServicesCategory2 = [
    {
      id: 'svc-2',
      name: 'Service from Category 2',
      slug: 'service-2',
      categoryId: 'cat-2',
      basePrice: 200,
      paymentType: 'FULL' as const,
      reviewCount: 75,
      createdAt: '2024-01-01',
    },
  ];

  vi.mocked(categoryAPI.getAll).mockResolvedValue(mockCategories);
  vi.mocked(categoryAPI.getServices)
    .mockResolvedValueOnce({ data: mockServicesCategory1, total: 1 })
    .mockResolvedValueOnce({ data: mockServicesCategory2, total: 1 });

  render(<ConditionsSection />);

  // Wait for initial services to load
  await waitFor(() => {
    expect(screen.getByText('Service from Category 1')).toBeInTheDocument();
  });

  // Click on second category
  const category2Button = screen.getByRole('button', { name: /category 2/i });
  await user.click(category2Button);

  // Wait for new services to load
  await waitFor(() => {
    expect(categoryAPI.getServices).toHaveBeenCalledWith('cat-2');
    expect(screen.getByText('Service from Category 2')).toBeInTheDocument();
    expect(screen.queryByText('Service from Category 1')).not.toBeInTheDocument();
  });
});

it('shows loading state when switching between categories', async () => {
  const user = userEvent.setup();

  const mockCategories = [
    {
      id: 'cat-1',
      name: 'Category 1',
      slug: 'category-1',
      serviceCount: 1,
      createdAt: '2024-01-01',
    },
    {
      id: 'cat-2',
      name: 'Category 2',
      slug: 'category-2',
      serviceCount: 1,
      createdAt: '2024-01-02',
    },
  ];

  const mockServicesCategory1 = [
    {
      id: 'svc-1',
      name: 'Service 1',
      slug: 'service-1',
      categoryId: 'cat-1',
      basePrice: 100,
      paymentType: 'FULL' as const,
      reviewCount: 50,
      createdAt: '2024-01-01',
    },
  ];

  // Create a promise we can control for the second category
  let resolveServices2: (value: any) => void;
  const services2Promise = new Promise((resolve) => {
    resolveServices2 = resolve;
  });

  vi.mocked(categoryAPI.getAll).mockResolvedValue(mockCategories);
  vi.mocked(categoryAPI.getServices)
    .mockResolvedValueOnce({ data: mockServicesCategory1, total: 1 })
    .mockReturnValueOnce(services2Promise as any);

  render(<ConditionsSection />);

  // Wait for initial services to load
  await waitFor(() => {
    expect(screen.getByText('Service 1')).toBeInTheDocument();
  });

  // Click on second category
  const category2Button = screen.getByRole('button', { name: /category 2/i });
  await user.click(category2Button);

  // Check that loading skeletons appear
  await waitFor(() => {
    const skeletons = screen.getAllByTestId('skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  // Resolve the services promise
  resolveServices2!({ data: [], total: 0 });

  // Wait for loading to complete
  await waitFor(() => {
    expect(screen.queryAllByTestId('skeleton').length).toBe(0);
  });
});

it('handles service loading with various service types', async () => {
  const mockCategories = [
    {
      id: 'cat-1',
      name: 'Test Category',
      slug: 'test-category',
      serviceCount: 3,
      createdAt: '2024-01-01',
    },
  ];

  const mockServices = [
    {
      id: 'svc-1',
      name: 'Full Payment Service',
      slug: 'full-payment',
      categoryId: 'cat-1',
      basePrice: 399,
      paymentType: 'FULL' as const,
      reviewCount: 100,
      features: ['Feature 1', 'Feature 2'],
      deliveryMode: 'Online',
      createdAt: '2024-01-01',
    },
    {
      id: 'svc-2',
      name: 'Partial Payment Service',
      slug: 'partial-payment',
      categoryId: 'cat-1',
      basePrice: 5999,
      salePrice: 3999,
      sessionCount: 12,
      advanceAmount: 333,
      paymentType: 'PARTIAL' as const,
      reviewCount: 200,
      features: ['Feature A', 'Feature B'],
      deliveryMode: 'Hybrid',
      createdAt: '2024-01-01',
    },
    {
      id: 'svc-3',
      name: 'Service with Sale',
      slug: 'service-sale',
      categoryId: 'cat-1',
      basePrice: 1000,
      salePrice: 700,
      paymentType: 'FULL' as const,
      reviewCount: 50,
      features: ['Sale Feature'],
      deliveryMode: 'In-person',
      createdAt: '2024-01-01',
    },
  ];

  vi.mocked(categoryAPI.getAll).mockResolvedValue(mockCategories);
  vi.mocked(categoryAPI.getServices).mockResolvedValue({
    data: mockServices,
    total: 3,
  });

  render(<ConditionsSection />);

  // Wait for all services to load
  await waitFor(() => {
    expect(screen.getByText('Full Payment Service')).toBeInTheDocument();
    expect(screen.getByText('Partial Payment Service')).toBeInTheDocument();
    expect(screen.getByText('Service with Sale')).toBeInTheDocument();
  });

  // Verify different payment types are displayed
  expect(screen.getByText('Combo')).toBeInTheDocument(); // Partial payment badge

  // Verify pricing is displayed correctly
  expect(screen.getByText('₹399')).toBeInTheDocument();
  expect(screen.getByText('₹3,999')).toBeInTheDocument();
  expect(screen.getByText('₹700')).toBeInTheDocument();

  // Verify delivery modes
  expect(screen.getByText('Online')).toBeInTheDocument();
  expect(screen.getByText('Hybrid')).toBeInTheDocument();
  expect(screen.getByText('In-person')).toBeInTheDocument();
});

it('does not load services when no category is selected', async () => {
  vi.mocked(categoryAPI.getAll).mockResolvedValue([]);
  
  // Track the initial call count before rendering
  const initialCallCount = vi.mocked(categoryAPI.getServices).mock.calls.length;

  render(<ConditionsSection />);

  // Wait for categories to load (empty)
  await waitFor(() => {
    expect(categoryAPI.getAll).toHaveBeenCalled();
  });

  // Verify services API was not called since no category was selected
  const finalCallCount = vi.mocked(categoryAPI.getServices).mock.calls.length;
  expect(finalCallCount).toBe(initialCallCount);
});

it('displays service features correctly', async () => {
  const mockCategories = [
    {
      id: 'cat-1',
      name: 'Test Category',
      slug: 'test-category',
      serviceCount: 1,
      createdAt: '2024-01-01',
    },
  ];

  const mockServices = [
    {
      id: 'svc-1',
      name: 'Feature Rich Service',
      slug: 'feature-rich',
      categoryId: 'cat-1',
      basePrice: 500,
      paymentType: 'FULL' as const,
      reviewCount: 120,
      features: [
        'AI-based analysis',
        'Personalized plan',
        'Expert guidance',
        '24/7 support',
      ],
      deliveryMode: 'Online',
      createdAt: '2024-01-01',
    },
  ];

  vi.mocked(categoryAPI.getAll).mockResolvedValue(mockCategories);
  vi.mocked(categoryAPI.getServices).mockResolvedValue({
    data: mockServices,
    total: 1,
  });

  render(<ConditionsSection />);

  // Wait for service to load
  await waitFor(() => {
    expect(screen.getByText('Feature Rich Service')).toBeInTheDocument();
  });

  // Verify all features are displayed
  expect(screen.getByText('AI-based analysis')).toBeInTheDocument();
  expect(screen.getByText('Personalized plan')).toBeInTheDocument();
  expect(screen.getByText('Expert guidance')).toBeInTheDocument();
  expect(screen.getByText('24/7 support')).toBeInTheDocument();
});

it('calculates and displays discount percentage correctly', async () => {
  const mockCategories = [
    {
      id: 'cat-1',
      name: 'Test Category',
      slug: 'test-category',
      serviceCount: 1,
      createdAt: '2024-01-01',
    },
  ];

  const mockServices = [
    {
      id: 'svc-1',
      name: 'Discounted Service',
      slug: 'discounted',
      categoryId: 'cat-1',
      basePrice: 1000,
      salePrice: 600,
      paymentType: 'FULL' as const,
      reviewCount: 80,
      features: ['Feature 1'],
      deliveryMode: 'Online',
      createdAt: '2024-01-01',
    },
  ];

  vi.mocked(categoryAPI.getAll).mockResolvedValue(mockCategories);
  vi.mocked(categoryAPI.getServices).mockResolvedValue({
    data: mockServices,
    total: 1,
  });

  render(<ConditionsSection />);

  // Wait for service to load
  await waitFor(() => {
    expect(screen.getByText('Discounted Service')).toBeInTheDocument();
  });

  // Verify discount badge is displayed (40% discount)
  expect(screen.getByText('40% OFF')).toBeInTheDocument();

  // Verify both prices are shown
  expect(screen.getByText('₹600')).toBeInTheDocument();
  expect(screen.getByText('₹1,000')).toBeInTheDocument();
});

it('displays per-session pricing for services with session count', async () => {
  const mockCategories = [
    {
      id: 'cat-1',
      name: 'Test Category',
      slug: 'test-category',
      serviceCount: 1,
      createdAt: '2024-01-01',
    },
  ];

  const mockServices = [
    {
      id: 'svc-1',
      name: 'Multi-Session Service',
      slug: 'multi-session',
      categoryId: 'cat-1',
      basePrice: 3600,
      sessionCount: 12,
      paymentType: 'FULL' as const,
      reviewCount: 150,
      features: ['12 sessions included'],
      deliveryMode: 'Online',
      createdAt: '2024-01-01',
    },
  ];

  vi.mocked(categoryAPI.getAll).mockResolvedValue(mockCategories);
  vi.mocked(categoryAPI.getServices).mockResolvedValue({
    data: mockServices,
    total: 1,
  });

  render(<ConditionsSection />);

  // Wait for service to load
  await waitFor(() => {
    expect(screen.getByText('Multi-Session Service')).toBeInTheDocument();
  });

  // Verify per-session price is displayed (3600 / 12 = 300)
  expect(screen.getByText('₹300 / session')).toBeInTheDocument();
});

