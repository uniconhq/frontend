import { createContext, useContext } from 'react';
import type { ApiError } from '@/api/problem';
import type { Me } from '@/api/types';

/** `unavailable` keeps a backend hiccup from telling a signed-in person to sign in. */
export type Session =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; me: Me }
  | { status: 'unavailable'; error: ApiError; retry: () => void };

export const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (session === null) {
    throw new Error('useSession() needs a <SessionProvider> above it');
  }
  return session;
}

/** Only behind <RequireSession>; throws on a wiring mistake. */
export function useMe(): Me {
  const session = useSession();
  if (session.status !== 'signed-in') {
    throw new Error('useMe() is only valid inside a route behind <RequireSession>');
  }
  return session.me;
}
