import {
  createContext,
  memo,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
} from 'react';
import {
  BaseEdge,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useKept } from '@/lib/keep-equal';
import flow from '../workflows/workflows.module.css';
import { BOX_PROPERTIES } from '../workflows/layout';
import {
  COMPACT,
  GEOMETRY,
  HEAD,
  PIN,
  layoutGraph,
  wirePath,
  type GraphBox,
  type GraphPort,
  type GraphWire,
  type Palette,
  type Point,
  type Shape,
} from './graph';
import classes from './card-graph.module.css';

type BoxData = {
  box: GraphBox;
  colour: string;
  compact: boolean;
  selected: boolean;
  clickable: boolean;
};
type BoxNode = Node<BoxData, 'box'>;
/** Chooses a box, or none; the same function on every draw, so no box draws again for it. */
const ChooseContext = createContext<(id: string | null) => void>(() => undefined);
type WireEdge = Edge<
  { points: Point[]; colour: string; marked: boolean; dimmed: boolean; label?: string },
  'wire'
>;

/**
 * A card's boxes and wires, drawn by React Flow as the workflow editor's
 * graph is, but only to look at. Clicking a box chooses it; clicking
 * outside every box lets it go.
 */
export function CardGraph({
  boxes,
  wires,
  selected,
  onSelect,
  shape,
  palette,
}: {
  boxes: GraphBox[];
  wires: GraphWire[];
  selected: string | null;
  onSelect?: (id: string | null) => void;
  shape: Shape;
  palette: Palette;
}) {
  const latest = useRef(onSelect);
  useLayoutEffect(() => {
    latest.current = onSelect;
  });
  const choose = useCallback((id: string | null) => latest.current?.(id), []);
  const layout = layoutGraph(
    boxes.map((box) => ({ ...box, warned: box.warn !== undefined })),
    wires,
    { shape, palette },
  );
  const open = new Set(
    layout.boxes.filter(({ box }) => box.open === true).map(({ box }) => box.id),
  );
  // Kept where equal to the last draw, so React Flow measures again only what changed.
  const nodes = useKept(
    layout.boxes.map(({ box, x, y, width, height, colour }): BoxNode => ({
      id: box.id,
      type: 'box',
      position: { x, y },
      width,
      height,
      data: {
        box,
        colour,
        compact: shape.compact === true,
        selected: box.id === selected,
        clickable: onSelect !== undefined && !open.has(box.id),
      },
    })),
  );
  const edges = useKept(
    layout.wires.map(({ wire, points, colour }): WireEdge => {
      const marked =
        selected !== null && (wire.from === selected || wire.to === selected);
      return {
        id: JSON.stringify([wire.from, wire.fromPort, wire.to, wire.toPort]),
        type: 'wire',
        source: wire.from,
        sourceHandle: open.has(wire.from) ? `out:${wire.fromPort}` : 'out',
        target: wire.to,
        targetHandle: open.has(wire.to) ? `in:${wire.toPort}` : 'in',
        data: {
          points,
          colour,
          marked,
          dimmed: selected !== null && !marked,
          label: wire.label,
        },
      };
    }),
  );
  return (
    <ChooseContext value={choose}>
      <div className={flow.frame} style={BOX_PROPERTIES}>
        <div style={{ width: layout.width + 2 * PAD, height: layout.height + 2 * PAD }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            edgeTypes={EDGE_TYPES}
            nodesDraggable={false}
            nodesConnectable={false}
            nodesFocusable={false}
            edgesFocusable={false}
            elementsSelectable={false}
            defaultViewport={VIEWPORT}
            minZoom={1}
            maxZoom={1}
            panOnDrag={false}
            panOnScroll={false}
            zoomOnScroll={false}
            zoomOnPinch={false}
            zoomOnDoubleClick={false}
            preventScrolling={false}
            autoPanOnNodeFocus={false}
            deleteKeyCode={null}
            selectionKeyCode={null}
            multiSelectionKeyCode={null}
            panActivationKeyCode={null}
            zoomActivationKeyCode={null}
            proOptions={PRO_OPTIONS}
            onNodeClick={(_, node: BoxNode) => {
              if (node.data.clickable) choose(node.id);
            }}
            onPaneClick={() => choose(null)}
          />
        </div>
      </div>
    </ChooseContext>
  );
}

const BoxView = memo(function BoxView({ data }: NodeProps<BoxNode>) {
  const { box, colour, compact, selected, clickable } = data;
  const choose = useContext(ChooseContext);
  const open = box.open === true;
  const pinTop = compact ? COMPACT / 2 : PIN;
  return (
    <>
      {box.stacked && (
        <>
          <span
            className={flow.ear}
            style={{ top: 0, left: 16, right: 16, borderColor: colour }}
            aria-hidden
          />
          <span
            className={flow.ear}
            style={{ top: 6, left: 8, right: 8, borderColor: colour }}
            aria-hidden
          />
        </>
      )}
      <div
        role={clickable ? 'button' : open ? 'group' : 'img'}
        aria-label={`${box.title ?? box.id} ${box.kind ?? ''}`}
        tabIndex={clickable ? 0 : undefined}
        className={`${flow.box} ${classes.face}`}
        data-selected={selected || undefined}
        data-clickable={clickable || undefined}
        style={{ borderColor: colour }}
        onKeyDown={(event) => {
          if (!clickable || (event.key !== 'Enter' && event.key !== ' ')) return;
          event.preventDefault();
          choose(box.id);
        }}
      >
        <div
          className={`${flow.header} ${classes.head}`}
          data-compact={compact || undefined}
          style={{ height: compact ? COMPACT : HEAD }}
        >
          <span className={flow.titleLine}>
            <span className={flow.title}>{box.title}</span>
            <span>{box.kind}</span>
          </span>
          {box.description !== undefined && (
            <p className={flow.description} title={box.description}>
              {box.description}
            </p>
          )}
        </div>
        {box.warn !== undefined && (
          <p className={`${flow.line} ${flow.headProblem}`}>{box.warn}</p>
        )}
        {!open && box.ports.some((port) => port.side === 'in') && (
          <Pin side="in" top={pinTop} colour={colour} />
        )}
        {!open && box.ports.some((port) => port.side === 'out') && (
          <Pin side="out" top={pinTop} colour={colour} />
        )}
        {open && (
          <div className={classes.resultRows} role="list" aria-label={box.title}>
            {box.ports.map((port) => (
              <Row
                key={`${port.side}:${port.name}`}
                port={port}
                height={box.rowHeight}
                colour={colour}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
});

function Pin({
  side,
  id = side,
  top,
  colour,
}: {
  side: GraphPort['side'];
  id?: string;
  top: number;
  colour: string;
}) {
  return (
    <Handle
      type={side === 'in' ? 'target' : 'source'}
      position={side === 'in' ? Position.Left : Position.Right}
      id={id}
      className={flow.pin}
      style={{ top, background: colour }}
      isConnectable={false}
    />
  );
}

/** An open box's port, as the scoring card's Result lists its parts. */
function Row({
  port,
  height = GEOMETRY.row,
  colour,
}: {
  port: GraphPort;
  height?: number;
  colour: string;
}) {
  const name = port.label ?? port.name;
  return (
    <div
      role="listitem"
      className={classes.resultRow}
      style={{ height: height * (port.rows ?? 1) }}
      data-heading={port.heading || undefined}
    >
      {port.pin !== false && !port.heading && (
        <Pin
          side={port.side}
          id={`${port.side}:${port.name}`}
          top={height / 2}
          colour={colour}
        />
      )}
      {name !== '' && (
        <div className={classes.resultMain}>
          <span className={classes.resultName}>{name}</span>
          <span className={classes.resultKind}>{port.kind}</span>
          <span className={classes.resultWhen} data-shown={port.shown}>
            {port.when}
          </span>
        </div>
      )}
      {port.parts !== undefined && (
        <div className={classes.resultParts} tabIndex={0} onKeyDown={ownKeys}>
          {port.parts.map((part) => (
            <span key={part} className={classes.resultTag} title={part}>
              {part}
            </span>
          ))}
        </div>
      )}
      {port.detail !== undefined && (
        <div className={classes.resultDetail} tabIndex={0} onKeyDown={ownKeys}>
          {port.detail}
        </div>
      )}
    </div>
  );
}

/** A scrolling part keeps Space: the workflow graph on the same page takes it to pan. */
function ownKeys(event: KeyboardEvent) {
  event.stopPropagation();
}

const WireView = memo(function WireView({ data }: EdgeProps<WireEdge>) {
  if (data === undefined) return null;
  const [first] = data.points;
  const last = data.points.at(-1);
  return (
    <>
      <BaseEdge
        path={wirePath(data.points)}
        style={{
          stroke: data.colour,
          strokeWidth: data.marked ? 3 : 2,
          opacity: data.dimmed ? 0.2 : 1,
        }}
      />
      {data.label !== undefined && first !== undefined && last !== undefined && (
        <text
          x={(first.x + last.x) / 2}
          y={first.y - 6}
          textAnchor="middle"
          fill={data.colour}
          fontSize={10}
        >
          {data.label}
        </text>
      )}
    </>
  );
});

const NODE_TYPES = { box: BoxView };
const EDGE_TYPES = { wire: WireView };
/** Space around the graph inside its frame, room for the pins. */
const PAD = 20;
const VIEWPORT = { x: PAD, y: PAD, zoom: 1 };
const PRO_OPTIONS = { hideAttribution: true };
