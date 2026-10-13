import type { GradingResult, SubmissionState, Submission } from '@/api/types';
import { formatPoints } from '@/lib/exact';
import { formatWhen, serverNow } from '@/lib/time';

/**
 * How often a contestant's submissions are read again: soon while a grading
 * is still to finish, since one usually takes seconds, less often the longer
 * it has waited, since one waiting for a machine at a contest's start can
 * wait minutes and every read costs the forge several calls, and now and then
 * otherwise, so an organiser's rejudge reaches the page. While the live
 * stream is open it tells the page of each change, and this is once a
 * minute.
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

/**
 * Where a submission still waits for a result. A delayed one is among them:
 * Unicon tries it again by itself, and the page should see it move on.
 */
const UNFINISHED = new Set<SubmissionState>(['queued', 'grading', 'delayed']);

/**
 * What an entrant reads under a delayed grading's badge (#442): the grading
 * failed on Unicon's side, which says nothing of their submission, so no
 * more than the wait already says of a hidden step.
 */
export const DELAYED_SENTENCE =
  "A problem on Unicon's side. Nothing is lost, and it does not use up a submission.";

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
  if (grading.status !== 'graded') return grading.status;
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

/**
 * A submission's points as its row in the list says them: what is shown,
 * such as `75`, a shown 0 as `0`; `—` while it is still being graded, when
 * it never will be, or while nothing is shown and no time is known; and
 * while some of its points wait for a reveal, when they are shown, such as
 * `shown at 14:00` while none are, or `30 so far, more shown at 14:00`. Exact numbers, rounded for reading as the opened submission
 * rounds them.
 */
export function pointsLine(
  grading: GradingResult | null,
  now: Date = serverNow(),
): string {
  if (grading === null || grading.status !== 'graded' || grading.points === null) {
    return '—';
  }
  const { shown, pending_until: until } = grading.points;
  if (until === null) return shown === null ? '—' : formatPoints(shown);
  const at = formatWhen(new Date(until), now);
  return shown === null
    ? `shown at ${at}`
    : `${formatPoints(shown)} so far, more shown at ${at}`;
}

/** How late a submission was, in started days after the person's due. */
export function lateness(days: number): string {
  return days === 1 ? '1 day late' : `${days} days late`;
}

/** Newest first, whatever order they arrived in. */
export function newestFirst(submissions: Submission[]): Submission[] {
  return [...submissions].sort((a, b) => b.number - a.number);
}
