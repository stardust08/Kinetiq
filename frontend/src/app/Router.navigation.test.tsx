/**
 * Routing contract tests.
 *
 * This file was committed empty and stayed that way, which left two failures invisible:
 * a screening card that advertises a route the Router does not serve renders a button
 * that silently lands on the 404 page, and a screening route left off the protected
 * list hands an unauthenticated visitor a capture flow that cannot save anything.
 *
 * Both are read off the source rather than rendered, deliberately. Mounting the Router
 * pulls in MediaPipe, a webcam and the whole page tree; what is being asserted here is
 * a static agreement between two files, and a test that needs a working camera to prove
 * a route exists will be the first thing skipped.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relative: string) =>
  readFileSync(resolve(__dirname, relative), 'utf-8');

const routerSource = read('./Router.tsx');
const screeningSource = read('./components/ai-screening-section.tsx');

/** Every `path="..."` the Router declares. */
function declaredRoutes(): string[] {
  return [...routerSource.matchAll(/path="([^"]+)"/g)].map((m) => m[1]);
}

/** Every `route: "..."` a screening card points a patient at. */
function advertisedRoutes(): string[] {
  return [...screeningSource.matchAll(/route:\s*"([^"]+)"/g)].map((m) => m[1]);
}

/**
 * Routes wrapped in <ProtectedRoute>.
 *
 * Matched on the block between a path and the next one, so a route whose guard is
 * removed stops matching rather than picking up its neighbour's.
 */
function protectedRoutes(): Set<string> {
  const out = new Set<string>();
  const blocks = routerSource.split(/(?=<Route)/);
  for (const block of blocks) {
    const path = block.match(/path="([^"]+)"/)?.[1];
    if (path && block.includes('<ProtectedRoute>')) out.add(path);
  }
  return out;
}

describe('screening cards and routes agree', () => {
  it('advertises at least the three screenings the product ships', () => {
    const advertised = advertisedRoutes();
    expect(advertised).toContain('/posture-analysis');
    expect(advertised).toContain('/gait-analysis');
    expect(advertised).toContain('/rom-analysis');
  });

  it('serves a route for every card on the home page', () => {
    const declared = declaredRoutes();
    for (const route of advertisedRoutes()) {
      expect(declared, `nothing renders ${route}; the card is a dead button`).toContain(
        route,
      );
    }
  });

  it('imports a page component for every screening route', () => {
    for (const route of advertisedRoutes()) {
      const block = routerSource
        .split(/(?=<Route)/)
        .find((b) => b.includes(`path="${route}"`));
      const component = block?.match(/<(\w+)\s*\/>/)?.[1];
      expect(component, `${route} renders nothing`).toBeTruthy();
      expect(
        routerSource,
        `${route} renders <${component}/> but never imports it`,
      ).toMatch(new RegExp(`import\\s+${component}\\s+from`));
    }
  });
});

describe('authentication', () => {
  it('protects every screening capture flow', () => {
    // A capture flow reached while logged out runs the whole assessment and then fails
    // to save it, after the patient has performed every movement.
    const guarded = protectedRoutes();
    for (const route of advertisedRoutes()) {
      expect(guarded, `${route} is reachable without logging in`).toContain(route);
    }
  });

  it('leaves the home page public', () => {
    expect(protectedRoutes().has('/')).toBe(false);
  });

  it('keeps a catch-all so an unknown path does not render a blank page', () => {
    expect(declaredRoutes()).toContain('*');
  });
});

describe('route table hygiene', () => {
  it('declares each path exactly once', () => {
    // Two <Route> elements with the same path is not an error at runtime - the first
    // wins and the second is dead - so nothing reports it.
    const declared = declaredRoutes();
    const duplicates = declared.filter((p, i) => declared.indexOf(p) !== i);
    expect(duplicates).toEqual([]);
  });
});
