import { useCallback, useEffect, useMemo, type ReactNode } from 'react';
import { $api } from '@/api/query';
import { isApiError, toApiError } from '@/api/problem';
import { SessionContext, type Session } from './session-context';
import { armSessionExpiry } from './expired';

/** A 401 means signed out; any other failure means we don't know. */
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
