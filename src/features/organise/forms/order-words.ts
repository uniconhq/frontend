import type { ValueMeaning } from '@/api/types';
import { meaningOf, titleInSentence, valueFirst, valueTitle } from '@/lib/values';
import type { OrderKeyValues } from './board-values';
import { FOLDS, KINDS } from './board-words';

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
  if (kind === 'value') return { kind: 'value', name: '', fold: '' };
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

/**
 * Whether row `at` may move by one place: not past either end, and never
 * so that penalty minutes become the first way to rank, which `kindOptions`
 * never offers either.
 */
export function canMoveKey(rows: OrderKeyValues[], at: number, by: -1 | 1): boolean {
  const to = at + by;
  if (to < 0 || to >= rows.length) return false;
  const first = to === 0 ? rows[at] : at === 0 ? rows[to] : rows[0];
  return first?.kind !== 'penalty' || rows[0]?.kind === 'penalty';
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
export function repeatedValue(
  rows: OrderKeyValues[],
  at: number,
  values: ValueMeaning[] | null = null,
): string | null {
  const key = rows[at];
  if (key?.kind !== 'value' || key.name.trim() === '') return null;
  const earlier = rows.findIndex(
    (other, k) =>
      k < at && other.kind === 'value' && other.name.trim() === key.name.trim(),
  );
  return earlier < 0
    ? null
    : `Way ${String(earlier + 1)} already ranks by ${titleInSentence(key.name.trim(), meaningOf(values ?? [], key.name.trim()))}, so this one changes nothing.`;
}

/**
 * The values a board may rank by: each the tasks it covers report as a
 * number for each test with a way that is better, named once, in the order
 * the tasks first report them. `tasks` null is every task.
 */
export function rankableValues(
  reported: { task: string; meanings: ValueMeaning[] }[],
  tasks: string[] | null,
): ValueMeaning[] {
  const found = new Map<string, ValueMeaning>();
  for (const each of reported) {
    if (tasks !== null && !tasks.includes(each.task)) continue;
    for (const meaning of each.meanings) {
      if (meaning.better !== null && !found.has(meaning.name)) {
        found.set(meaning.name, meaning);
      }
    }
  }
  return [...found.values()];
}

/** A value as its row's dropdown offers it: "Run time (lower is better)". */
export function valueOption(meaning: ValueMeaning): string {
  const title = valueTitle(meaning.name, meaning);
  return meaning.better === null ? title : `${title} (${meaning.better} is better)`;
}

/**
 * One way of ranking in the summary: "points, most first", "run time,
 * highest test, lowest first", a value by its title where `values` give
 * one (M58), and how it combines across tests once chosen.
 */
function keySaid(key: OrderKeyValues, values: ValueMeaning[] | null): string {
  if (key.kind === 'points') return 'points, most first';
  if (key.kind === 'value') {
    const name = key.name.trim();
    if (name === '') return 'a value the tasks report';
    const meaning = meaningOf(values ?? [], name);
    const fold = FOLDS.find((each) => each.value === key.fold);
    const across = fold === undefined ? '' : `, ${fold.said}`;
    return `${titleInSentence(name, meaning)}${across}, ${valueFirst(meaning)}`;
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
export function orderSummary(
  order: OrderKeyValues[],
  values: ValueMeaning[] | null = null,
): string {
  const [first, ...rest] = shownOrder(order).map((key) => keySaid(key, values));
  const ties =
    rest.length === 0
      ? ''
      : `; ties broken by ${rest.map((said, at) => (at === 0 ? said : `then by ${said}`)).join(', ')}`;
  return `Ranks by ${first ?? keySaid({ kind: 'points' }, values)}${ties}.`;
}
