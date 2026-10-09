import type { Board, BoardCell, BoardKey } from '@/api/types';
import { formatExact, placesToTell } from '@/lib/exact';

/**
 * What a board's numbers read as. Every key a board ranks on is a column, so
 * a contestant can see why one row is above the next; each is named by what
 * it ranks by. A `penalty` with `per_attempt: 0` charges nothing for an
 * attempt, so all it ranks on is the minute submitted, and it says so.
 */
export function keyLabel(key: BoardKey): string {
  if (key.by === 'points') return 'Points';
  if (key.by === 'penalty') {
    return (key.per_attempt ?? 0) === 0 ? 'Submitted at minute' : 'Penalty';
  }
  return key.by;
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

/** One of a cell's numbers, with what it is: "100 points", "minute 45", "12.5 time_ms". */
function numberText(key: BoardKey, exact: string, places: number): string {
  const shown = formatExact(exact, places);
  if (key.by === 'points') return `${shown} ${exact === '1' ? 'point' : 'points'}`;
  if (key.by === 'penalty') {
    return (key.per_attempt ?? 0) === 0 ? `minute ${shown}` : `${shown} penalty`;
  }
  return `${shown} ${key.by}`;
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

/** How many of the row's own submissions to the task are still grading, in words. */
export function gradingText(count: number): string | null {
  return count > 0 ? `${count} still grading` : null;
}
