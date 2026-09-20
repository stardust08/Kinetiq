import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  startAnalysis,
  processFrame,
  finalizeAnalysis,
  cancelAnalysis,
  getMyAssessments,
  getAnalysisById,
  validateBooking,
} from './posture';
import { apiClient } from './client';
import type {
  StartAnalysisRequest,
  StartAnalysisResponse,
  ProcessFrameRequest,
  ProcessFrameResponse,
  FinalizeAnalysisRequest,
  PostureAnalysis,
  CancelAnalysisRequest,
  ValidateBookingResponse,
} from '../types';

vi.mock('./client');
vi.mock('./errors', () => ({
  isRetryableError: vi.fn((error: unknown) => {
    // Mock implementation: retry on network errors and server errors
    if (error instanceof Error) {
      return error.message.includes('Network error') || 
             error.message.includes('Server error') ||
             error.message.includes('timeout');
    }
    return false;
  }),
}));

describe('Posture API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('startAnalysis', () => {
    it('should start analysis session successfully', async () => {
      const request: StartAnalysisRequest = {
        bookingId: 'booking-123',
      };

      const mockResponse: StartAnalysisResponse = {
        sessionId: 'session-456',
        bookingId: 'booking-123',
        remainingCount: 5,
        expiresAt: '2024-01-01T12:15:00Z',
      };

      vi.mocked(apiClient.post).mockResolvedValue({ data: mockResponse });

      const result = await startAnalysis(request);

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/posture/start-analysis',
        request
      );
      expect(result).toEqual(mockResponse);
    });

    it('should handle error when booking has no remaining counts', async () => {
      const request: StartAnalysisRequest = {
        bookingId: 'booking-123',
      };

      vi.mocked(apiClient.post).mockRejectedValue(
        new Error('No remaining screening counts')
      );

      await expect(startAnalysis(request)).rejects.toThrow(
        'No remaining screening counts'
      );
    });
  });

  describe('processFrame', () => {
    it('should process frame successfully', async () => {
      const request: ProcessFrameRequest = {
        sessionId: 'session-456',
        frameData: 'base64encodeddata',
        frameNumber: 1,
      };

      const mockResponse: ProcessFrameResponse = {
        landmarks: { pose: { 0: [100, 200, 0, 0.95] } },
        visibility: 0.95,
        progress: 0.002,
        message: 'Frame processed successfully',
      };

      vi.mocked(apiClient.post).mockResolvedValue({ data: mockResponse });

      const result = await processFrame(request);

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/posture/process-frame',
        request
      );
      expect(result).toEqual(mockResponse);
    });

    it('should handle invalid frame data', async () => {
      const request: ProcessFrameRequest = {
        sessionId: 'session-456',
        frameData: 'invalid-data',
        frameNumber: 1,
      };

      vi.mocked(apiClient.post).mockRejectedValue(
        new Error('Invalid frame data')
      );

      await expect(processFrame(request)).rejects.toThrow('Invalid frame data');
    });

    it('should retry on network errors', async () => {
      const request: ProcessFrameRequest = {
        sessionId: 'session-456',
        frameData: 'base64encodeddata',
        frameNumber: 1,
      };

      const mockResponse: ProcessFrameResponse = {
        landmarks: { pose: { 0: [100, 200, 0, 0.95] } },
        visibility: 0.95,
        progress: 0.002,
        message: 'Frame processed successfully',
      };

      // Fail twice, then succeed
      vi.mocked(apiClient.post)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ data: mockResponse });

      const result = await processFrame(request);

      expect(apiClient.post).toHaveBeenCalledTimes(3);
      expect(result).toEqual(mockResponse);
    });

    it('should fail after max retries', async () => {
      const request: ProcessFrameRequest = {
        sessionId: 'session-456',
        frameData: 'base64encodeddata',
        frameNumber: 1,
      };

      // Fail all attempts
      vi.mocked(apiClient.post).mockRejectedValue(new Error('Network error'));

      await expect(processFrame(request)).rejects.toThrow('Network error');
      
      // Should try 4 times total (initial + 3 retries)
      expect(apiClient.post).toHaveBeenCalledTimes(4);
    });
  });

  describe('finalizeAnalysis', () => {
    it('should finalize analysis and return results', async () => {
      const request: FinalizeAnalysisRequest = {
        sessionId: 'session-456',
        bookingId: 'booking-123',
        landmarksData: { samples: [] },
      };

      const mockAnalysis: PostureAnalysis = {
        id: 'analysis-789',
        userId: 'user-1',
        bookingId: 'booking-123',
        analysisDate: '2024-01-01T12:00:00Z',
        fhdPixels: 45.2,
        cervicalAngle: 35.5,
        headLateralFlexion: 2.1,
        headRotation: 1.5,
        thoracicKyphosisAngle: 40.0,
        lumbarLordosisAngle: 35.0,
        trunkLateralShift: 3.2,
        trunkAngle: 1.8,
        leftShoulderAngle: 85.0,
        rightShoulderAngle: 87.0,
        shoulderHeightDiff: 2.0,
        roundedShoulderAngle: 15.0,
        leftElbowAngle: 175.0,
        rightElbowAngle: 176.0,
        leftHipAngle: 178.0,
        rightHipAngle: 179.0,
        pelvicObliquity: 1.5,
        pelvicTiltAngle: 10.0,
        hipHeightDiff: 1.0,
        leftKneeAngle: 180.0,
        rightKneeAngle: 181.0,
        kneeVarusValgus: 2.0,
        kneeFlexionNeutral: 0.5,
        qAngleLeft: 15.0,
        qAngleRight: 16.0,
        footProgressionAngle: 5.0,
        pronationSupinationLeft: 3.0,
        pronationSupinationRight: 2.5,
        shoulderWidth: 450.0,
        hipWidth: 350.0,
        torsoLength: 600.0,
        leftArmLength: 700.0,
        rightArmLength: 705.0,
        leftLegLength: 900.0,
        rightLegLength: 902.0,
        landmarksData: { samples: [] },
        status: 'completed',
      };

      vi.mocked(apiClient.post).mockResolvedValue({ data: mockAnalysis });

      const result = await finalizeAnalysis(request);

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/posture/finalize-analysis',
        request
      );
      expect(result).toEqual(mockAnalysis);
    });

    it('should handle finalization errors without deducting count', async () => {
      const request: FinalizeAnalysisRequest = {
        sessionId: 'session-456',
        bookingId: 'booking-123',
        landmarksData: { samples: [] },
      };

      vi.mocked(apiClient.post).mockRejectedValue(
        new Error('Failed to calculate metrics')
      );

      await expect(finalizeAnalysis(request)).rejects.toThrow(
        'Failed to calculate metrics'
      );
    });

    it('should retry on transient server errors', async () => {
      const request: FinalizeAnalysisRequest = {
        sessionId: 'session-456',
        bookingId: 'booking-123',
        landmarksData: { samples: [] },
      };

      const mockAnalysis: PostureAnalysis = {
        id: 'analysis-789',
        userId: 'user-1',
        bookingId: 'booking-123',
        analysisDate: '2024-01-01T12:00:00Z',
        fhdPixels: 45.2,
        cervicalAngle: 35.5,
        headLateralFlexion: 2.1,
        headRotation: 1.5,
        thoracicKyphosisAngle: 40.0,
        lumbarLordosisAngle: 35.0,
        trunkLateralShift: 3.2,
        trunkAngle: 1.8,
        leftShoulderAngle: 85.0,
        rightShoulderAngle: 87.0,
        shoulderHeightDiff: 2.0,
        roundedShoulderAngle: 15.0,
        leftElbowAngle: 175.0,
        rightElbowAngle: 176.0,
        leftHipAngle: 178.0,
        rightHipAngle: 179.0,
        pelvicObliquity: 1.5,
        pelvicTiltAngle: 10.0,
        hipHeightDiff: 1.0,
        leftKneeAngle: 180.0,
        rightKneeAngle: 181.0,
        kneeVarusValgus: 2.0,
        kneeFlexionNeutral: 0.5,
        qAngleLeft: 15.0,
        qAngleRight: 16.0,
        footProgressionAngle: 5.0,
        pronationSupinationLeft: 3.0,
        pronationSupinationRight: 2.5,
        shoulderWidth: 450.0,
        hipWidth: 350.0,
        torsoLength: 600.0,
        leftArmLength: 700.0,
        rightArmLength: 705.0,
        leftLegLength: 900.0,
        rightLegLength: 902.0,
        landmarksData: { samples: [] },
        status: 'completed',
      };

      // Fail once with server error, then succeed
      vi.mocked(apiClient.post)
        .mockRejectedValueOnce(new Error('Server error'))
        .mockResolvedValueOnce({ data: mockAnalysis });

      const result = await finalizeAnalysis(request);

      expect(apiClient.post).toHaveBeenCalledTimes(2);
      expect(result).toEqual(mockAnalysis);
    });
  });

  describe('cancelAnalysis', () => {
    it('should cancel analysis successfully', async () => {
      const request: CancelAnalysisRequest = {
        sessionId: 'session-456',
      };

      const mockResponse = { message: 'Analysis cancelled successfully' };

      vi.mocked(apiClient.post).mockResolvedValue({ data: mockResponse });

      const result = await cancelAnalysis(request);

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/posture/cancel-analysis',
        request
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe('getMyAssessments', () => {
    it('should get all user assessments', async () => {
      const mockAssessments: PostureAnalysis[] = [
        {
          id: 'analysis-1',
          userId: 'user-1',
          bookingId: 'booking-123',
          analysisDate: '2024-01-01T12:00:00Z',
          fhdPixels: 45.2,
          cervicalAngle: 35.5,
          headLateralFlexion: 2.1,
          headRotation: 1.5,
          thoracicKyphosisAngle: 40.0,
          lumbarLordosisAngle: 35.0,
          trunkLateralShift: 3.2,
          trunkAngle: 1.8,
          leftShoulderAngle: 85.0,
          rightShoulderAngle: 87.0,
          shoulderHeightDiff: 2.0,
          roundedShoulderAngle: 15.0,
          leftElbowAngle: 175.0,
          rightElbowAngle: 176.0,
          leftHipAngle: 178.0,
          rightHipAngle: 179.0,
          pelvicObliquity: 1.5,
          pelvicTiltAngle: 10.0,
          hipHeightDiff: 1.0,
          leftKneeAngle: 180.0,
          rightKneeAngle: 181.0,
          kneeVarusValgus: 2.0,
          kneeFlexionNeutral: 0.5,
          qAngleLeft: 15.0,
          qAngleRight: 16.0,
          footProgressionAngle: 5.0,
          pronationSupinationLeft: 3.0,
          pronationSupinationRight: 2.5,
          shoulderWidth: 450.0,
          hipWidth: 350.0,
          torsoLength: 600.0,
          leftArmLength: 700.0,
          rightArmLength: 705.0,
          leftLegLength: 900.0,
          rightLegLength: 902.0,
          status: 'completed',
        },
      ];

      vi.mocked(apiClient.get).mockResolvedValue({ data: mockAssessments });

      const result = await getMyAssessments();

      expect(apiClient.get).toHaveBeenCalledWith('/api/posture/my-assessments', {
        params: undefined,
      });
      expect(result).toEqual(mockAssessments);
    });

    it('should get assessments with filters', async () => {
      const params = {
        bookingId: 'booking-123',
        limit: 10,
        offset: 0,
      };

      vi.mocked(apiClient.get).mockResolvedValue({ data: [] });

      await getMyAssessments(params);

      expect(apiClient.get).toHaveBeenCalledWith('/api/posture/my-assessments', {
        params,
      });
    });
  });

  describe('getAnalysisById', () => {
    it('should get specific analysis by ID', async () => {
      const analysisId = 'analysis-789';
      const mockAnalysis: PostureAnalysis = {
        id: analysisId,
        userId: 'user-1',
        bookingId: 'booking-123',
        analysisDate: '2024-01-01T12:00:00Z',
        fhdPixels: 45.2,
        cervicalAngle: 35.5,
        headLateralFlexion: 2.1,
        headRotation: 1.5,
        thoracicKyphosisAngle: 40.0,
        lumbarLordosisAngle: 35.0,
        trunkLateralShift: 3.2,
        trunkAngle: 1.8,
        leftShoulderAngle: 85.0,
        rightShoulderAngle: 87.0,
        shoulderHeightDiff: 2.0,
        roundedShoulderAngle: 15.0,
        leftElbowAngle: 175.0,
        rightElbowAngle: 176.0,
        leftHipAngle: 178.0,
        rightHipAngle: 179.0,
        pelvicObliquity: 1.5,
        pelvicTiltAngle: 10.0,
        hipHeightDiff: 1.0,
        leftKneeAngle: 180.0,
        rightKneeAngle: 181.0,
        kneeVarusValgus: 2.0,
        kneeFlexionNeutral: 0.5,
        qAngleLeft: 15.0,
        qAngleRight: 16.0,
        footProgressionAngle: 5.0,
        pronationSupinationLeft: 3.0,
        pronationSupinationRight: 2.5,
        shoulderWidth: 450.0,
        hipWidth: 350.0,
        torsoLength: 600.0,
        leftArmLength: 700.0,
        rightArmLength: 705.0,
        leftLegLength: 900.0,
        rightLegLength: 902.0,
        landmarksData: { samples: [] },
        status: 'completed',
      };

      vi.mocked(apiClient.get).mockResolvedValue({ data: mockAnalysis });

      const result = await getAnalysisById(analysisId);

      expect(apiClient.get).toHaveBeenCalledWith(
        `/api/posture/analysis/${analysisId}`
      );
      expect(result).toEqual(mockAnalysis);
    });

    it('should handle not found error', async () => {
      const analysisId = 'non-existent';

      vi.mocked(apiClient.get).mockRejectedValue(new Error('Analysis not found'));

      await expect(getAnalysisById(analysisId)).rejects.toThrow(
        'Analysis not found'
      );
    });
  });

  describe('validateBooking', () => {
    it('should validate booking successfully', async () => {
      const bookingId = 'booking-123';
      const mockResponse: ValidateBookingResponse = {
        valid: true,
        remainingCount: 5,
        totalCount: 10,
        usedCount: 5,
      };

      vi.mocked(apiClient.get).mockResolvedValue({ data: mockResponse });

      const result = await validateBooking(bookingId);

      expect(apiClient.get).toHaveBeenCalledWith(
        `/api/posture/validate-booking/${bookingId}`
      );
      expect(result).toEqual(mockResponse);
    });

    it('should return invalid when no counts remaining', async () => {
      const bookingId = 'booking-123';
      const mockResponse: ValidateBookingResponse = {
        valid: false,
        remainingCount: 0,
        totalCount: 10,
        usedCount: 10,
        message: 'No remaining screening counts',
      };

      vi.mocked(apiClient.get).mockResolvedValue({ data: mockResponse });

      const result = await validateBooking(bookingId);

      expect(result.valid).toBe(false);
      expect(result.remainingCount).toBe(0);
      expect(result.message).toBe('No remaining screening counts');
    });

    it('should handle booking not found', async () => {
      const bookingId = 'non-existent';

      vi.mocked(apiClient.get).mockRejectedValue(new Error('Booking not found'));

      await expect(validateBooking(bookingId)).rejects.toThrow(
        'Booking not found'
      );
    });
  });
});
