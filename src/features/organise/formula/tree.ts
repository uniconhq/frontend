/**
 * A block tree as the forge stores it: a number is its exact text, a call is
 * `{block, ...inputs}`, and a leaf is one key (`value`, `text`, `run`, …).
 * `null` is the editor's `?`, which is not saved.
 */
export type Tree = string | null | { [key: string]: Tree | Tree[] | undefined };

export const NODE_LIMIT = 1000;
const DEPTH_LIMIT = 64;
const COLUMN_LIMIT = 100;

const UNREADABLE = new Set([
  'mod',
  'to',
  'in',
  'and',
  'xor',
  'or',
  'not',
  'true',
  'false',
  'null',
  'undefined',
]);

const VALUE_NAME = /^[a-z][a-z0-9_]*$/;

/**
 * Why `name` cannot name a value, a group or a column, in the forge's
 * sentence, or none when a formula would read it as a name. A `-` is read
 * as `_`.
 */
export function nameProblem(name: string): string | null {
  const read = name.replaceAll('-', '_');
  if (UNREADABLE.has(read)) {
    return (
      `${read} is a word a formula reads as an operator, so it can't name a value. ` +
      'Choose another name.'
    );
  }
  if (!VALUE_NAME.test(name)) {
    return (
      'A name may use only lower case letters, digits and underscores (_), ' +
      'starting with a letter, since a formula reads it.'
    );
  }
  return null;
}

function nodes(tree: Tree): number {
  if (tree === null || typeof tree === 'string') return 1;
  return (
    1 +
    Object.values(tree).reduce<number>((sum, child) => {
      if (child === undefined) return sum;
      return (
        sum +
        (Array.isArray(child)
          ? child.reduce((n, one) => n + nodes(one), 0)
          : nodes(child))
      );
    }, 0)
  );
}

function depth(tree: Tree): number {
  if (tree === null || typeof tree === 'string') return 1;
  const below = Object.values(tree).map((child) => {
    if (child === undefined) return 0;
    return Array.isArray(child) ? Math.max(0, ...child.map(depth)) : depth(child);
  });
  return 1 + Math.max(0, ...below);
}

/** Why a tree is past the size a value or a column may be, or none. */
export function limitProblem(tree: Tree): string | null {
  if (nodes(tree) > NODE_LIMIT)
    return `A formula has at most ${String(NODE_LIMIT)} parts.`;
  if (depth(tree) > DEPTH_LIMIT)
    return `A formula is at most ${String(DEPTH_LIMIT)} deep.`;
  return null;
}

/** Why a leaderboard has too many columns, or none. */
export function columnProblem(count: number): string | null {
  return count > COLUMN_LIMIT
    ? `A leaderboard has at most ${String(COLUMN_LIMIT)} columns.`
    : null;
}
