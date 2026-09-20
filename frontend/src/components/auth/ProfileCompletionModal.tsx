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
import { completeProfile } from '../../api/auth';
import { useAuthStore } from '../../store/authStore';
import { toast } from 'sonner';

interface ProfileCompletionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  phone: string;
}

export const ProfileCompletionModal: React.FC<ProfileCompletionModalProps> = ({
  open,
  onOpenChange,
  phone,
}) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [notificationPreference, setNotificationPreference] = useState('EMAIL');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const login = useAuthStore((state) => state.login);

  const validateEmail = (email: string): boolean => {
    if (!email) return true; // Email is optional
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email);
  };

  const handleSubmit = async () => {
    // Validate name (required)
    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    if (name.trim().length < 2) {
      setError('Name must be at least 2 characters');
      return;
    }

    // Validate email if provided
    if (email && !validateEmail(email)) {
      setError('Please enter a valid email address');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      const response = await completeProfile({
        phone,
        name: name.trim(),
        email: email.trim() || undefined,
        notificationPreference: notificationPreference || undefined,
      });

      // Login with the returned token and user
      if (response.token && response.user) {
        login(response.token, response.user);
        toast.success('Profile completed successfully!');
        onOpenChange(false);
        // Reset state
        setName('');
        setEmail('');
        setNotificationPreference('EMAIL');
      }
    } catch (err: any) {
      if (err.code === 'ERR_NETWORK' || err.message === 'Network Error') {
        setError('Network error. Please check your connection and try again.');
      } else if (err.response) {
        const status = err.response.status;
        const message = err.response.data?.message;

        if (status === 400) {
          setError(message || 'Invalid profile data. Please check your inputs.');
        } else if (status === 409) {
          setError('User already exists. Please try logging in.');
        } else if (status >= 500) {
          setError('Server error. Please try again later.');
        } else {
          setError(message || 'Failed to complete profile. Please try again.');
        }
      } else {
        setError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      // Don't allow closing without completing profile
      // User must complete profile or refresh the page
      return;
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader className="space-y-3">
          <DialogTitle className="text-2xl font-semibold tracking-tight">
            Complete Your Profile
          </DialogTitle>
          <DialogDescription className="text-base text-muted-foreground">
            Please provide your details to continue
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-6 py-6">
          <div className="flex flex-col gap-3">
            <Label htmlFor="name" className="text-sm font-medium">
              Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="name"
              type="text"
              placeholder="Your full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isLoading}
              aria-invalid={!!error}
              className="h-11 text-base"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSubmit();
                }
              }}
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-3">
            <Label htmlFor="email" className="text-sm font-medium">
              Email <span className="text-gray-400 text-xs">(Optional)</span>
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="your.email@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
              className="h-11 text-base"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSubmit();
                }
              }}
            />
          </div>

          <div className="flex flex-col gap-3">
            <Label htmlFor="notification" className="text-sm font-medium">
              Notification Preference <span className="text-gray-400 text-xs">(Optional)</span>
            </Label>
            <select
              id="notification"
              value={notificationPreference}
              onChange={(e) => setNotificationPreference(e.target.value)}
              disabled={isLoading}
              className="h-11 text-base px-3 rounded-md border border-input bg-background"
            >
              <option value="EMAIL">Email</option>
              <option value="SMS">SMS</option>
              <option value="BOTH">Both</option>
              <option value="NONE">None</option>
            </select>
          </div>

          {error && (
            <div className="rounded-md bg-destructive/10 px-4 py-3 border border-destructive/20">
              <p className="text-sm font-medium text-destructive">{error}</p>
            </div>
          )}

          <Button
            onClick={handleSubmit}
            disabled={isLoading || !name.trim()}
            className="w-full h-11 text-base font-medium"
          >
            {isLoading ? 'Completing Profile...' : 'Complete Profile'}
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            Phone: {phone}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};
