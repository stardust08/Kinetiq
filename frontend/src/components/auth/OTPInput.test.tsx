import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OTPInput } from './OTPInput';

describe('OTPInput', () => {
  it('renders 6 input slots', () => {
    const onChange = vi.fn();
    const { container } = render(<OTPInput value="" onChange={onChange} />);
    
    const slots = container.querySelectorAll('[data-slot="input-otp-slot"]');
    expect(slots).toHaveLength(6);
  });

  it('calls onChange when user types', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(<OTPInput value="" onChange={onChange} />);
    
    const input = container.querySelector('input');
    expect(input).toBeTruthy();
    
    if (input) {
      await user.type(input, '1');
      expect(onChange).toHaveBeenCalled();
    }
  });

  it('displays the current value', () => {
    const onChange = vi.fn();
    const { container } = render(<OTPInput value="123456" onChange={onChange} />);
    
    const slots = container.querySelectorAll('[data-slot="input-otp-slot"]');
    expect(slots[0]).toHaveTextContent('1');
    expect(slots[1]).toHaveTextContent('2');
    expect(slots[2]).toHaveTextContent('3');
    expect(slots[3]).toHaveTextContent('4');
    expect(slots[4]).toHaveTextContent('5');
    expect(slots[5]).toHaveTextContent('6');
  });

  it('can be disabled', () => {
    const onChange = vi.fn();
    const { container } = render(
      <OTPInput value="" onChange={onChange} disabled={true} />
    );
    
    const input = container.querySelector('input');
    expect(input).toHaveAttribute('disabled');
  });

  it('applies error state', () => {
    const onChange = vi.fn();
    const { container } = render(
      <OTPInput value="" onChange={onChange} error={true} />
    );
    
    const otpInput = container.querySelector('[data-slot="input-otp"]');
    expect(otpInput).toHaveAttribute('aria-invalid', 'true');
  });

  it('handles paste events', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(<OTPInput value="" onChange={onChange} />);
    
    const input = container.querySelector('input');
    expect(input).toBeTruthy();
    
    if (input) {
      await user.click(input);
      await user.paste('123456');
      expect(onChange).toHaveBeenCalled();
    }
  });

  it('filters non-digit characters from pasted content', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(<OTPInput value="" onChange={onChange} />);
    
    const input = container.querySelector('input');
    expect(input).toBeTruthy();
    
    if (input) {
      await user.click(input);
      await user.paste('12-34-56');
      expect(onChange).toHaveBeenCalledWith('123456');
    }
  });

  it('truncates pasted content longer than 6 digits', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(<OTPInput value="" onChange={onChange} />);
    
    const input = container.querySelector('input');
    expect(input).toBeTruthy();
    
    if (input) {
      await user.click(input);
      await user.paste('123456789');
      expect(onChange).toHaveBeenCalledWith('123456');
    }
  });

  it('auto-focuses the input when rendered', () => {
    const onChange = vi.fn();
    const { container } = render(<OTPInput value="" onChange={onChange} />);
    
    const input = container.querySelector('input');
    expect(input).toBe(document.activeElement);
  });

  it('can disable auto-focus', () => {
    const onChange = vi.fn();
    const { container } = render(
      <OTPInput value="" onChange={onChange} autoFocus={false} />
    );
    
    const input = container.querySelector('input');
    expect(input).not.toBe(document.activeElement);
  });

  it('only accepts numeric input', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(<OTPInput value="" onChange={onChange} />);
    
    const input = container.querySelector('input');
    expect(input).toBeTruthy();
    
    if (input) {
      // Try typing letters - should not trigger onChange
      await user.type(input, 'abc');
      expect(onChange).not.toHaveBeenCalled();
      
      // Try typing numbers - should trigger onChange
      await user.type(input, '123');
      expect(onChange).toHaveBeenCalled();
    }
  });
});
