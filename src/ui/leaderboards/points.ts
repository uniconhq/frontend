import type { components } from '@/api/schema';

type Leaderboard = components['schemas']['Leaderboard'];
type Cell = components['schemas']['LeaderboardCell'];

/** A task's points on one leaderboard of the viewer's standing. */
export type TaskPoints = {
  board: string;
  /** The cell's number, its exact digits. */
  number: string;
  /** Decimals its column shows. */
  decimals: number | undefined;
  /** The most the column can show, which only staff are told. */
  most: string | null;
};

/**
 * A task's points on the viewer's standing: one per leaderboard, from the
 * cell that counted this task alone. A total over several tasks counts each
 * of them, so it is no one task's points.
 */
export function taskPoints(
  task: string,
  standing: readonly Leaderboard[],
): TaskPoints[] {
  const found: TaskPoints[] = [];
  for (const board of standing) {
    for (const row of board.rows) {
      const cell = row.cells.find((item) => !item.hidden && alone(item, task));
      if (cell === undefined || cell.number === null) continue;
      const header = board.headers.find((item) => item.name === cell.column);
      found.push({
        board: board.key,
        number: cell.number,
        decimals: header?.decimals ?? undefined,
        most: header?.at_most ?? null,
      });
      break;
    }
  }
  return found;
}

function alone(cell: Cell, task: string): boolean {
  const counted = cell.counted ?? [];
  return (
    cell.number !== null &&
    counted.length > 0 &&
    counted.every((item) => item.task === task)
  );
}
