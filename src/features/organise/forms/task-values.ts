import type { DeclaredInput } from '@/api/types';
import {
  isRecord,
  exactAt,
  numberText,
  scalarOf,
  textAt,
  textOf,
  valueAt,
  writeAt,
  type Doc,
} from './yaml-doc';

/**
 * `task.yaml` as the form's fields. Every field is text, so an empty one is
 * "not set". The form writes only what changed from what it read.
 *
 * The workflow's declarations, when they can be read, say which inputs there
 * are, which the contestant gives (form details) and which the task gives (a
 * value), and each one's type, so a value is written as its type. When they
 * cannot be read, the form edits the `inputs` entries the file has, and adds
 * or removes one by its id; an entry is then the contestant's when it holds
 * form details (a mapping, other than a secret), and a value otherwise. The
 * save checks both against the workflow.
 */
export type TaskValues = {
  name: string;
  workflow: string;
  inputs: InputValues[];
  credit: { kind: 'none' | 'value' | 'relative'; name: string };
  groups: GroupValues[];
  max: string;
  rateCount: string;
  ratePer: string;
};

export type InputValues = {
  id: string;
  /** Whether the entry was in the file as read. */
  read: boolean;
  kind: 'details' | 'value';
  /**
   * How the file holds the entry: form details or a value. It differs from
   * `kind` when the workflow declares the input the other way, and a save
   * then writes the entry afresh as `kind`.
   */
  shape: 'details' | 'value';
  /** The type the workflow declares for the input, or null when it is not known. */
  type: string | null;
  label: string;
  /** The enum's options the contestant picks from, comma-separated. */
  options: string;
  default: string;
  min: string;
  max: string;
  maxSize: string;
  value: string;
  /** The value names a secret of the org rather than being the value. */
  secret: boolean;
};

export type GroupValues = {
  name: string;
  /** Whether `test_groups` has the group as read. */
  read: boolean;
  /** Whether `tests/` has a folder for it. */
  folder: boolean;
  each: string;
  worst: string;
  pass: string;
  passAt: string;
  weights: { test: string; weight: string }[];
  show: string;
};

export type TaskRead = {
  values: TaskValues;
  /** Keys whose content is not in the shape the form reads, left untouched. */
  unreadable: string[];
};

export function emptyInput(
  id: string,
  kind: InputValues['kind'],
  type: string | null = null,
): InputValues {
  return {
    id,
    read: false,
    kind,
    shape: kind,
    type,
    label: '',
    options: '',
    default: '',
    min: '',
    max: '',
    maxSize: '',
    value: '',
    secret: false,
  };
}

/** Whether the file holds an input the other way from how the workflow declares it. */
export function heldTheOtherWay(input: InputValues): boolean {
  return input.read && input.shape !== input.kind;
}

/**
 * An entry as the form shows it. With its declaration, it is the kind the
 * workflow says, whatever the file holds; a field of the other kind reads
 * as empty, and the save writes the entry afresh.
 */
function readInput(id: string, entry: unknown, declared?: DeclaredInput): InputValues {
  const read = readEntry(id, entry);
  if (declared === undefined) return read;
  const kind = declared.contestant ? 'details' : 'value';
  const typed = { ...read, type: declared.type };
  return kind === read.shape
    ? typed
    : { ...emptyInput(id, kind, declared.type), read: true, shape: read.shape };
}

function readEntry(id: string, entry: unknown): InputValues {
  const input = { ...emptyInput(id, 'value'), read: true };
  if (isRecord(entry) && !Object.hasOwn(entry, 'secret')) {
    const options = entry['options'];
    return {
      ...input,
      kind: 'details',
      shape: 'details',
      label: textOf(entry['label']),
      options: Array.isArray(options)
        ? options.map(textOf).join(', ')
        : textOf(options),
      default: textOf(entry['default']),
      min: textOf(entry['min']),
      max: textOf(entry['max']),
      maxSize: textOf(entry['max_size']),
    };
  }
  if (isRecord(entry))
    return { ...input, secret: true, value: textOf(entry['secret']) };
  return { ...input, value: textOf(entry) };
}

function readGroup(name: string, entry: unknown, folder: boolean): GroupValues {
  const group = isRecord(entry) ? entry : {};
  const weights = group['test_weights'];
  return {
    name,
    read: true,
    folder,
    each: textOf(group['each']),
    worst: textOf(group['worst']),
    pass: textOf(group['pass']),
    passAt: textOf(group['pass_at']),
    weights: isRecord(weights)
      ? Object.entries(weights).map(([test, weight]) => ({
          test,
          weight: textOf(weight),
        }))
      : [],
    show: textOf(group['show']),
  };
}

/**
 * `folders` are the names of the folders under `tests/`, each a test group;
 * `declared` the inputs the workflow declares, when they could be read.
 */
export function readTask(
  doc: Doc,
  folders: string[],
  declared: DeclaredInput[] | null = null,
): TaskRead {
  const unreadable: string[] = [];
  const at = (...path: string[]) => textAt(doc, path);

  const inputs = exactAt(doc, ['inputs']);
  if (inputs !== undefined && !isRecord(inputs)) unreadable.push('inputs');

  const credit = valueAt(doc, ['credit']);
  let creditValues: TaskValues['credit'] = { kind: 'none', name: '' };
  if (typeof credit === 'string') creditValues = { kind: 'value', name: credit };
  else if (isRecord(credit) && typeof credit['relative'] === 'string') {
    creditValues = { kind: 'relative', name: credit['relative'] };
  } else if (credit !== undefined) unreadable.push('credit');

  const groups = exactAt(doc, ['test_groups']);
  const groupsOk =
    groups === undefined ||
    (isRecord(groups) &&
      Object.values(groups).every(
        (group) =>
          group === null ||
          (isRecord(group) &&
            (group['test_weights'] === undefined || isRecord(group['test_weights']))),
      ));
  if (!groupsOk) unreadable.push('test_groups');
  const named = groupsOk && isRecord(groups) ? groups : {};
  const groupValues = [
    ...Object.entries(named).map(([name, entry]) =>
      readGroup(name, entry, folders.includes(name)),
    ),
    ...(groupsOk
      ? folders
          .filter((folder) => !Object.hasOwn(named, folder))
          .map((folder) => ({ ...readGroup(folder, {}, true), read: false }))
      : []),
  ];

  const submissions = valueAt(doc, ['submissions']);
  const rate = valueAt(doc, ['submissions', 'rate']);
  if (
    (submissions !== undefined && !isRecord(submissions)) ||
    (rate !== undefined && !isRecord(rate))
  ) {
    unreadable.push('submissions');
  }

  return {
    unreadable,
    values: {
      name: at('name'),
      workflow: at('workflow'),
      inputs: isRecord(inputs)
        ? Object.entries(inputs).map(([id, entry]) =>
            readInput(
              id,
              entry,
              declared?.find((input) => input.id === id),
            ),
          )
        : [],
      credit: creditValues,
      groups: groupValues,
      max: isRecord(submissions) ? at('submissions', 'max') : '',
      rateCount: isRecord(rate) ? at('submissions', 'rate', 'count') : '',
      ratePer: isRecord(rate) ? at('submissions', 'rate', 'per') : '',
    },
  };
}

const text = (value: string) => (value.trim() === '' ? undefined : value);
const optionsOf = (value: string) => {
  const options = value
    .split(',')
    .map((option) => option.trim())
    .filter((option) => option !== '');
  return options.length === 0 ? undefined : options;
};

/**
 * A value typed into a field as its declared type: a number, true or false,
 * or text as it is (an enum's option, a path, a sentence), even when it reads
 * as a number. With no type known, whatever it reads as. Empty is no value.
 */
function typedValue(type: string | null, text: string): unknown {
  if (text.trim() === '') return undefined;
  switch (type) {
    case 'number':
      return numberText(text);
    case 'boolean':
      return text.trim() === 'true' ? true : text.trim() === 'false' ? false : text;
    case 'text':
    case 'enum':
    case 'file':
    case 'folder':
      return text;
    default:
      return scalarOf(text);
  }
}

/**
 * An input entry as the file holds it, for one added or turned the other way.
 * A value left empty is no entry, so the save names the input as missing
 * rather than as the wrong type.
 */
function inputEntry(input: InputValues): unknown {
  if (input.kind === 'value') {
    if (input.secret) return { secret: input.value };
    return typedValue(input.type, input.value);
  }
  const details: Record<string, unknown> = {};
  const add = (key: string, value: unknown) => {
    if (value !== undefined) details[key] = value;
  };
  add('label', text(input.label));
  add('options', optionsOf(input.options));
  add('default', typedValue(input.type, input.default));
  add('min', numberText(input.min));
  add('max', numberText(input.max));
  add('max_size', text(input.maxSize));
  return details;
}

function weightsOf(rows: GroupValues['weights']): Record<string, unknown> | undefined {
  const weights: Record<string, unknown> = {};
  for (const row of rows) {
    const weight = numberText(row.weight);
    if (row.test.trim() !== '' && weight !== undefined)
      weights[row.test.trim()] = weight;
  }
  return Object.keys(weights).length === 0 ? undefined : weights;
}

/** A group as the file holds it, for one the form adds. */
function groupEntry(group: GroupValues): Record<string, unknown> {
  const entry: Record<string, unknown> = {};
  const add = (key: string, value: unknown) => {
    if (value !== undefined) entry[key] = value;
  };
  add('each', numberText(group.each));
  add('worst', numberText(group.worst));
  add('pass', numberText(group.pass));
  add('pass_at', numberText(group.passAt));
  add('test_weights', weightsOf(group.weights));
  add('show', text(group.show));
  return entry;
}

/**
 * Write what changed between `before` and `after` into the document. A
 * manager's save leaves the admin's keys alone; the form holds them still too.
 */
export function writeTask(
  doc: Doc,
  before: TaskValues,
  after: TaskValues,
  { admin, unreadable }: { admin: boolean; unreadable: string[] },
): void {
  const put = (
    path: string[],
    from: string,
    to: string,
    as: (value: string) => unknown,
    prune = false,
  ) => {
    if (from !== to) writeAt(doc, path, as(to), { prune });
  };

  if (admin) {
    put(['name'], before.name, after.name, (value) => value);
    if (!unreadable.includes('submissions')) {
      put(['submissions', 'max'], before.max, after.max, numberText, true);
      put(
        ['submissions', 'rate', 'count'],
        before.rateCount,
        after.rateCount,
        numberText,
        true,
      );
      put(
        ['submissions', 'rate', 'per'],
        before.ratePer,
        after.ratePer,
        numberText,
        true,
      );
    }
  }
  put(['workflow'], before.workflow, after.workflow, text);

  if (!unreadable.includes('credit')) {
    const was = before.credit;
    const now = after.credit;
    if (was.kind !== now.kind || was.name !== now.name) {
      const name = now.name.trim();
      writeAt(
        doc,
        ['credit'],
        now.kind === 'none' || name === ''
          ? undefined
          : now.kind === 'value'
            ? name
            : { relative: name },
      );
    }
  }

  if (!unreadable.includes('inputs')) {
    for (const input of before.inputs) {
      if (!after.inputs.some((kept) => kept.id === input.id)) {
        writeAt(doc, ['inputs', input.id], undefined, { prune: true });
      }
    }
    for (const input of after.inputs) {
      const was = before.inputs.find((old) => old.id === input.id);
      const path = (key?: string) =>
        key === undefined ? ['inputs', input.id] : ['inputs', input.id, key];
      if (was === undefined || was.shape !== input.kind) {
        writeAt(doc, path(), inputEntry(input), { prune: true });
      } else if (input.kind === 'value') {
        if (was.value !== input.value || was.secret !== input.secret) {
          writeAt(doc, path(), inputEntry(input), { prune: true });
        }
      } else {
        put(path('label'), was.label, input.label, text);
        put(path('options'), was.options, input.options, optionsOf);
        put(path('default'), was.default, input.default, (value) =>
          typedValue(input.type, value),
        );
        put(path('min'), was.min, input.min, numberText);
        put(path('max'), was.max, input.max, numberText);
        put(path('max_size'), was.maxSize, input.maxSize, text);
      }
    }
  }

  if (!unreadable.includes('test_groups')) {
    for (const group of before.groups) {
      if (group.read && !after.groups.some((kept) => kept.name === group.name)) {
        writeAt(doc, ['test_groups', group.name], undefined);
      }
    }
    for (const group of after.groups) {
      const was = before.groups.find((old) => old.name === group.name);
      const path = (key: string) => ['test_groups', group.name, key];
      if (was === undefined || !group.read) {
        writeAt(doc, ['test_groups', group.name], groupEntry(group));
        continue;
      }
      put(path('each'), was.each, group.each, numberText);
      put(path('worst'), was.worst, group.worst, numberText);
      put(path('pass'), was.pass, group.pass, numberText);
      put(path('pass_at'), was.passAt, group.passAt, numberText);
      put(path('show'), was.show, group.show, text);
      if (JSON.stringify(was.weights) !== JSON.stringify(group.weights)) {
        writeAt(doc, path('test_weights'), weightsOf(group.weights));
      }
    }
  }
}
