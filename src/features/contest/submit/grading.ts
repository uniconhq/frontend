import type { GradingResult, SubmissionState, Submission } from '@/api/types';
import { formatExact } from '@/lib/exact';
import { serverNow } from '@/lib/time';
import { BEING_CHECKED, MISSING } from '@/ui/number/words';

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
 * `refused`, no wait is shorter than `REFUSED_MS`. A submission still waiting
 * on `reveal_at` is read again then, live stream or not, because a reveal
 * changes what is shown without a grading moving. The server stamps a
 * submission by its own clock, which the page's estimate of it can trail, so
 * one stamped ahead of `now` has waited no time at all.
 */
export function pollEvery(
  submissions: Submission[] | Submission | undefined,
  now: Date = serverNow(),
  live = false,
  refused = false,
): number {
  const all =
    submissions === undefined
      ? []
      : Array.isArray(submissions)
        ? submissions
        : [submissions];
  const reveal = revealWait(all, now);
  if (live || submissions === undefined) {
    return reveal === null ? MEANWHILE_MS : Math.min(MEANWHILE_MS, reveal);
  }
  const waited = all
    .filter(unfinished)
    .map((found) => Math.max(0, now.getTime() - Date.parse(found.submitted_at)));
  const base =
    waited.length === 0
      ? MEANWHILE_MS
      : (WAITING.find(([olderThan]) => Math.min(...waited) >= olderThan)?.[1] ??
        MEANWHILE_MS);
  const every = refused ? Math.max(base, REFUSED_MS) : base;
  return reveal === null ? every : Math.min(every, reveal);
}

/**
 * How long until the soonest reveal still ahead, or five seconds when one
 * is already due, so a page open on it reads again then without spinning
 * if the reveal stays set. Nothing when no submission is waiting on one.
 */
function revealWait(submissions: Submission[], now: Date): number | null {
  let soonest: number | null = null;
  for (const found of submissions) {
    const at = found.grading?.reveal_at;
    if (at === null || at === undefined) continue;
    const wait = Date.parse(at) - now.getTime();
    if (Number.isNaN(wait)) continue;
    const next = wait > 0 ? wait : 5_000;
    soonest = soonest === null ? next : Math.min(soonest, next);
  }
  return soonest;
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

/** Newest first, whatever order they arrived in. */
export function newestFirst(submissions: Submission[]): Submission[] {
  return [...submissions].sort((a, b) => b.number - a.number);
}

/**
 * What a submission came to, in one line for its row of the list: that it
 * did not compile; else each value it is shown, by name, as the submission
 * shows it; else how many of the tests it is shown it passed. Empty while
 * nothing of it is shown, which its status already says.
 */
export function resultLine(grading: GradingResult | null): string {
  if (grading === null) return '';
  if (grading.compiled === 0) return 'Did not compile';
  if (grading.run_values.length > 0) {
    return grading.run_values
      .map((value) => {
        const shown = value.waiting
          ? BEING_CHECKED
          : value.number !== null
            ? formatExact(value.number)
            : (value.text ?? MISSING);
        return `${value.name}: ${shown}`;
      })
      .join(' · ');
  }
  const tests = grading.runs.length;
  if (tests === 0) return '';
  const passed = grading.runs.reduce((sum, run) => sum + run.passed, 0);
  return `Passed ${String(passed)} of ${String(tests)} ${tests === 1 ? 'test' : 'tests'}`;
}
