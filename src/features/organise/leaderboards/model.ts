import type { Catalogue } from '../formula/catalogue';
import { readLine, type FormulaScope, type Kind, type Reading } from '../formula/parse';
import { printFormula } from '../formula/print';
import { nameProblem, type Tree } from '../formula/tree';
import {
  exactJS,
  isRecord,
  numberText,
  parseYaml,
  textOf,
  Time,
  writeAt,
  type Doc,
} from '../forms/yaml-doc';
import { instantOf, isoOf, localOf } from '../forms/times';
import { formulaYaml, treeOf } from '../task/scoring-model';

/**
 * A leaderboard as the editor holds it. The file stores a mapping of key to
 * leaderboard (a list is an old contest, left untouched). A column's `line`
 * is what the organiser typed; null means the line is the tree's print.
 */

/** Who a leaderboard is shown to, and which rows they are given. */
export type Who = 'staff' | 'entrants' | 'everyone';
export type RowsKind = 'all' | 'own' | 'top';

export type ColumnDraft = {
  /** Stable while the name is typed. */
  key: string;
  name: string;
  line: string | null;
  tree: Tree | null;
};

export type SortDraft = { name: string; way: 'desc' | 'asc' };
export type ShowDraft = { name: string; places: string };

export type BoardDraft = {
  id: string;
  key: string;
  title: string;
  who: Who;
  rows: RowsKind;
  /** How many top rows, when `rows` is `top`. */
  top: string;
  columns: ColumnDraft[];
  sort: SortDraft[];
  display: ShowDraft[];
};

export type HoldDraft = {
  /** The file's hold could not be shown, so a save leaves it until it is set again. */
  locked: boolean;
  on: boolean;
  /** The organiser's local time, as the time field holds it. */
  from: string;
  untilStaff: boolean;
  until: string;
};

export type LeaderboardsDraft = {
  boards: BoardDraft[];
  hold: HoldDraft;
  /** Stored as a list, which this page does not rewrite. */
  legacy: boolean;
};

export type FieldProblem = { field: string; message: string };

/** A leaderboard key is a task handle: the save refuses a longer one. */
export const KEY_MAX = 24;
const KEY = /^[a-z0-9][a-z0-9_-]*$/;
const COLUMN_MAX = 40;

export const OWN_EVERYONE =
  'A leaderboard shown to everyone cannot show each entrant only their own row, ' +
  'since a guest has none. Show every row or the top rows.';

let count = 0;

function nextId(prefix: string): string {
  count += 1;
  return `${prefix}-${String(count)}`;
}

const HOLD_OFF: HoldDraft = {
  locked: false,
  on: false,
  from: '',
  untilStaff: true,
  until: '',
};

export function columnField(boardKey: string, column: ColumnDraft): string {
  const name = column.name === '' ? column.key : column.name;
  return `${boardKey}.columns.${name}`;
}

/** The line the editor shows: what was typed, or the tree printed once the catalogue is here. */
export function lineOf(column: ColumnDraft, catalogue: Catalogue | null): string {
  if (column.line !== null) return column.line;
  if (catalogue === null || column.tree === null) return '';
  return printFormula(column.tree, catalogue, 'leaderboard');
}

export function blankColumn(): ColumnDraft {
  return { key: nextId('column'), name: '', line: null, tree: '1' };
}

/** A new leaderboard: staff's, one number column, ordered by it. */
export function blankBoard(taken: readonly string[]): BoardDraft {
  let key = 'board';
  let n = 2;
  while (taken.includes(key)) {
    key = `board${String(n)}`;
    n += 1;
  }
  return {
    id: nextId('board'),
    key,
    title: '',
    who: 'staff',
    rows: 'all',
    top: '10',
    columns: [{ key: nextId('column'), name: 'points', line: null, tree: '1' }],
    sort: [{ name: 'points', way: 'desc' }],
    display: [{ name: 'points', places: '' }],
  };
}

function readWho(value: unknown): Who {
  return value === 'entrants' || value === 'everyone' || value === 'staff'
    ? value
    : 'staff';
}

function readRows(value: unknown): { rows: RowsKind; top: string } {
  if (value === 'own') return { rows: 'own', top: '10' };
  const text = textOf(value);
  if (/^[1-9]\d*$/.test(text)) return { rows: 'top', top: text };
  return { rows: 'all', top: '10' };
}

function readColumns(value: unknown): ColumnDraft[] {
  if (!isRecord(value)) return [];
  return Object.entries(value).map(([name, entry]) => ({
    key: nextId('column'),
    name,
    line: null,
    tree: treeOf(entry),
  }));
}

function readSort(value: unknown): SortDraft[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const entries = Object.entries(item);
    const first = entries[0];
    if (entries.length !== 1 || first === undefined) return [];
    const [name, way] = first;
    return way === 'desc' || way === 'asc' ? [{ name, way }] : [];
  });
}

function readDisplay(value: unknown): ShowDraft[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === 'string') return [{ name: item, places: '' }];
    if (!isRecord(item)) return [];
    const entries = Object.entries(item);
    const first = entries[0];
    if (entries.length !== 1 || first === undefined) return [];
    const [name, how] = first;
    const places = isRecord(how) ? textOf(how['places']) : '';
    return [{ name, places: /^([0-9]|10)$/.test(places) ? places : '' }];
  });
}

function readBoard(key: string, value: unknown): BoardDraft {
  const node = isRecord(value) ? value : {};
  const audience = isRecord(node['audience']) ? node['audience'] : {};
  const rows = readRows(audience['rows']);
  return {
    id: nextId('board'),
    key,
    title: textOf(node['title']),
    who: readWho(audience['who']),
    rows: rows.rows,
    top: rows.top,
    columns: readColumns(node['columns']),
    sort: readSort(node['sort']),
    display: readDisplay(node['display']),
  };
}

function readHold(value: unknown): HoldDraft {
  if (value === undefined) return HOLD_OFF;
  if (!isRecord(value)) return { ...HOLD_OFF, locked: true };
  const from = localOf(value['from']);
  if (from === '') return { ...HOLD_OFF, locked: true };
  if (value['until'] === 'staff') {
    return { locked: false, on: true, from, untilStaff: true, until: '' };
  }
  const until = localOf(value['until']);
  if (until === '') return { ...HOLD_OFF, locked: true };
  return { locked: false, on: true, from, untilStaff: false, until };
}

/** The leaderboards and the hold as the form edits them. A list is left as stored. */
export function readLeaderboards(doc: Doc): LeaderboardsDraft {
  const node = exactJS(doc);
  const root = isRecord(node) ? node : {};
  const boards = root['leaderboards'];
  const hold = readHold(root['hold']);
  if (boards === undefined) return { boards: [], hold, legacy: false };
  if (!isRecord(boards)) return { boards: [], hold, legacy: true };
  return {
    boards: Object.entries(boards).map(([key, value]) => readBoard(key, value)),
    hold,
    legacy: false,
  };
}

/** The contest's task ids, which a leaderboard key may not reuse. */
export function taskIds(doc: Doc): string[] {
  const node = exactJS(doc);
  if (!isRecord(node) || !Array.isArray(node['tasks'])) return [];
  return node['tasks'].flatMap((item) => {
    if (!isRecord(item)) return [];
    const id = textOf(item['id']);
    return id === '' ? [] : [id];
  });
}

/** `owner/name@version` as the workflow a task file names, or null. */
export function workflowRef(
  content: string,
): { owner: string; name: string; version: string } | null {
  const parsed = parseYaml(content);
  if ('error' in parsed) return null;
  const top = exactJS(parsed.doc);
  if (!isRecord(top)) return null;
  const text = textOf(top['workflow']);
  const at = text.lastIndexOf('@');
  if (at <= 0) return null;
  const head = text.slice(0, at);
  const slash = head.indexOf('/');
  const version = text.slice(at + 1);
  if (slash <= 0 || slash === head.length - 1 || version === '') return null;
  return { owner: head.slice(0, slash), name: head.slice(slash + 1), version };
}

/** The output names a workflow file declares under `outputs`. */
export function outputNames(content: string): string[] {
  const parsed = parseYaml(content);
  if ('error' in parsed) return [];
  const top = exactJS(parsed.doc);
  if (!isRecord(top) || !isRecord(top['outputs'])) return [];
  return Object.keys(top['outputs']);
}

/** The contest's end, an hour earlier, as the time field holds it. Empty when the end is not a time. */
export function hourBefore(end: unknown): string {
  const at = instantOf(end);
  if (at === null) return '';
  return localOf(new Date(at - 60 * 60 * 1000).toISOString());
}

/**
 * The rows one entrant would be cut to. `own` is their row with no place.
 * A top count keeps the rows tied with the last of them, then their own row
 * when it was past the cut. The staff read has every row, so the cut is applied here.
 */
export function previewRows<
  T extends { place: number | null; row: { entrant: string } },
>(rows: readonly T[], entrant: string, kind: RowsKind, top: number): T[] {
  if (kind === 'own') {
    return rows
      .filter((row) => row.row.entrant === entrant)
      .map((row) => ({ ...row, place: null }));
  }
  if (kind !== 'top' || !Number.isInteger(top) || top < 1) return [...rows];
  const kept = rows.slice(0, top);
  const last = kept[kept.length - 1];
  let index = top;
  while (
    index < rows.length &&
    last !== undefined &&
    last.place !== null &&
    rows[index]?.place === last.place
  ) {
    const next = rows[index];
    if (next !== undefined) kept.push(next);
    index += 1;
  }
  if (!kept.some((row) => row.row.entrant === entrant)) {
    const mine = rows.find((row) => row.row.entrant === entrant);
    if (mine !== undefined) kept.push(mine);
  }
  return kept;
}

/** What a leaderboard's formulas may name. */
export function boardScope(
  board: BoardDraft,
  boards: readonly BoardDraft[],
  tasks: readonly string[],
  outputs: readonly string[],
  texts: readonly string[],
): FormulaScope {
  const fields: Record<string, 'number' | 'text'> = {
    verdict: 'text',
    passed: 'number',
  };
  for (const name of outputs) if (!(name in fields)) fields[name] = 'number';
  return {
    where: 'leaderboard',
    names: board.columns.map((column) => column.name).filter((name) => name !== ''),
    each: ['verdict', 'passed', ...outputs],
    sets: tasks,
    boards: boards
      .map((item) => item.key)
      .filter((key) => key !== '' && key !== board.key),
    texts,
    fields,
  };
}

export function boardReadings(
  board: BoardDraft,
  boards: readonly BoardDraft[],
  tasks: readonly string[],
  outputs: readonly string[],
  catalogue: Catalogue,
): Record<string, Reading> {
  const first = boardScope(board, boards, tasks, outputs, []);
  const read = (scope: FormulaScope) =>
    Object.fromEntries(
      board.columns.map((column) => [
        column.key,
        readLine(lineOf(column, catalogue), scope, catalogue),
      ]),
    );
  const pass = read(first);
  const texts = board.columns
    .filter((column) => pass[column.key]?.kind === 'text')
    .map((column) => column.name);
  return texts.length === 0
    ? pass
    : read(boardScope(board, boards, tasks, outputs, texts));
}

/** The trees a save writes: a line left as printed keeps the tree it was read from. */
export function commit(
  draft: LeaderboardsDraft,
  catalogue: Catalogue,
  tasks: readonly string[],
  outputs: readonly string[],
): LeaderboardsDraft {
  return {
    ...draft,
    boards: draft.boards.map((board) => {
      const read = boardReadings(board, draft.boards, tasks, outputs, catalogue);
      return {
        ...board,
        columns: board.columns.map((column) => {
          const printed =
            column.tree === null
              ? ''
              : printFormula(column.tree, catalogue, 'leaderboard');
          if (lineOf(column, catalogue) === printed) return { ...column, line: null };
          return { ...column, line: null, tree: read[column.key]?.tree ?? null };
        }),
      };
    }),
  };
}

function snapshot(draft: LeaderboardsDraft) {
  return {
    boards: draft.boards.map((board) => ({
      key: board.key,
      title: board.title,
      who: board.who,
      rows: board.rows,
      top: board.top,
      columns: board.columns.map((column) => ({
        name: column.name,
        tree: column.tree,
      })),
      sort: board.sort,
      display: board.display,
    })),
    hold: {
      on: draft.hold.on,
      from: draft.hold.from,
      untilStaff: draft.hold.untilStaff,
      until: draft.hold.until,
    },
  };
}

function sameBoards(before: LeaderboardsDraft, after: LeaderboardsDraft): boolean {
  return (
    JSON.stringify(snapshot(before).boards) === JSON.stringify(snapshot(after).boards)
  );
}

function sameHold(before: LeaderboardsDraft, after: LeaderboardsDraft): boolean {
  return JSON.stringify(snapshot(before).hold) === JSON.stringify(snapshot(after).hold);
}

function boardValue(board: BoardDraft): Record<string, unknown> {
  const value: Record<string, unknown> = {
    columns: Object.fromEntries(
      board.columns.flatMap((column) =>
        column.name === '' || column.tree === null
          ? []
          : [[column.name, formulaYaml(column.tree)]],
      ),
    ),
  };
  if (board.title !== '') value['title'] = board.title;
  if (board.who !== 'staff' || board.rows !== 'all') {
    value['audience'] = {
      who: board.who,
      rows: board.rows === 'top' ? numberText(board.top) : board.rows,
    };
  }
  if (board.sort.length > 0) {
    value['sort'] = board.sort.map((item) => ({ [item.name]: item.way }));
  }
  if (board.display.length > 0) {
    value['display'] = board.display.map((item) =>
      item.places === ''
        ? item.name
        : { [item.name]: { places: numberText(item.places) } },
    );
  }
  return value;
}

function holdValue(hold: HoldDraft): { from: Time; until: Time | string } | undefined {
  if (!hold.on) return undefined;
  const from = isoOf(hold.from);
  const until = hold.untilStaff ? 'staff' : isoOf(hold.until);
  if (from === undefined || until === undefined) return undefined;
  return { from: new Time(from), until: until === 'staff' ? 'staff' : new Time(until) };
}

/** Write the leaderboards when they changed. A list in the file is left as stored. */
export function writeLeaderboards(
  doc: Doc,
  before: LeaderboardsDraft,
  after: LeaderboardsDraft,
): void {
  if (before.legacy || after.legacy || sameBoards(before, after)) return;
  if (doc.hasIn(['leaderboards'])) doc.deleteIn(['leaderboards']);
  if (after.boards.length === 0) return;
  const written: Record<string, unknown> = {};
  for (const board of after.boards) written[board.key] = boardValue(board);
  writeAt(doc, ['leaderboards'], written);
}

/** Write the hold when it changed. A hold that could not be read stays until it is set again. */
export function writeHold(
  doc: Doc,
  before: LeaderboardsDraft,
  after: LeaderboardsDraft,
): void {
  if ((before.hold.locked && !after.hold.on) || sameHold(before, after)) return;
  const value = holdValue(after.hold);
  if (value === undefined) {
    writeAt(doc, ['hold'], undefined, { prune: true });
    return;
  }
  // A time is written on its own path: a Time nested in a new mapping would
  // be stored as its fields rather than the time it names.
  if (doc.hasIn(['hold'])) doc.deleteIn(['hold']);
  writeAt(doc, ['hold'], {});
  writeAt(doc, ['hold', 'from'], value.from);
  writeAt(doc, ['hold', 'until'], value.until);
}

function keyProblem(
  key: string,
  keys: readonly string[],
  tasks: readonly string[],
): string | null {
  if (key === '') return 'Give the leaderboard a key.';
  if (!KEY.test(key)) {
    return (
      `'${key}' cannot be used as a name. Use only lower case letters, digits, hyphens (-) ` +
      'and underscores (_), starting with a letter or a digit.'
    );
  }
  if (key.length > KEY_MAX) {
    return `'${key}' is longer than ${String(KEY_MAX)} characters. Choose a shorter name.`;
  }
  if (keys.filter((item) => item === key).length > 1)
    return 'Another leaderboard has this key.';
  if (tasks.includes(key)) {
    return (
      `${key} is a task of the contest, and tasks and leaderboards share one set of names, ` +
      'so a column can read either. Name the leaderboard otherwise.'
    );
  }
  return null;
}

function columnNameProblem(name: string, names: readonly string[]): string | null {
  if (name === '') return 'Give the column a name.';
  const problem = nameProblem(name);
  if (problem !== null) return problem;
  if (name.length > COLUMN_MAX) {
    return (
      `'${name}' cannot be a column's name. Use at most ${String(COLUMN_MAX)} lower case ` +
      'letters, digits and underscores (_), starting with a letter.'
    );
  }
  if (names.filter((item) => item === name).length > 1)
    return 'Another column has this name.';
  return null;
}

function placesProblem(places: string): string | null {
  if (places === '') return null;
  return /^([0-9]|10)$/.test(places)
    ? null
    : 'Give a number of decimal places from 0 to 10.';
}

/**
 * What the editor refuses before a save. A formula's kind comes from reading
 * its line: a pick is not shown or sorted, a text column is not sorted, and
 * every sort column is displayed.
 */
export function problems(
  draft: LeaderboardsDraft,
  catalogue: Catalogue | null,
  tasks: readonly string[],
  outputs: readonly string[],
  now: number,
  start: unknown,
  end: unknown,
): FieldProblem[] {
  if (draft.legacy) return [];
  const found: FieldProblem[] = [];
  const keys = draft.boards.map((board) => board.key);
  for (const board of draft.boards) {
    const key = keyProblem(board.key, keys, tasks);
    if (key !== null) found.push({ field: `${board.key}.key`, message: key });
    if (board.who === 'everyone' && board.rows === 'own') {
      found.push({ field: `${board.key}.audience.rows`, message: OWN_EVERYONE });
    }
    if (board.rows === 'top' && !/^[1-9]\d*$/.test(board.top)) {
      found.push({
        field: `${board.key}.audience.rows`,
        message: 'Give how many rows, at least 1.',
      });
    }
    if (board.columns.length === 0) {
      found.push({
        field: `${board.key}.columns`,
        message: 'Give the leaderboard a column.',
      });
    }
    const names = board.columns.map((column) => column.name);
    const readings =
      catalogue === null
        ? {}
        : boardReadings(board, draft.boards, tasks, outputs, catalogue);
    const kindOf = new Map<string, Kind>();
    for (const column of board.columns) {
      const field = columnField(board.key, column);
      const name = columnNameProblem(column.name, names);
      if (name !== null) found.push({ field, message: name });
      const line = lineOf(column, catalogue);
      const reading = readings[column.key];
      // The line is the tree's print, which needs the catalogue. Until it
      // loads, a saved formula is not empty.
      if (catalogue !== null && line.trim() === '') {
        found.push({ field, message: 'Give a formula.' });
      } else if (reading !== undefined) {
        if (reading.unread !== null)
          found.push({ field, message: reading.unread.message });
        for (const problem of reading.problems)
          found.push({ field, message: problem.message });
        if (reading.kind !== null) kindOf.set(column.name, reading.kind);
      }
    }
    const shown = new Set(board.display.map((item) => item.name));
    for (const item of board.sort) {
      const column = board.columns.find((entry) => entry.name === item.name);
      const kind = kindOf.get(item.name);
      if (column === undefined) {
        found.push({
          field: `${board.key}.sort`,
          message: 'Choose a column of this leaderboard.',
        });
      }
      if (column !== undefined && kind === 'text') {
        found.push({
          field: columnField(board.key, column),
          message: 'A text column is not used to order the rows.',
        });
      }
      if (kind === 'pick') {
        found.push({
          field: `${board.key}.sort`,
          message: 'A pick is not used to order the rows.',
        });
      }
      if (!shown.has(item.name)) {
        found.push({
          field: `${board.key}.sort`,
          message: `Display ${item.name}. The rows are ordered by it.`,
        });
      }
    }
    for (const item of board.display) {
      const kind = kindOf.get(item.name);
      if (kind === 'pick') {
        found.push({ field: `${board.key}.display`, message: 'A pick is not shown.' });
      }
      if (kind === 'text' && item.places !== '') {
        found.push({
          field: `${board.key}.display`,
          message: 'A text column is shown as given.',
        });
      }
      const places =
        kind === 'number' || kind === undefined ? placesProblem(item.places) : null;
      if (places !== null)
        found.push({ field: `${board.key}.display`, message: places });
    }
  }
  found.push(...holdProblems(draft.hold, now, start, end));
  return found;
}

function holdProblems(
  hold: HoldDraft,
  now: number,
  start: unknown,
  end: unknown,
): FieldProblem[] {
  if (!hold.on) return [];
  const found: FieldProblem[] = [];
  const from = isoOf(hold.from);
  if (from === undefined) {
    found.push({ field: 'hold.from', message: 'Give the time the hold starts.' });
    return found;
  }
  const fromAt = new Date(from).getTime();
  if (fromAt <= now) {
    found.push({
      field: 'hold.from',
      message: 'That time has passed. Give a time still to come.',
    });
  }
  const opened = instantOf(start);
  const closed = instantOf(end);
  if (opened !== null && closed !== null && (fromAt <= opened || fromAt >= closed)) {
    found.push({
      field: 'hold.from',
      message: 'The hold starts after the contest opens and before it ends.',
    });
  }
  if (hold.untilStaff) return found;
  const until = isoOf(hold.until);
  if (until === undefined) {
    found.push({ field: 'hold.until', message: 'Give the time the hold runs until.' });
  } else if (new Date(until).getTime() <= fromAt) {
    found.push({ field: 'hold.until', message: 'The hold ends before it starts.' });
  }
  return found;
}
