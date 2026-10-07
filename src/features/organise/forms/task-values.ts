import {
  isRecord,
  numberOf,
  scalarOf,
  textOf,
  valueAt,
  writeAt,
  type Doc,
} from './yaml-doc';

/**
 * `task.yaml` as the form's fields. Every field is text, so an empty one is
 * "not set". The form writes only what changed from what it read.
 *
 * The API names no workflow's inputs, so the form edits the `inputs` entries
 * the file has, and adds or removes one by its id. An entry is the
 * contestant's when it holds form details (a mapping, other than a secret),
 * and a value otherwise; the save checks both against the workflow.
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

export function emptyInput(id: string, kind: InputValues['kind']): InputValues {
  return {
    id,
    read: false,
    kind,
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

function readInput(id: string, entry: unknown): InputValues {
  const input = { ...emptyInput(id, 'value'), read: true };
  if (isRecord(entry) && !Object.hasOwn(entry, 'secret')) {
    const options = entry['options'];
    return {
      ...input,
      kind: 'details',
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

/** `folders` are the names of the folders under `tests/`, each a test group. */
export function readTask(doc: Doc, folders: string[]): TaskRead {
  const unreadable: string[] = [];
  const at = (...path: string[]) => textOf(valueAt(doc, path));

  const inputs = valueAt(doc, ['inputs']);
  if (inputs !== undefined && !isRecord(inputs)) unreadable.push('inputs');

  const credit = valueAt(doc, ['credit']);
  let creditValues: TaskValues['credit'] = { kind: 'none', name: '' };
  if (typeof credit === 'string') creditValues = { kind: 'value', name: credit };
  else if (isRecord(credit) && typeof credit['relative'] === 'string') {
    creditValues = { kind: 'relative', name: credit['relative'] };
  } else if (credit !== undefined) unreadable.push('credit');

  const groups = valueAt(doc, ['test_groups']);
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
        ? Object.entries(inputs).map(([id, entry]) => readInput(id, entry))
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

/** An input entry as the file holds it, for one added or turned the other way. */
function inputEntry(input: InputValues): unknown {
  if (input.kind === 'value') {
    if (input.secret) return { secret: input.value };
    return scalarOf(input.value) ?? null;
  }
  const details: Record<string, unknown> = {};
  const add = (key: string, value: unknown) => {
    if (value !== undefined) details[key] = value;
  };
  add('label', text(input.label));
  add('options', optionsOf(input.options));
  add('default', scalarOf(input.default));
  add('min', numberOf(input.min));
  add('max', numberOf(input.max));
  add('max_size', text(input.maxSize));
  return details;
}

function weightsOf(rows: GroupValues['weights']): Record<string, number> | undefined {
  const weights: Record<string, number> = {};
  for (const row of rows) {
    const weight = numberOf(row.weight);
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
  add('each', numberOf(group.each));
  add('worst', numberOf(group.worst));
  add('pass', numberOf(group.pass));
  add('pass_at', numberOf(group.passAt));
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
      put(['submissions', 'max'], before.max, after.max, numberOf, true);
      put(
        ['submissions', 'rate', 'count'],
        before.rateCount,
        after.rateCount,
        numberOf,
        true,
      );
      put(
        ['submissions', 'rate', 'per'],
        before.ratePer,
        after.ratePer,
        numberOf,
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
      if (was === undefined || was.kind !== input.kind) {
        writeAt(doc, path(), inputEntry(input));
      } else if (input.kind === 'value') {
        if (was.value !== input.value || was.secret !== input.secret) {
          writeAt(doc, path(), inputEntry(input));
        }
      } else {
        put(path('label'), was.label, input.label, text);
        put(path('options'), was.options, input.options, optionsOf);
        put(path('default'), was.default, input.default, scalarOf);
        put(path('min'), was.min, input.min, numberOf);
        put(path('max'), was.max, input.max, numberOf);
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
      put(path('each'), was.each, group.each, numberOf);
      put(path('worst'), was.worst, group.worst, numberOf);
      put(path('pass'), was.pass, group.pass, numberOf);
      put(path('pass_at'), was.passAt, group.passAt, numberOf);
      put(path('show'), was.show, group.show, text);
      if (JSON.stringify(was.weights) !== JSON.stringify(group.weights)) {
        writeAt(doc, path('test_weights'), weightsOf(group.weights));
      }
    }
  }
}
