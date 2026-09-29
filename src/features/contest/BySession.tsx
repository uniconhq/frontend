import type { ReactNode } from 'react';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { useSession } from '@/session';

/**
 * One address for a signed-in person and a visitor: the page waits to know
 * which the reader is, then shows `signedIn` or `visitor`. A backend that
 * would not say who the reader is shows its error, since treating them as a
 * visitor would hide the page they came for.
 */
export function BySession({
  signedIn,
  visitor,
}: {
  signedIn: ReactNode;
  visitor: ReactNode;
}) {
  const session = useSession();

  if (session.status === 'loading') return <PageSkeleton rows={4} />;
  if (session.status === 'unavailable') {
    return <ErrorBlock error={session.error} onRetry={session.retry} />;
  }
  return session.status === 'signed-in' ? signedIn : visitor;
}
