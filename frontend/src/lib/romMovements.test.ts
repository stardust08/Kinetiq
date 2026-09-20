/**
 * The capture script's invariants.
 *
 * ROM_MOVEMENTS drives what the patient is asked to do, in what order, and facing which
 * way. The backend keeps its own authoritative copy of the movement -> view -> metric
 * mapping (app/api/rom/service.py) and will not take the client's word for any of it,
 * so a disagreement here does not corrupt a measurement - it produces a rejected
 * capture, or a movement the patient performs and nothing measures.
 */

import { describe, expect, it } from 'vitest';
import {
  FRAMES_PER_HOLD,
  HOLD_SECONDS,
  MIN_FRAMES_PER_HOLD,
  ROM_MOVEMENTS,
  movementsByView,
} from './romMovements';

describe('ROM_MOVEMENTS', () => {
  it('has no duplicate movement ids', () => {
    const ids = ROM_MOVEMENTS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('measures each metric from exactly one movement', () => {
    const seen = new Map<string, string>();
    for (const movement of ROM_MOVEMENTS) {
      for (const key of movement.metrics) {
        expect(seen.has(key), `${key} claimed by ${seen.get(key)} and ${movement.id}`).toBe(
          false,
        );
        seen.set(key, movement.id);
      }
    }
  });

  it('gives every movement at least one metric and a real instruction', () => {
    for (const movement of ROM_MOVEMENTS) {
      expect(movement.metrics.length, movement.id).toBeGreaterThan(0);
      expect(movement.instruction.length, movement.id).toBeGreaterThan(20);
      expect(movement.title.length, movement.id).toBeGreaterThan(0);
    }
  });

  it('only uses views the orientation gate can detect', () => {
    for (const movement of ROM_MOVEMENTS) {
      expect(['front', 'back', 'leftside', 'rightside']).toContain(movement.view);
    }
  });

  it('names the side in the instruction for every one-sided movement', () => {
    // A patient reading "raise your arm" during a right-side hold will raise whichever
    // arm they favour, and the capture measures the one the camera can see.
    for (const movement of ROM_MOVEMENTS) {
      const side = movement.id.endsWith('_left')
        ? 'left'
        : movement.id.endsWith('_right')
          ? 'right'
          : null;
      if (!side) continue;
      expect(movement.instruction.toLowerCase(), movement.id).toContain(side);
    }
  });

  it('measures a one-sided movement from the view that can see that side', () => {
    for (const movement of ROM_MOVEMENTS) {
      if (movement.id.endsWith('_left')) expect(movement.view).toBe('leftside');
      if (movement.id.endsWith('_right')) expect(movement.view).toBe('rightside');
    }
  });

  it('reports a metric whose side matches the movement performed', () => {
    for (const movement of ROM_MOVEMENTS) {
      if (movement.id.endsWith('_left')) {
        expect(movement.metrics.every((k) => k.endsWith('_left')), movement.id).toBe(true);
      }
      if (movement.id.endsWith('_right')) {
        expect(movement.metrics.every((k) => k.endsWith('_right')), movement.id).toBe(true);
      }
    }
  });
});

describe('capture order', () => {
  it('groups movements so the patient turns as few times as possible', () => {
    // Each turn is a chance to end up facing the wrong way, and the orientation gate
    // then blocks the capture until they fix it. One group per view is the minimum.
    const groups = movementsByView();
    const views = groups.map((g) => g.view);
    expect(new Set(views).size).toBe(views.length);
  });

  it('covers every movement exactly once across the groups', () => {
    const grouped = movementsByView().flatMap((g) => g.movements.map((m) => m.id));
    expect(grouped.sort()).toEqual(ROM_MOVEMENTS.map((m) => m.id).sort());
  });
});

describe('hold budget', () => {
  it('accepts a hold the backend will also accept', () => {
    // The backend rejects anything under MIN_FRAMES_PER_HOLD. Targeting fewer frames
    // than that would send captures it is guaranteed to refuse.
    expect(FRAMES_PER_HOLD).toBeGreaterThanOrEqual(MIN_FRAMES_PER_HOLD);
  });

  it('holds long enough to average out tracking jitter', () => {
    expect(HOLD_SECONDS).toBeGreaterThanOrEqual(2);
    expect(FRAMES_PER_HOLD / HOLD_SECONDS).toBeGreaterThanOrEqual(15);
  });
});
