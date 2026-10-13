import type { WorkflowItem } from '@/api/types';
import { formatExact, ratioDigits } from '@/lib/exact';
import { listed } from '@/lib/listed';
import type { Box } from './layout';
import type { FieldDecl, InputDecl, Ref, ReportEntry, Workflow } from './model';
import type { PrimitiveInfo } from './primitives';
import { verdictLabel } from '@/ui/verdicts';

/**
 * How the workflow editor names what a workflow holds, in words rather than
 * in the file's keys (M31): a primitive by its title, a step by how often it
 * runs, a port by what it does that the author acts on, and a wire by where
 * its value comes from. What the author never acts on (a primitive taking a
 * batch, its outcome, a port that keeps a secret) has no word here; the
 * step's drawer says it under Details, with what the step gets each time it
 * runs (`limitsWords`).
 */

/** What the editor, a test and a screen reader call the draft's file. */
export const DRAFT_FILE = 'The draft’s file';

/** A primitive as a person names it: its title, or its name without one (#436). */
export function primitiveTitle(primitive: PrimitiveInfo): string {
  return primitive.title ?? primitive.name;
}

/** An outcome word as a sentence names it: "Compile error", from its badge's "COMPILE ERROR". */
function outcomeName(outcome: string): string {
  const label = verdictLabel(outcome).toLowerCase();
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
}

/**
 * The results a step can report, from the primitive's own words for each
 * (M56): "Accepted if the source compiles." for one; "Accepted if the source
 * compiles, otherwise Compile error." for two, since the second is all the
 * first is not; and for more, one line each, "Time limit if it runs out of
 * time". Falls back to the port's own sentence for a primitive that says
 * none, and null where it says nothing at all.
 */
export function outcomeWords(primitive: PrimitiveInfo): string | string[] | null {
  const port = primitive.outputs.outcome;
  const outcomes = Object.entries(port?.outcomes ?? {});
  if (outcomes.length === 0) return port?.description ?? null;
  const [first, second] = outcomes;
  if (first !== undefined && outcomes.length <= 2) {
    const [word, when] = first;
    return second === undefined
      ? `${outcomeName(word)} if ${when}.`
      : `${outcomeName(word)} if ${when}, otherwise ${outcomeName(second[0])}.`;
  }
  return outcomes.map(([word, when]) => `${outcomeName(word)} if ${when}`);
}

/** What the shaded band on the graph says it is: the steps in it run once for each test (M55). */
export const BAND_LABEL = 'Runs once for each test';

/** How often a step runs, as its box says it. */
export function runsWords(perTest: boolean): string {
  return perTest ? 'For each test' : 'Once';
}

/** How often a step runs, as its drawer says it, in the band's words (M55). */
export function runsSentence(perTest: boolean): string {
  return perTest
    ? `${BAND_LABEL}, so it stands in the shaded band on the graph.`
    : 'Runs once, for the whole submission.';
}

const LIMIT_WORDS: Record<string, string> = {
  time_ms: 'time',
  cpu_ms: 'time',
  memory_mb: 'memory',
  pids: 'process',
  output_mb: 'output',
  gpus: 'GPU',
};

/** "sets the time limit" for a port a primitive raises its time limits from. */
function limitWords(primitive: PrimitiveInfo, port: string): string | null {
  const limits = [
    ...new Set(
      Object.entries(primitive.limits_from)
        .filter(([, source]) => source.input === port)
        .map(([limit]) => LIMIT_WORDS[limit] ?? limit),
    ),
  ];
  if (limits.length === 0) return null;
  if (limits.length === 1) return `sets the ${limits[0] ?? ''} limit`;
  return `sets the ${listed(limits)} limits`;
}

/** What a step's input port does that the author acts on, in words. */
export function portMarks(primitive: PrimitiveInfo, port: string): string[] {
  const decl = primitive.inputs[port];
  return [
    decl?.runs ? 'runs this as a program' : null,
    limitWords(primitive, port),
  ].filter((mark): mark is string => mark !== null);
}

/** What stands out about a workflow's input, in words. */
export function inputMarks(input: InputDecl): string[] {
  return [
    input.contestant ? 'the entrant gives it' : null,
    input.perTest ? 'one for each test' : null,
  ].filter((mark): mark is string => mark !== null);
}

/** What stands out about a test's field, in words. */
export function fieldMarks(field: FieldDecl): string[] {
  return field.public ? ['shown to entrants'] : [];
}

const FOLD_WORDS: Record<string, string> = {
  sum: 'total over the tests',
  mean: 'average over the tests',
  max: 'largest over the tests',
};

/** What a report entry says its number means, in words. */
export function entryMarks(entry: ReportEntry): string[] {
  const better =
    entry.better === null
      ? null
      : entry.better === 'higher' || entry.better === 'lower'
        ? `${entry.better} is better`
        : 'the task says which is better';
  return [
    entry.fold === null ? null : (FOLD_WORDS[entry.fold] ?? entry.fold),
    better,
  ].filter((mark): mark is string => mark !== null);
}

/** Where a value comes from, as a wire's label and a menu say it: "time_ms from run". */
export function refWords(ref: Ref): string {
  if (ref.kind === 'steps') return `${ref.output} from ${ref.name}`;
  if (ref.kind === 'inputs') return `${ref.name} from the inputs`;
  return `${ref.name} from each test`;
}

/** Who reads a workflow, in a few words, as its page's header says it. */
export function visibilityWords(
  page: Pick<WorkflowItem, 'visibility'> & { readers?: string[] },
): string {
  if (page.visibility === 'public') return 'Public';
  if (page.visibility === 'private') return 'Private';
  const count = page.readers?.length;
  if (count === undefined) return 'Shared';
  return count === 0
    ? 'Shared with nobody yet'
    : `Shared with ${String(count)} ${count === 1 ? 'person' : 'people'}`;
}

/** The name a box is read out by, and the title of the drawer it opens. */
export function boxName(box: Box, workflow: Workflow): string {
  if (box.kind === 'step' && box.step !== null)
    return `Step ${workflow.steps[box.step]?.id || '(no name)'}`;
  if (box.kind === 'inputs') return 'Inputs';
  if (box.kind === 'test') return 'Each test’s files';
  return 'Report';
}

/** The steps that read a group of inputs or test files, as its box says it. */
export function readersWords(readers: string[]): string {
  if (readers.length === 0) return 'Nothing uses these yet';
  if (readers.length === 1) return `Used by ${readers[0] ?? ''}`;
  return `Used by ${listed(readers)}`;
}

/** A time limit in milliseconds as seconds: "60 seconds", "1.5 seconds", "1 second". */
function seconds(ms: number): string {
  const { digits } = ratioDigits({ num: BigInt(Math.round(ms)), den: 1000n }, 3);
  return `${formatExact(digits, 3)} ${digits === '1' ? 'second' : 'seconds'}`;
}

/** A size in megabytes in its largest whole unit: "1 GB", "256 MB". */
function megabytes(mb: number): string {
  return mb >= 1024 && mb % 1024 === 0 ? `${String(mb / 1024)} GB` : `${String(mb)} MB`;
}

/** A count of a thing: "128 processes", "1 GPU". */
function counted(count: number, one: string, many: string): string {
  return `${String(count)} ${count === 1 ? one : many}`;
}

/** What each limit a primitive takes is, after "up to": its time once when both are equal. */
function limitParts(limits: Record<string, number>): string[] {
  const {
    time_ms: time,
    cpu_ms: cpu,
    memory_mb,
    pids,
    output_mb,
    gpus,
    ...rest
  } = limits;
  const times =
    time !== undefined && cpu !== undefined
      ? time === cpu
        ? [`up to ${seconds(time)}`]
        : [
            `up to ${seconds(time)} of running time and ${seconds(cpu)} of processor time`,
          ]
      : time !== undefined
        ? [`up to ${seconds(time)}`]
        : cpu !== undefined
          ? [`up to ${seconds(cpu)} of processor time`]
          : [];
  return [
    ...times,
    memory_mb === undefined ? null : `${megabytes(memory_mb)} of memory`,
    pids === undefined ? null : counted(pids, 'process', 'processes'),
    output_mb === undefined ? null : `${megabytes(output_mb)} of output`,
    gpus === undefined || gpus === 0 ? null : counted(gpus, 'GPU', 'GPUs'),
    ...Object.entries(rest).map(([limit, amount]) => `${String(amount)} ${limit}`),
  ].filter((part): part is string => part !== null);
}

/**
 * Where a port a limit grows from takes its value: "the task’s Time limit"
 * for a workflow input, named by its title, or the entrant’s when the entrant
 * gives it; "what its time_limit is given" otherwise.
 */
function sourceWords(
  step: Workflow['steps'][number] | undefined,
  workflow: Workflow,
  port: string,
): string {
  const value = step?.with[port];
  if (value?.kind === 'wire' && value.ref.kind === 'inputs') {
    const name = value.ref.name;
    const input = workflow.inputs.find((found) => found.id === name);
    return `the ${input?.contestant === true ? 'entrant’s' : 'task’s'} ${input?.title ?? name}`;
  }
  return `what its ${port} is given`;
}

/**
 * What a step's container gets each time it runs, in plain words (M56): "What
 * this step gets each time it runs: up to 60 seconds, 1 GB of memory, 128
 * processes, 64 MB of output", with each limit a task raises said so ("its
 * time grows with the task’s Time limit"), or "for each test" where the step
 * runs for each test as one batch, whose limits are each test's (TASK-FORMAT
 * 1.4); null when the primitive gives no limits. Then whose limits they are. A step runs the entrant's program when
 * its primitive runs what arrives at a port (`runs`) and raises its limits
 * from what it is given (`limits_from`), as Run program does to fit the
 * task's Time limit: the program then runs inside it within those. Compile
 * runs what arrives too, but takes nothing from the task, so its limits are
 * its own.
 */
export function limitsWords(
  primitive: PrimitiveInfo,
  step: Workflow['steps'][number] | undefined,
  workflow: Workflow,
): { gets: string; whose: string } | null {
  const parts = limitParts(primitive.limits);
  if (parts.length === 0) return null;
  const raised = new Map<string, string>();
  for (const [limit, source] of Object.entries(primitive.limits_from)) {
    const word = LIMIT_WORDS[limit] ?? limit;
    if (!raised.has(word)) raised.set(word, sourceWords(step, workflow, source.input));
  }
  const grows = [...raised].map(([word, from], at) =>
    at === 0 ? `its ${word} grows with ${from}` : `its ${word} with ${from}`,
  );
  const each =
    primitive.batch && step?.perTest === true ? 'for each test' : 'each time it runs';
  const gets = `What this step gets ${each}: ${parts.join(', ')}${
    grows.length === 0 ? '' : `; ${listed(grows)}`
  }.`;
  const runsProgram =
    raised.size > 0 &&
    Object.values(primitive.inputs).some((port) => port.runs === true);
  const sources = [...new Set(raised.values())];
  return {
    gets,
    whose: runsProgram
      ? `The entrant’s program runs inside it, within ${listed(sources)}.`
      : 'These are the step’s own limits, not the entrant’s program’s.',
  };
}
