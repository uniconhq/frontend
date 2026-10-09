import type { Primitive, PrimitivePort } from '@/api/types';

/**
 * The platform's primitives as the palette and the drag checks read them:
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
  return new Set(Object.values(primitive.limits_from).map((source) => source.input));
}

/** A usable primitive's declaration, or null for one the platform no longer reads. */
export function declared(
  primitives: Map<string, PrimitiveInfo>,
  use: string,
): PrimitiveInfo | null {
  const found = primitives.get(use);
  return found !== undefined && found.problem === null ? found : null;
}
