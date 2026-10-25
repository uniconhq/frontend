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
import type { Catalogue } from '../formula/catalogue';
import { textValues } from '../formula/gives';
import {
  axisColumns,
  readScoring,
  writeScoring,
  type CheckDraft,
  type ScoreGroup,
  type ScoreValue,
  type When,
} from '../task/scoring-model';

/**
 * `task.yaml` as the form's fields. Every field is text, so an empty one is
 * "not set". The form writes only what changed from what it read.
 *
 * The workflow's declarations, when they can be read, say which inputs there
 * are and each one's type, so a value is written as its type. Who gives each
 * is the task's: the entrant, by `entrant` and its form details; one value
 * per run, by an axis of `repeat`; or the task, by a value. When the
 * declarations cannot be read, the form edits the `inputs` entries the file
 * has, and adds or removes one by its id. The save checks both against the
 * workflow.
 */
export type TaskValues = {
  name: string;
  workflow: string;
  inputs: InputValues[];
  /**
   * One axis of `repeat`: the inputs that move together, and one tuple per
   * row. A second axis is crossed with the first, so 2 and 3 tuples make 6
   * runs.
   */
  axes: AxisValues[];
  /** Groups of runs, by the repeated inputs they pick. */
  scoreGroups: ScoreGroup[];
  /** Named results, each a formula. */
  scoreValues: ScoreValue[];
  /** When each part of the result is shown. */
  show: Record<string, When>;
  checks: CheckDraft[];
  max: string;
  rateCount: string;
  ratePer: string;
};

/** Who fills an input: the organiser, the entrant, or one value per run. */
export type Give = 'setting' | 'entrant' | 'per-run';

export type AxisValues = {
  inputs: string[];
  tuples: TupleValues[];
};

export type TupleValues = {
  title: string;
  maxSize: string;
  cells: Record<string, { entrant: boolean; value: string }>;
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
  /**
   * Who fills it: the entrant, one value per run, or the organiser. Absent
   * on a setting, which the organiser fills.
   */
  give?: Give;
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

/** One empty tuple of an axis, every cell a value the organiser has not set. */
export function emptyTuple(inputs: readonly string[]): TupleValues {
  return {
    title: '',
    maxSize: '',
    cells: Object.fromEntries(inputs.map((id) => [id, { entrant: false, value: '' }])),
  };
}

/** How many runs the axes make: the product of their tuples, or 1 with none. */
export function runCount(axes: readonly AxisValues[]): number {
  const counted = axes.filter((axis) => axis.inputs.length > 0);
  if (counted.length === 0) return 1;
  return counted.reduce((total, axis) => total * Math.max(axis.tuples.length, 1), 1);
}

/** Whether the file holds an input the other way from how the workflow declares it. */
export function heldTheOtherWay(input: InputValues): boolean {
  return input.read && input.shape !== input.kind;
}

/**
 * An entry as the form shows it, typed as its declaration says. An entry
 * that is not the entrant's is a value the task gives: one held as form
 * details reads as empty, and the save writes the entry afresh.
 */
function readInput(id: string, entry: unknown, declared?: DeclaredInput): InputValues {
  const read = readEntry(id, entry);
  if (declared === undefined) return read;
  const typed = { ...read, type: declared.type };
  if (read.give === 'entrant' || read.shape === 'value') return typed;
  return { ...emptyInput(id, 'value', declared.type), read: true, shape: read.shape };
}

function readEntry(id: string, entry: unknown): InputValues {
  const input = { ...emptyInput(id, 'value'), read: true };
  if (entry === 'entrant')
    return { ...input, kind: 'details', shape: 'details', give: 'entrant' };
  if (isRecord(entry) && Object.hasOwn(entry, 'entrant')) {
    const details = entry['entrant'];
    const from = isRecord(details) ? readEntry(id, details) : input;
    return { ...from, kind: 'details', shape: 'details', give: 'entrant', read: true };
  }
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

function readCell(entry: unknown): { entrant: boolean; value: string } {
  if (entry === 'entrant') return { entrant: true, value: '' };
  return { entrant: false, value: textOf(entry) };
}

function readTuple(inputs: string[], entry: unknown): TupleValues | null {
  if (Array.isArray(entry)) {
    return {
      title: '',
      maxSize: '',
      cells: Object.fromEntries(
        inputs.map((id, index) => [id, readCell(entry[index])]),
      ),
    };
  }
  if (!isRecord(entry) && inputs.length === 1) {
    const id = inputs[0];
    return id === undefined
      ? null
      : { title: '', maxSize: '', cells: { [id]: readCell(entry) } };
  }
  if (!isRecord(entry)) return null;
  return {
    title: textOf(entry['title']),
    maxSize: textOf(entry['max_size']),
    cells: Object.fromEntries(inputs.map((id) => [id, readCell(entry[id])])),
  };
}

/** `repeat` as axes, or null when it is not a list of axes. */
function readAxes(node: unknown): AxisValues[] | null {
  if (node === undefined) return [];
  if (!Array.isArray(node)) return null;
  const axes: AxisValues[] = [];
  for (const item of node) {
    if (
      !isRecord(item) ||
      !Array.isArray(item['inputs']) ||
      !Array.isArray(item['tuples'])
    )
      return null;
    const inputs = item['inputs'].map(textOf).filter((id) => id !== '');
    const tuples: TupleValues[] = [];
    for (const tuple of item['tuples']) {
      const read = readTuple(inputs, tuple);
      if (read === null) return null;
      tuples.push(read);
    }
    axes.push({ inputs, tuples });
  }
  return axes;
}

/** `declared` are the inputs the workflow declares, when they could be read. */
export function readTask(doc: Doc, declared: DeclaredInput[] | null = null): TaskRead {
  const unreadable: string[] = [];
  const at = (...path: string[]) => textAt(doc, path);

  const axes = readAxes(exactAt(doc, ['repeat']));
  if (axes === null) unreadable.push('repeat');
  const axisInputs = new Set((axes ?? []).flatMap((axis) => axis.inputs));
  const inputs = exactAt(doc, ['inputs']);
  if (inputs !== undefined && !isRecord(inputs)) unreadable.push('inputs');

  const submissions = valueAt(doc, ['submissions']);
  const rate = valueAt(doc, ['submissions', 'rate']);
  if (
    (submissions !== undefined && !isRecord(submissions)) ||
    (rate !== undefined && !isRecord(rate))
  ) {
    unreadable.push('submissions');
  }

  const given = isRecord(inputs)
    ? Object.entries(inputs).map(([id, entry]) =>
        readInput(
          id,
          entry,
          declared?.find((input) => input.id === id),
        ),
      )
    : [];
  // Every input the workflow declares has its fields, the ones the file
  // leaves out empty, so each is filled in where it is shown.
  const missing =
    isRecord(inputs) || inputs === undefined
      ? (declared ?? [])
          .filter((input) => !given.some((found) => found.id === input.id))
          .map((input) => emptyInput(input.id, 'value', input.type))
      : [];
  const withGive = [...given, ...missing].map((input) =>
    axisInputs.has(input.id) ? { ...input, give: 'per-run' as const } : input,
  );
  const scoring = readScoring((path) => exactAt(doc, path));
  unreadable.push(...scoring.unreadable);

  return {
    unreadable,
    values: {
      name: at('name'),
      workflow: at('workflow'),
      inputs: withGive,
      axes: axes ?? [],
      scoreGroups: scoring.scoreGroups,
      scoreValues: scoring.scoreValues,
      show: scoring.show,
      checks: scoring.checks,
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
    if (input.secret)
      return input.value.trim() === '' ? undefined : { secret: input.value };
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

/** An entrant's input: `entrant` alone, or `{entrant: {label, ...}}` with its form. */
function entrantEntry(input: InputValues): unknown {
  const details = inputEntry({ ...input, kind: 'details' });
  if (!isRecord(details) || Object.keys(details).length === 0) return 'entrant';
  return { entrant: details };
}

/** Whether an entry holds nothing to write: no value, or no form detail. */
function emptyEntry(input: InputValues): boolean {
  const entry = inputEntry(input);
  return entry === undefined || (isRecord(entry) && Object.keys(entry).length === 0);
}

/** `repeat` as the file holds it: every tuple a map, so a title cannot swap two values. */
function repeatOf(axes: AxisValues[], inputs: InputValues[]): unknown[] {
  return axes
    .filter((axis) => axis.inputs.length > 0)
    .map((axis) => ({
      inputs: axis.inputs,
      tuples: axis.tuples.map((tuple) => {
        const row: Record<string, unknown> = {};
        const entrant = axis.inputs.some((id) => tuple.cells[id]?.entrant === true);
        for (const id of axis.inputs) {
          const cell = tuple.cells[id];
          const type = inputs.find((input) => input.id === id)?.type ?? null;
          row[id] =
            cell?.entrant === true ? 'entrant' : typedValue(type, cell?.value ?? '');
        }
        if (tuple.title.trim() !== '') row.title = tuple.title.trim();
        if (entrant && tuple.maxSize.trim() !== '') row.max_size = tuple.maxSize.trim();
        return row;
      }),
    }));
}

/**
 * Write what changed between `before` and `after` into the document. A
 * manager's save leaves the admin's keys alone; the form holds them still too.
 */
/**
 * The task's values that give text, as the forge reads them: a run's text
 * columns are `verdict` and each text input an axis fills.
 */
function givingText(values: TaskValues, catalogue: Catalogue): Set<string> {
  const trees = Object.fromEntries(
    values.scoreValues
      .filter((value) => value.name.trim() !== '' && value.tree !== null)
      .map((value) => [value.name.trim(), value.tree]),
  );
  const texts = axisColumns(values.axes, values.inputs)
    .filter((column) => column.kind === 'text')
    .map((column) => column.name);
  return textValues(trees, new Set(['verdict', ...texts]), catalogue);
}

export function writeTask(
  doc: Doc,
  before: TaskValues,
  after: TaskValues,
  {
    admin,
    unreadable,
    catalogue = null,
  }: {
    admin: boolean;
    unreadable: string[];
    /** The blocks, which tell a value that gives text; none while not loaded. */
    catalogue?: Catalogue | null;
  },
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
      if (input.give === 'per-run') {
        writeAt(doc, path(), undefined, { prune: true });
        continue;
      }
      if (input.give === 'entrant') {
        if (
          was === undefined ||
          was.give !== 'entrant' ||
          JSON.stringify(entrantEntry(was)) !== JSON.stringify(entrantEntry(input))
        ) {
          writeAt(doc, path(), entrantEntry(input), { prune: true });
        }
        continue;
      }
      if (was === undefined && emptyEntry(input)) continue;
      if (was === undefined || was.shape !== input.kind) {
        writeAt(doc, path(), inputEntry(input), { prune: true });
      } else if (input.kind === 'value') {
        if (was.value !== input.value || was.secret !== input.secret) {
          writeAt(doc, path(), inputEntry(input), { prune: true });
        }
      } else {
        // An entrant's input left with no detail goes from the settings, as
        // one never given details is never written.
        put(path('label'), was.label, input.label, text, true);
        put(path('options'), was.options, input.options, optionsOf, true);
        put(
          path('default'),
          was.default,
          input.default,
          (value) => typedValue(input.type, value),
          true,
        );
        put(path('min'), was.min, input.min, numberText, true);
        put(path('max'), was.max, input.max, numberText, true);
        put(path('max_size'), was.maxSize, input.maxSize, text, true);
      }
    }
  }

  if (
    !unreadable.includes('repeat') &&
    JSON.stringify(before.axes) !== JSON.stringify(after.axes)
  ) {
    const written = repeatOf(after.axes, after.inputs);
    writeAt(doc, ['repeat'], written.length === 0 ? undefined : written, {
      prune: true,
    });
  }

  if (!unreadable.includes('scoring') || !unreadable.includes('checks')) {
    writeScoring(
      doc,
      {
        scoreGroups: before.scoreGroups,
        scoreValues: before.scoreValues,
        show: before.show,
        checks: before.checks,
        unreadable,
      },
      {
        scoreGroups: after.scoreGroups,
        scoreValues: after.scoreValues,
        show: after.show,
        checks: after.checks,
        unreadable,
      },
      (value) => value.tree,
      (input, text) =>
        typedValue(after.inputs.find((item) => item.id === input)?.type ?? null, text),
      catalogue === null ? new Set() : givingText(after, catalogue),
    );
  }
}
