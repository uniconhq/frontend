/**
 * One formula as a tree, read from the line the organiser types. The line
 * is a small grammar of the blocks the catalogue gives (spec 14, 10.1);
 * printing puts brackets back only where the order would otherwise change.
 * A value gives a number or text (decision 18): a pick gives one run, or
 * one submission on a leaderboard, and `.` reads one of its columns. Each
 * node keeps where it sat in the line, so a problem can be underlined.
 */

/** Where a node sits in the line, as string offsets. */
type Span = { from: number; to: number };

export type FormulaNode = (
  | { kind: 'name'; name: string }
  | { kind: 'number'; text: string }
  | { kind: 'text'; text: string }
  | { kind: 'hole' }
  | { kind: 'op'; op: string; args: FormulaNode[] }
) & { span?: Span };

/** A task's values, or a leaderboard's columns. */
export type Where = 'task' | 'leaderboard';

export type FormulaScope = {
  where: Where;
  /** Names read as they are: a task's values and facts, a leaderboard's columns. */
  names: readonly string[];
  /**
   * One per run (a group's column, `sample_tests.passed`) or one per
   * submission (a task's value, `islands.total`): read only inside a fold or
   * a pick.
   */
  each: readonly string[];
  /** What a fold counts or a pick chooses from: a task's groups, a leaderboard's tasks. */
  sets: readonly string[];
  /** The names among `names` and `each` that are text, not numbers. */
  texts?: readonly string[];
  /** What `.` reads on a pick: a run's columns, or a submission's values. */
  fields?: Readonly<Record<string, 'number' | 'text'>>;
  /** What each name is, in words. */
  about?: Readonly<Record<string, string>>;
};

export type FormulaProblem = { span?: Span; message: string };

export type ParseResult =
  { ok: true; node: FormulaNode } | { ok: false; message: string; at: number };

export type Tray = 'fold' | 'pick' | 'maths' | 'test';

/**
 * What an input takes: a number, a number or text, a group (a task on a
 * leaderboard), or a value read for each run (each submission), where a
 * group's columns stand for the run being looked at.
 */
type Take = 'number' | 'any' | 'set' | 'each';

/** What a part of a formula is. */
export type Kind = 'number' | 'text' | 'pick' | 'set' | 'unknown';

export type Operation = {
  id: string;
  /** As the line writes it. */
  op: string;
  /** As a tile names it. */
  label: string;
  line: string;
  tray: Tray;
  inputs: readonly string[];
  /** What each input takes, in order; numbers when left out. */
  takes?: readonly Take[];
  /** A pick, or the kind of what it chooses between; a number when left out. */
  gives?: 'pick' | 'same';
  /** How many of the last inputs may be left out. */
  optional?: number;
  /** Takes any number more of its last input. */
  more?: true;
  /** Only in this scope; in both when left out. */
  where?: Where;
};

const infix = (
  op: string,
  label: string,
  line: string,
  tray: Tray,
  takes: readonly Take[] = ['number', 'number'],
): Operation => ({ id: op, op, label, line, tray, inputs: ['left', 'right'], takes });

const fold = (
  id: string,
  op: string,
  line: string,
  where: Where,
  inputs: readonly string[],
  takes: readonly Take[],
  optional?: number,
): Operation => ({
  id,
  op,
  label: op,
  line,
  tray: 'fold',
  inputs,
  takes,
  where,
  ...(optional === undefined ? {} : { optional }),
});

const pick = (
  id: string,
  op: string,
  line: string,
  where: Where,
  inputs: readonly string[],
  optional?: number,
): Operation => ({
  id,
  op,
  label: op,
  line,
  tray: 'pick',
  inputs,
  takes: ['set', 'each'],
  gives: 'pick',
  where,
  ...(optional === undefined ? {} : { optional }),
});

const OPERATIONS: Operation[] = [
  fold(
    'sum-runs',
    'sum',
    "Adds up one column over a group's runs",
    'task',
    ['column'],
    ['each'],
  ),
  fold(
    'min-runs',
    'min',
    "The lowest of one column over a group's runs",
    'task',
    ['column'],
    ['each'],
  ),
  fold(
    'max-runs',
    'max',
    "The highest of one column over a group's runs",
    'task',
    ['column'],
    ['each'],
  ),
  fold(
    'count-runs',
    'count',
    'How many runs a group holds, or how many of them pass a test',
    'task',
    ['group', 'test'],
    ['set', 'each'],
    1,
  ),
  pick(
    'first-run',
    'first',
    'The first run of a group, or the first to pass a test: read one of its columns, such as .verdict',
    'task',
    ['group', 'test'],
    1,
  ),
  pick(
    'last-run',
    'last',
    'The last run of a group, or the last to pass a test',
    'task',
    ['group', 'test'],
    1,
  ),
  pick(
    'highest-run',
    'highest',
    'The run of a group with the highest of one column; ties go to the earlier run',
    'task',
    ['group', 'column'],
  ),
  pick(
    'lowest-run',
    'lowest',
    'The run of a group with the lowest of one column; ties go to the earlier run',
    'task',
    ['group', 'column'],
  ),
  pick(
    'first',
    'first',
    "A task's first submission, or the first to pass a test",
    'leaderboard',
    ['task', 'test'],
    1,
  ),
  pick(
    'latest',
    'latest',
    "A task's latest submission, or the latest to pass a test",
    'leaderboard',
    ['task', 'test'],
    1,
  ),
  pick(
    'highest',
    'highest',
    'The submission with the highest of one value',
    'leaderboard',
    ['task', 'value'],
  ),
  pick(
    'lowest',
    'lowest',
    'The submission with the lowest of one value',
    'leaderboard',
    ['task', 'value'],
  ),
  fold(
    'sum-results',
    'sum',
    "Adds up one value over a task's submissions",
    'leaderboard',
    ['value'],
    ['each'],
  ),
  fold(
    'min-results',
    'min',
    "The lowest of one value over a task's submissions",
    'leaderboard',
    ['value'],
    ['each'],
  ),
  fold(
    'max-results',
    'max',
    "The highest of one value over a task's submissions",
    'leaderboard',
    ['value'],
    ['each'],
  ),
  fold(
    'count-results',
    'count',
    'How many submissions a task has, or how many of them pass a test',
    'leaderboard',
    ['task', 'test'],
    ['set', 'each'],
    1,
  ),
  infix('+', '+', 'Adds two numbers', 'maths'),
  infix('-', '−', 'Takes one number from another', 'maths'),
  infix('*', '×', 'Multiplies two numbers', 'maths'),
  infix('/', '÷', 'Divides one number by another', 'maths'),
  {
    id: 'min-of',
    op: 'min',
    label: 'min',
    line: 'The smaller of two numbers',
    tray: 'maths',
    inputs: ['left', 'right'],
  },
  {
    id: 'max-of',
    op: 'max',
    label: 'max',
    line: 'The larger of two numbers',
    tray: 'maths',
    inputs: ['left', 'right'],
  },
  {
    id: 'floor',
    op: 'floor',
    label: 'floor',
    line: 'Rounds down to a whole number',
    tray: 'maths',
    inputs: ['number'],
  },
  {
    id: 'ceil',
    op: 'ceil',
    label: 'ceil',
    line: 'Rounds up to a whole number',
    tray: 'maths',
    inputs: ['number'],
  },
  {
    id: 'sum_best',
    op: 'sum_best',
    label: 'sum_best',
    line: 'Adds the k largest numbers: keep the best 4 of 5',
    tray: 'maths',
    inputs: ['k', 'number', 'number'],
    more: true,
    where: 'leaderboard',
  },
  infix('<', '<', '1 when the left is less, else 0', 'test'),
  infix('<=', '≤', '1 when the left is less or the same, else 0', 'test'),
  infix('>', '>', '1 when the left is more, else 0', 'test'),
  infix('>=', '≥', '1 when the left is more or the same, else 0', 'test'),
  infix('==', '=', '1 when the two are the same, numbers or text, else 0', 'test', [
    'any',
    'any',
  ]),
  infix('!=', '≠', '1 when the two differ, numbers or text, else 0', 'test', [
    'any',
    'any',
  ]),
  infix('and', 'and', '1 when both are true (not 0), else 0', 'test'),
  infix('or', 'or', '1 when either is true (not 0), else 0', 'test'),
  {
    id: 'not',
    op: 'not',
    label: 'not',
    line: '1 when the test is 0, else 0',
    tray: 'test',
    inputs: ['test'],
  },
  {
    id: 'if',
    op: 'if',
    label: 'if',
    line: 'One number or text when a test is true (not 0), another when it is 0',
    tray: 'test',
    inputs: ['test', 'then', 'else'],
    takes: ['number', 'any', 'any'],
    gives: 'same',
  },
  {
    id: 'otherwise',
    op: 'otherwise',
    label: 'otherwise',
    line: 'A number or text, or another in its place when it is missing',
    tray: 'test',
    inputs: ['value', 'instead'],
    takes: ['any', 'any'],
    gives: 'same',
  },
];

/** How tightly each infix block binds; `not` binds at 3, `.` tightest of all. */
const INFIX: Record<string, number> = {
  or: 1,
  and: 2,
  '<': 4,
  '<=': 4,
  '>': 4,
  '>=': 4,
  '==': 4,
  '!=': 4,
  '+': 5,
  '-': 5,
  '*': 6,
  '/': 6,
};

const NOT = 3;
const COMPARE = 4;
const FIELD = 9;

function fits(operation: Operation, count: number): boolean {
  const most = operation.inputs.length;
  const least = most - (operation.optional ?? 0);
  return operation.more ? count >= most : count >= least && count <= most;
}

/** The catalogue entry a node is, by its name, its inputs and the scope. */
function operationOf(op: string, count: number, where: Where): Operation | null {
  const here = OPERATIONS.filter(
    (operation) =>
      operation.op === op &&
      (operation.where === undefined || operation.where === where),
  );
  return here.find((operation) => fits(operation, count)) ?? here[0] ?? null;
}

export function operationsIn(where: Where, tray?: Tray): Operation[] {
  return OPERATIONS.filter(
    (operation) =>
      (operation.where === undefined || operation.where === where) &&
      (tray === undefined || operation.tray === tray),
  );
}

function takeAt(operation: Operation, index: number): Take {
  return operation.takes?.[index] ?? operation.takes?.at(-1) ?? 'number';
}

// ---- Reading the line --------------------------------------------------

type Tok = (
  | { kind: 'num'; text: string }
  | { kind: 'str'; text: string }
  | { kind: 'id'; text: string }
  | { kind: 'field'; text: string }
  | { kind: 'sym'; text: string }
  | { kind: 'hole' }
  | { kind: 'lp' }
  | { kind: 'rp' }
  | { kind: 'comma' }
  | { kind: 'end' }
) &
  Span;

function idStart(char: string): boolean {
  return (char >= 'A' && char <= 'Z') || (char >= 'a' && char <= 'z') || char === '_';
}

function idPart(char: string): boolean {
  return idStart(char) || digit(char);
}

function digit(char: string | undefined): boolean {
  return char !== undefined && char >= '0' && char <= '9';
}

/** Where a name from `i` ends, `sample_tests.passed` taken whole. */
function nameEnd(source: string, i: number): number {
  let j = i + 1;
  while (idPart(source[j] ?? '')) j += 1;
  while (source[j] === '.' && idStart(source[j + 1] ?? '')) {
    j += 2;
    while (idPart(source[j] ?? '')) j += 1;
  }
  return j;
}

/** A column read off a pick: the `.` straight after a `)`. */
function fieldAt(source: string, i: number): boolean {
  return source[i] === '.' && source[i - 1] === ')' && idStart(source[i + 1] ?? '');
}

type Unread = { message: string; at: number };

function tokenize(source: string): Tok[] | Unread {
  const out: Tok[] = [];
  let i = 0;
  const push = (token: Tok) => {
    out.push(token);
    i = token.to;
  };
  while (i < source.length) {
    const char = source[i] ?? '';
    const two = source.slice(i, i + 2);
    const one = { from: i, to: i + 1 };
    if (char === ' ' || char === '\t') i += 1;
    else if (char === '\n') return { message: 'A formula is one line.', at: i };
    else if (char === '(') push({ kind: 'lp', ...one });
    else if (char === ')') push({ kind: 'rp', ...one });
    else if (char === ',') push({ kind: 'comma', ...one });
    else if (char === '?') push({ kind: 'hole', ...one });
    else if (two === '<=' || two === '>=' || two === '==' || two === '!=')
      push({ kind: 'sym', text: two, from: i, to: i + 2 });
    else if ('+-*/<>'.includes(char)) push({ kind: 'sym', text: char, ...one });
    else if (char === '"') {
      const close = source.indexOf('"', i + 1);
      if (close < 0)
        return { message: 'This line cannot be read: a text has no closing ".', at: i };
      push({ kind: 'str', text: source.slice(i + 1, close), from: i, to: close + 1 });
    } else if (fieldAt(source, i)) {
      const end = nameEnd(source, i + 1);
      push({ kind: 'field', text: source.slice(i + 1, end), from: i, to: end });
    } else if (digit(char)) {
      let j = i + 1;
      while (digit(source[j])) j += 1;
      if (source[j] === '.') {
        j += 1;
        if (!digit(source[j]))
          return { message: 'This line cannot be read: a number is cut off.', at: i };
        while (digit(source[j])) j += 1;
      }
      push({ kind: 'num', text: source.slice(i, j), from: i, to: j });
    } else if (idStart(char)) {
      const end = nameEnd(source, i);
      const text = source.slice(i, end);
      push({
        kind: text === 'and' || text === 'or' ? 'sym' : 'id',
        text,
        from: i,
        to: end,
      });
    } else if (char === '=')
      return { message: 'This line cannot be read: “same as” is written ==.', at: i };
    else return { message: `This line cannot be read: “${char}”.`, at: i };
  }
  out.push({ kind: 'end', from: source.length, to: source.length });
  return out;
}

export function parseFormula(source: string): ParseResult {
  if (source.trim() === '') return { ok: false, message: 'Write a formula.', at: 0 };
  const tokens = tokenize(source);
  if (!Array.isArray(tokens)) return { ok: false, ...tokens };
  const end: Tok = { kind: 'end', from: source.length, to: source.length };
  let i = 0;
  const peek = () => tokens[i] ?? end;
  const eat = () => {
    const token = peek();
    i += 1;
    return token;
  };
  const fail = (message: string): Unread => ({ message, at: peek().from });
  const symbolAt = (prec: number): string | null => {
    const token = peek();
    return token.kind === 'sym' && INFIX[token.text] === prec ? token.text : null;
  };
  const across = (left: FormulaNode, right: FormulaNode): Span => ({
    from: left.span?.from ?? 0,
    to: right.span?.to ?? 0,
  });

  /** Infix blocks at one level, left to right; a comparison takes one. */
  function level(prec: number, next: () => FormulaNode | Unread): FormulaNode | Unread {
    let node = next();
    if (!('kind' in node)) return node;
    for (let op = symbolAt(prec); op !== null; op = symbolAt(prec)) {
      eat();
      const right = next();
      if (!('kind' in right)) return right;
      node = { kind: 'op', op, args: [node, right], span: across(node, right) };
      if (prec === COMPARE) break;
    }
    return node;
  }

  const parseOr = (): FormulaNode | Unread => level(1, parseAnd);
  const parseAnd = (): FormulaNode | Unread => level(2, parseNot);
  const parseCompare = (): FormulaNode | Unread => level(COMPARE, parseSum);
  const parseSum = (): FormulaNode | Unread => level(5, parseTerm);
  const parseTerm = (): FormulaNode | Unread => level(6, parseUnary);

  function parseNot(): FormulaNode | Unread {
    const token = peek();
    if (token.kind !== 'id' || token.text !== 'not') return parseCompare();
    eat();
    const inner = parseNot();
    if (!('kind' in inner)) return inner;
    return {
      kind: 'op',
      op: 'not',
      args: [inner],
      span: { from: token.from, to: inner.span?.to ?? token.to },
    };
  }

  function parseUnary(): FormulaNode | Unread {
    const token = peek();
    if (token.kind !== 'sym' || token.text !== '-') return parseFields();
    eat();
    const next = peek();
    if (next.kind === 'num') {
      eat();
      return {
        kind: 'number',
        text: `-${next.text}`,
        span: { from: token.from, to: next.to },
      };
    }
    const inner = parseUnary();
    if (!('kind' in inner)) return inner;
    return {
      kind: 'op',
      op: '-',
      args: [{ kind: 'number', text: '0' }, inner],
      span: { from: token.from, to: inner.span?.to ?? token.to },
    };
  }

  /** A pick and the columns read off it: `first(all).verdict`. */
  function parseFields(): FormulaNode | Unread {
    let node = parsePrimary();
    if (!('kind' in node)) return node;
    for (let token = peek(); token.kind === 'field'; token = peek()) {
      eat();
      const field: FormulaNode = {
        kind: 'name',
        name: token.text,
        span: { from: token.from + 1, to: token.to },
      };
      node = { kind: 'op', op: '.', args: [node, field], span: across(node, field) };
    }
    return node;
  }

  function parsePrimary(): FormulaNode | Unread {
    const token = peek();
    const span = { from: token.from, to: token.to };
    if (token.kind === 'num') {
      eat();
      return { kind: 'number', text: token.text, span };
    }
    if (token.kind === 'str') {
      eat();
      return { kind: 'text', text: token.text, span };
    }
    if (token.kind === 'hole') {
      eat();
      return { kind: 'hole', span };
    }
    if (token.kind === 'id') {
      eat();
      if (token.text === 'not')
        return { message: 'This line cannot be read: “not”.', at: token.from };
      if (peek().kind !== 'lp') return { kind: 'name', name: token.text, span };
      eat();
      const args: FormulaNode[] = [];
      if (peek().kind !== 'rp') {
        for (;;) {
          const arg = parseOr();
          if (!('kind' in arg)) return arg;
          args.push(arg);
          if (peek().kind !== 'comma') break;
          eat();
        }
      }
      if (peek().kind !== 'rp')
        return fail('This line cannot be read: a “)” is missing.');
      const close = eat();
      return {
        kind: 'op',
        op: token.text,
        args,
        span: { from: token.from, to: close.to },
      };
    }
    if (token.kind === 'lp') {
      eat();
      const inner = parseOr();
      if (!('kind' in inner)) return inner;
      if (peek().kind !== 'rp')
        return fail('This line cannot be read: a “)” is missing.');
      eat();
      return inner;
    }
    if (token.kind === 'end')
      return fail('This line cannot be read: it stops too soon.');
    return fail('This line cannot be read.');
  }

  const node = parseOr();
  if (!('kind' in node)) return { ok: false, ...node };
  if (peek().kind !== 'end')
    return { ok: false, ...fail('This line cannot be read: something is left over.') };
  return { ok: true, node };
}

export function printFormula(node: FormulaNode): string {
  return print(node, 0, false);
}

function print(node: FormulaNode, parent: number, right: boolean): string {
  if (node.kind === 'name') return node.name;
  if (node.kind === 'number') return node.text;
  if (node.kind === 'text') return `"${node.text}"`;
  if (node.kind === 'hole') return '?';
  const [left, other] = node.args;
  if (node.op === '.' && left !== undefined && other?.kind === 'name')
    return `${print(left, FIELD, false)}.${other.name}`;
  if (node.op === 'not' && node.args.length === 1 && left !== undefined) {
    const text = `not ${print(left, NOT, false)}`;
    return parent > NOT ? `(${text})` : text;
  }
  const prec = INFIX[node.op];
  if (
    prec === undefined ||
    node.args.length !== 2 ||
    left === undefined ||
    other === undefined
  )
    return `${node.op}(${node.args.map((arg) => print(arg, 0, false)).join(', ')})`;
  // A comparison takes no comparison on either side without brackets.
  const inner = prec === COMPARE ? prec + 0.5 : prec;
  const text = `${print(left, inner, false)} ${node.op} ${print(other, inner, true)}`;
  return parent > prec || (right && parent === prec) ? `(${text})` : text;
}

// ---- What is wrong, and what it gives ----------------------------------

function words(where: Where) {
  return where === 'task'
    ? {
        each: 'one per run',
        inside: 'sum, min, max, count or a pick',
        set: 'group',
        setHint: 'count its runs, or fold one of its columns',
        pick: 'a pick gives a run, not a number or text: read one of its columns, such as .verdict',
        field: 'not a column of a run',
      }
    : {
        each: 'one per submission',
        inside: 'a pick, sum, min, max or count',
        set: 'task',
        setHint: 'pick a submission, or fold one of its values',
        pick: 'a pick gives a submission, not a number or text: read one of its values, such as .total',
        field: 'not a value of a submission',
      };
}

/**
 * Every problem in a formula, each at its place in the line, and what the
 * whole gives: a number or text, or a pick, which only a leaderboard's
 * column may be.
 */
export function checkFormula(
  node: FormulaNode,
  scope: FormulaScope,
): { problems: FormulaProblem[]; kind: Kind } {
  const found: FormulaProblem[] = [];
  const say = words(scope.where);
  const texts = new Set(scope.texts ?? []);
  const report = (at: FormulaNode, message: string) =>
    found.push(at.span === undefined ? { message } : { span: at.span, message });

  /** `each`: inside a fold or a pick; `pickOk`: a pick may stand here. */
  const walk = (current: FormulaNode, each: boolean, pickOk: boolean): Kind => {
    if (current.kind === 'hole') {
      report(current, 'something goes here');
      return 'unknown';
    }
    if (current.kind === 'number') return 'number';
    if (current.kind === 'text') return 'text';
    if (current.kind === 'name') {
      const name = current.name;
      if (scope.sets.includes(name)) return 'set';
      if (scope.each.includes(name)) {
        if (!each) report(current, `${say.each}, so it sits inside ${say.inside}`);
        return texts.has(name) ? 'text' : 'number';
      }
      if (scope.names.includes(name)) return texts.has(name) ? 'text' : 'number';
      report(current, 'not a name you can use here');
      return 'unknown';
    }
    if (current.op === '.') {
      const [record, field] = current.args;
      if (record === undefined || field?.kind !== 'name') return 'unknown';
      const of = walk(record, each, true);
      if (of !== 'pick' && of !== 'unknown') {
        report(record, 'only a pick has columns to read with .');
        return 'unknown';
      }
      const kind = scope.fields?.[field.name];
      if (kind === undefined) report(field, say.field);
      return kind ?? 'unknown';
    }
    const operation = operationOf(current.op, current.args.length, scope.where);
    if (operation === null) {
      report(current, 'not a block you can use here');
      current.args.forEach((arg) => walk(arg, each, false));
      return 'unknown';
    }
    if (!fits(operation, current.args.length)) {
      const most = operation.inputs.length;
      const least = most - (operation.optional ?? 0);
      const want =
        least === most ? String(most) : `${String(least)} or ${String(most)}`;
      report(
        current,
        `takes ${operation.more ? 'at least ' : ''}${want} ${most === 1 ? 'input' : 'inputs'}, and this has ${String(current.args.length)}`,
      );
    }
    if (operation.gives === 'pick' && !pickOk) report(current, say.pick);
    const kinds = current.args.map((arg, index): Kind => {
      const take = takeAt(operation, index);
      if (take === 'set') {
        if (arg.kind === 'name' && scope.sets.includes(arg.name)) return 'set';
        if (arg.kind === 'hole') return walk(arg, each, false);
        report(
          arg,
          `${operation.label} takes a ${say.set}, such as ${scope.sets[0] ?? 'one'}`,
        );
        return 'unknown';
      }
      const kind = walk(
        arg,
        each || take === 'each',
        current.op === 'if' && index === 0,
      );
      if (kind === 'set') report(arg, `a ${say.set}, not a number: ${say.setHint}`);
      if (kind === 'text' && take !== 'any')
        report(arg, `text, and ${operation.label} takes a number`);
      return kind;
    });
    const sure = (from: Kind[]) =>
      from.filter(
        (kind): kind is 'number' | 'text' => kind === 'number' || kind === 'text',
      );
    if (current.op === '==' || current.op === '!=') {
      if (new Set(sure(kinds)).size > 1) report(current, 'compares text with a number');
      return 'number';
    }
    if (operation.gives === 'pick') return 'pick';
    if (operation.gives === 'same') {
      const chosen = sure(current.op === 'if' ? kinds.slice(1) : kinds);
      if (new Set(chosen).size > 1)
        report(current, `${operation.label} gives a number one way and text the other`);
      return chosen[0] ?? 'unknown';
    }
    return 'number';
  };

  const kind = walk(node, false, scope.where === 'leaderboard');
  return { problems: found, kind };
}

// ---- The line, piece by piece, for colouring and suggestions -----------

/** What a piece of the line is, so the editor can colour it as a block. */
export type PieceKind =
  | 'value'
  | 'text-value'
  | 'each'
  | 'set'
  | 'block'
  | 'field'
  | 'number'
  | 'text'
  | 'hole'
  | 'symbol'
  | 'unknown'
  | 'space';

export type Piece = Span & { kind: PieceKind; text: string };

/**
 * The line cut into pieces, never failing on a half-typed line: names the
 * scope knows, block names before a bracket, a pick's column after `).`,
 * numbers, quoted text, and the rest.
 */
export function piecesOf(source: string, scope: FormulaScope): Piece[] {
  const out: Piece[] = [];
  const texts = new Set(scope.texts ?? []);
  const blocks = new Set(operationsIn(scope.where).map((operation) => operation.op));
  const kindOf = (name: string, call: boolean): PieceKind => {
    if (name === 'and' || name === 'or' || name === 'not') return 'symbol';
    if (call) return blocks.has(name) ? 'block' : 'unknown';
    if (scope.sets.includes(name)) return 'set';
    const known = scope.each.includes(name)
      ? 'each'
      : scope.names.includes(name)
        ? 'value'
        : 'unknown';
    return known !== 'unknown' && texts.has(name) ? 'text-value' : known;
  };
  let i = 0;
  const push = (to: number, kind: PieceKind) => {
    out.push({ from: i, to, kind, text: source.slice(i, to) });
    i = to;
  };
  while (i < source.length) {
    const char = source[i] ?? '';
    if (char === ' ' || char === '\t') {
      let j = i + 1;
      while (source[j] === ' ' || source[j] === '\t') j += 1;
      push(j, 'space');
    } else if (char === '"') {
      const close = source.indexOf('"', i + 1);
      push(close < 0 ? source.length : close + 1, 'text');
    } else if (digit(char)) {
      let j = i + 1;
      while (digit(source[j]) || source[j] === '.') j += 1;
      push(j, 'number');
    } else if (char === '?') push(i + 1, 'hole');
    else if (fieldAt(source, i)) push(nameEnd(source, i + 1), 'field');
    else if (idStart(char)) {
      const end = nameEnd(source, i);
      let after = end;
      while (source[after] === ' ') after += 1;
      push(end, kindOf(source.slice(i, end), source[after] === '('));
    } else push(i + 1, 'symbol');
  }
  return out;
}

/** What fits where the cursor is, and the half-typed word it would replace. */
export type Context = {
  /** The word being typed runs from here to the cursor. */
  from: number;
  typed: string;
  /** A group (a task) as a pick's or count's first input; a pick's column after `).`; else a value. */
  want: 'set' | 'field' | 'value';
  /** Inside a fold or a pick, where a value for each run (submission) reads. */
  each: boolean;
  /** The block the cursor sits in, and which of its inputs. */
  call?: { operation: Operation; index: number };
};

/**
 * Reads back from the cursor to the brackets around it: inside `count(` a
 * group fits, inside `sum(` a column for each run does, after `).` a column
 * of the pick.
 */
export function contextAt(
  source: string,
  cursor: number,
  scope: FormulaScope,
): Context {
  const typed = /[A-Za-z_][A-Za-z0-9_.]*$/.exec(source.slice(0, cursor))?.[0] ?? '';
  const from = cursor - typed.length;
  if (source[from - 1] === '.' && source[from - 2] === ')')
    return { from, typed, want: 'field', each: false };
  let want: Context['want'] = 'value';
  let each = false;
  let call: Context['call'];
  let innermost = true;
  let depth = 0;
  let index = 0;
  for (let i = from - 1; i >= 0; i -= 1) {
    const char = source[i];
    if (char === '"') i = Math.max(0, source.lastIndexOf('"', i - 1));
    else if (char === ')') depth += 1;
    else if (char === ',' && depth === 0) index += 1;
    else if (char === '(' && depth > 0) depth -= 1;
    else if (char === '(') {
      const name = /([A-Za-z_][A-Za-z0-9_]*)\s*$/.exec(source.slice(0, i))?.[1] ?? '';
      const options = operationsIn(scope.where).filter(
        (operation) =>
          operation.op === name &&
          (operation.more === true || operation.inputs.length > index),
      );
      const takes = options.map((operation) => takeAt(operation, index));
      const [first] = options;
      if (innermost && first !== undefined) {
        call = { operation: first, index };
        if (takes.every((take) => take === 'set')) want = 'set';
      }
      if (takes.includes('each')) each = true;
      innermost = false;
      index = 0;
    }
  }
  return call === undefined
    ? { from, typed, want, each }
    : { from, typed, want, each, call };
}

export type Reading = {
  /** The line as a tree, once it can be read. */
  node: FormulaNode | null;
  /** What the line gives, once it can be read. */
  kind: Kind | null;
  problems: FormulaProblem[];
  unread: { message: string; at: number } | null;
};

/** A line read and checked: what it gives, its problems, or why it cannot be read. */
export function readLine(value: string, scope: FormulaScope): Reading {
  const parsed = parseFormula(value);
  if (!parsed.ok)
    return {
      node: null,
      kind: null,
      problems: [],
      unread: { message: parsed.message, at: parsed.at },
    };
  return { node: parsed.node, ...checkFormula(parsed.node, scope), unread: null };
}

// ---- The formula in words ----------------------------------------------

/** What each block is called on a tile, in plain words. */
const SAY: Record<string, string> = {
  'sum-runs': 'add up',
  'min-runs': 'lowest',
  'max-runs': 'highest',
  'count-runs': 'count runs',
  'first-run': 'first run',
  'last-run': 'last run',
  'highest-run': 'run with the highest',
  'lowest-run': 'run with the lowest',
  first: 'first submission',
  latest: 'latest submission',
  highest: 'submission with the highest',
  lowest: 'submission with the lowest',
  'sum-results': 'add up',
  'min-results': 'lowest',
  'max-results': 'highest',
  'count-results': 'count submissions',
  'min-of': 'smaller of two',
  'max-of': 'larger of two',
  floor: 'round down',
  ceil: 'round up',
  sum_best: 'add up the best k',
  if: 'if … then … else',
  otherwise: 'when missing, use',
};

export function sayOf(operation: Operation): string {
  return SAY[operation.id] ?? operation.label;
}

const INFIX_WORDS: Record<string, string> = {
  '+': 'plus',
  '-': 'minus',
  '*': 'times',
  '/': 'divided by',
  '<': 'is less than',
  '<=': 'is at most',
  '>': 'is more than',
  '>=': 'is at least',
  '==': 'is',
  '!=': 'is not',
  and: 'and',
  or: 'or',
};

/**
 * A formula read out in words, so what it means shows without reading the
 * code: `sum(sample_tests.passed)` is “Add up passed over the runs in
 * sample_tests”.
 */
export function describeFormula(node: FormulaNode, scope: FormulaScope): string {
  const things = scope.where === 'task' ? 'runs' : 'submissions';
  const one = scope.where === 'task' ? 'run' : 'submission';
  const columnOf = (name: string): { group: string; column: string } | null => {
    const dot = name.indexOf('.');
    const group = name.slice(0, dot);
    return dot > 0 && scope.sets.includes(group)
      ? { group, column: name.slice(dot + 1) }
      : null;
  };
  /** The group a fold or a pick reads, from the first of its columns. */
  const groupIn = (current: FormulaNode | undefined): string | null => {
    if (current === undefined) return null;
    if (current.kind === 'name') return columnOf(current.name)?.group ?? null;
    if (current.kind !== 'op') return null;
    for (const arg of current.args) {
      const found = groupIn(arg);
      if (found !== null) return found;
    }
    return null;
  };
  /** `of`: the group being looked at, whose columns read as just their names. */
  const say = (
    current: FormulaNode | undefined,
    of: string | null,
    parent = 0,
  ): string => {
    if (current === undefined || current.kind === 'hole') return '…';
    if (current.kind === 'number') return current.text;
    if (current.kind === 'text') return `“${current.text}”`;
    if (current.kind === 'name') {
      const read = columnOf(current.name);
      if (read === null) return current.name;
      return read.group === of
        ? read.column
        : `${read.column} of each ${read.group} ${one}`;
    }
    const [a, b, c] = current.args;
    const set = a?.kind === 'name' ? a.name : '…';
    const where = (test: FormulaNode | undefined) =>
      test === undefined ? '' : ` where ${say(test, set)}`;
    const fold = (verb: string) => {
      const group = groupIn(a);
      return group === null
        ? `${verb} ${say(a, null)}`
        : `${verb} ${say(a, group)} over the ${things} in ${group}`;
    };
    if (current.op === '.' && b?.kind === 'name')
      return `the ${b.name} of ${say(a, of)}`;
    switch (operationOf(current.op, current.args.length, scope.where)?.id) {
      case 'sum-runs':
      case 'sum-results':
        return fold('add up');
      case 'min-runs':
      case 'min-results':
        return fold('the lowest');
      case 'max-runs':
      case 'max-results':
        return fold('the highest');
      case 'count-runs':
      case 'count-results':
        return b === undefined
          ? `how many ${things} ${set} has`
          : `how many ${things} in ${set}${where(b)}`;
      case 'first-run':
        return `the first run in ${set}${where(b)}`;
      case 'last-run':
        return `the last run in ${set}${where(b)}`;
      case 'highest-run':
        return `the run in ${set} with the highest ${say(b, set)}`;
      case 'lowest-run':
        return `the run in ${set} with the lowest ${say(b, set)}`;
      case 'first':
        return `the first ${set} submission${where(b)}`;
      case 'latest':
        return `the latest ${set} submission${where(b)}`;
      case 'highest':
        return `the ${set} submission with the highest ${say(b, set)}`;
      case 'lowest':
        return `the ${set} submission with the lowest ${say(b, set)}`;
      case 'min-of':
        return `the smaller of ${say(a, of)} and ${say(b, of)}`;
      case 'max-of':
        return `the larger of ${say(a, of)} and ${say(b, of)}`;
      case 'floor':
        return `${say(a, of)}, rounded down`;
      case 'ceil':
        return `${say(a, of)}, rounded up`;
      case 'sum_best':
        return `the best ${say(a, of)} of ${current.args
          .slice(1)
          .map((arg) => say(arg, of))
          .join(', ')}, added up`;
      case 'not':
        return `not (${say(a, of)})`;
      case 'if':
        return `if ${say(a, of)} then ${say(b, of)}, else ${say(c, of)}`;
      case 'otherwise':
        return `${say(a, of)}, or ${say(b, of)} when that is missing`;
    }
    const prec = INFIX[current.op];
    const word = INFIX_WORDS[current.op];
    if (prec === undefined || word === undefined) return `${current.op}(…)`;
    const text = `${say(a, of, prec)} ${word} ${say(b, of, prec + 0.5)}`;
    return parent > prec ? `(${text})` : text;
  };
  const text = say(node, null);
  return text.charAt(0).toUpperCase() + text.slice(1) + '.';
}

/** Every name a formula reads, once each, in order; a pick's columns are not names. */
export function namesIn(node: FormulaNode): string[] {
  const found: string[] = [];
  const walk = (current: FormulaNode) => {
    if (current.kind === 'name' && !found.includes(current.name))
      found.push(current.name);
    if (current.kind !== 'op') return;
    const args = current.op === '.' ? current.args.slice(0, 1) : current.args;
    args.forEach(walk);
  };
  walk(node);
  return found;
}
