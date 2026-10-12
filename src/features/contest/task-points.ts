import type { TaskEntry } from '@/api/types';
import { compareDecimal, cut, formatExact } from '@/lib/exact';
import { formatWhen } from '@/lib/time';

/** How many decimals points are shown to. */
const PLACES = 2;

/**
 * Points shown out of a worth: cut, never rounded up, so points short of the
 * worth never read as the worth; points that are the worth read as it.
 */
function shownOf(shown: string, worth: string): string {
  return compareDecimal(shown, worth) === 0
    ? formatExact(worth, PLACES)
    : formatExact(cut(shown, PLACES), PLACES);
}

/**
 * An entrant's points on a task out of its worth, as the contest page lists
 * it (#440): "62 / 100", the points as a leaderboard over that one task
 * counts them, so nothing a leaderboard holds back. While some of the task's
 * points wait for a reveal, `pending` says when they are shown, as a
 * submission's row says it (M18): "More shown at 14:00", or, with nothing
 * shown yet (`shown` null; a shown 0 reads as 0), `—` over the worth and
 * "Shown at 14:00". For anyone the contest
 * gives no points, such as someone not yet approved or a visitor, the worth
 * alone, "100 points". Null on a task that gives no points. Exact numbers,
 * the points cut and the worth rounded only for reading.
 */
export function taskPointsText(
  task: Pick<TaskEntry, 'points' | 'worth'>,
  now: Date,
): { score: string; pending: string | null } | null {
  const { points, worth } = task;
  if (worth === null) return null;
  if (points === null) {
    const one = compareDecimal(worth, '1') === 0;
    return {
      score: `${formatExact(worth, PLACES)} ${one ? 'point' : 'points'}`,
      pending: null,
    };
  }
  const out = formatExact(worth, PLACES);
  const { shown, pending_until: until } = points;
  const score = `${shown === null ? '—' : shownOf(shown, worth)} / ${out}`;
  if (until === null) return { score, pending: null };
  const at = formatWhen(new Date(until), now);
  return { score, pending: `${shown === null ? 'Shown' : 'More shown'} at ${at}` };
}
