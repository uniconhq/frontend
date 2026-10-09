import { isSeq } from 'yaml';
import type { DefinitionError } from '@/api/types';
import {
  isRecord,
  nodeFor,
  numberOf,
  scalarOf,
  textOf,
  writeAt,
  type Doc,
} from './yaml-doc';

/**
 * One key a board ranks on, in turn: `points`, `penalty` with the minutes
 * each earlier attempt that does not count adds, or a value its tasks
 * report, by name.
 */
export type OrderKeyValues =
  | { kind: 'points' }
  | { kind: 'penalty'; perAttempt: string }
  | { kind: 'value'; name: string };

/**
 * A board of `contest.yaml` as fields, every one text so an empty one is
 * "not set" and its default applies. `tasks` null is every task.
 */
export type BoardValues = {
  /** Where the board sits in the file as read; null for one added in the form. */
  at: number | null;
  name: string;
  tasks: string[] | null;
  over: string;
  select: string;
  /** Empty is the default, points alone. */
  order: OrderKeyValues[];
  who: string;
  rows: string;
};

/** A board as the form starts one: named by the organiser, ranking points. */
export function newBoard(): BoardValues {
  return {
    at: null,
    name: '',
    tasks: null,
    over: '',
    select: '',
    order: [{ kind: 'points' }],
    who: '',
    rows: '',
  };
}

const EMPTY: BoardValues = { ...newBoard(), order: [] };

function orderKeyOf(item: unknown): OrderKeyValues | null {
  if (item === 'points') return { kind: 'points' };
  if (item === 'penalty') return { kind: 'penalty', perAttempt: '' };
  if (typeof item === 'string') return { kind: 'value', name: item };
  if (isRecord(item) && item['by'] === 'penalty') {
    const minutes = item['per_attempt'];
    if (minutes === undefined || typeof minutes === 'number') {
      return { kind: 'penalty', perAttempt: textOf(minutes) };
    }
  }
  return null;
}

function boardOf(entry: unknown, at: number): BoardValues | null {
  if (!isRecord(entry)) return null;
  const { tasks, order } = entry;
  if (tasks !== undefined && tasks !== null) {
    if (!Array.isArray(tasks) || !tasks.every((task) => typeof task === 'string')) {
      return null;
    }
  }
  if (order !== undefined && !Array.isArray(order)) return null;
  const keys = (order ?? []).map(orderKeyOf);
  if (!keys.every((key) => key !== null)) return null;
  const plain = ['name', 'over', 'select', 'who', 'rows'].map((key) => entry[key]);
  if (plain.some((value) => isRecord(value) || Array.isArray(value))) return null;
  return {
    at,
    name: textOf(entry['name']),
    tasks: Array.isArray(tasks) ? tasks : null,
    over: textOf(entry['over']),
    select: textOf(entry['select']),
    order: keys,
    who: textOf(entry['who']),
    rows: textOf(entry['rows']),
  };
}

/**
 * The boards the file holds, or null when `leaderboards` is something the
 * fields cannot show, which the text tab still edits.
 */
export function readBoards(value: unknown): BoardValues[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return null;
  const boards = value.map(boardOf);
  return boards.every((board) => board !== null) ? boards : null;
}

function orderItem(key: OrderKeyValues): unknown {
  if (key.kind === 'points') return 'points';
  if (key.kind === 'value') return key.name;
  const minutes = numberOf(key.perAttempt);
  return minutes === undefined ? 'penalty' : { by: 'penalty', per_attempt: minutes };
}

const text = (value: string) => (value === '' ? undefined : value);

/**
 * Write the boards that changed between `before` and `after`: the list in
 * its new shape first, each board read from the file keeping its node and
 * comments, then each board's fields that differ from what it was.
 */
export function writeBoards(
  doc: Doc,
  before: BoardValues[],
  after: BoardValues[],
): void {
  if (JSON.stringify(before) === JSON.stringify(after)) return;
  if (after.length === 0) {
    writeAt(doc, ['leaderboards'], undefined);
    return;
  }
  let list: unknown = doc.get('leaderboards', true);
  if (!isSeq(list)) {
    doc.set('leaderboards', doc.createNode([]));
    list = doc.get('leaderboards', true);
  }
  if (!isSeq(list)) return;
  const items = [...list.items];
  list.items = after.map((board) =>
    board.at === null ? doc.createNode({}) : items[board.at],
  );

  after.forEach((board, index) => {
    const was = before.find((old) => board.at !== null && old.at === board.at) ?? EMPTY;
    const field = (key: string) => ['leaderboards', index, key];
    const put = (key: string, from: string, to: string, as: (v: string) => unknown) => {
      if (from !== to) writeAt(doc, field(key), as(to));
    };
    put('name', was.name, board.name, text);
    if (JSON.stringify(was.tasks) !== JSON.stringify(board.tasks)) {
      writeAt(doc, field('tasks'), board.tasks ?? undefined);
    }
    put('over', was.over, board.over, text);
    put('select', was.select, board.select, text);
    if (JSON.stringify(was.order) !== JSON.stringify(board.order)) {
      if (board.order.length === 0) writeAt(doc, field('order'), undefined);
      else
        doc.setIn(
          field('order'),
          nodeFor(doc, board.order.map(orderItem), { flow: true }),
        );
    }
    put('who', was.who, board.who, text);
    put('rows', was.rows, board.rows, scalarOf);
  });
}

/**
 * What a refused save said about the board at `index` of the list it sent,
 * by where under the board it points: `""` for the board itself, `name`,
 * `tasks`, `order.1`, `order.1.per_attempt` and so on. A refusal under a
 * list item names the item, as `tasks.0`.
 */
export function boardRefusals(
  errors: DefinitionError[],
  index: number,
): Map<string, string[]> {
  const prefix = `leaderboards[${String(index)}]`;
  const found = new Map<string, string[]>();
  for (const error of errors) {
    if (error.path !== prefix && !error.path.startsWith(`${prefix}.`)) continue;
    const under = error.path
      .slice(prefix.length)
      .replace(/\[(\d+)\]/g, '.$1')
      .replace(/^\./, '');
    found.set(under, [...(found.get(under) ?? []), error.message]);
  }
  return found;
}

/** Why the board's own fields cannot be saved, or nothing when they can. */
export function boardProblems(board: BoardValues): string[] {
  return board.order.flatMap((key) => {
    if (key.kind === 'value') return key.name.trim() === '' ? ['Name the value.'] : [];
    if (key.kind !== 'penalty') return [];
    const minutes = numberOf(key.perAttempt);
    if (minutes === undefined) return [];
    return Number.isInteger(minutes) && minutes >= 0
      ? []
      : ['A whole number of minutes.'];
  });
}
