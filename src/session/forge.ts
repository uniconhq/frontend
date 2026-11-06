import type { QueryClient } from '@tanstack/react-query';
import { $api } from '@/api/query';

// Asked of the backend, not built in, so one image fits every deployment.
const forgeUrl = () =>
  $api.queryOptions('get', '/api/v1/auth/forge-url', undefined, {
    staleTime: Infinity,
    // A sign-out waiting on this must not wait out retries.
    retry: false,
  });

export function useForgeUrl(): string | null {
  return (
    $api.useQuery('get', '/api/v1/auth/forge-url', undefined, {
      staleTime: Infinity,
      retry: false,
    }).data?.url ?? null
  );
}

export function forgePage(forge: string | null, path: string): string | undefined {
  return forge === null ? undefined : `${forge}${path}`;
}

/** Null at once when the backend is down, so a sign-out never waits on it. */
export async function fetchForgeUrl(queryClient: QueryClient): Promise<string | null> {
  try {
    return (await queryClient.fetchQuery(forgeUrl())).url;
  } catch {
    return null;
  }
}
