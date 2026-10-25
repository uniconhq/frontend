import type { components } from '@/api/schema';

type Leaderboard = components['schemas']['Leaderboard'];
type Cell = components['schemas']['LeaderboardCell'];

/**
 * A task's points on the viewer's standing: one line per leaderboard, the
 * cell that counted the task over the most that column can show.
 */
export function taskPoints(
  task: string,
  standing: readonly Leaderboard[],
): { board: string; text: string }[] {
  const found: { board: string; text: string }[] = [];
  for (const board of standing) {
    for (const row of board.rows) {
      const cell = row.cells.find(
        (item) => !item.hidden && item.number !== null && counts(item, task),
      );
      if (cell === undefined || cell.number === null) continue;
      const most = board.headers.find((header) => header.name === cell.column)?.at_most;
      found.push({
        board: board.key,
        text:
          most === null || most === undefined
            ? cell.number
            : `${cell.number} / ${most}`,
      });
      break;
    }
  }
  return found;
}

function counts(cell: Cell, task: string): boolean {
  return (cell.counted ?? []).some((item) => item.task === task);
}
