import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../app/components/ui/dialog';
import { Button } from '../../app/components/ui/button';
import { Input } from '../../app/components/ui/input';
import { Label } from '../../app/components/ui/label';
import { OTPInput } from './OTPInput';
import { sendOtp, verifyOtp } from '../../api/auth';
import { useAuthStore } from '../../store/authStore';

interface SignupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = 'phone' | 'otp';

export const SignupModal: React.FC<SignupModalProps> = ({ open, onOpenChange }) => {
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const login = useAuthStore((state) => state.login);

  const validatePhone = (phoneNumber: string): boolean => {
    // Remove spaces and special characters except +
    const cleaned = phoneNumber.replace(/[^\d+]/g, '');
    // Must start with + or digit (1-9), followed by 9-14 digits
    const phoneRegex = /^\+?[1-9]\d{9,14}$/;
    return phoneRegex.test(cleaned);
  };

  const handleSendOtp = async () => {
    if (!phone.trim()) {
      setError('Please enter a phone number');
      return;
    }

    if (!validatePhone(phone)) {
      setError('Please enter a valid phone number (e.g., +1234567890)');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      await sendOtp(phone, 'SIGNUP');
      setStep('otp');
    } catch (err: any) {
      // Handle different error types
      if (err.code === 'ERR_NETWORK' || err.message === 'Network Error') {
        setError('Network error. Please check your connection and try again.');
      } else if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
        setError('Request timed out. Please try again.');
      } else if (err.response) {
        // Server responded with error
        const status = err.response.status;
        const message = err.response.data?.message;
        
        if (status === 400) {
          setError(message || 'Invalid phone number format.');
        } else if (status === 409) {
          setError('Phone number already registered. Please log in instead.');
        } else if (status === 429) {
          setError('Too many attempts. Please try again later.');
        } else if (status >= 500) {
          setError('Server error. Please try again later.');
        } else {
          setError(message || 'Failed to send OTP. Please try again.');
        }
      } else {
        // Unknown error
        setError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.length !== 6) {
      setError('Please enter a valid 6-digit OTP');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      const response = await verifyOtp(phone, otp);
      // Same guard as useAuth: a response asking for profile completion carries no
      // token and no user, and must not be treated as a successful login.
      if (response.token && response.user) {
        login(response.token, response.user);
      }
      onOpenChange(false);
      // Reset state
      setStep('phone');
      setPhone('');
      setName('');
      setOtp('');
    } catch (err: any) {
      // Handle different error types
      if (err.code === 'ERR_NETWORK' || err.message === 'Network Error') {
        setError('Network error. Please check your connection and try again.');
      } else if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
        setError('Request timed out. Please try again.');
      } else if (err.response) {
        // Server responded with error
        const status = err.response.status;
        const message = err.response.data?.message;
        
        if (status === 400) {
          setError(message || 'Invalid OTP format.');
        } else if (status === 401) {
          setError('Invalid or expired OTP. Please try again.');
        } else if (status === 429) {
          setError('Too many attempts. Please request a new OTP.');
        } else if (status >= 500) {
          setError('Server error. Please try again later.');
        } else {
          setError(message || 'Invalid OTP. Please try again.');
        }
      } else {
        // Unknown error
        setError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    setStep('phone');
    setOtp('');
    setError('');
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      // Reset state when closing
      setStep('phone');
      setPhone('');
      setName('');
      setOtp('');
      setError('');
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader className="space-y-3">
          <DialogTitle className="text-2xl font-semibold tracking-tight">
            Sign Up
          </DialogTitle>
          <DialogDescription className="text-base text-muted-foreground">
            {step === 'phone'
              ? 'Create your account to get started'
              : 'Enter the 6-digit code sent to your phone'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-6 py-6">
          {step === 'phone' ? (
            <>
              <div className="flex flex-col gap-3">
                <Label htmlFor="name" className="text-sm font-medium">
                  Name (Optional)
                </Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={isLoading}
                  className="h-11 text-base"
                />
              </div>

              <div className="flex flex-col gap-3">
                <Label htmlFor="phone" className="text-sm font-medium">
                  Phone Number
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="+1234567890"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={isLoading}
                  aria-invalid={!!error}
                  className="h-11 text-base"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSendOtp();
                    }
                  }}
                />
              </div>

              {error && (
                <div className="rounded-md bg-destructive/10 px-4 py-3 border border-destructive/20">
                  <p className="text-sm font-medium text-destructive">{error}</p>
                </div>
              )}

              <Button
                onClick={handleSendOtp}
                disabled={isLoading}
                className="w-full h-11 text-base font-medium"
              >
                {isLoading ? 'Sending...' : 'Send OTP'}
              </Button>
            </>
          ) : (
            <>
              <div className="flex flex-col gap-4">
                <Label htmlFor="otp" className="text-sm font-medium text-center">
                  Verification Code
                </Label>
                <OTPInput
                  value={otp}
                  onChange={setOtp}
                  disabled={isLoading}
                  error={!!error}
                  autoFocus
                />
                <p className="text-xs text-center text-muted-foreground">
                  Sent to {phone}
                </p>
              </div>

              {error && (
                <div className="rounded-md bg-destructive/10 px-4 py-3 border border-destructive/20">
                  <p className="text-sm font-medium text-destructive">{error}</p>
                </div>
              )}

              <div className="flex flex-col gap-3">
                <Button
                  onClick={handleVerifyOtp}
                  disabled={isLoading || otp.length !== 6}
                  className="w-full h-11 text-base font-medium"
                >
                  {isLoading ? 'Verifying...' : 'Verify OTP'}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleBack}
                  disabled={isLoading}
                  className="w-full h-11 text-base font-medium"
                >
                  Back
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
