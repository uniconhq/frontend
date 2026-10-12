import { useEffect, useRef } from 'react';
import { BY_DEVICE, useServerClock } from '@/api/use-server-time';
import { BodyText } from '@/ui/BodyText';
import { taskPhase, taskTimeLines, type TaskPhase } from './time-left';
import classes from './contest.module.css';

/**
 * How long until the task falls due for the reader and until it closes for
 * them, by the server's clock, at the top of the task's page: `due` and
 * `closes` are the reader's own, their extra time on the task included.
 * Until the server's time is in it says when each falls; it says so when it
 * counts by the browser's clock because that did not come in, and calls
 * `onBoundary` as it crosses the due or the close, when what the server
 * takes changes.
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
  const { at, measured, byDevice } = useServerClock();
  const phase = taskPhase(
    at,
    due === null ? null : Date.parse(due),
    closes === null ? null : Date.parse(closes),
  );

  const last = useRef<TaskPhase | null>(null);
  useEffect(() => {
    if (!measured) return;
    if (last.current !== null && last.current !== phase) onBoundary?.();
    last.current = phase;
  }, [measured, phase, onBoundary]);

  const lines = taskTimeLines(due, closes, at, measured);
  if (lines.length === 0) return null;
  return (
    <div role="timer" aria-label="Task countdown" className={classes.timeLeft}>
      {lines.map(({ key, text }) => (
        <span key={key} className={classes.timeLine}>
          {text}
        </span>
      ))}
      {byDevice && <BodyText tone="secondary">{BY_DEVICE}</BodyText>}
    </div>
  );
}
