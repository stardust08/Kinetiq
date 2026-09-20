/**
 * Service Types
 * 
 * Type definitions for services used in the booking system.
 * These types align with the backend Service model.
 */

import { PaymentType } from './index';

/**
 * Complete Service interface matching the backend Service model
 */
export interface Service {
  id: string;
  categoryId: string;
  name: string;
  slug: string;
  description?: string;
  
  // Pricing
  basePrice: number;
  salePrice?: number;
  discount?: number;
  
  // Payment Configuration
  paymentType: PaymentType;
  advancePercent?: number;
  advanceAmount?: number;
  
  // Service Metadata
  duration?: string;
  serviceType?: string;
  features?: string[];
  reviewCount: number;
  deliveryMode?: string;
  sessionCount?: number;
  
  // AI Screening Configuration
  includedScreeningCount?: number;
  
  createdAt: string;
  
  // Relations (optional)
  category?: {
    id: string;
    name: string;
    slug: string;
  };
}

/**
 * Simplified Service information for nested relations
 * Used when service details are included in other entities (e.g., Booking)
 */
export interface ServiceInfo {
  id: string;
  name: string;
  slug: string;
  description?: string;
  basePrice: number;
  salePrice?: number;
  includedScreeningCount?: number;
}
