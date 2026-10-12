import type { OrderKeyValues } from './board-values';
import { KINDS } from './board-words';

/**
 * A leaderboard's ways to rank, as its form shows them: one row each, a
 * dropdown of the ways on each, offering only what that row may still
 * take, and a summary of the whole order in one sentence.
 */

type Kind = OrderKeyValues['kind'];

/** The ways to rank, in the order "Add a way to rank" adds them. */
const ADDED: Kind[] = ['points', 'penalty', 'value'];

/**
 * The ways a board ranks by as its rows show them: a board that names
 * none ranks by points alone, shown as one row of points.
 */
export function shownOrder(order: OrderKeyValues[]): OrderKeyValues[] {
  return order.length === 0 ? [{ kind: 'points' }] : order;
}

/**
 * The order to write once its rows change: a board that named no way to
 * rank and is still ranked by points alone keeps naming none.
 */
export function orderToWrite(
  before: OrderKeyValues[],
  rows: OrderKeyValues[],
): OrderKeyValues[] {
  return before.length === 0 && rows.length === 1 && rows[0]?.kind === 'points'
    ? []
    : rows;
}

/** A way of ranking as the form starts it when it is chosen. */
export function keyOfKind(kind: string): OrderKeyValues {
  if (kind === 'penalty') return { kind: 'penalty', perAttempt: '' };
  if (kind === 'value') return { kind: 'value', name: '' };
  return { kind: 'points' };
}

/**
 * The ways row `at` may take: none that another row already ranks by, but
 * for a value, which may name another value; never penalty minutes first,
 * since they only break ties. What the row holds is always offered, so a
 * saved order the save would now refuse still shows as it is.
 */
export function kindOptions(
  rows: OrderKeyValues[],
  at: number,
): { value: string; label: string }[] {
  const current = rows[at]?.kind;
  const usedElsewhere = (kind: Kind) =>
    rows.some((key, other) => other !== at && key.kind === kind);
  return KINDS.filter(
    ({ value }) =>
      value === current ||
      value === 'value' ||
      (value === 'penalty'
        ? at > 0 && !usedElsewhere('penalty')
        : !usedElsewhere('points')),
  ).map(({ value, label }) => ({ value, label }));
}

/** What a way of ranking means, said under its dropdown. */
export function kindDescription(kind: Kind): string {
  return KINDS.find((found) => found.value === kind)?.description ?? '';
}

/** The way "Add a way to rank" adds next, or null once every way is used. */
export function nextKey(rows: OrderKeyValues[]): OrderKeyValues | null {
  const kind = ADDED.find((found) => !rows.some((key) => key.kind === found));
  return kind === undefined ? null : keyOfKind(kind);
}

/**
 * Why row `at` ranks by nothing more than an earlier row does, or null: a
 * value named twice. Whether higher or lower is better is the workflow's,
 * so the second can never break a tie the first left.
 */
export function repeatedValue(rows: OrderKeyValues[], at: number): string | null {
  const key = rows[at];
  if (key?.kind !== 'value' || key.name.trim() === '') return null;
  const earlier = rows.findIndex(
    (other, k) =>
      k < at && other.kind === 'value' && other.name.trim() === key.name.trim(),
  );
  return earlier < 0
    ? null
    : `Way ${String(earlier + 1)} already ranks by ${key.name.trim()}, so this one changes nothing.`;
}

/** One way of ranking in the summary: "points, most first". */
function keySaid(key: OrderKeyValues): string {
  if (key.kind === 'points') return 'points, most first';
  if (key.kind === 'value') {
    const name = key.name.trim();
    return name === '' ? 'a value the tasks report' : `${name}, best first`;
  }
  const minutes = key.perAttempt.trim();
  return minutes === '' || minutes === '0'
    ? 'penalty minutes, fewest first'
    : `penalty minutes, fewest first, with ${minutes} more for each earlier attempt`;
}

/**
 * The whole order in one sentence, above its rows: "Ranks by points, most
 * first; ties broken by penalty minutes, fewest first."
 */
export function orderSummary(order: OrderKeyValues[]): string {
  const [first, ...rest] = shownOrder(order).map(keySaid);
  const ties =
    rest.length === 0
      ? ''
      : `; ties broken by ${rest.map((said, at) => (at === 0 ? said : `then by ${said}`)).join(', ')}`;
  return `Ranks by ${first ?? keySaid({ kind: 'points' })}${ties}.`;
}
