import { isRecord, type Values } from '../forms/values';
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
 * Every change the editor makes to the draft's values. Each takes the values
 * and gives new ones; the server writes them into `workflow.yaml`.
 */

type Mapping = Record<string, unknown>;

const TOP_ORDER = ['description', 'inputs', 'steps', 'outputs'];

/** `edit` applied to a copy of `values`; it may give a new object instead. */
function edited(values: Values, edit: (draft: Values) => Values | void): Values {
  const draft = structuredClone(values);
  return edit(draft) ?? draft;
}

/** The top-level mapping or list `key`, made in the format's place when missing. */
function top(draft: Values, key: string, list: true): unknown[];
function top(draft: Values, key: string, list?: false): Mapping;
function top(draft: Values, key: string, list = false): Mapping | unknown[] {
  const found = draft[key];
  if (list ? Array.isArray(found) : isRecord(found))
    return found as Mapping | unknown[];
  const made = list ? [] : {};
  const placed = key in draft;
  draft[key] = made;
  if (!placed) {
    const rank = TOP_ORDER.indexOf(key);
    const names = Object.keys(draft);
    const from = names.findIndex((name) => TOP_ORDER.indexOf(name) > rank);
    // Keys after its place move behind it, keeping their order.
    if (from >= 0)
      for (const name of names.slice(from)) {
        if (name === key) continue;
        const value = draft[name];
        delete draft[name];
        draft[name] = value;
      }
  }
  return made;
}

function stepsIn(draft: Values): unknown[] {
  return Array.isArray(draft.steps) ? (draft.steps as unknown[]) : [];
}

/** The step at `index`, or null when it is not a mapping. */
function stepAt(draft: Values, index: number): Mapping | null {
  const step = stepsIn(draft)[index];
  return isRecord(step) ? step : null;
}

/** The step's `with`, made a mapping when it is missing. */
function withOf(step: Mapping): Mapping {
  if (!isRecord(step.with)) step.with = {};
  return step.with as Mapping;
}

/** `map` with the key `from` called `to`, in its place. */
function renamedKey(map: Mapping, from: string, to: string): Mapping {
  return Object.fromEntries(
    Object.entries(map).map(([key, value]) => [key === from ? to : key, value]),
  );
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

/** Put the steps in `order`, indexes into the old order. */
function reorder(draft: Values, order: number[]): void {
  const old = stepsIn(draft);
  draft.steps = order.map((at) => old[at]).filter((item) => item !== undefined);
}

function rewritten(value: unknown, change: (text: string) => string): unknown {
  if (typeof value === 'string') return change(value);
  if (Array.isArray(value)) return value.map((item) => rewritten(item, change));
  if (isRecord(value))
    return Object.fromEntries(
      Object.entries(value).map(([key, inner]) => [key, rewritten(inner, change)]),
    );
  return value;
}

/** Every string in the steps' ports and the outputs, rewritten by `change`. */
function rewriteStrings(draft: Values, change: (text: string) => string): void {
  for (const step of stepsIn(draft))
    if (isRecord(step) && isRecord(step.with)) step.with = rewritten(step.with, change);
  if (isRecord(draft.outputs)) draft.outputs = rewritten(draft.outputs, change);
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
function dropUses(draft: Values, kind: Ref['kind'], name: string): void {
  const readsIt = (value: unknown) =>
    typeof value === 'string' && reads(value, kind, name);
  for (const step of stepsIn(draft)) {
    if (!isRecord(step) || !isRecord(step.with)) continue;
    const given = step.with;
    for (const port of Object.keys(given)) if (readsIt(given[port])) delete given[port];
  }
  const outputs = draft.outputs;
  if (!isRecord(outputs)) return;
  for (const [entry, value] of Object.entries(outputs))
    if (readsIt(value) || (isRecord(value) && readsIt(value.from)))
      delete outputs[entry];
}

// Steps

/** A step that uses a run workflow, added at the end. */
export function addUse(values: Values, ref: string, name: string): Values {
  const taken = readWorkflow(values).steps.map((step) => step.id);
  const id = freeName(name, taken);
  return edited(values, (draft) => {
    top(draft, 'steps', true).push({ id, use: ref, with: {} });
  });
}

/** A step of `primitive`, added at the end. */
export function addStep(values: Values, primitive: PrimitiveInfo): Values {
  return addUse(values, primitive.ref, primitive.name);
}

/** The step removed, with every wire from it and every output reading it. */
export function removeStep(values: Values, index: number): Values {
  const workflow = readWorkflow(values);
  const step = workflow.steps[index];
  if (step === undefined) return values;
  return edited(values, (draft) => {
    stepsIn(draft).splice(index, 1);
    if (!workflow.steps.some((other, at) => at !== index && other.id === step.id))
      dropUses(draft, 'steps', step.id);
  });
}

/** What the workflow says it does, first in the file; nothing said removes it. */
export function setDescription(values: Values, description: string): Values {
  const said = description.trim();
  return edited(values, (draft) => {
    if (said === '') delete draft.description;
    else if ('description' in draft) draft.description = said;
    else return { description: said, ...draft };
  });
}

/** The step renamed, every reference to it following. */
export function renameStep(values: Values, index: number, id: string): Values {
  const step = readWorkflow(values).steps[index];
  if (step === undefined || step.id === id) return values;
  return edited(values, (draft) => {
    const node = stepAt(draft, index);
    if (node !== null) node.id = id;
    rewriteStrings(draft, (value) => renamed(value, 'steps', step.id, id));
  });
}

/** The step's primitive at another version. */
export function setUse(values: Values, index: number, use: string): Values {
  return edited(values, (draft) => {
    const node = stepAt(draft, index);
    if (node !== null) node.use = use;
  });
}

// Ports

/**
 * The port wired from `ref`; when it reads a step listed after this one, the
 * steps reordered so every step comes after what it reads.
 */
export function wire(values: Values, index: number, port: string, ref: Ref): Values {
  const before = readWorkflow(values);
  return edited(values, (draft) => {
    const node = stepAt(draft, index);
    if (node === null) return;
    withOf(node)[port] = refText(ref);
    if (ref.kind !== 'steps') return;
    const read = before.steps.findIndex((step) => step.id === ref.name);
    if (read > index) reorder(draft, orderAfterWire(readWorkflow(draft), index, read));
  });
}

/** The port given a value: a number, a boolean, or a string with references written in. */
export function setValue(
  values: Values,
  index: number,
  port: string,
  value: string | number | boolean,
): Values {
  return edited(values, (draft) => {
    const node = stepAt(draft, index);
    if (node !== null) withOf(node)[port] = value;
  });
}

/** The port left without a value or a wire. */
export function clearPort(values: Values, index: number, port: string): Values {
  return edited(values, (draft) => {
    const given = stepAt(draft, index)?.with;
    if (isRecord(given)) delete given[port];
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
export function setInput(values: Values, id: string, fields: InputFields): Values {
  return edited(values, (draft) => {
    top(draft, 'inputs')[id] = declarationNode(fields);
  });
}

/** An input renamed, every reference to it following. */
export function renameInput(values: Values, from: string, to: string): Values {
  return edited(values, (draft) => {
    if (isRecord(draft.inputs)) draft.inputs = renamedKey(draft.inputs, from, to);
    rewriteStrings(draft, (value) => renamed(value, 'inputs', from, to));
  });
}

/** Every reference that is `from` written as `to`, wherever the steps and the outputs read it. */
function swapRefs(draft: Values, from: Ref, to: Ref): void {
  rewriteStrings(draft, (value) =>
    value.replace(REF, (whole) => {
      const ref = wholeRef(whole);
      return ref !== null && sameRef(ref, from) ? refText(to) : whole;
    }),
  );
}

/** Every reference to the workflow file `from` written as one to `to`. */
export function moveFile(values: Values, from: string, to: string): Values {
  return edited(values, (draft) =>
    swapRefs(draft, { kind: 'workflow', name: from }, { kind: 'workflow', name: to }),
  );
}

/** An input the workflow gives instead: every step that read it reads the file at `path`, and the input goes. */
export function inputToFile(values: Values, id: string, path: string): Values {
  return edited(values, (draft) => {
    swapRefs(draft, { kind: 'inputs', name: id }, { kind: 'workflow', name: path });
    if (isRecord(draft.inputs)) delete draft.inputs[id];
  });
}

/** A file of the workflow the task gives instead: the input `id`, of `type`, read wherever the file was. */
export function fileToInput(
  values: Values,
  path: string,
  id: string,
  type: 'file' | 'folder',
): Values {
  return edited(values, (draft) => {
    top(draft, 'inputs')[id] = declarationNode({ type });
    swapRefs(draft, { kind: 'workflow', name: path }, { kind: 'inputs', name: id });
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
export function removeInput(values: Values, id: string): Values {
  return edited(values, (draft) => {
    if (isRecord(draft.inputs)) delete draft.inputs[id];
    dropUses(draft, 'inputs', id);
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
export function setEntry(values: Values, name: string, fields: EntryFields): Values {
  return edited(values, (draft) => {
    const { from, ...meaning } = fields;
    const kept = Object.fromEntries(
      Object.entries(meaning).filter(
        ([, value]) => value !== undefined && value !== null,
      ),
    );
    top(draft, 'outputs')[name] =
      Object.keys(kept).length === 0 ? refText(from) : { from: refText(from), ...kept };
  });
}

export function renameEntry(values: Values, from: string, to: string): Values {
  return edited(values, (draft) => {
    if (isRecord(draft.outputs)) draft.outputs = renamedKey(draft.outputs, from, to);
  });
}

export function removeEntry(values: Values, name: string): Values {
  return edited(values, (draft) => {
    if (isRecord(draft.outputs)) delete draft.outputs[name];
  });
}
