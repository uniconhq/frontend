import type { QueryClient } from '@tanstack/react-query';
import { $api } from '@/api/query';

/**
 * Where the browser reaches Forgejo, as the backend says. Forgejo owns the
 * account, so the account page, the header menu, the sign-in page and every
 * sign-out link into it. Asked of the backend rather than built into the
 * bundle, so one image fits every deployment; the address does not change
 * while the page is open, so it is asked once.
 */
const forgeUrl = () =>
  $api.queryOptions('get', '/api/v1/auth/forge-url', undefined, {
    staleTime: Infinity,
    // Not retried: a sign-out that needs the address joins whatever request
    // for it is already on its way, and must not wait out retries for it.
    retry: false,
  });

/** Forgejo's address, or null until the backend has answered. */
export function useForgeUrl(): string | null {
  return (
    $api.useQuery('get', '/api/v1/auth/forge-url', undefined, {
      staleTime: Infinity,
      retry: false,
    }).data?.url ?? null
  );
}

/**
 * A page inside Forgejo, e.g. forgePage(forge, '/user/settings'). Undefined
 * while the address is not known yet, which renders a link with nowhere to
 * go for the moment it takes to arrive.
 */
export function forgePage(forge: string | null, path: string): string | undefined {
  return forge === null ? undefined : `${forge}${path}`;
}

/**
 * The address for a step that has to have it now, such as leaving for the
 * forge's sign-out. Usually already in the cache; null when the backend
 * cannot be asked, at once rather than after retries, so a sign-out never
 * waits on a backend that is down.
 */
export async function fetchForgeUrl(queryClient: QueryClient): Promise<string | null> {
  try {
    return (await queryClient.fetchQuery(forgeUrl())).url;
  } catch {
    return null;
  }
}
