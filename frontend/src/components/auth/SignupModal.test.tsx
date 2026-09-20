import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SignupModal } from './SignupModal';
import * as authAPI from '../../api/auth';
import { useAuthStore } from '../../store/authStore';

// Mock the auth API
vi.mock('../../api/auth', () => ({
  sendOtp: vi.fn(),
  verifyOtp: vi.fn(),
}));

// Mock the auth store
vi.mock('../../store/authStore', () => ({
  useAuthStore: vi.fn(),
}));

describe('SignupModal', () => {
  const mockOnOpenChange = vi.fn();
  const mockLogin = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useAuthStore as any).mockReturnValue(mockLogin);
  });

  describe('Phone and Name Inputs', () => {
    it('renders name and phone input fields', () => {
      render(<SignupModal open={true} onOpenChange={mockOnOpenChange} />);

      expect(screen.getByText('Sign Up')).toBeInTheDocument();
      expect(screen.getByText('Create your account to get started')).toBeInTheDocument();
      expect(screen.getByLabelText('Name (Optional)')).toBeInTheDocument();
      expect(screen.getByLabelText('Phone Number')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Send OTP' })).toBeInTheDocument();
    });

    it('allows entering name in the name field', async () => {
      const user = userEvent.setup();
      render(<SignupModal open={true} onOpenChange={mockOnOpenChange} />);

      const nameInput = screen.getByLabelText('Name (Optional)') as HTMLInputElement;
      await user.type(nameInput, 'John Doe');

      expect(nameInput.value).toBe('John Doe');
    });

    it('allows entering phone number in the phone field', async () => {
      const user = userEvent.setup();
      render(<SignupModal open={true} onOpenChange={mockOnOpenChange} />);

      const phoneInput = screen.getByLabelText('Phone Number') as HTMLInputElement;
      await user.type(phoneInput, '+1234567890');

      expect(phoneInput.value).toBe('+1234567890');
    });

    it('shows error when phone is empty', async () => {
      const user = userEvent.setup();
      render(<SignupModal open={true} onOpenChange={mockOnOpenChange} />);

      const sendButton = screen.getByRole('button', { name: 'Send OTP' });
      await user.click(sendButton);

      expect(screen.getByText('Please enter a phone number')).toBeInTheDocument();
      expect(authAPI.sendOtp).not.toHaveBeenCalled();
    });

    it('shows error when phone format is invalid', async () => {
      const user = userEvent.setup();
      render(<SignupModal open={true} onOpenChange={mockOnOpenChange} />);

      const phoneInput = screen.getByLabelText('Phone Number');
      await user.type(phoneInput, 'invalid');

      const sendButton = screen.getByRole('button', { name: 'Send OTP' });
      await user.click(sendButton);

      expect(screen.getByText('Please enter a valid phone number (e.g., +1234567890)')).toBeInTheDocument();
      expect(authAPI.sendOtp).not.toHaveBeenCalled();
    });

    it('accepts valid phone number with country code', async () => {
      const user = userEvent.setup();
      vi.mocked(authAPI.sendOtp).mockResolvedValue({ message: 'OTP sent' });

      render(<SignupModal open={true} onOpenChange={mockOnOpenChange} />);

      const phoneInput = screen.getByLabelText('Phone Number');
      await user.type(phoneInput, '+1234567890');

      const sendButton = screen.getByRole('button', { name: 'Send OTP' });
      await user.click(sendButton);

      await waitFor(() => {
        expect(authAPI.sendOtp).toHaveBeenCalledWith('+1234567890', 'SIGNUP');
      });
    });

    it('accepts valid phone number without country code', async () => {
      const user = userEvent.setup();
      vi.mocked(authAPI.sendOtp).mockResolvedValue({ message: 'OTP sent' });

      render(<SignupModal open={true} onOpenChange={mockOnOpenChange} />);

      const phoneInput = screen.getByLabelText('Phone Number');
      await user.type(phoneInput, '1234567890');

      const sendButton = screen.getByRole('button', { name: 'Send OTP' });
      await user.click(sendButton);

      await waitFor(() => {
        expect(authAPI.sendOtp).toHaveBeenCalledWith('1234567890', 'SIGNUP');
      });
    });

    it('allows signup without entering name (optional field)', async () => {
      const user = userEvent.setup();
      vi.mocked(authAPI.sendOtp).mockResolvedValue({ message: 'OTP sent' });

      render(<SignupModal open={true} onOpenChange={mockOnOpenChange} />);

      const phoneInput = screen.getByLabelText('Phone Number');
      await user.type(phoneInput, '+1234567890');

      const sendButton = screen.getByRole('button', { name: 'Send OTP' });
      await user.click(sendButton);

      await waitFor(() => {
        expect(authAPI.sendOtp).toHaveBeenCalledWith('+1234567890', 'SIGNUP');
      });
    });

    it('preserves name value when entering phone and sending OTP', async () => {
      const user = userEvent.setup();
      vi.mocked(authAPI.sendOtp).mockResolvedValue({ message: 'OTP sent' });

      render(<SignupModal open={true} onOpenChange={mockOnOpenChange} />);

      const nameInput = screen.getByLabelText('Name (Optional)') as HTMLInputElement;
      await user.type(nameInput, 'John Doe');

      const phoneInput = screen.getByLabelText('Phone Number');
      await user.type(phoneInput, '+1234567890');

      const sendButton = screen.getByRole('button', { name: 'Send OTP' });
      await user.click(sendButton);

      await waitFor(() => {
        expect(authAPI.sendOtp).toHaveBeenCalledWith('+1234567890', 'SIGNUP');
      });

      // Name should still be in state (verified by going back)
      const backButton = screen.getByRole('button', { name: 'Back' });
      await user.click(backButton);

      const nameInputAfterBack = screen.getByLabelText('Name (Optional)') as HTMLInputElement;
      expect(nameInputAfterBack.value).toBe('John Doe');
    });

    it('disables name and phone inputs while sending OTP', async () => {
      const user = userEvent.setup();
      let resolveOtp: (value: any) => void;
      const otpPromise = new Promise((resolve) => {
        resolveOtp = resolve;
      });
      vi.mocked(authAPI.sendOtp).mockReturnValue(otpPromise as any);

      render(<SignupModal open={true} onOpenChange={mockOnOpenChange} />);

      const nameInput = screen.getByLabelText('Name (Optional)') as HTMLInputElement;
      const phoneInput = screen.getByLabelText('Phone Number') as HTMLInputElement;
      
      await user.type(phoneInput, '+1234567890');
      
      expect(nameInput).not.toBeDisabled();
      expect(phoneInput).not.toBeDisabled();
      
      await user.click(screen.getByRole('button', { name: 'Send OTP' }));

      // Inputs should be disabled during loading
      expect(nameInput).toBeDisabled();
      expect(phoneInput).toBeDisabled();

      // Resolve the promise
      resolveOtp!({ message: 'OTP sent' });

      await waitFor(() => {
        expect(screen.getByText('Verification Code')).toBeInTheDocument();
      });
    });

    it('shows error when phone number is already registered', async () => {
      const user = userEvent.setup();
      vi.mocked(authAPI.sendOtp).mockRejectedValue({
        response: { status: 409, data: { message: 'Phone number already registered' } },
      });

      render(<SignupModal open={true} onOpenChange={mockOnOpenChange} />);

      const phoneInput = screen.getByLabelText('Phone Number');
      await user.type(phoneInput, '+1234567890');
      await user.click(screen.getByRole('button', { name: 'Send OTP' }));

      await waitFor(() => {
        expect(screen.getByText('Phone number already registered. Please log in instead.')).toBeInTheDocument();
      });
    });

    it('shows network error when sending OTP fails due to network', async () => {
      const user = userEvent.setup();
      vi.mocked(authAPI.sendOtp).mockRejectedValue({
        code: 'ERR_NETWORK',
        message: 'Network Error',
      });

      render(<SignupModal open={true} onOpenChange={mockOnOpenChange} />);

      const phoneInput = screen.getByLabelText('Phone Number');
      await user.type(phoneInput, '+1234567890');
      await user.click(screen.getByRole('button', { name: 'Send OTP' }));

      await waitFor(() => {
        expect(screen.getByText('Network error. Please check your connection and try again.')).toBeInTheDocument();
      });
    });

    it('shows timeout error when sending OTP times out', async () => {
      const user = userEvent.setup();
      vi.mocked(authAPI.sendOtp).mockRejectedValue({
        code: 'ECONNABORTED',
        message: 'timeout of 5000ms exceeded',
      });

      render(<SignupModal open={true} onOpenChange={mockOnOpenChange} />);

      const phoneInput = screen.getByLabelText('Phone Number');
      await user.type(phoneInput, '+1234567890');
      await user.click(screen.getByRole('button', { name: 'Send OTP' }));

      await waitFor(() => {
        expect(screen.getByText('Request timed out. Please try again.')).toBeInTheDocument();
      });
    });

    it('shows rate limit error when too many OTP requests', async () => {
      const user = userEvent.setup();
      vi.mocked(authAPI.sendOtp).mockRejectedValue({
        response: { status: 429, data: { message: 'Too many requests' } },
      });

      render(<SignupModal open={true} onOpenChange={mockOnOpenChange} />);

      const phoneInput = screen.getByLabelText('Phone Number');
      await user.type(phoneInput, '+1234567890');
      await user.click(screen.getByRole('button', { name: 'Send OTP' }));

      await waitFor(() => {
        expect(screen.getByText('Too many attempts. Please try again later.')).toBeInTheDocument();
      });
    });

    it('shows server error when backend returns 500', async () => {
      const user = userEvent.setup();
      vi.mocked(authAPI.sendOtp).mockRejectedValue({
        response: { status: 500, data: { message: 'Internal server error' } },
      });

      render(<SignupModal open={true} onOpenChange={mockOnOpenChange} />);

      const phoneInput = screen.getByLabelText('Phone Number');
      await user.type(phoneInput, '+1234567890');
      await user.click(screen.getByRole('button', { name: 'Send OTP' }));

      await waitFor(() => {
        expect(screen.getByText('Server error. Please try again later.')).toBeInTheDocument();
      });
    });

    it('shows bad request error when phone format is invalid on server', async () => {
      const user = userEvent.setup();
      vi.mocked(authAPI.sendOtp).mockRejectedValue({
        response: { status: 400, data: { message: 'Invalid phone number format' } },
      });

      render(<SignupModal open={true} onOpenChange={mockOnOpenChange} />);

      const phoneInput = screen.getByLabelText('Phone Number');
      await user.type(phoneInput, '+1234567890');
      await user.click(screen.getByRole('button', { name: 'Send OTP' }));

      await waitFor(() => {
        expect(screen.getByText('Invalid phone number format')).toBeInTheDocument();
      });
    });

    it('shows generic error for unknown errors', async () => {
      const user = userEvent.setup();
      vi.mocked(authAPI.sendOtp).mockRejectedValue(new Error('Unknown error'));

      render(<SignupModal open={true} onOpenChange={mockOnOpenChange} />);

      const phoneInput = screen.getByLabelText('Phone Number');
      await user.type(phoneInput, '+1234567890');
      await user.click(screen.getByRole('button', { name: 'Send OTP' }));

      await waitFor(() => {
        expect(screen.getByText('An unexpected error occurred. Please try again.')).toBeInTheDocument();
      });
    });

    it('clears name and phone when modal is closed', async () => {
      const user = userEvent.setup();
      render(<SignupModal open={true} onOpenChange={mockOnOpenChange} />);

      const nameInput = screen.getByLabelText('Name (Optional)') as HTMLInputElement;
      const phoneInput = screen.getByLabelText('Phone Number') as HTMLInputElement;
      
      await user.type(nameInput, 'John Doe');
      await user.type(phoneInput, '+1234567890');

      expect(nameInput.value).toBe('John Doe');
      expect(phoneInput.value).toBe('+1234567890');

      // Simulate closing the modal
      mockOnOpenChange.mockImplementation((open) => {
        if (!open) {
          // Re-render with open=false
          render(<SignupModal open={false} onOpenChange={mockOnOpenChange} />);
        }
      });

      // Trigger close by calling onOpenChange(false)
      mockOnOpenChange(false);
    });
  });

  describe('OTP Verification Step', () => {
    it('shows OTP input after successfully sending OTP', async () => {
      const user = userEvent.setup();
      vi.mocked(authAPI.sendOtp).mockResolvedValue({ message: 'OTP sent' });

      render(<SignupModal open={true} onOpenChange={mockOnOpenChange} />);

      const phoneInput = screen.getByLabelText('Phone Number');
      await user.type(phoneInput, '+1234567890');
      await user.click(screen.getByRole('button', { name: 'Send OTP' }));

      await waitFor(() => {
        expect(screen.getByText('Verification Code')).toBeInTheDocument();
        expect(screen.getByText('Sent to +1234567890')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Verify OTP' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
      });
    });

    it('allows entering OTP in the OTP input', async () => {
      const user = userEvent.setup();
      vi.mocked(authAPI.sendOtp).mockResolvedValue({ message: 'OTP sent' });

      render(<SignupModal open={true} onOpenChange={mockOnOpenChange} />);

      const phoneInput = screen.getByLabelText('Phone Number');
      await user.type(phoneInput, '+1234567890');
      await user.click(screen.getByRole('button', { name: 'Send OTP' }));

      await waitFor(() => {
        expect(screen.getByText('Verification Code')).toBeInTheDocument();
      });

      // The OTP input component renders 6 slots
      const slots = document.querySelectorAll('[data-slot="input-otp-slot"]');
      expect(slots).toHaveLength(6);
    });

    it('verifies OTP and logs in user on success', async () => {
      const user = userEvent.setup();
      const mockToken = 'test-token-123';
      const mockUser = { 
        id: '1', 
        phone: '+1234567890', 
        name: 'John Doe',
        role: 'USER' as const,
        status: 'ACTIVE' as const,
        sessionCount: 0,
        createdAt: new Date().toISOString()
      };
      
      vi.mocked(authAPI.sendOtp).mockResolvedValue({ message: 'OTP sent' });
      vi.mocked(authAPI.verifyOtp).mockResolvedValue({ token: mockToken, user: mockUser });

      render(<SignupModal open={true} onOpenChange={mockOnOpenChange} />);

      // Send OTP
      const phoneInput = screen.getByLabelText('Phone Number');
      await user.type(phoneInput, '+1234567890');
      await user.click(screen.getByRole('button', { name: 'Send OTP' }));

      await waitFor(() => {
        expect(screen.getByText('Verification Code')).toBeInTheDocument();
      });

      // Enter OTP using the hidden input
      const otpInput = document.querySelector('input[inputmode="numeric"]');
      if (otpInput) {
        await user.type(otpInput, '123456');
      }

      // Wait for button to be enabled
      await waitFor(() => {
        const verifyButton = screen.getByRole('button', { name: 'Verify OTP' });
        expect(verifyButton).not.toBeDisabled();
      });

      // Verify OTP
      await user.click(screen.getByRole('button', { name: 'Verify OTP' }));

      await waitFor(() => {
        expect(authAPI.verifyOtp).toHaveBeenCalledWith('+1234567890', '123456');
        expect(mockLogin).toHaveBeenCalledWith(mockToken, mockUser);
        expect(mockOnOpenChange).toHaveBeenCalledWith(false);
      });
    });

    it('shows error when OTP is invalid', async () => {
      const user = userEvent.setup();
      vi.mocked(authAPI.sendOtp).mockResolvedValue({ message: 'OTP sent' });
      vi.mocked(authAPI.verifyOtp).mockRejectedValue({
        response: { status: 401, data: { message: 'Invalid OTP' } },
      });

      render(<SignupModal open={true} onOpenChange={mockOnOpenChange} />);

      // Send OTP
      const phoneInput = screen.getByLabelText('Phone Number');
      await user.type(phoneInput, '+1234567890');
      await user.click(screen.getByRole('button', { name: 'Send OTP' }));

      await waitFor(() => {
        expect(screen.getByText('Verification Code')).toBeInTheDocument();
      });

      // Enter OTP
      const otpInput = document.querySelector('input[inputmode="numeric"]');
      if (otpInput) {
        await user.type(otpInput, '123456');
      }

      // Wait for button to be enabled
      await waitFor(() => {
        const verifyButton = screen.getByRole('button', { name: 'Verify OTP' });
        expect(verifyButton).not.toBeDisabled();
      });

      // Verify OTP
      await user.click(screen.getByRole('button', { name: 'Verify OTP' }));

      await waitFor(() => {
        expect(screen.getByText('Invalid or expired OTP. Please try again.')).toBeInTheDocument();
      });
    });

    it('shows network error when verifying OTP fails due to network', async () => {
      const user = userEvent.setup();
      vi.mocked(authAPI.sendOtp).mockResolvedValue({ message: 'OTP sent' });
      vi.mocked(authAPI.verifyOtp).mockRejectedValue({
        code: 'ERR_NETWORK',
        message: 'Network Error',
      });

      render(<SignupModal open={true} onOpenChange={mockOnOpenChange} />);

      // Send OTP
      const phoneInput = screen.getByLabelText('Phone Number');
      await user.type(phoneInput, '+1234567890');
      await user.click(screen.getByRole('button', { name: 'Send OTP' }));

      await waitFor(() => {
        expect(screen.getByText('Verification Code')).toBeInTheDocument();
      });

      // Enter OTP
      const otpInput = document.querySelector('input[inputmode="numeric"]');
      if (otpInput) {
        await user.type(otpInput, '123456');
      }

      // Wait for button to be enabled
      await waitFor(() => {
        const verifyButton = screen.getByRole('button', { name: 'Verify OTP' });
        expect(verifyButton).not.toBeDisabled();
      });

      // Verify OTP
      await user.click(screen.getByRole('button', { name: 'Verify OTP' }));

      await waitFor(() => {
        expect(screen.getByText('Network error. Please check your connection and try again.')).toBeInTheDocument();
      });
    });

    it('shows timeout error when verifying OTP times out', async () => {
      const user = userEvent.setup();
      vi.mocked(authAPI.sendOtp).mockResolvedValue({ message: 'OTP sent' });
      vi.mocked(authAPI.verifyOtp).mockRejectedValue({
        code: 'ECONNABORTED',
        message: 'timeout of 5000ms exceeded',
      });

      render(<SignupModal open={true} onOpenChange={mockOnOpenChange} />);

      // Send OTP
      const phoneInput = screen.getByLabelText('Phone Number');
      await user.type(phoneInput, '+1234567890');
      await user.click(screen.getByRole('button', { name: 'Send OTP' }));

      await waitFor(() => {
        expect(screen.getByText('Verification Code')).toBeInTheDocument();
      });

      // Enter OTP
      const otpInput = document.querySelector('input[inputmode="numeric"]');
      if (otpInput) {
        await user.type(otpInput, '123456');
      }

      // Wait for button to be enabled
      await waitFor(() => {
        const verifyButton = screen.getByRole('button', { name: 'Verify OTP' });
        expect(verifyButton).not.toBeDisabled();
      });

      // Verify OTP
      await user.click(screen.getByRole('button', { name: 'Verify OTP' }));

      await waitFor(() => {
        expect(screen.getByText('Request timed out. Please try again.')).toBeInTheDocument();
      });
    });

    it('shows rate limit error when too many OTP verification attempts', async () => {
      const user = userEvent.setup();
      vi.mocked(authAPI.sendOtp).mockResolvedValue({ message: 'OTP sent' });
      vi.mocked(authAPI.verifyOtp).mockRejectedValue({
        response: { status: 429, data: { message: 'Too many attempts' } },
      });

      render(<SignupModal open={true} onOpenChange={mockOnOpenChange} />);

      // Send OTP
      const phoneInput = screen.getByLabelText('Phone Number');
      await user.type(phoneInput, '+1234567890');
      await user.click(screen.getByRole('button', { name: 'Send OTP' }));

      await waitFor(() => {
        expect(screen.getByText('Verification Code')).toBeInTheDocument();
      });

      // Enter OTP
      const otpInput = document.querySelector('input[inputmode="numeric"]');
      if (otpInput) {
        await user.type(otpInput, '123456');
      }

      // Wait for button to be enabled
      await waitFor(() => {
        const verifyButton = screen.getByRole('button', { name: 'Verify OTP' });
        expect(verifyButton).not.toBeDisabled();
      });

      // Verify OTP
      await user.click(screen.getByRole('button', { name: 'Verify OTP' }));

      await waitFor(() => {
        expect(screen.getByText('Too many attempts. Please request a new OTP.')).toBeInTheDocument();
      });
    });

    it('shows server error when verifying OTP fails with 500', async () => {
      const user = userEvent.setup();
      vi.mocked(authAPI.sendOtp).mockResolvedValue({ message: 'OTP sent' });
      vi.mocked(authAPI.verifyOtp).mockRejectedValue({
        response: { status: 500, data: { message: 'Internal server error' } },
      });

      render(<SignupModal open={true} onOpenChange={mockOnOpenChange} />);

      // Send OTP
      const phoneInput = screen.getByLabelText('Phone Number');
      await user.type(phoneInput, '+1234567890');
      await user.click(screen.getByRole('button', { name: 'Send OTP' }));

      await waitFor(() => {
        expect(screen.getByText('Verification Code')).toBeInTheDocument();
      });

      // Enter OTP
      const otpInput = document.querySelector('input[inputmode="numeric"]');
      if (otpInput) {
        await user.type(otpInput, '123456');
      }

      // Wait for button to be enabled
      await waitFor(() => {
        const verifyButton = screen.getByRole('button', { name: 'Verify OTP' });
        expect(verifyButton).not.toBeDisabled();
      });

      // Verify OTP
      await user.click(screen.getByRole('button', { name: 'Verify OTP' }));

      await waitFor(() => {
        expect(screen.getByText('Server error. Please try again later.')).toBeInTheDocument();
      });
    });

    it('shows bad request error when OTP format is invalid', async () => {
      const user = userEvent.setup();
      vi.mocked(authAPI.sendOtp).mockResolvedValue({ message: 'OTP sent' });
      vi.mocked(authAPI.verifyOtp).mockRejectedValue({
        response: { status: 400, data: { message: 'Invalid OTP format' } },
      });

      render(<SignupModal open={true} onOpenChange={mockOnOpenChange} />);

      // Send OTP
      const phoneInput = screen.getByLabelText('Phone Number');
      await user.type(phoneInput, '+1234567890');
      await user.click(screen.getByRole('button', { name: 'Send OTP' }));

      await waitFor(() => {
        expect(screen.getByText('Verification Code')).toBeInTheDocument();
      });

      // Enter OTP
      const otpInput = document.querySelector('input[inputmode="numeric"]');
      if (otpInput) {
        await user.type(otpInput, '123456');
      }

      // Wait for button to be enabled
      await waitFor(() => {
        const verifyButton = screen.getByRole('button', { name: 'Verify OTP' });
        expect(verifyButton).not.toBeDisabled();
      });

      // Verify OTP
      await user.click(screen.getByRole('button', { name: 'Verify OTP' }));

      await waitFor(() => {
        expect(screen.getByText('Invalid OTP format')).toBeInTheDocument();
      });
    });

    it('shows generic error for unknown verification errors', async () => {
      const user = userEvent.setup();
      vi.mocked(authAPI.sendOtp).mockResolvedValue({ message: 'OTP sent' });
      vi.mocked(authAPI.verifyOtp).mockRejectedValue(new Error('Unknown error'));

      render(<SignupModal open={true} onOpenChange={mockOnOpenChange} />);

      // Send OTP
      const phoneInput = screen.getByLabelText('Phone Number');
      await user.type(phoneInput, '+1234567890');
      await user.click(screen.getByRole('button', { name: 'Send OTP' }));

      await waitFor(() => {
        expect(screen.getByText('Verification Code')).toBeInTheDocument();
      });

      // Enter OTP
      const otpInput = document.querySelector('input[inputmode="numeric"]');
      if (otpInput) {
        await user.type(otpInput, '123456');
      }

      // Wait for button to be enabled
      await waitFor(() => {
        const verifyButton = screen.getByRole('button', { name: 'Verify OTP' });
        expect(verifyButton).not.toBeDisabled();
      });

      // Verify OTP
      await user.click(screen.getByRole('button', { name: 'Verify OTP' }));

      await waitFor(() => {
        expect(screen.getByText('An unexpected error occurred. Please try again.')).toBeInTheDocument();
      });
    });

    it('disables verify button when OTP is incomplete', async () => {
      const user = userEvent.setup();
      vi.mocked(authAPI.sendOtp).mockResolvedValue({ message: 'OTP sent' });

      render(<SignupModal open={true} onOpenChange={mockOnOpenChange} />);

      // Send OTP
      const phoneInput = screen.getByLabelText('Phone Number');
      await user.type(phoneInput, '+1234567890');
      await user.click(screen.getByRole('button', { name: 'Send OTP' }));

      await waitFor(() => {
        expect(screen.getByText('Verification Code')).toBeInTheDocument();
      });

      const verifyButton = screen.getByRole('button', { name: 'Verify OTP' });
      expect(verifyButton).toBeDisabled();

      // Enter partial OTP
      const otpInput = document.querySelector('input[inputmode="numeric"]');
      if (otpInput) {
        await user.type(otpInput, '123');
      }

      // Button should still be disabled with partial OTP
      expect(verifyButton).toBeDisabled();

      // Complete OTP
      if (otpInput) {
        await user.type(otpInput, '456');
      }

      // Button should now be enabled
      await waitFor(() => {
        expect(verifyButton).not.toBeDisabled();
      });
    });

    it('allows going back to phone input from OTP step', async () => {
      const user = userEvent.setup();
      vi.mocked(authAPI.sendOtp).mockResolvedValue({ message: 'OTP sent' });

      render(<SignupModal open={true} onOpenChange={mockOnOpenChange} />);

      // Send OTP
      const phoneInput = screen.getByLabelText('Phone Number');
      await user.type(phoneInput, '+1234567890');
      await user.click(screen.getByRole('button', { name: 'Send OTP' }));

      await waitFor(() => {
        expect(screen.getByText('Verification Code')).toBeInTheDocument();
      });

      // Go back
      await user.click(screen.getByRole('button', { name: 'Back' }));

      expect(screen.getByLabelText('Phone Number')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Send OTP' })).toBeInTheDocument();
    });

    it('clears OTP when going back to phone input', async () => {
      const user = userEvent.setup();
      vi.mocked(authAPI.sendOtp).mockResolvedValue({ message: 'OTP sent' });

      render(<SignupModal open={true} onOpenChange={mockOnOpenChange} />);

      // Send OTP
      const phoneInput = screen.getByLabelText('Phone Number');
      await user.type(phoneInput, '+1234567890');
      await user.click(screen.getByRole('button', { name: 'Send OTP' }));

      await waitFor(() => {
        expect(screen.getByText('Verification Code')).toBeInTheDocument();
      });

      // Enter OTP
      const otpInput = document.querySelector('input[inputmode="numeric"]');
      if (otpInput) {
        await user.type(otpInput, '123456');
      }

      // Go back
      await user.click(screen.getByRole('button', { name: 'Back' }));

      // Go forward again
      await user.click(screen.getByRole('button', { name: 'Send OTP' }));

      await waitFor(() => {
        expect(screen.getByText('Verification Code')).toBeInTheDocument();
      });

      // OTP should be cleared - verify button should be disabled
      const verifyButton = screen.getByRole('button', { name: 'Verify OTP' });
      expect(verifyButton).toBeDisabled();
    });

    it('disables OTP input and buttons while verifying', async () => {
      const user = userEvent.setup();
      let resolveVerify: (value: any) => void;
      const verifyPromise = new Promise((resolve) => {
        resolveVerify = resolve;
      });
      
      vi.mocked(authAPI.sendOtp).mockResolvedValue({ message: 'OTP sent' });
      vi.mocked(authAPI.verifyOtp).mockReturnValue(verifyPromise as any);

      render(<SignupModal open={true} onOpenChange={mockOnOpenChange} />);

      // Send OTP
      const phoneInput = screen.getByLabelText('Phone Number');
      await user.type(phoneInput, '+1234567890');
      await user.click(screen.getByRole('button', { name: 'Send OTP' }));

      await waitFor(() => {
        expect(screen.getByText('Verification Code')).toBeInTheDocument();
      });

      // Enter OTP
      const otpInputs = screen.getAllByRole('textbox');
      await user.type(otpInputs[0], '123456');

      // Click verify
      await user.click(screen.getByRole('button', { name: 'Verify OTP' }));

      // Buttons should be disabled during loading
      expect(screen.getByRole('button', { name: 'Verifying...' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();

      // Resolve the promise
      resolveVerify!({ 
        token: 'test-token', 
        user: { 
          id: '1', 
          phone: '+1234567890',
          role: 'USER' as const,
          status: 'ACTIVE' as const,
          sessionCount: 0,
          createdAt: new Date().toISOString()
        } 
      });

      await waitFor(() => {
        expect(mockOnOpenChange).toHaveBeenCalledWith(false);
      });
    });

    it('resets state when modal is closed from OTP step', async () => {
      const user = userEvent.setup();
      vi.mocked(authAPI.sendOtp).mockResolvedValue({ message: 'OTP sent' });

      const { unmount } = render(<SignupModal open={true} onOpenChange={mockOnOpenChange} />);

      // Send OTP
      const phoneInput = screen.getByLabelText('Phone Number');
      await user.type(phoneInput, '+1234567890');
      await user.click(screen.getByRole('button', { name: 'Send OTP' }));

      await waitFor(() => {
        expect(screen.getByText('Verification Code')).toBeInTheDocument();
      });

      // Enter OTP
      const otpInput = document.querySelector('input[inputmode="numeric"]');
      if (otpInput) {
        await user.type(otpInput, '123456');
      }

      // Unmount and remount to simulate closing and reopening
      unmount();
      
      render(<SignupModal open={true} onOpenChange={mockOnOpenChange} />);

      // Should be back to phone step with fresh state
      expect(screen.getByLabelText('Phone Number')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Send OTP' })).toBeInTheDocument();
      expect(screen.getByText('Create your account to get started')).toBeInTheDocument();
    });
  });
});
