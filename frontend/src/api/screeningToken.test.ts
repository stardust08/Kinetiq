/**
 * Tests that every screening request carries its authorisation.
 *
 * This is the frontend half of the product's central rule: a patient may only begin a
 * capture their clinician unlocked. The token is held in a store rather than threaded
 * through props, because it enters at the consultation page and is needed by three
 * separate capture pages - and any one of them forgetting to pass it would produce a
 * capture the patient completes and the server then refuses.
 *
 * So what has to be tested is not the store but the *choke point*: that all three API
 * clients actually read it. A missing token on any one of them is a broken flow that
 * only shows up after the patient has held four poses.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from './client';
import { useScreeningStore } from '../store/screeningStore';

vi.mock('./client');

const ok = (data: unknown) => ({ data: { data } });

beforeEach(() => {
  vi.clearAllMocks();
  useScreeningStore.getState().clear();
});

describe('the screening authorisation reaches every capture endpoint', () => {
  it('ROM start and finalize both send the token', async () => {
    const rom = await import('./rom');
    useScreeningStore.getState().set({ token: 'tok-rom', type: 'ROM' });

    vi.mocked(apiClient.post).mockResolvedValue(
      ok({ sessionId: 's', bookingId: 'b', remainingCount: 1, movements: [] }),
    );
    await rom.startAnalysis('bk_1');
    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/rom/start-analysis',
      expect.objectContaining({ bookingId: 'bk_1', screeningToken: 'tok-rom' }),
    );

    vi.mocked(apiClient.post).mockResolvedValue(ok({ analysis: { id: 'a' } }));
    await rom.finalizeAnalysis({
      sessionId: 's',
      bookingId: 'bk_1',
      romData: {
        movements: {},
        coordinateSpace: 'normalized',
        imageWidth: 1280,
        imageHeight: 720,
      },
    });
    expect(apiClient.post).toHaveBeenLastCalledWith(
      '/api/rom/finalize-analysis',
      expect.objectContaining({ screeningToken: 'tok-rom' }),
    );
  });

  it('gait start and finalize both send the token', async () => {
    const gait = await import('./gait');
    useScreeningStore.getState().set({ token: 'tok-gait', type: 'GAIT' });

    vi.mocked(apiClient.post).mockResolvedValue({ data: { data: { sessionId: 's' } } });
    await gait.startGaitAnalysis({ bookingId: 'bk_1' });
    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/gait/start-analysis',
      expect.objectContaining({ bookingId: 'bk_1', screeningToken: 'tok-gait' }),
    );

    await gait.finalizeGaitAnalysis({
      sessionId: 's',
      bookingId: 'bk_1',
      gaitData: { views: {}, totalFrames: 0, capturedViews: '', fps: 30 },
    });
    expect(apiClient.post).toHaveBeenLastCalledWith(
      '/api/gait/finalize-analysis',
      expect.objectContaining({ screeningToken: 'tok-gait' }),
      expect.objectContaining({ timeout: expect.any(Number) }),
    );
  });

  it('posture start sends the token', async () => {
    const posture = await import('./posture');
    useScreeningStore.getState().set({ token: 'tok-posture', type: 'POSTURE' });

    vi.mocked(apiClient.post).mockResolvedValue(ok({ sessionId: 's' }));
    await posture.startAnalysis({ bookingId: 'bk_1' });

    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/posture/start-analysis',
      expect.objectContaining({ bookingId: 'bk_1', screeningToken: 'tok-posture' }),
    );
  });

  it('an explicit token on the request wins over the store', async () => {
    // Staff driving a capture for a patient may pass one directly.
    const posture = await import('./posture');
    useScreeningStore.getState().set({ token: 'from-store', type: 'POSTURE' });

    vi.mocked(apiClient.post).mockResolvedValue(ok({ sessionId: 's' }));
    await posture.startAnalysis({ bookingId: 'bk_1', screeningToken: 'explicit' });

    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/posture/start-analysis',
      expect.objectContaining({ screeningToken: 'explicit' }),
    );
  });

  it('sends no token when none is held, so staff are authorised by role', async () => {
    const rom = await import('./rom');
    // Nothing set: a clinician starting their own capture.
    vi.mocked(apiClient.post).mockResolvedValue(
      ok({ sessionId: 's', bookingId: 'b', remainingCount: 1, movements: [] }),
    );

    await rom.startAnalysis('bk_1');

    const payload = vi.mocked(apiClient.post).mock.calls[0][1] as Record<string, unknown>;
    expect(payload.screeningToken).toBeUndefined();
  });
});

describe('the authorisation store', () => {
  it('holds one capture worth of authorisation and clears it', () => {
    const store = useScreeningStore.getState();
    store.set({
      token: 'tok',
      type: 'ROM',
      bookingId: 'bk_1',
      consultationId: 'sess_1',
    });

    expect(useScreeningStore.getState().token).toBe('tok');
    expect(useScreeningStore.getState().supervised).toBe(true);
    expect(useScreeningStore.getState().consultationId).toBe('sess_1');

    useScreeningStore.getState().clear();
    expect(useScreeningStore.getState().token).toBeNull();
    expect(useScreeningStore.getState().supervised).toBe(false);
  });

  it('is not persisted', () => {
    // A token surviving a reload in localStorage would outlive the consultation that
    // justified it, which is the whole point of it being one-shot and short-lived.
    useScreeningStore.getState().set({ token: 'tok', type: 'ROM' });
    expect(JSON.stringify(localStorage)).not.toContain('tok');
  });
});
