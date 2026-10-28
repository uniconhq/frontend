import {
  isMap,
  isScalar,
  isSeq,
  type Document,
  type YAMLMap,
  type YAMLSeq,
} from 'yaml';
import {
  exactJS,
  nodeFor,
  parseYaml,
  writeAt,
  writeOver,
  writeYaml,
  type NumberText,
} from '../forms/yaml-doc';
import {
  readWorkflow,
  refText,
  sameRef,
  wholeRef,
  type Ref,
  type OutputEntry,
  type Workflow,
} from './model';
import type { PrimitiveInfo } from './primitives';
import { orderAfterWire } from './rules';

/**
 * Every change the editor makes, as an edit of the `workflow.yaml` document
 * in place (#372): only the nodes a change touches are written, so comments,
 * key order and anything the page does not show stay as they were. Each
 * takes the file's text and gives the new text; a text that is not YAML is
 * given back as it is.
 */

const TOP_ORDER = ['description', 'inputs', 'steps', 'outputs'];

type Edit = (doc: Document) => void;

/** `edit` applied to the document `text` holds. */
function edited(text: string, edit: Edit): string {
  const parsed = parseYaml(text);
  if ('error' in parsed) return text;
  const { doc } = parsed;
  if (doc.contents === null || !isMap(doc.contents)) doc.contents = doc.createNode({});
  edit(doc);
  return writeOver(text, doc);
}

/** The workflow `text` holds now. */
export function workflowOf(text: string): Workflow {
  const parsed = parseYaml(text);
  return readWorkflow('error' in parsed ? null : exactJS(parsed.doc));
}

/** The top-level mapping or list `key`, made in the format's place when missing. */
function top<T extends YAMLMap | YAMLSeq>(doc: Document, key: string, list = false): T {
  const root = doc.contents as YAMLMap;
  const found: unknown = root.get(key, true);
  if ((list && isSeq(found)) || (!list && isMap(found))) {
    // An empty `[]` or `{}` takes its first entry as a block, an entry to a line.
    const collection = found as T;
    if (collection.items.length === 0) collection.flow = false;
    return collection;
  }
  const made = doc.createNode(list ? [] : {}) as T;
  const pair = doc.createPair(key, made);
  const existing = root.items.findIndex(
    (item) => isScalar(item.key) && item.key.value === key,
  );
  if (existing >= 0) {
    root.items[existing] = pair;
    return made;
  }
  const rank = TOP_ORDER.indexOf(key);
  const before = root.items.findIndex((item) => {
    const name = isScalar(item.key) ? String(item.key.value) : '';
    const at = TOP_ORDER.indexOf(name);
    return at > rank;
  });
  if (before < 0) root.items.push(pair);
  else root.items.splice(before, 0, pair);
  return made;
}

function stepsOf(doc: Document): YAMLSeq {
  return top<YAMLSeq>(doc, 'steps', true);
}

/** The node of the step at `index`. */
function stepNode(doc: Document, index: number): YAMLMap | null {
  const item: unknown = stepsOf(doc).items[index];
  return isMap(item) ? item : null;
}

/** The step's `with`, made a mapping when it is missing or empty. */
function withOf(doc: Document, step: YAMLMap): YAMLMap {
  const found: unknown = step.get('with', true);
  if (isMap(found)) {
    // An empty `with: {}` takes its first port as a block, a port to a line.
    if (found.items.length === 0) found.flow = false;
    return found;
  }
  const made = doc.createNode({}) as YAMLMap;
  step.set('with', made);
  return made;
}

/** A declaration as the file writes it: the type alone, or a one-line mapping. */
function declarationNode(declaration: Record<string, unknown>): unknown {
  const kept = Object.fromEntries(
    Object.entries(declaration).filter(
      ([key, value]) =>
        value !== undefined &&
        value !== null &&
        value !== false &&
        value !== '' &&
        key !== '',
    ),
  );
  return Object.keys(kept).length === 1 && typeof kept.type === 'string'
    ? kept.type
    : kept;
}

/** The names inputs and outputs share: the forge refuses an output named as an input. */
export function sharedNames(workflow: Workflow): string[] {
  return [
    ...workflow.inputs.map((input) => input.id),
    ...workflow.outputs.map((entry) => entry.name),
  ];
}

/** A free id for a new step, input or output: `base`, then `base-2`, `base-3`. */
export function freeName(base: string, taken: string[], separator = '-'): string {
  if (!taken.includes(base)) return base;
  for (let number = 2; ; number += 1) {
    const candidate = `${base}${separator}${number}`;
    if (!taken.includes(candidate)) return candidate;
  }
}

/** Put the steps in `order`, indexes into the old order, keeping each node whole. */
function reorder(doc: Document, order: number[]): void {
  const steps = stepsOf(doc);
  const old = [...steps.items];
  steps.items = order.map((at) => old[at]).filter((item) => item !== undefined);
}

/** Every string in the steps' ports and the outputs, rewritten by `change`. */
function rewriteStrings(doc: Document, change: (text: string) => string): void {
  const visit = (node: unknown) => {
    if (isMap(node)) {
      for (const pair of node.items) {
        if (isScalar(pair.value) && typeof pair.value.value === 'string') {
          pair.value.value = change(pair.value.value);
        } else visit(pair.value);
      }
    }
  };
  for (const step of stepsOf(doc).items) if (isMap(step)) visit(step.get('with', true));
  const listed: unknown = (doc.contents as YAMLMap).get('outputs', true);
  if (!isMap(listed)) return;
  for (const pair of listed.items) {
    if (isScalar(pair.value) && typeof pair.value.value === 'string') {
      pair.value.value = change(pair.value.value);
    } else visit(pair.value);
  }
}

const REF = /\$\{\{\s*([^{}]*?)\s*\}\}/g;

/** `text` with every reference to `from` written as a reference to `to`. */
function renamed(text: string, kind: Ref['kind'], from: string, to: string): string {
  return text.replace(REF, (whole, inner: string) => {
    const parts = inner.split('.');
    if (parts[0] !== kind || parts[1] !== from) return whole;
    return `\${{ ${[kind, to, ...parts.slice(2)].join('.')} }}`;
  });
}

/** Whether `text` reads `name` of `kind`. */
function reads(text: string, kind: Ref['kind'], name: string): boolean {
  for (const match of text.matchAll(REF)) {
    const parts = (match[1] ?? '').split('.');
    if (parts[0] === kind && parts[1] === name) return true;
  }
  return false;
}

/** Remove every port value and output that reads `name` of `kind`. */
function dropUses(doc: Document, kind: Ref['kind'], name: string): void {
  for (const step of stepsOf(doc).items) {
    if (!isMap(step)) continue;
    const given: unknown = step.get('with', true);
    if (!isMap(given)) continue;
    given.items = given.items.filter(
      (pair) =>
        !(
          isScalar(pair.value) &&
          typeof pair.value.value === 'string' &&
          reads(pair.value.value, kind, name)
        ),
    );
  }
  const outputs: unknown = (doc.contents as YAMLMap).get('outputs', true);
  if (!isMap(outputs)) return;
  outputs.items = outputs.items.filter((pair) => {
    const value = pair.value;
    if (isScalar(value) && typeof value.value === 'string')
      return !reads(value.value, kind, name);
    if (isMap(value)) {
      const from: unknown = value.get('from');
      return !(typeof from === 'string' && reads(from, kind, name));
    }
    return true;
  });
}

// Steps

/** A step that uses a run workflow, added at the end. */
export function addUse(text: string, ref: string, name: string): string {
  const workflow = workflowOf(text);
  const id = freeName(
    name,
    workflow.steps.map((step) => step.id),
  );
  return edited(text, (doc) => {
    stepsOf(doc).items.push(nodeFor(doc, { id, use: ref, with: {} }));
  });
}

/** A step of `primitive`, added at the end. */
export function addStep(text: string, primitive: PrimitiveInfo): string {
  const workflow = workflowOf(text);
  const id = freeName(
    primitive.name,
    workflow.steps.map((step) => step.id),
  );
  return edited(text, (doc) => {
    stepsOf(doc).items.push(nodeFor(doc, { id, use: primitive.ref, with: {} }));
  });
}

/** The step removed, with every wire from it and every output reading it. */
export function removeStep(text: string, index: number): string {
  const workflow = workflowOf(text);
  const step = workflow.steps[index];
  if (step === undefined) return text;
  return edited(text, (doc) => {
    stepsOf(doc).items.splice(index, 1);
    if (!workflow.steps.some((other, at) => at !== index && other.id === step.id))
      dropUses(doc, 'steps', step.id);
  });
}

/** What the workflow says it does, first in the file; nothing said removes it. */
export function setDescription(text: string, description: string): string {
  const said = description.trim();
  return edited(text, (doc) => {
    const root = doc.contents as YAMLMap;
    if (said === '') root.delete('description');
    else if (root.has('description')) root.set('description', said);
    else root.items.unshift(doc.createPair('description', said));
  });
}

/** The step renamed, every reference to it following. */
export function renameStep(text: string, index: number, id: string): string {
  const step = workflowOf(text).steps[index];
  if (step === undefined || step.id === id) return text;
  return edited(text, (doc) => {
    writeAt(doc, ['steps', index, 'id'], id);
    rewriteStrings(doc, (value) => renamed(value, 'steps', step.id, id));
  });
}

/** The step's primitive at another version. */
export function setUse(text: string, index: number, use: string): string {
  return edited(text, (doc) => writeAt(doc, ['steps', index, 'use'], use));
}

// Ports

/**
 * The port wired from `ref`; when it reads a step listed after this one, the
 * steps reordered so every step comes after what it reads.
 */
export function wire(text: string, index: number, port: string, ref: Ref): string {
  const before = workflowOf(text);
  return edited(text, (doc) => {
    const node = stepNode(doc, index);
    if (node === null) return;
    withOf(doc, node).set(port, refText(ref));
    if (ref.kind !== 'steps') return;
    const read = before.steps.findIndex((step) => step.id === ref.name);
    if (read > index) {
      const after = workflowOf(writeYaml(doc));
      reorder(doc, orderAfterWire(after, index, read));
    }
  });
}

/** The port given a value: a number, a boolean, or a string with references written in. */
export function setValue(
  text: string,
  index: number,
  port: string,
  value: string | NumberText | boolean,
): string {
  return edited(text, (doc) => {
    const node = stepNode(doc, index);
    if (node === null) return;
    withOf(doc, node);
    writeAt(doc, ['steps', index, 'with', port], value);
  });
}

/** The port left without a value or a wire. */
export function clearPort(text: string, index: number, port: string): string {
  return edited(text, (doc) => {
    const given: unknown = stepNode(doc, index)?.get('with', true);
    if (isMap(given)) given.delete(port);
  });
}

// Inputs

/**
 * An input's declaration: its type and what the format allows with it, and
 * what the task's form names it (#434), each left out of the file when it is
 * empty, false or null.
 */
export type InputFields = {
  type: string;
  options?: string[] | null;
  optional?: boolean;
  title?: string | null;
  help?: string | null;
  unit?: string | null;
};

/** An input declared, or its declaration changed. */
export function setInput(text: string, id: string, fields: InputFields): string {
  return edited(text, (doc) => {
    top<YAMLMap>(doc, 'inputs');
    writeAt(doc, ['inputs', id], declarationNode(fields));
  });
}

function renameKey(doc: Document, section: string, from: string, to: string): void {
  const map: unknown = (doc.contents as YAMLMap).get(section, true);
  if (!isMap(map)) return;
  for (const pair of map.items)
    if (isScalar(pair.key) && pair.key.value === from) pair.key.value = to;
}

/** An input renamed, every reference to it following. */
export function renameInput(text: string, from: string, to: string): string {
  return edited(text, (doc) => {
    renameKey(doc, 'inputs', from, to);
    rewriteStrings(doc, (value) => renamed(value, 'inputs', from, to));
  });
}

/** Every reference that is `from` written as `to`, wherever the steps and the outputs read it. */
function swapRefs(doc: Document, from: Ref, to: Ref): void {
  rewriteStrings(doc, (value) =>
    value.replace(REF, (whole) => {
      const ref = wholeRef(whole);
      return ref !== null && sameRef(ref, from) ? refText(to) : whole;
    }),
  );
}

/** Every reference to the workflow file `from` written as one to `to`. */
export function moveFile(text: string, from: string, to: string): string {
  return edited(text, (doc) =>
    swapRefs(doc, { kind: 'workflow', name: from }, { kind: 'workflow', name: to }),
  );
}

/** An input the workflow gives instead: every step that read it reads the file at `path`, and the input goes. */
export function inputToFile(text: string, id: string, path: string): string {
  return edited(text, (doc) => {
    swapRefs(doc, { kind: 'inputs', name: id }, { kind: 'workflow', name: path });
    writeAt(doc, ['inputs', id], undefined);
  });
}

/** A file of the workflow the task gives instead: the input `id`, of `type`, read wherever the file was. */
export function fileToInput(
  text: string,
  path: string,
  id: string,
  type: 'file' | 'folder',
): string {
  return edited(text, (doc) => {
    top<YAMLMap>(doc, 'inputs');
    writeAt(doc, ['inputs', id], declarationNode({ type }));
    swapRefs(doc, { kind: 'workflow', name: path }, { kind: 'inputs', name: id });
  });
}

/**
 * An input's id made from a file's path: its last part, without its
 * extension, as the forge takes a name, starting with a letter.
 */
export function idOfPath(path: string): string {
  const last = path.replace(/\/$/, '').split('/').pop() ?? '';
  const stem = last.includes('.') ? last.slice(0, last.lastIndexOf('.')) : last;
  const words = stem
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (words === '') return 'file';
  return (/^[a-z]/.test(words) ? words : `file_${words}`)
    .slice(0, 40)
    .replace(/_+$/, '');
}

/** An input removed, with every port value and output reading it. */
export function removeInput(text: string, id: string): string {
  return edited(text, (doc) => {
    writeAt(doc, ['inputs', id], undefined);
    dropUses(doc, 'inputs', id);
  });
}

// The outputs

export type EntryFields = {
  from: Ref;
  /** What pages call the value, "Run time", and what it is counted in, "ms". */
  title?: string | null;
  unit?: string | null;
};

/**
 * An entry's fields with `changed` written over them, its unit dropped when
 * what it reads is known not to be a number, as an input's is when its type
 * changes away (M54); `type` is the type of the output it reads, or null when
 * the primitive's declaration is not known.
 */
export function entryFields(
  entry: OutputEntry,
  type: string | null,
  changed: Partial<EntryFields> & { from: Ref },
): EntryFields {
  const fields: EntryFields = {
    title: entry.title,
    unit: entry.unit,
    ...changed,
  };
  if (type !== null && type !== 'number') fields.unit = null;
  return fields;
}

/** An output written, in the short form when it only reads a step's output. */
export function setEntry(text: string, name: string, fields: EntryFields): string {
  return edited(text, (doc) => {
    top<YAMLMap>(doc, 'outputs');
    const { from, ...meaning } = fields;
    const kept = Object.fromEntries(
      Object.entries(meaning).filter(
        ([, value]) => value !== undefined && value !== null,
      ),
    );
    const value =
      Object.keys(kept).length === 0 ? refText(from) : { from: refText(from), ...kept };
    writeAt(doc, ['outputs', name], value);
  });
}

export function renameEntry(text: string, from: string, to: string): string {
  return edited(text, (doc) => renameKey(doc, 'outputs', from, to));
}

export function removeEntry(text: string, name: string): string {
  return edited(text, (doc) => writeAt(doc, ['outputs', name], undefined));
}
