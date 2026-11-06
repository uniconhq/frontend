import { useEffect, useRef } from 'react';
import { BY_DEVICE, useServerClock } from '@/api/use-server-time';
import { BodyText } from '@/ui/BodyText';
import { Group } from '@/ui/layout';
import classes from './Countdown.module.css';

export type CountdownLine = { key: string; text: string };

/**
 * A countdown by the server's clock, never the browser's. `lines` says it at
 * `at`; until the server's time is in (`counting` false) they should say only
 * when each moment falls. A server that did not answer leaves the browser's
 * clock to count by, and it says so. `onBoundary` is called as `phaseAt`
 * changes, which is when the page changes on the server too. `row` sets the
 * lines side by side; otherwise they lead a contest's page.
 */
export function Countdown({
  label,
  phaseAt,
  lines,
  onBoundary,
  row = false,
}: {
  label: string;
  phaseAt: (at: number) => string;
  lines: (at: number, counting: boolean) => CountdownLine[];
  onBoundary?: () => void;
  row?: boolean;
}) {
  const { at, measured, byDevice } = useServerClock();
  const phase = phaseAt(at);

  const last = useRef<string | null>(null);
  useEffect(() => {
    if (!measured) return;
    if (last.current !== null && last.current !== phase) onBoundary?.();
    last.current = phase;
  }, [measured, phase, onBoundary]);

  const shown = lines(at, measured);
  if (shown.length === 0) return null;
  const spans = shown.map(({ key, text }) => (
    <span key={key} className={row ? classes.line : classes.large}>
      {text}
    </span>
  ));
  const device = byDevice && <BodyText tone="secondary">{BY_DEVICE}</BodyText>;
  if (row)
    return (
      <Group role="timer" aria-label={label} gap="4px 24px" align="baseline">
        {spans}
        {device}
      </Group>
    );
  return (
    <div role="timer" aria-label={label}>
      {spans}
      {device}
    </div>
  );
}
