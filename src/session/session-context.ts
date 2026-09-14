import { createContext, useContext } from 'react';
import type { ApiError } from '@/api/problem';
import type { components } from '@/api/schema';

export type Me = components['schemas']['Me'];

/**
 * Four states, because that is all a page can do about it: wait, offer a way
 * in, show the person their own data, or say that it could not find out.
 * `unavailable` is the one that is easy to leave out: a signed-in person whose
 * backend hiccuped would otherwise be told to sign in, and that sign-in cannot
 * work either.
 */
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

/**
 * For pages behind <RequireSession>, which have already established that there
 * is a person. Throwing beats an impossible branch in every such page, and it
 * can only fire on a wiring mistake.
 */
export function useMe(): Me {
  const session = useSession();
  if (session.status !== 'signed-in') {
    throw new Error('useMe() is only valid inside a route behind <RequireSession>');
  }
  return session.me;
}
