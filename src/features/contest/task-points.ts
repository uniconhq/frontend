import type { TaskEntry } from '@/api/types';
import { compareDecimal, formatExact } from '@/lib/exact';
import { formatWhen } from '@/lib/time';

/**
 * An entrant's points on a task out of its worth, as the contest page lists
 * it (#440): "62 / 100", the points as a leaderboard over that one task
 * counts them, so nothing a leaderboard holds back. While some of the task's
 * points wait for a reveal, `pending` says when they are shown, as a
 * submission's row says it (M18): "More shown at 14:00", or, with nothing
 * shown yet, `—` over the worth and "Shown at 14:00". Null on a task that
 * gives no points and for anyone the contest gives none, such as someone not
 * yet approved. Exact numbers, rounded only for reading.
 */
export function taskPointsText(
  task: Pick<TaskEntry, 'points' | 'worth'>,
  now: Date,
): { score: string; pending: string | null } | null {
  const { points, worth } = task;
  if (points === null || worth === null) return null;
  const out = formatExact(worth, 2);
  const until = points.pending_until;
  if (until === null) {
    return { score: `${formatExact(points.shown, 2)} / ${out}`, pending: null };
  }
  const at = formatWhen(new Date(until), now);
  return compareDecimal(points.shown, '0') === 0
    ? { score: `— / ${out}`, pending: `Shown at ${at}` }
    : {
        score: `${formatExact(points.shown, 2)} / ${out}`,
        pending: `More shown at ${at}`,
      };
}
