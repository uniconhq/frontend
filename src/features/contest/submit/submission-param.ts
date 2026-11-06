import { taskPagePath } from '@/lib/contest-paths';
import { entrantGradingsPath } from '@/lib/sections';

/**
 * The open submission is the `submission` search parameter of the task page,
 * so a link to one works, and a reload or the back button comes back to it.
 */
const SUBMISSION_PARAM = 'submission';

export function submissionHref(number: number): string {
  return `?${SUBMISSION_PARAM}=${number}`;
}

/**
 * Where a counted submission on a leaderboard opens: for staff, as the board
 * says, the entrant's submissions to the task; for anyone else, their own.
 */
export function countedSubmissionTo(org: string, contest: string, staff: boolean) {
  return (task: string, number: number, entrant: string): string =>
    staff
      ? entrantGradingsPath(org, contest, task, entrant)
      : `${taskPagePath(org, contest, task)}${submissionHref(number)}`;
}

/** The submission the address opens, when it names one that can be. */
export function openSubmission(search: URLSearchParams): number | null {
  const value = search.get(SUBMISSION_PARAM);
  if (value === null || !/^[1-9]\d{0,9}$/.test(value)) return null;
  const number = Number(value);
  return number <= 2 ** 31 - 1 ? number : null;
}
