import type { GradingResult, GradingStatus, Submission } from '@/api/types';

/**
 * How often a contestant's submissions are read again: soon while any grading
 * is still to finish, since one usually takes seconds, and now and then
 * otherwise, so an organiser's rejudge reaches the page. Live updates replace
 * this in a later feature.
 */
const GRADING_MS = 2_000;
const MEANWHILE_MS = 60_000;

const UNFINISHED = new Set<GradingStatus>([
  'queued',
  'dispatching',
  'dispatched',
  'running',
]);

function unfinished(submission: Submission): boolean {
  return submission.gradings.some((grading) => UNFINISHED.has(grading.status));
}

export function pollEvery(submissions: Submission[] | Submission | undefined): number {
  if (submissions === undefined) return MEANWHILE_MS;
  const all = Array.isArray(submissions) ? submissions : [submissions];
  return all.some(unfinished) ? GRADING_MS : MEANWHILE_MS;
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
