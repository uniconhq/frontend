import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  BaseEdge,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type EdgeProps,
  type FinalConnectionState,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { DefinitionProblem } from '@/api/types';
import {
  GEOMETRY,
  columnX,
  headerOf,
  rowOf,
  wirePath,
  type Box,
  type Layout,
  type Point,
} from './layout';
import { sourceAt, targetAt, type Notice, type Target } from './ends';
import { NumberText } from '../forms/yaml-doc';
import { type Ref, type Workflow } from './model';
import type { Pinned } from './pins';
import { declared, type PrimitiveInfo } from './primitives';
import {
  boxName,
  entryMarks,
  fieldMarks,
  inputMarks,
  portMarks,
  primitiveTitle,
  readersWords,
  refWords,
  runsWords,
} from './words';
import classes from './workflows.module.css';

/**
 * The workflow drawn as boxes and wires. React Flow draws them and handles
 * the drags; where everything stands is `layout`'s, worked out from the file,
 * so React Flow places nothing and no node can be dragged. A wire is drawn by
 * dragging from a source's handle to a port's; while one is dragged, each
 * port says whether it would take it, and one that would not says why, at
 * the port, when the wire is dropped there. Every port is also a button
 * whose menu does what a drag does, for the keyboard. Each box and row says
 * what it is in words (M31): a step its primitive's title and what it does,
 * a port what it does that the author acts on, and a problem its message
 * beside its mark.
 */

type GraphContext = {
  readOnly: boolean;
  workflow: Workflow;
  primitives: Map<string, PrimitiveInfo>;
  pinned: Pinned;
  colours: string[];
  selected: string | null;
  dragging: Ref | null;
  refusal: (source: Ref, target: Target) => string | null;
  notice: Notice | null;
  menu: (box: Box, port: string, side: 'left' | 'right') => ReactNode;
  select: (key: string) => void;
  /** The ports a drawn wire feeds, `port:<step>.<port>`. */
  drawn: Set<string>;
};

const Context = createContext<GraphContext | null>(null);

function useGraph(): GraphContext {
  const found = useContext(Context);
  if (found === null) throw new Error('A graph node renders inside Graph.');
  return found;
}

type BoxNode = Node<{ box: Box }, 'box'>;
type SlotNode = Node<{ label: string | null; colour: number; source: string }, 'slot'>;
type BandNode = Node<Record<string, never>, 'band'>;
type WireEdge = Edge<
  { points: Point[]; colour: number; marked: boolean; dimmed: boolean },
  'wire'
>;

/**
 * What a port without a drawn wire is given, as the port shows it: a value,
 * text with values written in, or a wire the layout cannot draw, such as a
 * once step reading a per-test one, which the file holds all the same.
 */
function shownValue(
  workflow: Workflow,
  box: Box,
  port: string,
  drawn: Set<string>,
): string | null {
  if (box.step === null) return null;
  const value = workflow.steps[box.step]?.with[port];
  if (value === undefined) return null;
  if (value.kind === 'wire')
    return drawn.has(`port:${String(box.step)}.${port}`)
      ? null
      : `${refWords(value.ref)}, not drawn`;
  if (value.kind === 'literal')
    return value.value instanceof NumberText
      ? `= ${value.value.text}`
      : `= ${JSON.stringify(value.value)}`;
  if (value.kind === 'text') return `= ${JSON.stringify(value.text)}`;
  return 'a value no port takes';
}

/** A problem's mark, read out as its message, with the message beside it. */
function ProblemMark({ problem }: { problem: DefinitionProblem }) {
  return (
    <>
      <span
        className={classes.problem}
        role="note"
        aria-label={problem.message}
        title={problem.message}
      >
        !
      </span>
      <span className={classes.problemBeside} aria-hidden>
        {problem.message}
      </span>
    </>
  );
}

function PortRow({
  box,
  port,
  row,
  side,
}: {
  box: Box;
  port: string;
  row: number;
  side: 'left' | 'right';
}) {
  const graph = useGraph();
  const step = box.step !== null ? graph.workflow.steps[box.step] : undefined;
  const primitive = step !== undefined ? declared(graph.primitives, step.use) : null;
  const decl =
    side === 'left'
      ? primitive?.inputs[port]
      : box.kind === 'step'
        ? primitive?.outputs[port]
        : undefined;
  const target = side === 'left' ? targetAt(box, port) : null;
  const refused =
    graph.dragging !== null && target !== null
      ? graph.refusal(graph.dragging, target)
      : null;
  const offered = graph.dragging !== null && target !== null && refused === null;
  const problems =
    side === 'left' && box.step !== null
      ? (graph.pinned.ports.get(`${String(box.step)}.${port}`) ?? [])
      : box.kind === 'inputs'
        ? (graph.pinned.inputs.get(port) ?? [])
        : box.kind === 'test'
          ? (graph.pinned.fields.get(port) ?? [])
          : box.kind === 'report'
            ? (graph.pinned.entries.get(port) ?? [])
            : [];
  const notice =
    graph.notice !== null && graph.notice.box === box.key && graph.notice.port === port
      ? graph.notice.reason
      : null;
  const value =
    side === 'left' ? shownValue(graph.workflow, box, port, graph.drawn) : null;
  const input =
    box.kind === 'inputs'
      ? graph.workflow.inputs.find((found) => found.id === port)
      : undefined;
  const field =
    box.kind === 'test'
      ? graph.workflow.test.find((found) => found.name === port)
      : undefined;
  const entry =
    box.kind === 'report'
      ? graph.workflow.report.find((found) => found.name === port)
      : undefined;
  const type = decl?.type ?? input?.type ?? field?.type ?? null;
  const optional = decl?.optional === true || input?.optional === true;
  const marks = [
    ...(side === 'left' && primitive !== null ? portMarks(primitive, port) : []),
    ...(input !== undefined ? inputMarks(input) : []),
    ...(field !== undefined ? fieldMarks(field) : []),
    ...(entry !== undefined ? entryMarks(entry) : []),
  ];
  const said = [type, ...marks, value].filter((part) => part !== null).join(' · ');
  const isNew = box.kind === 'report' && port === '+';
  const first = problems[0];
  return (
    <div
      className={classes.row}
      data-side={side}
      data-output={(box.kind === 'step' && side === 'right') || undefined}
      data-first-output={
        (box.kind === 'step' && side === 'right' && box.right[0] === port) || undefined
      }
      data-offered={offered || undefined}
      data-refused={refused !== null || undefined}
      style={{ top: headerOf(box.kind) + row * GEOMETRY.row, height: GEOMETRY.row }}
      title={refused ?? first?.message ?? (isNew ? undefined : `${port} · ${said}`)}
    >
      <Handle
        type={side === 'left' ? 'target' : 'source'}
        position={side === 'left' ? Position.Left : Position.Right}
        id={`${side === 'left' ? 'in' : 'out'}:${port}`}
        className={classes.handle}
        isConnectable={!graph.readOnly}
        isConnectableStart={side === 'right'}
        isConnectableEnd={side === 'left'}
      />
      {isNew ? (
        <span className={classes.drop}>
          {graph.readOnly ? '' : 'Drop an output here to report it'}
        </span>
      ) : (
        <>
          {graph.menu(box, port, side)}
          {optional && <span className={classes.optional}>(optional)</span>}
          {first !== undefined ? (
            problems.map((problem) => (
              <ProblemMark key={problem.message} problem={problem} />
            ))
          ) : (
            <span className={classes.said}>{said}</span>
          )}
        </>
      )}
      {refused !== null && (
        <span className={classes.refusedMark} aria-hidden>
          ✕
        </span>
      )}
      {notice !== null && (
        <span className={classes.notice} role="alert">
          {notice}
        </span>
      )}
    </div>
  );
}

/** The head of a step's box: its name and how often it runs, its primitive, what that does. */
function StepHead({ box }: { box: Box }) {
  const graph = useGraph();
  const step = box.step !== null ? graph.workflow.steps[box.step] : undefined;
  const primitive = step !== undefined ? declared(graph.primitives, step.use) : null;
  const problems = box.step !== null ? (graph.pinned.steps.get(box.step) ?? []) : [];
  return (
    <>
      <button
        type="button"
        className={`${classes.headButton} nodrag nopan`}
        onClick={() => graph.select(box.key)}
      >
        <span className={classes.titleLine}>
          <span className={classes.title}>{step?.id || '(no name)'}</span>
          <span className={classes.runs}>{runsWords(step?.perTest === true)}</span>
        </span>
        <span className={classes.primitiveLine}>
          {primitive !== null && (
            <span className={classes.primitiveTitle}>{primitiveTitle(primitive)}</span>
          )}
          <span className={classes.ref}>{step?.use ?? ''}</span>
        </span>
      </button>
      {problems.length > 0 ? (
        <p className={classes.headProblem}>
          {problems.map((problem) => (
            <ProblemMark key={problem.message} problem={problem} />
          ))}
        </p>
      ) : (
        primitive?.description && (
          <p className={classes.description} title={primitive.description}>
            {primitive.description}
          </p>
        )
      )}
    </>
  );
}

function GroupHead({ box }: { box: Box }) {
  const graph = useGraph();
  return (
    <button
      type="button"
      className={`${classes.headButton} nodrag nopan`}
      onClick={() => graph.select(box.key)}
    >
      <span className={classes.title}>{boxName(box, graph.workflow)}</span>
      <span className={classes.detail}>
        {box.kind === 'report'
          ? 'What each grading reports'
          : readersWords(box.readers)}
      </span>
    </button>
  );
}

function BoxView({ data }: NodeProps<BoxNode>) {
  const graph = useGraph();
  const { box } = data;
  const left = box.kind === 'report' ? [...box.left, '+'] : box.left;
  return (
    <div
      className={classes.box}
      data-kind={box.kind}
      data-selected={graph.selected === box.key || undefined}
      data-dimmed={(graph.selected !== null && graph.selected !== box.key) || undefined}
      style={{ borderColor: graph.colours[box.colour] }}
      role="group"
      aria-label={boxName(box, graph.workflow)}
    >
      <div className={classes.header} style={{ height: headerOf(box.kind) }}>
        {box.kind === 'step' ? <StepHead box={box} /> : <GroupHead box={box} />}
      </div>
      {left.map((port, row) => (
        <PortRow key={`in ${port}`} box={box} port={port} row={row} side="left" />
      ))}
      {box.right.map((port) => (
        <PortRow
          key={`out ${port}`}
          box={box}
          port={port}
          row={rowOf(box, 'right', port)}
          side="right"
        />
      ))}
    </div>
  );
}

function SlotView({ data }: NodeProps<SlotNode>) {
  const graph = useGraph();
  return (
    <div className={classes.slot} style={{ color: graph.colours[data.colour] }}>
      {data.label !== null && <span className={classes.slotLabel}>{data.label}</span>}
    </div>
  );
}

function BandView() {
  return <div className={classes.band} aria-hidden />;
}

function WireView({ data }: EdgeProps<WireEdge>) {
  const graph = useGraph();
  if (data === undefined) return null;
  return (
    <BaseEdge
      path={wirePath(data.points)}
      style={{
        stroke: graph.colours[data.colour],
        strokeWidth: data.marked ? 3 : 2,
        opacity: data.dimmed ? 0.2 : 1,
      }}
    />
  );
}

const NODE_TYPES = { box: BoxView, slot: SlotView, band: BandView };
const EDGE_TYPES = { wire: WireView };

/** Space around the graph inside its frame, room for the band and the handles. */
const PAD = 32;

/** A box asked to be scrolled into view; `nonce` asks again for the same box. */
export type Reveal = { key: string; nonce: number };

/**
 * Scroll the box `reveal` names into view: sideways inside the graph's own
 * frame, clear of `cover` pixels of it hidden under a drawer on the right,
 * and up or down in the page.
 */
function useReveal(
  frame: RefObject<HTMLDivElement | null>,
  layout: Layout,
  reveal: Reveal | null,
  cover: number,
) {
  useEffect(() => {
    const scroller = frame.current;
    if (reveal === null || scroller === null) return;
    const box = layout.boxes.find((found) => found.key === reveal.key);
    if (box === undefined) return;
    const rect = scroller.getBoundingClientRect();
    const hidden = Math.max(0, rect.right - (window.innerWidth - cover));
    const seen = scroller.clientWidth - hidden;
    const left = PAD + box.x - 16;
    const right = PAD + box.x + box.width + 16;
    let to = scroller.scrollLeft;
    if (right > to + seen) to = right - seen;
    if (left < to) to = left;
    if (to !== scroller.scrollLeft) scroller.scrollTo?.({ left: Math.max(0, to) });
    // React Flow draws a box it has just been given a frame or two later, and
    // the frame grows to hold it then, so up or down the page waits for that.
    const selector = `.react-flow__node[data-id="${CSS.escape(box.key)}"]`;
    let tries = 0;
    let waiting = 0;
    const down = () => {
      const node = scroller.querySelector<HTMLElement>(selector);
      const drawn =
        node !== null &&
        scroller.getBoundingClientRect().bottom >= node.getBoundingClientRect().bottom;
      if (node !== null && (drawn || tries >= 30)) {
        node.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
        return;
      }
      tries += 1;
      if (tries <= 30) waiting = requestAnimationFrame(down);
    };
    down();
    return () => cancelAnimationFrame(waiting);
  }, [frame, layout, reveal, cover]);
}

/**
 * The graph at its actual size, never scaled: as tall as its tallest column,
 * so the page scrolls down it, and as wide as its columns, sliding sideways
 * inside its frame with a scrollbar, Shift and the wheel, or a trackpad's
 * sideways swipe. The wheel alone scrolls the page, as anywhere else, since
 * a graph that took it would trap the page under it. React Flow only draws
 * and drags here: its viewport is fixed, with no zoom and no pan of its own.
 * `reveal` scrolls a box into view, clear of `cover` pixels a drawer hides
 * on the right, where the graph keeps that much room past its last column.
 */
export function Graph({
  layout,
  workflow,
  primitives,
  pinned,
  colours,
  selected,
  readOnly,
  dragging,
  notice,
  refusal,
  menu,
  onSelect,
  onDragStart,
  onDrop,
  reveal = null,
  cover = 0,
}: {
  layout: Layout;
  workflow: Workflow;
  primitives: Map<string, PrimitiveInfo>;
  pinned: Pinned;
  colours: string[];
  selected: string | null;
  readOnly: boolean;
  dragging: Ref | null;
  notice: Notice | null;
  refusal: (source: Ref, target: Target) => string | null;
  menu: (box: Box, port: string, side: 'left' | 'right') => ReactNode;
  onSelect: (key: string | null) => void;
  onDragStart: (source: Ref | null) => void;
  onDrop: (source: Ref, target: Target, box: string, port: string) => void;
  reveal?: Reveal | null;
  cover?: number;
}) {
  const frame = useRef<HTMLDivElement>(null);
  useReveal(frame, layout, reveal, cover);
  const boxes = useMemo(
    () => new Map(layout.boxes.map((box) => [box.key, box])),
    [layout],
  );
  const nodes = useMemo(() => {
    const found: (BoxNode | SlotNode | BandNode)[] = [];
    if (layout.band !== null) {
      const left = columnX(layout.band.first) - GEOMETRY.gap / 2;
      const right = columnX(layout.band.last) + GEOMETRY.width + GEOMETRY.gap / 2;
      found.push({
        id: 'band',
        type: 'band',
        position: { x: left, y: -GEOMETRY.space },
        width: right - left,
        height: layout.height + 2 * GEOMETRY.space,
        data: {},
        selectable: false,
        draggable: false,
        connectable: false,
        zIndex: -1,
      });
    }
    for (const box of layout.boxes)
      found.push({
        id: box.key,
        type: 'box',
        position: { x: box.x, y: box.y },
        width: box.width,
        height: box.height,
        data: { box },
        draggable: false,
        className: 'nopan',
      });
    for (const slot of layout.slots)
      found.push({
        id: slot.key,
        type: 'slot',
        position: { x: slot.x, y: slot.y },
        width: slot.width,
        height: slot.height,
        data: { label: slot.label, colour: slot.colour, source: slot.source },
        draggable: false,
        selectable: false,
        connectable: false,
      });
    return found;
  }, [layout]);
  const edges = useMemo<WireEdge[]>(
    () =>
      layout.wires.map((wire) => {
        const marked =
          selected !== null && (wire.from.box === selected || wire.to.box === selected);
        return {
          id: wire.key,
          type: 'wire',
          source: wire.from.box,
          sourceHandle: `out:${wire.from.port}`,
          target: wire.to.box,
          targetHandle: `in:${wire.to.port}`,
          selectable: false,
          data: {
            points: wire.points,
            colour: wire.colour,
            marked,
            dimmed: selected !== null && !marked,
          },
        };
      }),
    [layout, selected],
  );

  const ends = (
    nodeId: string | null | undefined,
    handleId: string | null | undefined,
  ): { box: Box; port: string } | null => {
    const box = nodeId ? boxes.get(nodeId) : undefined;
    if (box === undefined || !handleId) return null;
    return { box, port: handleId.slice(handleId.indexOf(':') + 1) };
  };
  const fromConnection = (
    state: FinalConnectionState,
  ): { source: Ref; target: Target; box: string; port: string } | null => {
    if (
      state.fromHandle === null ||
      state.toHandle === null ||
      state.toHandle === undefined
    )
      return null;
    const from = ends(state.fromHandle.nodeId, state.fromHandle.id);
    const to = ends(state.toHandle.nodeId, state.toHandle.id);
    if (from === null || to === null) return null;
    const source = sourceAt(from.box, from.port, workflow);
    const target = targetAt(to.box, to.port);
    return source !== null && target !== null
      ? { source, target, box: to.box.key, port: to.port }
      : null;
  };

  const drawn = useMemo(
    () => new Set(layout.wires.map((wire) => wire.target)),
    [layout],
  );
  const context = useMemo<GraphContext>(
    () => ({
      readOnly,
      workflow,
      primitives,
      pinned,
      colours,
      selected,
      dragging,
      refusal,
      notice,
      menu,
      select: (key) => onSelect(key === selected ? null : key),
      drawn,
    }),
    [
      readOnly,
      workflow,
      primitives,
      pinned,
      colours,
      selected,
      dragging,
      refusal,
      notice,
      menu,
      onSelect,
      drawn,
    ],
  );
  return (
    <Context value={context}>
      <ReactFlowProvider>
        <div className={classes.frame} ref={frame}>
          <div
            className={classes.canvas}
            style={{
              width: layout.width + 2 * PAD + cover,
              height: layout.height + 2 * PAD,
            }}
          >
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={NODE_TYPES}
              edgeTypes={EDGE_TYPES}
              nodesDraggable={false}
              nodesConnectable={!readOnly}
              elementsSelectable={false}
              defaultViewport={{ x: PAD, y: PAD, zoom: 1 }}
              minZoom={1}
              maxZoom={1}
              panOnDrag={false}
              panOnScroll={false}
              zoomOnScroll={false}
              zoomOnPinch={false}
              zoomOnDoubleClick={false}
              preventScrolling={false}
              autoPanOnConnect={false}
              autoPanOnNodeFocus={false}
              proOptions={{ hideAttribution: true }}
              isValidConnection={() => true}
              onPaneClick={() => onSelect(null)}
              onNodeClick={(event, node) => {
                const inside = (event.target as HTMLElement).closest(
                  'button, [role="menu"]',
                );
                if (inside === null && boxes.has(node.id)) context.select(node.id);
              }}
              onConnectStart={(_, params) => {
                const from = ends(params.nodeId, params.handleId);
                onDragStart(
                  from !== null && params.handleType === 'source'
                    ? sourceAt(from.box, from.port, workflow)
                    : null,
                );
              }}
              onConnectEnd={(_, state) => {
                onDragStart(null);
                const found = fromConnection(state);
                if (found !== null)
                  onDrop(found.source, found.target, found.box, found.port);
              }}
            />
          </div>
        </div>
      </ReactFlowProvider>
    </Context>
  );
}
