import { apiClient } from './client';

/**
 * Payment API functions for managing payment operations
 */

/**
 * Request payload for initiating a payment
 */
export interface InitiatePaymentRequest {
  paymentId: string;
}

/**
 * Response from initiating a payment
 */
export interface InitiatePaymentResponse {
  paymentId: string;
  gatewayUrl: string;
  transactionId: string;
  amount: number;
}

/**
 * Request payload for verifying a payment
 */
export interface VerifyPaymentRequest {
  paymentId: string;
  transactionId: string;
  status: string;
}

/**
 * Response from verifying a payment
 */
export interface VerifyPaymentResponse {
  paymentId: string;
  status: string;
  paidAmount: number;
  remainingAmount: number;
  completedAt?: string;
}

/**
 * Response from paying remaining amount
 */
export interface PayRemainingResponse {
  paymentId: string;
  gatewayUrl: string;
  transactionId: string;
  amount: number;
}

/**
 * Initiate a payment transaction
 * @param paymentId - UUID of the payment to initiate
 * @returns Promise with payment initiation details including gateway URL
 */
export const initiate = async (paymentId: string): Promise<InitiatePaymentResponse> => {
  const response = await apiClient.post<{ data: InitiatePaymentResponse }>(
    '/api/payments/initiate',
    { paymentId }
  );
  return response.data.data;
};

/**
 * Verify a payment transaction after gateway callback
 * @param paymentId - UUID of the payment to verify
 * @param transactionId - Transaction ID from payment gateway
 * @param status - Payment status from gateway (success/failure)
 * @returns Promise with verified payment details
 */
export const verify = async (
  paymentId: string,
  transactionId: string,
  status: string
): Promise<VerifyPaymentResponse> => {
  const response = await apiClient.post<{ data: VerifyPaymentResponse }>(
    '/api/payments/verify',
    { paymentId, transactionId, status }
  );
  return response.data.data;
};

/**
 * Initiate payment for remaining amount on a partial payment
 * @param paymentId - UUID of the payment to complete
 * @returns Promise with payment initiation details for remaining amount
 */
export const payRemaining = async (paymentId: string): Promise<PayRemainingResponse> => {
  const response = await apiClient.post<{ data: PayRemainingResponse }>(
    `/api/payments/${paymentId}/pay-remaining`
  );
  return response.data.data;
};

/**
 * Payment API object for convenient access to all payment operations
 */
export const paymentAPI = {
  initiate,
  verify,
  payRemaining,
};
