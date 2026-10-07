import {
  isMap,
  isScalar,
  isSeq,
  parseDocument,
  type Document,
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

/** The file's text as a document, or the first reason it is not one. */
export function parseYaml(text: string): { doc: Doc } | { error: string } {
  const doc = parseDocument(text, { prettyErrors: true });
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
  const isPlain =
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean';
  if (isPlain) {
    doc.setIn(path, value);
    return;
  }
  const flat = (item: unknown) =>
    !isRecord(item) &&
    (!Array.isArray(item) || item.every((inner) => !isRecord(inner)));
  const flow = Array.isArray(value)
    ? value.every(flat)
    : isRecord(value) && Object.values(value).every(flat);
  doc.setIn(path, doc.createNode(value, { flow }));
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
