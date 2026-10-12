import { formatDuration, formatWhen } from '@/lib/time';

/** Where a task stands for its reader in time: before its due, late, open with no due, or closed. */
export type TaskPhase = 'before_due' | 'late' | 'open' | 'closed';

export function taskPhase(
  at: number,
  due: number | null,
  closes: number | null,
): TaskPhase {
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
): { key: string; text: string }[] {
  const dueAt = due === null ? null : Date.parse(due);
  const closesAt = closes === null ? null : Date.parse(closes);
  const lines: { key: string; text: string }[] = [];
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
