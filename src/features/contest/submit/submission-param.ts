/**
 * The open submission is the `submission` search parameter of the task page,
 * so a link to one works, and a reload or the back button comes back to it.
 */
const SUBMISSION_PARAM = 'submission';

export function submissionHref(number: number): string {
  return `?${SUBMISSION_PARAM}=${number}`;
}

/** The submission the address opens, when it names one that can be. */
export function openSubmission(search: URLSearchParams): number | null {
  const value = search.get(SUBMISSION_PARAM);
  if (value === null || !/^[1-9]\d{0,9}$/.test(value)) return null;
  const number = Number(value);
  return number <= 2 ** 31 - 1 ? number : null;
}
