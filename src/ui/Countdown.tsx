import { useEffect, useRef } from 'react';
import { BY_DEVICE, useServerClock } from '@/api/use-server-time';
import { BodyText } from '@/ui/BodyText';
import { formatDuration, formatWhen } from '@/lib/time';
import classes from './Countdown.module.css';

type Phase = 'before' | 'running' | 'ended';

/**
 * How long until the contest starts, or until it ends, by the server's clock
 * and never the browser's, each said with what it counts to. Each task
 * closes at its own time, which its row says; this counts the contest as a
 * whole. Asking for the server's time is what measures how far this
 * browser's clock is out, so until that answer is in it says when the contest
 * starts or ends rather than counting, by where `now` says it stood; a server that did not answer leaves
 * the browser's clock to count by, and the countdown says so. `onBoundary` is
 * called as the count crosses the start or the end, which is when what the
 * page shows changes on the server too. `large` is for the first thing a
 * contest's own page answers.
 */
export function Countdown({
  start,
  end,
  now,
  onBoundary,
  large = false,
}: {
  start: string;
  end: string;
  /** The server's time when the page was read, which says where the contest stands until the count begins. */
  now?: string;
  onBoundary?: () => void;
  large?: boolean;
}) {
  const { at, measured, byDevice } = useServerClock();
  const startsAt = Date.parse(start);
  const endsAt = Date.parse(end);
  const phaseAt = (moment: number): Phase =>
    moment < startsAt ? 'before' : moment < endsAt ? 'running' : 'ended';
  const phase = phaseAt(at);

  const last = useRef<Phase | null>(null);
  useEffect(() => {
    if (!measured) return;
    if (last.current !== null && last.current !== phase) onBoundary?.();
    last.current = phase;
  }, [measured, phase, onBoundary]);

  const when = (moment: number) => formatWhen(new Date(moment), new Date(at));
  let text: string;
  if (!measured) {
    // Where the contest stands by the server's word at the read, never by
    // this browser's clock; with no such word, both of its times.
    const read = now === undefined ? null : phaseAt(Date.parse(now));
    text =
      read === 'before'
        ? `Contest starts at ${when(startsAt)}`
        : read === 'running'
          ? `Contest ends at ${when(endsAt)}`
          : read === 'ended'
            ? 'Contest ended'
            : `Contest runs from ${when(startsAt)} to ${when(endsAt)}`;
  } else {
    text =
      phase === 'before'
        ? `Contest starts in ${formatDuration(startsAt - at)}`
        : phase === 'running'
          ? `Contest ends in ${formatDuration(endsAt - at)}`
          : 'Contest ended';
  }

  return (
    <div role="timer" aria-label="Contest countdown">
      <span className={large ? classes.large : classes.line}>{text}</span>
      {byDevice && <BodyText tone="secondary">{BY_DEVICE}</BodyText>}
    </div>
  );
}
