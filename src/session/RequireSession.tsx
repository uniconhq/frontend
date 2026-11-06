import { useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { useSession } from './session-context';
import { currentPath } from './login-href';

/**
 * Checks once, on arrival. A session lost later is the expired modal's job,
 * and a down backend shows an error, not a sign-in that can't work.
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
