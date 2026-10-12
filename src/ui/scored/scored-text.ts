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
