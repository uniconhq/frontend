import type { DefinitionProblem } from '@/api/types';
import type { Selected } from './lines';
import type { Workflow } from './model';

/**
 * Where a problem is pinned on the graph, from its YAML path: a step, or one
 * of its ports; an input or an output; or the head of the
 * page when it names nothing drawn.
 */
type Pin =
  | { kind: 'step'; index: number; port: string | null }
  | { kind: 'input'; id: string }
  | { kind: 'entry'; name: string }
  | { kind: 'page' };

function pinOf(path: string): Pin {
  const step = /^steps\[(\d+)\](?:\.with\.([^.[]+))?/.exec(path);
  if (step?.[1] !== undefined)
    return { kind: 'step', index: Number(step[1]), port: step[2] ?? null };
  const keyed = /^(inputs|outputs)\.([^.[]+)/.exec(path);
  if (keyed?.[2] !== undefined) {
    if (keyed[1] === 'inputs') return { kind: 'input', id: keyed[2] };
    return { kind: 'entry', name: keyed[2] };
  }
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
        opens: { kind: 'inputs', ids: [pin.id] },
      };
    if (
      pin.kind === 'entry' &&
      workflow.report.some((entry) => entry.name === pin.name)
    )
      return { problem, where: `Outputs, ${pin.name}`, opens: { kind: 'report' } };
    const head = /^[^.[]*/.exec(problem.path)?.[0] ?? '';
    return { problem, where: WHOLE[head] ?? problem.path, opens: null };
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
