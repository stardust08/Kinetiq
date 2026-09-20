/**
 * Which bookings a patient may screen against.
 *
 * This rule is enforced server-side by three services, and the UI has to agree with
 * them. When it did not, the picker offered CANCELLED bookings that still had
 * screenings left; the patient chose one and every exercise failed at start with
 * "Booking status 'CANCELLED' is not valid for analysis." - after they had already
 * read the instructions and stood in front of the camera.
 */

import { describe, expect, it } from 'vitest';
import { isScreenable, screenableBookings, SCREENABLE_STATUSES } from './screenableBooking';

const booking = (over: Partial<{ status: string; remainingScreeningCount: number }> = {}) =>
  ({ status: 'CONFIRMED', remainingScreeningCount: 3, ...over }) as any;

describe('isScreenable', () => {
  it.each(SCREENABLE_STATUSES)('accepts a %s booking with screenings left', (status) => {
    expect(isScreenable(booking({ status }))).toBe(true);
  });

  it.each(['CANCELLED', 'PENDING', 'REFUNDED', 'DRAFT'])(
    'refuses a %s booking however many screenings remain',
    (status) => {
      // Cancelling does NOT consume the screening count, so a cancelled booking can
      // easily still have three left. Counting alone is what let it through.
      expect(isScreenable(booking({ status, remainingScreeningCount: 3 }))).toBe(false);
    },
  );

  it('refuses a usable booking with no screenings left', () => {
    expect(isScreenable(booking({ remainingScreeningCount: 0 }))).toBe(false);
  });

  it('is case-insensitive about the status', () => {
    expect(isScreenable(booking({ status: 'confirmed' }))).toBe(true);
  });

  it('matches the statuses the backend accepts', () => {
    // app/api/{posture,gait,rom}/service.py all use ["CONFIRMED", "COMPLETED"].
    expect([...SCREENABLE_STATUSES]).toEqual(['CONFIRMED', 'COMPLETED']);
  });
});

describe('screenableBookings', () => {
  it('keeps only the bookings a screening can actually start against', () => {
    const list = [
      booking({ status: 'CONFIRMED' }),
      booking({ status: 'CANCELLED' }),
      booking({ status: 'COMPLETED' }),
      booking({ status: 'CONFIRMED', remainingScreeningCount: 0 }),
    ];
    expect(screenableBookings(list)).toHaveLength(2);
  });

  it('handles an absent list', () => {
    expect(screenableBookings(undefined)).toEqual([]);
    expect(screenableBookings(null)).toEqual([]);
  });
});
