import { isMap, isSeq, type Node } from 'yaml';
import { instantOf } from './times';
import { isRecord, parseYaml, writeAt, writeYaml, type Doc } from './yaml-doc';

/** An item of a keyed list, named by the value of its key: `tasks[sum]`. */
type ItemStep = { key: string; value: string };

/**
 * Where a field sits: mapping keys, and items of keyed lists named by their
 * key, never by their place, so a path names the same item on both sides
 * whatever order each side holds the list in.
 */
export type MergePath = (string | ItemStep)[];

/**
 * One field the organiser's version and the current version disagree on.
 * `undefined` is a field one of them does not have. `base` is the field as the
 * organiser read it, which says who changed it: a field only the other side
 * changed is theirs to keep, one the organiser changed is the organiser's.
 *
 * - `field`: a value at the path: a scalar, or a whole mapping or list.
 * - `item`: an item of a keyed list that one side has and the other does not;
 *   the values are the whole item. `before` is the keys ahead of it in the
 *   organiser's list, nearest last, which says where it goes back in.
 * - `order`: the order of a keyed list, as the keys both sides hold; `key`
 *   is the key its items are named by.
 */
export type FieldDiff = {
  path: MergePath;
  kind: 'field' | 'item' | 'order';
  base: unknown;
  mine: unknown;
  theirs: unknown;
  before?: string[];
  key?: string;
};

export type Side = 'mine' | 'theirs';

/**
 * What the merge knows of a definition file. `keyed` names each list whose
 * items have an identity, by the list's path (`[]` for an item of a keyed
 * list above it), and the key that names an item. `adminOnly` is the file's
 * top-level keys only an admin may change (PROPOSAL section 10).
 */
type FileRules = {
  keyed: { list: string; key: string }[];
  adminOnly: string[];
};

const FILE_RULES: Record<string, FileRules> = {
  'contest.yaml': {
    keyed: [
      { list: 'tasks', key: 'id' },
      { list: 'leaderboards', key: 'name' },
    ],
    adminOnly: ['name', 'description', 'state', 'visibility', 'registration'],
  },
  'task.yaml': { keyed: [], adminOnly: ['name', 'submissions'] },
};

function rulesOf(file: string): FileRules {
  return FILE_RULES[file] ?? { keyed: [], adminOnly: [] };
}

/** Equal as the file means them: two times naming the same moment are one. */
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === 'string' && typeof b === 'string') {
    const at = instantOf(a);
    return at !== null && at === instantOf(b);
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => same(item, b[index]));
  }
  if (isRecord(a) && isRecord(b)) {
    const keys = Object.keys(a);
    return (
      keys.length === Object.keys(b).length &&
      keys.every((key) => Object.hasOwn(b, key) && same(a[key], b[key]))
    );
  }
  return false;
}

/** A path's shape, the form a keyed-list rule names it by: `leaderboards[].tasks`. */
function shapeOf(path: MergePath): string {
  return path
    .map((step, index) =>
      typeof step === 'string' ? (index === 0 ? step : `.${step}`) : '[]',
    )
    .join('');
}

/** An item's key as text, or null when it has none a list could be keyed by. */
function keyText(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return null;
}

/** A list's items by their key, or null when an item has no key or shares one. */
function itemsByKey(list: unknown, key: string): Map<string, unknown> | null {
  if (!Array.isArray(list)) return null;
  const items = new Map<string, unknown>();
  for (const item of list) {
    const value = isRecord(item) ? keyText(item[key]) : null;
    if (value === null || items.has(value)) return null;
    items.set(value, item);
  }
  return items;
}

type Keyed = FileRules['keyed'];

function walk(
  path: MergePath,
  base: unknown,
  mine: unknown,
  theirs: unknown,
  keyed: Keyed,
): FieldDiff[] {
  if (same(mine, theirs)) return [];
  if (isRecord(mine) && isRecord(theirs)) {
    const baseMap = isRecord(base) ? base : {};
    const keys = [...Object.keys(theirs)];
    for (const key of Object.keys(mine)) if (!keys.includes(key)) keys.push(key);
    return keys.flatMap((key) =>
      walk([...path, key], baseMap[key], mine[key], theirs[key], keyed),
    );
  }
  const rule = keyed.find((candidate) => candidate.list === shapeOf(path));
  if (rule !== undefined) {
    const mineItems = itemsByKey(mine, rule.key);
    const theirItems = itemsByKey(theirs, rule.key);
    if (mineItems !== null && theirItems !== null) {
      const baseItems = itemsByKey(base, rule.key) ?? new Map<string, unknown>();
      return keyedList(path, rule.key, baseItems, mineItems, theirItems, keyed);
    }
  }
  // A list whose items have no identity, or a keyed list one side holds
  // badly, is one field: its items cannot be matched without guessing.
  return [{ path, kind: 'field', base, mine, theirs }];
}

function keyedList(
  path: MergePath,
  key: string,
  base: Map<string, unknown>,
  mine: Map<string, unknown>,
  theirs: Map<string, unknown>,
  keyed: Keyed,
): FieldDiff[] {
  const diffs: FieldDiff[] = [];
  const both = (value: string) => mine.has(value) && theirs.has(value);
  const mineOrder = [...mine.keys()].filter(both);
  const theirOrder = [...theirs.keys()].filter(both);
  if (!same(mineOrder, theirOrder)) {
    diffs.push({
      path,
      kind: 'order',
      key,
      base: [...base.keys()].filter(both),
      mine: mineOrder,
      theirs: theirOrder,
    });
  }
  const mineKeys = [...mine.keys()];
  const keys = [...theirs.keys(), ...mineKeys.filter((value) => !theirs.has(value))];
  for (const value of keys) {
    const at: MergePath = [...path, { key, value }];
    const ours = mine.get(value);
    const now = theirs.get(value);
    const was = base.get(value);
    if (ours !== undefined && now !== undefined) {
      diffs.push(...walk(at, was, ours, now, keyed));
    } else {
      const index = mineKeys.indexOf(value);
      diffs.push({
        path: at,
        kind: 'item',
        base: was,
        mine: ours,
        theirs: now,
        before: index < 0 ? [] : mineKeys.slice(0, index),
      });
    }
  }
  return diffs;
}

/**
 * Every field the two versions disagree on. Mappings both sides have are
 * compared key by key, and keyed lists (the file's rules) item by item, each
 * item matched by its key, with the list's order a field of its own. Any other
 * value, a list of no keyed kind among them, is one field.
 */
export function differences(
  base: unknown,
  mine: unknown,
  theirs: unknown,
  file = '',
): FieldDiff[] {
  return walk([], base, mine, theirs, rulesOf(file).keyed);
}

/** Whether one side changed the field since the organiser read it. */
function changedBy(diff: FieldDiff, side: Side): boolean {
  if (diff.kind !== 'order') return !same(diff.base, diff[side]);
  const base = diff.base as string[];
  const order = (diff[side] as string[]).filter((value) => base.includes(value));
  return !same(base, order);
}

/** The side a field starts on: the organiser's own change, else the current file. */
export function defaultSide(diff: FieldDiff): Side {
  return changedBy(diff, 'mine') ? 'mine' : 'theirs';
}

/** Whether both sides changed the field since the organiser read it. */
export function bothChanged(diff: FieldDiff): boolean {
  return changedBy(diff, 'mine') && changedBy(diff, 'theirs');
}

/** Whether only an admin may change the field, so a manager keeps the current one. */
export function adminOnly(diff: FieldDiff, file: string): boolean {
  const [top] = diff.path;
  return typeof top === 'string' && rulesOf(file).adminOnly.includes(top);
}

/** A path as the organiser reads one, each item by its key: `tasks[sum].due`. */
export function pathText(path: MergePath): string {
  return path
    .map((step, index) =>
      typeof step !== 'string' ? `[${step.value}]` : index === 0 ? step : `.${step}`,
    )
    .join('');
}

/** The index of the item with the key in a list of the document, or -1. */
function indexIn(list: Node | undefined, step: ItemStep): number {
  if (!isSeq(list)) return -1;
  return list.items.findIndex(
    (item) => isMap(item) && keyText(item.get(step.key)) === step.value,
  );
}

/** A path as indices into the current document, or null when an item is not there. */
function resolve(doc: Doc, path: MergePath): (string | number)[] | null {
  const at: (string | number)[] = [];
  for (const step of path) {
    if (typeof step === 'string') {
      at.push(step);
      continue;
    }
    const index = indexIn(doc.getIn(at, true) as Node | undefined, step);
    if (index < 0) return null;
    at.push(index);
  }
  return at;
}

/** The list a keyed path's last item sits in, as indices, with the item's step. */
function listOf(doc: Doc, path: MergePath) {
  const step = path.at(-1);
  const at = resolve(doc, path.slice(0, -1));
  if (at === null || step === undefined || typeof step === 'string') return null;
  const list: unknown = doc.getIn(at, true);
  return isSeq(list) ? { list, step } : null;
}

function putItem(doc: Doc, diff: FieldDiff) {
  const found = listOf(doc, diff.path);
  if (found === null) return;
  const { list, step } = found;
  const index = indexIn(list, step);
  if (diff.mine === undefined) {
    if (index >= 0) list.items.splice(index, 1);
    return;
  }
  if (index >= 0) return;
  // Back in after the nearest item ahead of it in the organiser's list that
  // the current one holds, or first when there is none.
  let place = 0;
  for (const value of [...(diff.before ?? [])].reverse()) {
    const ahead = indexIn(list, { key: step.key, value });
    if (ahead >= 0) {
      place = ahead + 1;
      break;
    }
  }
  list.items.splice(place, 0, doc.createNode(diff.mine));
}

/** Put the items the order names into the places those items hold now, in its order. */
function putOrder(doc: Doc, diff: FieldDiff) {
  const at = resolve(doc, diff.path);
  const list: unknown = at === null ? undefined : doc.getIn(at, true);
  const { key } = diff;
  if (!isSeq(list) || key === undefined) return;
  const order = diff.mine as string[];
  const slots: number[] = [];
  const nodes = new Map<string, (typeof list.items)[number]>();
  list.items.forEach((item, index) => {
    const value = isMap(item) ? keyText(item.get(key)) : null;
    if (value !== null && order.includes(value)) {
      slots.push(index);
      nodes.set(value, item);
    }
  });
  const wanted = order.filter((value) => nodes.has(value));
  slots.forEach((slot, index) => {
    const node = nodes.get(wanted[index] ?? '');
    if (node !== undefined) list.items[slot] = node;
  });
}

/**
 * The current file with the organiser's version of every field they chose
 * over the current one, written into the current document so its comments and
 * every other field stay as the current file has them. Every item is found in
 * the current document by its key, so the current list's order does not
 * matter: fields first, then items taken out and put back in the organiser's
 * order, then the organiser's order of a list when they chose it.
 */
export function mergeText(
  currentText: string,
  diffs: FieldDiff[],
  choices: Side[],
): string {
  const parsed = parseYaml(currentText);
  if ('error' in parsed) return currentText;
  const { doc } = parsed;
  const chosen = diffs.filter((_, index) => choices[index] === 'mine');
  for (const diff of chosen) {
    if (diff.kind !== 'field') continue;
    const at = resolve(doc, diff.path);
    if (at !== null) writeAt(doc, at, diff.mine);
  }
  for (const diff of chosen) if (diff.kind === 'item') putItem(doc, diff);
  for (const diff of chosen) if (diff.kind === 'order') putOrder(doc, diff);
  return writeYaml(doc);
}
