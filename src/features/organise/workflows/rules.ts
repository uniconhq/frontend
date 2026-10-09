import {
  refLabel,
  refsOf,
  sameRef,
  type Ref,
  type ReportEntry,
  type Workflow,
} from './model';
import {
  declared,
  raisingPorts,
  type PortDecl,
  type PrimitiveInfo,
} from './primitives';

/**
 * What a version of a workflow would refuse that the primitives'
 * declarations decide, asked at the drag rather than at the save (PROPOSAL.md
 * section 12): the type under the two widenings, an enum's options, an
 * optional output into a required port, a test field or a per-test input
 * into a once step, a once step reading a per-test step, a contestant input
 * or a step output into a port a limit is raised from, and a loop. Each
 * answer is the reason in a sentence, or null when the wire may be drawn.
 * The sentences are the forge's (`forge.domain.plans.check_workflow`), so
 * the page and the version say the same thing.
 */

const SCALARS = ['text', 'number', 'boolean', 'enum'];

/** What a source is, to check it against the port it would feed. */
type Kind = {
  type: string;
  options: string[] | null;
  source: 'input' | 'contestant' | 'test' | 'step';
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
  stepIndex: number | 'report',
  ref: Ref,
): Kind | string {
  const perTest =
    stepIndex === 'report' ? true : (workflow.steps[stepIndex]?.perTest ?? false);
  if (ref.kind === 'inputs') {
    const input = workflow.inputs.find((found) => found.id === ref.name);
    if (input === undefined) return `${ref.name} is not an input of the workflow.`;
    if (input.perTest && !perTest)
      return `${ref.name} is given once per test, so only a per-test step reads it.`;
    return {
      type: input.type,
      options: input.options,
      source: input.contestant ? 'contestant' : 'input',
      optional: input.optional,
    };
  }
  if (ref.kind === 'test') {
    const field = workflow.test.find((found) => found.name === ref.name);
    if (field === undefined)
      return `${ref.name} is not a field of the workflow's tests.`;
    if (!perTest) return 'test.<field> is there only in a step that runs per test.';
    return {
      type: field.type,
      options: field.options,
      source: 'test',
      optional: false,
    };
  }
  const read = indexOf(workflow).get(ref.name);
  const source = read !== undefined ? workflow.steps[read] : undefined;
  if (read === undefined || source === undefined)
    return `${ref.name} is not a step before this one.`;
  if (stepIndex !== 'report') {
    if (read === stepIndex) return 'A step cannot read its own output.';
    if (upstream(workflow, read).has(stepIndex))
      return `That makes a loop: ${ref.name} reads this step already.`;
  }
  const primitive = declared(primitives, source.use);
  const port = primitive?.outputs[ref.output];
  if (port === undefined) return `The step ${ref.name} has no output ${ref.output}.`;
  if (source.perTest && !perTest)
    return `The step ${ref.name} runs per test, and a step that runs once cannot read it.`;
  if (port.type === 'outcome')
    return "A step's outcome is read by the harness, not given to another step.";
  return {
    type: port.type,
    options: port.options,
    source: 'step',
    optional: port.optional,
  };
}

/** Whether a value of `kind` fits `port`, under the two widenings. */
function fits(kind: Kind, port: PortDecl): string | null {
  if (port.type === 'text' && SCALARS.includes(kind.type)) return null;
  if (port.type === 'folder' && kind.type === 'file') return null;
  if (port.type === 'enum') {
    const allowed = port.options ?? [];
    if (kind.type === 'enum' && kind.options !== null) {
      const extra = kind.options.filter((option) => !allowed.includes(option));
      if (extra.length === 0) return null;
      return `Takes one of ${allowed.join(', ')}, not ${extra.join(', ')}.`;
    }
    return `Takes one of ${allowed.join(', ')}.`;
  }
  if (kind.type !== port.type) return `Takes ${port.type}, not ${kind.type}.`;
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
): string | null {
  const step = workflow.steps[stepIndex];
  if (step === undefined) return 'There is no such step.';
  const primitive = declared(primitives, step.use);
  if (primitive === null) return `${step.use} is not a primitive the platform has.`;
  const target = primitive.inputs[port];
  if (target === undefined) return `${step.use} has no input ${port}.`;
  const kind = kindOf(workflow, primitives, stepIndex, source);
  if (typeof kind === 'string') return kind;
  if (raisingPorts(primitive).has(port)) {
    if (kind.source === 'contestant')
      return 'This port raises a limit, so the task must give it, not the contestant.';
    if (kind.source === 'step')
      return 'This port raises a limit, so it must be known at the save.';
  }
  if (kind.optional && !target.optional)
    return kind.source === 'step'
      ? 'The output may be absent, so it feeds only an optional port.'
      : 'The input is optional, so it feeds only an optional port.';
  return fits(kind, target);
}

/** Why an output may not be reported, or null when it may. */
export function reportRefusal(
  workflow: Workflow,
  primitives: Map<string, PrimitiveInfo>,
  source: Ref,
  entry: ReportEntry | null = null,
): string | null {
  if (source.kind !== 'steps') return 'A report reads a step’s output.';
  const kind = kindOf(workflow, primitives, 'report', source);
  if (typeof kind === 'string') return kind;
  if (kind.type !== 'text' && kind.type !== 'number')
    return `steps.${refLabel(source)} is ${kind.type}; a report holds text or numbers.`;
  if (entry === null) return null;
  const better = betterProblem(workflow, entry);
  if (better !== null) return better;
  if (entry.atLeast !== null && entry.atMost !== null && entry.atLeast > entry.atMost)
    return 'Must be at least at_least.';
  const meant = [entry.fold, entry.better, entry.atLeast, entry.atMost].some(
    (value) => value !== null,
  );
  if (meant && kind.type !== 'number')
    return 'fold, better, at_least and at_most say what a number means; this is text.';
  const step = workflow.steps.find((found) => found.id === source.name);
  if ((entry.fold !== null || entry.better !== null) && step?.perTest !== true)
    return 'fold and better are for a number reported per test; this step runs once.';
  return null;
}

/**
 * Why an entry's `better` is not one a version takes (W3), in the forge's
 * words: `higher`, `lower`, or a task's enum input whose options are those.
 */
function betterProblem(workflow: Workflow, entry: ReportEntry): string | null {
  const { better } = entry;
  if (better === null || better === 'higher' || better === 'lower') return null;
  const ref = entry.betterRef;
  if (ref === null || ref.kind !== 'inputs')
    return "Must be higher, lower, or ${{ inputs.<id> }} naming a task's enum input.";
  const input = workflow.inputs.find((found) => found.id === ref.name);
  if (input === undefined) return `${ref.name} is not an input of the workflow.`;
  if (input.contestant || input.type !== 'enum')
    return `${ref.name} must be an enum input the task gives, not the contestant.`;
  if (
    !(input.options ?? []).every((option) => option === 'higher' || option === 'lower')
  )
    return `The options of ${ref.name} must be higher and lower.`;
  return null;
}

/**
 * Why `text` may not be the value of a port, or null when it may: a plain
 * literal of the port's type, or text with inputs and, in a per-test step,
 * test fields written in, which fits only a text port.
 */
export function valueRefusal(
  workflow: Workflow,
  primitives: Map<string, PrimitiveInfo>,
  stepIndex: number,
  port: string,
  value: string | number | boolean,
  written: Ref[],
): string | null {
  const step = workflow.steps[stepIndex];
  const primitive = step !== undefined ? declared(primitives, step.use) : null;
  const target = primitive?.inputs[port];
  if (step === undefined || primitive === null || target === undefined) return null;
  if (written.length > 0) {
    for (const ref of written) {
      if (ref.kind === 'steps')
        return "A step's output is given whole, never written into text.";
      const kind = kindOf(workflow, primitives, stepIndex, ref);
      if (typeof kind === 'string') return kind;
      if (!SCALARS.includes(kind.type))
        return `${refLabel(ref)} is a ${kind.type}, and only text, a number, true or false or an enum is written into text.`;
      if (kind.optional)
        return `${refLabel(ref)} is optional, so it is given whole to optional ports, never written into text.`;
    }
    if (raisingPorts(primitive).has(port))
      return 'This port raises a limit, so it must be known at the save.';
    if (target.type !== 'text') return `Takes ${target.type}, not text.`;
    return null;
  }
  if (typeof value === 'boolean')
    return ['boolean', 'text'].includes(target.type)
      ? null
      : `Takes ${target.type}, not boolean.`;
  if (typeof value === 'number')
    return ['number', 'text'].includes(target.type)
      ? null
      : `Takes ${target.type}, not number.`;
  if (target.type === 'enum') {
    const allowed = target.options ?? [];
    return allowed.includes(value) ? null : `Takes one of ${allowed.join(', ')}.`;
  }
  if (target.type !== 'text') return `Takes ${target.type}, not text.`;
  return null;
}

/**
 * Why the step at `index` may not switch between once and per test while
 * its wires stand, or null when it may.
 */
export function switchRefusal(workflow: Workflow, index: number): string | null {
  const step = workflow.steps[index];
  if (step === undefined) return null;
  if (step.perTest) {
    for (const value of Object.values(step.with))
      for (const ref of refsOf(value)) {
        if (ref.kind === 'test')
          return `It reads test.${ref.name}, which only a per-test step reads.`;
        if (
          ref.kind === 'inputs' &&
          workflow.inputs.find((input) => input.id === ref.name)?.perTest
        )
          return `It reads ${ref.name}, which is given once per test.`;
        if (ref.kind === 'steps') {
          const read = indexOf(workflow).get(ref.name);
          if (read !== undefined && workflow.steps[read]?.perTest)
            return `It reads ${ref.name}, which runs per test.`;
        }
      }
    return foldedRefusal(workflow, index);
  }
  for (const [at, other] of workflow.steps.entries())
    if (!other.perTest && at !== index && stepsRead(workflow, at).has(index))
      return `${other.id} runs once and reads it.`;
  return null;
}

/**
 * Why the step may not run once while the report folds or ranks one of its
 * outputs over tests, which only a per-test step's output can be.
 */
function foldedRefusal(workflow: Workflow, index: number): string | null {
  const step = workflow.steps[index];
  const folded = workflow.report.find(
    (entry) =>
      entry.from?.kind === 'steps' &&
      entry.from.name === step?.id &&
      (entry.fold !== null || entry.better !== null),
  );
  return folded === undefined
    ? null
    : `The report's ${folded.name} folds it over tests, so it runs per test.`;
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

/** Every reference to `ref` in the workflow's ports and report. */
function usesOf(
  workflow: Workflow,
  ref: Ref,
): { step: number | 'report'; port: string }[] {
  const found: { step: number | 'report'; port: string }[] = [];
  workflow.steps.forEach((step, at) => {
    for (const [port, value] of Object.entries(step.with))
      if (refsOf(value).some((each) => sameRef(each, ref)))
        found.push({ step: at, port });
  });
  for (const entry of workflow.report)
    if (
      (entry.from && sameRef(entry.from, ref)) ||
      (entry.betterRef && sameRef(entry.betterRef, ref))
    )
      found.push({ step: 'report', port: entry.name });
  return found;
}

/**
 * Whether an input may be marked `optional`: a task's input every use of
 * which is a whole wire into a port the primitive marks optional.
 */
export function mayBeOptional(
  workflow: Workflow,
  primitives: Map<string, PrimitiveInfo>,
  id: string,
): boolean {
  const input = workflow.inputs.find((found) => found.id === id);
  if (input === undefined || input.contestant) return false;
  const uses = usesOf(workflow, { kind: 'inputs', name: id });
  return uses.every((use) => {
    if (use.step === 'report') return false;
    const step = workflow.steps[use.step];
    const value = step?.with[use.port];
    if (step === undefined || value?.kind !== 'wire') return false;
    return declared(primitives, step.use)?.inputs[use.port]?.optional === true;
  });
}

/**
 * Every wire, value and report entry a version would refuse that the
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
  for (const entry of workflow.report) {
    const problem =
      entry.from === null
        ? betterProblem(workflow, entry)
        : reportRefusal(workflow, primitives, entry.from, entry);
    if (problem !== null) found.push(`report ${entry.name}: ${problem}`);
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

/** The step outputs a report can read: a text or number output of any step. */
export function reportable(
  workflow: Workflow,
  primitives: Map<string, PrimitiveInfo>,
): Extract<Ref, { kind: 'steps' }>[] {
  return workflow.steps.flatMap((step) =>
    Object.entries(declared(primitives, step.use)?.outputs ?? {})
      .filter(([, port]) => port.type === 'text' || port.type === 'number')
      .map(([output]) => ({ kind: 'steps' as const, name: step.id, output })),
  );
}
