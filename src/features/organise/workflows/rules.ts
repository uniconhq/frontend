import { NumberText } from '../forms/yaml-doc';
import { refText, refsOf, sameRef, type Ref, type Workflow } from './model';
import type { BoxDecl } from './boxes';
import { declared, raisingPorts, type PrimitiveInfo } from './primitives';

/**
 * What a version of a workflow would refuse that the primitives'
 * declarations decide, asked at the drag rather than at the save (PROPOSAL.md
 * section 12): the type under the two widenings, an enum's options, an
 * optional output into a required port, a step output into a port a limit
 * is raised from, and a loop. Each
 * answer is the reason in a sentence, or null when the wire may be drawn.
 * The sentences are the forge's (`forge.domain.plans.check_workflow` and
 * `forge.domain.workflow_definition`), so the page and the version say the
 * same thing; the few the forge has no need of, such as a loop the page
 * would draw, are the page's own, in the same voice.
 */

const SCALARS = ['text', 'number', 'boolean', 'enum'];

/** A type as a sentence names one value of it, as the forge's `_a` does. */
function a(type: string): string {
  return (
    {
      text: 'text',
      number: 'a number',
      boolean: 'true or false',
      enum: 'one of a list',
      file: 'a file',
      folder: 'a folder',
      outcome: 'an outcome',
    }[type] ?? type
  );
}

/** What a source is, to check it against the port it would feed. */
type Kind = {
  type: string;
  options: string[] | null;
  source: 'input' | 'step' | 'workflow';
  optional: boolean;
};

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

/** What a reference is, or the reason it cannot be read where `stepIndex` reads it. */
function kindOf(
  workflow: Workflow,
  primitives: Map<string, PrimitiveInfo>,
  stepIndex: number | 'outputs',
  ref: Ref,
  boxes: ReadonlyMap<string, BoxDecl> = new Map(),
): Kind | string {
  if (ref.kind === 'inputs') {
    const input = workflow.inputs.find((found) => found.id === ref.name);
    if (input === undefined) return `The workflow has no input called ${ref.name}.`;
    return {
      type: input.type,
      options: input.options,
      source: 'input',
      optional: input.optional,
    };
  }
  if (ref.kind === 'workflow') {
    return {
      type: ref.name.endsWith('/') ? 'folder' : 'file',
      options: null,
      source: 'workflow',
      optional: false,
    };
  }
  const read = indexOf(workflow).get(ref.name);
  const source = read !== undefined ? workflow.steps[read] : undefined;
  if (read === undefined || source === undefined)
    return `There is no step called ${ref.name} before this one.`;
  if (stepIndex !== 'outputs') {
    if (read === stepIndex)
      return `There is no step called ${ref.name} before this one.`;
    if (upstream(workflow, read).has(stepIndex))
      return `That would make a loop: ${ref.name} already reads this step.`;
  }
  const primitive = declared(primitives, source.use);
  const port = primitive?.outputs[ref.output];
  const boxed = boxes
    .get(source.use)
    ?.outputs.find((output) => output.name === ref.output);
  if (port === undefined && (boxed === undefined || boxed.type === null))
    return `The step ${ref.name} has no output called ${ref.output}.`;
  const type = port?.type ?? boxed?.type ?? '';
  if (type === 'outcome')
    return "A step's outcome is read by Unicon itself, and cannot be given to another step.";
  return {
    type,
    options: port?.options ?? null,
    source: 'step',
    optional: port?.optional === true,
  };
}

/** Whether a value of `kind` fits `port`, under the two widenings. */
function fits(
  kind: Kind,
  port: { type: string; options: string[] | null; optional: boolean },
): string | null {
  if (port.type === 'text' && SCALARS.includes(kind.type)) return null;
  if (port.type === 'folder' && kind.type === 'file' && kind.source !== 'workflow')
    return null;
  if (port.type === 'enum') {
    const allowed = port.options ?? [];
    if (kind.type === 'enum' && kind.options !== null) {
      const extra = kind.options.filter((option) => !allowed.includes(option)).sort();
      if (extra.length === 0) return null;
      return `This takes one of ${allowed.join(', ')}, not ${extra.join(', ')}.`;
    }
    return `This takes one of ${allowed.join(', ')}.`;
  }
  if (kind.type !== port.type)
    return `This takes ${a(port.type)}, not ${a(kind.type)}.`;
  return null;
}

/**
 * Why `source` may not be wired into the port `port` of the step at
 * `stepIndex`, or null when it may.
 */
export function wireRefusal(
  workflow: Workflow,
  primitives: Map<string, PrimitiveInfo>,
  stepIndex: number,
  port: string,
  source: Ref,
  boxes: ReadonlyMap<string, BoxDecl> = new Map(),
): string | null {
  const step = workflow.steps[stepIndex];
  if (step === undefined) return 'There is no such step.';
  const primitive = declared(primitives, step.use);
  const boxed = boxes.get(step.use);
  const target =
    primitive?.inputs[port] ??
    (boxed?.run === true
      ? boxed.inputs.find((input) => input.name === port)
      : undefined);
  if (primitive === null && (boxed === undefined || !boxed.run))
    return `${step.use} is not a primitive Unicon knows. Check its owner, name and version.`;
  if (target === undefined) return `${step.use} has no input called ${port}.`;
  const kind = kindOf(workflow, primitives, stepIndex, source, boxes);
  if (typeof kind === 'string') return kind;
  if (primitive !== null && raisingPorts(primitive).has(port) && kind.source === 'step')
    return LIMIT_AT_SAVE;
  if (kind.optional && !target.optional)
    return kind.source === 'step'
      ? 'That output may be missing, so it can be given only to an optional port.'
      : 'That input is optional, so it can be given only to an optional port.';
  return fits(kind, target);
}

const LIMIT_AT_SAVE =
  'This value raises a limit, so it must be known when the task is saved.';

/** Why an output may not be named as an output, or null when it may. */
export function outputRefusal(
  workflow: Workflow,
  primitives: Map<string, PrimitiveInfo>,
  source: Ref,
  boxes: ReadonlyMap<string, BoxDecl> = new Map(),
): string | null {
  if (source.kind !== 'steps')
    return "Only a step's output can be reported, not an input or a file of the workflow.";
  const kind = kindOf(workflow, primitives, 'outputs', source, boxes);
  if (typeof kind === 'string') return kind;
  if (kind.type !== 'text' && kind.type !== 'number')
    return `steps.${source.name}.${source.output} is ${a(kind.type)}, and only text or a number can be reported.`;
  return null;
}

/**
 * Why `text` may not be the value of a port, or null when it may: a plain
 * literal of the port's type, or text with inputs written in, which fits
 * only a text port.
 */
export function valueRefusal(
  workflow: Workflow,
  primitives: Map<string, PrimitiveInfo>,
  stepIndex: number,
  port: string,
  value: string | NumberText | boolean,
  written: Ref[],
): string | null {
  const step = workflow.steps[stepIndex];
  const primitive = step !== undefined ? declared(primitives, step.use) : null;
  const target = primitive?.inputs[port];
  if (step === undefined || primitive === null || target === undefined) return null;
  if (written.length > 0) {
    for (const ref of written) {
      if (ref.kind === 'steps')
        return "A step's output can be given only whole, not written into text.";
      const kind = kindOf(workflow, primitives, stepIndex, ref);
      if (typeof kind === 'string') return kind;
      if (!SCALARS.includes(kind.type))
        return `${refText(ref)} is ${a(kind.type)}, and only text, a number, true or false or an enum can be written into text.`;
      if (kind.optional)
        return `${refText(ref)} is optional, so it can be given only whole, to an optional port, not written into text.`;
    }
    if (raisingPorts(primitive).has(port)) return LIMIT_AT_SAVE;
    if (target.type === 'enum')
      return `This takes one of ${(target.options ?? []).join(', ')}.`;
    if (target.type !== 'text') return `This takes ${a(target.type)}, not text.`;
    return null;
  }
  if (target.type === 'enum' && typeof value !== 'string')
    return `This takes one of ${(target.options ?? []).join(', ')}.`;
  if (typeof value === 'boolean')
    return ['boolean', 'text'].includes(target.type)
      ? null
      : `This takes ${a(target.type)}, not true or false.`;
  if (value instanceof NumberText)
    return ['number', 'text'].includes(target.type)
      ? null
      : `This takes ${a(target.type)}, not a number.`;
  if (target.type === 'enum') {
    const allowed = target.options ?? [];
    return allowed.includes(value) ? null : `This takes one of ${allowed.join(', ')}.`;
  }
  if (target.type !== 'text') return `This takes ${a(target.type)}, not text.`;
  return null;
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

/** Every reference to `ref` in the workflow's ports and outputs. */
function usesOf(
  workflow: Workflow,
  ref: Ref,
): { step: number | 'outputs'; port: string }[] {
  const found: { step: number | 'outputs'; port: string }[] = [];
  workflow.steps.forEach((step, at) => {
    for (const [port, value] of Object.entries(step.with))
      if (refsOf(value).some((each) => sameRef(each, ref)))
        found.push({ step: at, port });
  });
  for (const entry of workflow.outputs)
    if (entry.from && sameRef(entry.from, ref))
      found.push({ step: 'outputs', port: entry.name });
  return found;
}

/**
 * Whether an input may be marked `optional`: one every use of which is a
 * whole wire into a port the primitive marks optional.
 */
export function mayBeOptional(
  workflow: Workflow,
  primitives: Map<string, PrimitiveInfo>,
  id: string,
): boolean {
  const input = workflow.inputs.find((found) => found.id === id);
  if (input === undefined) return false;
  const uses = usesOf(workflow, { kind: 'inputs', name: id });
  return uses.every((use) => {
    if (use.step === 'outputs') return false;
    const step = workflow.steps[use.step];
    const value = step?.with[use.port];
    if (step === undefined || value?.kind !== 'wire') return false;
    return declared(primitives, step.use)?.inputs[use.port]?.optional === true;
  });
}

/**
 * Every wire, value and output a version would refuse that the
 * primitives' declarations decide, each said where it is: what a change on
 * a panel would newly break is refused before it is made, as a drag is.
 */
function wiringProblems(
  workflow: Workflow,
  primitives: Map<string, PrimitiveInfo>,
): string[] {
  const found: string[] = [];
  workflow.steps.forEach((step, index) => {
    for (const [port, value] of Object.entries(step.with)) {
      const problem =
        value.kind === 'wire'
          ? wireRefusal(workflow, primitives, index, port, value.ref)
          : value.kind === 'text'
            ? valueRefusal(workflow, primitives, index, port, value.text, value.refs)
            : value.kind === 'literal'
              ? valueRefusal(workflow, primitives, index, port, value.value, [])
              : null;
      if (problem !== null) found.push(`${step.id}.${port}: ${problem}`);
    }
  });
  for (const entry of workflow.outputs) {
    const problem =
      entry.from === null ? null : outputRefusal(workflow, primitives, entry.from);
    if (problem !== null) found.push(`output ${entry.name}: ${problem}`);
  }
  return found;
}

/** The first problem `after` has that `before` had not, or null. */
export function newProblem(
  before: Workflow,
  after: Workflow,
  primitives: Map<string, PrimitiveInfo>,
): string | null {
  const had = new Set(wiringProblems(before, primitives));
  return wiringProblems(after, primitives).find((problem) => !had.has(problem)) ?? null;
}

/** The type of the step output `ref` names, or null when it is not one the primitives declare. */
export function outputType(
  workflow: Workflow,
  primitives: Map<string, PrimitiveInfo>,
  ref: Ref | null,
): string | null {
  if (ref?.kind !== 'steps') return null;
  const step = workflow.steps.find((found) => found.id === ref.name);
  if (step === undefined) return null;
  return declared(primitives, step.use)?.outputs[ref.output]?.type ?? null;
}

/** The step outputs an output can read: a text or number output of any step. */
export function outputSources(
  workflow: Workflow,
  primitives: Map<string, PrimitiveInfo>,
): Extract<Ref, { kind: 'steps' }>[] {
  return workflow.steps.flatMap((step) =>
    Object.entries(declared(primitives, step.use)?.outputs ?? {})
      .filter(([, port]) => port.type === 'text' || port.type === 'number')
      .map(([output]) => ({ kind: 'steps' as const, name: step.id, output })),
  );
}
