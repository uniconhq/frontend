import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { isApiError } from './problem';

/**
 * The app's one query client, built here rather than in app.tsx so the tests
 * exercise the same retry policy and the same 401 handling the browser gets.
 * What a 401 means is not this layer's business, so it takes a callback.
 *
 * @param onUnauthenticated every 401 the app sees, read or write.
 */
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
