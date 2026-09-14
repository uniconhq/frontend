import { useCallback, useEffect, useMemo, type ReactNode } from 'react';
import { $api } from '@/api/query';
import { isApiError, toApiError } from '@/api/problem';
import { SessionContext, type Session } from './session-context';
import { armSessionExpiry } from './expired';

/**
 * The app asks who you are exactly once, at boot, and everything below reads
 * the answer from context.
 *
 * A 401 is not an error here: it is the signed-out state. Anything else is
 * `unavailable`, which is not the same as signed out. Telling a signed-in
 * person to sign in because the backend hiccuped sends them into a sign-in that
 * cannot work either, since the thing that is down is the thing that would sign
 * them in.
 *
 * Once per boot means no refetch on focus or reconnect for the two states that
 * settled. `unavailable` did not settle, so that one does refetch when the
 * network comes back.
 */

/** A 401 is an answer. Everything else that failed means we do not know. */
function meansUnavailable(error: unknown): boolean {
  if (error === null || error === undefined) return false;
  return !(isApiError(error) && error.status === 401);
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const query = $api.useQuery('get', '/api/v1/me', undefined, {
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: (me) => meansUnavailable(me.state.error),
  });

  const { refetch } = query;
  const retry = useCallback(() => void refetch(), [refetch]);

  const me = query.data ?? null;
  const error = query.error ?? null;

  const session = useMemo<Session>(() => {
    if (me !== null) return { status: 'signed-in', me };
    if (meansUnavailable(error)) {
      return { status: 'unavailable', error: toApiError(error), retry };
    }
    if (error !== null) return { status: 'signed-out' };
    return { status: 'loading' };
  }, [me, error, retry]);

  useEffect(() => {
    armSessionExpiry(session.status === 'signed-in');
  }, [session.status]);

  return <SessionContext value={session}>{children}</SessionContext>;
}
