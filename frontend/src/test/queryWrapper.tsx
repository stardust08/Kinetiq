import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Create a new QueryClient for testing
 * Disables retries and caching for predictable test behavior
 */
export const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });

/**
 * Wrapper component for testing hooks that use React Query
 * Creates a fresh QueryClient for each test
 */
export const createQueryWrapper = () => {
  const queryClient = createTestQueryClient();
  
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};
