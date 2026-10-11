import { useMemo } from 'react';
import type { Primitive } from '@/api/types';
import { useMarkColours } from '@/ui/brand/mark-colours';
import { exactJS, parseYaml } from '../forms/yaml-doc';
import { Graph } from './Graph';
import { layoutWorkflow, type Box } from './layout';
import { readWorkflow } from './model';
import { pinned } from './pins';
import { byRef } from './primitives';
import classes from './workflows.module.css';

const NO_PROBLEMS = pinned([], 0, [], [], []);

/**
 * A workflow version's steps drawn as the editor draws a draft, with nothing
 * to change: its boxes and wires, a box picked by clicking it. The
 * workflow's own page and a task's Workflow card both show a version so.
 */
export function DrawnGraph({
  text,
  primitives,
  selected = null,
  onSelect = () => undefined,
}: {
  text: string;
  primitives: Primitive[];
  selected?: string | null;
  onSelect?: (key: string | null, box: Box | undefined) => void;
}) {
  const colours = useMarkColours();
  const map = useMemo(() => byRef(primitives), [primitives]);
  const workflow = useMemo(() => {
    const parsed = parseYaml(text);
    return readWorkflow('error' in parsed ? null : exactJS(parsed.doc));
  }, [text]);
  const layout = useMemo(() => layoutWorkflow(workflow, map), [workflow, map]);
  return (
    <Graph
      layout={layout}
      workflow={workflow}
      primitives={map}
      pinned={NO_PROBLEMS}
      colours={colours}
      selected={selected}
      readOnly
      dragging={null}
      notice={null}
      refusal={() => null}
      menu={(_, port) => <span className={classes.port}>{port}</span>}
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
