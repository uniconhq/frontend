import { isRecord, NumberText } from '../forms/yaml-doc';

/**
 * A workflow as the editor reads its `workflow.yaml` (TASK-FORMAT.md section
 * 1.3): the inputs it declares, the fields every test has, the steps in
 * order with what each port is given, and what a run reports. The reading is
 * forgiving, since the page draws a draft with problems as well as a good
 * one: a key of the wrong shape is skipped and the check says why, never the
 * reader.
 */

export type ValueType = 'text' | 'number' | 'boolean' | 'enum' | 'file' | 'folder';

export const VALUE_TYPES: ValueType[] = [
  'text',
  'number',
  'boolean',
  'enum',
  'file',
  'folder',
];

/** One `${{ ... }}`: an input, a field of the current test, or a step's output. */
export type Ref =
  | { kind: 'inputs'; name: string }
  | { kind: 'test'; name: string }
  | { kind: 'steps'; name: string; output: string };

/**
 * What a port is given. `wire` is a whole reference, drawn as a wire; `text`
 * a string with references written into it, which draws none; `literal` a
 * number, a boolean or a plain string; `invalid` anything else, such as a
 * list or a `${{ }}` that is not a reference.
 */
export type WithValue =
  | { kind: 'wire'; ref: Ref }
  | { kind: 'text'; text: string; refs: Ref[] }
  | { kind: 'literal'; value: string | NumberText | boolean }
  | { kind: 'invalid'; raw: unknown };

export type InputDecl = {
  id: string;
  type: string;
  contestant: boolean;
  options: string[] | null;
  perTest: boolean;
  optional: boolean;
  /** What the task's form names it, a line of help and its unit (#434); null when not given. */
  title: string | null;
  help: string | null;
  unit: string | null;
};

export type FieldDecl = {
  name: string;
  type: string;
  options: string[] | null;
  public: boolean;
};

type Step = {
  id: string;
  use: string;
  perTest: boolean;
  with: Record<string, WithValue>;
};

export type ReportEntry = {
  name: string;
  /** The output it reads, or null when `from` is not one reference. */
  from: Ref | null;
  fold: string | null;
  better: string | null;
  /** `better` when it is `${{ inputs.<id> }}`. */
  betterRef: Ref | null;
  atLeast: NumberText | null;
  atMost: NumberText | null;
  /**
   * What pages name the value, "Run time", and what it is counted in, "ms"
   * (M58); null when not given, and the value is then named by its key.
   */
  title: string | null;
  unit: string | null;
  /** Written as a bare reference rather than a mapping. */
  short: boolean;
};

export type Workflow = {
  inputs: InputDecl[];
  test: FieldDecl[];
  steps: Step[];
  report: ReportEntry[];
};

const WHOLE = /^\s*\$\{\{\s*([^{}]*?)\s*\}\}\s*$/;
const ANY = /\$\{\{\s*([^{}]*?)\s*\}\}/g;

/** The reference inside `${{ ... }}`, or null when it is not one. */
function parseRef(expression: string): Ref | null {
  const parts = expression.split('.');
  const [head, name, output] = parts;
  if (head === 'inputs' && name && parts.length === 2) return { kind: 'inputs', name };
  if (head === 'test' && name && parts.length === 2) return { kind: 'test', name };
  if (head === 'steps' && name && output && parts.length === 3)
    return { kind: 'steps', name, output };
  return null;
}

/** A reference as the file writes it. */
export function refText(ref: Ref): string {
  if (ref.kind === 'steps') return `\${{ steps.${ref.name}.${ref.output} }}`;
  return `\${{ ${ref.kind}.${ref.name} }}`;
}

/** A reference as the page names it, without the braces. */
export function refLabel(ref: Ref): string {
  if (ref.kind === 'steps') return `${ref.name}.${ref.output}`;
  return `${ref.kind}.${ref.name}`;
}

export function sameRef(a: Ref, b: Ref): boolean {
  return (
    a.kind === b.kind &&
    a.name === b.name &&
    (a.kind !== 'steps' || (b.kind === 'steps' && a.output === b.output))
  );
}

/** The one reference `text` is exactly, or null when it is anything else. */
export function wholeRef(text: string): Ref | null {
  const found = WHOLE.exec(text);
  return found?.[1] !== undefined ? parseRef(found[1]) : null;
}

/** Every reference written into `text`, or null when a `${{ }}` is not one. */
export function refsIn(text: string): Ref[] | null {
  const found: Ref[] = [];
  for (const match of text.matchAll(ANY)) {
    const ref = parseRef(match[1] ?? '');
    if (ref === null) return null;
    found.push(ref);
  }
  if (text.split('${{').length - 1 !== found.length) return null;
  return found;
}

/**
 * Why a `${{ }}` in `text` is not a reference, in the forge's words, or null
 * when every one is.
 */
export function refProblem(text: string): string | null {
  const found = [...text.matchAll(ANY)];
  for (const match of found) {
    const expression = match[1] ?? '';
    if (parseRef(expression) === null)
      return `Unicon cannot read \${{ ${expression} }}. Write \${{ inputs.<id> }}, \${{ test.<field> }} or \${{ steps.<id>.<output> }}.`;
  }
  if (text.split('${{').length - 1 !== found.length)
    return 'A ${{ is not closed with }}, or has a brace inside it. Close each one, and remove any brace inside.';
  return null;
}

/** What a port is given, read from the value in the file. */
function withValue(raw: unknown): WithValue {
  if (typeof raw === 'number')
    return { kind: 'literal', value: new NumberText(String(raw)) };
  if (raw instanceof NumberText || typeof raw === 'boolean')
    return { kind: 'literal', value: raw };
  if (typeof raw !== 'string') return { kind: 'invalid', raw };
  const whole = wholeRef(raw);
  if (whole !== null) return { kind: 'wire', ref: whole };
  const refs = refsIn(raw);
  if (refs === null) return { kind: 'invalid', raw };
  if (refs.length === 0) return { kind: 'literal', value: raw };
  return { kind: 'text', text: raw, refs };
}

/** The references a port's value reads: the wire's, or those written in. */
export function refsOf(value: WithValue): Ref[] {
  if (value.kind === 'wire') return [value.ref];
  if (value.kind === 'text') return value.refs;
  return [];
}

function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function strings(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? value
    : null;
}

function number(value: unknown): NumberText | null {
  if (value instanceof NumberText) return Number.isFinite(value.value) ? value : null;
  return typeof value === 'number' && Number.isFinite(value)
    ? new NumberText(String(value))
    : null;
}

/** A declaration written short (`time_limit: number`) or as a mapping. */
function declaration(raw: unknown): Record<string, unknown> {
  if (typeof raw === 'string') return { type: raw };
  return isRecord(raw) ? raw : {};
}

function inputOf(id: string, raw: unknown): InputDecl {
  const found = declaration(raw);
  return {
    id,
    type: text(found.type) ?? '',
    contestant: found.contestant === true,
    options: strings(found.options),
    perTest: found.per_test === true,
    optional: found.optional === true,
    title: text(found.title),
    help: text(found.help),
    unit: text(found.unit),
  };
}

function fieldOf(name: string, raw: unknown): FieldDecl {
  const found = declaration(raw);
  return {
    name,
    type: text(found.type) ?? '',
    options: strings(found.options),
    public: found.public === true,
  };
}

function entryOf(name: string, raw: unknown): ReportEntry {
  if (typeof raw === 'string') {
    return {
      name,
      from: wholeRef(raw),
      fold: null,
      better: null,
      betterRef: null,
      atLeast: null,
      atMost: null,
      title: null,
      unit: null,
      short: true,
    };
  }
  const found = isRecord(raw) ? raw : {};
  const from = text(found.from);
  const better = text(found.better);
  return {
    name,
    from: from !== null ? wholeRef(from) : null,
    fold: text(found.fold),
    better,
    betterRef: better !== null ? wholeRef(better) : null,
    atLeast: number(found.at_least),
    atMost: number(found.at_most),
    title: text(found.title),
    unit: text(found.unit),
    short: false,
  };
}

/**
 * A step as the file holds it. One that is not a mapping, or has no id, is
 * kept with an empty id, so every step stands at its own place in `steps:`
 * and an edit or a problem at `steps[n]` lands on the box drawn for it.
 */
function stepOf(raw: unknown): Step {
  if (!isRecord(raw)) return { id: '', use: '', perTest: false, with: {} };
  const id = text(raw.id) ?? '';
  const given = isRecord(raw.with) ? raw.with : {};
  return {
    id,
    use: text(raw.use) ?? '',
    perTest: raw.per_test === true,
    with: Object.fromEntries(
      Object.entries(given).map(([port, value]) => [port, withValue(value)]),
    ),
  };
}

/** The workflow a parsed `workflow.yaml` holds, as far as it can be read. */
export function readWorkflow(file: unknown): Workflow {
  const top = isRecord(file) ? file : {};
  const inputs = isRecord(top.inputs) ? top.inputs : {};
  const test = isRecord(top.test) ? top.test : {};
  const report = isRecord(top.report) ? top.report : {};
  return {
    inputs: Object.entries(inputs).map(([id, raw]) => inputOf(id, raw)),
    test: Object.entries(test).map(([name, raw]) => fieldOf(name, raw)),
    steps: (Array.isArray(top.steps) ? top.steps : []).map(stepOf),
    report: Object.entries(report).map(([name, raw]) => entryOf(name, raw)),
  };
}
