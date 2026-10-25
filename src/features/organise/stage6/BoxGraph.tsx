import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import flow from '../workflows/workflows.module.css';
import {
  COMPACT,
  FOOT,
  FULL,
  HEAD,
  LINE,
  PALETTES,
  STACK,
  layoutGraph,
  saveProgram,
  wirePath,
  type GraphBox,
  type GraphWire,
  type Palette,
  type Shape,
} from './graph';
import classes from './stage6.module.css';

/** One end of a wire: a box, and its port when one was aimed at. */
export type WireEnd = { box: string; port: string | null };

/**
 * A wire dragged and dropped. `to` is what it was dropped on, or null for
 * empty space; `lifted` is the input a wire was pulled off, when the drag
 * began at an input's dot.
 */
export type Connect = {
  from: WireEnd;
  to: WireEnd | null;
  lifted?: { box: string; port: string };
};

type Drag = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  colour: string;
  /** A wire picked up, hidden while it is carried. */
  lifted?: { box: string; port: string };
};

/** What is under the pointer: an input's row, else a box. */
function dropAt(x: number, y: number): WireEnd | null {
  const under = document.elementFromPoint(x, y);
  const port = under?.closest<HTMLElement>('[data-drop-port]');
  const box = under?.closest<HTMLElement>('[data-drop-box]');
  const id = port?.dataset.dropBox ?? box?.dataset.dropBox;
  if (id === undefined) return null;
  return { box: id, port: port?.dataset.dropPort ?? null };
}

/**
 * Boxes and wires in the workflow editor's frame, drawn as its graph draws
 * them, in the colours of the kind of graph it is. The layout places every
 * box, so a step is added by clicking it. Clicking a workflow box zooms
 * into it. Any other click shows that box's ports and opens its drawer.
 * Zoomed in, every box shows its ports, which is the wiring of that step.
 * Given `onConnect`, a dot drags out a wire: dropped on an input or a box
 * it connects, and an input's dot pulls its wire off to move or drop it.
 * Given `inside`, an open box holds what it gives, above its ports, and
 * grows to fit it.
 */
export function BoxGraph({
  boxes,
  wires,
  selected,
  onSelect,
  onOpen,
  detail = false,
  shape = FULL,
  palette = PALETTES.workflow,
  labels = true,
  onConnect,
  inside,
  floor = 220,
}: {
  boxes: GraphBox[];
  wires: GraphWire[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  onOpen?: (id: string, origin: { x: number; y: number }) => void;
  /** Zoomed in: port names stay visible, so the wires can be read. */
  detail?: boolean;
  shape?: Shape;
  palette?: Palette;
  /** Whether a wire that skips columns says what it carries. */
  labels?: boolean;
  onConnect?: (connect: Connect) => void;
  /** What an open box holds, such as a field to type in, or null for nothing. */
  inside?: (box: GraphBox) => ReactNode;
  /** The least height it takes, so a small graph's frame does not jump. */
  floor?: number;
}) {
  // How tall each box's inside was drawn, so the layout leaves it room.
  const [insides, setInsides] = useState(() => new Map<string, number>());
  const measured = (id: string, height: number) =>
    setInsides((known) =>
      known.get(id) === height ? known : new Map(known).set(id, height),
    );
  const layout = layoutGraph(boxes, wires, selected, {
    detail,
    shape,
    palette,
    labels,
    insides,
  });
  const pin = shape.compact ? COMPACT / 2 : 15;
  const byId = new Map(layout.placed.map((place) => [place.box.id, place]));
  const stage = useRef<HTMLDivElement>(null);
  const begun = useRef<Omit<Connect, 'to'> | null>(null);
  // A drag ends in a click the page should not take as one.
  const dragged = useRef(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const dragging = drag !== null;

  useEffect(() => {
    if (!dragging || onConnect === undefined) return;
    const move = (event: PointerEvent) => {
      const frame = stage.current?.getBoundingClientRect();
      if (frame === undefined) return;
      setDrag((curr) =>
        curr === null
          ? curr
          : { ...curr, x2: event.clientX - frame.left, y2: event.clientY - frame.top },
      );
      setOver(dropAt(event.clientX, event.clientY)?.box ?? null);
    };
    const up = (event: PointerEvent) => {
      const start = begun.current;
      begun.current = null;
      setDrag(null);
      setOver(null);
      dragged.current = true;
      setTimeout(() => {
        dragged.current = false;
      }, 0);
      if (start === null) return;
      const to = dropAt(event.clientX, event.clientY);
      if (to !== null && to.box === start.from.box) return;
      onConnect({ ...start, to });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [dragging, onConnect]);

  // The line drawn while dragging starts at the dot it comes from, and
  // ends at the pointer.
  const grab = (
    event: ReactPointerEvent<Element>,
    start: Omit<Connect, 'to'>,
    colour: string,
  ) => {
    const frame = stage.current?.getBoundingClientRect();
    if (onConnect === undefined || frame === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    const port = `${start.from.box}.${start.from.port ?? ''}`;
    const source =
      start.lifted === undefined
        ? event.currentTarget
        : (stage.current?.querySelector(`[data-out="${CSS.escape(port)}"]`) ??
          stage.current?.querySelector(`[data-out="${CSS.escape(start.from.box)}"]`) ??
          event.currentTarget);
    const dot = source.getBoundingClientRect();
    const x = dot.left + dot.width / 2 - frame.left;
    const y = dot.top + dot.height / 2 - frame.top;
    begun.current = start;
    setDrag({
      x1: x,
      y1: y,
      x2: event.clientX - frame.left,
      y2: event.clientY - frame.top,
      colour,
      lifted: start.lifted,
    });
  };
  const handle = onConnect === undefined ? undefined : true;

  return (
    <div className={flow.frame}>
      <div
        ref={stage}
        className={classes.stage}
        style={{ width: layout.width, height: Math.max(layout.height, floor) }}
        onClick={() => {
          if (!dragged.current) onSelect(null);
        }}
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
            const carried =
              drag?.lifted?.box === wire.to && drag.lifted.port === wire.toPort;
            const d = wirePath(layout, wire, from, to, selected, detail);
            return (
              <g key={`${wire.from}.${wire.fromPort}-${wire.to}.${wire.toPort}`}>
                <path
                  d={d}
                  fill="none"
                  stroke={from.colour}
                  strokeWidth={marked ? 3 : 2}
                  opacity={carried ? 0 : selected !== null && !marked ? 0.2 : 1}
                />
                {handle && (
                  // A wider, unseen line to catch the pointer: a wire picked
                  // up moves to wherever it is dropped, or goes.
                  <path
                    d={d}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={12}
                    className={classes.wireHandle}
                    onPointerDown={(event) =>
                      grab(
                        event,
                        {
                          from: { box: wire.from, port: wire.fromPort },
                          lifted: { box: wire.to, port: wire.toPort },
                        },
                        from.colour,
                      )
                    }
                  />
                )}
              </g>
            );
          })}
          {drag !== null && (
            <path
              d={`M ${String(drag.x1)} ${String(drag.y1)} C ${String((drag.x1 + drag.x2) / 2)} ${String(drag.y1)}, ${String((drag.x1 + drag.x2) / 2)} ${String(drag.y2)}, ${String(drag.x2)} ${String(drag.y2)}`}
              fill="none"
              stroke={drag.colour}
              strokeWidth={2}
              strokeDasharray="6 4"
            />
          )}
        </svg>
        {layout.slots.map(
          (slot) =>
            slot.label !== null && (
              <span
                key={slot.key}
                className={classes.slotLabel}
                style={{
                  left: slot.x + 6,
                  top: slot.y - 2,
                  color: slot.colour,
                }}
              >
                {slot.label}
              </span>
            ),
        )}
        {layout.placed.map((place) => {
          const { box } = place;
          const { colour } = place;
          const open = detail || box.id === selected;
          const ins = box.ports.filter((port) => port.side === 'in');
          const outs = box.ports.filter((port) => port.side === 'out');
          const origin = {
            x:
              layout.width === 0
                ? 50
                : ((place.x + place.width / 2) / layout.width) * 100,
            y:
              layout.height === 0
                ? 50
                : ((place.y + place.height / 2) / layout.height) * 100,
          };
          const { file } = box;
          const held = open ? inside?.(box) : null;
          const choose = () => {
            if (dragged.current) return;
            if (box.openable && onOpen !== undefined) onOpen(box.id, origin);
            else onSelect(box.id);
          };
          return (
            <div
              key={box.id}
              className={classes.placed}
              data-drop-box={box.id}
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
                data-selected={box.id === selected || undefined}
                data-problem={(shape.compact && box.warn !== undefined) || undefined}
                data-drop={over === box.id || undefined}
                title={shape.compact ? (box.warn ?? box.description) : undefined}
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
                {shape.compact ? (
                  <span className={classes.compactHead} style={{ height: COMPACT }}>
                    <span className={classes.compactTitle}>{box.title}</span>
                    {box.warn !== undefined && (
                      <span className={classes.compactMark} aria-label={box.warn}>
                        !
                      </span>
                    )}
                  </span>
                ) : (
                  <>
                    <div
                      className={`${flow.header} ${classes.head}`}
                      style={{ height: HEAD }}
                    >
                      <span className={flow.titleLine}>
                        <span className={flow.title}>{box.title}</span>
                        <span className={flow.runs}>{box.kind}</span>
                      </span>
                      <span className={flow.primitiveLine}>
                        {box.what !== undefined && (
                          <span className={flow.primitiveTitle}>{box.what}</span>
                        )}
                        {file !== undefined && (
                          <button
                            type="button"
                            className={classes.file}
                            title={`Download ${box.file}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              saveProgram(file, box.description);
                            }}
                          >
                            {box.file} ↓
                          </button>
                        )}
                        {box.ref !== undefined && (
                          <span className={flow.ref}>{box.ref}</span>
                        )}
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
                    {!open && box.io !== undefined && (
                      <p
                        className={`${flow.detail} ${classes.line}`}
                        style={{ height: LINE }}
                      >
                        {box.io}
                      </p>
                    )}
                  </>
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
                    style={{ background: colour, top: pin }}
                  />
                )}
                {!open && outs.length > 0 && (
                  <span
                    className={classes.pin}
                    data-side="out"
                    data-handle={handle}
                    data-out={box.id}
                    style={{ background: colour, top: pin }}
                    onPointerDown={(event) =>
                      grab(
                        event,
                        {
                          from: {
                            box: box.id,
                            port: outs.length === 1 ? (outs[0]?.name ?? null) : null,
                          },
                        },
                        colour,
                      )
                    }
                  />
                )}
                {open && (
                  <div className={classes.ports}>
                    {ins.map((port) => {
                      const wire = wires.find(
                        (each) => each.to === box.id && each.toPort === port.name,
                      );
                      return (
                        <PortRow
                          key={`in:${port.name}`}
                          box={box.id}
                          name={port.name}
                          said={port.said}
                          side="in"
                          colour={colour}
                          handle={handle !== undefined && wire !== undefined}
                          onGrab={(event) => {
                            if (wire === undefined) return;
                            grab(
                              event,
                              {
                                from: { box: wire.from, port: wire.fromPort },
                                lifted: { box: box.id, port: port.name },
                              },
                              byId.get(wire.from)?.colour ?? colour,
                            );
                          }}
                        />
                      );
                    })}
                    {outs.map((port, index) => (
                      <PortRow
                        key={`out:${port.name}`}
                        box={box.id}
                        name={port.name}
                        said={port.said}
                        side="out"
                        colour={colour}
                        first={index === 0 && ins.length > 0}
                        handle={handle !== undefined}
                        out={`${box.id}.${port.name}`}
                        onGrab={(event) =>
                          grab(
                            event,
                            { from: { box: box.id, port: port.name } },
                            colour,
                          )
                        }
                      />
                    ))}
                  </div>
                )}
                {box.foot !== undefined && (
                  <span className={classes.foot} style={{ height: FOOT }}>
                    <span>{box.foot}</span>
                    {box.openable && <span className={classes.openHint}>Open ›</span>}
                  </span>
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
  box,
  name,
  said,
  side,
  colour,
  first = false,
  handle,
  onGrab,
  out,
}: {
  box: string;
  name: string;
  said: string | undefined;
  side: 'in' | 'out';
  colour: string | undefined;
  first?: boolean;
  /** Whether its dot drags a wire. */
  handle: boolean;
  onGrab: (event: ReactPointerEvent<HTMLElement>) => void;
  /** An output's `box.port`, so a wire picked up elsewhere can start here. */
  out?: string;
}) {
  const dot = (
    <span
      className={classes.dot}
      data-out={out}
      data-handle={handle || undefined}
      style={{ background: colour }}
      onPointerDown={handle ? onGrab : undefined}
    />
  );
  return (
    <div
      className={classes.portRow}
      data-side={side}
      data-out-first={first || undefined}
      data-drop-box={side === 'in' ? box : undefined}
      data-drop-port={side === 'in' ? name : undefined}
    >
      {side === 'in' && dot}
      {side === 'out' && said !== undefined && (
        <span className={`${flow.said} ${classes.portSaid}`}>{said}</span>
      )}
      <span className={flow.port}>{name}</span>
      {side === 'in' && said !== undefined && (
        <span className={`${flow.said} ${classes.portSaid}`}>{said}</span>
      )}
      {side === 'out' && dot}
    </div>
  );
}

export function PaletteGroup({
  title,
  tray = false,
  children,
}: {
  title: string;
  tray?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={tray ? `${classes.group} ${classes.tray}` : classes.group}>
      <h2 className={classes.groupTitle}>{title}</h2>
      {children}
    </div>
  );
}

export function PaletteButton({
  name,
  line,
  note,
  disabled = false,
  onAdd,
}: {
  name: string;
  line: string;
  /** Small under the line: a ref, or who can use it. */
  note?: string;
  disabled?: boolean;
  onAdd: () => void;
}) {
  return (
    <button
      type="button"
      className={classes.paletteItem}
      title={line}
      disabled={disabled}
      onClick={onAdd}
    >
      <span className={classes.paletteName}>{name}</span>
      <span className={classes.paletteLine}>{line}</span>
      {note !== undefined && <span className={classes.paletteNote}>{note}</span>}
    </button>
  );
}
