import { isRecord, parseYaml, writeAt, writeYaml, type Path } from './yaml-doc';

/**
 * One field the organiser's version and the current version disagree on.
 * `undefined` is a field one of them does not have. `base` is the field as the
 * organiser read it, which says who changed it: a field only the other side
 * changed is theirs to keep, one the organiser changed is the organiser's.
 */
export type FieldDiff = {
  path: Path;
  base: unknown;
  mine: unknown;
  theirs: unknown;
};

export type Side = 'mine' | 'theirs';

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => deepEqual(item, b[index]));
  }
  if (isRecord(a) && isRecord(b)) {
    const keys = Object.keys(a);
    return (
      keys.length === Object.keys(b).length &&
      keys.every((key) => Object.hasOwn(b, key) && deepEqual(a[key], b[key]))
    );
  }
  return false;
}

/** A list whose items hold fields of their own, compared item by item. */
function holdsFields(value: unknown[]): boolean {
  return value.some((item) => isRecord(item) || Array.isArray(item));
}

function walk(path: Path, base: unknown, mine: unknown, theirs: unknown): FieldDiff[] {
  if (deepEqual(mine, theirs)) return [];
  if (isRecord(mine) && isRecord(theirs)) {
    const baseMap = isRecord(base) ? base : {};
    const keys = [...Object.keys(theirs)];
    for (const key of Object.keys(mine)) if (!keys.includes(key)) keys.push(key);
    return keys.flatMap((key) =>
      walk([...path, key], baseMap[key], mine[key], theirs[key]),
    );
  }
  if (
    Array.isArray(mine) &&
    Array.isArray(theirs) &&
    (holdsFields(mine) || holdsFields(theirs))
  ) {
    const baseList = Array.isArray(base) ? base : [];
    const length = Math.max(mine.length, theirs.length);
    return Array.from({ length }, (_, index) =>
      walk([...path, index], baseList[index], mine[index], theirs[index]),
    ).flat();
  }
  return [{ path, base, mine, theirs }];
}

/**
 * Every field the two versions disagree on, as YAML paths into the files'
 * mappings and lists. A field is a scalar, a list of scalars, or a whole
 * mapping or list one side has and the other does not; mappings both sides
 * have, and lists of mappings, are compared field by field inside.
 */
export function differences(
  base: unknown,
  mine: unknown,
  theirs: unknown,
): FieldDiff[] {
  return walk([], base, mine, theirs);
}

/** The side a field starts on: the organiser's own change, else the current file. */
export function defaultSide(diff: FieldDiff): Side {
  return deepEqual(diff.base, diff.mine) ? 'theirs' : 'mine';
}

/** Whether both sides changed the field since the organiser read it. */
export function bothChanged(diff: FieldDiff): boolean {
  return !deepEqual(diff.base, diff.mine) && !deepEqual(diff.base, diff.theirs);
}

/** A path as the forge's errors write one: `tasks[1].due`. */
export function pathText(path: Path): string {
  return path
    .map((part, index) =>
      typeof part === 'number' ? `[${part}]` : index === 0 ? part : `.${part}`,
    )
    .join('');
}

function comparePaths(a: Path, b: Path): number {
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const x = a[index];
    const y = b[index];
    if (x === y) continue;
    if (typeof x === 'number' && typeof y === 'number') return x - y;
    return String(x) < String(y) ? -1 : 1;
  }
  return a.length - b.length;
}

/**
 * The current file with the organiser's version of every field they chose
 * theirs over, written into the current document so its comments and every
 * other field stay as the current file has them. Fields are written in path
 * order and removed in reverse, so a list's indices hold while it changes.
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
  const writes = chosen.filter((diff) => diff.mine !== undefined);
  const removals = chosen.filter((diff) => diff.mine === undefined);
  writes.sort((a, b) => comparePaths(a.path, b.path));
  removals.sort((a, b) => comparePaths(b.path, a.path));
  for (const diff of writes) writeAt(doc, diff.path, diff.mine);
  for (const diff of removals) writeAt(doc, diff.path, undefined);
  return writeYaml(doc);
}
