import { useEffect, useRef, useState, type ReactNode } from 'react';
import flow from '../workflows/workflows.module.css';
import {
  HEAD,
  LINE,
  PIN,
  STACK,
  layoutGraph,
  wirePath,
  type GraphBox,
  type GraphWire,
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
}: {
  boxes: GraphBox[];
  wires: GraphWire[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  shape: Shape;
  palette: Palette;
  /** What an open box holds, such as a field to type in, or null for nothing. */
  inside: (box: GraphBox) => ReactNode;
  /** The least height it takes, so a small graph's frame does not jump. */
  floor?: number;
}) {
  // How tall each box's inside was drawn, so the layout leaves it room.
  const [insides, setInsides] = useState(() => new Map<string, number>());
  const measured = (id: string, height: number) =>
    setInsides((known) =>
      known.get(id) === height ? known : new Map(known).set(id, height),
    );
  const layout = layoutGraph(boxes, wires, selected, { shape, palette, insides });
  const byId = new Map(layout.placed.map((place) => [place.box.id, place]));

  return (
    <div className={flow.frame}>
      <div
        className={classes.stage}
        style={{ width: layout.width, height: Math.max(layout.height, floor) }}
        onClick={() => onSelect(null)}
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
              <path
                key={`${wire.from}.${wire.fromPort}-${wire.to}.${wire.toPort}`}
                d={wirePath(layout, wire, from, to, selected)}
                fill="none"
                stroke={from.colour}
                strokeWidth={marked ? 3 : 2}
                opacity={selected !== null && !marked ? 0.2 : 1}
              />
            );
          })}
        </svg>
        {layout.placed.map((place) => {
          const { box, colour } = place;
          const open = box.id === selected;
          const ins = box.ports.filter((port) => port.side === 'in');
          const outs = box.ports.filter((port) => port.side === 'out');
          const held = open ? inside(box) : null;
          const choose = () => onSelect(box.id);
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
                role="button"
                tabIndex={0}
                className={`${flow.box} ${classes.face}`}
                data-selected={open || undefined}
                style={{
                  borderColor: colour,
                  marginTop: STACK,
                  height: `calc(100% - ${String(STACK)}px)`,
                }}
                onClick={choose}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  choose();
                }}
              >
                <div
                  className={`${flow.header} ${classes.head}`}
                  style={{ height: HEAD }}
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
                    style={{ background: colour, top: PIN }}
                  />
                )}
                {!open && outs.length > 0 && (
                  <span
                    className={classes.pin}
                    data-side="out"
                    style={{ background: colour, top: PIN }}
                  />
                )}
                {open && (
                  <div className={classes.ports}>
                    {ins.map((port) => (
                      <PortRow
                        key={`in:${port.name}`}
                        name={port.name}
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
  name,
  side,
  colour,
  first = false,
}: {
  name: string;
  side: 'in' | 'out';
  colour: string;
  first?: boolean;
}) {
  const dot = <span className={classes.dot} style={{ background: colour }} />;
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
