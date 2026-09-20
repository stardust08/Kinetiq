/**
 * Service Types Tests
 * 
 * Tests to validate service type definitions
 */

import { describe, it, expect } from 'vitest';
import type { Service, ServiceInfo } from './service';

describe('Service Types', () => {
  describe('Service interface', () => {
    it('should accept a valid complete service object', () => {
      const service: Service = {
        id: 'service-123',
        categoryId: 'category-456',
        name: 'Clinical Posture Analysis',
        slug: 'clinical-posture-analysis',
        description: 'Comprehensive posture assessment',
        basePrice: 5000,
        salePrice: 4000,
        discount: 20,
        paymentType: 'FULL',
        advancePercent: 50,
        advanceAmount: 2000,
        duration: '30 minutes',
        serviceType: 'ASSESSMENT',
        features: ['AI-powered analysis', '33 clinical metrics', '3D visualization'],
        reviewCount: 42,
        deliveryMode: 'VIRTUAL',
        sessionCount: 1,
        includedScreeningCount: 10,
        createdAt: '2024-01-15T10:00:00Z',
        category: {
          id: 'category-456',
          name: 'Posture Analysis',
          slug: 'posture-analysis'
        }
      };

      expect(service.id).toBe('service-123');
      expect(service.name).toBe('Clinical Posture Analysis');
      expect(service.includedScreeningCount).toBe(10);
      expect(service.features).toHaveLength(3);
    });

    it('should accept a service with minimal required fields', () => {
      const service: Service = {
        id: 'service-123',
        categoryId: 'category-456',
        name: 'Basic Service',
        slug: 'basic-service',
        basePrice: 1000,
        paymentType: 'FULL',
        reviewCount: 0,
        createdAt: '2024-01-15T10:00:00Z'
      };

      expect(service.id).toBe('service-123');
      expect(service.includedScreeningCount).toBeUndefined();
      expect(service.salePrice).toBeUndefined();
    });

    it('should accept a service with screening count', () => {
      const service: Service = {
        id: 'service-123',
        categoryId: 'category-456',
        name: 'Posture Analysis Package',
        slug: 'posture-analysis-package',
        basePrice: 10000,
        paymentType: 'FULL',
        reviewCount: 0,
        includedScreeningCount: 20,
        createdAt: '2024-01-15T10:00:00Z'
      };

      expect(service.includedScreeningCount).toBe(20);
    });

    it('should accept a service with partial payment configuration', () => {
      const service: Service = {
        id: 'service-123',
        categoryId: 'category-456',
        name: 'Premium Service',
        slug: 'premium-service',
        basePrice: 15000,
        paymentType: 'PARTIAL',
        advancePercent: 30,
        advanceAmount: 4500,
        reviewCount: 0,
        createdAt: '2024-01-15T10:00:00Z'
      };

      expect(service.paymentType).toBe('PARTIAL');
      expect(service.advancePercent).toBe(30);
      expect(service.advanceAmount).toBe(4500);
    });
  });

  describe('ServiceInfo interface', () => {
    it('should accept a valid service info object', () => {
      const serviceInfo: ServiceInfo = {
        id: 'service-123',
        name: 'Clinical Posture Analysis',
        slug: 'clinical-posture-analysis',
        description: 'Comprehensive posture assessment',
        basePrice: 5000,
        salePrice: 4000,
        includedScreeningCount: 10
      };

      expect(serviceInfo.id).toBe('service-123');
      expect(serviceInfo.name).toBe('Clinical Posture Analysis');
      expect(serviceInfo.includedScreeningCount).toBe(10);
    });

    it('should accept service info with minimal fields', () => {
      const serviceInfo: ServiceInfo = {
        id: 'service-123',
        name: 'Basic Service',
        slug: 'basic-service',
        basePrice: 1000
      };

      expect(serviceInfo.id).toBe('service-123');
      expect(serviceInfo.includedScreeningCount).toBeUndefined();
      expect(serviceInfo.salePrice).toBeUndefined();
    });

    it('should be usable as a subset of Service', () => {
      const fullService: Service = {
        id: 'service-123',
        categoryId: 'category-456',
        name: 'Clinical Posture Analysis',
        slug: 'clinical-posture-analysis',
        description: 'Comprehensive posture assessment',
        basePrice: 5000,
        salePrice: 4000,
        paymentType: 'FULL',
        reviewCount: 42,
        includedScreeningCount: 10,
        createdAt: '2024-01-15T10:00:00Z'
      };

      // ServiceInfo should be extractable from Service
      const serviceInfo: ServiceInfo = {
        id: fullService.id,
        name: fullService.name,
        slug: fullService.slug,
        description: fullService.description,
        basePrice: fullService.basePrice,
        salePrice: fullService.salePrice,
        includedScreeningCount: fullService.includedScreeningCount
      };

      expect(serviceInfo.id).toBe(fullService.id);
      expect(serviceInfo.name).toBe(fullService.name);
      expect(serviceInfo.includedScreeningCount).toBe(fullService.includedScreeningCount);
    });
  });

  describe('Type compatibility', () => {
    it('should work with booking service relations', () => {
      // Simulating how Service would be used in a Booking
      interface MockBooking {
        id: string;
        serviceId: string;
        service?: ServiceInfo;
      }

      const booking: MockBooking = {
        id: 'booking-123',
        serviceId: 'service-456',
        service: {
          id: 'service-456',
          name: 'Posture Analysis',
          slug: 'posture-analysis',
          basePrice: 5000,
          includedScreeningCount: 10
        }
      };

      expect(booking.service?.includedScreeningCount).toBe(10);
    });

    it('should handle services without screening counts', () => {
      const service: Service = {
        id: 'service-123',
        categoryId: 'category-456',
        name: 'Regular Service',
        slug: 'regular-service',
        basePrice: 3000,
        paymentType: 'FULL',
        reviewCount: 0,
        createdAt: '2024-01-15T10:00:00Z'
      };

      // Services without screening counts should have undefined
      expect(service.includedScreeningCount).toBeUndefined();
    });

    it('should handle features as array', () => {
      const service: Service = {
        id: 'service-123',
        categoryId: 'category-456',
        name: 'Feature-rich Service',
        slug: 'feature-rich-service',
        basePrice: 8000,
        paymentType: 'FULL',
        reviewCount: 0,
        features: [
          'Feature 1',
          'Feature 2',
          'Feature 3'
        ],
        createdAt: '2024-01-15T10:00:00Z'
      };

      expect(Array.isArray(service.features)).toBe(true);
      expect(service.features).toHaveLength(3);
    });
  });
});
