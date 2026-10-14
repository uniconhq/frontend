import type { ValueMeaning } from '@/api/types';
import { formatDateTime } from '@/lib/time';
import { meaningOf, titleInSentence, valueFirst } from '@/lib/values';
import type { BoardValues, OrderKeyValues } from './board-values';
import { listed } from '@/lib/listed';

/**
 * A board's settings in plain words, for its form and for the sentence that
 * says what it ranks, the same words the merge of two saves uses.
 */

export const OVER = [
  {
    value: 'all',
    label: 'Every result',
    description:
      'Every test group’s points. A group’s points join once entrants can see its results.',
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
      'A number the tasks’ workflow reports for each test, such as run time. The workflow says whether higher or lower is better; the leaderboard says how each task’s tests combine.',
  },
];

/** How a value combines across each task's tests, as a value key chooses it. */
export const FOLDS = [
  { value: 'max', label: 'Highest test', said: 'highest test' },
  { value: 'sum', label: 'Total over the tests', said: 'total over the tests' },
  { value: 'mean', label: 'Average over the tests', said: 'average over the tests' },
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

/**
 * One key of a board's order in words, saying a total of what: "their total
 * points over every task, most first". `over` is the tasks the total runs
 * over, said with the first key only. A value is named by its title where
 * `values` give one, "their total run time", by its key until then (M58),
 * and ranks lowest or highest first as its workflow says is better. Points
 * and penalty minutes read as the ways to rank say them in the board's form
 * (`orderSummary`).
 */
function keyWords(
  key: OrderKeyValues,
  over: string | null,
  values: ValueMeaning[] | null,
): string {
  const across = over === null ? '' : ` over ${over}`;
  if (key.kind === 'points') return `their total points${across}, most first`;
  if (key.kind === 'value') {
    const name = key.name.trim();
    if (name === '') return `their total value${across}, best first`;
    const meaning = meaningOf(values ?? [], name);
    const fold = FOLDS.find((each) => each.value === key.fold);
    const each = fold === undefined ? '' : `, each task’s ${fold.said}`;
    return `their total ${titleInSentence(name, meaning)}${across}${each}, ${valueFirst(meaning)}`;
  }
  const minutes = key.perAttempt.trim();
  return minutes === '' || minutes === '0'
    ? `penalty minutes${across}, fewest first`
    : `penalty minutes${across}, fewest first, with ${minutes} more for each earlier attempt`;
}

/**
 * How a board ranks, its first key and then what breaks ties: "ranks entrants
 * by their total points over every task, most first; ties broken by penalty
 * minutes, fewest first, with 20 more for each earlier attempt".
 */
function rankWords(
  order: OrderKeyValues[],
  covers: string,
  values: ValueMeaning[] | null,
): string {
  const [first, ...ties] = order;
  const ranks = `ranks entrants by ${keyWords(first ?? { kind: 'points' }, covers, values)}`;
  if (ties.length === 0) return ranks;
  return `${ranks}; ties broken by ${ties.map((key) => keyWords(key, null, values)).join(', then by ')}`;
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
  return `${groups.length === 1 ? 'test group' : 'test groups'} ${listed(names)}`;
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
 * `oneTask` is set where `held` is one task's alone, under that task, so
 * the sentence speaks of what the board takes from it, never of the board.
 */
function scopeWords(
  over: string,
  held: HeldGroup[] | null,
  named: boolean,
  oneTask: boolean,
): string | null {
  if (held === null) {
    if (over === 'live')
      return 'It leaves out every test group whose results entrants see only once its task closes.';
    if (over === 'after_close')
      return 'It counts only the test groups whose results entrants see once their task closes, from when they are shown.';
    return null;
  }
  if (over === 'live') {
    return held.length === 0
      ? null
      : `It leaves out ${groupsWords(held, named)}, whose results entrants see only once the task closes.`;
  }
  if (over === 'after_close') {
    if (held.length === 0) {
      return oneTask
        ? 'It takes nothing from this task: it counts only test groups whose results entrants see once their task closes, and this task has none.'
        : 'It counts nothing: it counts only test groups whose results entrants see once their task closes, and no task it covers has one.';
    }
    return `It counts only ${listed(byWhen(held, named).map(([when, groups]) => `${groupsWords(groups, named)}, ${when}`))}.`;
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
      ? 'Everyone who can see the contest sees all of it.'
      : 'Entrants and organisers see all of it.';
  }
  if (rows === 'own')
    return 'Organisers see all of it, and each entrant only their own row.';
  return `Organisers see all of it; ${everyone ? 'everyone else who can see the contest sees' : 'entrants see'} the top ${rows} rows and any row tied with the last of them, and an entrant their own row as well.`;
}

/** Which submission counts, to this task or to each: "Each entrant’s best submission to this task counts." */
function selectWords(select: string, task: string): string {
  if (select === 'best_per_group')
    return `Each entrant’s best result on each test group of ${task} counts.`;
  if (select === 'marked')
    return `The best of the submissions each entrant marks on ${task} counts.`;
  return `Each entrant’s best submission to ${task} counts.`;
}

/**
 * What a board ranks, a total of what over which tasks, which submission
 * counts, and who sees how much of it, as a few plain sentences an organiser
 * can check the board against, the same on the Leaderboards page and in how
 * the contest is scored (M65): "ranks entrants by their total points over
 * every task, most first. Each entrant’s best submission to this task
 * counts. Entrants and organisers see all of it." `tasks` is set for a page
 * that shows the board on its own, which starts it as a sentence; left out,
 * the sentence is said under one task, after the board's name and a colon,
 * and `held` is that task's alone; `held` is the test groups of those tasks
 * whose results come out once their task closes, said only where they change
 * what the board counts, or null when they are not known; `values` are the
 * values the tasks report, which name a value the board ranks by (M58).
 */
export function boardSentence(
  board: BoardValues,
  {
    tasks = true,
    held = null,
    values = null,
  }: {
    tasks?: boolean;
    held?: HeldGroup[] | null;
    values?: ValueMeaning[] | null;
  } = {},
): string {
  const covers =
    board.tasks === null
      ? 'every task'
      : board.tasks.length === 0
        ? 'no task'
        : `${board.tasks.length === 1 ? 'task' : 'tasks'} ${listed(board.tasks)}`;
  const covered =
    held === null || board.tasks === null
      ? held
      : held.filter((group) => board.tasks?.includes(group.task) === true);
  const named = tasks && board.tasks?.length !== 1;
  const first = `${rankWords(board.order, covers, values)}.`;
  return [
    tasks ? first.replace(/^./, (letter) => letter.toUpperCase()) : first,
    selectWords(
      board.select,
      !tasks ? 'this task' : board.tasks?.length === 1 ? 'the task' : 'each task',
    ),
    whoWords(board),
    scopeWords(board.over, covered, named, !tasks),
  ]
    .filter((part) => part !== null)
    .join(' ');
}
