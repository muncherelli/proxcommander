import { QueryClient } from '@tanstack/react-query';

import { PveError } from '../proxmox/client';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      // Client errors (bad params, permissions, expired auth) won't fix themselves.
      retry: (failureCount, error) => !(error instanceof PveError && error.status < 500) && failureCount < 2,
    },
    mutations: { retry: false },
  },
});
