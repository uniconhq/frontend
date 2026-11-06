import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { isApiError } from './problem';

/** Built here, not in app.tsx, so tests get the same retry and 401 handling. */
export function createQueryClient(options: {
  onUnauthenticated: () => void;
}): QueryClient {
  const report = (error: unknown) => {
    if (isApiError(error) && error.status === 401) options.onUnauthenticated();
  };

  return new QueryClient({
    queryCache: new QueryCache({ onError: report }),
    mutationCache: new MutationCache({ onError: report }),
    defaultOptions: {
      queries: {
        retry: (failureCount, error) => {
          if (failureCount >= 2) return false;
          if (isApiError(error) && error.status >= 400 && error.status < 500)
            return false;
          return true;
        },
        retryDelay: (failureCount) => 300 * 3 ** failureCount,
        staleTime: 30_000,
      },
      mutations: { retry: false },
    },
  });
}
