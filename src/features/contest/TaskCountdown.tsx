import { useEffect, useRef, useState } from 'react';
import { $api } from '@/api/query';
import { BodyText } from '@/ui/BodyText';
import { formatDuration, serverNow } from '@/lib/time';

const TICK_MS = 1000;

type Phase = 'before_due' | 'late' | 'open' | 'closed';

function phaseAt(at: number, due: number | null, closes: number | null): Phase {
  if (closes !== null && at >= closes) return 'closed';
  if (due === null) return 'open';
  return at < due ? 'before_due' : 'late';
}

/**
 * How long until the task falls due for the reader and until it closes for
 * them, by the server's clock: `due` and `closes` are the row's own, its
 * extension on the task included. Past the due, a submission is still taken
 * and is late, and it says so. Like the contest's countdown it counts nothing
 * until the server's time is in, and calls `onBoundary` as it crosses the due
 * or the close, when what the server takes changes.
 */
export function TaskCountdown({
  due,
  closes,
  onBoundary,
}: {
  due: string | null;
  closes: string | null;
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
  const dueAt = due === null ? null : Date.parse(due);
  const closesAt = closes === null ? null : Date.parse(closes);
  const phase = phaseAt(at, dueAt, closesAt);

  const last = useRef<Phase | null>(null);
  useEffect(() => {
    if (!measured) return;
    if (last.current !== null && last.current !== phase) onBoundary?.();
    last.current = phase;
  }, [measured, phase, onBoundary]);

  if (!measured || (dueAt === null && closesAt === null)) return null;

  const lines: [key: string, text: string][] = [];
  if (phase === 'before_due' && dueAt !== null) {
    lines.push(['due', `Due in ${formatDuration(dueAt - at)}`]);
  }
  if (phase === 'late') lines.push(['late', 'Past due: a submission now is late.']);
  if (phase !== 'closed' && closesAt !== null) {
    lines.push(['closes', `Closes in ${formatDuration(closesAt - at)}`]);
  }
  if (phase === 'closed') lines.push(['closed', 'Closed for you']);

  return (
    <div role="timer" aria-label="Task countdown">
      {lines.map(([key, text]) => (
        <BodyText key={key} size="md" mono>
          {text}
        </BodyText>
      ))}
    </div>
  );
}
