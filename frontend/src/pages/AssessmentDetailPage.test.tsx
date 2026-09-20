import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AssessmentDetailPage from './AssessmentDetailPage';
import * as postureApi from '../api/posture';

// Mock the API module
vi.mock('../api/posture');

const mockAnalysis = {
  id: 'analysis-1',
  userId: 'user-1',
  bookingId: 'booking-1',
  analysisDate: '2024-01-15T10:00:00Z',
  fhdPixels: 45.2,
  cervicalAngle: 35.5,
  headLateralFlexion: 2.1,
  headRotation: 1.5,
  thoracicKyphosisAngle: 40.0,
  lumbarLordosisAngle: 45.0,
  trunkLateralShift: 1.2,
  trunkAngle: 0.5,
  leftShoulderAngle: 85.0,
  rightShoulderAngle: 87.0,
  shoulderHeightDiff: 2.0,
  roundedShoulderAngle: 15.0,
  leftElbowAngle: 175.0,
  rightElbowAngle: 176.0,
  leftHipAngle: 180.0,
  rightHipAngle: 179.0,
  pelvicObliquity: 1.5,
  pelvicTiltAngle: 10.0,
  hipHeightDiff: 1.0,
  leftKneeAngle: 178.0,
  rightKneeAngle: 177.0,
  kneeVarusValgus: 2.0,
  kneeFlexionNeutral: 0.5,
  qAngleLeft: 15.0,
  qAngleRight: 16.0,
  footProgressionAngle: 5.0,
  pronationSupinationLeft: 3.0,
  pronationSupinationRight: 2.5,
  shoulderWidth: 45.0,
  hipWidth: 35.0,
  torsoLength: 60.0,
  leftArmLength: 70.0,
  rightArmLength: 71.0,
  leftLegLength: 90.0,
  rightLegLength: 91.0,
  landmarksData: {},
  status: 'completed',
  isActive: true,
};

const createWrapper = (initialRoute = '/posture-analysis/analysis-1') => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <Routes>
          <Route path="/posture-analysis/:analysisId" element={children} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe('AssessmentDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state initially', () => {
    vi.mocked(postureApi.getAnalysisById).mockImplementation(() => new Promise(() => {}));
    
    render(<AssessmentDetailPage />, { wrapper: createWrapper() });
    
    // Check for loading spinner by class
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('shows error state when analysis not found', async () => {
    vi.mocked(postureApi.getAnalysisById).mockRejectedValue(new Error('Not found'));
    
    render(<AssessmentDetailPage />, { wrapper: createWrapper() });
    
    await waitFor(() => {
      expect(screen.getByText('Assessment Not Found')).toBeInTheDocument();
    });
  });

  it('renders assessment details when loaded', async () => {
    vi.mocked(postureApi.getAnalysisById).mockResolvedValue(mockAnalysis);
    
    render(<AssessmentDetailPage />, { wrapper: createWrapper() });
    
    await waitFor(() => {
      expect(screen.getByText('Back to History')).toBeInTheDocument();
    });
  });
});
