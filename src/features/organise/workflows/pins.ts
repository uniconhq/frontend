import type { DefinitionProblem } from '@/api/types';
import type { ProblemPath } from '../problem-path';
import type { Selected } from './lines';
import type { Workflow } from './model';

/**
 * Where a problem is pinned on the graph, from its keys: a step, or one
 * of its ports; an input or an output; or the head of the
 * page when it names nothing drawn.
 */
type Pin =
  | { kind: 'step'; index: number; port: string | null }
  | { kind: 'input'; id: string }
  | { kind: 'entry'; name: string }
  | { kind: 'page' };

function pinOf(path: ProblemPath): Pin {
  const [top, second, third, fourth] = path;
  if (top === 'steps' && typeof second === 'number') {
    const port = third === 'with' && typeof fourth === 'string' ? fourth : null;
    return { kind: 'step', index: second, port };
  }
  if (top === 'inputs' && typeof second === 'string')
    return { kind: 'input', id: second };
  if (top === 'outputs' && typeof second === 'string')
    return { kind: 'entry', name: second };
  return { kind: 'page' };
}

/** The problems pinned to each place, and those that head the page. */
export type Pinned = {
  steps: Map<number, DefinitionProblem[]>;
  ports: Map<string, DefinitionProblem[]>;
  inputs: Map<string, DefinitionProblem[]>;
  entries: Map<string, DefinitionProblem[]>;
  page: DefinitionProblem[];
};

function add<K>(map: Map<K, DefinitionProblem[]>, key: K, problem: DefinitionProblem) {
  map.set(key, [...(map.get(key) ?? []), problem]);
}

/**
 * A problem with where it is in words and what to open to fix it: the box
 * it is pinned to, or nothing for one about the workflow as a whole.
 */
export type Placed = {
  problem: DefinitionProblem;
  where: string;
  opens: Selected | null;
};

const WHOLE: Record<string, string> = {
  '': 'The workflow',
  inputs: 'Inputs',
  steps: 'Steps',
  outputs: 'Outputs',
};

/** Every problem, in the file's order, said where it is and what fixes it opens. */
export function placed(problems: DefinitionProblem[], workflow: Workflow): Placed[] {
  return problems.map((problem) => {
    const pin = pinOf(problem.path);
    if (pin.kind === 'step') {
      const step = workflow.steps[pin.index];
      if (step !== undefined)
        return {
          problem,
          where: `Step ${step.id || '(no name)'}${pin.port === null ? '' : `, ${pin.port}`}`,
          opens: { kind: 'step', index: pin.index },
        };
    }
    if (pin.kind === 'input' && workflow.inputs.some((input) => input.id === pin.id))
      return {
        problem,
        where: `Input ${pin.id}`,
        opens: { kind: 'input', id: pin.id },
      };
    if (
      pin.kind === 'entry' &&
      workflow.outputs.some((entry) => entry.name === pin.name)
    )
      return { problem, where: `Outputs, ${pin.name}`, opens: { kind: 'outputs' } };
    const [head = ''] = problem.path;
    return { problem, where: WHOLE[head] ?? problem.path.join(' › '), opens: null };
  });
}

/** Every problem at the place its path names; a port's key is `<step>.<port>`. */
export function pinned(
  problems: DefinitionProblem[],
  steps: number,
  inputs: string[],
  entries: string[],
): Pinned {
  const found: Pinned = {
    steps: new Map(),
    ports: new Map(),
    inputs: new Map(),
    entries: new Map(),
    page: [],
  };
  for (const problem of problems) {
    const pin = pinOf(problem.path);
    if (pin.kind === 'step' && pin.index < steps) {
      if (pin.port === null) add(found.steps, pin.index, problem);
      else add(found.ports, `${String(pin.index)}.${pin.port}`, problem);
    } else if (pin.kind === 'input' && inputs.includes(pin.id))
      add(found.inputs, pin.id, problem);
    else if (pin.kind === 'entry' && entries.includes(pin.name))
      add(found.entries, pin.name, problem);
    else found.page.push(problem);
  }
  return found;
}

/** What the line under a box's head says: its first problem, or that a newer version is out. */
export type Warning =
  { kind: 'problem'; problem: DefinitionProblem } | { kind: 'newer'; version: string };

/**
 * The line under each box's head, by the box's key (`layout.ts`): a step's
 * first problem, its own or a port's, else a newer version of the workflow
 * it uses; an input's first problem; the outputs' first.
 */
export function warnings(
  pins: Pinned,
  workflow: Workflow,
  newerOf: (use: string) => string | null,
): Map<string, Warning> {
  const found = new Map<string, Warning>();
  const problem = (key: string, list: DefinitionProblem[]) => {
    const first = list[0];
    if (first !== undefined) found.set(key, { kind: 'problem', problem: first });
  };
  workflow.steps.forEach((step, index) => {
    const key = `step:${String(index)}`;
    problem(key, [
      ...(pins.steps.get(index) ?? []),
      ...[...pins.ports]
        .filter(([port]) => port.startsWith(`${String(index)}.`))
        .flatMap(([, list]) => list),
    ]);
    const version = newerOf(step.use);
    if (!found.has(key) && version !== null) found.set(key, { kind: 'newer', version });
  });
  for (const [id, list] of pins.inputs) problem(`input:${id}`, list);
  problem('outputs', [...pins.entries.values()].flat());
  return found;
}
