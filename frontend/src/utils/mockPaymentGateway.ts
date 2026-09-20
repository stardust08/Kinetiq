/**
 * Mock Payment Gateway
 * Simulates a payment gateway for development and testing
 */

export interface PaymentGatewayRequest {
  paymentId: string;
  amount: number;
  transactionId: string;
  returnUrl: string;
}

export interface PaymentGatewayResponse {
  success: boolean;
  transactionId: string;
  status: 'success' | 'failure';
  message: string;
}

/**
 * Mock payment gateway that simulates payment processing
 * In a real application, this would redirect to an actual payment gateway
 */
export class MockPaymentGateway {
  private static readonly PROCESSING_DELAY = 2000; // 2 seconds
  private static readonly SUCCESS_RATE = 1.0; // 100% success rate in dev mode
  private static readonly DEV_MODE = true; // Auto-approve all payments in dev

  /**
   * Simulate payment processing
   * @param request Payment gateway request
   * @returns Promise with payment result
   */
  static async processPayment(
    request: PaymentGatewayRequest
  ): Promise<PaymentGatewayResponse> {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, this.PROCESSING_DELAY));

    // In dev mode, always approve payments
    const isSuccess = this.DEV_MODE ? true : Math.random() < this.SUCCESS_RATE;

    return {
      success: isSuccess,
      transactionId: request.transactionId,
      status: isSuccess ? 'success' : 'failure',
      message: isSuccess
        ? 'Payment processed successfully'
        : 'Payment failed. Please try again.',
    };
  }

  /**
   * Generate a mock transaction ID
   * @returns Random transaction ID
   */
  static generateTransactionId(): string {
    return `TXN${Date.now()}${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
  }

  /**
   * Simulate opening payment gateway in new window
   * In a real app, this would redirect to the actual gateway
   * @param gatewayUrl Gateway URL from backend
   * @param onComplete Callback when payment is complete
   */
  static openPaymentWindow(
    gatewayUrl: string,
    onComplete: (result: PaymentGatewayResponse) => void
  ): void {
    // In a real app, this would open the gateway URL
    // For mock, we'll just simulate the process
    console.log('Opening payment gateway:', gatewayUrl);

    // Simulate payment processing
    const transactionId = this.generateTransactionId();
    const mockRequest: PaymentGatewayRequest = {
      paymentId: new URL(gatewayUrl).searchParams.get('paymentId') || '',
      amount: parseFloat(new URL(gatewayUrl).searchParams.get('amount') || '0'),
      transactionId,
      returnUrl: new URL(gatewayUrl).searchParams.get('returnUrl') || '',
    };

    this.processPayment(mockRequest).then(onComplete);
  }
}
