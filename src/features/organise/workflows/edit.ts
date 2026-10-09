import {
  isMap,
  isScalar,
  isSeq,
  type Document,
  type YAMLMap,
  type YAMLSeq,
} from 'yaml';
import { nodeFor, parseYaml, writeAt, writeYaml } from '../forms/yaml-doc';
import { readWorkflow, refText, type Ref, type Workflow } from './model';
import type { PrimitiveInfo } from './primitives';
import { orderAfterWire } from './rules';

/**
 * Every change the editor makes, as an edit of the `workflow.yaml` document
 * in place (#372): only the nodes a change touches are written, so comments,
 * key order and anything the page does not show stay as they were. Each
 * takes the file's text and gives the new text; a text that is not YAML is
 * given back as it is.
 */

const TOP_ORDER = ['inputs', 'test', 'steps', 'report'];

type Edit = (doc: Document) => void;

/** `edit` applied to the document `text` holds. */
function edited(text: string, edit: Edit): string {
  const parsed = parseYaml(text);
  if ('error' in parsed) return text;
  const { doc } = parsed;
  if (doc.contents === null || !isMap(doc.contents)) doc.contents = doc.createNode({});
  edit(doc);
  return writeYaml(doc);
}

/** The workflow `text` holds now. */
export function workflowOf(text: string): Workflow {
  const parsed = parseYaml(text);
  return readWorkflow('error' in parsed ? null : parsed.doc.toJS());
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
        value !== undefined && value !== null && value !== false && key !== '',
    ),
  );
  return Object.keys(kept).length === 1 && typeof kept.type === 'string'
    ? kept.type
    : kept;
}

/** A free id for a new step, input, field or entry: `base`, then `base-2`, `base-3`. */
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

/** Every string in the steps' ports and the report, rewritten by `change`. */
function rewriteStrings(doc: Document, change: (text: string) => string): void {
  const visit = (node: unknown) => {
    if (isMap(node)) {
      for (const pair of node.items) {
        if (isScalar(pair.value) && typeof pair.value.value === 'string')
          pair.value.value = change(pair.value.value);
        else visit(pair.value);
      }
    }
  };
  for (const step of stepsOf(doc).items) if (isMap(step)) visit(step.get('with', true));
  const report: unknown = (doc.contents as YAMLMap).get('report', true);
  if (isMap(report)) {
    for (const pair of report.items) {
      if (isScalar(pair.value) && typeof pair.value.value === 'string')
        pair.value.value = change(pair.value.value);
      else visit(pair.value);
    }
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

/** Remove every port value and report entry that reads `name` of `kind`. */
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
  const report: unknown = (doc.contents as YAMLMap).get('report', true);
  if (!isMap(report)) return;
  report.items = report.items.filter((pair) => {
    const value = pair.value;
    if (isScalar(value) && typeof value.value === 'string')
      return !reads(value.value, kind, name);
    if (isMap(value)) {
      const from: unknown = value.get('from');
      const better: unknown = value.get('better');
      return !(
        (typeof from === 'string' && reads(from, kind, name)) ||
        (typeof better === 'string' && reads(better, kind, name))
      );
    }
    return true;
  });
}

// Steps

/** A step of `primitive` added, once before every per-test step, per test at the end. */
export function addStep(
  text: string,
  primitive: PrimitiveInfo,
  perTest = false,
): string {
  const workflow = workflowOf(text);
  const id = freeName(
    primitive.name,
    workflow.steps.map((step) => step.id),
  );
  return edited(text, (doc) => {
    const node = nodeFor(
      doc,
      perTest
        ? { id, use: primitive.ref, per_test: true, with: {} }
        : { id, use: primitive.ref, with: {} },
    );
    const steps = stepsOf(doc);
    const firstPerTest = workflow.steps.findIndex((step) => step.perTest);
    if (perTest || firstPerTest < 0) steps.items.push(node);
    else steps.items.splice(firstPerTest, 0, node);
  });
}

/** The step removed, with every wire from it and every report entry reading it. */
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

/** The step renamed, every reference to it following. */
export function renameStep(text: string, index: number, id: string): string {
  const step = workflowOf(text).steps[index];
  if (step === undefined || step.id === id) return text;
  return edited(text, (doc) => {
    stepNode(doc, index)?.set('id', id);
    rewriteStrings(doc, (value) => renamed(value, 'steps', step.id, id));
  });
}

/** The step's primitive at another version. */
export function setUse(text: string, index: number, use: string): string {
  return edited(text, (doc) => stepNode(doc, index)?.set('use', use));
}

/**
 * The step switched between once and per test, moved the fewest places to
 * keep every once step before every per-test step.
 */
export function setPerTest(text: string, index: number, perTest: boolean): string {
  const workflow = workflowOf(text);
  return edited(text, (doc) => {
    const node = stepNode(doc, index);
    if (node === null) return;
    if (perTest) node.set('per_test', true);
    else node.delete('per_test');
    const others = workflow.steps.map((_, at) => at).filter((at) => at !== index);
    const where = others.findIndex((at) => at > index);
    let place = where < 0 ? others.length : where;
    if (perTest) {
      const lastOnce = others.filter((at) => !workflow.steps[at]?.perTest).at(-1);
      if (lastOnce !== undefined && lastOnce > index)
        place = others.indexOf(lastOnce) + 1;
    } else {
      const firstPerTest = others.find((at) => workflow.steps[at]?.perTest);
      if (firstPerTest !== undefined && firstPerTest < index)
        place = others.indexOf(firstPerTest);
    }
    others.splice(place, 0, index);
    reorder(doc, others);
  });
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
  value: string | number | boolean,
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

// Inputs and test fields

export type InputFields = {
  type: string;
  contestant?: boolean;
  options?: string[] | null;
  per_test?: boolean;
  optional?: boolean;
};

export type FieldFields = { type: string; options?: string[] | null; public?: boolean };

/** An input declared, or its declaration changed. */
export function setInput(text: string, id: string, fields: InputFields): string {
  return edited(text, (doc) => {
    top<YAMLMap>(doc, 'inputs');
    writeAt(doc, ['inputs', id], declarationNode(fields));
  });
}

/** A test field declared, or its declaration changed. */
export function setField(text: string, name: string, fields: FieldFields): string {
  return edited(text, (doc) => {
    top<YAMLMap>(doc, 'test');
    writeAt(doc, ['test', name], declarationNode(fields));
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

/** A test field renamed, every reference to it following. */
export function renameField(text: string, from: string, to: string): string {
  return edited(text, (doc) => {
    renameKey(doc, 'test', from, to);
    rewriteStrings(doc, (value) => renamed(value, 'test', from, to));
  });
}

/** An input removed, with every port value and report entry reading it. */
export function removeInput(text: string, id: string): string {
  return edited(text, (doc) => {
    writeAt(doc, ['inputs', id], undefined);
    dropUses(doc, 'inputs', id);
  });
}

/** A test field removed, with every port value reading it. */
export function removeField(text: string, name: string): string {
  return edited(text, (doc) => {
    writeAt(doc, ['test', name], undefined);
    dropUses(doc, 'test', name);
  });
}

// The report

export type EntryFields = {
  from: Ref;
  fold?: string | null;
  better?: string | null;
  at_least?: number | null;
  at_most?: number | null;
};

/** A report entry written, in the short form when it only reads an output. */
export function setEntry(text: string, name: string, fields: EntryFields): string {
  return edited(text, (doc) => {
    top<YAMLMap>(doc, 'report');
    const { from, ...meaning } = fields;
    const kept = Object.fromEntries(
      Object.entries(meaning).filter(
        ([, value]) => value !== undefined && value !== null,
      ),
    );
    const value =
      Object.keys(kept).length === 0 ? refText(from) : { from: refText(from), ...kept };
    writeAt(doc, ['report', name], value);
  });
}

export function renameEntry(text: string, from: string, to: string): string {
  return edited(text, (doc) => renameKey(doc, 'report', from, to));
}

export function removeEntry(text: string, name: string): string {
  return edited(text, (doc) => writeAt(doc, ['report', name], undefined));
}
