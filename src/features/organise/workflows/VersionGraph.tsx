import { useMemo, useState, type ReactNode } from 'react';
import type { Primitive } from '@/api/types';
import { Button } from '@/ui/Button';
import { Checkbox } from '@/ui/Checkbox';
import { parseUse, useStepBoxes, workflowFrom, type Frame } from './boxes';
import { Description } from './Description';
import { DRAWER_WIDTH } from './Drawer';
import { useDrawnLayout } from './drawn-layout';
import { DrawnGraph } from './DrawnGraph';
import { Inside } from './Inside';
import { useInputsShown } from './inputs-shown';
import { selectionOf, type Selected } from './lines';
import { byRef } from './primitives';
import { VersionDrawer } from './VersionDrawer';

/**
 * A version drawn as the editor draws a draft, with nothing to change: what
 * it says it does above it, a box
 * clicked opens, its drawer on the right says what it holds, a workflow box
 * opened zooms into its inside as the editor's does, Files lists every file
 * of the version, and the switch shows the inputs and files the steps read. A workflow's page puts Files and the switch on its bar, with
 * the YAML marked where the picked box is written; a task's Workflow card
 * puts them above the graph.
 */
export function VersionGraph({
  owner,
  name,
  version,
  text,
  primitives,
  bar,
}: {
  owner: string;
  name: string;
  version: string;
  text: string;
  primitives: Primitive[];
  /** What goes above the graph, given Files and the switch, and the pick. */
  bar: (tools: ReactNode, selected: Selected | null) => ReactNode;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [inputsShown, showInputs] = useInputsShown();
  const lines = selectionOf(selected);
  const map = useMemo(() => byRef(primitives), [primitives]);
  const workflow = useMemo(() => workflowFrom(text), [text]);
  const boxes = useStepBoxes(workflow, map);
  const inputs = inputsShown ? 'shown' : 'hidden';
  const { layout } = useDrawnLayout(workflow, map, boxes, selected, false, inputs);
  const [stack, setStack] = useState<Frame[]>([]);

  /** Shows the inside of the workflow the step at `index` runs. */
  const openBox = (index: number) => {
    const step = workflow.steps[index];
    const use = step === undefined ? null : parseUse(step.use);
    if (step === undefined || use === null || map.has(step.use)) return;
    setSelected(null);
    setStack([{ use, title: step.id, rest: [], mark: null }]);
  };

  return (
    <>
      {bar(
        <>
          <Button variant="secondary" onClick={() => setSelected('files')}>
            Files
          </Button>
          <Checkbox
            label="Show inputs and files"
            checked={inputsShown}
            onChange={showInputs}
          />
        </>,
        lines,
      )}
      {stack.length === 0 && <Description text={workflow.description} />}
      {stack.length > 0 ? (
        <Inside
          root={name}
          draft={{ workflow, boxes, layout }}
          frames={stack}
          primitives={primitives}
          onCrumb={(index) =>
            setStack((current) => (index < 0 ? [] : current.slice(0, index + 1)))
          }
          onGo={(next, box) => {
            setSelected(next.length === 0 ? (box?.key ?? null) : null);
            setStack(next);
          }}
          onDetails={(index) => setSelected(`step:${String(index)}`)}
        />
      ) : (
        <DrawnGraph
          text={text}
          primitives={primitives}
          selected={selected}
          onSelect={setSelected}
          onOpenBox={openBox}
          boxes={boxes}
          inputs={inputs}
          cover={lines === null ? 0 : DRAWER_WIDTH}
        />
      )}
      <VersionDrawer
        owner={owner}
        name={name}
        version={version}
        text={text}
        workflow={workflow}
        primitives={map}
        boxes={boxes}
        selected={lines}
        onClose={() => setSelected(null)}
      />
    </>
  );
}
