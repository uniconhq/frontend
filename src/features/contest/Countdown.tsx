import { useEffect, useRef, useState } from 'react';
import { $api } from '@/api/query';
import { BodyText } from '@/ui/BodyText';
import { formatDuration, serverNow } from '@/lib/time';

const TICK_MS = 1000;

type Phase = 'before' | 'running' | 'ended';

/**
 * How long until the contest starts, or until it ends, by the server's clock
 * and never the browser's, each said with what it counts to. Each task closes at its own time, which its entry
 * says; this counts the contest as a whole. Asking for the server's time is
 * what measures how far this browser's clock is out, so nothing is counted
 * until that answer is in; a server that did not answer leaves the browser's
 * clock to count by. `onBoundary` is called as the count crosses the start
 * or the end, which is when what the page shows changes on the server too.
 */
export function Countdown({
  start,
  end,
  onBoundary,
}: {
  start: string;
  end: string;
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
  const endsAt = Date.parse(end);
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
      ? `Contest starts in ${formatDuration(startsAt - at)}`
      : phase === 'running'
        ? `Contest ends in ${formatDuration(endsAt - at)}`
        : 'Contest ended';

  return (
    <div role="timer" aria-label="Contest countdown">
      <BodyText size="md" mono>
        {text}
      </BodyText>
    </div>
  );
}
