import type { Catalogue } from './catalogue';
import { limitProblem, type Tree } from './tree';

/** Where a node sits in the line, as string offsets. */
export type Span = { from: number; to: number };

type Arg = { name?: string; value: Ast };

export type Ast =
  | { kind: 'number'; text: string; span: Span }
  | { kind: 'text'; text: string; span: Span }
  | { kind: 'name'; name: string; span: Span }
  | { kind: 'hole'; span: Span }
  | { kind: 'group'; inner: Ast; span: Span }
  | { kind: 'field'; record: Ast; name: string; span: Span }
  | { kind: 'map'; entries: { key: string; value: Ast }[]; span: Span }
  | { kind: 'call'; op: string; args: Arg[]; span: Span };

/** A task's values, or a leaderboard's columns. */
export type Where = 'task' | 'leaderboard';

export type FormulaScope = {
  where: Where;
  /** Names read as they are: a task's values, a leaderboard's columns. */
  names: readonly string[];
  /** `group.column` or `task.value`, read inside a fold or a pick. */
  each: readonly string[];
  /** A task's groups, or a leaderboard's tasks. */
  sets: readonly string[];
  /** Other leaderboards a column may read. */
  boards?: readonly string[];
  /** The names among `names` and `each` that are text. */
  texts?: readonly string[];
  /** What `.` reads on a pick. */
  fields?: Readonly<Record<string, 'number' | 'text'>>;
  /** What each name is, in words. */
  about?: Readonly<Record<string, string>>;
  /**
   * The real name of each name above that a formula writes otherwise, each
   * `-` as `_`, so the tree stores the real one. A pair `a.b` is keyed whole.
   */
  real?: Readonly<Record<string, string>>;
};

export type FormulaProblem = { span?: Span; message: string };

export type ParseResult =
  { ok: true; node: Ast } | { ok: false; message: string; at: number };

export type Kind = 'number' | 'text' | 'pick' | 'set' | 'unknown';

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

const COMPARE = 4;
const CHAIN = new Set(['+', '*', 'and', 'or']);

const BLOCK_OF: Record<string, string> = {
  '+': 'add',
  '-': 'sub',
  '*': 'mul',
  '/': 'div',
  '<': 'lt',
  '<=': 'le',
  '>': 'gt',
  '>=': 'ge',
  '==': 'eq',
  '!=': 'ne',
};

type Tok =
  | {
      kind: 'lp' | 'rp' | 'comma' | 'hole' | 'lbrace' | 'rbrace' | 'colon' | 'end';
      from: number;
      to: number;
    }
  | {
      kind: 'sym' | 'id' | 'num' | 'str' | 'field';
      text: string;
      from: number;
      to: number;
    };

type Unread = { message: string; at: number };

function idStart(char: string): boolean {
  return (char >= 'A' && char <= 'Z') || (char >= 'a' && char <= 'z') || char === '_';
}

function idPart(char: string): boolean {
  return idStart(char) || (char >= '0' && char <= '9');
}

function digit(char: string | undefined): boolean {
  return char !== undefined && char >= '0' && char <= '9';
}

function nameEnd(source: string, i: number): number {
  let j = i + 1;
  while (idPart(source[j] ?? '')) j += 1;
  while (source[j] === '.' && idStart(source[j + 1] ?? '')) {
    j += 2;
    while (idPart(source[j] ?? '')) j += 1;
  }
  return j;
}

function fieldAt(source: string, i: number): boolean {
  return source[i] === '.' && source[i - 1] === ')' && idStart(source[i + 1] ?? '');
}

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
    else if (char === '{') push({ kind: 'lbrace', ...one });
    else if (char === '}') push({ kind: 'rbrace', ...one });
    else if (char === ':') push({ kind: 'colon', ...one });
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

/** The line read as a tree, with each node's span. A block tree is `compile`. */
export function parseFormula(source: string): ParseResult {
  if (source.trim() === '') return { ok: false, message: 'Write a formula.', at: 0 };
  const tokens = tokenize(source);
  if (!Array.isArray(tokens)) return { ok: false, ...tokens };
  const list = tokens;
  const end: Tok = { kind: 'end', from: source.length, to: source.length };
  let i = 0;
  const peek = () => list[i] ?? end;
  const eat = () => {
    const token = peek();
    i += 1;
    return token;
  };
  const fail = (message: string): Unread => ({ message, at: peek().from });
  const across = (left: Ast, right: Ast): Span => ({
    from: left.span.from,
    to: right.span.to,
  });

  function level(prec: number, next: () => Ast | Unread): Ast | Unread {
    let node = next();
    if (!('kind' in node)) return node;
    for (let op = symbolAt(prec); op !== null; op = symbolAt(prec)) {
      eat();
      const right = next();
      if (!('kind' in right)) return right;
      if (CHAIN.has(op) && node.kind === 'call' && node.op === op) {
        node = {
          kind: 'call',
          op,
          args: [...node.args, { value: right }],
          span: across(node, right),
        };
      } else {
        node = {
          kind: 'call',
          op,
          args: [{ value: node }, { value: right }],
          span: across(node, right),
        };
      }
      if (prec === COMPARE) break;
    }
    return node;
  }

  function symbolAt(prec: number): string | null {
    const token = peek();
    return token.kind === 'sym' && INFIX[token.text] === prec ? token.text : null;
  }

  const parseOr = (): Ast | Unread => level(1, parseAnd);
  const parseAnd = (): Ast | Unread => level(2, parseNot);
  const parseCompare = (): Ast | Unread => level(COMPARE, parseSum);
  const parseSum = (): Ast | Unread => level(5, parseTerm);
  const parseTerm = (): Ast | Unread => level(6, parseUnary);

  function parseNot(): Ast | Unread {
    const token = peek();
    if (token.kind !== 'id' || token.text !== 'not') return parseCompare();
    eat();
    const inner = parseNot();
    if (!('kind' in inner)) return inner;
    return {
      kind: 'call',
      op: 'not',
      args: [{ value: inner }],
      span: { from: token.from, to: inner.span.to },
    };
  }

  function parseUnary(): Ast | Unread {
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
      kind: 'call',
      op: '-',
      args: [{ value: { kind: 'number', text: '0', span: token } }, { value: inner }],
      span: { from: token.from, to: inner.span.to },
    };
  }

  function parseFields(): Ast | Unread {
    let node = parsePrimary();
    if (!('kind' in node)) return node;
    for (let token = peek(); token.kind === 'field'; token = peek()) {
      eat();
      node = {
        kind: 'field',
        record: node,
        name: token.text,
        span: across(node, {
          kind: 'name',
          name: token.text,
          span: { from: token.from, to: token.to },
        }),
      };
    }
    return node;
  }

  function parseMap(open: Tok): Ast | Unread {
    const entries: { key: string; value: Ast }[] = [];
    if (peek().kind !== 'rbrace') {
      for (;;) {
        // A key is a name, a number, or quoted text such as a path:
        // `{input: {"tests/7.in": 3}}`, `{seed: {1: 2}}`.
        const key = peek();
        if (key.kind !== 'id' && key.kind !== 'num' && key.kind !== 'str')
          return fail('This line cannot be read: a mapping needs a name.');
        eat();
        if (peek().kind !== 'colon')
          return fail('This line cannot be read: a “:” is missing.');
        eat();
        const value = parseOr();
        if (!('kind' in value)) return value;
        entries.push({ key: key.text, value });
        if (peek().kind !== 'comma') break;
        eat();
      }
    }
    if (peek().kind !== 'rbrace')
      return fail('This line cannot be read: a “}” is missing.');
    const close = eat();
    return { kind: 'map', entries, span: { from: open.from, to: close.to } };
  }

  function parsePrimary(): Ast | Unread {
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
    if (token.kind === 'lbrace') {
      eat();
      return parseMap(token);
    }
    if (token.kind === 'id') {
      eat();
      if (token.text === 'not')
        return { message: 'This line cannot be read: “not”.', at: token.from };
      if (peek().kind !== 'lp') return { kind: 'name', name: token.text, span };
      eat();
      const args: Arg[] = [];
      if (peek().kind !== 'rp') {
        for (;;) {
          const named = peek();
          const after = list[i + 1];
          if (named.kind === 'id' && after?.kind === 'colon') {
            eat();
            eat();
            const value = parseOr();
            if (!('kind' in value)) return value;
            args.push({ name: named.text, value });
          } else {
            const value = parseOr();
            if (!('kind' in value)) return value;
            args.push({ value });
          }
          if (peek().kind !== 'comma') break;
          eat();
        }
      }
      if (peek().kind !== 'rp')
        return fail('This line cannot be read: a “)” is missing.');
      const close = eat();
      return {
        kind: 'call',
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
      const close = eat();
      return { kind: 'group', inner, span: { from: token.from, to: close.to } };
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

type BlockForm = Catalogue['blocks'][number]['forms'][number];
type BlockInput = BlockForm['inputs'][string];

type Built = { tree: Tree; kind: Kind };

type Place = { scope: FormulaScope; catalogue: Catalogue; problems: FormulaProblem[] };

export function formsFor(
  catalogue: Catalogue,
  name: string,
  where: Where,
): BlockForm[] {
  const block = catalogue.blocks.find((item) => item.name === name);
  if (block === undefined) return [];
  return block.forms.filter((form) => form.scope === 'both' || form.scope === where);
}

function dotted(name: string): { group: string; column: string } | null {
  const at = name.indexOf('.');
  if (at <= 0) return null;
  return { group: name.slice(0, at), column: name.slice(at + 1) };
}

function words(where: Where) {
  return where === 'task'
    ? {
        each: 'one per run, so it sits inside sum, min, max, count or a pick',
        set: 'a group, not a number: count its runs, or fold one of its columns',
        pick: 'a pick gives a run, not a number or text: read one of its columns, such as .verdict',
        field: 'not a column of a run',
        count: 'count takes a group, such as',
      }
    : {
        each: 'one per submission, so it sits inside a pick, sum, min, max or count',
        set: 'a task, not a number: pick a submission, or fold one of its values',
        pick: 'a pick gives a submission, not a number or text: read one of its values, such as .total',
        field: 'not a value of a submission',
        count: 'count takes a task, such as',
      };
}

function compile(node: Ast, place: Place, each: boolean, pickOk: boolean): Built {
  const { scope } = place;
  const say = words(scope.where);
  const report = (at: Ast, message: string) =>
    place.problems.push({ span: at.span, message });
  if (node.kind === 'group') return compile(node.inner, place, each, pickOk);
  if (node.kind === 'hole') {
    report(node, 'something goes here');
    return { tree: null, kind: 'unknown' };
  }
  if (node.kind === 'number') return { tree: node.text, kind: 'number' };
  if (node.kind === 'text') return { tree: { text: node.text }, kind: 'text' };
  if (node.kind === 'map') {
    const entries: Record<string, Tree> = {};
    for (const entry of node.entries)
      entries[entry.key] = compile(entry.value, place, each, false).tree;
    return { tree: entries, kind: 'unknown' };
  }
  if (node.kind === 'name') return compileName(node, place, each);
  if (node.kind === 'field') {
    const record = compile(node.record, place, each, true);
    if (record.kind !== 'pick' && record.kind !== 'unknown')
      report(node.record, 'only a pick has columns to read with .');
    const kind = scope.fields?.[node.name];
    if (kind === undefined) report(node, say.field);
    const tree: Tree =
      scope.where === 'task'
        ? { run: [record.tree, node.name] }
        : { value: [record.tree, node.name] };
    return { tree, kind: kind ?? 'unknown' };
  }
  const block = BLOCK_OF[node.op] ?? node.op;
  const forms = formsFor(place.catalogue, block, scope.where);
  if (forms.length === 0) {
    report(node, 'not a block you can use here');
    node.args.forEach((arg) => compile(arg.value, place, each, false));
    return { tree: { block }, kind: 'unknown' };
  }
  // The first form that reads the inputs cleanly wins, so max over a group
  // or a task's results is not taken for max of numbers; with none clean,
  // the first that reads them at all says what is wrong.
  let fallback: { problems: FormulaProblem[]; built: Built } | null = null;
  for (const form of forms) {
    const scratch: FormulaProblem[] = [];
    const trial: Place = { ...place, problems: scratch };
    const filled = fill(node, form, trial, each);
    if (filled === null) continue;
    const kind = gives(form, filled.kinds, node, trial);
    if (kind === 'pick' && !pickOk)
      scratch.push({ span: node.span, message: say.pick });
    const built: Built = { tree: { block, ...filled.inputs }, kind };
    if (scratch.length === 0) return built;
    fallback ??= { problems: scratch, built };
  }
  if (fallback !== null) {
    place.problems.push(...fallback.problems);
    return fallback.built;
  }
  const before = place.problems.length;
  node.args.forEach((arg) => compile(arg.value, place, each, false));
  if (place.problems.length === before) {
    const first = node.args[0]?.value;
    report(
      node,
      node.op === 'count' && first?.kind === 'name' && !scope.sets.includes(first.name)
        ? `${say.count} ${scope.sets[0] ?? 'one'}`
        : `${node.op} does not take these inputs`,
    );
  }
  return { tree: { block }, kind: 'unknown' };
}

function compileName(
  node: Extract<Ast, { kind: 'name' }>,
  place: Place,
  each: boolean,
): Built {
  const { scope, catalogue } = place;
  const say = words(scope.where);
  const { name } = node;
  const dot = dotted(name);
  const texts = new Set(scope.texts ?? []);
  const facts = scope.where === 'task' ? catalogue.facts : catalogue.leaderboard_facts;
  if (dot !== null && scope.sets.includes(dot.group)) {
    if (!each) place.problems.push({ span: node.span, message: say.each });
    const known = scope.each.includes(name) || scope.fields?.[dot.column] !== undefined;
    if (!known) place.problems.push({ span: node.span, message: say.field });
    const kind =
      texts.has(name) || scope.fields?.[dot.column] === 'text' ? 'text' : 'number';
    const tree: Tree =
      scope.where === 'task'
        ? { run: [dot.group, dot.column] }
        : { value: [dot.group, dot.column] };
    return { tree, kind };
  }
  if (
    dot !== null &&
    scope.where === 'leaderboard' &&
    scope.names.includes(dot.group)
  ) {
    const kind =
      texts.has(name) || scope.fields?.[dot.column] === 'text' ? 'text' : 'number';
    return { tree: { value: [{ column: dot.group }, dot.column] }, kind };
  }
  if (dot !== null && (scope.boards ?? []).includes(dot.group)) {
    return { tree: { column: [dot.group, dot.column] }, kind: 'number' };
  }
  if (facts.includes(name))
    return { tree: { fact: name }, kind: texts.has(name) ? 'text' : 'number' };
  if (scope.sets.includes(name)) {
    return {
      tree: scope.where === 'task' ? { runs: name } : { results: name },
      kind: 'set',
    };
  }
  if (scope.names.includes(name)) {
    return {
      tree: scope.where === 'task' ? { value: name } : { column: name },
      kind: texts.has(name) ? 'text' : 'number',
    };
  }
  place.problems.push({ span: node.span, message: 'not a name you can use here' });
  return { tree: { value: name }, kind: 'unknown' };
}

function fill(
  node: Extract<Ast, { kind: 'call' }>,
  form: BlockForm,
  place: Place,
  each: boolean,
): { inputs: Record<string, Tree | Tree[]>; kinds: Kind[] } | null {
  const order = Object.keys(form.inputs);
  const positional = node.args.filter((arg) => arg.name === undefined);
  const named = new Map(
    node.args
      .filter((arg): arg is Arg & { name: string } => arg.name !== undefined)
      .map((arg) => [arg.name, arg]),
  );
  const inputs: Record<string, Tree | Tree[]> = {};
  const kinds: Kind[] = [];
  const used = new Set<string>();
  let at = 0;
  const take = (arg: Arg, input: BlockInput, inside: boolean): Built | null => {
    if (input.kind === 'directions' && arg.value.kind === 'map')
      return directions(arg.value, place);
    if (input.kind === 'missing') return missingOf(arg.value, place);
    if (input.kind === 'name' && arg.value.kind === 'name') {
      const called = arg.value.name;
      const known =
        place.scope.names.includes(called) ||
        place.scope.fields?.[called] !== undefined ||
        place.scope.each.some((item) => item === called || item.endsWith(`.${called}`));
      if (!known)
        place.problems.push({
          span: arg.value.span,
          message: 'not a name you can use here',
        });
      return { tree: { name: called }, kind: 'number' };
    }
    if (input.kind === 'path' || input.kind === 'language')
      return plainText(arg.value, input.kind, place);
    if (input.plain && arg.value.kind !== 'number') return null;
    return compile(arg.value, place, inside, input.kind === 'either');
  };
  for (const key of order) {
    if (used.has(key)) continue;
    const input = form.inputs[key];
    if (input === undefined) return null;
    const given = named.get(key);
    if (given !== undefined) {
      named.delete(key);
      const built = take(given, input, each || input.per_run);
      if (built === null) return null;
      inputs[key] = built.tree;
      kinds.push(built.kind);
      if (!accept(built.kind, input, given.value, node.op, place)) return null;
      continue;
    }
    if (input.least !== null) {
      const most = input.most ?? positional.length - at;
      const slice = positional.slice(at, at + most);
      if (
        slice.length < input.least ||
        (input.most !== null && slice.length > input.most)
      )
        return null;
      at += slice.length;
      const built = slice.map((arg) => take(arg, input, each || input.per_run));
      if (built.some((item) => item === null)) return null;
      const ready = built as Built[];
      inputs[key] = ready.map((item) => item.tree);
      kinds.push(...ready.map((item) => item.kind));
      const kept = ready.every((item, index) => {
        const arg = slice[index];
        return arg === undefined || accept(item.kind, input, arg.value, node.op, place);
      });
      if (!kept) return null;
      continue;
    }
    const next = positional[at];
    if (
      next !== undefined &&
      (key === 'over' || key === 'from') &&
      next.value.kind === 'name' &&
      order.includes('of') &&
      dotted(next.value.name) !== null
    ) {
      const dot = dotted(next.value.name);
      if (dot === null || !place.scope.sets.includes(dot.group)) return null;
      const column = compileName(next.value, place, true);
      inputs[key] =
        input.kind === 'results' ? { results: dot.group } : { runs: dot.group };
      inputs.of = column.tree;
      used.add('of');
      kinds.push(column.kind);
      at += 1;
      continue;
    }
    if (next === undefined) {
      if (input.optional) continue;
      return null;
    }
    if ((key === 'over' || key === 'from') && next.value.kind === 'name') {
      const built = compileName(next.value, place, each);
      if (built.kind !== 'set') return null;
      inputs[key] = built.tree;
      kinds.push('set');
      at += 1;
      continue;
    }
    const built = take(next, input, each || input.per_run);
    if (built === null) return null;
    inputs[key] = built.tree;
    kinds.push(built.kind);
    if (!accept(built.kind, input, next.value, node.op, place)) return null;
    at += 1;
  }
  if (at !== positional.length || named.size > 0) return null;
  return { inputs, kinds };
}

/** Whether this form can take `kind`. A reported problem still keeps the form. */
function accept(
  kind: Kind,
  input: BlockInput,
  at: Ast,
  op: string,
  place: Place,
): boolean {
  const say = words(place.scope.where);
  if (
    kind === 'pick' &&
    input.kind !== 'either' &&
    input.kind !== 'submission' &&
    input.kind !== 'run'
  )
    return false;
  if (kind === 'set' && input.kind !== 'runs' && input.kind !== 'results') {
    place.problems.push({ span: at.span, message: say.set });
    return true;
  }
  if (kind === 'text' && input.kind === 'number')
    place.problems.push({ span: at.span, message: `text, and ${op} takes a number` });
  return true;
}

/**
 * An `exec` block's program or language, written as quoted text or a bare
 * name, as the plain text the file holds: a program is a folder of the task,
 * such as `"programs/mean/"`, and a language one the catalogue lists.
 */
function plainText(node: Ast, kind: 'path' | 'language', place: Place): Built | null {
  const text =
    node.kind === 'text' ? node.text : node.kind === 'name' ? node.name : null;
  if (text === null) return null;
  if (kind === 'language') {
    const languages = place.catalogue.languages;
    if (!languages.includes(text))
      place.problems.push({
        span: node.span,
        message: `Give the program's language, one of ${languages.join(', ')}.`,
      });
  } else if (!folder(text)) {
    place.problems.push({
      span: node.span,
      message:
        'Give the folder of the task that holds the program and its program.yaml, ' +
        'such as programs/mean/.',
    });
  }
  return { tree: text, kind: 'unknown' };
}

/** Whether `text` names a folder of the task: relative, ending in `/`, no part empty, `.` or `..`. */
function folder(text: string): boolean {
  if (!text.endsWith('/') || text.startsWith('/')) return false;
  return text
    .slice(0, -1)
    .split('/')
    .every((part) => part !== '' && part !== '.' && part !== '..');
}

function directions(node: Extract<Ast, { kind: 'map' }>, place: Place): Built | null {
  const map: Record<string, Tree> = {};
  for (const entry of node.entries) {
    if (
      entry.value.kind !== 'name' ||
      (entry.value.name !== 'desc' && entry.value.name !== 'asc')
    )
      return null;
    map[entry.key] = entry.value.name;
  }
  void place;
  return { tree: map, kind: 'number' };
}

function missingOf(node: Ast, place: Place): Built | null {
  if (node.kind === 'name' && node.name === place.catalogue.skip)
    return { tree: node.name, kind: 'number' };
  if (node.kind === 'number') return { tree: node.text, kind: 'number' };
  return null;
}

function gives(
  form: BlockForm,
  kinds: Kind[],
  node: Extract<Ast, { kind: 'call' }>,
  place: Place,
): Kind {
  if (form.gives === 'run' || form.gives === 'submission') return 'pick';
  if (form.gives === 'text') return 'text';
  const compared = node.op === '==' || node.op === '!=';
  const relevant = node.op === 'if' ? kinds.slice(1) : kinds;
  const concrete = relevant.filter((kind) => kind === 'number' || kind === 'text');
  if (
    new Set(concrete).size > 1 &&
    (compared || node.op === 'if' || node.op === 'otherwise')
  ) {
    place.problems.push({
      span: node.span,
      message: compared
        ? 'compares text with a number'
        : node.op === 'if'
          ? 'if gives a number one way and text the other'
          : 'Give two numbers or two texts, not one of each.',
    });
  }
  if (form.gives === 'number') return 'number';
  if (kinds.includes('pick')) return 'pick';
  return concrete[0] ?? 'unknown';
}

export function checkFormula(
  node: Ast,
  scope: FormulaScope,
  catalogue: Catalogue,
): { problems: FormulaProblem[]; kind: Kind; tree: Tree } {
  const place: Place = { scope, catalogue, problems: [] };
  const built = compile(node, place, false, scope.where === 'leaderboard');
  const size = limitProblem(built.tree);
  if (size !== null) place.problems.push({ message: size });
  const problems = [...place.problems].sort(
    (a, b) => (a.span?.from ?? 0) - (b.span?.from ?? 0),
  );
  const tree =
    scope.real === undefined ? built.tree : realNames(built.tree, scope.real);
  return { problems, kind: built.kind, tree };
}

const NAMED = new Set(['results', 'runs', 'column', 'value', 'run']);

/** `tree` with each name a formula wrote as `_` given back its real `-`. */
function realNames(tree: Tree, real: Readonly<Record<string, string>>): Tree {
  if (tree === null || typeof tree === 'string') return tree;
  const one = (name: Tree): Tree =>
    typeof name === 'string' ? (real[name] ?? name) : realNames(name, real);
  const out: { [key: string]: Tree | Tree[] | undefined } = {};
  for (const [key, child] of Object.entries(tree)) {
    if (child === undefined || key === 'text') {
      out[key] = child;
    } else if (!NAMED.has(key)) {
      out[key] = Array.isArray(child)
        ? child.map((item) => realNames(item, real))
        : realNames(child, real);
    } else if (typeof child === 'string') {
      out[key] = real[child] ?? child;
    } else if (Array.isArray(child)) {
      const [record, column] = child;
      const pair =
        typeof record === 'string' && typeof column === 'string'
          ? real[`${record}.${column}`]
          : undefined;
      // A column of another leaderboard is keyed with its leaderboard; a
      // value or a fact read off a task or a pick has no `-`.
      out[key] =
        pair === undefined
          ? [one(record ?? null), ...child.slice(1)]
          : [pair.slice(0, pair.indexOf('.')), pair.slice(pair.indexOf('.') + 1)];
    } else {
      out[key] = realNames(child, real);
    }
  }
  return out;
}

/**
 * The span a forge path names. A path is the block tree's keys, as a refusal
 * reports them: `['of', 0]` is the left of `a + b`.
 */
export function spanOf(
  node: Ast,
  path: readonly (string | number)[],
  catalogue: Catalogue,
  where: Where,
): Span | null {
  if (node.kind === 'group') return spanOf(node.inner, path, catalogue, where);
  if (path.length === 0) return node.span;
  const head = path[0];
  const rest = path.slice(1);
  if (node.kind === 'field' && (head === 'run' || head === 'value')) {
    if (rest[0] === 1)
      return { from: node.span.to - node.name.length, to: node.span.to };
    if (rest[0] === 0) return spanOf(node.record, rest.slice(1), catalogue, where);
    return null;
  }
  if (node.kind !== 'call' || typeof head !== 'string') return null;
  const infix =
    head === 'of' &&
    (node.op in BLOCK_OF || node.op === 'and' || node.op === 'or' || node.op === 'not');
  if (infix) {
    const index = rest[0];
    const arg = typeof index === 'number' ? node.args[index] : undefined;
    return arg === undefined
      ? null
      : spanOf(arg.value, rest.slice(1), catalogue, where);
  }
  const named = node.args.find((arg) => arg.name === head);
  if (named !== undefined) return spanOf(named.value, rest, catalogue, where);
  const form = formsFor(catalogue, BLOCK_OF[node.op] ?? node.op, where).find((item) =>
    Object.hasOwn(item.inputs, head),
  );
  if (form === undefined) return null;
  const order = Object.keys(form.inputs);
  const first = node.args[0]?.value;
  const shorthand =
    (order[0] === 'over' || order[0] === 'from') &&
    order.includes('of') &&
    first?.kind === 'name' &&
    first.name.includes('.');
  if (shorthand && (head === 'over' || head === 'from' || head === 'of'))
    return spanOf(node.args[0]?.value ?? node, rest, catalogue, where);
  let index = 0;
  for (const key of order) {
    if (shorthand && key === 'of') continue;
    const arg = node.args[index];
    if (key === head)
      return arg === undefined ? null : spanOf(arg.value, rest, catalogue, where);
    if (arg?.name !== undefined) break;
    if (arg === undefined) continue;
    index += 1;
  }
  return null;
}

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

/** The line cut into pieces, never failing on a half-typed line. */
export function piecesOf(
  source: string,
  scope: FormulaScope,
  catalogue: Catalogue,
): Piece[] {
  const out: Piece[] = [];
  const texts = new Set(scope.texts ?? []);
  const blocks = new Set(
    catalogue.blocks
      .filter((block) =>
        block.forms.some((form) => form.scope === 'both' || form.scope === scope.where),
      )
      .map((block) => block.name),
  );
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

export type Context = {
  from: number;
  typed: string;
  want: 'set' | 'field' | 'value';
  each: boolean;
  /** The block the cursor sits in, and which input, when it is inside a call. */
  call?: { block: string; input: string };
};

/** What fits where the cursor is. */
export function contextAt(
  source: string,
  cursor: number,
  scope: FormulaScope,
  catalogue: Catalogue,
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
      const forms = formsFor(catalogue, name, scope.where);
      const form = forms.find((item) => Object.keys(item.inputs).length > index);
      const key = form === undefined ? undefined : Object.keys(form.inputs)[index];
      const input =
        key === undefined || form === undefined ? undefined : form.inputs[key];
      const shorthand = index === 0 && form?.inputs.of?.per_run === true;
      if (innermost && form !== undefined && key !== undefined) {
        call = { block: name, input: shorthand ? 'of' : key };
        if (!shorthand && (input?.kind === 'runs' || input?.kind === 'results'))
          want = 'set';
      }
      if (shorthand || input?.per_run) each = true;
      innermost = false;
      index = 0;
    }
  }
  return call === undefined
    ? { from, typed, want, each }
    : { from, typed, want, each, call };
}

export type Reading = {
  node: Ast | null;
  kind: Kind | null;
  tree: Tree | null;
  problems: FormulaProblem[];
  unread: { message: string; at: number } | null;
};

/** A line read and checked. */
export function readLine(
  value: string,
  scope: FormulaScope,
  catalogue: Catalogue,
): Reading {
  const parsed = parseFormula(value);
  if (!parsed.ok)
    return {
      node: null,
      kind: null,
      tree: null,
      problems: [],
      unread: { message: parsed.message, at: parsed.at },
    };
  const checked = checkFormula(parsed.node, scope, catalogue);
  return { node: parsed.node, ...checked, unread: null };
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

/** A formula read out in words. */
export function describeFormula(node: Ast, scope: FormulaScope): string {
  const things = scope.where === 'task' ? 'runs' : 'submissions';
  const one = scope.where === 'task' ? 'run' : 'submission';
  const columnOf = (name: string): { group: string; column: string } | null => {
    const dot = dotted(name);
    return dot !== null && scope.sets.includes(dot.group) ? dot : null;
  };
  const groupIn = (current: Ast | undefined): string | null => {
    if (current === undefined) return null;
    if (current.kind === 'name') return columnOf(current.name)?.group ?? null;
    if (current.kind === 'group') return groupIn(current.inner);
    if (current.kind !== 'call') return null;
    for (const arg of current.args) {
      const found = groupIn(arg.value);
      if (found !== null) return found;
    }
    return null;
  };
  const say = (current: Ast | undefined, of: string | null, parent = 0): string => {
    if (current === undefined || current.kind === 'hole') return '…';
    if (current.kind === 'group') return say(current.inner, of, parent);
    if (current.kind === 'number') return current.text;
    if (current.kind === 'text') return `“${current.text}”`;
    if (current.kind === 'name') {
      const read = columnOf(current.name);
      if (read === null) return current.name;
      return read.group === of
        ? read.column
        : `${read.column} of each ${read.group} ${one}`;
    }
    if (current.kind === 'field')
      return `the ${current.name} of ${say(current.record, of)}`;
    if (current.kind === 'map') return '…';
    const args = current.args.map((arg) => arg.value);
    const [a, b, c] = args;
    const set = a?.kind === 'name' ? a.name : '…';
    const fold = (verb: string) => {
      const group = groupIn(a);
      return group === null
        ? `${verb} ${say(a, null)}`
        : `${verb} ${say(a, group)} over the ${things} in ${group}`;
    };
    if (current.op === 'sum' || current.op === 'min' || current.op === 'max') {
      const verb =
        current.op === 'sum'
          ? 'add up'
          : current.op === 'min'
            ? 'the lowest'
            : 'the highest';
      if (a?.kind === 'name' && columnOf(a.name) !== null) return fold(verb);
    }
    if (current.op === 'count' && b === undefined)
      return `how many ${things} ${set} has`;
    if (current.op === 'first' && scope.where === 'task')
      return `the first run in ${set}${b === undefined ? '' : ` where ${say(b, set)}`}`;
    if (current.op === 'not') return `not (${say(a, of)})`;
    if (current.op === 'if')
      return `if ${say(a, of)} then ${say(b, of)}, else ${say(c, of)}`;
    if (current.op === 'otherwise')
      return `${say(a, of)}, or ${say(b, of)} when that is missing`;
    const prec = INFIX[current.op];
    const word = INFIX_WORDS[current.op];
    if (prec === undefined || word === undefined || a === undefined)
      return `${current.op}(…)`;
    const text = `${say(a, of, prec)} ${word} ${say(b, of, prec + 0.5)}`;
    return parent > prec ? `(${text})` : text;
  };
  const text = say(node, null);
  return text.charAt(0).toUpperCase() + text.slice(1) + '.';
}

/** Every name a formula reads, once each. A column read off a pick with `.` is not one. */
export function namesIn(node: Ast): string[] {
  const found: string[] = [];
  const walk = (current: Ast) => {
    if (current.kind === 'name' && !found.includes(current.name))
      found.push(current.name);
    if (current.kind === 'group') walk(current.inner);
    if (current.kind === 'field') walk(current.record);
    if (current.kind === 'call') current.args.forEach((arg) => walk(arg.value));
    if (current.kind === 'map') current.entries.forEach((entry) => walk(entry.value));
  };
  walk(node);
  return found;
}
