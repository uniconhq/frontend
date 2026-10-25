import { useMemo } from 'react';
import type { Primitive } from '@/api/types';
import { useMarkColours } from '@/ui/brand/mark-colours';
import { exactJS, parseYaml } from '../forms/yaml-doc';
import type { BoxDecl } from './boxes';
import { Graph } from './Graph';
import { layoutWorkflow, type Box, type StepPorts } from './layout';
import { readWorkflow } from './model';
import { pinned } from './pins';
import { byRef } from './primitives';

const NO_PROBLEMS = pinned([], 0, [], [], []);
const NO_BOXES = new Map<string, BoxDecl>();

/**
 * A workflow version's steps drawn as the editor draws a draft, with nothing
 * to change: its boxes and wires, a box picked by clicking it. The
 * workflow's own page and a task's Workflow card both show a version so.
 */
export function DrawnGraph({
  text,
  primitives,
  boxes = NO_BOXES,
  selected = null,
  onSelect = () => undefined,
  onOpenBox,
}: {
  text: string;
  primitives: Primitive[];
  boxes?: ReadonlyMap<string, BoxDecl>;
  selected?: string | null;
  onSelect?: (key: string | null, box: Box | undefined) => void;
  onOpenBox?: (index: number) => void;
}) {
  const colours = useMarkColours();
  const map = useMemo(() => byRef(primitives), [primitives]);
  const workflow = useMemo(() => {
    const parsed = parseYaml(text);
    return readWorkflow('error' in parsed ? null : exactJS(parsed.doc));
  }, [text]);
  const ports = useMemo(() => {
    const found = new Map<string, StepPorts>();
    for (const [use, box] of boxes)
      if (box.run)
        found.set(use, {
          inputs: box.inputs.map((input) => input.name),
          outputs: box.outputs.map((output) => output.name),
        });
    return found;
  }, [boxes]);
  const layout = useMemo(
    () => layoutWorkflow(workflow, map, ports),
    [workflow, map, ports],
  );
  return (
    <Graph
      layout={layout}
      workflow={workflow}
      primitives={map}
      workflowBoxes={boxes}
      pinned={NO_PROBLEMS}
      colours={colours}
      selected={selected}
      readOnly
      dragging={null}
      notice={null}
      refusal={() => null}
      onOpenBox={onOpenBox}
      onSelect={(key) =>
        onSelect(
          key,
          layout.boxes.find((box) => box.key === key),
        )
      }
      onDragStart={() => undefined}
      onDrop={() => undefined}
    />
  );
}
