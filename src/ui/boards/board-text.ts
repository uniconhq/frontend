import type { Board, BoardCell, BoardKey } from '@/api/types';
import { formatExact, placesToTell } from '@/lib/exact';
import { valueTitle, withUnit } from '@/lib/values';

/**
 * What a board's numbers read as. Every key a board ranks on is a column, so
 * a contestant can see why one row is above the next; each is named by what
 * it ranks by: a value by its title, "Run time", or its key until it has
 * one (M58). A `penalty` with `per_attempt: 0` charges nothing for an
 * attempt, so all it ranks on is the minute submitted, and it says so.
 */
export function keyLabel(key: BoardKey): string {
  if (key.by === 'points') return 'Points';
  if (key.by === 'penalty') {
    return (key.per_attempt ?? 0) === 0 ? 'Submitted at minute' : 'Penalty';
  }
  return valueTitle(key.by, key);
}

/** A row's number on a key, as its column shows it: a value's with its unit, "28 ms". */
export function keyNumber(key: BoardKey, exact: string, places: number): string {
  const shown = formatExact(exact, places);
  return key.by === 'points' || key.by === 'penalty' ? shown : withUnit(shown, key);
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * The decimals each key's column is shown to: two, or more where two rows
 * next to each other would otherwise show alike, so rounding never hides why
 * one row is above the next.
 */
export function keyPlaces(board: Board): number[] {
  return board.keys.map((_, index) =>
    placesToTell(board.rows.map((row) => row.keys[index] ?? null)),
  );
}

/** The decimals each key is shown to in one task's column of cells. */
export function cellPlaces(board: Board, task: string): Record<string, number> {
  return Object.fromEntries(
    board.keys.map((key) => [
      key.by,
      placesToTell(board.rows.map((row) => row.cells[task]?.numbers[key.by] ?? null)),
    ]),
  );
}

/**
 * One of a cell's numbers, with what it is: "100 points", "minute 45"; a
 * value's with its unit, "28 ms", or its title where it has no unit,
 * "12.5 Score", or its key where it has neither.
 */
function numberText(key: BoardKey, exact: string, places: number): string {
  const shown = formatExact(exact, places);
  if (key.by === 'points') return `${shown} ${exact === '1' ? 'point' : 'points'}`;
  if (key.by === 'penalty') {
    return (key.per_attempt ?? 0) === 0 ? `minute ${shown}` : `${shown} penalty`;
  }
  return key.unit !== null && key.unit !== ''
    ? withUnit(shown, key)
    : `${shown} ${valueTitle(key.by, key)}`;
}

/**
 * A cell as lines: while it counts, its number on each key it has one for and
 * the attempts before the counted one that penalty charges for; while it does
 * not, how many attempts the row has made at the task, or a dash for none.
 */
export function cellLines(
  keys: BoardKey[],
  cell: BoardCell,
  places: Record<string, number>,
): string[] {
  if (!cell.counting) {
    return cell.attempts > 0 ? [plural(cell.attempts, 'attempt', 'attempts')] : ['—'];
  }
  const numbers = keys.flatMap((key) => {
    const exact = cell.numbers[key.by];
    return exact === undefined ? [] : [numberText(key, exact, places[key.by] ?? 2)];
  });
  const before =
    cell.attempts > 0
      ? [plural(cell.attempts, 'attempt before', 'attempts before')]
      : [];
  return [...numbers, ...before];
}

/**
 * How many of the row's own submissions to the task wait for a result, in
 * words: being graded, or delayed after a grading failed on Unicon's side.
 */
export function gradingText(count: number): string | null {
  return count > 0 ? `${count} waiting for a result` : null;
}
