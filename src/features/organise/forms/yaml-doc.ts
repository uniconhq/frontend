import {
  isMap,
  isNode,
  isScalar,
  isSeq,
  parseDocument,
  type Document,
  type DocumentOptions,
  type ParseOptions,
  type ScalarTag,
  type SchemaOptions,
  type Tags,
  type YAMLMap,
} from 'yaml';

/**
 * A definition file as a YAML document, edited node by node so the
 * organiser's comments, key order and untouched keys stay as they were.
 * The forms read it into fields, change the nodes whose fields changed, and
 * write the document back out; nothing is ever dumped afresh from values.
 */
export type Doc = Document;
export type Path = (string | number)[];

const PYTHON_TRUE = /^(?:[Yy]es|YES|[Tt]rue|TRUE|[Oo]n|ON)$/;
const PYTHON_FALSE = /^(?:[Nn]o|NO|[Ff]alse|FALSE|[Oo]ff|OFF)$/;
const BOOL = 'tag:yaml.org,2002:bool';
const MERGE = 'tag:yaml.org,2002:merge';
/**
 * Tags of the library's 1.1 schema a definition file never holds: a time,
 * which stays text, and the ordered collections, which the library would
 * otherwise make of every new mapping.
 */
const LEFT_OUT = ['timestamp', 'omap', 'pairs', 'set'].map(
  (name) => `tag:yaml.org,2002:${name}`,
);

/**
 * How every definition file is read and written: as the forge reads it,
 * PyYAML's YAML 1.1, where `on`, `yes` and `off` are true and false and
 * `1_000` is a number. A string that would read as one of those is written
 * quoted, so the file a save writes means to the forge what the page shows.
 * Two of the library's 1.1 rules are PyYAML's instead: `y` and `n` stay
 * text, a time stays the text it is written as, which the forms read, and a
 * new mapping is a plain one.
 */
/** PyYAML's int and float, which are narrower than the library's 1.1 ones. */
const PYTHON_INT =
  '[-+]?0b[0-1_]+|[-+]?0[0-7_]+|[-+]?(?:0|[1-9][0-9_]*)|[-+]?0x[0-9a-fA-F_]+|[-+]?[1-9][0-9_]*(?::[0-5]?[0-9])+';
const PYTHON_FLOAT =
  '[-+]?(?:[0-9][0-9_]*)\\.[0-9_]*(?:[eE][-+][0-9]+)?|\\.[0-9_]+(?:[eE][-+][0-9]+)?|[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\\.[0-9_]*|[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN)';
const NUMBERS: Record<string, string> = {
  'tag:yaml.org,2002:int': PYTHON_INT,
  'tag:yaml.org,2002:float': PYTHON_FLOAT,
};

/** A date or a time as PyYAML reads one, which the forms hold as text. */
const PYTHON_TIME =
  /^(?:\d{4}-\d\d-\d\d|\d{4}-\d\d?-\d\d?(?:[Tt]|[ \t]+)\d\d?:\d\d:\d\d(?:\.\d*)?(?:[ \t]*(?:Z|[-+]\d\d?(?::\d\d)?))?)$/;

/**
 * Text PyYAML reads as something else that the library's tags do not
 * catch: a date or a time, and the `=` and `<<` PyYAML resolves to tags it
 * then refuses. Written, it is quoted.
 */
function readOtherwise(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    (PYTHON_TIME.test(value) || value === '=' || value === '<<')
  );
}

export const YAML_OPTIONS: ParseOptions & DocumentOptions & SchemaOptions = {
  version: '1.1',
  customTags: (tags: Tags) =>
    tags
      .filter((tag) => typeof tag !== 'object' || !LEFT_OUT.includes(tag.tag))
      .map(pythonTag),
};

/**
 * A 1.1 tag as PyYAML reads it: its bools narrowed to PyYAML's words, its
 * numbers to the scalars PyYAML's patterns take as well, and its merge key
 * to the one a file holds, so a text `<<` is written as text; any other tag
 * as it is.
 */
function pythonTag(tag: Tags[number]): Tags[number] {
  if (typeof tag !== 'object' || 'collection' in tag) return tag;
  const scalar: ScalarTag = tag;
  if (scalar.tag === BOOL)
    return { ...scalar, test: scalar.identify?.(true) ? PYTHON_TRUE : PYTHON_FALSE };
  if (scalar.tag === MERGE)
    return { ...scalar, identify: (value) => typeof value === 'symbol' };
  const narrower = NUMBERS[scalar.tag];
  if (narrower === undefined || scalar.test === undefined) return tag;
  const test = new RegExp(
    `^(?=(?:${narrower})$)${scalar.test.source.slice(1)}`,
    scalar.test.flags,
  );
  return { ...scalar, test };
}

/** Every text under `node` that PyYAML would read otherwise, quoted. */
function quoteForPython(node: unknown): void {
  if (isScalar(node)) {
    if (readOtherwise(node.value)) node.type = 'QUOTE_DOUBLE';
    return;
  }
  if (isMap(node)) for (const pair of node.items) quoteForPython(pair.value);
  if (isSeq(node)) for (const item of node.items) quoteForPython(item);
}

/** The file's text as a document, or the first reason it is not one. */
export function parseYaml(text: string): { doc: Doc } | { error: string } {
  const doc = parseDocument(text, { ...YAML_OPTIONS, prettyErrors: true });
  const first = doc.errors[0];
  if (first !== undefined) return { error: first.message };
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

/** The document's top as a mapping, or null for an empty file. */
export function topMap(doc: Doc): YAMLMap | null | 'not-a-mapping' {
  if (doc.contents === null) return null;
  return isMap(doc.contents) ? doc.contents : 'not-a-mapping';
}

/** The plain value at a path, or undefined when nothing is there. */
export function valueAt(doc: Doc, path: Path): unknown {
  const node: unknown = doc.getIn(path, true);
  if (node === undefined || node === null) return undefined;
  if (isScalar(node)) return node.value;
  if (isMap(node) || isSeq(node)) return node.toJSON();
  return undefined;
}

/** Whether `value` is a mapping read from YAML, not a list or a scalar. */
/**
 * A time a form writes, which the file holds bare: the forge reads a time
 * bare or quoted, and other text that looks like one only quoted.
 */
export class Time {
  readonly text: string;

  constructor(text: string) {
    this.text = text;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
  const time = value instanceof Time;
  const written = value instanceof Time ? value.text : value;
  const isPlain =
    written === null ||
    typeof written === 'string' ||
    typeof written === 'number' ||
    typeof written === 'boolean';
  const old: unknown = doc.getIn(path, true);
  if (isPlain) {
    // A scalar already there keeps its node, so a comment on its line stays;
    // a new one is made a node, so it can be quoted.
    doc.setIn(path, isScalar(old) ? written : doc.createNode(written));
    // A time stays bare when a form writes it as one, or when it replaces a
    // time the file holds bare.
    const bareTime =
      time ||
      (isScalar(old) &&
        old.type === 'PLAIN' &&
        typeof written === 'string' &&
        PYTHON_TIME.test(written));
    if (!bareTime) quoteForPython(doc.getIn(path, true));
    return;
  }
  if (isRecord(value) && isMap(old)) {
    // A mapping already there is changed key by key, keeping its style, its
    // key order and the comments in it.
    for (const pair of [...old.items]) {
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
  const node = doc.createNode(value, { flow });
  quoteForPython(node);
  // The node it replaces may carry the comment on its line or the one above
  // it; the new value keeps them, as a scalar written in place does.
  if (isNode(old)) {
    node.comment = old.comment;
    node.commentBefore = old.commentBefore;
  }
  doc.setIn(path, node);
}

/**
 * A value typed into a field, as the file should hold it: a number when it
 * reads as one, `true` or `false` as a bool, and anything else as text. An
 * empty field is no value. Used where the form cannot know the type, such as
 * an input's value, which the workflow declares.
 */
export function scalarOf(text: string): string | number | boolean | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return undefined;
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (/^-?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(trimmed)) return Number(trimmed);
  return text;
}

/** A field's text for a value read from the file. */
export function textOf(value: unknown): string {
  if (value === undefined || value === null) return '';
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
  if (!/^-?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(trimmed)) return Number.NaN;
  return Number(trimmed);
}

/** Why a number field cannot be saved, or undefined when it can. */
export function numberProblem(text: string, whole = false): string | undefined {
  const value = numberOf(text);
  if (value === undefined) return undefined;
  if (Number.isNaN(value)) return 'Not a number.';
  if (whole && !Number.isInteger(value)) return 'A whole number.';
  return undefined;
}
