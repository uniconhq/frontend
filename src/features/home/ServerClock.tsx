import { $api, queryView } from '@/api/query';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { BodyText } from '@/ui/BodyText';
import { formatTimeOfDay, serverClockOffsetMs } from '@/lib/time';

/**
 * Proves the whole chain end to end against the one endpoint that needs no
 * session. The offset itself is measured in the client middleware, where the
 * round trip is known; this only shows the answer, because every deadline is
 * decided by the server's clock and contestant laptops are often minutes out.
 */
export function ServerClock() {
  const view = queryView($api.useQuery('get', '/api/v1/time'));

  if (view.state === 'loading') return <PageSkeleton rows={1} />;
  if (view.state === 'error') {
    return <ErrorBlock error={view.error} onRetry={view.retry} />;
  }

  return (
    <BodyText tone="secondary" mono>
      server time {formatTimeOfDay(new Date(view.data.now))} · this browser is off by{' '}
      {Math.round(-serverClockOffsetMs())} ms
    </BodyText>
  );
}
