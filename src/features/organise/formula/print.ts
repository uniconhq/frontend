import type { Catalogue } from './catalogue';
import type { Where } from './parse';
import { written, type Tree } from './tree';

const SYMBOL: Record<string, string> = {
  add: '+',
  sub: '-',
  mul: '*',
  div: '/',
  lt: '<',
  le: '<=',
  gt: '>',
  ge: '>=',
  eq: '==',
  ne: '!=',
  and: 'and',
  or: 'or',
};

const PREC: Record<string, number> = {
  or: 1,
  and: 2,
  not: 3,
  lt: 4,
  le: 4,
  gt: 4,
  ge: 4,
  eq: 4,
  ne: 4,
  add: 5,
  sub: 5,
  mul: 6,
  div: 6,
};

const COMPARE = 4;
const UNARY = 7;
const CHAINS = new Set(['add', 'mul', 'and', 'or']);

type RecordTree = { [key: string]: Tree | Tree[] | undefined };

function asTree(value: Tree | Tree[] | undefined): Tree {
  return value === undefined || Array.isArray(value) ? null : value;
}

function isRecord(tree: Tree): tree is RecordTree {
  return typeof tree === 'object' && tree !== null;
}

/**
 * A block tree as a line. Brackets come back only where the nesting would
 * otherwise flatten, a fold's `over` and `of` print as `group.column`, and
 * a name's `-` prints as `_`, as a formula reads it.
 */
export function printFormula(tree: Tree, catalogue: Catalogue, where: Where): string {
  return print(tree, 0, false, catalogue, where);
}

function print(
  tree: Tree,
  parent: number,
  right: boolean,
  catalogue: Catalogue,
  where: Where,
): string {
  if (tree === null) return '?';
  if (typeof tree === 'string') return tree;
  if (typeof tree.block === 'string')
    return printCall(tree, parent, right, catalogue, where);
  const leaf = leafOf(tree, parent, catalogue, where);
  if (leaf !== null) return leaf;
  const keys = Object.keys(tree);
  return `{${keys
    .map(
      (key) =>
        `${bare(key) || NUMBER.test(key) ? key : `"${key}"`}: ${print(asTree(tree[key]), 0, false, catalogue, where)}`,
    )
    .join(', ')}}`;
}

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const NUMBER = /^\d+(\.\d+)?$/;

/** Whether a formula reads `text` written bare as that name. */
function bare(text: string): boolean {
  return NAME.test(text) && text !== 'and' && text !== 'or' && text !== 'not';
}

function leafOf(
  tree: RecordTree,
  parent: number,
  catalogue: Catalogue,
  where: Where,
): string | null {
  const keys = Object.keys(tree);
  if (keys.length !== 1 || keys[0] === undefined) return null;
  const key = keys[0];
  const value = tree[key];
  if (key === 'text' && typeof value === 'string') return `"${value}"`;
  if (
    (key === 'value' ||
      key === 'fact' ||
      key === 'runs' ||
      key === 'results' ||
      key === 'name') &&
    typeof value === 'string'
  )
    return written(value);
  if (key === 'column' && typeof value === 'string') return written(value);
  if (
    key === 'column' &&
    Array.isArray(value) &&
    typeof value[0] === 'string' &&
    typeof value[1] === 'string'
  )
    return `${written(value[0])}.${written(value[1])}`;
  if ((key === 'run' || key === 'value') && Array.isArray(value)) {
    const [record, column] = value;
    const field =
      typeof column === 'string'
        ? written(column)
        : print(column ?? null, 0, false, catalogue, where);
    if (typeof record === 'string') return `${written(record)}.${field}`;
    return `${print(record ?? null, parent, false, catalogue, where)}.${field}`;
  }
  return null;
}

function printCall(
  tree: RecordTree,
  parent: number,
  right: boolean,
  catalogue: Catalogue,
  where: Where,
): string {
  const block = tree.block;
  if (typeof block !== 'string') return '';
  const symbol = SYMBOL[block];
  const of = tree.of;
  // `0 - x` is how a line's `-x` is stored, so it prints back as `-x`, which
  // binds tighter than any operator.
  if (block === 'sub' && Array.isArray(of) && of.length === 2 && of[0] === '0')
    return `-${print(of[1] ?? null, UNARY, false, catalogue, where)}`;
  if (symbol !== undefined && Array.isArray(of)) {
    const prec = PREC[block] ?? 0;
    const text = of
      .map((child, index) => {
        // A chain is one block of many inputs, so the same block nested in
        // one keeps its brackets, or it would read back flattened.
        const nested =
          CHAINS.has(block) &&
          typeof child === 'object' &&
          child !== null &&
          child.block === block;
        return print(child, nested ? prec + 1 : prec, index > 0, catalogue, where);
      })
      .join(` ${symbol} `);
    // A comparison reads one at most, so one inside another keeps brackets;
    // otherwise a left input of the same precedence needs none.
    const bracket = parent > prec || (parent === prec && (right || prec === COMPARE));
    return bracket ? `(${text})` : text;
  }
  if (block === 'not') {
    const inner = Array.isArray(of) ? (of[0] ?? null) : asTree(of);
    const text = `not ${print(inner, PREC.not ?? 3, false, catalogue, where)}`;
    return parent > (PREC.not ?? 3) ? `(${text})` : text;
  }
  return `${block}(${argumentsOf(tree, block, catalogue, where)})`;
}

function argumentsOf(
  node: RecordTree,
  block: string,
  catalogue: Catalogue,
  where: Where,
): string {
  const forms = catalogue.blocks.find((item) => item.name === block)?.forms ?? [];
  const present = Object.keys(node).filter((key) => key !== 'block');
  const form = forms.find(
    (item) =>
      (item.scope === 'both' || item.scope === where) &&
      present.every((key) => Object.hasOwn(item.inputs, key)),
  );
  const order = form === undefined ? present : Object.keys(form.inputs);
  const parts: string[] = [];
  let gap = false;
  let folded = false;
  for (const key of order) {
    if (folded && key === 'of') continue;
    const value = node[key];
    if (value === undefined) {
      gap = true;
      continue;
    }
    const short =
      (key === 'over' || key === 'from') && node.of !== undefined
        ? shorthand(value, node.of)
        : null;
    if (short !== null) {
      parts.push(short);
      folded = true;
      continue;
    }
    const kind = form?.inputs[key]?.kind;
    // A program or a language is plain text: quoted unless it reads as a name.
    const plain =
      (kind === 'path' || kind === 'language') && typeof value === 'string'
        ? bare(value)
          ? value
          : `"${value}"`
        : null;
    const text =
      plain ??
      (Array.isArray(value)
        ? value.map((child) => print(child, 0, false, catalogue, where)).join(', ')
        : print(value, 0, false, catalogue, where));
    // A bound or a limit, a number written out, is named, so
    // `entered(at_least: 0, at_most: 1)` says which is which.
    const named = gap || form?.inputs[key]?.plain === true;
    parts.push(named ? `${key}: ${text}` : text);
  }
  return parts.join(', ');
}

function shorthand(over: Tree | Tree[], of: Tree | Tree[]): string | null {
  if (Array.isArray(over) || Array.isArray(of) || !isRecord(over) || !isRecord(of))
    return null;
  const group =
    typeof over.runs === 'string'
      ? over.runs
      : typeof over.results === 'string'
        ? over.results
        : null;
  const pair = Array.isArray(of.run)
    ? of.run
    : Array.isArray(of.value)
      ? of.value
      : null;
  if (
    group === null ||
    pair === null ||
    pair[0] !== group ||
    typeof pair[1] !== 'string'
  )
    return null;
  return `${written(group)}.${written(pair[1])}`;
}
