import { useEffect, useRef, useState } from 'react';
import { $api } from '@/api/query';
import { BodyText } from '@/ui/BodyText';
import { formatDuration, serverNow } from '@/lib/time';

const TICK_MS = 1000;

type Phase = 'before' | 'running' | 'ended';

/**
 * How long until the contest starts, or until this person's own deadline, by
 * the server's clock and never the browser's. `deadline` is the contest's end
 * plus any extension the organisers gave this person, as the server works it
 * out, so the count reaches nothing at the moment the server stops taking
 * submissions from them. Asking for the server's time is what measures how
 * far this browser's clock is out, so nothing is counted until that answer
 * is in; a server that did not answer leaves the browser's clock to count by.
 * `onBoundary` is called as the count crosses the start or the deadline,
 * which is when what the page shows changes on the server too.
 */
export function Countdown({
  start,
  deadline,
  onBoundary,
}: {
  start: string;
  deadline: string;
  onBoundary?: () => void;
}) {
  const measured = $api.useQuery('get', '/api/v1/time').isFetched;
  const [, setTicks] = useState(0);

  useEffect(() => {
    if (!measured) return;
    const tick = setInterval(() => setTicks((ticks) => ticks + 1), TICK_MS);
    return () => clearInterval(tick);
  }, [measured]);

  const at = serverNow().getTime();
  const startsAt = Date.parse(start);
  const endsAt = Date.parse(deadline);
  const phase: Phase = at < startsAt ? 'before' : at < endsAt ? 'running' : 'ended';

  const last = useRef<Phase | null>(null);
  useEffect(() => {
    if (!measured) return;
    if (last.current !== null && last.current !== phase) onBoundary?.();
    last.current = phase;
  }, [measured, phase, onBoundary]);

  if (!measured) return null;

  const text =
    phase === 'before'
      ? `Starts in ${formatDuration(startsAt - at)}`
      : phase === 'running'
        ? `Time left ${formatDuration(endsAt - at)}`
        : 'Ended';

  return (
    <div role="timer" aria-label="Countdown">
      <BodyText size="md" mono>
        {text}
      </BodyText>
    </div>
  );
}
