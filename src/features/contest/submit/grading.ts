import type {
  GradingResult,
  GradingStatus,
  GroupShown,
  Reported,
  Submission,
} from '@/api/types';
import { formatExact } from '@/lib/exact';
import { serverNow } from '@/lib/time';

/**
 * How often a contestant's submissions are read again: soon while a grading
 * is still to finish, since one usually takes seconds, less often the longer
 * it has waited, since one waiting for a machine at a contest's start can
 * wait minutes and every read costs the forge several calls, and now and then
 * otherwise, so an organiser's rejudge reaches the page. Live updates replace
 * this in a later feature.
 */
const WAITING: [olderThanMs: number, everyMs: number][] = [
  [120_000, 15_000],
  [30_000, 5_000],
  [0, 2_000],
];
const MEANWHILE_MS = 60_000;
/**
 * The shortest wait while the live stream is refused: a crowd too large for
 * the proxy's streams is the crowd a read every two seconds would cost the
 * forge most.
 */
const REFUSED_MS = 5_000;

const UNFINISHED = new Set<GradingStatus>(['queued', 'dispatched', 'running']);

function unfinished(submission: Submission): boolean {
  return submission.grading !== null && UNFINISHED.has(submission.grading.status);
}

/**
 * The wait before the next read: by the newest submission still being graded,
 * so a fresh submit is followed closely whatever an older one is doing. While
 * the live stream is open it says when a grading moves, so the page reads
 * again only now and then, in case a nudge was lost on the way. While it is
 * `refused`, no wait is shorter than `REFUSED_MS`. The server stamps a
 * submission by its own clock, which the page's estimate of it can trail, so
 * one stamped ahead of `now` has waited no time at all.
 */
export function pollEvery(
  submissions: Submission[] | Submission | undefined,
  now: Date = serverNow(),
  live = false,
  refused = false,
): number {
  if (live || submissions === undefined) return MEANWHILE_MS;
  const all = Array.isArray(submissions) ? submissions : [submissions];
  const waited = all
    .filter(unfinished)
    .map((found) => Math.max(0, now.getTime() - Date.parse(found.submitted_at)));
  if (waited.length === 0) return MEANWHILE_MS;
  const newest = Math.min(...waited);
  const every = WAITING.find(([olderThan]) => newest >= olderThan)?.[1] ?? MEANWHILE_MS;
  return refused ? Math.max(every, REFUSED_MS) : every;
}

/**
 * What a grading shows as its verdict once it is done: what stopped the run,
 * when something did, or the outcome over the groups the task shows now;
 * where it stands until then, or for good when nothing is shown yet or the
 * grading never finished.
 */
export function verdictOf(grading: GradingResult): string {
  if (grading.status !== 'done') return grading.status;
  return grading.stopped ?? grading.outcome ?? grading.status;
}

/**
 * Why the organisers cancelled the grading, in their words: the sentence a
 * cancelled grading carries, or null on any other status or with none given.
 */
export function cancelReason(grading: GradingResult): string | null {
  if (grading.status !== 'cancelled') return null;
  return grading.reason === null || grading.reason === '' ? null : grading.reason;
}

/**
 * A test's reported value by name as read: a number to at most four
 * decimals, its text, or nothing when it reported none of that name.
 */
export function valueText(values: Reported, name: string): string | undefined {
  const number = values.numbers[name];
  return number === undefined ? values.texts[name] : formatExact(number);
}

/**
 * A group's points out of the most it gives, as `30 / 70`; only the most
 * while its verdict is not shown; nothing on a task that gives no points.
 */
export function pointsText(group: GroupShown): string | null {
  if (group.max === null) return null;
  const most = formatExact(group.max, 2);
  return group.points === null
    ? `of ${most}`
    : `${formatExact(group.points, 2)} / ${most}`;
}

/**
 * The submissions whose grading finished between two reads of the list: each
 * one still being graded in `before` and finished in `after`. Nothing on the
 * first read, when there is no `before`.
 */
export function justFinished(
  before: Submission[] | undefined,
  after: Submission[] | undefined,
): Submission[] {
  if (before === undefined || after === undefined) return [];
  const waiting = new Set(before.filter(unfinished).map((found) => found.number));
  return after.filter((found) => waiting.has(found.number) && !unfinished(found));
}

/** How late a submission was, in started days after the person's due. */
export function lateness(days: number): string {
  return days === 1 ? '1 day late' : `${days} days late`;
}

/** Newest first, whatever order they arrived in. */
export function newestFirst(submissions: Submission[]): Submission[] {
  return [...submissions].sort((a, b) => b.number - a.number);
}
