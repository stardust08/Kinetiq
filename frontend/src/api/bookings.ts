import { apiClient } from './client';
import { Booking, ScreeningCountInfo, PostureAnalysisSummary } from '../types';
import { withRetry } from './retry';
import { ValidationError } from './errors';

/**
 * Booking API functions for managing booking operations
 */

/**
 * Checkout request payload
 */
export interface CheckoutRequest {
  scheduledTime: string;
}

/**
 * Payment details returned from checkout
 */
export interface PaymentDetails {
  paymentId: string;
  amount: number;
  transactionId: string;
  gatewayUrl: string;
}

/**
 * Checkout response containing payment and booking information
 */
export interface CheckoutResponse {
  payment: {
    id: string;
    userId: string;
    totalAmount: number;
    paidAmount: number;
    remainingAmount: number;
    status: string;
    transactionId?: string;
    createdAt: string;
  };
  bookings: Booking[];
  paymentDetails: PaymentDetails;
}

/**
 * Create bookings from cart and initiate payment
 * @param scheduledTime - ISO 8601 formatted date/time string for the booking
 * @returns Promise with checkout response including payment and booking details
 * @throws {ValidationError} If scheduledTime is invalid
 * @throws {NetworkError} If network request fails
 * @throws {ServerError} If server returns 5xx error
 */
export const checkout = async (scheduledTime: string, lockId?: string): Promise<CheckoutResponse> => {
  if (!scheduledTime) {
    throw new ValidationError('Scheduled time is required');
  }

  return withRetry(
    async () => {
      const response = await apiClient.post<{ data: CheckoutResponse }>(
        '/api/bookings/checkout',
        { scheduledTime,lockId }
      );
      return response.data.data;
    },
    { maxRetries: 2 } // Retry checkout up to 2 times
  );
};

/**
 * Get all bookings for the current user
 * @returns Promise with array of bookings including service and payment details
 * @throws {AuthenticationError} If user is not authenticated
 * @throws {NetworkError} If network request fails
 * @throws {ServerError} If server returns 5xx error
 */
export const getAll = async (): Promise<Booking[]> => {
  return withRetry(
    async () => {
      const response = await apiClient.get<{ data: Booking[] }>('/api/bookings');
      return response.data.data;
    },
    { maxRetries: 2, initialDelay: 200 } // fast retry for a simple read
  );
};

/**
 * Get detailed information for a specific booking
 * @param id - UUID of the booking to retrieve
 * @returns Promise with booking details including service and payment information
 * @throws {ValidationError} If booking ID is invalid
 * @throws {NotFoundError} If booking doesn't exist
 * @throws {AuthenticationError} If user doesn't have access to this booking
 * @throws {NetworkError} If network request fails
 * @throws {ServerError} If server returns 5xx error
 */
export const getById = async (id: string): Promise<Booking> => {
  if (!id) {
    throw new ValidationError('Booking ID is required');
  }

  return withRetry(
    async () => {
      const response = await apiClient.get<{ data: Booking }>(`/api/bookings/${id}`);
      return response.data.data;
    },
    { maxRetries: 3 }
  );
};

/**
 * Get all bookings for the current user with screening count information
 * This is an alias for getAll() that explicitly includes screening counts
 * @returns Promise with array of bookings including screening count details
 * @throws {AuthenticationError} If user is not authenticated
 * @throws {NetworkError} If network request fails
 * @throws {ServerError} If server returns 5xx error
 */
export const getMyBookings = async (): Promise<Booking[]> => {
  return getAll();
};

/**
 * Get detailed screening count information for a specific booking
 * @param bookingId - UUID of the booking to retrieve screening info for
 * @returns Promise with screening count details and assessment history
 * @throws {ValidationError} If booking ID is invalid
 * @throws {NotFoundError} If booking doesn't exist
 * @throws {AuthenticationError} If user doesn't have access to this booking
 * @throws {NetworkError} If network request fails
 * @throws {ServerError} If server returns 5xx error
 */
export const getScreeningInfo = async (bookingId: string): Promise<ScreeningCountInfo> => {
  if (!bookingId) {
    throw new ValidationError('Booking ID is required');
  }

  return withRetry(
    async () => {
      const response = await apiClient.get<{ data: ScreeningCountInfo }>(
        `/api/bookings/${bookingId}/screening-info`
      );
      return response.data.data;
    },
    { maxRetries: 3 }
  );
};

/**
 * Get all posture assessments for a specific booking
 * @param bookingId - UUID of the booking to retrieve assessments for
 * @returns Promise with array of posture analysis summaries
 * @throws {ValidationError} If booking ID is invalid
 * @throws {NotFoundError} If booking doesn't exist
 * @throws {AuthenticationError} If user doesn't have access to this booking
 * @throws {NetworkError} If network request fails
 * @throws {ServerError} If server returns 5xx error
 */
export const getBookingAssessments = async (bookingId: string): Promise<PostureAnalysisSummary[]> => {
  if (!bookingId) {
    throw new ValidationError('Booking ID is required');
  }

  return withRetry(
    async () => {
      const response = await apiClient.get<{ data: PostureAnalysisSummary[] }>(
        `/api/bookings/${bookingId}/assessments`
      );
      return response.data.data;
    },
    { maxRetries: 3 }
  );
};

/**
 * Cancel a booking (PENDING or CONFIRMED only).
 * @param id - UUID of the booking to cancel
 * @returns Promise with the updated booking record (status: CANCELLED)
 * @throws {ValidationError} If booking ID is invalid
 * @throws {NotFoundError} If booking doesn't exist
 */
export const cancelBooking = async (id: string): Promise<Booking> => {
  if (!id) {
    throw new ValidationError('Booking ID is required');
  }

  const response = await apiClient.patch<{ data: Booking }>(
    `/api/bookings/${id}/cancel`
  );
  return response.data.data;
};

/**
 * Booking API object for convenient access to all booking operations
 */
export const bookingAPI = {
  checkout,
  getAll,
  getById,
  getMyBookings,
  getScreeningInfo,
  getBookingAssessments,
  cancelBooking,
};
