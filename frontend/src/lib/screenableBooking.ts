import type { Booking } from '../types';

/**
 * Booking statuses the backend will accept a screening against.
 *
 * Kept in one place because three services enforce it server-side
 * (app/api/{posture,gait,rom}/service.py) and the UI has to agree with them. When it
 * did not, the booking picker offered CANCELLED bookings that still had screenings
 * left; the patient selected one, performed nothing, and every exercise failed at
 * start with "Booking status 'CANCELLED' is not valid for analysis."
 */
export const SCREENABLE_STATUSES = ['CONFIRMED', 'COMPLETED'] as const;

/**
 * Whether a screening can actually be started against this booking.
 *
 * Two conditions, and the UI previously checked only the first: screenings must remain,
 * AND the booking must not have been cancelled. A booking can easily satisfy one and
 * not the other - cancelling does not consume the screening count.
 */
export function isScreenable(booking: Pick<Booking, 'status' | 'remainingScreeningCount'>): boolean {
  if (booking.remainingScreeningCount <= 0) return false;
  return (SCREENABLE_STATUSES as readonly string[]).includes(
    String(booking.status).toUpperCase(),
  );
}

/** Only the bookings a patient can actually screen against. */
export function screenableBookings<T extends Pick<Booking, 'status' | 'remainingScreeningCount'>>(
  bookings: readonly T[] | undefined | null,
): T[] {
  return (bookings ?? []).filter(isScreenable);
}
