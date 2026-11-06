import { refsOf, type Ref, type Workflow } from './model';
import type { BoxDecl } from './boxes';
import { declared, type PrimitiveInfo } from './primitives';
import { typeArticle } from './words';

/**
 * What a wire edit does, not what the forge allows: the port a wire dropped
 * on a box goes to, the order of the steps after it, and no loop, which no
 * order can hold. While dragging, a port the server says does not take the
 * wire's type is greyed out; every other problem comes from the check after
 * the drop.
 */

type Index = Map<string, number>;

function indexOf(workflow: Workflow): Index {
  const found = new Map<string, number>();
  workflow.steps.forEach((step, at) => {
    if (!found.has(step.id)) found.set(step.id, at);
  });
  return found;
}

/** The steps `index` reads, by their indexes, through wires and written-in text. */
function stepsRead(workflow: Workflow, index: number): Set<number> {
  const indexes = indexOf(workflow);
  const found = new Set<number>();
  const step = workflow.steps[index];
  if (step === undefined) return found;
  for (const value of Object.values(step.with))
    for (const ref of refsOf(value))
      if (ref.kind === 'steps') {
        const read = indexes.get(ref.name);
        if (read !== undefined && read !== index) found.add(read);
      }
  return found;
}

/** Every step `index` reads, directly or through others. */
function upstream(workflow: Workflow, index: number): Set<number> {
  const found = new Set<number>();
  const visit = (at: number) => {
    for (const read of stepsRead(workflow, at))
      if (!found.has(read)) {
        found.add(read);
        visit(read);
      }
  };
  visit(index);
  return found;
}

/** Every step that reads `index`, directly or through others. */
function downstream(workflow: Workflow, index: number): Set<number> {
  const found = new Set<number>();
  workflow.steps.forEach((_, at) => {
    if (at !== index && upstream(workflow, at).has(index)) found.add(at);
  });
  return found;
}

/** One of a step's input ports, as its primitive or the workflow it runs declares it. */
export type StepInput = {
  name: string;
  type: string;
  options: string[] | null;
  optional: boolean;
  /** The types a wire into it may carry, as the server says. */
  accepts: string[];
};

/**
 * The input ports a step declares, from its primitive or the run workflow it
 * uses; null when it uses neither one Unicon knows.
 */
export function stepInputs(
  primitives: Map<string, PrimitiveInfo>,
  boxes: ReadonlyMap<string, BoxDecl>,
  step: Workflow['steps'][number],
): StepInput[] | null {
  const primitive = declared(primitives, step);
  if (primitive !== null)
    return Object.entries(primitive.inputs).map(([name, port]) => ({
      name,
      type: port.type,
      options: port.options,
      optional: port.optional,
      accepts: port.accepts ?? [],
    }));
  const boxed = boxes.get(step.use);
  return boxed?.run === true ? boxed.inputs : null;
}

/** The outputs a step declares, by name and type, from its primitive or the workflow it runs. */
export function stepOutputs(
  primitives: Map<string, PrimitiveInfo>,
  boxes: ReadonlyMap<string, BoxDecl>,
  step: Workflow['steps'][number],
): { name: string; type: string | null }[] {
  const primitive = declared(primitives, step);
  if (primitive !== null)
    return Object.entries(primitive.outputs).map(([name, port]) => ({
      name,
      type: port.type,
    }));
  const boxed = boxes.get(step.use);
  return boxed?.run === true ? boxed.outputs : [];
}

/** The type of what `ref` gives, or null when the page doesn't know it. */
function sourceType(
  workflow: Workflow,
  primitives: Map<string, PrimitiveInfo>,
  ref: Ref,
  boxes: ReadonlyMap<string, BoxDecl>,
): string | null {
  if (ref.kind === 'inputs')
    return workflow.inputs.find((found) => found.id === ref.name)?.type ?? null;
  if (ref.kind === 'workflow') return ref.name.endsWith('/') ? 'folder' : 'file';
  return outputType(workflow, primitives, ref, boxes);
}

/** Why the step at `stepIndex` can't read `source`: no order of the steps holds a loop. */
export function loopRefusal(
  workflow: Workflow,
  stepIndex: number,
  source: Ref,
): string | null {
  if (source.kind !== 'steps') return null;
  const read = indexOf(workflow).get(source.name);
  if (read === stepIndex) return 'A step can’t read its own output.';
  if (read !== undefined && upstream(workflow, read).has(stepIndex))
    return `That would make a loop: ${source.name} already reads this step.`;
  return null;
}

/**
 * Why a wire from `source` can't go to the port `port` of the step at
 * `stepIndex` while dragging, or null when it may be dropped: it would make a
 * loop, or the port doesn't take its type.
 */
export function dragRefusal(
  workflow: Workflow,
  primitives: Map<string, PrimitiveInfo>,
  stepIndex: number,
  port: string,
  source: Ref,
  boxes: ReadonlyMap<string, BoxDecl> = new Map(),
): string | null {
  const step = workflow.steps[stepIndex];
  if (step === undefined) return null;
  const loop = loopRefusal(workflow, stepIndex, source);
  if (loop !== null) return loop;
  const target = stepInputs(primitives, boxes, step)?.find(
    (input) => input.name === port,
  );
  const type = sourceType(workflow, primitives, source, boxes);
  if (target === undefined || type === null || target.accepts.includes(type))
    return null;
  if (target.accepts.length === 0)
    return `This takes ${typeArticle(target.type)}, which no wire gives.`;
  return `This takes ${listed(target.accepts.map(typeArticle))}, not ${typeArticle(type)}.`;
}

/** "a, b or c". */
function listed(words: string[]): string {
  return words.length <= 1
    ? (words[0] ?? '')
    : `${words.slice(0, -1).join(', ')} or ${words.at(-1) ?? ''}`;
}

/**
 * The port of the step at `stepIndex` a wire from `source` goes to when it is
 * dropped on the step's box rather than on a port: the input named as the
 * source is, else the first input given nothing that some wire can fill;
 * or why there is none.
 */
export function portFor(
  workflow: Workflow,
  primitives: Map<string, PrimitiveInfo>,
  stepIndex: number,
  source: Ref,
  boxes: ReadonlyMap<string, BoxDecl> = new Map(),
): { port: string } | { reason: string } {
  const step = workflow.steps[stepIndex];
  if (step === undefined) return { reason: 'There is no such step.' };
  const inputs = stepInputs(primitives, boxes, step);
  if (inputs === null)
    return {
      reason: `${step.use} is not a primitive Unicon knows. Check its owner, name and version.`,
    };
  const name =
    source.kind === 'inputs'
      ? source.name
      : source.kind === 'steps'
        ? source.output
        : null;
  const port =
    inputs.find((found) => found.name === name) ??
    inputs.find(
      (found) => found.accepts.length > 0 && step.with[found.name] === undefined,
    );
  if (port !== undefined) return { port: port.name };
  return {
    reason:
      inputs.length === 0
        ? `${step.id} takes nothing.`
        : `Every input of ${step.id} is given something already. Open it to choose which to change.`,
  };
}

/**
 * The order of `steps:` after the step at `reader` comes to read the one at
 * `read`, as indexes into the old order, moving as few steps as it must:
 * either `read` and what it needs after `reader` move up before it, or
 * `reader` and what needs it before `read` move down after it.
 */
export function orderAfterWire(
  workflow: Workflow,
  reader: number,
  read: number,
): number[] {
  const all = workflow.steps.map((_, at) => at);
  if (read < reader) return all;
  const up = [...upstream(workflow, read), read]
    .filter((at) => at > reader)
    .sort((a, b) => a - b);
  const down = [...downstream(workflow, reader), reader]
    .filter((at) => at < read)
    .sort((a, b) => a - b);
  if (up.length <= down.length) {
    const rest = all.filter((at) => !up.includes(at));
    const place = rest.indexOf(reader);
    return [...rest.slice(0, place), ...up, ...rest.slice(place)];
  }
  const rest = all.filter((at) => !down.includes(at));
  const place = rest.indexOf(read) + 1;
  return [...rest.slice(0, place), ...down, ...rest.slice(place)];
}

/** The type of the step output `ref` names, or null when it is not one its step declares. */
export function outputType(
  workflow: Workflow,
  primitives: Map<string, PrimitiveInfo>,
  ref: Ref | null,
  boxes: ReadonlyMap<string, BoxDecl> = new Map(),
): string | null {
  if (ref?.kind !== 'steps') return null;
  const step = workflow.steps.find((found) => found.id === ref.name);
  if (step === undefined) return null;
  return (
    stepOutputs(primitives, boxes, step).find((output) => output.name === ref.output)
      ?.type ?? null
  );
}

/** The step outputs an output can read: every output of every step. */
export function outputSources(
  workflow: Workflow,
  primitives: Map<string, PrimitiveInfo>,
  boxes: ReadonlyMap<string, BoxDecl> = new Map(),
): Extract<Ref, { kind: 'steps' }>[] {
  return workflow.steps.flatMap((step) =>
    stepOutputs(primitives, boxes, step).map((output) => ({
      kind: 'steps' as const,
      name: step.id,
      output: output.name,
    })),
  );
}
