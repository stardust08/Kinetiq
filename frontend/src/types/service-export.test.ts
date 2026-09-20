/**
 * Service Type Export Tests
 * 
 * Tests to verify service types are properly exported from the main types file
 */

import { describe, it, expect } from 'vitest';
import type { Service, ServiceInfo } from './index';

describe('Service Type Exports', () => {
  it('should export Service type from main types file', () => {
    const service: Service = {
      id: 'service-123',
      categoryId: 'category-456',
      name: 'Test Service',
      slug: 'test-service',
      basePrice: 1000,
      paymentType: 'FULL',
      reviewCount: 0,
      createdAt: '2024-01-15T10:00:00Z'
    };

    expect(service.id).toBe('service-123');
  });

  it('should export ServiceInfo type from main types file', () => {
    const serviceInfo: ServiceInfo = {
      id: 'service-123',
      name: 'Test Service',
      slug: 'test-service',
      basePrice: 1000
    };

    expect(serviceInfo.id).toBe('service-123');
  });

  it('should work with Service type including screening count', () => {
    const service: Service = {
      id: 'service-123',
      categoryId: 'category-456',
      name: 'Posture Analysis',
      slug: 'posture-analysis',
      basePrice: 5000,
      paymentType: 'FULL',
      reviewCount: 0,
      includedScreeningCount: 10,
      createdAt: '2024-01-15T10:00:00Z'
    };

    expect(service.includedScreeningCount).toBe(10);
  });
});
