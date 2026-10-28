import { useMemo, useState } from 'react';
import type { Primitive } from '@/api/types';
import { portsOf, useStepBoxes, workflowFrom, type BoxDecl } from './boxes';
import { Graph } from './Graph';
import { layoutWorkflow } from './layout';
import { pinned, warnings } from './pins';
import { byRef } from './primitives';

const NO_PROBLEMS = pinned([], 0, [], []);

/**
 * A workflow version's steps drawn as the editor draws a draft, with nothing
 * to change: its boxes and wires, a box picked by clicking it. The
 * workflow's own page and a task's Workflow card both show a version so.
 * Without `onSelect`, the graph keeps the pick itself, starting at
 * `selected`, so a box still opens when its head is clicked. Without
 * `boxes`, it reads the boxes of the run workflows its steps use. `allOpen`
 * draws every box open, as a box's inside is shown; `inputs` says whether
 * the inputs the steps read are drawn, as the editor's switch does; `cover`
 * is how much of the graph's right a drawer covers, which the selected box
 * is moved clear of.
 */
export function DrawnGraph({
  text,
  primitives,
  boxes: given,
  selected = null,
  onSelect,
  onOpenBox,
  allOpen = false,
  inputs = 'shown',
  cover = 0,
}: {
  text: string;
  primitives: Primitive[];
  boxes?: ReadonlyMap<string, BoxDecl>;
  selected?: string | null;
  onSelect?: (key: string | null) => void;
  onOpenBox?: (index: number) => void;
  allOpen?: boolean;
  inputs?: 'shown' | 'hidden';
  cover?: number;
}) {
  const [own, setOwn] = useState(selected);
  const shown = onSelect === undefined ? own : selected;
  const map = useMemo(() => byRef(primitives), [primitives]);
  const workflow = useMemo(() => workflowFrom(text), [text]);
  const read = useStepBoxes(given === undefined ? workflow : null, map);
  const boxes = given ?? read;
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
  const reveal = useMemo(
    () => (shown === null ? null : { key: shown, nonce: 0 }),
    [shown],
  );
  return (
    <Graph
      layout={layout}
      workflow={workflow}
      primitives={map}
      workflowBoxes={boxes}
      pinned={NO_PROBLEMS}
      warnings={warned}
      selected={shown}
      readOnly
      dragging={null}
      notice={null}
      refusal={() => null}
      onOpenBox={onOpenBox}
      reveal={reveal}
      cover={cover}
      onSelect={onSelect ?? setOwn}
      onDragStart={() => undefined}
      onDrop={() => undefined}
    />
  );
}
