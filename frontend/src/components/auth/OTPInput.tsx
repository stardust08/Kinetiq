import React from 'react';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '../../app/components/ui/input-otp';
import { cn } from '../../app/components/ui/utils';

interface OTPInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: boolean;
  autoFocus?: boolean;
  className?: string;
}

/**
 * OTPInput Component
 * 
 * A styled 6-digit OTP input component with the following features:
 * - 6 individual input boxes (48px × 48px each)
 * - Large, readable text (text-lg, font-medium)
 * - Proper spacing between boxes (gap-2)
 * - Error state styling with destructive border color
 * - Auto-focus on first input
 * - Paste support with automatic digit extraction
 * - Disabled state support
 * - Accessible with proper ARIA attributes
 */
export const OTPInput: React.FC<OTPInputProps> = ({
  value,
  onChange,
  disabled = false,
  error = false,
  autoFocus = true,
  className,
}) => {
  // Transform pasted content to only include digits
  const handlePasteTransform = (pasted: string) => {
    return pasted.replace(/\D/g, '').slice(0, 6);
  };

  return (
    <div className={cn('flex flex-col items-center gap-2', className)}>
      <InputOTP
        maxLength={6}
        value={value}
        onChange={onChange}
        disabled={disabled}
        aria-invalid={error}
        autoFocus={autoFocus}
        pattern="^[0-9]*$"
        pasteTransformer={handlePasteTransform}
        containerClassName={cn(
          'gap-2',
          error && 'aria-invalid:opacity-100'
        )}
      >
        <InputOTPGroup className="gap-2">
          <InputOTPSlot 
            index={0} 
            className={cn(
              'h-12 w-12 text-lg font-medium',
              error && 'border-destructive'
            )}
          />
          <InputOTPSlot 
            index={1} 
            className={cn(
              'h-12 w-12 text-lg font-medium',
              error && 'border-destructive'
            )}
          />
          <InputOTPSlot 
            index={2} 
            className={cn(
              'h-12 w-12 text-lg font-medium',
              error && 'border-destructive'
            )}
          />
          <InputOTPSlot 
            index={3} 
            className={cn(
              'h-12 w-12 text-lg font-medium',
              error && 'border-destructive'
            )}
          />
          <InputOTPSlot 
            index={4} 
            className={cn(
              'h-12 w-12 text-lg font-medium',
              error && 'border-destructive'
            )}
          />
          <InputOTPSlot 
            index={5} 
            className={cn(
              'h-12 w-12 text-lg font-medium',
              error && 'border-destructive'
            )}
          />
        </InputOTPGroup>
      </InputOTP>
    </div>
  );
};
