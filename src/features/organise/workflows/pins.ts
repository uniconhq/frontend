import type { DefinitionProblem } from '@/api/types';

/**
 * Where a problem is pinned on the graph, from its YAML path: a step, or one
 * of its ports; an input, a test field or a report entry; or the head of the
 * page when it names nothing drawn.
 */
type Pin =
  | { kind: 'step'; index: number; port: string | null }
  | { kind: 'input'; id: string }
  | { kind: 'field'; name: string }
  | { kind: 'entry'; name: string }
  | { kind: 'page' };

function pinOf(path: string): Pin {
  const step = /^steps\[(\d+)\](?:\.with\.([^.[]+))?/.exec(path);
  if (step?.[1] !== undefined)
    return { kind: 'step', index: Number(step[1]), port: step[2] ?? null };
  const keyed = /^(inputs|test|report)\.([^.[]+)/.exec(path);
  if (keyed?.[2] !== undefined) {
    if (keyed[1] === 'inputs') return { kind: 'input', id: keyed[2] };
    if (keyed[1] === 'test') return { kind: 'field', name: keyed[2] };
    return { kind: 'entry', name: keyed[2] };
  }
  return { kind: 'page' };
}

/** The problems pinned to each place, and those that head the page. */
export type Pinned = {
  steps: Map<number, DefinitionProblem[]>;
  ports: Map<string, DefinitionProblem[]>;
  inputs: Map<string, DefinitionProblem[]>;
  fields: Map<string, DefinitionProblem[]>;
  entries: Map<string, DefinitionProblem[]>;
  page: DefinitionProblem[];
};

function add<K>(map: Map<K, DefinitionProblem[]>, key: K, problem: DefinitionProblem) {
  map.set(key, [...(map.get(key) ?? []), problem]);
}

/** Every problem at the place its path names; a port's key is `<step>.<port>`. */
export function pinned(
  problems: DefinitionProblem[],
  steps: number,
  inputs: string[],
  fields: string[],
  entries: string[],
): Pinned {
  const found: Pinned = {
    steps: new Map(),
    ports: new Map(),
    inputs: new Map(),
    fields: new Map(),
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
    else if (pin.kind === 'field' && fields.includes(pin.name))
      add(found.fields, pin.name, problem);
    else if (pin.kind === 'entry' && entries.includes(pin.name))
      add(found.entries, pin.name, problem);
    else found.page.push(problem);
  }
  return found;
}
