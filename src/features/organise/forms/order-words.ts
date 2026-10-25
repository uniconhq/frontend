import type { OrderKeyValues } from './board-values';

/**
 * Whether row `at` may move by one place: not past either end, and never so
 * that penalty minutes become the first way to rank.
 */
export function canMoveKey(rows: OrderKeyValues[], at: number, by: -1 | 1): boolean {
  const to = at + by;
  if (to < 0 || to >= rows.length) return false;
  const first = to === 0 ? rows[at] : at === 0 ? rows[to] : rows[0];
  return first?.kind !== 'penalty' || rows[0]?.kind === 'penalty';
}
