import { formatDuration, formatWhen } from '@/lib/time';
import type { CountdownLine } from '@/ui/Countdown';

/** Where a task stands for its reader in time: before its due, late, open with no due, or closed. */
type TaskPhase = 'before_due' | 'late' | 'open' | 'closed';

function taskPhase(at: number, due: number | null, closes: number | null): TaskPhase {
  if (closes !== null && at >= closes) return 'closed';
  if (due === null) return 'open';
  return at < due ? 'before_due' : 'late';
}

/**
 * What is left of a task for its reader, a line each: how long until it
 * falls due and until it closes for them, `due` and `closes` being their own,
 * extra time included. Past the due a submission is still taken and is late,
 * and it says so. While the server's time is not known yet (`counting`
 * false) it says only when each falls, and nothing of what has passed, so
 * the line is right whatever this browser's clock says. Nothing for a task
 * with neither.
 */
export function taskTimeLines(
  due: string | null,
  closes: string | null,
  at: number,
  counting: boolean,
): CountdownLine[] {
  const dueAt = due === null ? null : Date.parse(due);
  const closesAt = closes === null ? null : Date.parse(closes);
  const lines: CountdownLine[] = [];
  if (!counting) {
    const when = (moment: number) => formatWhen(new Date(moment), new Date(at));
    if (dueAt !== null) lines.push({ key: 'due', text: `Due at ${when(dueAt)}` });
    if (closesAt !== null) {
      lines.push({ key: 'closes', text: `Closes at ${when(closesAt)}` });
    }
    return lines;
  }
  const phase = taskPhase(at, dueAt, closesAt);
  const left = (moment: number) => `in ${formatDuration(moment - at)}`;
  if (phase === 'before_due' && dueAt !== null) {
    lines.push({ key: 'due', text: `Due ${left(dueAt)}` });
  }
  if (phase === 'late') {
    lines.push({ key: 'late', text: 'Past due: a submission now counts as late.' });
  }
  if (phase !== 'closed' && closesAt !== null) {
    lines.push({ key: 'closes', text: `Closes ${left(closesAt)}` });
  }
  if (phase === 'closed')
    lines.push({
      key: 'closed',
      text: 'Closed: it takes no more submissions from you',
    });
  return lines;
}

/**
 * A task's countdown at the top of its page: until it falls due for the
 * reader and until it closes for them, `due` and `closes` being their own.
 */
export function taskCountdown(due: string | null, closes: string | null) {
  const dueAt = due === null ? null : Date.parse(due);
  const closesAt = closes === null ? null : Date.parse(closes);
  return {
    label: 'Task countdown',
    phaseAt: (at: number) => taskPhase(at, dueAt, closesAt),
    lines: (at: number, counting: boolean) => taskTimeLines(due, closes, at, counting),
  };
}

/**
 * A contest's countdown: until it starts, or until it ends. Each task closes
 * at its own time, which its row says. Until the count begins it says when
 * the contest starts or ends by where `now`, the server's time at the read,
 * says it stood; with no `now`, both of its times.
 */
export function contestCountdown(start: string, end: string, now?: string) {
  const startsAt = Date.parse(start);
  const endsAt = Date.parse(end);
  const phaseAt = (moment: number) =>
    moment < startsAt ? 'before' : moment < endsAt ? 'running' : 'ended';
  const lines = (at: number, counting: boolean): CountdownLine[] => {
    const when = (moment: number) => formatWhen(new Date(moment), new Date(at));
    const phase = phaseAt(at);
    const read = now === undefined ? null : phaseAt(Date.parse(now));
    const text = counting
      ? phase === 'before'
        ? `Contest starts in ${formatDuration(startsAt - at)}`
        : phase === 'running'
          ? `Contest ends in ${formatDuration(endsAt - at)}`
          : 'Contest ended'
      : read === 'before'
        ? `Contest starts at ${when(startsAt)}`
        : read === 'running'
          ? `Contest ends at ${when(endsAt)}`
          : read === 'ended'
            ? 'Contest ended'
            : `Contest runs from ${when(startsAt)} to ${when(endsAt)}`;
    return [{ key: 'contest', text }];
  };
  return { label: 'Contest countdown', phaseAt, lines };
}
