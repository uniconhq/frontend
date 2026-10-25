/** How a value or a cell is read, the one way every page says it (6.1). */

export const MISSING = '–';
export const BEING_CHECKED = 'being checked';
export const NOT_GIVEN = 'Not given';
export const RESULTS_AFTER = 'Submitted, results after the contest';
/** A leaderboard whose order leaves out a column the reader is not shown. */
export const PARTIAL_ORDER = 'The order is partial.';

/** How many of a row's submissions are still grading: "1 grading". */
export function gradingCount(count: number): string {
  return `${String(count)} grading`;
}

/** How many of a row's submissions are held: "3 held". */
export function heldCount(count: number): string {
  return `${String(count)} held`;
}
