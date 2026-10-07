import { isSeq } from 'yaml';
import { isoOf, localOf, unreadableTime } from './times';
import { isRecord, numberOf, textOf, valueAt, writeAt, type Doc } from './yaml-doc';

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
  inviteOnly: boolean;
  opens: string;
  closes: string;
  approval: string;
  emailPattern: string;
  code: string;
  capacity: string;
  teamSize: string;
  /** The task entries in the order the form shows them. */
  tasks: TaskEntryValues[];
};

export type TaskEntryValues = {
  id: string;
  /** Where the entry sits in the file as read. */
  at: number;
  worth: string;
  releaseAt: string;
  due: string;
  latePerDay: string;
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

export function readContest(doc: Doc): ContestRead {
  const unreadable: string[] = [];
  const registration = valueAt(doc, ['registration']);
  if (registration !== undefined && !isRecord(registration))
    unreadable.push('registration');
  const list = valueAt(doc, ['tasks']);
  const listOk =
    list === undefined ||
    (Array.isArray(list) &&
      list.every((entry) => isRecord(entry) && typeof entry['id'] === 'string'));
  if (!listOk) unreadable.push('tasks');
  const entries =
    listOk && Array.isArray(list) ? (list as Record<string, unknown>[]) : [];

  const at = (...path: (string | number)[]) => textOf(valueAt(doc, path));
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
      inviteOnly: isRecord(registration) && registration['invite_only'] === true,
      opens: isRecord(registration) ? time('registration', 'opens') : '',
      closes: isRecord(registration) ? time('registration', 'closes') : '',
      approval: isRecord(registration) ? at('registration', 'approval') : '',
      emailPattern: isRecord(registration) ? at('registration', 'email_pattern') : '',
      code: isRecord(registration) ? at('registration', 'code') : '',
      capacity: isRecord(registration) ? at('registration', 'capacity') : '',
      teamSize: at('team_size'),
      tasks: entries.map((entry, index) => ({
        id: String(entry['id']),
        at: index,
        worth: at('tasks', index, 'worth'),
        releaseAt: time('tasks', index, 'release_at'),
        due: time('tasks', index, 'due'),
        latePerDay: at('tasks', index, 'late_per_day'),
        closes: time('tasks', index, 'closes'),
        marks: at('tasks', index, 'marks'),
      })),
    },
  };
}

/** A text field's value as the file holds it; an empty one is no key. */
const text = (value: string) => (value === '' ? undefined : value);
const number = (value: string) => numberOf(value);
const time = (value: string) => isoOf(value);

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
    if (before.inviteOnly !== after.inviteOnly) {
      writeAt(doc, reg('invite_only'), after.inviteOnly);
    }
    put(reg('opens'), before.opens, after.opens, time, true);
    put(reg('closes'), before.closes, after.closes, time, true);
    put(reg('approval'), before.approval, after.approval, text, true);
    put(reg('email_pattern'), before.emailPattern, after.emailPattern, text, true);
    put(reg('code'), before.code, after.code, text, true);
    put(reg('capacity'), before.capacity, after.capacity, number, true);
  }
  put(['start'], before.start, after.start, time);
  put(['end'], before.end, after.end, time);
  put(['team_size'], before.teamSize, after.teamSize, number);

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
    put(field('worth'), was.worth, entry.worth, number);
    put(field('release_at'), was.releaseAt, entry.releaseAt, time);
    put(field('due'), was.due, entry.due, time);
    put(field('late_per_day'), was.latePerDay, entry.latePerDay, number);
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
