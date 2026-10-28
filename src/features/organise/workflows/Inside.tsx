import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Primitive } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { NumberText } from '../forms/yaml-doc';
import {
  formatUse,
  parseUse,
  portsOf,
  useStepBoxes,
  versionOptions,
  workflowFrom,
  type BoxDecl,
  type Frame,
  type UseRef,
} from './boxes';
import { Description } from './Description';
import { Drawer } from './Drawer';
import { DrawnGraph } from './DrawnGraph';
import { layoutWorkflow, PALETTE, type Box, type Layout } from './layout';
import { refsOf, type Ref, type WithValue, type Workflow } from './model';
import { byRef, type PrimitiveInfo } from './primitives';
import { stepOutputs } from './rules';
import { refWords } from './words';
import classes from './workflows.module.css';

const NOWHERE: UseRef = { owner: '', name: '', version: '' };
const ALL_OPEN = { open: 'all' as const };

/** A level of the graph as it is drawn: its workflow, its boxes' ports, and their layout. */
export type Level = {
  workflow: Workflow;
  boxes: ReadonlyMap<string, BoxDecl>;
  layout: Layout;
};

/**
 * A version's file, read and laid out as Inside draws it, every box open,
 * with the boxes of the run workflows it uses; null until it is read.
 */
function useLevel(
  text: string | null,
  primitives: Map<string, PrimitiveInfo>,
): Level | null {
  const workflow = useMemo(() => (text === null ? null : workflowFrom(text)), [text]);
  const boxes = useStepBoxes(workflow, primitives);
  return useMemo(
    () =>
      workflow === null
        ? null
        : {
            workflow,
            boxes,
            layout: layoutWorkflow(workflow, primitives, portsOf(boxes), ALL_OPEN),
          },
    [workflow, primitives, boxes],
  );
}

/** A version's file, or nothing for `null`. */
function useVersion(use: UseRef | null) {
  return useQuery({
    ...versionOptions(use ?? NOWHERE),
    enabled: use !== null,
    retry: false,
  });
}

/**
 * The boxes of a level that the step at `index` reads, and the boxes that
 * read it, each once, in the order the file names them: wires and values
 * written into text alike.
 */
function neighbours(level: Level, index: number): { into: Box[]; out: Box[] } {
  const { workflow, layout } = level;
  const step = workflow.steps[index];
  if (step === undefined) return { into: [], out: [] };
  const stepBox = (at: number) =>
    layout.boxes.find((box) => box.kind === 'step' && box.step === at);
  const boxOf = (ref: Ref): Box | undefined => {
    if (ref.kind === 'inputs')
      return layout.boxes.find(
        (box) => box.kind === 'input' && box.right[0] === ref.name,
      );
    if (ref.kind === 'workflow')
      return layout.boxes.find(
        (box) => box.kind === 'file' && box.right[0] === ref.name,
      );
    return stepBox(workflow.steps.findIndex((other) => other.id === ref.name));
  };
  const once = (boxes: (Box | undefined)[]) =>
    [...new Set(boxes)].filter((box): box is Box => box !== undefined);
  const reads = (value: WithValue) =>
    refsOf(value).some((ref) => ref.kind === 'steps' && ref.name === step.id);
  return {
    into: once(Object.values(step.with).flatMap(refsOf).map(boxOf)),
    out: once([
      ...workflow.steps.map((other, at) =>
        Object.values(other.with).some(reads) ? stepBox(at) : undefined,
      ),
      workflow.outputs.some(
        (entry) => entry.from?.kind === 'steps' && entry.from.name === step.id,
      )
        ? layout.boxes.find((box) => box.kind === 'outputs')
        : undefined,
    ]),
  };
}

/** What a neighbour is called on its button, and what it is under that. */
function neighbourWords(box: Box, workflow: Workflow): { name: string; line: string } {
  if (box.kind === 'step' && box.step !== null) {
    const step = workflow.steps[box.step];
    return { name: step?.id ?? '', line: step?.use ?? '' };
  }
  if (box.kind === 'input') return { name: box.right[0] ?? '', line: 'input' };
  if (box.kind === 'file') return { name: box.right[0] ?? '', line: 'workflow file' };
  return { name: 'Outputs', line: 'what each run gives' };
}

/** What a port is given, in words, for a step read but not changed. */
function givenWords(value: WithValue): string {
  if (value.kind === 'wire') return refWords(value.ref);
  if (value.kind === 'text') return value.text;
  if (value.kind === 'literal')
    return value.value instanceof NumberText ? value.value.text : String(value.value);
  if (value.kind === 'invalid') return JSON.stringify(value.raw);
  const read = refsOf(value).map(refWords);
  return read.length === 0 ? 'several values' : read.join(', ');
}

/**
 * A step of a workflow opened from the one being edited, read only: what it
 * runs, what each of its ports is given and what it gives. It is changed
 * in that workflow, which is then moved to its new version.
 */
function StepSummary({
  workflow,
  index,
  primitives,
  boxes,
}: {
  workflow: Workflow;
  index: number;
  primitives: Map<string, PrimitiveInfo>;
  boxes: ReadonlyMap<string, BoxDecl>;
}) {
  const step = workflow.steps[index];
  if (step === undefined) return null;
  const outputs = stepOutputs(primitives, boxes, step).filter(
    (output) => output.type !== 'outcome',
  );
  const given = Object.entries(step.with);
  return (
    <section className={classes.panel} aria-label={`The step ${step.id}`}>
      <BodyText size="sm">
        <span className={classes.ref}>{step.use}</span>
      </BodyText>
      <BodyText size="sm" tone="secondary">
        Read only. Change it in the workflow that holds it, then move that workflow’s
        step to its new version.
      </BodyText>
      <h3 className={classes.part}>What it takes</h3>
      {given.length === 0 ? (
        <BodyText size="sm">Nothing yet</BodyText>
      ) : (
        <ul className={classes.outputs} aria-label="What it takes">
          {given.map(([port, value]) => (
            <li key={port}>
              <strong>{port}</strong> {givenWords(value)}
            </li>
          ))}
        </ul>
      )}
      {outputs.length > 0 && (
        <>
          <h3 className={classes.part}>What it gives</h3>
          <ul className={classes.outputs} aria-label="What it gives">
            {outputs.map((output) => (
              <li key={output.name}>
                <strong>{output.name}</strong>{' '}
                <span className={classes.ref}>{output.type}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function Neighbour({
  box,
  workflow,
  colour,
  onClick,
}: {
  box: Box;
  workflow: Workflow;
  colour: string;
  onClick: () => void;
}) {
  const { name, line } = neighbourWords(box, workflow);
  return (
    <button
      type="button"
      className={classes.neighbour}
      style={{ borderColor: colour }}
      title={`${name}: ${line}`}
      onClick={onClick}
    >
      <span className={classes.neighbourName}>{name}</span>
      <span className={classes.neighbourLine}>{line}</span>
    </button>
  );
}

/**
 * Inside a box opened from the workflow being edited, or from a version
 * shown read only, as deep as it goes:
 * the breadcrumb back to each level, then the well, which zooms in from the
 * box at the level above when a box is opened. The well holds what feeds
 * the box on its left, what it feeds on its right, and between them its
 * reference, that a newer version is out, Details, and its inside, read
 * only with every box open. Details opens the drawer on the box's step at
 * the level above, through `onDetails` when that is the draft, where it can
 * be changed, and read only here deeper down.
 */
export function Inside({
  root,
  draft,
  frames,
  primitives,
  onCrumb,
  onGo,
  onDetails,
}: {
  /** The name of the workflow being edited. */
  root: string;
  /** The draft as the editor draws it, the level the first box is opened from. */
  draft: Level;
  frames: Frame[];
  primitives: Primitive[];
  /** -1 is the workflow being edited; otherwise the frame to stop at. */
  onCrumb: (index: number) => void;
  /** Goes to `next`; at the draft with `box` selected there, when it is given. */
  onGo: (next: Frame[], box: Box | null) => void;
  /** Opens the drawer on the draft's step at `index`. */
  onDetails: (index: number) => void;
}) {
  const map = useMemo(() => byRef(primitives), [primitives]);
  const frame = frames[frames.length - 1];
  const parent = frames.length > 1 ? frames[frames.length - 2] : undefined;
  const read = useVersion(frame?.use ?? null);
  const readAbove = useVersion(parent?.use ?? null);
  const here = useLevel(read.data?.content ?? null, map);
  const fetched = useLevel(readAbove.data?.content ?? null, map);
  const above = parent === undefined ? draft : fetched;
  const path = frames.map((item) => item.title).join('/');

  // What changes with the box shown: Details closes, the zoom plays only
  // when a box is opened, not when going back up, and the focus goes to
  // where the breadcrumb says the page now is.
  const [shown, setShown] = useState({ path, depth: frames.length, zooms: true });
  const [details, setDetails] = useState(false);
  if (shown.path !== path) {
    setShown({ path, depth: frames.length, zooms: frames.length >= shown.depth });
    setDetails(false);
  }
  const current = useRef<HTMLElement>(null);
  useEffect(() => {
    current.current?.focus();
  }, [path]);

  if (frame === undefined) return null;
  const index =
    above?.workflow.steps.findIndex((step) => step.id === frame.title) ?? -1;
  const placed = above?.layout.boxes.find(
    (box) => box.kind === 'step' && box.step === index,
  );
  const origin =
    placed === undefined || above === null
      ? { x: 50, y: 40 }
      : {
          x: ((placed.x + placed.width / 2) / Math.max(above.layout.width, 1)) * 100,
          y: ((placed.y + placed.height / 2) / Math.max(above.layout.height, 1)) * 100,
        };
  const kin =
    above === null || index < 0 ? { into: [], out: [] } : neighbours(above, index);
  const newer = above?.boxes.get(formatUse(frame.use))?.newer ?? null;
  const problemAt = frame.rest.length === 1 ? frame.rest[0] : null;
  const marked = here?.workflow.steps.findIndex((step) => step.id === problemAt) ?? -1;
  const selected = frame.mark ?? (marked >= 0 ? `step:${String(marked)}` : null);

  /** A neighbour's workflow box is opened in this one's place; any other box is shown selected at the level above. */
  const visit = (box: Box) => {
    const up = frames.slice(0, -1);
    const step =
      box.step === null || above === null ? undefined : above.workflow.steps[box.step];
    const use = step === undefined || map.has(step.use) ? null : parseUse(step.use);
    if (step !== undefined && use !== null) {
      onGo([...up, { use, title: step.id, rest: [], mark: null }], null);
      return;
    }
    const last = up[up.length - 1];
    if (last === undefined) onGo([], box);
    else onGo([...up.slice(0, -1), { ...last, rest: [], mark: box.key }], null);
  };

  return (
    <div className={classes.stack}>
      <nav className={classes.crumb} aria-label="Inside the workflow">
        {[root, ...frames.map((item) => item.title)].map((part, at) => (
          <span key={`${part}-${String(at)}`} className={classes.crumbPart}>
            {at > 0 && (
              <span className={classes.caret} aria-hidden>
                ›
              </span>
            )}
            {at === frames.length ? (
              <span
                ref={current}
                tabIndex={-1}
                className={classes.crumbButton}
                data-here
                aria-current="page"
                title={part}
              >
                {part}
              </span>
            ) : (
              <button
                type="button"
                className={classes.crumbButton}
                title={part}
                onClick={() => onCrumb(at - 1)}
              >
                {part}
              </button>
            )}
          </span>
        ))}
      </nav>
      <div
        key={path}
        className={classes.zoom}
        data-zooms={shown.zooms || undefined}
        style={
          {
            '--zoom-x': `${String(origin.x)}%`,
            '--zoom-y': `${String(origin.y)}%`,
          } as CSSProperties
        }
      >
        <div
          className={classes.well}
          data-in={kin.into.length > 0 || undefined}
          data-out={kin.out.length > 0 || undefined}
        >
          {kin.into.length > 0 && above !== null && (
            <section className={classes.side} data-side="in" aria-label="What feeds it">
              {kin.into.map((box) => (
                <Neighbour
                  key={box.key}
                  box={box}
                  workflow={above.workflow}
                  colour={PALETTE.input}
                  onClick={() => visit(box)}
                />
              ))}
            </section>
          )}
          <div className={classes.wellCentre}>
            <div className={classes.wellBar}>
              <BodyText size="sm" tone="secondary">
                <span className={classes.ref}>{formatUse(frame.use)}</span>
                {newer !== null && ` · ${newer} is out`}
              </BodyText>
              {index >= 0 && (
                <Button
                  size="xs"
                  variant="secondary"
                  onClick={() => {
                    if (parent === undefined) onDetails(index);
                    else setDetails(true);
                  }}
                >
                  Details
                </Button>
              )}
            </div>
            <Description text={here?.workflow.description ?? null} />
            {read.isPending && <BodyText>Opening {frame.title}…</BodyText>}
            {read.isError && (
              <BodyText>{formatUse(frame.use)} cannot be read.</BodyText>
            )}
            {read.data !== undefined && (
              <DrawnGraph
                // The graph reads its pick once, so a new mark draws it again.
                key={selected ?? ''}
                text={read.data.content}
                primitives={primitives}
                boxes={here?.boxes}
                selected={selected}
                allOpen
                onOpenBox={(opened) => {
                  const step = here?.workflow.steps[opened];
                  const use =
                    step === undefined || map.has(step.use) ? null : parseUse(step.use);
                  if (step === undefined || use === null) return;
                  onGo(
                    [...frames, { use, title: step.id, rest: [], mark: null }],
                    null,
                  );
                }}
              />
            )}
          </div>
          {kin.out.length > 0 && above !== null && (
            <section
              className={classes.side}
              data-side="out"
              aria-label="What it feeds"
            >
              {kin.out.map((box) => (
                <Neighbour
                  key={box.key}
                  box={box}
                  workflow={above.workflow}
                  colour={PALETTE.middle[1]}
                  onClick={() => visit(box)}
                />
              ))}
            </section>
          )}
        </div>
      </div>
      <Drawer
        title={details && index >= 0 ? `Step ${frame.title}` : null}
        onClose={() => setDetails(false)}
      >
        {above !== null && (
          <StepSummary
            workflow={above.workflow}
            index={index}
            primitives={map}
            boxes={above.boxes}
          />
        )}
      </Drawer>
    </div>
  );
}
