import type { Catalogue } from '../formula/catalogue';
import { readLine, sameTree, type FormulaScope, type Reading } from '../formula/parse';
import { printFormula } from '../formula/print';
import { written, type Tree } from '../formula/tree';
import {
  exactAt,
  exactJS,
  isRecord,
  numberText,
  parseYaml,
  renameKeys,
  textOf,
  Time,
  writeAt,
  type Doc,
} from '../forms/yaml-doc';
import { instantOf, isoOf, localOf } from '../forms/times';
import { formulaYaml, treeOf } from '../task/scoring-model';

/**
 * A leaderboard as the editor holds it. The file stores a mapping of key to
 * leaderboard. A column's `line` is what the organiser typed; null means the
 * line is the tree's print.
 */

/** Who a leaderboard is shown to, and which rows they are given. */
export type Who = 'staff' | 'entrants' | 'everyone';
export type RowsKind = 'all' | 'own' | 'top';

export type ColumnDraft = {
  /** Stable while the name is typed. */
  key: string;
  name: string;
  /**
   * The name the board's sort and display still give the column while its
   * name is typed; they follow once the name is done and no other column's.
   */
  moved?: string;
  line: string | null;
  tree: Tree | null;
};

export type SortDraft = { name: string; way: 'desc' | 'asc' };
export type ShowDraft = { name: string; decimals: string };

export type BoardDraft = {
  id: string;
  key: string;
  title: string;
  saved: boolean;
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
};

export type FieldProblem = { field: string; message: string };

/** A leaderboard key is a task handle: the save refuses a longer one. */
const KEY_MAX = 24;

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

export function blankColumn(
  taken: readonly string[],
  start = taken.length + 1,
): ColumnDraft {
  let n = start;
  const occupied = new Set(taken.map(written));
  while (occupied.has(`column_${String(n)}`)) n += 1;
  return { key: nextId('column'), name: `column_${String(n)}`, line: null, tree: '1' };
}

/** A new leaderboard: staff's, one number column, ordered by it. */
export function blankBoard(taken: readonly string[]): BoardDraft {
  const key = keyFromName('', taken);
  return {
    id: nextId('board'),
    key,
    title: '',
    saved: false,
    who: 'staff',
    rows: 'all',
    top: '10',
    columns: [{ key: nextId('column'), name: 'points', line: null, tree: '1' }],
    sort: [{ name: 'points', way: 'desc' }],
    display: [{ name: 'points', decimals: '' }],
  };
}

/** A readable key made once while a leaderboard is new. */
export function keyFromName(name: string, taken: readonly string[]): string {
  let base = name
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
  if (base === '') base = 'leaderboard';
  if (/^[0-9_]/.test(base)) base = `board_${base}`;
  base = base.slice(0, KEY_MAX);
  const occupied = new Set(taken.map(written));
  let key = base;
  let suffix = 2;
  while (occupied.has(key)) {
    const end = `_${String(suffix)}`;
    key = base.slice(0, KEY_MAX - end.length) + end;
    suffix += 1;
  }
  return key;
}

export function withBoardName(
  board: BoardDraft,
  title: string,
  taken: readonly string[],
): BoardDraft {
  return {
    ...board,
    title,
    key: board.saved
      ? board.key
      : keyFromName(title, [...taken, ...board.columns.map((column) => column.name)]),
  };
}

export function audienceSentence(who: Who, rows: RowsKind, top: string): string {
  if (who === 'staff') return 'Only organisers see this leaderboard, every row of it.';
  if (who === 'entrants') {
    if (rows === 'own')
      return 'Each entrant sees only their own row, with no place. Organisers always see every row, ranked.';
    if (rows === 'top')
      return `Entrants see the top ${top} rows, and their own row when it is lower. Organisers always see every row.`;
    return 'Entrants see every row, ranked. Organisers always see every row.';
  }
  if (rows === 'top')
    return `Anyone sees the top ${top} rows; a signed-in entrant also sees their own row when it is lower. Organisers always see every row.`;
  return 'Anyone, signed in or not, sees every row, ranked. Organisers always see every row.';
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
    if (typeof item === 'string') return [{ name: item, decimals: '' }];
    if (!isRecord(item)) return [];
    const entries = Object.entries(item);
    const first = entries[0];
    if (entries.length !== 1 || first === undefined) return [];
    const [name, how] = first;
    const decimals = isRecord(how) ? textOf(how['decimals']) : '';
    return [{ name, decimals: /^([0-9]|10)$/.test(decimals) ? decimals : '' }];
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
    saved: true,
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

/** The leaderboards and the hold as the form edits them. */
export function readLeaderboards(doc: Doc): LeaderboardsDraft {
  const node = exactJS(doc);
  const root = isRecord(node) ? node : {};
  const boards = root['leaderboards'];
  return {
    boards: isRecord(boards)
      ? Object.entries(boards).map(([key, value]) => readBoard(key, value))
      : [],
    hold: readHold(root['hold']),
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

/** A value a task gives, as a leaderboard reads it: by name, and whether it is text. */
export type GivenValue = { name: string; text: boolean };

/**
 * What each task the contest lists gives a leaderboard, by task id; null for
 * a task whose settings cannot be read, whose values are then not known.
 */
export type TaskGives = Readonly<Record<string, readonly GivenValue[] | null>>;

/**
 * The values a task's settings give, the names under `scoring.values`, as
 * `t.v` on a leaderboard reads them. Whether one gives text is `text`, the
 * names the task's workflow form says do; a formula is not read to guess.
 * Null when the settings cannot be read as YAML, or when `text` is null
 * because the form does not know, so the values are not known.
 */
export function givenValues(
  content: string,
  text: ReadonlySet<string> | null,
): GivenValue[] | null {
  const parsed = parseYaml(content);
  if ('error' in parsed) return null;
  const top = exactJS(parsed.doc);
  if (!isRecord(top) || !isRecord(top['scoring'])) return [];
  const values = top['scoring']['values'];
  if (!isRecord(values)) return [];
  if (text === null) return null;
  return Object.keys(values).map((name) => ({ name, text: text.has(name) }));
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

/**
 * What a leaderboard's formulas may name: its columns; each task's results,
 * and on each of them, `t.v`, the values the task gives and the facts a
 * leaderboard reads (`leaderboard_facts`), as the forge resolves them; and
 * the other leaderboards' columns.
 */
export function boardScope(
  board: BoardDraft,
  boards: readonly BoardDraft[],
  tasks: readonly string[],
  gives: TaskGives,
  facts: readonly string[],
  texts: readonly string[],
): FormulaScope {
  const fields: Record<string, 'number' | 'text'> = {};
  for (const fact of facts) fields[fact] = 'number';
  // A formula writes each `-` of a task, a leaderboard or a column as `_`;
  // the scope holds the written names and the real ones they stand for.
  const real: Record<string, string> = {};
  const write = (name: string): string => {
    const text = written(name);
    if (text !== name) real[text] ??= name;
    return text;
  };
  const each: string[] = [];
  const textValues: string[] = [];
  const sets = tasks.map(write);
  const unread = sets.filter((task) => gives[real[task] ?? task] === null);
  for (const task of sets) {
    for (const value of gives[real[task] ?? task] ?? []) {
      fields[value.name] ??= value.text ? 'text' : 'number';
      each.push(`${task}.${value.name}`);
      if (value.text) textValues.push(`${task}.${value.name}`);
    }
    for (const fact of facts) each.push(`${task}.${fact}`);
  }
  const others = boards.filter((item) => item.key !== '' && item.key !== board.key);
  for (const other of others) {
    for (const column of other.columns) {
      const pair = `${written(other.key)}.${written(column.name)}`;
      if (column.name !== '' && pair !== `${other.key}.${column.name}`)
        real[pair] ??= `${other.key}.${column.name}`;
    }
  }
  return {
    where: 'leaderboard',
    names: board.columns
      .map((column) => column.name)
      .filter((name) => name !== '')
      .map(write),
    each,
    sets,
    unread,
    boards: others.map((item) => write(item.key)),
    boardColumns: Object.fromEntries(
      others.map((item) => [
        written(item.key),
        item.columns
          .filter((column) => column.name !== '')
          .map((column) => written(column.name)),
      ]),
    ),
    texts: [...texts.map(written), ...textValues],
    fields,
    real,
  };
}

export function boardReadings(
  board: BoardDraft,
  boards: readonly BoardDraft[],
  tasks: readonly string[],
  gives: TaskGives,
  catalogue: Catalogue,
): Record<string, Reading> {
  const facts = catalogue.leaderboard_facts;
  const first = boardScope(board, boards, tasks, gives, facts, []);
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
    : read(boardScope(board, boards, tasks, gives, facts, texts));
}

/** The trees a save writes: a line left as printed keeps the tree it was read from. */
export function commit(
  draft: LeaderboardsDraft,
  catalogue: Catalogue,
  tasks: readonly string[],
  gives: TaskGives,
): LeaderboardsDraft {
  return {
    ...draft,
    boards: draft.boards.map((board) => {
      const read = boardReadings(board, draft.boards, tasks, gives, catalogue);
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
  // Only what differs from the defaults, staff and every row, is written.
  if (board.who !== 'staff' || board.rows !== 'all') {
    const audience: Record<string, unknown> = {};
    if (board.who !== 'staff') audience['who'] = board.who;
    if (board.rows !== 'all')
      audience['rows'] = board.rows === 'top' ? numberText(board.top) : board.rows;
    value['audience'] = audience;
  }
  if (board.sort.length > 0) {
    value['sort'] = board.sort.map((item) => ({ [item.name]: item.way }));
  }
  if (board.display.length > 0) {
    value['display'] = board.display.map((item) =>
      item.decimals === ''
        ? item.name
        : { [item.name]: { decimals: numberText(item.decimals) } },
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

/** Write the leaderboards when they changed. */
export function writeLeaderboards(
  doc: Doc,
  before: LeaderboardsDraft,
  after: LeaderboardsDraft,
): void {
  if (sameBoards(before, after)) return;
  // Leaderboards stored as anything but a mapping are written fresh.
  if (after.boards.length === 0 || !isRecord(exactAt(doc, ['leaderboards']))) {
    writeAt(doc, ['leaderboards'], undefined);
    if (after.boards.length === 0) return;
  }
  // Each leaderboard is written over its own entry, key by key, so a board
  // or a column left as it was keeps its place, its style and its comments,
  // and a renamed one is renamed where it stands.
  const kept = new Set(after.boards.map((board) => board.id));
  for (const old of before.boards) {
    if (!kept.has(old.id)) writeAt(doc, ['leaderboards', old.key], undefined);
  }
  // Every rename lands at once, so a chain or a swap of keys is kept.
  const was = new Map(before.boards.map((board) => [board.id, board]));
  renameKeys(
    doc,
    ['leaderboards'],
    new Map(
      after.boards.flatMap((board) => {
        const old = was.get(board.id);
        return old === undefined ? [] : [[old.key, board.key] as const];
      }),
    ),
  );
  for (const board of after.boards) {
    const old = was.get(board.id);
    if (old !== undefined) {
      const named = new Map(
        board.columns.map((column) => [column.key, column.name] as const),
      );
      renameKeys(
        doc,
        ['leaderboards', board.key, 'columns'],
        new Map(
          old.columns.flatMap((column) => {
            const name = named.get(column.key);
            return column.name !== '' && name !== undefined && name !== ''
              ? [[column.name, name] as const]
              : [];
          }),
        ),
        new Set(
          old.columns
            .filter((column) => !named.get(column.key))
            .map((column) => column.name),
        ),
      );
      if (JSON.stringify(boardValue(old)) === JSON.stringify(boardValue(board)))
        continue;
    }
    const value = boardValue(board);
    // An audience written as it stands, such as `{who: staff}`, stays so.
    const stored = exactAt(doc, ['leaderboards', board.key, 'audience']);
    if (
      old !== undefined &&
      stored !== undefined &&
      old.who === board.who &&
      old.rows === board.rows &&
      (board.rows !== 'top' || old.top === board.top)
    )
      value['audience'] = stored;
    writeAt(doc, ['leaderboards', board.key], value);
  }
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

/**
 * What the editor refuses before a save: what the file has no place for,
 * and what the formula line cannot be read as. The forge checks the rest.
 */
export function problems(
  draft: LeaderboardsDraft,
  catalogue: Catalogue | null,
  tasks: readonly string[],
  gives: TaskGives,
): FieldProblem[] {
  const found: FieldProblem[] = [];
  const keys = draft.boards.map((board) => board.key);
  for (const board of draft.boards) {
    if (keys.filter((item) => item === board.key).length > 1)
      found.push({
        field: `${board.key}.key`,
        message: 'Another leaderboard has this key.',
      });
    const names = board.columns.map((column) => column.name);
    const readings =
      catalogue === null
        ? {}
        : boardReadings(board, draft.boards, tasks, gives, catalogue);
    for (const column of board.columns) {
      const field = columnField(board.key, column);
      if (column.name === '') found.push({ field, message: 'Give the column a name.' });
      else if (names.filter((item) => item === column.name).length > 1)
        found.push({ field, message: 'Another column has this name.' });
      const line = lineOf(column, catalogue);
      const reading = readings[column.key];
      // The line is the tree's print, which needs the catalogue. Until it
      // loads, a saved formula is not empty.
      if (catalogue !== null && line.trim() === '') {
        found.push({ field, message: 'Give a formula.' });
      } else if (reading !== undefined) {
        // A line left as printed saves the tree it was read from. When it
        // does not read back to that tree, its problems are not the stored
        // tree's: the forge checks that tree at the save.
        const misread =
          catalogue !== null &&
          column.tree !== null &&
          line === printFormula(column.tree, catalogue, 'leaderboard') &&
          !sameTree(reading.tree, column.tree);
        if (!misread) {
          if (reading.unread !== null)
            found.push({ field, message: reading.unread.message });
          for (const problem of reading.problems)
            found.push({ field, message: problem.message });
        }
      }
    }
  }
  if (draft.hold.on) {
    if (isoOf(draft.hold.from) === undefined)
      found.push({ field: 'hold.from', message: 'Give the time the freeze starts.' });
    if (!draft.hold.untilStaff && isoOf(draft.hold.until) === undefined)
      found.push({ field: 'hold.until', message: 'Give the time the freeze ends.' });
  }
  return found;
}
