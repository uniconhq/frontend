import { formatDateTime } from '@/lib/time';
import type { BoardValues, OrderKeyValues } from './board-values';

/**
 * A board's settings in plain words, for its form and for the sentence that
 * says what it ranks, the same words the merge of two saves uses.
 */

export const OVER = [
  {
    value: 'all',
    label: 'Every result',
    description:
      'Every test group’s points, each group’s joining once entrants can see its results.',
  },
  {
    value: 'live',
    label: 'Results shown during the contest',
    description:
      'Only the test groups whose results entrants see while the contest runs. A group hidden until its task closes is left out.',
  },
  {
    value: 'after_close',
    label: 'Results shown once each task closes',
    description:
      'Only the test groups hidden until their task closes, such as a final set of hidden tests.',
  },
];

export const SELECT = [
  {
    value: 'best',
    label: 'Best submission',
    description: 'On each task, the one submission that ranks the entrant highest.',
  },
  {
    value: 'best_per_group',
    label: 'Best submission on each test group',
    description:
      'On each task, the most points any submission earned on each test group, added up.',
  },
  {
    value: 'marked',
    label: 'Best of the submissions an entrant marks',
    description:
      'Entrants mark the submissions they want counted, and the best of those counts.',
  },
];

export const WHO = [
  {
    value: 'organisers',
    label: 'Organisers only',
    description: 'Every organiser of the contest, observers included.',
  },
  {
    value: 'contestants',
    label: 'Entrants',
    description: 'The members of every approved entrant, and the organisers.',
  },
  {
    value: 'everyone',
    label: 'Everyone who can see the contest',
    description: 'Anyone the contest is open to, whether they entered or not.',
  },
];

export const KINDS = [
  {
    value: 'points',
    label: 'Points, most first',
    description: 'More points ranks higher.',
  },
  {
    value: 'penalty',
    label: 'Penalty minutes, fewest first',
    description:
      'The minutes from the start to each counted submission, and a set number more for each earlier attempt. Fewer ranks higher.',
  },
  {
    value: 'value',
    label: 'A value the tasks report',
    description:
      'A number the tasks’ workflow reports, such as running time. The workflow says whether higher or lower is better.',
  },
];

/** Why the save would refuse penalty minutes as the first key (C3), or null. */
export function penaltyRefusal(first: boolean): string | null {
  return first
    ? 'Penalty minutes only break ties, so they are never the first way to rank.'
    : null;
}

/**
 * Why the save would refuse the best submission on each test group for a
 * board ranked by `order` (C3), or null: it needs points first and no value.
 */
export function perGroupRefusal(order: OrderKeyValues[]): string | null {
  const pointsFirst = order.length === 0 || order[0]?.kind === 'points';
  return pointsFirst && !order.some((key) => key.kind === 'value')
    ? null
    : 'The best submission on each test group needs points ranked first and no value to rank by.';
}

/** One key of a board's order in words, first or after another: "highest total first". */
function keyWords(key: OrderKeyValues, first: boolean): string {
  if (key.kind === 'points')
    return first ? 'highest total first' : 'then highest total';
  if (key.kind === 'value') {
    const name = key.name.trim() === '' ? 'value' : key.name.trim();
    return first ? `best ${name} first` : `then best ${name}`;
  }
  const minutes = key.perAttempt.trim();
  const attempts =
    minutes === '' || minutes === '0'
      ? 'counting nothing for earlier attempts'
      : `counting ${minutes} for each earlier attempt`;
  return `${first ? 'fewest penalty minutes first' : 'then fewest penalty minutes'}, ${attempts}`;
}

function list(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1) ?? ''}`;
}

/**
 * A test group whose results entrants see only once its task closes, so a
 * board counts its points from then: its task's id and letter, its name,
 * and whether the task closes with the contest, or when it closes.
 */
export type HeldGroup = {
  task: string;
  label: string;
  group: string;
  /** When the task closes, or null when it closes with the contest. */
  closes: string | null;
};

/** When a held group's results come out: "when the contest ends". */
function whenShown(group: HeldGroup, named: boolean): string {
  if (group.closes === null) return 'when the contest ends';
  return `when ${named ? `task ${group.label}` : 'the task'} closes, ${formatDateTime(new Date(group.closes))}`;
}

/** Groups by name, with their task's letter when the sentence covers several tasks. */
function groupsWords(groups: HeldGroup[], named: boolean): string {
  const names = groups.map(
    (group) => `“${group.group}”${named ? ` of task ${group.label}` : ''}`,
  );
  return `${groups.length === 1 ? 'test group' : 'test groups'} ${list(names)}`;
}

/** The held groups, by when they come out, in the order first given. */
function byWhen(groups: HeldGroup[], named: boolean): [string, HeldGroup[]][] {
  const found = new Map<string, HeldGroup[]>();
  for (const group of groups) {
    const when = whenShown(group, named);
    found.set(when, [...(found.get(when) ?? []), group]);
  }
  return [...found];
}

/**
 * When the board counts what, said only where it changes something, naming
 * the groups: every result, so a held group joins once it is shown; the
 * results shown during the contest, so a held group is left out; or only
 * the held groups, from when they are shown. `held` is null when the
 * groups are not known, and the board's choice is then said in general.
 */
function scopeWords(
  over: string,
  held: HeldGroup[] | null,
  named: boolean,
): string | null {
  if (held === null) {
    if (over === 'live')
      return 'It leaves out every test group whose results entrants see only once its task closes.';
    if (over === 'after_close')
      return 'It counts only the test groups whose results entrants see once their task closes, from then.';
    return null;
  }
  if (over === 'live') {
    return held.length === 0
      ? null
      : `It leaves out ${groupsWords(held, named)}, whose results entrants see only once the task closes.`;
  }
  if (over === 'after_close') {
    return held.length === 0
      ? 'It counts nothing: it counts only test groups whose results entrants see once their task closes, and no task it covers has one.'
      : `It counts only ${list(byWhen(held, named).map(([when, groups]) => `${groupsWords(groups, named)}, ${when}`))}.`;
  }
  if (held.length === 0) return null;
  return byWhen(held, named)
    .map(
      ([when, groups]) => `Results from ${groupsWords(groups, named)} join it ${when}.`,
    )
    .join(' ');
}

/** Who sees the board, and how much of it. */
function whoWords(board: BoardValues): string {
  const rows = board.rows.trim();
  if (board.who === '' || board.who === 'organisers') return 'Only organisers see it.';
  const everyone = board.who === 'everyone';
  if (rows === '' || rows === 'all') {
    return everyone
      ? 'Everyone who can see the contest sees the whole leaderboard.'
      : 'Entrants and organisers see the whole leaderboard.';
  }
  if (rows === 'own')
    return 'Organisers see the whole leaderboard, and each entrant only their own row.';
  return `Organisers see the whole leaderboard; ${everyone ? 'everyone else who can see the contest sees' : 'entrants see'} the top ${rows} rows and any row tied with the last of them, and an entrant their own row as well.`;
}

/**
 * What a board ranks, by what, and who sees how much of it, as a few plain
 * sentences an organiser can check the board against, the same on the
 * Leaderboards page and in how the contest is scored: "highest total first,
 * using each entrant’s best submission. Entrants and organisers see the
 * whole leaderboard." `tasks` says which tasks it covers, for a page that shows
 * the board on its own; `held` is the test groups of those tasks whose
 * results come out once their task closes, said only where they change
 * what the board counts, or null when they are not known.
 */
export function boardSentence(
  board: BoardValues,
  { tasks = true, held = null }: { tasks?: boolean; held?: HeldGroup[] | null } = {},
): string {
  const order = board.order.length === 0 ? [{ kind: 'points' as const }] : board.order;
  const rank = order.map((key, at) => keyWords(key, at === 0)).join(', ');
  const using =
    board.select === 'best_per_group'
      ? 'using each entrant’s best result on each test group'
      : board.select === 'marked'
        ? 'using the best of the submissions each entrant marks'
        : 'using each entrant’s best submission';
  const covers =
    board.tasks === null
      ? 'every task'
      : board.tasks.length === 0
        ? 'no task'
        : `${board.tasks.length === 1 ? 'task' : 'tasks'} ${list(board.tasks)}`;
  const covered =
    held === null || board.tasks === null
      ? held
      : held.filter((group) => board.tasks?.includes(group.task) === true);
  const named = tasks && board.tasks?.length !== 1;
  const first = `${rank}, ${using}${tasks ? `, on ${covers}` : ''}.`;
  return [
    tasks ? first.replace(/^./, (letter) => letter.toUpperCase()) : first,
    whoWords(board),
    scopeWords(board.over, covered, named),
  ]
    .filter((part) => part !== null)
    .join(' ');
}
