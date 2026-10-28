import { useMemo } from 'react';
import { portsOf, type BoxDecl } from './boxes';
import { layoutWorkflow } from './layout';
import type { Workflow } from './model';
import { pinned, warnings } from './pins';
import type { PrimitiveInfo } from './primitives';

const NO_PROBLEMS = pinned([], 0, [], []);

/**
 * The layout DrawnGraph draws `workflow` in, and the newer versions it
 * warns of: `shown` open, or every box with `allOpen`.
 */
export function useDrawnLayout(
  workflow: Workflow,
  map: Map<string, PrimitiveInfo>,
  boxes: ReadonlyMap<string, BoxDecl>,
  shown: string | null,
  allOpen: boolean,
  inputs: 'shown' | 'hidden',
) {
  const ports = useMemo(() => portsOf(boxes), [boxes]);
  const warned = useMemo(
    () => warnings(NO_PROBLEMS, workflow, (use) => boxes.get(use)?.newer ?? null),
    [workflow, boxes],
  );
  const layout = useMemo(
    () =>
      layoutWorkflow(workflow, map, ports, {
        open: allOpen ? 'all' : new Set(shown === null ? [] : [shown]),
        warned: new Set(warned.keys()),
        inputs,
      }),
    [workflow, map, ports, shown, warned, allOpen, inputs],
  );
  return { warned, layout };
}
