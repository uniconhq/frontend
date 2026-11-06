import type { DefinitionError, DraftRun, DraftRuns } from '@/api/types';
import type { Catalogue } from '../formula/catalogue';
import { readLine, type FormulaScope } from '../formula/parse';
import { printFormula } from '../formula/print';
import type { Tree } from '../formula/tree';
import {
  entriesAt,
  isRecord,
  numberOf,
  scalarOf,
  textOf,
  writeAt,
  type Values,
} from '../forms/values';
import type { AxisValues, InputValues, TupleValues } from '../forms/task-values';
import { FIRST_NOT_PASSED } from '@/ui/scored/scored-text';
import { isUnder } from '../problem-path';

/**
 * A moment entrants see a part of the result at: `always`, as soon as a
 * grading ends, and for inputs whenever the statement is; `after_deadline`,
 * once the task has closed for everyone; `after_release`, while its results
 * are released. The two later ones are separate: either may come first.
 */
export type Moment = 'always' | 'after_deadline' | 'after_release';

export const MOMENTS: { value: Moment; label: string }[] = [
  { value: 'always', label: 'Always' },
  { value: 'after_deadline', label: 'After the deadline' },
  { value: 'after_release', label: 'After release' },
];

/** What `show` names by itself at a moment: values, the task's settings, and outputs given once. */
export type ShowKind = 'values' | 'inputs' | 'outputs';

const KINDS: ShowKind[] = ['values', 'inputs', 'outputs'];

/** One entry of a moment's `runs`: the runs `of` picks, and the fields shown of each. */
type ShownRuns = { of: string; fields: string[] };

/** What one moment of `show` lists, as the file does. */
type Shown = Record<ShowKind, string[]> & { runs: ShownRuns[] };

/** A task's `show`: each moment's lists. Nothing is shown unless named. */
export type Show = Record<Moment, Shown>;

const nothingShown = (): Shown => ({ values: [], inputs: [], outputs: [], runs: [] });

/** A `show` that lists nothing at any moment. */
export function emptyShow(): Show {
  return {
    always: nothingShown(),
    after_deadline: nothingShown(),
    after_release: nothingShown(),
  };
}

/** Facts a value may read, each by what pages call it. Each is a number. */
export const FACTS: { name: string; title: string; line: string }[] = [
  {
    name: 'seconds_late',
    title: 'Seconds late',
    line: 'How many seconds after the due time it came in',
  },
  {
    name: 'seconds',
    title: 'Seconds taken',
    line: 'How many seconds the submission took',
  },
  {
    name: 'compiled',
    title: 'Whether it compiled',
    line: '1 when it compiled, else 0',
  },
];

const NAME_KEYS = new Set([
  'text',
  'value',
  'fact',
  'runs',
  'results',
  'name',
  'block',
  'column',
  'from',
  'program',
  'language',
]);

/** One group: the runs its pick matches. */
export type ScoreGroup = {
  key: string;
  name: string;
  /** Each repeated input it picks on, and the values that count (one, or any of several). */
  picks: Record<string, string[]>;
  /** An empty pick matches no run, and is sent as `{}` for the forge to refuse. */
  none: boolean;
};

/** One value. `tree` is the tree as read, until the line is edited. */
export type ScoreValue = {
  key: string;
  name: string;
  text: string;
  tree: Tree | null;
};

/** One check: a made-up submission and what it should get. */
export type CheckDraft = {
  key: string;
  /** An entrant input's value. A per-run input is one entry per run, in run order. */
  submit: Record<string, string | string[]>;
  /** The verdict every run must get, or blank for none. */
  verdict: string;
  /** Each value and what it must be. */
  values: { name: string; expected: string }[];
};

export type Column = {
  name: string;
  title: string | null;
  unit: string | null;
  kind: 'number' | 'text';
};

/** One run the groups pick among, in the order the axes cross. */
export type RunRow = {
  id: string;
  title: string;
  /** An organiser's value for each repeated input. An entrant's cell is absent. */
  cells: Record<string, string>;
};

let keyCount = 0;

export function freshKey(prefix: string): string {
  keyCount += 1;
  return `${prefix}${String(keyCount)}`;
}

function asTree(value: unknown): Tree | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string') return value;
  if (value === null) return null;
  if (Array.isArray(value)) return null;
  if (!isRecord(value)) return null;
  const tree: { [key: string]: Tree | Tree[] | undefined } = {};
  for (const [key, child] of Object.entries(value)) {
    if (Array.isArray(child)) {
      tree[key] = child.map((item) => asTree(item) ?? null);
    } else {
      const read = asTree(child);
      if (read !== null || child === null) tree[key] = read;
    }
  }
  return tree;
}

/**
 * A value typed into a field as the input `input` declares it: a number, a
 * boolean or text. With the type not known, whatever the text reads as.
 */
export type Typed = (input: string, text: string) => unknown;

const guessed: Typed = (_input, text) => scalarOf(text) ?? text;

/**
 * A tree as the values hold it: a number leaf a number, a name text. A
 * fold's `weights` keys stay text; the forge gives each the type of the
 * repeated value it names.
 */
function treeValue(tree: Tree, key: string | null = null): unknown {
  if (tree === null) return null;
  if (key === 'weights' && typeof tree === 'object') return weightsValue(tree);
  if (typeof tree === 'string') {
    if (NAME_KEYS.has(key ?? '')) return tree;
    const number = numberOf(tree);
    return number !== undefined && Number.isFinite(number) ? number : tree;
  }
  const written: Record<string, unknown> = {};
  for (const [child, value] of Object.entries(tree)) {
    if (value === undefined) continue;
    written[child] = Array.isArray(value)
      ? value.map((item) => treeValue(item, child))
      : treeValue(value, child);
  }
  return written;
}

/** A fold's weights: each input's table of its values, as text, to their weights. */
function weightsValue(tree: { [key: string]: Tree | Tree[] | undefined }): unknown {
  const written: Record<string, unknown> = {};
  for (const [input, table] of Object.entries(tree)) {
    if (table === undefined) continue;
    if (table === null || typeof table !== 'object' || Array.isArray(table)) {
      written[input] = Array.isArray(table)
        ? table.map((item) => treeValue(item))
        : treeValue(table);
      continue;
    }
    written[input] = Object.fromEntries(
      Object.entries(table).map(([value, weight]) => [
        value,
        Array.isArray(weight) || weight === undefined ? null : treeValue(weight),
      ]),
    );
  }
  return written;
}

/** A formula's value as a block tree. */
export function treeOf(value: unknown): Tree | null {
  return asTree(value);
}

/** A block tree as a formula's value. */
export function formulaValue(tree: Tree): unknown {
  return treeValue(tree);
}

function names(node: unknown): string[] {
  if (!Array.isArray(node)) return [];
  return node.map(textOf).filter((name) => name !== '');
}

/** A list of names, as `show` holds each. */
function isNames(node: unknown): boolean {
  return Array.isArray(node) && node.every((item) => typeof item === 'string');
}

/**
 * Whether `show` is in the shape the grid reads, or not there: each moment a
 * map of its lists, each list of names, each run entry an `of` and its
 * fields. One that is not, such as a list given as one name or a moment the
 * grid does not know, is not read, so a save leaves it as it is written.
 */
function showReadable(node: unknown): boolean {
  if (node === undefined) return true;
  if (!isRecord(node)) return false;
  return Object.entries(node).every(([moment, listed]) => {
    if (!MOMENTS.some(({ value }) => value === moment) || !isRecord(listed))
      return false;
    return Object.entries(listed).every(([kind, list]) => {
      if (KINDS.some((each) => each === kind)) return isNames(list);
      if (kind !== 'runs' || !Array.isArray(list)) return false;
      return list.every(
        (entry) =>
          isRecord(entry) &&
          Object.keys(entry).every((key) => key === 'of' || key === 'fields') &&
          typeof entry.of === 'string' &&
          entry.of !== '' &&
          isNames(entry.fields),
      );
    });
  });
}

/** `show` as the file holds it, each list in its order; what is not in that shape is left out. */
function readShow(node: unknown): Show {
  const show = emptyShow();
  if (!isRecord(node)) return show;
  for (const { value: moment } of MOMENTS) {
    const listed = node[moment];
    if (!isRecord(listed)) continue;
    for (const kind of KINDS) show[moment][kind] = names(listed[kind]);
    show[moment].runs = (Array.isArray(listed.runs) ? listed.runs : []).flatMap(
      (entry): ShownRuns[] =>
        isRecord(entry) && textOf(entry.of) !== ''
          ? [{ of: textOf(entry.of), fields: names(entry.fields) }]
          : [],
    );
  }
  return show;
}

function readPicks(entry: unknown): Record<string, string[]> {
  if (!isRecord(entry)) return {};
  const picks: Record<string, string[]> = {};
  for (const [input, value] of Object.entries(entry)) {
    if (Array.isArray(value)) {
      picks[input] = value.map(textOf).filter((item) => item !== '');
    } else {
      const text = textOf(value);
      if (text !== '') picks[input] = [text];
    }
  }
  return picks;
}

export type ScoringRead = {
  scoreGroups: ScoreGroup[];
  scoreValues: ScoreValue[];
  show: Show;
  checks: CheckDraft[];
  unreadable: string[];
};

/**
 * `scoring` and `checks` as the cards show them. The values give groups as
 * `{name, picks}` and values as `{name, formula}`.
 */
export function readScoring(settings: Values): ScoringRead {
  const unreadable: string[] = [];
  const scoring = settings['scoring'] ?? undefined;
  const show = readShow(isRecord(scoring) ? scoring['show'] : undefined);
  const scoreGroups: ScoreGroup[] = [];
  const scoreValues: ScoreValue[] = [];
  if (scoring !== undefined && !isRecord(scoring)) unreadable.push('scoring');
  if (isRecord(scoring)) {
    if (!showReadable(scoring['show'])) unreadable.push('scoring');
    const groups = entriesAt(scoring, ['groups']);
    const values = entriesAt(scoring, ['values']);
    if (groups === null || values === null) unreadable.push('scoring');
    for (const group of groups ?? []) {
      const name = textOf(group['name']);
      if (name === 'all') continue;
      scoreGroups.push({
        key: freshKey('g'),
        name,
        picks: readPicks(group['picks']),
        none: false,
      });
    }
    for (const value of values ?? []) {
      scoreValues.push({
        key: freshKey('v'),
        name: textOf(value['name']),
        text: '',
        tree: asTree(value['formula']),
      });
    }
  }
  const checksNode = settings['checks'] ?? undefined;
  const checks: CheckDraft[] = [];
  if (checksNode !== undefined && !Array.isArray(checksNode)) unreadable.push('checks');
  if (Array.isArray(checksNode)) {
    for (const item of checksNode) {
      if (!isRecord(item)) {
        unreadable.push('checks');
        break;
      }
      const submit = isRecord(item['submit']) ? item['submit'] : {};
      const expect = isRecord(item['expect']) ? item['expect'] : {};
      const values: CheckDraft['values'] = [];
      let verdict = '';
      for (const [name, value] of Object.entries(expect)) {
        if (name === 'verdict') verdict = textOf(value);
        else values.push({ name, expected: textOf(value) });
      }
      checks.push({
        key: freshKey('c'),
        submit: Object.fromEntries(
          Object.entries(submit).map(([name, value]) => [
            name,
            Array.isArray(value) ? value.map(textOf) : textOf(value),
          ]),
        ),
        verdict,
        values,
      });
    }
  }
  return { scoreGroups, scoreValues, show, checks, unreadable };
}

/**
 * A group's picks as the values hold them, each value as the input declares
 * it, as `typed` gives it: the forge matches a pick to a run's value by type,
 * so a number input's `{seed: 1}` is not the text "1".
 */
function pickEntry(
  picks: Record<string, string[]>,
  typed: Typed,
): Record<string, unknown> {
  const entry: Record<string, unknown> = {};
  for (const [input, given] of Object.entries(picks)) {
    const values = given.map((value) => typed(input, value) ?? value);
    if (values.length === 1) entry[input] = values[0];
    else if (values.length > 1) entry[input] = values;
  }
  return entry;
}

/**
 * `show` as the file writes it: each moment with something listed, each
 * list in its order and only when it names something, a run entry only
 * with a field; none at all when nothing is shown.
 */
export function showLists(show: Show): Record<string, unknown> | undefined {
  const written: Record<string, unknown> = {};
  for (const { value: moment } of MOMENTS) {
    const listed: Record<string, unknown> = {};
    for (const kind of KINDS) {
      const named = show[moment][kind].filter((name) => name.trim() !== '');
      if (named.length > 0) listed[kind] = named;
    }
    const runs = show[moment].runs.filter((entry) => entry.fields.length > 0);
    if (runs.length > 0) listed.runs = runs.map(({ of, fields }) => ({ of, fields }));
    if (Object.keys(listed).length > 0) written[moment] = listed;
  }
  return Object.keys(written).length === 0 ? undefined : written;
}

/** The moments `show` lists `name` under, of `kind`. */
export function momentsOf(show: Show, kind: ShowKind, name: string): Moment[] {
  return MOMENTS.map(({ value }) => value).filter((moment) =>
    show[moment][kind].includes(name),
  );
}

/** The moments a run entry of `of` lists `field` under. */
export function runMoments(show: Show, of: string, field: string): Moment[] {
  return MOMENTS.map(({ value }) => value).filter((moment) =>
    show[moment].runs.some((entry) => entry.of === of && entry.fields.includes(field)),
  );
}

/**
 * `show` with `name` listed under `moment`, or not. `always` already shows
 * it at both later moments, which may not list it again, so turning it on
 * takes it out of them; while it is on, the later moments are left as they
 * are. The later moments never touch each other.
 */
export function withMoment(
  show: Show,
  kind: ShowKind,
  name: string,
  moment: Moment,
  on: boolean,
): Show {
  const next = structuredClone(show);
  const list = (at: Moment) => next[at][kind];
  if (!on) {
    next[moment][kind] = list(moment).filter((each) => each !== name);
    return next;
  }
  if (moment !== 'always' && list('always').includes(name)) return show;
  if (!list(moment).includes(name)) next[moment][kind] = [...list(moment), name];
  if (moment === 'always') {
    for (const later of ['after_deadline', 'after_release'] as const) {
      next[later][kind] = list(later).filter((each) => each !== name);
    }
  }
  return next;
}

/** `show` with `field` among the fields its `of` entry lists under `moment`, or not, as `withMoment`. */
export function withRunMoment(
  show: Show,
  of: string,
  field: string,
  moment: Moment,
  on: boolean,
): Show {
  const next = structuredClone(show);
  const set = (at: Moment, shown: boolean) => {
    const runs = next[at].runs;
    const entry = runs.find((each) => each.of === of);
    if (shown && entry === undefined) runs.push({ of, fields: [field] });
    else if (shown && entry !== undefined && !entry.fields.includes(field))
      entry.fields.push(field);
    else if (!shown && entry !== undefined) {
      entry.fields = entry.fields.filter((each) => each !== field);
      if (entry.fields.length === 0)
        next[at].runs = runs.filter((each) => each !== entry);
    }
  };
  if (on && moment !== 'always' && runMoments(show, of, field).includes('always'))
    return show;
  set(moment, on);
  if (on && moment === 'always') {
    set('after_deadline', false);
    set('after_release', false);
  }
  return next;
}

/** `show` with `from`, of `kind` or a run entry's `of`, named `to` wherever it is listed. */
export function renamedInShow(
  show: Show,
  kind: ShowKind | 'runs',
  from: string,
  to: string,
): Show {
  if (from === to) return show;
  const next = structuredClone(show);
  for (const { value: moment } of MOMENTS) {
    if (kind === 'runs') {
      for (const entry of next[moment].runs) if (entry.of === from) entry.of = to;
    } else {
      next[moment][kind] = next[moment][kind].map((name) =>
        name === from ? to : name,
      );
    }
  }
  return next;
}

/** `show` without `name`, of `kind` or a run entry's `of`, as when what it names is removed. */
export function withoutInShow(show: Show, kind: ShowKind | 'runs', name: string): Show {
  const next = structuredClone(show);
  for (const { value: moment } of MOMENTS) {
    if (kind === 'runs')
      next[moment].runs = next[moment].runs.filter((e) => e.of !== name);
    else next[moment][kind] = next[moment][kind].filter((each) => each !== name);
  }
  return next;
}

/** Each run entry's `of`, in the order `show` first lists it. */
export function runEntries(show: Show): string[] {
  return [
    ...new Set(
      MOMENTS.flatMap(({ value }) => show[value].runs.map((entry) => entry.of)),
    ),
  ];
}

/**
 * The runs a run entry's `of` picks, by id: a group's, or every run for
 * `all`; null for `first_not_passed`, whose run is known only once graded.
 */
function picked(
  of: string,
  runs: RunRow[],
  groups: readonly ScoreGroup[],
): RunRow[] | null {
  if (of === FIRST_NOT_PASSED) return null;
  if (of === 'all') return runs;
  const group = groups.find((each) => each.name === of);
  return group === undefined ? [] : runs.filter((run) => inGroup(run, group));
}

/**
 * Whether the draft stops showing always what `saved` showed always: a
 * value, a setting or an output by its name; a run's field by the runs it
 * reached, so moving it to an entry that picks the same runs hides nothing.
 */
export function hidesAlways(
  saved: Show,
  draft: Show,
  part:
    | { kind: ShowKind; name: string }
    | { kind: 'runs'; of: string; field: string; runs: RunRow[]; groups: ScoreGroup[] },
): boolean {
  if (part.kind !== 'runs') {
    return (
      saved.always[part.kind].includes(part.name) &&
      !draft.always[part.kind].includes(part.name)
    );
  }
  const { of, field, runs, groups } = part;
  if (!runMoments(saved, of, field).includes('always')) return false;
  const reached = picked(of, runs, groups);
  const entries = draft.always.runs.filter((entry) => entry.fields.includes(field));
  if (reached === null) return !entries.some((entry) => entry.of === of);
  const still = new Set(
    entries.flatMap((entry) =>
      (picked(entry.of, runs, groups) ?? []).map((run) => run.id),
    ),
  );
  return reached.some((run) => !still.has(run.id));
}

/** The tree a value writes: the line's, once it has been edited, else the one read. */
export function valueTree(
  value: ScoreValue,
  scope: FormulaScope,
  catalogue: Catalogue,
): Tree | null {
  if (value.text.trim() === '') return value.tree;
  const reading = readLine(value.text, scope, catalogue);
  return reading.tree;
}

/**
 * A value with its line edited to `text`. An emptied line has no tree, so
 * it does not spring back to the one read, and reads as "Write a formula."
 */
export function withLine(
  value: ScoreValue,
  text: string,
  scope: FormulaScope,
  catalogue: Catalogue,
): ScoreValue {
  return {
    ...value,
    text,
    tree: text.trim() === '' ? null : valueTree({ ...value, text }, scope, catalogue),
  };
}

/**
 * Write `scoring` and `checks` into the values, each when it changed. Every
 * group and value is sent as it is, one with no name or no runs too, for the
 * forge to refuse at its name.
 */
export function writeScoring(
  values: Values,
  before: ScoringRead,
  after: ScoringRead,
  trees: (value: ScoreValue) => Tree | null,
  typed: Typed = guessed,
  /** The values that give text, whose expected value a check writes as text. */
  texts: ReadonlySet<string> = new Set(),
): void {
  if (
    !before.unreadable.includes('scoring') &&
    JSON.stringify(scoringOf(before, (value) => value.tree, typed)) !==
      JSON.stringify(scoringOf(after, trees, typed))
  ) {
    const written = scoringOf(after, trees, typed);
    for (const part of ['groups', 'values', 'show'] as const) {
      writeAt(values, ['scoring', part], written[part], { prune: true });
    }
  }
  if (
    !before.unreadable.includes('checks') &&
    JSON.stringify(checksOf(before.checks, typed, texts)) !==
      JSON.stringify(checksOf(after.checks, typed, texts))
  ) {
    const written = checksOf(after.checks, typed, texts);
    writeAt(values, ['checks'], written.length === 0 ? undefined : written, {
      prune: true,
    });
  }
}

function scoringOf(
  read: ScoringRead,
  trees: (value: ScoreValue) => Tree | null,
  typed: Typed,
) {
  const groups = read.scoreGroups.map((group) => ({
    name: group.name,
    picks: pickEntry(group.picks, typed),
  }));
  const values = read.scoreValues.map((value) => {
    const tree = trees(value);
    return tree === null
      ? { name: value.name }
      : { name: value.name, formula: treeValue(tree) };
  });
  // An empty part is left out, as the forge reads none as empty.
  const show = showLists(read.show);
  const written: { groups?: unknown; values?: unknown; show?: unknown } = {};
  if (groups.length > 0) written.groups = groups;
  if (values.length > 0) written.values = values;
  if (show !== undefined) written.show = show;
  return written;
}

/**
 * Each check as the file writes it, each input's value as `typed` gives it,
 * the input's declared type: a number as a number, not the text "5"; and
 * each value it expects as the value gives it, text for a value in `texts`.
 */
function checksOf(
  checks: CheckDraft[],
  typed: Typed,
  texts: ReadonlySet<string>,
): unknown[] {
  return checks.map((check) => {
    const submit: Record<string, unknown> = {};
    for (const [input, given] of Object.entries(check.submit)) {
      const value = Array.isArray(given)
        ? given.map((part) => typed(input, part) ?? part)
        : typed(input, given);
      if (value !== undefined) submit[input] = value;
    }
    const expect: Record<string, unknown> = {};
    if (check.verdict.trim() !== '') expect.verdict = check.verdict.trim();
    for (const value of check.values) {
      if (value.name.trim() === '') continue;
      const number = texts.has(value.name.trim())
        ? undefined
        : numberOf(value.expected);
      expect[value.name.trim()] =
        number !== undefined && Number.isFinite(number) ? number : value.expected;
    }
    return { submit, expect };
  });
}

/** What the one run a submission makes is called, while no input repeats. */
export const ONE_RUN = 'The one run';

/** A task's runs as the server makes them from the draft, with each axis's own rows. */
export type DraftRunRows = {
  runs: RunRow[];
  /** How many runs the axes make; `runs` is empty when that is more than a task may have. */
  count: number;
  /** Each axis's tuples as rows, for the axes that have inputs, in order. */
  axes: RunRow[][];
};

/** The server's runs as rows: titles as `runName` gives them, cells as text. */
export function draftRunRows(
  answer: DraftRuns,
  tables: readonly AxisValues[],
): DraftRunRows {
  const repeats = tables.some((table) => table.inputs.length > 0);
  const filled = tables.filter((table) => table.inputs.length > 0);
  const rowsOf = (runs: DraftRun[], named: readonly AxisValues[]): RunRow[] =>
    runs.map((run, index) => {
      const cells = Object.fromEntries(
        Object.entries(run.cells).map(([input, value]) => [input, textOf(value)]),
      );
      return {
        id: String(index),
        title: repeats
          ? runName({ title: run.titles.join(', '), cells }, named)
          : ONE_RUN,
        cells,
      };
    });
  return {
    runs: rowsOf(answer.runs, tables),
    count: answer.count,
    axes: answer.axes.map((runs, index) => {
      const table = filled[index];
      return table === undefined ? [] : rowsOf(runs, [table]);
    }),
  };
}

/** The row’s title, or its files and values in input order. */
export function runName(
  row: Pick<RunRow, 'title' | 'cells'> | TupleValues,
  tables: readonly AxisValues[],
): string {
  if (row.title.trim() !== '') return row.title;
  const cells = tables
    .flatMap((table) => table.inputs)
    .flatMap((input) => {
      const cell = row.cells[input];
      const value =
        typeof cell === 'string' ? cell : cell?.entrant ? '' : (cell?.value ?? '');
      return value === '' ? [] : [value];
    });
  return cells.join(', ') || 'No files or values yet';
}

/** One axis's inputs and its rows as the server makes them. */
export type AxisRuns = { inputs: readonly string[]; rows: RunRow[] };

/** Whether each of an axis's rows is in the group. */
export function ticksOf(group: ScoreGroup, axis: AxisRuns): boolean[] {
  return axis.rows.map(
    (tuple) =>
      !(group.none && Object.keys(group.picks).length === 0) &&
      axis.inputs.every((input) => {
        const picked = group.picks[input];
        return picked === undefined || picked.includes(tuple.cells[input] ?? '');
      }),
  );
}

/** Change a row’s picks, then let the existing writer canonicalise matching runs. */
export function withTick(
  group: ScoreGroup,
  table: AxisRuns,
  row: number,
  on: boolean,
  runs: RunRow[],
): ScoreGroup {
  const ticks = ticksOf(group, table);
  const rows = table.rows;
  const selected = rows.filter((_, index) => (index === row ? on : ticks[index]));
  const picks = { ...group.picks };
  for (const input of table.inputs) {
    if (selected.length === rows.length) delete picks[input];
    else picks[input] = [...new Set(selected.map((tuple) => tuple.cells[input] ?? ''))];
  }
  // A table can contain overlapping tuples that input-value picks cannot
  // distinguish. Removing a row drops the smallest shared value set that
  // contains it, so the requested checkbox always turns off.
  const removed = rows[row];
  if (
    !on &&
    removed !== undefined &&
    table.inputs.every(
      (input) =>
        picks[input] === undefined || picks[input].includes(removed.cells[input] ?? ''),
    )
  ) {
    const input = [...table.inputs].sort((left, right) => {
      const count = (id: string) =>
        selected.filter((tuple) => tuple.cells[id] === removed.cells[id]).length;
      return count(left) - count(right);
    })[0];
    if (input !== undefined) {
      const value = removed.cells[input] ?? '';
      picks[input] = (
        picks[input] ?? rows.map((tuple) => tuple.cells[input] ?? '')
      ).filter((each) => each !== value);
    }
  }
  const candidate = { ...group, picks, none: false };
  const matched = runs.filter((run) => inGroup(run, candidate));
  const canonical = pickFor(runs, new Set(matched.map((run) => run.id)));
  if (canonical === null)
    throw new Error('Matching a pick must produce a representable group.');
  return {
    ...group,
    picks: matched.length === 0 ? picks : canonical,
    none: matched.length === 0,
  };
}

/** Whether a run is in a group. A pick with no inputs matches every run. */
export function inGroup(row: RunRow, group: ScoreGroup): boolean {
  if (group.none && Object.keys(group.picks).length === 0) return false;
  return Object.entries(group.picks).every(([input, values]) =>
    values.includes(row.cells[input] ?? ''),
  );
}

/**
 * The pick that matches exactly `selected`, or null when no pick does: a
 * group's inputs are crossed, so a set of runs that is not a rectangle has
 * no pick.
 */
function pickFor(
  rows: RunRow[],
  selected: ReadonlySet<string>,
): Record<string, string[]> | null {
  const chosen = rows.filter((row) => selected.has(row.id));
  if (chosen.length === 0) return {};
  const inputs = [...new Set(rows.flatMap((row) => Object.keys(row.cells)))];
  const picks: Record<string, string[]> = {};
  for (const input of inputs) {
    const values = [...new Set(chosen.map((row) => row.cells[input] ?? ''))];
    const every = [...new Set(rows.map((row) => row.cells[input] ?? ''))];
    if (
      values.length === every.length &&
      values.every((value) => every.includes(value))
    )
      continue;
    picks[input] = values;
  }
  if (Object.keys(picks).length === 0) {
    const input = inputs.find((input) =>
      rows.every((row) => row.cells[input] !== undefined),
    );
    if (input !== undefined)
      picks[input] = [...new Set(rows.map((row) => row.cells[input] ?? ''))];
  }
  const matched = rows.filter((row) =>
    Object.entries(picks).every(([input, values]) =>
      values.includes(row.cells[input] ?? ''),
    ),
  );
  return matched.length === chosen.length ? picks : null;
}

/** What a workflow's `outputs` gives a run, beside `verdict` and `passed`. */
export function outputColumns(file: unknown, textValues: readonly string[]): Column[] {
  if (!isRecord(file) || !isRecord(file.outputs)) return [];
  return Object.entries(file.outputs).map(([name, entry]) => ({
    name,
    title: isRecord(entry) && textOf(entry.title) !== '' ? textOf(entry.title) : null,
    unit: isRecord(entry) && textOf(entry.unit) !== '' ? textOf(entry.unit) : null,
    kind: textValues.includes(name) ? ('text' as const) : ('number' as const),
  }));
}

/**
 * Each input an axis fills, repeated or given by the entrant in parts, as a
 * column of every run, as the forge's binder makes it: a number input a
 * number, a text input text. An input of another type is a column no
 * formula reads, so it is left out; one whose type is not known yet is
 * taken as a number.
 */
export function axisColumns(
  axes: readonly { inputs: readonly string[] }[],
  inputs: readonly { id: string; type: string | null }[],
): Column[] {
  return axes.flatMap((axis) =>
    axis.inputs.flatMap((name): Column[] => {
      const type = inputs.find((input) => input.id === name)?.type ?? null;
      if (type !== null && type !== 'number' && type !== 'text') return [];
      return [
        { name, title: null, unit: null, kind: type === 'text' ? 'text' : 'number' },
      ];
    }),
  );
}

export function columnsOf(outputs: Column[]): Column[] {
  return [
    {
      name: 'verdict',
      title: 'Verdict',
      unit: null,
      kind: 'text',
    },
    { name: 'passed', title: 'Passed', unit: null, kind: 'number' },
    ...outputs,
  ];
}

/** The line a stored tree shows, once the catalogue can print it. */
export function printed(value: ScoreValue, catalogue: Catalogue | null): string {
  if (value.text !== '') return value.text;
  if (value.tree === null || catalogue === null) return '';
  return printFormula(value.tree, catalogue, 'task');
}

/**
 * What the forge said of each group and value, by its key: the problems at
 * its name, such as a name another has, none, or a group that picks no run.
 * A value's problems inside its formula are marked on the formula instead.
 */
export function troublesOf(
  groups: ScoreGroup[],
  values: ScoreValue[],
  errors: readonly DefinitionError[],
): Map<string, string> {
  const troubles = new Map<string, string>();
  const said = (path: readonly (string | number)[], exact: boolean) =>
    errors
      .filter(
        (error) =>
          isUnder(error.path, path) && (!exact || error.path.length === path.length),
      )
      .map((error) => error.message)
      .join(' ');
  for (const group of groups) {
    const message = said(['scoring', 'groups', group.name], false);
    if (message !== '') troubles.set(group.key, message);
  }
  for (const value of values) {
    const message = said(['scoring', 'values', value.name], true);
    if (message !== '') troubles.set(value.key, message);
  }
  return troubles;
}

/** Other values' lines, with `from` read as `to`, once `to` is free to take. */
export function renamed(
  values: ScoreValue[],
  from: string,
  to: string,
  catalogue: Catalogue | null,
): ScoreValue[] | null {
  if (from === to || from.trim() === '' || to.trim() === '') return null;
  // The caller has already given this value its new name, so one `to` is itself.
  if (values.filter((value) => value.name === to).length > 1) return null;
  // Only a `{value: from}` leaf names the value: a run's column, a pick's
  // or a text that happen to read `from` are left as they are.
  return values.map((value) => {
    if (value.name === to || value.tree === null) return value;
    const tree = leavesRenamed(value.tree, from, to);
    if (JSON.stringify(tree) === JSON.stringify(value.tree)) return value;
    const text =
      value.text === '' || catalogue === null
        ? ''
        : printFormula(tree, catalogue, 'task');
    return { ...value, text, tree };
  });
}

function leavesRenamed(tree: Tree, from: string, to: string): Tree {
  if (tree === null || typeof tree === 'string') return tree;
  const keys = Object.keys(tree);
  if (keys.length === 1 && keys[0] === 'value' && tree.value === from)
    return { value: to };
  const out: { [key: string]: Tree | Tree[] | undefined } = {};
  for (const [key, child] of Object.entries(tree)) {
    out[key] =
      child === undefined || key === 'text'
        ? child
        : Array.isArray(child)
          ? child.map((item) => leavesRenamed(item, from, to))
          : leavesRenamed(child, from, to);
  }
  return out;
}

export function scopeOf(
  groups: ScoreGroup[],
  values: ScoreValue[],
  columns: Column[],
  catalogue: Catalogue,
): FormulaScope {
  const sets = [
    ...groups.map((group) => group.name).filter((name) => name !== ''),
    'all',
  ];
  let known: string[] = [];
  for (let round = 0; round <= values.length; round += 1) {
    const scope = baseScope(sets, values, columns, known);
    const next = values
      .filter(
        (value) =>
          readLine(printed(value, catalogue), scope, catalogue).kind === 'text',
      )
      .map((value) => value.name);
    if (next.join() === known.join()) break;
    known = next;
  }
  return baseScope(sets, values, columns, known);
}

function baseScope(
  sets: string[],
  values: ScoreValue[],
  columns: Column[],
  textValues: string[],
): FormulaScope {
  const columnTexts = columns
    .filter((column) => column.kind === 'text')
    .map((column) => column.name);
  return {
    where: 'task',
    names: [
      ...values.map((value) => value.name).filter((name) => name !== ''),
      ...FACTS.map((fact) => fact.name),
    ],
    sets,
    each: sets.flatMap((set) => columns.map((column) => `${set}.${column.name}`)),
    texts: [
      ...sets.flatMap((set) => columnTexts.map((column) => `${set}.${column}`)),
      ...textValues,
    ],
    fields: Object.fromEntries(columns.map((column) => [column.name, column.kind])),
    about: {
      ...Object.fromEntries(FACTS.map((fact) => [fact.name, `A fact: ${fact.line}`])),
      ...Object.fromEntries(
        sets.map((set) => [set, set === 'all' ? 'Every run' : 'A group']),
      ),
      ...Object.fromEntries(
        sets.flatMap((set) =>
          columns.map((column) => [
            `${set}.${column.name}`,
            `For each run in ${set}: ${column.title ?? column.name}`,
          ]),
        ),
      ),
    },
  };
}

/** A repeated input the entrant gives, so a check gives one part per run. */
export function perRunEntrant(inputs: InputValues[], axes: AxisValues[]): string[] {
  const repeated = new Set(axes.flatMap((axis) => axis.inputs));
  return inputs
    .filter(
      (input) =>
        input.give === 'per-run' && input.kind === 'details' && repeated.has(input.id),
    )
    .map((input) => input.id);
}

export function entrantInputs(inputs: InputValues[]): InputValues[] {
  return inputs.filter(
    (input) =>
      input.give === 'entrant' ||
      (input.give === undefined && input.kind === 'details'),
  );
}
