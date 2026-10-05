import type { GradingResult, GradingStatus, Submission } from '@/api/types';
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

const UNFINISHED = new Set<GradingStatus>(['queued', 'dispatched', 'running']);

function unfinished(submission: Submission): boolean {
  return submission.gradings.some((grading) => UNFINISHED.has(grading.status));
}

/**
 * The wait before the next read: by the newest submission still being graded,
 * so a fresh submit is followed closely whatever an older one is doing.
 */
export function pollEvery(
  submissions: Submission[] | Submission | undefined,
  now: Date = serverNow(),
): number {
  if (submissions === undefined) return MEANWHILE_MS;
  const all = Array.isArray(submissions) ? submissions : [submissions];
  const waited = all
    .filter(unfinished)
    .map((found) => now.getTime() - Date.parse(found.submitted_at));
  if (waited.length === 0) return MEANWHILE_MS;
  const newest = Math.min(...waited);
  return WAITING.find(([olderThan]) => newest >= olderThan)?.[1] ?? MEANWHILE_MS;
}

/**
 * What a grading shows as its verdict: its outcome once it has one the task
 * lets the contestant see, and where it stands until then, or for good when
 * the outcome is withheld or the grading never finished.
 */
export function verdictOf(grading: GradingResult): string {
  return grading.status === 'done' && grading.outcome !== null
    ? grading.outcome
    : grading.status;
}

const numbers = new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 });

/** A metric's value as read: a number to at most four decimals. */
export function metricValue(value: number): string {
  return numbers.format(value);
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
