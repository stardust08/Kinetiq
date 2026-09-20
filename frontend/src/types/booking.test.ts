import { describe, it, expect } from 'vitest';
import type { Booking, BookingWithScreeningCount, ScreeningCountInfo, BookingStatus } from './index';

describe('Booking Types', () => {
  describe('BookingStatus', () => {
    it('should have all required status values', () => {
      const statuses: BookingStatus[] = ['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED'];
      expect(statuses).toHaveLength(4);
    });
  });

  describe('Booking interface', () => {
    it('should have all required fields including screening counts', () => {
      const booking: Booking = {
        id: 'booking-123',
        userId: 'user-456',
        serviceId: 'service-789',
        paymentId: 'payment-101',
        totalAmount: 100,
        paidAmount: 50,
        remainingAmount: 50,
        time: '2024-01-15T10:00:00Z',
        status: 'CONFIRMED',
        createdAt: '2024-01-10T10:00:00Z',
        totalScreeningCount: 10,
        usedScreeningCount: 3,
        remainingScreeningCount: 7,
      };

      expect(booking.id).toBe('booking-123');
      expect(booking.totalScreeningCount).toBe(10);
      expect(booking.usedScreeningCount).toBe(3);
      expect(booking.remainingScreeningCount).toBe(7);
    });

    it('should allow optional fields', () => {
      const booking: Booking = {
        id: 'booking-123',
        userId: 'user-456',
        serviceId: 'service-789',
        paymentId: 'payment-101',
        totalAmount: 100,
        paidAmount: 100,
        remainingAmount: 0,
        time: '2024-01-15T10:00:00Z',
        status: 'COMPLETED',
        createdAt: '2024-01-10T10:00:00Z',
        totalScreeningCount: 5,
        usedScreeningCount: 5,
        remainingScreeningCount: 0,
        description: 'Test booking',
        clinicianId: 'clinician-123',
        service: {
          id: 'service-789',
          categoryId: 'cat-1',
          name: 'Test Service',
          slug: 'test-service',
          basePrice: 100,
          paymentType: 'FULL',
          reviewCount: 0,
          createdAt: '2024-01-01T00:00:00Z',
        },
      };

      expect(booking.description).toBe('Test booking');
      expect(booking.clinicianId).toBe('clinician-123');
      expect(booking.service?.name).toBe('Test Service');
    });
  });

  describe('ScreeningCountInfo interface', () => {
    it('should have all required fields', () => {
      const info: ScreeningCountInfo = {
        bookingId: 'booking-123',
        serviceName: 'Posture Analysis',
        totalScreeningCount: 10,
        usedScreeningCount: 3,
        remainingScreeningCount: 7,
        assessments: [
          {
            id: 'analysis-1',
            analysisDate: '2024-01-12T10:00:00Z',
            status: 'completed',
          },
        ],
        bookingStatus: 'CONFIRMED',
      };

      expect(info.bookingId).toBe('booking-123');
      expect(info.serviceName).toBe('Posture Analysis');
      expect(info.totalScreeningCount).toBe(10);
      expect(info.assessments).toHaveLength(1);
    });
  });

  describe('BookingWithScreeningCount interface', () => {
    it('should have nested screening count structure', () => {
      const booking: BookingWithScreeningCount = {
        id: 'booking-123',
        userId: 'user-456',
        serviceId: 'service-789',
        paymentId: 'payment-101',
        totalAmount: 100,
        paidAmount: 50,
        remainingAmount: 50,
        time: '2024-01-15T10:00:00Z',
        status: 'CONFIRMED',
        createdAt: '2024-01-10T10:00:00Z',
        screeningCount: {
          total: 10,
          used: 3,
          remaining: 7,
        },
      };

      expect(booking.screeningCount.total).toBe(10);
      expect(booking.screeningCount.used).toBe(3);
      expect(booking.screeningCount.remaining).toBe(7);
    });

    it('should not have flat screening count fields', () => {
      const booking: BookingWithScreeningCount = {
        id: 'booking-123',
        userId: 'user-456',
        serviceId: 'service-789',
        paymentId: 'payment-101',
        totalAmount: 100,
        paidAmount: 50,
        remainingAmount: 50,
        time: '2024-01-15T10:00:00Z',
        status: 'CONFIRMED',
        createdAt: '2024-01-10T10:00:00Z',
        screeningCount: {
          total: 10,
          used: 3,
          remaining: 7,
        },
      };

      // TypeScript should not allow these properties
      // @ts-expect-error - totalScreeningCount should not exist on BookingWithScreeningCount
      expect(booking.totalScreeningCount).toBeUndefined();
    });

    it('should allow conversion from Booking to BookingWithScreeningCount', () => {
      const flatBooking: Booking = {
        id: 'booking-123',
        userId: 'user-456',
        serviceId: 'service-789',
        paymentId: 'payment-101',
        totalAmount: 100,
        paidAmount: 50,
        remainingAmount: 50,
        time: '2024-01-15T10:00:00Z',
        status: 'CONFIRMED',
        createdAt: '2024-01-10T10:00:00Z',
        totalScreeningCount: 10,
        usedScreeningCount: 3,
        remainingScreeningCount: 7,
      };

      // Convert flat structure to nested structure
      const nestedBooking: BookingWithScreeningCount = {
        ...flatBooking,
        screeningCount: {
          total: flatBooking.totalScreeningCount,
          used: flatBooking.usedScreeningCount,
          remaining: flatBooking.remainingScreeningCount,
        },
      };

      expect(nestedBooking.screeningCount.total).toBe(10);
      expect(nestedBooking.screeningCount.used).toBe(3);
      expect(nestedBooking.screeningCount.remaining).toBe(7);
    });
  });

  describe('Type compatibility', () => {
    it('should ensure screening count consistency', () => {
      const booking: Booking = {
        id: 'booking-123',
        userId: 'user-456',
        serviceId: 'service-789',
        paymentId: 'payment-101',
        totalAmount: 100,
        paidAmount: 100,
        remainingAmount: 0,
        time: '2024-01-15T10:00:00Z',
        status: 'COMPLETED',
        createdAt: '2024-01-10T10:00:00Z',
        totalScreeningCount: 10,
        usedScreeningCount: 10,
        remainingScreeningCount: 0,
      };

      // Verify count consistency: total = used + remaining
      expect(booking.totalScreeningCount).toBe(
        booking.usedScreeningCount + booking.remainingScreeningCount
      );
    });
  });
});
