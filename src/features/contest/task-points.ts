import type { BoardPoints, TaskEntry } from '@/api/types';
import { compareDecimal, formatPoints, formatWorth } from '@/lib/exact';
import { formatWhen } from '@/lib/time';

/** An entrant's points on a task as a line reads them, and when held-back points are shown. */
export type PointsText = { score: string; pending: string | null };

/** A task's worth alone, "100 points", for a reader the contest counts no points for. */
function worthText(worth: string): PointsText {
  const one = compareDecimal(worth, '1') === 0;
  return {
    score: `${formatWorth(worth)} ${one ? 'point' : 'points'}`,
    pending: null,
  };
}

/**
 * An entrant's points on a task as one leaderboard counts them (#447):
 * "62 / 100", over the most that board can count from the task, so a board
 * over some of the task's groups is not read as out of the task's worth.
 * While some of those points wait for a reveal, `pending` says when they are
 * shown, as a submission's row says it (M18): "More shown at 14:00", or,
 * with nothing shown yet (`shown` null; a shown 0 reads as 0), `—` over the
 * most and "Shown at 14:00". "—" alone where the board does not cover the
 * task, or counts nothing from it. Null on a task that gives no points.
 * Exact numbers, cut only for reading, as every page cuts points (R17).
 */
export function boardPointsText(
  cell: BoardPoints,
  worth: string | null,
  now: Date,
): PointsText | null {
  if (worth === null) return null;
  const most = cell.most ?? worth;
  if (!cell.covers || compareDecimal(most, '0') === 0) {
    return { score: '—', pending: null };
  }
  if (cell.points === null) return null;
  const { shown, pending_until: until } = cell.points;
  const score = `${shown === null ? '—' : formatPoints(shown, most)} / ${formatWorth(most)}`;
  if (until === null) return { score, pending: null };
  const at = formatWhen(new Date(until), now);
  return { score, pending: `${shown === null ? 'Shown' : 'More shown'} at ${at}` };
}

/**
 * An entrant's points on a task as one number, as the contest page lists
 * it while the contest shows the entrant one leaderboard: that board's
 * count, "62 / 100", or, where it does not cover the task, that it is not
 * on the leaderboard. For anyone the contest counts no points for, such as
 * someone not yet approved or a visitor, or an entrant the contest shows no
 * leaderboard, the worth alone, "100 points". Null on a task that gives no
 * points. With several leaderboards, each column reads `boardPointsText`.
 */
export function taskPointsText(
  task: Pick<TaskEntry, 'points' | 'worth'>,
  now: Date,
): PointsText | null {
  const { points, worth } = task;
  if (worth === null) return null;
  const [only] = points;
  if (only === undefined) return worthText(worth);
  if (!only.covers) return { score: 'Not on the leaderboard', pending: null };
  return boardPointsText(only, worth, now);
}
