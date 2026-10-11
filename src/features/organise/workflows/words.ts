import type { Box } from './layout';
import type { FieldDecl, InputDecl, Ref, ReportEntry, Workflow } from './model';
import type { PrimitiveInfo } from './primitives';

/**
 * How the workflow editor names what a workflow holds, in words rather than
 * in the file's keys (M31): a primitive by its title, a step by how often it
 * runs, a port by what it does that the author acts on, and a wire by where
 * its value comes from. What the author never acts on (a primitive taking a
 * batch, its outcome, a port that keeps a secret) has no word here; the
 * step's drawer says it under Details.
 */

/** A primitive as a person names it: its title, or its name without one (#436). */
export function primitiveTitle(primitive: PrimitiveInfo): string {
  return primitive.title ?? primitive.name;
}

/** How often a step runs, as its box and drawer say it. */
export function runsWords(perTest: boolean): string {
  return perTest ? 'For each test' : 'Once';
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
export function limitWords(primitive: PrimitiveInfo, port: string): string | null {
  const limits = [
    ...new Set(
      Object.entries(primitive.limits_from)
        .filter(([, source]) => source.input === port)
        .map(([limit]) => LIMIT_WORDS[limit] ?? limit),
    ),
  ];
  if (limits.length === 0) return null;
  if (limits.length === 1) return `sets the ${limits[0] ?? ''} limit`;
  return `sets the ${limits.slice(0, -1).join(', ')} and ${limits.at(-1) ?? ''} limits`;
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

/** The name a box is read out by, and the title of the drawer it opens. */
export function boxName(box: Box, workflow: Workflow): string {
  if (box.kind === 'step' && box.step !== null)
    return `Step ${workflow.steps[box.step]?.id || '(no name)'}`;
  if (box.kind === 'inputs') return 'Inputs';
  if (box.kind === 'test') return "Each test's files";
  return 'Report';
}

/** The steps that read a group of inputs or test files, as its box says it. */
export function readersWords(readers: string[]): string {
  if (readers.length === 0) return 'Nothing uses these yet';
  if (readers.length === 1) return `Used by ${readers[0] ?? ''}`;
  return `Used by ${readers.slice(0, -1).join(', ')} and ${readers.at(-1) ?? ''}`;
}
