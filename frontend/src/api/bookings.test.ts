import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ValidationError, NetworkError, NotFoundError } from './errors';
import type { Booking, ScreeningCountInfo, PostureAnalysisSummary } from '../types';

// Mock the retry utility - pass through the function call
vi.mock('./retry', () => ({
  withRetry: vi.fn(async (fn) => await fn()),
}));

// Mock the API client
vi.mock('./client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

// Import after mocks are set up
const { apiClient } = await import('./client');
const bookingApi = await import('./bookings');

describe('Booking API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkout', () => {
    const mockCheckoutData = {
      payment: {
        id: 'payment-1',
        userId: 'user-1',
        totalAmount: 100,
        paidAmount: 100,
        remainingAmount: 0,
        status: 'COMPLETED',
        createdAt: '2024-01-01T00:00:00Z',
      },
      bookings: [
        {
          id: 'booking-1',
          userId: 'user-1',
          serviceId: 'service-1',
          status: 'CONFIRMED',
        },
      ] as Booking[],
      paymentDetails: {
        paymentId: 'payment-1',
        amount: 100,
        transactionId: 'txn-1',
        gatewayUrl: 'https://gateway.example.com',
      },
    };

    const mockCheckoutResponse = {
      data: { data: mockCheckoutData },
    };

    it('should create bookings successfully', async () => {
      vi.mocked(apiClient.post).mockResolvedValue(mockCheckoutResponse);

      const result = await bookingApi.checkout('2024-01-15T10:00:00Z');

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/bookings/checkout',
        { scheduledTime: '2024-01-15T10:00:00Z' }
      );
      expect(result).toEqual(mockCheckoutData);
    });

    it('should throw ValidationError when scheduledTime is empty', async () => {
      await expect(bookingApi.checkout('')).rejects.toThrow(ValidationError);
      await expect(bookingApi.checkout('')).rejects.toThrow('Scheduled time is required');
      expect(apiClient.post).not.toHaveBeenCalled();
    });

    it('should handle network errors', async () => {
      const error = new NetworkError('Connection failed');
      vi.mocked(apiClient.post).mockRejectedValue(error);

      await expect(bookingApi.checkout('2024-01-15T10:00:00Z')).rejects.toThrow(NetworkError);
    });

    it('should handle server errors', async () => {
      const error = { response: { status: 500, data: { message: 'Internal server error' } } };
      vi.mocked(apiClient.post).mockRejectedValue(error);

      await expect(bookingApi.checkout('2024-01-15T10:00:00Z')).rejects.toThrow();
    });

    it('should handle partial payment scenarios', async () => {
      const partialPaymentData = {
        ...mockCheckoutData,
        payment: {
          ...mockCheckoutData.payment,
          paidAmount: 50,
          remainingAmount: 50,
          status: 'PARTIAL',
        },
      };

      vi.mocked(apiClient.post).mockResolvedValue({ data: { data: partialPaymentData } });

      const result = await bookingApi.checkout('2024-01-15T10:00:00Z');

      expect(result.payment.paidAmount).toBe(50);
      expect(result.payment.remainingAmount).toBe(50);
      expect(result.payment.status).toBe('PARTIAL');
    });
  });

  describe('getAll', () => {
    const mockBookings: Booking[] = [
      {
        id: 'booking-1',
        userId: 'user-1',
        serviceId: 'service-1',
        status: 'CONFIRMED',
        totalScreeningCount: 10,
        usedScreeningCount: 3,
        remainingScreeningCount: 7,
      } as Booking,
      {
        id: 'booking-2',
        userId: 'user-1',
        serviceId: 'service-2',
        status: 'PENDING',
        totalScreeningCount: 5,
        usedScreeningCount: 0,
        remainingScreeningCount: 5,
      } as Booking,
    ];

    it('should fetch all bookings successfully', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: { data: mockBookings } });

      const result = await bookingApi.getAll();

      expect(apiClient.get).toHaveBeenCalledWith('/api/bookings');
      expect(result).toEqual(mockBookings);
    });

    it('should return empty array when no bookings exist', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: { data: [] } });

      const result = await bookingApi.getAll();

      expect(result).toEqual([]);
    });

    it('should handle network errors', async () => {
      const error = new NetworkError('Connection failed');
      vi.mocked(apiClient.get).mockRejectedValue(error);

      await expect(bookingApi.getAll()).rejects.toThrow(NetworkError);
    });

    it('should include screening count information in bookings', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: { data: mockBookings } });

      const result = await bookingApi.getAll();

      expect(result[0]).toHaveProperty('totalScreeningCount');
      expect(result[0]).toHaveProperty('usedScreeningCount');
      expect(result[0]).toHaveProperty('remainingScreeningCount');
      expect(result[0].totalScreeningCount).toBe(10);
      expect(result[0].usedScreeningCount).toBe(3);
      expect(result[0].remainingScreeningCount).toBe(7);
    });

    it('should handle bookings with zero remaining counts', async () => {
      const exhaustedBooking: Booking[] = [
        {
          id: 'booking-3',
          userId: 'user-1',
          serviceId: 'service-3',
          status: 'CONFIRMED',
          totalScreeningCount: 5,
          usedScreeningCount: 5,
          remainingScreeningCount: 0,
        } as Booking,
      ];

      vi.mocked(apiClient.get).mockResolvedValue({ data: { data: exhaustedBooking } });

      const result = await bookingApi.getAll();

      expect(result[0].remainingScreeningCount).toBe(0);
      expect(result[0].usedScreeningCount).toBe(result[0].totalScreeningCount);
    });
  });

  describe('getById', () => {
    const mockBooking: Booking = {
      id: 'booking-1',
      userId: 'user-1',
      serviceId: 'service-1',
      status: 'CONFIRMED',
      totalScreeningCount: 10,
      usedScreeningCount: 3,
      remainingScreeningCount: 7,
    } as Booking;

    it('should fetch booking by ID successfully', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: { data: mockBooking } });

      const result = await bookingApi.getById('booking-1');

      expect(apiClient.get).toHaveBeenCalledWith('/api/bookings/booking-1');
      expect(result).toEqual(mockBooking);
    });

    it('should throw ValidationError when ID is empty', async () => {
      await expect(bookingApi.getById('')).rejects.toThrow(ValidationError);
      await expect(bookingApi.getById('')).rejects.toThrow('Booking ID is required');
      expect(apiClient.get).not.toHaveBeenCalled();
    });

    it('should handle NotFoundError', async () => {
      const error = new NotFoundError('Booking not found');
      vi.mocked(apiClient.get).mockRejectedValue(error);

      await expect(bookingApi.getById('invalid-id')).rejects.toThrow(NotFoundError);
    });

    it('should include service and payment details when available', async () => {
      const bookingWithDetails: Booking = {
        ...mockBooking,
        service: {
          id: 'service-1',
          name: 'Posture Analysis',
          basePrice: 100,
        },
        payment: {
          id: 'payment-1',
          totalAmount: 100,
          status: 'COMPLETED',
        },
      } as Booking;

      vi.mocked(apiClient.get).mockResolvedValue({ data: { data: bookingWithDetails } });

      const result = await bookingApi.getById('booking-1');

      expect(result.service).toBeDefined();
      expect(result.payment).toBeDefined();
      expect(result.service?.name).toBe('Posture Analysis');
      expect(result.payment?.status).toBe('COMPLETED');
    });

    it('should handle authentication errors', async () => {
      const error = { response: { status: 401, data: { message: 'Unauthorized' } } };
      vi.mocked(apiClient.get).mockRejectedValue(error);

      await expect(bookingApi.getById('booking-1')).rejects.toThrow();
    });
  });

  describe('getMyBookings', () => {
    const mockBookings: Booking[] = [
      {
        id: 'booking-1',
        userId: 'user-1',
        serviceId: 'service-1',
        status: 'CONFIRMED',
      } as Booking,
    ];

    it('should call getAll internally', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: { data: mockBookings } });

      const result = await bookingApi.getMyBookings();

      expect(apiClient.get).toHaveBeenCalledWith('/api/bookings');
      expect(result).toEqual(mockBookings);
    });
  });

  describe('getScreeningInfo', () => {
    const mockScreeningInfo: ScreeningCountInfo = {
      bookingId: 'booking-1',
      serviceName: 'Posture Analysis Package',
      totalScreeningCount: 10,
      usedScreeningCount: 3,
      remainingScreeningCount: 7,
      assessments: [],
      bookingStatus: 'CONFIRMED',
    };

    it('should fetch screening info successfully', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: { data: mockScreeningInfo } });

      const result = await bookingApi.getScreeningInfo('booking-1');

      expect(apiClient.get).toHaveBeenCalledWith('/api/bookings/booking-1/screening-info');
      expect(result).toEqual(mockScreeningInfo);
    });

    it('should throw ValidationError when bookingId is empty', async () => {
      await expect(bookingApi.getScreeningInfo('')).rejects.toThrow(ValidationError);
      await expect(bookingApi.getScreeningInfo('')).rejects.toThrow('Booking ID is required');
      expect(apiClient.get).not.toHaveBeenCalled();
    });

    it('should handle NotFoundError', async () => {
      const error = new NotFoundError('Booking not found');
      vi.mocked(apiClient.get).mockRejectedValue(error);

      await expect(bookingApi.getScreeningInfo('invalid-id')).rejects.toThrow(NotFoundError);
    });

    it('should include assessment history in screening info', async () => {
      const infoWithAssessments: ScreeningCountInfo = {
        ...mockScreeningInfo,
        assessments: [
          { id: 'analysis-1', analysisDate: '2024-01-01T00:00:00Z', status: 'completed' },
          { id: 'analysis-2', analysisDate: '2024-01-02T00:00:00Z', status: 'completed' },
        ],
      };

      vi.mocked(apiClient.get).mockResolvedValue({ data: { data: infoWithAssessments } });

      const result = await bookingApi.getScreeningInfo('booking-1');

      expect(result.assessments).toHaveLength(2);
      expect(result.assessments[0]).toHaveProperty('id');
      expect(result.assessments[0]).toHaveProperty('analysisDate');
      expect(result.assessments[0]).toHaveProperty('status');
    });

    it('should handle screening info with zero remaining counts', async () => {
      const exhaustedInfo: ScreeningCountInfo = {
        ...mockScreeningInfo,
        usedScreeningCount: 10,
        remainingScreeningCount: 0,
      };

      vi.mocked(apiClient.get).mockResolvedValue({ data: { data: exhaustedInfo } });

      const result = await bookingApi.getScreeningInfo('booking-1');

      expect(result.remainingScreeningCount).toBe(0);
      expect(result.usedScreeningCount).toBe(result.totalScreeningCount);
    });

    it('should validate screening count consistency', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: { data: mockScreeningInfo } });

      const result = await bookingApi.getScreeningInfo('booking-1');

      // Verify that total = used + remaining
      expect(result.totalScreeningCount).toBe(
        result.usedScreeningCount + result.remainingScreeningCount
      );
    });
  });

  describe('getBookingAssessments', () => {
    const mockAssessments: PostureAnalysisSummary[] = [
      {
        id: 'analysis-1',
        analysisDate: '2024-01-01T00:00:00Z',
        status: 'completed',
      },
      {
        id: 'analysis-2',
        analysisDate: '2024-01-02T00:00:00Z',
        status: 'completed',
      },
    ];

    it('should fetch booking assessments successfully', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: { data: mockAssessments } });

      const result = await bookingApi.getBookingAssessments('booking-1');

      expect(apiClient.get).toHaveBeenCalledWith('/api/bookings/booking-1/assessments');
      expect(result).toEqual(mockAssessments);
    });

    it('should return empty array when no assessments exist', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: { data: [] } });

      const result = await bookingApi.getBookingAssessments('booking-1');

      expect(result).toEqual([]);
    });

    it('should throw ValidationError when bookingId is empty', async () => {
      await expect(bookingApi.getBookingAssessments('')).rejects.toThrow(ValidationError);
      await expect(bookingApi.getBookingAssessments('')).rejects.toThrow('Booking ID is required');
      expect(apiClient.get).not.toHaveBeenCalled();
    });

    it('should handle NotFoundError', async () => {
      const error = new NotFoundError('Booking not found');
      vi.mocked(apiClient.get).mockRejectedValue(error);

      await expect(bookingApi.getBookingAssessments('invalid-id')).rejects.toThrow(NotFoundError);
    });

    it('should handle assessments with different statuses', async () => {
      const mixedStatusAssessments: PostureAnalysisSummary[] = [
        {
          id: 'analysis-1',
          analysisDate: '2024-01-01T00:00:00Z',
          status: 'completed',
        },
        {
          id: 'analysis-2',
          analysisDate: '2024-01-02T00:00:00Z',
          status: 'failed',
        },
        {
          id: 'analysis-3',
          analysisDate: '2024-01-03T00:00:00Z',
          status: 'cancelled',
        },
      ];

      vi.mocked(apiClient.get).mockResolvedValue({ data: { data: mixedStatusAssessments } });

      const result = await bookingApi.getBookingAssessments('booking-1');

      expect(result).toHaveLength(3);
      expect(result[0].status).toBe('completed');
      expect(result[1].status).toBe('failed');
      expect(result[2].status).toBe('cancelled');
    });

    it('should preserve assessment date ordering', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: { data: mockAssessments } });

      const result = await bookingApi.getBookingAssessments('booking-1');

      expect(result[0].analysisDate).toBe('2024-01-01T00:00:00Z');
      expect(result[1].analysisDate).toBe('2024-01-02T00:00:00Z');
    });
  });

  describe('bookingAPI object', () => {
    it('should export all API methods', () => {
      expect(bookingApi.bookingAPI).toHaveProperty('checkout');
      expect(bookingApi.bookingAPI).toHaveProperty('getAll');
      expect(bookingApi.bookingAPI).toHaveProperty('getById');
      expect(bookingApi.bookingAPI).toHaveProperty('getMyBookings');
      expect(bookingApi.bookingAPI).toHaveProperty('getScreeningInfo');
      expect(bookingApi.bookingAPI).toHaveProperty('getBookingAssessments');
    });

    it('should have all methods as functions', () => {
      expect(typeof bookingApi.bookingAPI.checkout).toBe('function');
      expect(typeof bookingApi.bookingAPI.getAll).toBe('function');
      expect(typeof bookingApi.bookingAPI.getById).toBe('function');
      expect(typeof bookingApi.bookingAPI.getMyBookings).toBe('function');
      expect(typeof bookingApi.bookingAPI.getScreeningInfo).toBe('function');
      expect(typeof bookingApi.bookingAPI.getBookingAssessments).toBe('function');
    });
  });

  describe('Response Format Validation', () => {
    it('should validate checkout response structure', async () => {
      const mockResponse = {
        data: {
          data: {
            payment: {
              id: 'payment-1',
              userId: 'user-1',
              totalAmount: 100,
              paidAmount: 100,
              remainingAmount: 0,
              status: 'COMPLETED',
              createdAt: '2024-01-01T00:00:00Z',
            },
            bookings: [
              {
                id: 'booking-1',
                userId: 'user-1',
                serviceId: 'service-1',
                status: 'CONFIRMED',
              },
            ],
            paymentDetails: {
              paymentId: 'payment-1',
              amount: 100,
              transactionId: 'txn-1',
              gatewayUrl: 'https://gateway.example.com',
            },
          },
        },
      };

      vi.mocked(apiClient.post).mockResolvedValue(mockResponse);

      const result = await bookingApi.checkout('2024-01-15T10:00:00Z');

      expect(result).toHaveProperty('payment');
      expect(result).toHaveProperty('bookings');
      expect(result).toHaveProperty('paymentDetails');
      expect(result.payment).toHaveProperty('id');
      expect(result.payment).toHaveProperty('status');
      expect(result.paymentDetails).toHaveProperty('gatewayUrl');
    });

    it('should validate booking response structure', async () => {
      const mockBooking = {
        id: 'booking-1',
        userId: 'user-1',
        serviceId: 'service-1',
        paymentId: 'payment-1',
        totalAmount: 100,
        paidAmount: 100,
        remainingAmount: 0,
        time: '2024-01-15T10:00:00Z',
        status: 'CONFIRMED',
        createdAt: '2024-01-01T00:00:00Z',
        totalScreeningCount: 10,
        usedScreeningCount: 3,
        remainingScreeningCount: 7,
      } as Booking;

      vi.mocked(apiClient.get).mockResolvedValue({ data: { data: mockBooking } });

      const result = await bookingApi.getById('booking-1');

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('userId');
      expect(result).toHaveProperty('serviceId');
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('totalScreeningCount');
      expect(result).toHaveProperty('usedScreeningCount');
      expect(result).toHaveProperty('remainingScreeningCount');
    });

    it('should validate screening info response structure', async () => {
      const mockScreeningInfo: ScreeningCountInfo = {
        bookingId: 'booking-1',
        serviceName: 'Posture Analysis',
        totalScreeningCount: 10,
        usedScreeningCount: 3,
        remainingScreeningCount: 7,
        assessments: [
          {
            id: 'analysis-1',
            analysisDate: '2024-01-01T00:00:00Z',
            status: 'completed',
          },
        ],
        bookingStatus: 'CONFIRMED',
      };

      vi.mocked(apiClient.get).mockResolvedValue({ data: { data: mockScreeningInfo } });

      const result = await bookingApi.getScreeningInfo('booking-1');

      expect(result).toHaveProperty('bookingId');
      expect(result).toHaveProperty('serviceName');
      expect(result).toHaveProperty('totalScreeningCount');
      expect(result).toHaveProperty('usedScreeningCount');
      expect(result).toHaveProperty('remainingScreeningCount');
      expect(result).toHaveProperty('assessments');
      expect(result).toHaveProperty('bookingStatus');
      expect(Array.isArray(result.assessments)).toBe(true);
    });

    it('should validate assessment response structure', async () => {
      const mockAssessments: PostureAnalysisSummary[] = [
        {
          id: 'analysis-1',
          analysisDate: '2024-01-01T00:00:00Z',
          status: 'completed',
        },
      ];

      vi.mocked(apiClient.get).mockResolvedValue({ data: { data: mockAssessments } });

      const result = await bookingApi.getBookingAssessments('booking-1');

      expect(Array.isArray(result)).toBe(true);
      expect(result[0]).toHaveProperty('id');
      expect(result[0]).toHaveProperty('analysisDate');
      expect(result[0]).toHaveProperty('status');
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed response data', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: { data: null } });

      const result = await bookingApi.getAll();

      expect(result).toBeNull();
    });

    it('should handle missing nested data', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: {} });

      const result = await bookingApi.getAll();

      expect(result).toBeUndefined();
    });

    it('should propagate server errors correctly', async () => {
      const serverError = { response: { status: 500, data: { message: 'Internal server error' } } };
      vi.mocked(apiClient.get).mockRejectedValue(serverError);

      await expect(bookingApi.getAll()).rejects.toThrow();
    });

    it('should handle timeout errors', async () => {
      const timeoutError = { code: 'ECONNABORTED', message: 'timeout of 5000ms exceeded' };
      vi.mocked(apiClient.get).mockRejectedValue(timeoutError);

      await expect(bookingApi.getAll()).rejects.toThrow();
    });
  });
});
