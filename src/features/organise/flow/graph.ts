/**
 * Where boxes and wires stand, for the workflow editor and the task's
 * formula and scoring cards alike. The rules:
 *
 * - Columns. Inputs stand in the first column and outputs in the last.
 *   Every other box stands one column right of the furthest box that feeds
 *   it, or at `least`. Empty columns close up.
 * - Slots. A wire that skips columns runs through a slot in each column it
 *   crosses, shared by every wire from the same port, so no wire passes
 *   behind a box. The first slot carries the wire's label.
 * - Order. Each column starts in `order`, then is swept a few times each
 *   way by where its wires come from and go, keeping the order with the
 *   fewest crossings.
 * - Colour. Inputs, files and outputs take their palette's colour, and the
 *   columns between take the middle colours in turn and back. A wire and
 *   its slots take the colour of the box they leave.
 * - Sizes. Every part of a box has a fixed height, so where a wire meets a
 *   box is worked out here, never measured: a closed box on its title
 *   line, an open one at its port's row.
 */

/** A port's row, and the space below and between boxes. */
export const GEOMETRY = {
  row: 28,
  /** Below a box's last row. */
  foot: 10,
  /** Between two things in a column. */
  space: 24,
} as const;

/** Room above every box for a stacked box's ears. */
export const STACK = 12;
export const BORDER = 2;
/** A box's head: its name, what it is and what it does. */
export const HEAD = 84;
/** A line under the head, such as what is wrong. */
export const LINE = 22;
/** How far down the face a closed box's pins stand: its title line. */
export const PIN = 15;
/** A compact box's height under its ears. */
export const COMPACT = 40;
export const RESULT_ROW = 28;

/** How wide closed boxes are and how far apart their columns stand. */
export type Shape = { width: number; gap: number; compact?: boolean };

export const SMALL: Shape = { width: 150, gap: 56, compact: true };

export type Palette = {
  input: string;
  file?: string;
  middle: readonly string[];
  output: string;
};

/** A workflow's colours, the mark's gradient: lilac in, gold out, files apart in blue. */
export const WORKFLOW_PALETTE = {
  input: '#c9a4e2',
  file: '#8fb3e0',
  middle: ['#e098c5', '#f78ca8', '#fbab72'],
  output: '#ffc93c',
} as const satisfies Palette;

/** A task's values: green in, blue out. */
export const TASK_PALETTE: Palette = {
  input: '#7fd18b',
  middle: ['#5ec8b0', '#4fb8d0'],
  output: '#5b8def',
};

export type GraphPort = {
  name: string;
  side: 'in' | 'out';
  /** How many rows it takes while its box is open. */
  rows?: number;
  // What a row of the scoring card's Result shows.
  label?: string;
  kind?: string;
  when?: string;
  /** How `when` is drawn: stands out while shown always, dimmed while never. */
  shown?: 'always' | 'later' | 'never';
  detail?: string;
  /** What a row holds, drawn as tags under it, such as a group's columns. */
  parts?: string[];
  heading?: boolean;
  pin?: boolean;
};

export type GraphBox = {
  id: string;
  role?: 'input' | 'file' | 'output';
  /** In-ports first, then out-ports: an open box gives each a row in this order. */
  ports: GraphPort[];
  open?: boolean;
  /** The leftmost column it stands in, however little feeds it. */
  least?: number;
  /** Where it starts in its column; by default, its place in the list. */
  order?: (number | string)[];
  /** Its width while open. */
  wide?: number;
  /** With a line under its head. */
  warned?: boolean;
  /** Height under its rows that holds no port. */
  below?: number;
  rowHeight?: number;
  // What the cards draw.
  title?: string;
  kind?: string;
  description?: string;
  warn?: string;
  stacked?: boolean;
};

export type GraphWire = {
  from: string;
  fromPort: string;
  to: string;
  toPort: string;
  label?: string;
};

export type Point = { x: number; y: number };

type PlacedBox = {
  box: GraphBox;
  column: number;
  x: number;
  y: number;
  width: number;
  height: number;
  colour: string;
};

type PlacedSlot = {
  key: string;
  /** The box and port its wires leave. */
  from: string;
  fromPort: string;
  column: number;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string | null;
  colour: string;
};

type PlacedWire<W extends GraphWire = GraphWire> = {
  wire: W;
  points: Point[];
  colour: string;
};

export type Layout<W extends GraphWire = GraphWire> = {
  columns: number;
  boxes: PlacedBox[];
  slots: PlacedSlot[];
  wires: PlacedWire<W>[];
  width: number;
  height: number;
  crossings: number;
};

const SWEEPS = 4;

/** How many rows an open box's ports take. */
function rowsOf(box: GraphBox): number {
  return box.ports.reduce((rows, port) => rows + (port.rows ?? 1), 0);
}

export function boxHeight(box: GraphBox, shape: Shape): number {
  if (shape.compact) return STACK + 2 * BORDER + COMPACT;
  const rows = box.open
    ? rowsOf(box) * (box.rowHeight ?? GEOMETRY.row) + GEOMETRY.foot
    : 0;
  return STACK + 2 * BORDER + rowsTop(box) + rows + (box.below ?? 0);
}

/** How far down its face a box's first row stands: under its head and its line. */
export function rowsTop(box: { warned?: boolean }): number {
  return HEAD + (box.warned ? LINE : 0);
}

/** The row a port starts at, after the rows of the ports before it. */
function rowOf(box: GraphBox, side: GraphPort['side'], name: string): number {
  let rows = 0;
  for (const port of box.ports) {
    if (port.side === side && port.name === name) return rows;
    rows += port.rows ?? 1;
  }
  return 0;
}

/** How far down a box a wire meets it. */
function meetsAt(
  box: GraphBox,
  side: GraphPort['side'],
  port: string,
  shape: Shape,
): number {
  const face = STACK + BORDER;
  if (shape.compact) return face + COMPACT / 2;
  if (!box.open) return face + PIN;
  const row = box.rowHeight ?? GEOMETRY.row;
  return face + rowsTop(box) + rowOf(box, side, port) * row + row / 2;
}

function compare(a: (number | string)[], b: (number | string)[]): number {
  for (let at = 0; at < Math.max(a.length, b.length); at += 1) {
    const x = a[at];
    const y = b[at];
    if (x === y) continue;
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (typeof x === 'number' && typeof y === 'number') return x - y;
    return String(x) < String(y) ? -1 : 1;
  }
  return 0;
}

/** Each box's column, before empty ones close up. A cycle, which a draft can hold, is cut. */
function ranks(boxes: GraphBox[], wires: readonly GraphWire[]): Map<string, number> {
  const byId = new Map(boxes.map((box) => [box.id, box]));
  const rank = new Map<string, number>();
  const visiting = new Set<string>();
  const rankOf = (id: string): number => {
    const have = rank.get(id);
    if (have !== undefined) return have;
    const box = byId.get(id);
    if (box?.role === 'input') {
      rank.set(id, 0);
      return 0;
    }
    if (visiting.has(id)) return 1;
    visiting.add(id);
    const found = Math.max(
      box?.least ?? 1,
      ...wires.filter((wire) => wire.to === id).map((wire) => 1 + rankOf(wire.from)),
    );
    visiting.delete(id);
    rank.set(id, found);
    return found;
  };
  const last = Math.max(
    0,
    ...boxes.filter((box) => box.role !== 'output').map((box) => rankOf(box.id)),
  );
  for (const box of boxes) if (box.role === 'output') rank.set(box.id, last + 1);
  return rank;
}

type Item = { key: string; column: number; rows: number; order: (number | string)[] };
type End = { item: string; row: number };

export function layoutGraph<W extends GraphWire>(
  boxes: GraphBox[],
  wires: W[],
  {
    shape,
    palette,
    left = 0,
  }: {
    shape: Shape;
    palette: Palette;
    /** Room left of the first column. */
    left?: number;
  },
): Layout<W> {
  const byId = new Map(boxes.map((box) => [box.id, box]));
  const joined = wires.filter((wire) => byId.has(wire.from) && byId.has(wire.to));
  const rank = ranks(boxes, joined);
  const used = [...new Set(rank.values())].sort((a, b) => a - b);
  const dense = new Map(used.map((value, at) => [value, at]));
  const columnOf = (id: string) => dense.get(rank.get(id) ?? 0) ?? 0;
  const columns = used.length;

  const middles = [
    ...new Set(
      boxes.filter((box) => box.role === undefined).map((box) => columnOf(box.id)),
    ),
  ].sort((a, b) => a - b);
  const bounce = [...palette.middle, ...palette.middle.slice(1, -1).reverse()];
  const colourOf = (box: GraphBox) =>
    box.role === 'input'
      ? palette.input
      : box.role === 'file'
        ? (palette.file ?? palette.input)
        : box.role === 'output'
          ? palette.output
          : (bounce[middles.indexOf(columnOf(box.id)) % bounce.length] ??
            palette.input);

  const forward = joined.filter((wire) => columnOf(wire.to) > columnOf(wire.from));
  const orderOf = (box: GraphBox) => box.order ?? [boxes.indexOf(box)];
  const outIndex = (box: GraphBox, port: string) =>
    box.ports.filter((found) => found.side === 'out').findIndex((p) => p.name === port);

  const items = new Map<string, Item>();
  for (const box of boxes)
    items.set(box.id, {
      key: box.id,
      column: columnOf(box.id),
      rows: box.open ? Math.max(rowsOf(box), 1) : 1,
      order: orderOf(box),
    });
  const slots = new Map<
    string,
    Item & { from: string; fromPort: string; label: string | null }
  >();
  const chains = forward.map((wire) => {
    const from = columnOf(wire.from);
    const source = byId.get(wire.from);
    const chain: string[] = [];
    for (let at = from + 1; at < columnOf(wire.to); at += 1) {
      const key = `slot:${JSON.stringify([wire.from, wire.fromPort, at])}`;
      if (!slots.has(key) && source !== undefined)
        slots.set(key, {
          key,
          column: at,
          rows: 1,
          order: [...orderOf(source), 3, outIndex(source, wire.fromPort)],
          from: wire.from,
          fromPort: wire.fromPort,
          label: at === from + 1 ? (wire.label ?? null) : null,
        });
      chain.push(key);
    }
    return chain;
  });
  for (const slot of slots.values()) items.set(slot.key, slot);
  const chainOf = new Map(forward.map((wire, at) => [wire, at]));

  const order: string[][] = Array.from({ length: columns }, () => []);
  for (const item of [...items.values()].sort(
    (a, b) => compare(a.order, b.order) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
  ))
    order[item.column]?.push(item.key);

  // The wires' parts between neighbouring columns, each once.
  type Segment = { from: End; to: End; column: number };
  const segments: Segment[] = [];
  const seen = new Set<string>();
  forward.forEach((wire, at) => {
    const source = byId.get(wire.from);
    const target = byId.get(wire.to);
    if (source === undefined || target === undefined) return;
    const ends: End[] = [
      { item: wire.from, row: source.open ? rowOf(source, 'out', wire.fromPort) : 0 },
      ...(chains[at] ?? []).map((key) => ({ item: key, row: 0 })),
      { item: wire.to, row: target.open ? rowOf(target, 'in', wire.toPort) : 0 },
    ];
    for (let step = 0; step + 1 < ends.length; step += 1) {
      const from = ends[step];
      const to = ends[step + 1];
      if (from === undefined || to === undefined) continue;
      const key = `${from.item}#${String(from.row)}>${to.item}#${String(to.row)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      segments.push({ from, to, column: items.get(from.item)?.column ?? 0 });
    }
  });

  const positions = (current: string[][]) => {
    const offset = new Map<string, number>();
    for (const keys of current) {
      let rows = 0;
      for (const key of keys) {
        offset.set(key, rows);
        rows += items.get(key)?.rows ?? 1;
      }
    }
    return (end: End) => (offset.get(end.item) ?? 0) + end.row;
  };
  const crossingsOf = (current: string[][]) => {
    const at = positions(current);
    let total = 0;
    for (let col = 0; col + 1 < columns; col += 1) {
      const between = segments.filter((segment) => segment.column === col);
      for (let one = 0; one < between.length; one += 1)
        for (let two = one + 1; two < between.length; two += 1) {
          const a = between[one];
          const b = between[two];
          if (a === undefined || b === undefined) continue;
          if ((at(a.from) - at(b.from)) * (at(a.to) - at(b.to)) < 0) total += 1;
        }
    }
    return total;
  };
  const mean = (values: number[]) =>
    values.length === 0
      ? null
      : values.reduce((sum, value) => sum + value, 0) / values.length;
  const sweep = (current: string[][], col: number, down: boolean) => {
    const at = positions(current);
    const incoming = (key: string) =>
      mean(
        segments
          .filter((segment) => segment.to.item === key)
          .map((segment) => at(segment.from)),
      );
    const outgoing = (key: string) =>
      mean(
        segments
          .filter((segment) => segment.from.item === key)
          .map((segment) => at(segment.to)),
      );
    const keyed = (current[col] ?? []).map((key, place) => {
      const first = down ? incoming(key) : outgoing(key);
      const second = down ? outgoing(key) : incoming(key);
      return { key, place, first, second, order: items.get(key)?.order ?? [] };
    });
    // Only what has a wire on the side swept from moves; the rest keep their places.
    const movable = keyed
      .filter((entry) => entry.first !== null)
      .sort(
        (a, b) =>
          (a.first ?? 0) - (b.first ?? 0) ||
          (a.second ?? Infinity) - (b.second ?? Infinity) ||
          compare(a.order, b.order) ||
          a.place - b.place,
      );
    let moved = 0;
    const next = keyed.map((entry) =>
      entry.first === null ? entry.key : (movable[moved++]?.key ?? entry.key),
    );
    const copy = current.map((keys) => [...keys]);
    copy[col] = next;
    return copy;
  };
  let best = order;
  let bestCrossings = crossingsOf(order);
  let current = order;
  for (let round = 0; round < SWEEPS; round += 1) {
    for (let col = 1; col < columns; col += 1) current = sweep(current, col, true);
    const down = crossingsOf(current);
    if (down < bestCrossings) [best, bestCrossings] = [current, down];
    for (let col = columns - 2; col >= 0; col -= 1)
      current = sweep(current, col, false);
    const up = crossingsOf(current);
    if (up < bestCrossings) [best, bestCrossings] = [current, up];
  }

  // Each column is as wide as its widest open box.
  const widthOf = (box: GraphBox) =>
    box.open ? (box.wide ?? shape.width) : shape.width;
  const spans: { x: number; width: number }[] = [];
  let right = left;
  for (let col = 0; col < columns; col += 1) {
    const width = Math.max(
      shape.width,
      ...boxes.filter((box) => columnOf(box.id) === col).map(widthOf),
    );
    spans.push({ x: right, width });
    right += width + shape.gap;
  }
  const spanOf = (col: number) => spans[col] ?? { x: 0, width: shape.width };
  const placedAt = new Map<string, { y: number; height: number }>();
  let height = 0;
  for (const keys of best) {
    let y = 0;
    for (const key of keys) {
      const box = byId.get(key);
      const tall = box === undefined ? GEOMETRY.row : boxHeight(box, shape);
      placedAt.set(key, { y, height: tall });
      y += tall + GEOMETRY.space;
    }
    height = Math.max(height, y - GEOMETRY.space);
  }

  const placed = new Map<string, PlacedBox>();
  for (const box of boxes) {
    const column = columnOf(box.id);
    placed.set(box.id, {
      box,
      column,
      x: spanOf(column).x,
      ...(placedAt.get(box.id) ?? { y: 0, height: 0 }),
      width: widthOf(box),
      colour: colourOf(box),
    });
  }
  const colourFrom = (id: string) => placed.get(id)?.colour ?? palette.input;
  const slotList: PlacedSlot[] = [...slots.values()]
    .map((slot) => ({
      key: slot.key,
      from: slot.from,
      fromPort: slot.fromPort,
      column: slot.column,
      x: spanOf(slot.column).x,
      ...(placedAt.get(slot.key) ?? { y: 0, height: GEOMETRY.row }),
      width: spanOf(slot.column).width,
      label: slot.label,
      colour: colourFrom(slot.from),
    }))
    .sort((a, b) => a.column - b.column || a.y - b.y);

  const placedWires = joined.map((wire): PlacedWire<W> => {
    const from = placed.get(wire.from);
    const to = placed.get(wire.to);
    const colour = colourFrom(wire.from);
    if (from === undefined || to === undefined) return { wire, points: [], colour };
    const y1 = from.y + meetsAt(from.box, 'out', wire.fromPort, shape);
    const y2 = to.y + meetsAt(to.box, 'in', wire.toPort, shape);
    const x1 = from.x + from.width;
    const at = chainOf.get(wire);
    if (at === undefined) {
      // Backwards, which only a cycle makes: round under both boxes.
      const drop = Math.max(from.y + from.height, to.y + to.height) + 16;
      const points = [
        { x: x1, y: y1 },
        { x: x1 + 24, y: drop },
        { x: to.x - 24, y: drop },
        { x: to.x, y: y2 },
      ];
      return { wire, points, colour };
    }
    const points: Point[] = [{ x: x1, y: y1 }];
    // From a box narrower than its column, straight to the column's edge.
    const edge = spanOf(from.column).x + spanOf(from.column).width;
    if (x1 < edge) points.push({ x: edge, y: y1 });
    for (const key of chains[at] ?? []) {
      const slot = placedAt.get(key);
      const span = spanOf(items.get(key)?.column ?? 0);
      if (slot === undefined) continue;
      const y = slot.y + GEOMETRY.row / 2;
      points.push({ x: span.x, y }, { x: span.x + span.width, y });
    }
    points.push({ x: to.x, y: y2 });
    return { wire, points, colour };
  });

  return {
    columns,
    boxes: [...placed.values()].sort((a, b) => a.column - b.column || a.y - b.y),
    slots: slotList,
    wires: placedWires,
    width: Math.max(0, right - shape.gap),
    height,
    crossings: bestCrossings,
  };
}

/**
 * The path a wire is drawn along: straight through each slot, and between
 * neighbouring columns a curve that leaves and arrives level, which stays
 * within the gap between them.
 */
export function wirePath(points: Point[]): string {
  const [first, ...rest] = points;
  if (first === undefined) return '';
  let path = `M ${String(first.x)} ${String(first.y)}`;
  let previous = first;
  for (const point of rest) {
    if (point.y === previous.y) {
      path += ` L ${String(point.x)} ${String(point.y)}`;
    } else {
      const middle = (previous.x + point.x) / 2;
      path += ` C ${String(middle)} ${String(previous.y)} ${String(middle)} ${String(point.y)} ${String(point.x)} ${String(point.y)}`;
    }
    previous = point;
  }
  return path;
}
