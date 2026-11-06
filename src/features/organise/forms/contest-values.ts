import { isoOf, localOf, unreadableTime } from './times';
import {
  entriesAt,
  isRecord,
  numberOf,
  textAt,
  textOf,
  valueAt,
  writeAt,
  type Path,
  type Values,
} from './values';
import { readWays, writeWays, type WayValues } from './ways';

/**
 * The contest's settings as the form's fields: text for every field, so an
 * empty one is "not set", and a time in the organiser's local time. The form
 * writes only the fields that changed from what it read.
 */
export type ContestValues = {
  name: string;
  description: string;
  start: string;
  end: string;
  state: string;
  visibility: string;
  opens: string;
  closes: string;
  capacity: string;
  /** The ways in; null for none written, the default of one manual sign-up. */
  ways: WayValues[] | null;
  /** The most and the fewest people in one entrant, and when its roster locks. */
  most: string;
  fewest: string;
  locks: string;
  /** The task entries in the order the form shows them. */
  tasks: TaskEntryValues[];
  /** The leaderboards' keys; none while `leaderboards` is not a list of them. */
  boards: string[];
  /** The tasks whose marked submissions a leaderboard reads. */
  marked: string[];
};

export type TaskEntryValues = {
  id: string;
  /** Where the entry sits in the file as read. */
  at: number;
  releaseAt: string;
  due: string;
  closes: string;
  marks: string;
};

/** A task entry's times, each by its key in the file. */
const ENTRY_TIMES = ['release_at', 'due', 'closes'] as const;

/**
 * What the form can read of the settings. A part whose key holds something
 * other than its shape is named in `unreadable` and left out of the form, so
 * a save never touches it; the stored settings still edit it as text.
 */
export type ContestRead = {
  values: ContestValues;
  unreadable: string[];
  /** Times the time fields cannot show, by their path. */
  rawTimes: Record<string, string>;
};

function rawTimesOf(values: Values, paths: Path[]): Record<string, string> {
  const raw: Record<string, string> = {};
  for (const path of paths) {
    const value = valueAt(values, path);
    if (unreadableTime(value)) raw[path.join('.')] = textOf(value);
  }
  return raw;
}

/**
 * The tasks a leaderboard reads the marked submissions of, each named as
 * `{value: [task, marked]}` somewhere among its columns.
 */
function markedTasks(node: unknown): string[] {
  const found = new Set<string>();
  const visit = (item: unknown) => {
    if (Array.isArray(item)) {
      item.forEach(visit);
      return;
    }
    if (!isRecord(item)) return;
    const value = item['value'];
    if (Array.isArray(value) && value.length === 2 && value[1] === 'marked') {
      if (typeof value[0] === 'string') found.add(value[0]);
    }
    Object.values(item).forEach(visit);
  };
  visit(node);
  return [...found];
}

export function readContest(values: Values): ContestRead {
  const unreadable: string[] = [];
  const registration = valueAt(values, ['registration']);
  if (registration !== undefined && !isRecord(registration))
    unreadable.push('registration');
  const entrants = valueAt(values, ['entrants']);
  if (entrants !== undefined && !isRecord(entrants)) unreadable.push('entrants');
  const ways = isRecord(registration) ? readWays(values) : null;
  if (ways === 'unreadable') unreadable.push('ways');
  const list = valueAt(values, ['tasks']);
  const listOk =
    list === undefined ||
    (Array.isArray(list) &&
      list.every((entry) => isRecord(entry) && typeof entry['id'] === 'string'));
  if (!listOk) unreadable.push('tasks');
  const entries =
    listOk && Array.isArray(list) ? (list as Record<string, unknown>[]) : [];
  const boards = entriesAt(values, ['leaderboards']) ?? [];

  const at = (...path: Path) => textAt(values, path);
  const time = (...path: Path) => localOf(valueAt(values, path));

  const timePaths: Path[] = [['start'], ['end']];
  if (isRecord(registration))
    timePaths.push(['registration', 'opens'], ['registration', 'closes']);
  entries.forEach((_, index) => {
    for (const key of ENTRY_TIMES) timePaths.push(['tasks', index, key]);
  });

  return {
    unreadable,
    rawTimes: rawTimesOf(values, timePaths),
    values: {
      name: at('name'),
      description: at('description'),
      start: time('start'),
      end: time('end'),
      state: at('state'),
      visibility: at('visibility'),
      opens: isRecord(registration) ? time('registration', 'opens') : '',
      closes: isRecord(registration) ? time('registration', 'closes') : '',
      capacity: isRecord(registration) ? at('registration', 'capacity') : '',
      ways: ways === 'unreadable' ? null : ways,
      most: isRecord(entrants) ? at('entrants', 'most') : '',
      fewest: isRecord(entrants) ? at('entrants', 'fewest') : '',
      locks: isRecord(entrants) ? at('entrants', 'locks') : '',
      tasks: entries.map((entry, index) => ({
        id: String(entry['id']),
        at: index,
        releaseAt: time('tasks', index, 'release_at'),
        due: time('tasks', index, 'due'),
        closes: time('tasks', index, 'closes'),
        marks: at('tasks', index, 'marks'),
      })),
      boards: boards.map((board) => textOf(board['key'])),
      marked: markedTasks(boards),
    },
  };
}

/** A text field's value as the settings hold it; an empty one is no key. */
const text = (value: string) => (value === '' ? undefined : value);

/**
 * Write what changed between `before` and `after` into the values. Admin
 * keys are skipped for a manager, though the form already holds them still.
 */
export function writeContest(
  values: Values,
  before: ContestValues,
  after: ContestValues,
  { admin }: { admin: boolean },
): void {
  const put = (
    path: Path,
    from: string,
    to: string,
    as: (value: string) => unknown,
    prune = false,
  ) => {
    if (from !== to) writeAt(values, path, as(to), { prune });
  };

  if (admin) {
    put(['name'], before.name, after.name, (value) => value);
    put(['description'], before.description, after.description, text);
    put(['state'], before.state, after.state, text);
    put(['visibility'], before.visibility, after.visibility, text);
    const reg = (key: string) => ['registration', key];
    put(reg('opens'), before.opens, after.opens, isoOf, true);
    put(reg('closes'), before.closes, after.closes, isoOf, true);
    put(reg('capacity'), before.capacity, after.capacity, numberOf, true);
    writeWays(values, before.ways, after.ways);
  }
  put(['start'], before.start, after.start, isoOf);
  put(['end'], before.end, after.end, isoOf);
  const team = (key: string) => ['entrants', key];
  put(team('most'), before.most, after.most, numberOf, true);
  put(team('fewest'), before.fewest, after.fewest, numberOf, true);
  put(team('locks'), before.locks, after.locks, text, true);

  // The list in its new order first, then each entry's fields at its new place.
  const order = after.tasks.map((entry) => entry.at);
  const list = values['tasks'];
  if (Array.isArray(list) && order.some((from, index) => from !== index)) {
    values['tasks'] = order.map((from) => list[from] as unknown);
  }
  after.tasks.forEach((entry, index) => {
    const was = before.tasks.find((old) => old.at === entry.at);
    if (was === undefined) return;
    const field = (key: string) => ['tasks', index, key];
    put(field('release_at'), was.releaseAt, entry.releaseAt, isoOf);
    put(field('due'), was.due, entry.due, isoOf);
    put(field('closes'), was.closes, entry.closes, isoOf);
    put(field('marks'), was.marks, entry.marks, numberOf);
  });
}

/** A task's label: its place in the list as a letter, A to Z, then AA. */
export function letterOf(index: number): string {
  let label = '';
  let rest = index + 1;
  while (rest > 0) {
    const digit = (rest - 1) % 26;
    label = String.fromCharCode(65 + digit) + label;
    rest = Math.floor((rest - 1) / 26);
  }
  return label;
}
