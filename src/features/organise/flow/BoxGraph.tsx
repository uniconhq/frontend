import { useEffect, useRef, useState, type ReactNode } from 'react';
import flow from '../workflows/workflows.module.css';
import {
  COMPACT,
  HEAD,
  LINE,
  PIN,
  STACK,
  layoutGraph,
  wirePath,
  type GraphBox,
  type GraphWire,
  type GraphPort,
  type Palette,
  type Shape,
} from './graph';
import classes from './box-graph.module.css';

/**
 * Boxes and wires in the workflow editor's frame, drawn as its graph draws
 * them, in the colours of the kind of graph it is. The layout places every
 * box. Clicking a box opens it: it shows its ports and holds what `inside`
 * gives it above them, growing to fit; clicking outside every box closes it.
 */
export function BoxGraph({
  boxes,
  wires,
  selected,
  onSelect,
  shape,
  palette,
  inside,
  floor = 220,
  labels = false,
  expand = true,
}: {
  boxes: GraphBox[];
  wires: GraphWire[];
  selected: string | null;
  onSelect?: (id: string | null) => void;
  shape: Shape;
  palette: Palette;
  /** What an open box holds, such as a field to type in, or null for nothing. */
  inside: (box: GraphBox) => ReactNode;
  /** The least height it takes, so a small graph's frame does not jump. */
  floor?: number;
  labels?: boolean;
  expand?: boolean;
}) {
  // How tall each box's inside was drawn, so the layout leaves it room.
  const [insides, setInsides] = useState(() => new Map<string, number>());
  const measured = (id: string, height: number) =>
    setInsides((known) =>
      known.get(id) === height ? known : new Map(known).set(id, height),
    );
  const expanded = expand ? selected : null;
  const layout = layoutGraph(boxes, wires, expanded, { shape, palette, insides });
  const byId = new Map(layout.placed.map((place) => [place.box.id, place]));

  return (
    <div className={flow.frame}>
      <div
        className={classes.stage}
        style={{ width: layout.width, height: Math.max(layout.height, floor) }}
        onClick={() => onSelect?.(null)}
      >
        <svg
          className={classes.wires}
          width={layout.width}
          height={layout.height}
          aria-hidden
        >
          {wires.map((wire) => {
            const from = byId.get(wire.from);
            const to = byId.get(wire.to);
            if (from === undefined || to === undefined) return null;
            const marked =
              selected !== null && (wire.from === selected || wire.to === selected);
            return (
              <g key={`${wire.from}.${wire.fromPort}-${wire.to}.${wire.toPort}`}>
                <path
                  d={wirePath(layout, wire, from, to, expanded)}
                  fill="none"
                  stroke={from.colour}
                  strokeWidth={marked ? 3 : 2}
                  opacity={selected !== null && !marked ? 0.2 : 1}
                />
                {wire.label !== undefined && (
                  <text
                    x={(from.x + from.width + to.x) / 2}
                    y={from.y + STACK + (shape.compact ? COMPACT / 2 : PIN) - 4}
                    textAnchor="middle"
                    fill={from.colour}
                    fontSize={10}
                  >
                    {wire.label}
                  </text>
                )}
                {wire.label === undefined && labels && to.column > from.column + 1 && (
                  <text
                    x={from.x + from.width + 8}
                    y={from.y + PIN - 4}
                    fill={from.colour}
                  >
                    {wire.fromPort}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {layout.placed.map((place) => {
          const { box, colour } = place;
          const open = box.alwaysOpen === true || (expand && box.id === selected);
          const clickable = onSelect !== undefined && !box.alwaysOpen;
          const ins = box.ports.filter((port) => port.side === 'in');
          const outs = box.ports.filter((port) => port.side === 'out');
          const held = open ? inside(box) : null;
          const choose = () => onSelect?.(box.id);
          return (
            <div
              key={box.id}
              className={classes.placed}
              style={{
                left: place.x,
                top: place.y,
                width: place.width,
                height: place.height,
              }}
              onClick={(event) => event.stopPropagation()}
            >
              {box.stacked && (
                <>
                  <span
                    className={classes.ear}
                    style={{ top: 0, left: 16, right: 16, borderColor: colour }}
                  />
                  <span
                    className={classes.ear}
                    style={{ top: 6, left: 8, right: 8, borderColor: colour }}
                  />
                </>
              )}
              <div
                role={clickable ? 'button' : box.alwaysOpen ? 'group' : 'img'}
                aria-label={`${box.title} ${box.kind}`}
                tabIndex={clickable ? 0 : undefined}
                className={`${flow.box} ${classes.face}`}
                data-selected={box.id === selected || undefined}
                data-read-only={!clickable || undefined}
                style={{
                  borderColor: colour,
                  marginTop: STACK,
                  height: `calc(100% - ${String(STACK)}px)`,
                }}
                onClick={clickable ? choose : undefined}
                onKeyDown={(event) => {
                  if (!clickable || (event.key !== 'Enter' && event.key !== ' '))
                    return;
                  event.preventDefault();
                  choose();
                }}
              >
                <div
                  className={`${flow.header} ${classes.head}`}
                  data-compact={shape.compact || undefined}
                  style={{ height: shape.compact ? COMPACT : HEAD }}
                >
                  <span className={flow.titleLine}>
                    <span className={flow.title}>{box.title}</span>
                    <span className={flow.runs}>{box.kind}</span>
                  </span>
                  {box.description !== undefined && (
                    <p className={flow.description} title={box.description}>
                      {box.description}
                    </p>
                  )}
                </div>
                {box.warn !== undefined && (
                  <p
                    className={`${flow.headProblem} ${classes.line}`}
                    style={{ height: LINE }}
                  >
                    {box.warn}
                  </p>
                )}
                {open && held !== null && held !== undefined && (
                  <Inside id={box.id} onHeight={measured}>
                    {held}
                  </Inside>
                )}
                {!open && ins.length > 0 && (
                  <span
                    className={classes.pin}
                    data-side="in"
                    style={{
                      background: colour,
                      top: shape.compact ? COMPACT / 2 : PIN,
                    }}
                  />
                )}
                {!open && outs.length > 0 && (
                  <span
                    className={classes.pin}
                    data-side="out"
                    style={{
                      background: colour,
                      top: shape.compact ? COMPACT / 2 : PIN,
                    }}
                  />
                )}
                {open && (
                  <div
                    className={classes.ports}
                    role={box.alwaysOpen ? 'list' : undefined}
                    aria-label={box.alwaysOpen ? box.title : undefined}
                  >
                    {ins.map((port) => (
                      <PortRow
                        key={`in:${port.name}`}
                        name={port.name}
                        port={box.alwaysOpen ? port : undefined}
                        rowHeight={box.rowHeight}
                        side="in"
                        colour={colour}
                      />
                    ))}
                    {outs.map((port, index) => (
                      <PortRow
                        key={`out:${port.name}`}
                        name={port.name}
                        side="out"
                        colour={colour}
                        first={index === 0 && ins.length > 0}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * What an open box holds. Its clicks and keys stay its own, so typing a
 * space or clicking to place the cursor never works the box as a button.
 */
function Inside({
  id,
  onHeight,
  children,
}: {
  id: string;
  onHeight: (id: string, height: number) => void;
  children: ReactNode;
}) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef(onHeight);
  useEffect(() => {
    latest.current = onHeight;
  });
  useEffect(() => {
    const element = host.current;
    if (element === null) return;
    const observer = new ResizeObserver(() => latest.current(id, element.offsetHeight));
    observer.observe(element);
    return () => observer.disconnect();
  }, [id]);
  return (
    <div
      ref={host}
      className={classes.inside}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {children}
    </div>
  );
}

function PortRow({
  port,
  rowHeight,
  name,
  side,
  colour,
  first = false,
}: {
  name: string;
  port?: GraphPort;
  rowHeight?: number;
  side: 'in' | 'out';
  colour: string;
  first?: boolean;
}) {
  const dot = <span className={classes.dot} style={{ background: colour }} />;
  if (port !== undefined && rowHeight !== undefined)
    return (
      <div
        role="listitem"
        className={classes.resultRow}
        style={{ height: rowHeight * (port.rows ?? 1) }}
        data-heading={port.heading || undefined}
      >
        {port.pin !== false && !port.heading && (
          <span
            className={classes.resultPin}
            style={{ background: colour, top: rowHeight / 2 }}
          />
        )}
        {(port.label ?? port.name) !== '' && (
          <div className={classes.resultMain}>
            <span className={classes.resultName}>{port.label ?? port.name}</span>
            <span className={classes.resultKind}>{port.kind}</span>
            <span className={classes.resultWhen} data-shown={port.shown}>
              {port.when}
            </span>
          </div>
        )}
        {port.parts !== undefined && (
          <div
            className={classes.resultParts}
            tabIndex={0}
            onKeyDown={(event) => event.stopPropagation()}
          >
            {port.parts.map((part) => (
              <span key={part} className={classes.resultTag} title={part}>
                {part}
              </span>
            ))}
          </div>
        )}
        {port.detail !== undefined && (
          <div
            className={classes.resultDetail}
            tabIndex={0}
            onKeyDown={(event) => event.stopPropagation()}
          >
            {port.detail}
          </div>
        )}
      </div>
    );
  return (
    <div
      className={classes.portRow}
      data-side={side}
      data-out-first={first || undefined}
    >
      {side === 'in' && dot}
      <span className={flow.port}>{name}</span>
      {side === 'out' && dot}
    </div>
  );
}
