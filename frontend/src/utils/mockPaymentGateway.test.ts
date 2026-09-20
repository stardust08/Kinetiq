import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockPaymentGateway, PaymentGatewayRequest } from './mockPaymentGateway';

describe('MockPaymentGateway', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateTransactionId', () => {
    it('should generate a unique transaction ID', () => {
      const id1 = MockPaymentGateway.generateTransactionId();
      const id2 = MockPaymentGateway.generateTransactionId();
      
      expect(id1).toMatch(/^TXN\d+[A-Z0-9]+$/);
      expect(id2).toMatch(/^TXN\d+[A-Z0-9]+$/);
      expect(id1).not.toBe(id2);
    });

    it('should start with TXN prefix', () => {
      const id = MockPaymentGateway.generateTransactionId();
      expect(id).toMatch(/^TXN/);
    });
  });

  describe('processPayment', () => {
    it('should process payment successfully', async () => {
      const request: PaymentGatewayRequest = {
        paymentId: 'payment-123',
        amount: 100,
        transactionId: 'TXN123',
        returnUrl: 'http://localhost/callback',
      };

      const result = await MockPaymentGateway.processPayment(request);

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('transactionId', 'TXN123');
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('message');
      expect(['success', 'failure']).toContain(result.status);
    });

    it('should simulate processing delay', async () => {
      const request: PaymentGatewayRequest = {
        paymentId: 'payment-123',
        amount: 100,
        transactionId: 'TXN123',
        returnUrl: 'http://localhost/callback',
      };

      const startTime = Date.now();
      await MockPaymentGateway.processPayment(request);
      const endTime = Date.now();

      expect(endTime - startTime).toBeGreaterThanOrEqual(2000);
    });

    it('should return success status when payment succeeds', async () => {
      const request: PaymentGatewayRequest = {
        paymentId: 'payment-123',
        amount: 100,
        transactionId: 'TXN123',
        returnUrl: 'http://localhost/callback',
      };

      // Run multiple times to test success rate
      const results = await Promise.all(
        Array(10).fill(null).map(() => MockPaymentGateway.processPayment(request))
      );

      const successCount = results.filter(r => r.status === 'success').length;
      expect(successCount).toBeGreaterThan(0);
    });

    it('should return correct message for success', async () => {
      const request: PaymentGatewayRequest = {
        paymentId: 'payment-123',
        amount: 100,
        transactionId: 'TXN123',
        returnUrl: 'http://localhost/callback',
      };

      // Mock Math.random to ensure success
      vi.spyOn(Math, 'random').mockReturnValue(0.5);

      const result = await MockPaymentGateway.processPayment(request);

      expect(result.success).toBe(true);
      expect(result.status).toBe('success');
      expect(result.message).toBe('Payment processed successfully');
    });

    it('should return correct message for failure', async () => {
      const request: PaymentGatewayRequest = {
        paymentId: 'payment-123',
        amount: 100,
        transactionId: 'TXN123',
        returnUrl: 'http://localhost/callback',
      };

      // Mock Math.random to ensure failure
      vi.spyOn(Math, 'random').mockReturnValue(0.95);

      const result = await MockPaymentGateway.processPayment(request);

      expect(result.success).toBe(false);
      expect(result.status).toBe('failure');
      expect(result.message).toBe('Payment failed. Please try again.');
    });
  });

  describe('openPaymentWindow', () => {
    it('should call onComplete callback with payment result', async () => {
      const gatewayUrl = 'http://gateway.test?paymentId=payment-123&amount=100&returnUrl=http://localhost/callback';
      const onComplete = vi.fn();

      MockPaymentGateway.openPaymentWindow(gatewayUrl, onComplete);

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 2500));

      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(onComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          success: expect.any(Boolean),
          transactionId: expect.stringMatching(/^TXN/),
          status: expect.stringMatching(/^(success|failure)$/),
          message: expect.any(String),
        })
      );
    });

    it('should extract payment details from gateway URL', async () => {
      const gatewayUrl = 'http://gateway.test?paymentId=payment-456&amount=250.50&returnUrl=http://localhost/callback';
      const onComplete = vi.fn();

      MockPaymentGateway.openPaymentWindow(gatewayUrl, onComplete);

      await new Promise(resolve => setTimeout(resolve, 2500));

      expect(onComplete).toHaveBeenCalled();
    });

    it('should log gateway URL to console', () => {
      const consoleSpy = vi.spyOn(console, 'log');
      const gatewayUrl = 'http://gateway.test?paymentId=payment-123&amount=100&returnUrl=http://localhost/callback';
      const onComplete = vi.fn();

      MockPaymentGateway.openPaymentWindow(gatewayUrl, onComplete);

      expect(consoleSpy).toHaveBeenCalledWith('Opening payment gateway:', gatewayUrl);
    });
  });
});
