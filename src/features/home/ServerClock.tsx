import { $api, queryView } from '@/api/query';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { BodyText } from '@/ui/BodyText';
import { formatDuration, formatTimeOfDay, serverClockOffsetMs } from '@/lib/time';

/** How far out this device's clock may be before the page mentions it. */
const SAY_FROM_MS = 2000;

/**
 * Proves the whole chain end to end against the one endpoint that needs no
 * session. The offset itself is measured in the client middleware, where the
 * round trip is known; this only shows the answer, because every deadline is
 * decided by the server's clock and contestant laptops are often minutes out.
 * A device more than a moment out is told by how much.
 */
export function ServerClock() {
  const view = queryView($api.useQuery('get', '/api/v1/time'));

  if (view.state === 'loading') return <PageSkeleton rows={1} />;
  if (view.state === 'error') {
    return <ErrorBlock error={view.error} onRetry={view.retry} />;
  }

  const ahead = -serverClockOffsetMs();
  return (
    <BodyText tone="secondary">
      Deadlines and countdowns follow Unicon&apos;s clock, which read{' '}
      {formatTimeOfDay(new Date(view.data.now))} when this page opened.
      {Math.abs(ahead) >= SAY_FROM_MS &&
        ` This device's clock is ${formatDuration(Math.abs(ahead))} ${ahead > 0 ? 'ahead of' : 'behind'} it.`}
    </BodyText>
  );
}
