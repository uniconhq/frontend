import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
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
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  GEOMETRY,
  columnX,
  wirePath,
  type Box,
  type Layout,
  type Point,
} from './layout';
import { sourceAt, targetAt, type Notice, type Target } from './ends';
import { NumberText } from '../forms/yaml-doc';
import { refLabel, type Ref, type Workflow } from './model';
import type { Pinned } from './pins';
import { declared, raisingPorts, type PrimitiveInfo } from './primitives';
import classes from './workflows.module.css';

/**
 * The workflow drawn as boxes and wires. React Flow draws them and handles
 * the drags; where everything stands is `layout`'s, worked out from the file,
 * so React Flow places nothing and no node can be dragged. A wire is drawn by
 * dragging from a source's handle to a port's; while one is dragged, each
 * port says whether it would take it, and one that would not says why, at
 * the port, when the wire is dropped there. Every port is also a button
 * whose menu does what a drag does, for the keyboard.
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

const rowTop = (row: number) => GEOMETRY.header + row * GEOMETRY.row + GEOMETRY.row / 2;

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
      : `from ${refLabel(value.ref)}, not drawn`;
  if (value.kind === 'literal')
    return value.value instanceof NumberText
      ? value.value.text
      : JSON.stringify(value.value);
  if (value.kind === 'text') return JSON.stringify(value.text);
  return 'not a value a port takes';
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
  const marks = [
    decl?.optional ? 'optional' : null,
    decl?.runs ? 'runs' : null,
    decl?.secret ? 'secret' : null,
    side === 'left' && primitive !== null && raisingPorts(primitive).has(port)
      ? 'raises a limit'
      : null,
    input?.contestant ? 'contestant' : null,
    input?.perTest ? 'per test' : null,
    input?.optional ? 'optional' : null,
    field?.public ? 'public' : null,
    entry?.fold ? `fold ${entry.fold}` : null,
    entry?.better
      ? `better ${entry.better.startsWith('${{') ? 'by input' : entry.better}`
      : null,
  ].filter((mark): mark is string => mark !== null);
  const isNew = box.kind === 'report' && port === '+';
  return (
    <div
      className={classes.row}
      data-side={side}
      data-offered={offered || undefined}
      data-refused={refused !== null || undefined}
      style={{ top: rowTop(row) - GEOMETRY.row / 2, height: GEOMETRY.row }}
      title={refused ?? undefined}
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
          {graph.readOnly ? '' : 'Drop an output to report it'}
        </span>
      ) : (
        <>
          {graph.menu(box, port, side)}
          {type !== null && <span className={classes.type}>{type}</span>}
          {marks.length > 0 && (
            <span className={classes.marks}>{marks.join(' · ')}</span>
          )}
          {value !== null && <span className={classes.value}>= {value}</span>}
        </>
      )}
      {problems.map((problem) => (
        <span
          key={problem.message}
          className={classes.problem}
          role="note"
          aria-label={problem.message}
          title={problem.message}
        >
          !
        </span>
      ))}
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

function boxTitle(box: Box, workflow: Workflow): { title: string; detail: string } {
  if (box.kind === 'step' && box.step !== null) {
    const step = workflow.steps[box.step];
    return {
      title: step?.id || '(no id)',
      detail: `${step?.use ?? ''}${step?.perTest ? ' · per test' : ' · once'}`,
    };
  }
  const by =
    box.readers.length > 0
      ? `read by ${box.readers.join(', ')}`
      : 'nothing reads these yet';
  if (box.kind === 'inputs') return { title: 'Inputs', detail: by };
  if (box.kind === 'test') return { title: 'Test fields', detail: by };
  return { title: 'Report', detail: 'what a run reports' };
}

function BoxView({ data }: NodeProps<BoxNode>) {
  const graph = useGraph();
  const { box } = data;
  const { title, detail } = boxTitle(box, graph.workflow);
  const problems = box.step !== null ? (graph.pinned.steps.get(box.step) ?? []) : [];
  const left = box.kind === 'report' ? [...box.left, '+'] : box.left;
  return (
    <div
      className={classes.box}
      data-kind={box.kind}
      data-selected={graph.selected === box.key || undefined}
      data-dimmed={(graph.selected !== null && graph.selected !== box.key) || undefined}
      style={{ borderColor: graph.colours[box.colour] }}
      role="group"
      aria-label={box.kind === 'step' ? `Step ${title}` : title}
    >
      <button
        type="button"
        className={`${classes.header} nodrag nopan`}
        onClick={() => graph.select(box.key)}
      >
        <span className={classes.title}>{title}</span>
        <span className={classes.detail}>{detail}</span>
      </button>
      {problems.map((problem) => (
        <span
          key={problem.message}
          className={classes.boxProblem}
          role="note"
          aria-label={problem.message}
          title={problem.message}
        >
          !
        </span>
      ))}
      {left.map((port, row) => (
        <PortRow key={`in ${port}`} box={box} port={port} row={row} side="left" />
      ))}
      {box.right.map((port, row) => (
        <PortRow key={`out ${port}`} box={box} port={port} row={row} side="right" />
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

/**
 * The whole graph in view whenever its layout changes, so a box a change
 * adds is never drawn outside the canvas.
 */
function FitOnChange({ layout }: { layout: Layout }) {
  const flow = useReactFlow();
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      void flow.fitView();
    });
    return () => cancelAnimationFrame(frame);
  }, [flow, layout]);
  return null;
}

const NODE_TYPES = { box: BoxView, slot: SlotView, band: BandView };
const EDGE_TYPES = { wire: WireView };

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
}) {
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

  const context: GraphContext = {
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
    drawn: new Set(layout.wires.map((wire) => wire.target)),
  };
  return (
    <Context value={context}>
      <ReactFlowProvider>
        <div className={classes.canvas}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            edgeTypes={EDGE_TYPES}
            nodesDraggable={false}
            nodesConnectable={!readOnly}
            elementsSelectable={false}
            fitView
            minZoom={0.2}
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
          >
            <FitOnChange layout={layout} />
          </ReactFlow>
        </div>
      </ReactFlowProvider>
    </Context>
  );
}
