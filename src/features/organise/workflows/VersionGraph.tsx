import { useMemo, useState, type ReactNode } from 'react';
import type { Primitive } from '@/api/types';
import { Button } from '@/ui/Button';
import { Checkbox } from '@/ui/Checkbox';
import { useStepBoxes, workflowFrom } from './boxes';
import { DRAWER_WIDTH } from './Drawer';
import { DrawnGraph } from './DrawnGraph';
import { useInputsShown } from './inputs-shown';
import { selectionOf, type Selected } from './lines';
import { byRef } from './primitives';
import { VersionDrawer } from './VersionDrawer';

/**
 * A version drawn as the editor draws a draft, with nothing to change: a box
 * clicked opens, its drawer on the right says what it holds, Files lists
 * every file of the version, and the switch shows the inputs and files the
 * steps read. A workflow's page puts Files and the switch on its bar, with
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
      <DrawnGraph
        text={text}
        primitives={primitives}
        selected={selected}
        onSelect={setSelected}
        boxes={boxes}
        inputs={inputsShown ? 'shown' : 'hidden'}
        cover={lines === null ? 0 : DRAWER_WIDTH}
      />
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
