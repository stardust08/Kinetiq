import React from 'react';
import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { createTestQueryClient } from './queryWrapper';

/**
 * Render a component with the providers the app always has around it.
 *
 * Components in this codebase reach for react-query and react-router as a matter of
 * course - a card links somewhere, a list fetches something - and a bare `render()`
 * therefore throws before a single assertion runs. That accounted for 126 of the 244
 * failing frontend tests: 88 "No QueryClient set" and 38 "useNavigate() may be used
 * only in the context of a <Router>". None of them were assertions that had drifted
 * from the UI; they were components rendered without the context they need.
 *
 * MemoryRouter rather than BrowserRouter: it needs no DOM history, starts from a known
 * location, and can be given one - so a test that cares about the route can say so.
 *
 * A fresh QueryClient per render, with retries and caching off, so one test's cached
 * response cannot satisfy the next test's query.
 */
export function renderWithProviders(
  ui: React.ReactElement,
  {
    route = '/',
    ...options
  }: RenderOptions & { route?: string } = {},
): RenderResult {
  const queryClient = createTestQueryClient();

  function Providers({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
      </QueryClientProvider>
    );
  }

  return render(ui, { wrapper: Providers, ...options });
}

export default renderWithProviders;
