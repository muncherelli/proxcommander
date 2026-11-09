import { QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';

import { queryClient } from './query/client';
import { setupReactQueryPlatform } from './query/platform';
import { SessionProvider } from './session/SessionProvider';

setupReactQueryPlatform();

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>{children}</SessionProvider>
    </QueryClientProvider>
  );
}
