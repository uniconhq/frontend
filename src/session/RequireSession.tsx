import { useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { useSession } from './session-context';
import { currentPath } from './login-href';

/**
 * A layout route: everything nested under it needs a session. `next` carries
 * the whole address, search and hash included, so a pasted link still lands
 * where it pointed after the detour through Forgejo.
 *
 * The guard answers one question, once: did this person arrive with a session.
 * A session that goes away while the page is open belongs to the
 * expired-session modal, which keeps the page and everything typed into it. A
 * backend that would not say who you are is not a redirect either: sending
 * someone to /login because /me answered 503 asks them to sign in through the
 * service that is down.
 */
export function RequireSession() {
  const session = useSession();
  const location = useLocation();
  const [admitted, setAdmitted] = useState(false);

  if (session.status === 'signed-in' && !admitted) setAdmitted(true);

  if (session.status === 'loading') return <PageSkeleton rows={4} />;
  if (session.status === 'unavailable') {
    return <ErrorBlock error={session.error} onRetry={session.retry} />;
  }
  if (session.status === 'signed-out') {
    if (admitted) return <PageSkeleton rows={4} />;
    const next = encodeURIComponent(currentPath(location));
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return <Outlet />;
}
