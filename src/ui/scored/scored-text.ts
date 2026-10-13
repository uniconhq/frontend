import type { GroupShown, Reported } from '@/api/types';
import { formatExact, formatPoints, formatWorth } from '@/lib/exact';

/**
 * A test's reported value by name as read: a number to at most four
 * decimals, its text, or nothing when it reported none of that name.
 */
export function valueText(values: Reported, name: string): string | undefined {
  const number = values.numbers[name];
  return number === undefined ? values.texts[name] : formatExact(number);
}

/**
 * A group's points out of the most it gives, as `30 / 70`; only the most
 * while its verdict is not shown; nothing on a task that gives no points.
 */
export function pointsText(group: GroupShown): string | null {
  if (group.max === null) return null;
  const most = formatWorth(group.max);
  return group.points === null
    ? `of ${most}`
    : `${formatPoints(group.points, group.max)} / ${most}`;
}

/** A number of submissions in words: "1 submission", "10 submissions". */
export function submissionsWords(count: number): string {
  return `${String(count)} ${count === 1 ? 'submission' : 'submissions'}`;
}

/**
 * Why a submission past the task's limit was not graded (#445), said to the
 * entrant ("you") or of them ("the entrant"): it was graded again after a
 * delay, when they already had as many submissions with a result as the
 * task takes.
 */
export function overLimitSentence(who: string, limit: number | null): string {
  const most = limit === null ? 'submissions' : submissionsWords(limit);
  return `Not graded: ${who} had reached the limit of ${most} for this task.`;
}
