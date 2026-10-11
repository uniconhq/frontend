import type { BoardValues, OrderKeyValues } from './board-values';

/**
 * A board's settings in plain words, for its form and for the sentence that
 * says what it ranks, the same words the merge of two saves uses.
 */

export const OVER = [
  { value: 'all', label: 'Every result' },
  { value: 'live', label: 'Results shown during the contest' },
  { value: 'after_close', label: 'Results shown after the contest ends' },
];

export const SELECT = [
  { value: 'best', label: 'Best submission' },
  { value: 'best_per_group', label: 'Best submission on each group' },
  { value: 'marked', label: 'Best of the submissions an entrant marks' },
];

export const WHO = [
  { value: 'organisers', label: 'Organisers only' },
  { value: 'contestants', label: 'Entrants' },
  { value: 'everyone', label: 'Everyone who can see the contest' },
];

export const KINDS = [
  { value: 'points', label: 'Points, most first' },
  { value: 'penalty', label: 'Penalty minutes, fewest first' },
  { value: 'value', label: 'A value the tasks report' },
];

function keyWords(key: OrderKeyValues): string {
  if (key.kind === 'points') return 'points';
  if (key.kind === 'value') return key.name.trim() === '' ? 'a value' : key.name.trim();
  const minutes = key.perAttempt.trim();
  return minutes === '' || minutes === '0'
    ? 'the minute its counted submission was made'
    : `penalty minutes, ${minutes} for each earlier attempt`;
}

function list(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1) ?? ''}`;
}

/**
 * What a board ranks, on what, and who sees how much of it, as one paragraph
 * an organiser can check the board against.
 */
export function boardSentence(board: BoardValues): string {
  const order = board.order.length === 0 ? ['points'] : board.order.map(keyWords);
  const select =
    board.select === 'best_per_group'
      ? 'the best submission on each group'
      : board.select === 'marked'
        ? 'the best of the submissions each entrant marks'
        : 'each entrant’s best submission';
  const tasks =
    board.tasks === null
      ? 'every task'
      : board.tasks.length === 0
        ? 'no task'
        : `${board.tasks.length === 1 ? 'task' : 'tasks'} ${list(board.tasks)}`;
  const over =
    board.over === 'live'
      ? 'counting only the results shown during the contest'
      : board.over === 'after_close'
        ? 'counting only the results shown after the contest ends'
        : 'counting every result once it is shown';
  const who =
    board.who === 'everyone'
      ? 'Everyone who can see the contest sees it'
      : board.who === 'contestants'
        ? 'Entrants and organisers see it'
        : 'Only organisers see it';
  const rows = board.rows.trim();
  const shown =
    board.who === '' || board.who === 'organisers'
      ? ''
      : rows === 'own'
        ? ', each entrant only their own row'
        : rows === '' || rows === 'all'
          ? ', every row'
          : `, the top ${rows} rows`;
  return `Ranks entrants by ${list(order)}, from ${select} on ${tasks}, ${over}. ${who}${shown}.`;
}
