import { isSeq } from 'yaml';
import { isoOf, localOf, unreadableTime } from './times';
import { readWays, writeWays, type WayValues } from './ways';
import {
  exactAt,
  isRecord,
  numberText,
  textAt,
  textOf,
  Time,
  valueAt,
  writeAt,
  type Doc,
} from './yaml-doc';

/**
 * `contest.yaml` as the form's fields: text for every field, so an empty one
 * is "not set", and a time in the organiser's local time. The form writes only
 * the fields that changed from what it read.
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
  /** The leaderboards' keys; none while `leaderboards` is not a mapping. */
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
 * What the form can read of the file. A part whose key holds something other
 * than its shape is named in `unreadable` and left out of the form, so a save
 * never touches it; the text tab still edits it.
 */
export type ContestRead = {
  values: ContestValues;
  unreadable: string[];
  /** Times in the file the time fields cannot show, by their path. */
  rawTimes: Record<string, string>;
};

function rawTimesOf(doc: Doc, paths: (string | number)[][]): Record<string, string> {
  const raw: Record<string, string> = {};
  for (const path of paths) {
    const value = valueAt(doc, path);
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

export function readContest(doc: Doc): ContestRead {
  const unreadable: string[] = [];
  const registration = valueAt(doc, ['registration']);
  if (registration !== undefined && !isRecord(registration))
    unreadable.push('registration');
  const entrants = valueAt(doc, ['entrants']);
  if (entrants !== undefined && !isRecord(entrants)) unreadable.push('entrants');
  const ways = isRecord(registration) ? readWays(doc) : null;
  if (ways === 'unreadable') unreadable.push('ways');
  const list = valueAt(doc, ['tasks']);
  const listOk =
    list === undefined ||
    (Array.isArray(list) &&
      list.every((entry) => isRecord(entry) && typeof entry['id'] === 'string'));
  if (!listOk) unreadable.push('tasks');
  const entries =
    listOk && Array.isArray(list) ? (list as Record<string, unknown>[]) : [];
  const boards = exactAt(doc, ['leaderboards']);

  const at = (...path: (string | number)[]) => textAt(doc, path);
  const time = (...path: (string | number)[]) => localOf(valueAt(doc, path));

  const timePaths: (string | number)[][] = [['start'], ['end']];
  if (isRecord(registration))
    timePaths.push(['registration', 'opens'], ['registration', 'closes']);
  entries.forEach((_, index) => {
    for (const key of ENTRY_TIMES) timePaths.push(['tasks', index, key]);
  });

  return {
    unreadable,
    rawTimes: rawTimesOf(doc, timePaths),
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
      boards: isRecord(boards) ? Object.keys(boards) : [],
      marked: isRecord(boards) ? markedTasks(boards) : [],
    },
  };
}

/**
 * The setting that said what a submission whose grading failed counted as,
 * retired once a failed grading is retried by itself and a result stays
 * until a newer one replaces it (#442). It matches the forge's one retired
 * key that a stored contest may still hold and read with it ignored, while a
 * save that has it is refused. A form loads such a contest, so its save takes
 * the key out; otherwise it would be refused for a key the organiser cannot
 * see. The forge's other retired keys stay refused at the save, in its words.
 */
const RETIRED = 'on_system_error';

/** A text field's value as the file holds it; an empty one is no key. */
const text = (value: string) => (value === '' ? undefined : value);
const number = (value: string) => numberText(value);
const time = (value: string) => {
  const iso = isoOf(value);
  return iso === undefined ? undefined : new Time(iso);
};

/**
 * Write what changed between `before` and `after` into the document. Only
 * admin keys are skipped for a manager, though the form already holds them
 * still, so a manager's save never names one.
 */
export function writeContest(
  doc: Doc,
  before: ContestValues,
  after: ContestValues,
  { admin }: { admin: boolean },
): void {
  const put = (
    path: (string | number)[],
    from: string,
    to: string,
    as: (value: string) => unknown,
    prune = false,
  ) => {
    if (from !== to) writeAt(doc, path, as(to), { prune });
  };

  if (admin) {
    put(['name'], before.name, after.name, (value) => value);
    put(['description'], before.description, after.description, text);
    put(['state'], before.state, after.state, text);
    put(['visibility'], before.visibility, after.visibility, text);
    const reg = (key: string) => ['registration', key];
    put(reg('opens'), before.opens, after.opens, time, true);
    put(reg('closes'), before.closes, after.closes, time, true);
    put(reg('capacity'), before.capacity, after.capacity, number, true);
    writeWays(doc, before.ways, after.ways);
  }
  put(['start'], before.start, after.start, time);
  put(['end'], before.end, after.end, time);
  const team = (key: string) => ['entrants', key];
  put(team('most'), before.most, after.most, number, true);
  put(team('fewest'), before.fewest, after.fewest, number, true);
  put(team('locks'), before.locks, after.locks, text, true);
  // Retired (#442): read with it ignored, refused at a save, so every save
  // takes it out.
  if (doc.has(RETIRED)) doc.delete(RETIRED);

  // The list in its new order first, each entry moving with its comments;
  // then each entry's fields, at the entry's new place.
  const order = after.tasks.map((entry) => entry.at);
  if (order.some((from, index) => from !== index)) {
    const list = doc.get('tasks', true);
    if (isSeq(list)) {
      const items = [...list.items];
      list.items = order.map((from) => items[from]!);
    }
  }
  after.tasks.forEach((entry, index) => {
    const was = before.tasks.find((old) => old.at === entry.at);
    if (was === undefined) return;
    const field = (key: string) => ['tasks', index, key];
    put(field('release_at'), was.releaseAt, entry.releaseAt, time);
    put(field('due'), was.due, entry.due, time);
    put(field('closes'), was.closes, entry.closes, time);
    put(field('marks'), was.marks, entry.marks, number);
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
