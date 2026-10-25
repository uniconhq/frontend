import type { Catalogue } from '../formula/catalogue';
import {
  namesIn,
  readLine,
  type Ast,
  type FormulaScope,
  type Reading,
} from '../formula/parse';
import { printFormula } from '../formula/print';
import { nameProblem, type Tree } from '../formula/tree';
import { NumberText, isRecord, numberText, textOf, writeAt, type Doc } from '../forms/yaml-doc';
import type { AxisValues, InputValues } from '../forms/task-values';

/** When entrants see a part of the result. Unlisted means never. */
export type When = 'now' | 'after_close' | 'on_release' | 'never';

export const WHEN: { value: When; label: string }[] = [
  { value: 'now', label: 'Now' },
  { value: 'after_close', label: 'After the close' },
  { value: 'on_release', label: 'On release' },
  { value: 'never', label: 'Never' },
];

/** Facts a value may read. Each is a number. */
export const FACTS: { name: string; line: string }[] = [
  { name: 'seconds_late', line: 'How many seconds after the due time it came in' },
  { name: 'seconds', line: 'How many seconds the submission took' },
  { name: 'compiled', line: '1 when it compiled, else 0' },
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
]);

/** One group: the runs its pick matches. `saved` is the when it was read at. */
export type ScoreGroup = {
  key: string;
  name: string;
  /** Each repeated input it picks on, and the values that count (one, or any of several). */
  picks: Record<string, string[]>;
  /** An empty pick matches no run. One read from the file matches every run. */
  none: boolean;
  saved: When;
};

/** One value. `saved` is the tree as read, until the line is edited. */
export type ScoreValue = {
  key: string;
  name: string;
  text: string;
  tree: Tree | null;
  saved: When;
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
  if (value instanceof NumberText) return value.text;
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

/** A tree as the file writes it: a number's digits stay digits, a name stays text. */
function yamlTree(tree: Tree, key: string | null = null): unknown {
  if (tree === null) return null;
  if (typeof tree === 'string') {
    if (NAME_KEYS.has(key ?? '')) return tree;
    const number = numberText(tree);
    return number instanceof NumberText ? number : tree;
  }
  const written: Record<string, unknown> = {};
  for (const [child, value] of Object.entries(tree)) {
    if (value === undefined) continue;
    written[child] = Array.isArray(value)
      ? value.map((item) => yamlTree(item, child))
      : yamlTree(value, child);
  }
  return written;
}

function whenOf(show: Record<string, When>, name: string): When {
  return show[name] ?? 'never';
}

function readShow(node: unknown): Record<string, When> {
  if (!isRecord(node)) return {};
  const show: Record<string, When> = {};
  for (const when of ['now', 'after_close', 'on_release'] as const) {
    const listed = node[when];
    if (!Array.isArray(listed)) continue;
    for (const name of listed) {
      const text = textOf(name);
      if (text !== '') show[text] = when;
    }
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
  show: Record<string, When>;
  checks: CheckDraft[];
  unreadable: string[];
};

/** `scoring` and `checks` as the cards show them. */
export function readScoring(at: (path: string[]) => unknown): ScoringRead {
  const unreadable: string[] = [];
  const scoring = at(['scoring']);
  const show = isRecord(scoring) ? readShow(scoring['show']) : {};
  const scoreGroups: ScoreGroup[] = [];
  const scoreValues: ScoreValue[] = [];
  if (scoring !== undefined && !isRecord(scoring)) unreadable.push('scoring');
  if (isRecord(scoring)) {
    const groups = scoring['groups'];
    if (groups !== undefined && !isRecord(groups)) unreadable.push('scoring');
    if (isRecord(groups)) {
      for (const [name, entry] of Object.entries(groups)) {
        if (name === 'all') continue;
        const picks = readPicks(entry);
        scoreGroups.push({
          key: freshKey('g'),
          name,
          picks,
          none: false,
          saved: whenOf(show, name),
        });
      }
    }
    const values = scoring['values'];
    if (values !== undefined && !isRecord(values)) unreadable.push('scoring');
    if (isRecord(values)) {
      for (const [name, entry] of Object.entries(values)) {
        scoreValues.push({
          key: freshKey('v'),
          name,
          text: '',
          tree: asTree(entry),
          saved: whenOf(show, name),
        });
      }
    }
  }
  const checksNode = at(['checks']);
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

function pickEntry(picks: Record<string, string[]>): Record<string, unknown> {
  const entry: Record<string, unknown> = {};
  for (const [input, values] of Object.entries(picks)) {
    if (values.length === 1) entry[input] = values[0];
    else if (values.length > 1) entry[input] = values;
  }
  return entry;
}

function showLists(show: Record<string, When>): Record<string, string[]> {
  const lists: Record<string, string[]> = {
    now: [],
    after_close: [],
    on_release: [],
  };
  for (const [name, when] of Object.entries(show)) {
    if (when === 'never' || name.trim() === '') continue;
    lists[when]?.push(name);
  }
  return lists;
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

export function writeScoring(
  doc: Doc,
  before: ScoringRead,
  after: ScoringRead,
  trees: (value: ScoreValue) => Tree | null,
): void {
  if (
    !before.unreadable.includes('scoring') &&
    JSON.stringify(scoringOf(before, (value) => value.tree)) !==
      JSON.stringify(scoringOf(after, trees))
  ) {
    const written = scoringOf(after, trees);
    const empty =
      Object.keys(written.groups).length === 0 &&
      Object.keys(written.values).length === 0 &&
      Object.values(written.show).every((list) => list.length === 0);
    writeAt(doc, ['scoring'], empty ? undefined : written, { prune: true });
  }
  if (
    !before.unreadable.includes('checks') &&
    JSON.stringify(checksOf(before.checks)) !== JSON.stringify(checksOf(after.checks))
  ) {
    const written = checksOf(after.checks);
    writeAt(doc, ['checks'], written.length === 0 ? undefined : written, { prune: true });
  }
}

function scoringOf(read: ScoringRead, trees: (value: ScoreValue) => Tree | null) {
  const groups: Record<string, unknown> = {};
  for (const group of read.scoreGroups) {
    if (group.name.trim() === '') continue;
    if (group.none && Object.keys(group.picks).length === 0) continue;
    groups[group.name.trim()] = pickEntry(group.picks);
  }
  const values: Record<string, unknown> = {};
  for (const value of read.scoreValues) {
    if (value.name.trim() === '') continue;
    const tree = trees(value);
    if (tree !== null) values[value.name.trim()] = yamlTree(tree);
  }
  return { groups, values, show: showLists(read.show) };
}

function checksOf(checks: CheckDraft[]): unknown[] {
  return checks.map((check) => {
    const expect: Record<string, unknown> = {};
    if (check.verdict.trim() !== '') expect.verdict = check.verdict.trim();
    for (const value of check.values) {
      if (value.name.trim() === '') continue;
      const number = numberText(value.expected);
      expect[value.name.trim()] =
        number instanceof NumberText ? number : value.expected;
    }
    return { submit: check.submit, expect };
  });
}

/** The runs the axes make, first axis outermost, organiser cells only. */
export function runsOf(axes: AxisValues[]): RunRow[] {
  const filled = axes.filter((axis) => axis.inputs.length > 0 && axis.tuples.length > 0);
  if (filled.length === 0) return [];
  let rows: { titles: string[]; cells: Record<string, string> }[] = [
    { titles: [], cells: {} },
  ];
  for (const axis of filled) {
    const next: typeof rows = [];
    for (const row of rows) {
      for (const tuple of axis.tuples) {
        const cells = { ...row.cells };
        for (const input of axis.inputs) {
          const cell = tuple.cells[input];
          if (cell !== undefined && !cell.entrant) cells[input] = cell.value;
        }
        next.push({
          titles: [...row.titles, tuple.title.trim()].filter((title) => title !== ''),
          cells,
        });
      }
    }
    rows = next;
  }
  return rows.map((row, index) => ({
    id: String(index),
    title: row.titles.length === 0 ? `Run ${String(index + 1)}` : row.titles.join(', '),
    cells: row.cells,
  }));
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
export function pickFor(rows: RunRow[], selected: ReadonlySet<string>): Record<string, string[]> | null {
  const chosen = rows.filter((row) => selected.has(row.id));
  if (chosen.length === 0) return {};
  const inputs = [...new Set(rows.flatMap((row) => Object.keys(row.cells)))];
  const picks: Record<string, string[]> = {};
  for (const input of inputs) {
    const values = [...new Set(chosen.map((row) => row.cells[input] ?? ''))];
    const every = [...new Set(rows.map((row) => row.cells[input] ?? ''))];
    if (values.length === every.length && values.every((value) => every.includes(value)))
      continue;
    picks[input] = values;
  }
  const matched = rows.filter((row) =>
    Object.entries(picks).every(([input, values]) => values.includes(row.cells[input] ?? '')),
  );
  return matched.length === chosen.length ? picks : null;
}

/** What a workflow's `outputs` gives a run, beside `verdict` and `passed`. */
export function outputColumns(file: unknown): Column[] {
  if (!isRecord(file) || !isRecord(file.outputs)) return [];
  return Object.entries(file.outputs).map(([name, entry]) => ({
    name,
    title: isRecord(entry) && textOf(entry.title) !== '' ? textOf(entry.title) : null,
    unit: isRecord(entry) && textOf(entry.unit) !== '' ? textOf(entry.unit) : null,
    kind: 'number' as const,
  }));
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

export function sourcesOf(node: Ast | null, names: ReadonlySet<string>): string[] {
  if (node === null) return [];
  return [
    ...new Set(
      namesIn(node)
        .map((name) => (names.has(name) ? name : name.split('.')[0]))
        .filter((name): name is string => name !== undefined && names.has(name)),
    ),
  ];
}

function loopOf(name: string, reads: Map<string, string[]>): string[] | null {
  const seen = new Set<string>();
  const walk = (at: string, path: string[]): string[] | null => {
    for (const next of reads.get(at) ?? []) {
      if (next === name) return [...path, next];
      if (seen.has(next)) continue;
      seen.add(next);
      const found = walk(next, [...path, next]);
      if (found !== null) return found;
    }
    return null;
  };
  return walk(name, [name]);
}

/** Why a value or a group cannot be saved, by its key. */
export function troublesOf(
  groups: ScoreGroup[],
  values: ScoreValue[],
  readings: Record<string, Reading | undefined>,
): Map<string, string> {
  const names = new Set(values.map((value) => value.name));
  const reads = new Map(
    values.map((value) => [
      value.name,
      sourcesOf(readings[value.key]?.node ?? null, names),
    ]),
  );
  const troubles = new Map<string, string>();
  for (const group of groups) {
    const problem =
      group.name.trim() === ''
        ? 'A group needs a name.'
        : group.none && Object.keys(group.picks).length === 0
          ? `${group.name} matches no runs`
          : nameProblem(group.name);
    if (problem !== null) troubles.set(group.key, problem);
    else if (group.name === 'all' || FACTS.some((fact) => fact.name === group.name))
      troubles.set(group.key, `${group.name} is already a name a formula reads`);
    else if (values.some((value) => value.name === group.name))
      troubles.set(group.key, `a value is called ${group.name} too: rename one`);
  }
  for (const value of values) {
    if (troubles.has(value.key)) continue;
    const problem = value.name.trim() === '' ? 'A value needs a name.' : nameProblem(value.name);
    if (problem !== null) {
      troubles.set(value.key, problem);
      continue;
    }
    const twin = values.some(
      (other) => other.key !== value.key && other.name === value.name,
    )
      ? 'another value'
      : groups.some((group) => group.name === value.name) || value.name === 'all'
        ? 'a group'
        : FACTS.some((fact) => fact.name === value.name)
          ? 'a fact'
          : null;
    if (twin !== null) {
      troubles.set(value.key, `${twin} is called ${value.name} too: rename one`);
      continue;
    }
    const loop = loopOf(value.name, reads);
    if (loop !== null)
      troubles.set(value.key, `reads itself, round ${loop.join(' → ')}: break the loop`);
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
  if (nameProblem(to) !== null) return null;
  // The caller has already given this value its new name, so one `to` is itself.
  if (values.filter((value) => value.name === to).length > 1) return null;
  const pattern = new RegExp(`\\b${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
  return values.map((value) => {
    if (value.name === to) return value;
    const text = printed(value, catalogue);
    if (!pattern.test(text)) return value;
    pattern.lastIndex = 0;
    return { ...value, text: text.replace(pattern, to), tree: null };
  });
}

export function scopeOf(
  groups: ScoreGroup[],
  values: ScoreValue[],
  columns: Column[],
  catalogue: Catalogue,
): FormulaScope {
  const sets = [...groups.map((group) => group.name).filter((name) => name !== ''), 'all'];
  let known: string[] = [];
  for (let round = 0; round <= values.length; round += 1) {
    const scope = baseScope(sets, values, columns, known);
    const next = values
      .filter((value) => readLine(printed(value, catalogue), scope, catalogue).kind === 'text')
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
    texts: [...sets.flatMap((set) => columnTexts.map((column) => `${set}.${column}`)), ...textValues],
    fields: Object.fromEntries(columns.map((column) => [column.name, column.kind])),
    about: {
      ...Object.fromEntries(FACTS.map((fact) => [fact.name, `A fact: ${fact.line}`])),
      ...Object.fromEntries(sets.map((set) => [set, set === 'all' ? 'Every run' : 'A group'])),
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
    .filter((input) => input.give === 'per-run' && input.kind === 'details' && repeated.has(input.id))
    .map((input) => input.id);
}

export function entrantInputs(inputs: InputValues[]): InputValues[] {
  return inputs.filter((input) => input.give === 'entrant' || (input.give === undefined && input.kind === 'details'));
}
