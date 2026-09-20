/**
 * The range-of-motion screening flow.
 *
 * Two things here are worth a test more than the markup is, and both cost the patient
 * something when they break: finalising twice spends two screening credits for one
 * assessment, and cancelling must release the session without spending anything.
 *
 * ROMCapture is stubbed. It owns a webcam, a MediaPipe model and a requestAnimationFrame
 * loop, none of which exist in jsdom, and none of which these assertions are about - the
 * stub exposes the two callbacks the page passes it so a test can fire them directly.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/renderWithProviders';

const captureProps: { onComplete?: (r: any) => void; onCancel?: () => void } = {};

vi.mock('../components/rom/ROMCapture', () => ({
  default: (props: any) => {
    captureProps.onComplete = props.onComplete;
    captureProps.onCancel = props.onCancel;
    return <div data-testid="rom-capture" />;
  },
}));

vi.mock('../components/booking/BookingSelectionStep', () => ({
  default: ({ onBookingSelected }: any) => (
    <button onClick={() => onBookingSelected('bk_1')}>choose booking</button>
  ),
}));

const startAnalysis = vi.fn();
const finalizeAnalysis = vi.fn();
const cancelAnalysis = vi.fn();
const getMyAnalyses = vi.fn();

vi.mock('../api/rom', () => ({
  startAnalysis: (...a: any[]) => startAnalysis(...a),
  finalizeAnalysis: (...a: any[]) => finalizeAnalysis(...a),
  cancelAnalysis: (...a: any[]) => cancelAnalysis(...a),
  getMyAnalyses: (...a: any[]) => getMyAnalyses(...a),
}));

import ROMAnalysisPage from './ROMAnalysisPage';

const CAPTURE = {
  movements: {},
  coordinateSpace: 'normalized' as const,
  imageWidth: 1280,
  imageHeight: 720,
};

beforeEach(() => {
  vi.clearAllMocks();
  startAnalysis.mockResolvedValue({ sessionId: 'sess_1', bookingId: 'bk_1' });
  finalizeAnalysis.mockResolvedValue({
    id: 'rom_1', userId: 'u1', bookingId: 'bk_1',
    analysisDate: '2026-09-20T10:00:00Z', status: 'completed',
    metricsJson: {
      calibrationDate: '2026-09-20T10:00:00Z', personId: 'u1', schemaVersion: 2,
      viewsCaptured: ['front'], metrics: {},
    },
  });
  cancelAnalysis.mockResolvedValue(undefined);
  getMyAnalyses.mockResolvedValue([]);
});

async function reachCapture(user: ReturnType<typeof userEvent.setup>) {
  renderWithProviders(<ROMAnalysisPage />);
  await user.click(screen.getByText('choose booking'));
  await user.click(await screen.findByRole('button', { name: /start screening/i }));
  await screen.findByTestId('rom-capture');
}

describe('screening credits', () => {
  it('finalises once even if the capture reports completion twice', async () => {
    // The capture fires its completion from an effect. Two calls would be two
    // finalize requests, and finalize is what spends the credit - so one assessment
    // would cost the patient two screenings.
    const user = userEvent.setup();
    await reachCapture(user);

    captureProps.onComplete!(CAPTURE);
    captureProps.onComplete!(CAPTURE);

    await waitFor(() => expect(finalizeAnalysis).toHaveBeenCalledTimes(1));
  });

  it('does not finalise when the patient cancels', async () => {
    const user = userEvent.setup();
    await reachCapture(user);

    captureProps.onCancel!();

    await waitFor(() => expect(cancelAnalysis).toHaveBeenCalledWith('sess_1'));
    expect(finalizeAnalysis).not.toHaveBeenCalled();
  });

  it('survives the cancel call failing', async () => {
    // Nothing is refunded by cancelling - no credit is spent until finalize - so a
    // failed cancel must not surface as an error to the patient.
    cancelAnalysis.mockRejectedValue(new Error('network'));
    const user = userEvent.setup();
    await reachCapture(user);

    captureProps.onCancel!();

    await waitFor(() =>
      expect(screen.getByText(/before you start/i)).toBeInTheDocument(),
    );
  });

  it('lets the patient retry after a failed analysis, without charging them', async () => {
    finalizeAnalysis.mockRejectedValue(new Error('No range of motion could be measured.'));
    const user = userEvent.setup();
    await reachCapture(user);

    captureProps.onComplete!(CAPTURE);

    await waitFor(() =>
      expect(screen.getByText(/no range of motion could be measured/i)).toBeInTheDocument(),
    );
    // Back on the instructions, and the guard released so a second attempt can run.
    expect(screen.getByText(/before you start/i)).toBeInTheDocument();

    finalizeAnalysis.mockResolvedValue({
      id: 'rom_2', userId: 'u1', bookingId: 'bk_1',
      analysisDate: '2026-09-20T11:00:00Z', status: 'completed',
      metricsJson: {
        calibrationDate: '2026-09-20T11:00:00Z', personId: 'u1', schemaVersion: 2,
        viewsCaptured: ['front'], metrics: {},
      },
    });
    await user.click(screen.getByRole('button', { name: /start screening/i }));
    await screen.findByTestId('rom-capture');
    captureProps.onComplete!(CAPTURE);

    await waitFor(() => expect(finalizeAnalysis).toHaveBeenCalledTimes(2));
  });
});

describe('starting a screening', () => {
  it('surfaces a refusal to start rather than proceeding to the capture', async () => {
    startAnalysis.mockRejectedValue(new Error('No remaining screening counts.'));
    const user = userEvent.setup();
    renderWithProviders(<ROMAnalysisPage />);
    await user.click(screen.getByText('choose booking'));
    await user.click(await screen.findByRole('button', { name: /start screening/i }));

    expect(await screen.findByText(/no remaining screening counts/i)).toBeInTheDocument();
    expect(screen.queryByTestId('rom-capture')).not.toBeInTheDocument();
  });

  it('lists every movement the patient will be asked to perform', async () => {
    const { ROM_MOVEMENTS } = await import('../lib/romMovements');
    const user = userEvent.setup();
    renderWithProviders(<ROMAnalysisPage />);
    await user.click(screen.getByText('choose booking'));

    for (const movement of ROM_MOVEMENTS) {
      expect(screen.getByText(new RegExp(movement.title, 'i'))).toBeInTheDocument();
    }
  });
});
