import type { Primitive, PrimitivePort } from '@/api/types';
import type { WithValue } from './model';

/**
 * The platform's primitives as the tray and the drag checks read them:
 * each version with its declared ports and the limits it raises, or the
 * reason a version in a format no longer read cannot be used.
 */
export type PrimitiveInfo = Primitive;
export type PortDecl = PrimitivePort;

/** The primitives by the reference a step uses them by. */
export function byRef(primitives: PrimitiveInfo[]): Map<string, PrimitiveInfo> {
  return new Map(primitives.map((primitive) => [primitive.ref, primitive]));
}

/** The ports of a primitive a container limit is raised from. */
export function raisingPorts(primitive: PrimitiveInfo): Set<string> {
  return new Set(
    Object.values(primitive.limits_from).flatMap((source) =>
      source.input === null ? [] : [source.input],
    ),
  );
}

/** What `declared` reads of a step: what it uses and the ports it gives. */
type StepGiven = { use: string; with: Readonly<Record<string, WithValue>> };

/**
 * A usable primitive's declaration as `step` uses it, or null for one the
 * platform no longer reads. A primitive of several forms is drawn as the
 * first form, in the declaration's order, whose inputs hold every port the
 * step gives, so a new step, or one with a required port not yet given, still
 * shows the ports to wire. This only chooses what to draw: whether the step
 * fits its form is the forge's check, at the save. A step giving ports no one
 * form holds has none. A programs form's step gives each program's outputs,
 * `<program>.<output>`, by the names it gives them.
 */
export function declared(
  primitives: Map<string, PrimitiveInfo>,
  step: StepGiven,
): PrimitiveInfo | null {
  const found = primitives.get(step.use);
  if (found === undefined || found.problem !== null) return null;
  const forms = Object.values(found.forms);
  if (forms.length === 0) return found;
  const given = Object.keys(step.with);
  const form = forms.find((each) => given.every((name) => name in each.inputs));
  if (form === undefined) return { ...found, inputs: {}, outputs: {} };
  const programs = Object.entries(form.inputs).flatMap(([name, port]) => {
    const value = step.with[name];
    if (port.type !== 'programs' || value?.kind !== 'mapping') return [];
    return value.entries.flatMap((program) =>
      Object.entries(port.outputs ?? {}).map(
        ([output, decl]) => [`${program.name}.${output}`, decl] as const,
      ),
    );
  });
  return {
    ...found,
    description: form.description ?? found.description,
    limits: form.limits,
    limits_from: form.limits_from,
    inputs: form.inputs,
    outputs: { ...form.outputs, ...Object.fromEntries(programs) },
  };
}
