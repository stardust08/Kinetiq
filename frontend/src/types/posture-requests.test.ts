/**
 * Tests for posture analysis request types
 * Validates that all request types are properly defined and type-safe
 */

import { describe, it, expect } from 'vitest';
import type {
  StartAnalysisRequest,
  ProcessFrameRequest,
  FinalizeAnalysisRequest,
  CancelAnalysisRequest,
} from './index';

describe('Posture Analysis Request Types', () => {
  describe('StartAnalysisRequest', () => {
    it('should have correct structure', () => {
      const request: StartAnalysisRequest = {
        bookingId: 'test-booking-id',
      };

      expect(request).toHaveProperty('bookingId');
      expect(typeof request.bookingId).toBe('string');
    });

    it('should enforce required bookingId field', () => {
      // @ts-expect-error - bookingId is required
      const invalid: StartAnalysisRequest = {};
      expect(invalid).toBeDefined();
    });
  });

  describe('ProcessFrameRequest', () => {
    it('should have correct structure', () => {
      const request: ProcessFrameRequest = {
        sessionId: 'test-session-id',
        frameData: 'base64-encoded-data',
        frameNumber: 1,
      };

      expect(request).toHaveProperty('sessionId');
      expect(request).toHaveProperty('frameData');
      expect(request).toHaveProperty('frameNumber');
      expect(typeof request.sessionId).toBe('string');
      expect(typeof request.frameData).toBe('string');
      expect(typeof request.frameNumber).toBe('number');
    });

    it('should enforce all required fields', () => {
      // @ts-expect-error - missing required fields
      const invalid: ProcessFrameRequest = {
        sessionId: 'test-session-id',
      };
      expect(invalid).toBeDefined();
    });
  });

  describe('FinalizeAnalysisRequest', () => {
    it('should have correct structure', () => {
      const request: FinalizeAnalysisRequest = {
        sessionId: 'test-session-id',
        bookingId: 'test-booking-id',
        landmarksData: {
          pose: { 0: [100, 200, 0.5, 0.9] },
          face: {},
          left_hand: {},
          right_hand: {},
        },
      };

      expect(request).toHaveProperty('sessionId');
      expect(request).toHaveProperty('bookingId');
      expect(request).toHaveProperty('landmarksData');
      expect(typeof request.sessionId).toBe('string');
      expect(typeof request.bookingId).toBe('string');
      expect(typeof request.landmarksData).toBe('object');
    });

    it('should allow any structure for landmarksData', () => {
      const request: FinalizeAnalysisRequest = {
        sessionId: 'test-session-id',
        bookingId: 'test-booking-id',
        landmarksData: {
          samples: [{ frame: 1, data: {} }],
          metadata: { totalFrames: 450 },
        },
      };

      expect(request.landmarksData).toHaveProperty('samples');
      expect(request.landmarksData).toHaveProperty('metadata');
    });

    it('should enforce all required fields', () => {
      // @ts-expect-error - missing landmarksData
      const invalid: FinalizeAnalysisRequest = {
        sessionId: 'test-session-id',
        bookingId: 'test-booking-id',
      };
      expect(invalid).toBeDefined();
    });
  });

  describe('CancelAnalysisRequest', () => {
    it('should have correct structure', () => {
      const request: CancelAnalysisRequest = {
        sessionId: 'test-session-id',
      };

      expect(request).toHaveProperty('sessionId');
      expect(typeof request.sessionId).toBe('string');
    });

    it('should enforce required sessionId field', () => {
      // @ts-expect-error - sessionId is required
      const invalid: CancelAnalysisRequest = {};
      expect(invalid).toBeDefined();
    });
  });

  describe('Type compatibility with backend schemas', () => {
    it('should match Pydantic StartAnalysisRequest schema', () => {
      const request: StartAnalysisRequest = {
        bookingId: 'uuid-v4-string',
      };

      // Verify it matches the backend schema structure
      expect(Object.keys(request)).toEqual(['bookingId']);
    });

    it('should match Pydantic ProcessFrameRequest schema', () => {
      const request: ProcessFrameRequest = {
        sessionId: 'uuid-v4-string',
        frameData: 'base64-string',
        frameNumber: 42,
      };

      // Verify it matches the backend schema structure
      expect(Object.keys(request).sort()).toEqual([
        'frameData',
        'frameNumber',
        'sessionId',
      ]);
    });

    it('should match Pydantic FinalizeAnalysisRequest schema', () => {
      const request: FinalizeAnalysisRequest = {
        sessionId: 'uuid-v4-string',
        bookingId: 'uuid-v4-string',
        landmarksData: { key: 'value' },
      };

      // Verify it matches the backend schema structure
      expect(Object.keys(request).sort()).toEqual([
        'bookingId',
        'landmarksData',
        'sessionId',
      ]);
    });

    it('should match Pydantic CancelAnalysisRequest schema', () => {
      const request: CancelAnalysisRequest = {
        sessionId: 'uuid-v4-string',
      };

      // Verify it matches the backend schema structure
      expect(Object.keys(request)).toEqual(['sessionId']);
    });
  });

  describe('Type safety', () => {
    it('should prevent invalid types for StartAnalysisRequest', () => {
      // @ts-expect-error - bookingId must be string
      const invalid: StartAnalysisRequest = {
        bookingId: 123,
      };
      expect(invalid).toBeDefined();
    });

    it('should prevent invalid types for ProcessFrameRequest', () => {
      // @ts-expect-error - frameNumber must be number
      const invalid: ProcessFrameRequest = {
        sessionId: 'test',
        frameData: 'data',
        frameNumber: '1',
      };
      expect(invalid).toBeDefined();
    });

    it('should prevent invalid types for FinalizeAnalysisRequest', () => {
      // @ts-expect-error - landmarksData must be object
      const invalid: FinalizeAnalysisRequest = {
        sessionId: 'test',
        bookingId: 'test',
        landmarksData: 'not-an-object',
      };
      expect(invalid).toBeDefined();
    });
  });
});
