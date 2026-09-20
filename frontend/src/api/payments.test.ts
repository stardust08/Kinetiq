import { describe, it, expect, vi, beforeEach } from 'vitest';
import { paymentAPI, initiate, verify, payRemaining } from './payments';
import { apiClient } from './client';
import type {
  InitiatePaymentResponse,
  VerifyPaymentResponse,
  PayRemainingResponse,
} from './payments';

vi.mock('./client');

describe('Payment API', () => {
  const mockInitiateResponse: InitiatePaymentResponse = {
    paymentId: 'payment-123',
    gatewayUrl: 'https://mock-gateway.com/pay',
    transactionId: 'TXN_ABC123',
    amount: 199.5,
  };

  const mockVerifyResponse: VerifyPaymentResponse = {
    paymentId: 'payment-123',
    status: 'COMPLETED',
    paidAmount: 399.0,
    remainingAmount: 0.0,
    completedAt: '2024-01-01T12:00:00Z',
  };

  const mockPayRemainingResponse: PayRemainingResponse = {
    paymentId: 'payment-123',
    gatewayUrl: 'https://mock-gateway.com/pay',
    transactionId: 'TXN_XYZ789',
    amount: 199.5,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initiate', () => {
    it('should initiate a payment transaction', async () => {
      vi.mocked(apiClient.post).mockResolvedValue({
        data: { data: mockInitiateResponse },
      });

      const result = await initiate('payment-123');

      expect(apiClient.post).toHaveBeenCalledWith('/api/payments/initiate', {
        paymentId: 'payment-123',
      });
      expect(result).toEqual(mockInitiateResponse);
    });
  });

  describe('verify', () => {
    it('should verify a payment transaction', async () => {
      vi.mocked(apiClient.post).mockResolvedValue({
        data: { data: mockVerifyResponse },
      });

      const result = await verify('payment-123', 'TXN_ABC123', 'success');

      expect(apiClient.post).toHaveBeenCalledWith('/api/payments/verify', {
        paymentId: 'payment-123',
        transactionId: 'TXN_ABC123',
        status: 'success',
      });
      expect(result).toEqual(mockVerifyResponse);
    });

    it('should handle failed payment verification', async () => {
      const failedResponse: VerifyPaymentResponse = {
        paymentId: 'payment-123',
        status: 'FAILED',
        paidAmount: 0.0,
        remainingAmount: 399.0,
      };

      vi.mocked(apiClient.post).mockResolvedValue({
        data: { data: failedResponse },
      });

      const result = await verify('payment-123', 'TXN_ABC123', 'failure');

      expect(result.status).toBe('FAILED');
      expect(result.paidAmount).toBe(0.0);
    });
  });

  describe('payRemaining', () => {
    it('should initiate payment for remaining amount', async () => {
      vi.mocked(apiClient.post).mockResolvedValue({
        data: { data: mockPayRemainingResponse },
      });

      const result = await payRemaining('payment-123');

      expect(apiClient.post).toHaveBeenCalledWith('/api/payments/payment-123/pay-remaining');
      expect(result).toEqual(mockPayRemainingResponse);
    });
  });

  describe('paymentAPI object', () => {
    it('should expose all payment operations', () => {
      expect(paymentAPI.initiate).toBe(initiate);
      expect(paymentAPI.verify).toBe(verify);
      expect(paymentAPI.payRemaining).toBe(payRemaining);
    });
  });
});
