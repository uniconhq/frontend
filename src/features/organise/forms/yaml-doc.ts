import {
  isAlias,
  isMap,
  isNode,
  isScalar,
  isSeq,
  parseDocument,
  visit,
  type Document,
  type DocumentOptions,
  type Node,
  type ParseOptions,
  type ScalarTag,
  type SchemaOptions,
  type Tags,
  type YAMLMap,
} from 'yaml';
import { overOriginal } from './keep-lines';

/**
 * A definition file as a YAML document, edited node by node so the
 * organiser's comments, key order and untouched keys stay as they were.
 * The forms read it into fields, change the nodes whose fields changed, and
 * write the document back out; nothing is ever dumped afresh from values.
 */
export type Doc = Document;
export type Path = (string | number)[];

const FLOAT = 'tag:yaml.org,2002:float';
const INT = 'tag:yaml.org,2002:int';
const STR = 'tag:yaml.org,2002:str';
/**
 * Characters the forge's reader takes only escaped in double quotes: a tab,
 * which it refuses in plain text, and the controls, breaks and
 * non-characters it refuses anywhere.
 */
function escapedOnly(text: string): boolean {
  for (const char of text) {
    const code = char.charCodeAt(0);
    const control = code < 0x20 && code !== 0x0a && code !== 0x0d;
    const wide = (code >= 0x7f && code <= 0x9f) || code === 0x2028 || code === 0x2029;
    if (control || wide || code === 0xfffe || code === 0xffff) return true;
  }
  return false;
}
/** Those JSON leaves bare inside the quotes, and YAML's escape for each. */
const LEFT_BARE = /[\x7f-\x9f\u2028\u2029\ufffe\uffff]/g;
const NAMED_ESCAPES: Record<string, string> = {
  '\u0085': '\\N',
  '\u2028': '\\L',
  '\u2029': '\\P',
};

function escaped(found: string): string {
  const named = NAMED_ESCAPES[found];
  if (named !== undefined) return named;
  const code = found.charCodeAt(0);
  return code <= 0xff
    ? `\\x${code.toString(16).toUpperCase().padStart(2, '0')}`
    : `\\u${code.toString(16).toUpperCase().padStart(4, '0')}`;
}

/**
 * A number as the digits it is written with, which a form writes and reads
 * so that no digit is lost: a JavaScript number holds about 17 significant
 * digits, and a bound in a file may have more. It is written bare, and
 * reads as a number.
 */
export class NumberText {
  readonly text: string;

  constructor(text: string) {
    this.text = text;
  }

  /** The number as JavaScript holds it, to about 17 significant digits. */
  get value(): number {
    return Number(this.text);
  }

  toJSON(): number {
    return this.value;
  }
}

/** A `NumberText` in a document, written as its digits. */
const NUMBER_TEXT: ScalarTag = {
  tag: FLOAT,
  default: true,
  identify: (value) => value instanceof NumberText,
  resolve: (text) => new NumberText(text),
  stringify: (item) => (item.value as NumberText).text,
};

/** The digits a number scalar was read from, while it still holds that number. */
function sourceOf(node: unknown): string | undefined {
  if (!isScalar(node) || typeof node.value !== 'number') return undefined;
  const { source } = node;
  return typeof source === 'string' && Number(source) === node.value
    ? source
    : undefined;
}

/**
 * A tag of the core schema, with two changes: a number read from the file is
 * written back with the digits it was read from, and text holding a
 * character the forge's reader takes only escaped is double-quoted, the
 * character escaped.
 */
function exactTag(tag: Tags[number]): Tags[number] {
  if (typeof tag !== 'object' || 'collection' in tag) return tag;
  const scalar: ScalarTag = tag;
  const { stringify } = scalar;
  if (stringify === undefined) return tag;
  if (scalar.tag === INT || scalar.tag === FLOAT)
    return {
      ...scalar,
      stringify: (item, ctx, onComment, onChompKeep) =>
        sourceOf(item) ?? stringify(item, ctx, onComment, onChompKeep),
    };
  if (scalar.tag === STR)
    return {
      ...scalar,
      stringify: (item, ctx, onComment, onChompKeep) => {
        const value: unknown = item.value;
        if (typeof value === 'string' && escapedOnly(value)) item.type = 'QUOTE_DOUBLE';
        const written = stringify(item, ctx, onComment, onChompKeep);
        return item.type === 'QUOTE_DOUBLE'
          ? written.replace(LEFT_BARE, escaped)
          : written;
      },
    };
  return tag;
}

/**
 * How every definition file is read and written: as the forge reads it,
 * YAML 1.2's core schema, whatever `%YAML` line a file carries. Only `true`
 * and `false` are booleans, so a group named `no` is text, and `1_000`,
 * `1:30` and a date are text too. A string that would read as anything else
 * is written quoted, and a number keeps the digits it is written with.
 */
export const YAML_OPTIONS: ParseOptions & DocumentOptions & SchemaOptions = {
  version: '1.2',
  schema: 'core',
  customTags: (tags: Tags) => [...tags.map(exactTag), NUMBER_TEXT],
};

/** `value` as a new node of the document. */
export function nodeFor(doc: Doc, value: unknown, { flow = false } = {}): Node {
  return doc.createNode(value, { flow });
}

/** The file's text as a document, or the first reason it is not one. */
export function parseYaml(text: string): { doc: Doc } | { error: string } {
  const doc = parseDocument(text, { ...YAML_OPTIONS, prettyErrors: true });
  const first = doc.errors[0];
  if (first !== undefined) return { error: first.message };
  try {
    // An alias with no anchor, or one that loops, parses but reads as nothing.
    doc.toJS();
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
  return { doc };
}

/**
 * The document as text. Long lines are never folded and flow collections
 * keep `{a: 1}` without inner spaces, so a line the form did not touch reads
 * as the organiser wrote it.
 */
export function writeYaml(doc: Doc): string {
  return doc.toString({ lineWidth: 0, flowCollectionPadding: false });
}

/**
 * The document `text` held, edited, as text: every line the edit did not
 * reach as `text` wrote it, so a save changes only what was edited.
 */
export function writeOver(text: string, doc: Doc): string {
  const changed = writeYaml(doc);
  const before = parseYaml(text);
  if ('error' in before) return changed;
  return overOriginal(text, writeYaml(before.doc), changed, sameMeaning);
}

/**
 * Whether two texts hold the same values and the same comments, each number
 * to the digit, which a JavaScript number alone would round.
 */
function sameMeaning(a: string, b: string): boolean {
  const left = parseYaml(a);
  const right = parseYaml(b);
  if ('error' in left || 'error' in right) return false;
  return (
    JSON.stringify(left.doc.toJS()) === JSON.stringify(right.doc.toJS()) &&
    numbersOf(left.doc).join('\n') === numbersOf(right.doc).join('\n') &&
    commentsOf(left.doc).join('\n') === commentsOf(right.doc).join('\n')
  );
}

/** Every number the document holds, as its digits, in the document's order. */
function numbersOf(doc: Doc): string[] {
  const found: string[] = [];
  visit(doc, {
    Scalar: (_, node) => {
      const text = numberTextOf(node);
      if (text !== undefined) found.push(text);
    },
  });
  return found;
}

/** The digits of a number scalar, or undefined for any other node. */
function numberTextOf(node: unknown): string | undefined {
  if (!isScalar(node)) return undefined;
  if (node.value instanceof NumberText) return node.value.text;
  if (typeof node.value !== 'number') return undefined;
  return sourceOf(node) ?? String(node.value);
}

function commentsOf(doc: Doc): string[] {
  const found: (string | null | undefined)[] = [doc.commentBefore, doc.comment];
  visit(doc, {
    Node: (_, node) => {
      found.push(node.commentBefore, node.comment);
    },
  });
  return found
    .flatMap((comment) => (comment ?? '').split('\n'))
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .sort();
}

/** The document's top as a mapping, or null for an empty file. */
export function topMap(doc: Doc): YAMLMap | null | 'not-a-mapping' {
  if (doc.contents === null) return null;
  return isMap(doc.contents) ? doc.contents : 'not-a-mapping';
}

/** The plain value at a path, or undefined when nothing is there. */
export function valueAt(doc: Doc, path: Path): unknown {
  const node: unknown = doc.getIn(path, true);
  if (node === undefined || node === null) return undefined;
  if (isScalar(node))
    return node.value instanceof NumberText ? node.value.toJSON() : node.value;
  if (isMap(node) || isSeq(node)) return node.toJSON();
  return undefined;
}

/**
 * The document as plain values, as `toJS` gives them, with every number a
 * `NumberText` holding the digits the file writes it with.
 */
export function exactJS(doc: Doc): unknown {
  return exactOf(doc, doc.contents);
}

/**
 * The value at a path as `exactJS` reads it, or undefined when nothing is
 * there: what a form reads a field's text from, a number as its digits.
 */
export function exactAt(doc: Doc, path: Path): unknown {
  const node: unknown = doc.getIn(path, true);
  return node === undefined || node === null ? undefined : exactOf(doc, node);
}

function exactOf(doc: Doc, top: unknown): unknown {
  const walk = (node: unknown): unknown => {
    if (isAlias(node)) return walk(node.resolve(doc));
    if (isScalar(node)) {
      const digits = numberTextOf(node);
      return digits === undefined ? node.value : new NumberText(digits);
    }
    if (isMap(node)) {
      const found: Record<string, unknown> = {};
      for (const pair of node.items) {
        const key = isScalar(pair.key) ? pair.key.value : walk(pair.key);
        found[typeof key === 'string' ? key : JSON.stringify(key)] = walk(pair.value);
      }
      return found;
    }
    if (isSeq(node)) return node.items.map(walk);
    return node ?? null;
  };
  return walk(top);
}

/**
 * A field's text for the value at a path: a number as the digits the file
 * writes it with, so a field shows and saves every digit, and anything else
 * as `textOf` gives it.
 */
export function textAt(doc: Doc, path: Path): string {
  return numberTextOf(doc.getIn(path, true)) ?? textOf(valueAt(doc, path));
}

/** A time a form writes, as the text it is written as. */
export class Time {
  readonly text: string;

  constructor(text: string) {
    this.text = text;
  }
}

/** Whether `value` is a mapping read from YAML, not a list or a scalar. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof NumberText) &&
    !(value instanceof Time)
  );
}

/**
 * Write one value at a path, creating the mappings above it. A scalar that is
 * already there keeps its node, so a comment on its line stays. `undefined`
 * removes the key; with `prune`, a mapping the removal left empty goes too,
 * up to (not including) the path's first `keep` segments.
 */
export function writeAt(
  doc: Doc,
  path: Path,
  value: unknown,
  { prune = false, keep = 1 }: { prune?: boolean; keep?: number } = {},
): void {
  if (path.length === 0) {
    doc.contents = value === undefined ? null : doc.createNode(value);
    return;
  }
  if (value === undefined) {
    if (doc.hasIn(path)) doc.deleteIn(path);
    if (!prune) return;
    for (let end = path.length - 1; end >= keep; end -= 1) {
      const parent: unknown = doc.getIn(path.slice(0, end), true);
      if (!isMap(parent) || parent.items.length > 0) return;
      doc.deleteIn(path.slice(0, end));
    }
    return;
  }
  // A key written with nothing after it (`samples:`) holds null; a field
  // under it needs a mapping there first.
  for (let end = 1; end < path.length; end += 1) {
    const above: unknown = doc.getIn(path.slice(0, end), true);
    if (isScalar(above) && above.value === null) {
      doc.setIn(path.slice(0, end), doc.createNode({}));
    }
  }
  // An empty `{}` or `[]` takes its first entry as a block, an entry to a line.
  const parent: unknown = doc.getIn(path.slice(0, -1), true);
  if ((isMap(parent) || isSeq(parent)) && parent.items.length === 0)
    parent.flow = false;
  const written = value instanceof Time ? value.text : value;
  const isPlain =
    written === null ||
    typeof written === 'string' ||
    typeof written === 'number' ||
    typeof written === 'boolean' ||
    written instanceof NumberText;
  const old: unknown = doc.getIn(path, true);
  if (isPlain) {
    if (isScalar(old)) {
      // A scalar already there keeps its node, so a comment on its line stays.
      if (written instanceof NumberText) old.value = written;
      else doc.setIn(path, written);
      return;
    }
    const node = nodeFor(doc, written);
    keepComments(old, node);
    doc.setIn(path, node);
    return;
  }
  if (isRecord(value) && isMap(old)) {
    // A mapping already there is changed key by key, keeping its style, its
    // key order and the comments in it. Its keys are text, as the forge reads
    // every key a page writes, so a `1:` is the `"1"` the form names.
    for (const pair of [...old.items]) {
      if (isScalar(pair.key) && typeof pair.key.value !== 'string')
        pair.key.value = String(pair.key.value);
      const key = isScalar(pair.key) ? pair.key.value : pair.key;
      if (typeof key === 'string' && !(key in value)) old.delete(key);
    }
    for (const [key, inner] of Object.entries(value)) {
      if (inner === undefined) continue;
      writeAt(doc, [...path, key], inner);
    }
    return;
  }
  const flat = (item: unknown) =>
    !isRecord(item) &&
    (!Array.isArray(item) || item.every((inner) => !isRecord(inner)));
  const flow = Array.isArray(value)
    ? value.every(flat)
    : isRecord(value) && Object.values(value).every(flat);
  const node = nodeFor(doc, value, { flow });
  keepComments(old, node);
  doc.setIn(path, node);
}

/**
 * The node `old` replaces may carry the comment on its line or the one above
 * it; the new one keeps them, as a scalar written in place does.
 */
function keepComments(old: unknown, node: Node): void {
  if (!isNode(old)) return;
  node.comment = old.comment;
  node.commentBefore = old.commentBefore;
}

const NUMBER = /^-?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;

/**
 * A value typed into a field, as the file should hold it: a number, as its
 * digits, when it reads as one, `true` or `false` as a bool, and anything
 * else as text. An empty field is no value. Used where the form cannot know
 * the type, such as an input's value, which the workflow declares.
 */
export function scalarOf(text: string): string | NumberText | boolean | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return undefined;
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (NUMBER.test(trimmed)) return new NumberText(trimmed);
  return text;
}

/** A field's text for a value read from the file. */
export function textOf(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (value instanceof NumberText) return value.text;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

/**
 * A number typed into a field: undefined when empty, NaN when it is not a
 * number, which the form shows as an error and will not save.
 */
export function numberOf(text: string): number | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return undefined;
  if (!NUMBER.test(trimmed)) return Number.NaN;
  return Number(trimmed);
}

/**
 * A number typed into a field as the file should hold it, its digits as
 * typed: undefined when empty, NaN when it is not a number, which the form
 * shows as an error and will not save.
 */
export function numberText(text: string): NumberText | number | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return undefined;
  return NUMBER.test(trimmed) ? new NumberText(trimmed) : Number.NaN;
}

/** Why a number field cannot be saved, or undefined when it can. */
export function numberProblem(text: string, whole = false): string | undefined {
  const value = numberOf(text);
  if (value === undefined) return undefined;
  if (Number.isNaN(value)) return 'Not a number.';
  if (whole && !Number.isInteger(value)) return 'A whole number.';
  return undefined;
}
