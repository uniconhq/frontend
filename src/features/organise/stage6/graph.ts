import { saveFile } from '@/lib/save-file';
import { GEOMETRY, wirePath as curve } from '../workflows/layout';

/**
 * Columns, as the workflow graph lays them out, with three places: the
 * inputs always stand in the first column, the outputs always in the last,
 * and every other box in between, one column right of the furthest box that
 * feeds it. Every part of a box has a fixed height, so a closed box's wire
 * meets it at the same height on every box, and boxes side by side join
 * with a straight line. Port rows stay out of the height until the box is
 * chosen, or until a zoomed-in picture shows its wiring.
 */

/** The ears a stacked box shows above its face; every box keeps the room. */
export const STACK = 12;
/** A box's head: its name and kind, what it is with its ref, what it does. */
export const HEAD = GEOMETRY.header;
/** A compact box's one line: its name. */
export const COMPACT = 36;
/** A line under the head: a warning, or what goes in and out. */
export const LINE = 22;
/** What a workflow box holds, at its foot. */
export const FOOT = 26;
/** A box's border, inside the height its parts add up to. */
const BORDER = 2;

/** How wide boxes are and how far apart their columns stand. */
export type Shape = { width: number; gap: number; compact: boolean };

export const FULL: Shape = { width: 260, gap: 88, compact: false };
export const SMALL: Shape = { width: 150, gap: 56, compact: true };

/**
 * The colours of one kind of graph: its inputs, its outputs, and the
 * columns between them, which take the middle colours in turn and back.
 */
export type Palette = { input: string; middle: string[]; output: string };

export const PALETTES = {
  /** A run workflow: the mark's gradient, lilac in, gold out. */
  workflow: {
    input: '#c9a4e2',
    middle: ['#e098c5', '#f78ca8', '#fbab72'],
    output: '#ffc93c',
  },
  /** A task's values: green in, blue out. */
  task: {
    input: '#7fd18b',
    middle: ['#5ec8b0', '#4fb8d0'],
    output: '#5b8def',
  },
  /** A leaderboard's columns: gold in, coral out. */
  leaderboard: {
    input: '#ffd166',
    middle: ['#fbab72', '#f79a6b'],
    output: '#ef6f6c',
  },
} satisfies Record<string, Palette>;

export type GraphPort = { name: string; side: 'in' | 'out'; said?: string };

export type GraphBox = {
  id: string;
  title: string;
  /** Where it stands: the inputs first, the outputs last, steps between. */
  role?: 'input' | 'output';
  /** The pill beside the title: what kind of box it is. */
  kind: string;
  /** What it is in words, beside its ref: an input's type, an operation's job. */
  what?: string;
  /** The program file an exec step runs, offered for download. */
  file?: string;
  ref?: string;
  description?: string;
  warn?: string;
  /** What it needs and what it gives, while its ports are hidden. */
  io?: string;
  /** What a workflow box holds, e.g. "4 steps inside". */
  foot?: string;
  stacked?: boolean;
  openable?: boolean;
  /** The width it opens to, for what it holds inside while open. */
  wide?: number;
  /** The leftmost column it stands in, however little feeds it. */
  least?: number;
  ports: GraphPort[];
};

export type GraphWire = {
  from: string;
  fromPort: string;
  to: string;
  toPort: string;
};

/**
 * Where a wire that skips columns crosses one: under that column's boxes, so
 * it never runs behind a box. Wires from one port share their slots, and
 * the first slot says what the wire carries.
 */
export type Slot = {
  key: string;
  x: number;
  y: number;
  label: string | null;
  colour: string;
};

export type PlacedBox = {
  box: GraphBox;
  x: number;
  y: number;
  width: number;
  height: number;
  /** The height of what it holds inside, above its ports, while open. */
  inside: number;
  column: number;
  colour: string;
};

export type Layout = {
  shape: Shape;
  placed: PlacedBox[];
  slots: Slot[];
  /** The height a source's wire crosses each column at, by `box.port`. */
  through: Map<string, Map<number, number>>;
  /** Where each column starts, and how wide it is: as wide as its widest open box. */
  columns: Map<number, { x: number; width: number }>;
  width: number;
  height: number;
};

function aboveRows(box: GraphBox, open: boolean, shape: Shape, inside: number): number {
  if (shape.compact) return COMPACT;
  return (
    HEAD +
    (box.warn !== undefined ? LINE : 0) +
    (!open && box.io !== undefined ? LINE : 0) +
    inside
  );
}

function boxHeight(box: GraphBox, open: boolean, shape: Shape, inside: number): number {
  const rows = open ? box.ports.length * GEOMETRY.row + GEOMETRY.foot : 0;
  return (
    STACK +
    BORDER * 2 +
    aboveRows(box, open, shape, inside) +
    rows +
    (box.foot !== undefined ? FOOT : 0)
  );
}

/** Where a closed box's wire meets it: on its title line. */
function pinOf(shape: Shape): number {
  return STACK + BORDER + (shape.compact ? COMPACT / 2 : 15);
}

function rankOf(
  id: string,
  roles: Map<string, GraphBox['role']>,
  least: Map<string, number>,
  wires: GraphWire[],
  known: Map<string, number>,
  visiting: Set<string>,
): number {
  const have = known.get(id);
  if (have !== undefined) return have;
  if (roles.get(id) === 'input') {
    known.set(id, 0);
    return 0;
  }
  if (visiting.has(id)) return 1;
  visiting.add(id);
  const incoming = wires.filter((wire) => wire.to === id);
  const rank = Math.max(
    least.get(id) ?? 1,
    ...incoming.map(
      (wire) => 1 + rankOf(wire.from, roles, least, wires, known, visiting),
    ),
  );
  visiting.delete(id);
  known.set(id, rank);
  return rank;
}

function colourAt(palette: Palette, role: GraphBox['role'], column: number): string {
  if (role === 'input') return palette.input;
  if (role === 'output') return palette.output;
  const { middle } = palette;
  const bounce = [...middle, ...middle.slice(1, -1).reverse()];
  return bounce[(column - 1) % bounce.length] ?? palette.input;
}

/** Where each box stands. A cycle, which a draft can hold, is drawn from column 1. */
export function layoutGraph(
  boxes: GraphBox[],
  wires: GraphWire[],
  selected: string | null,
  {
    detail = false,
    shape = FULL,
    palette = PALETTES.workflow,
    labels = true,
    insides = new Map<string, number>(),
  }: {
    detail?: boolean;
    shape?: Shape;
    palette?: Palette;
    labels?: boolean;
    /** How tall what each open box holds inside is, as last drawn. */
    insides?: Map<string, number>;
  } = {},
): Layout {
  const present = new Set(boxes.map((box) => box.id));
  const roles = new Map(boxes.map((box) => [box.id, box.role]));
  const least = new Map(boxes.map((box) => [box.id, box.least ?? 1]));
  const joined = wires.filter((wire) => present.has(wire.from) && present.has(wire.to));
  const rank = new Map<string, number>();
  const visiting = new Set<string>();
  for (const box of boxes) {
    if (box.role !== 'output') rankOf(box.id, roles, least, joined, rank, visiting);
  }
  const last = Math.max(
    1,
    ...boxes.filter((box) => box.role !== 'output').map((box) => rank.get(box.id) ?? 0),
  );
  for (const box of boxes) if (box.role === 'output') rank.set(box.id, last + 1);

  const columns = new Map<number, GraphBox[]>();
  for (const box of boxes) {
    const column = rank.get(box.id) ?? 1;
    const list = columns.get(column) ?? [];
    list.push(box);
    columns.set(column, list);
  }

  const open = (box: GraphBox) => detail || box.id === selected;
  const spans = new Map<number, { x: number; width: number }>();
  let next = 24;
  for (let column = 0; column <= Math.max(0, ...columns.keys()); column += 1) {
    const widths = (columns.get(column) ?? []).map((box) =>
      open(box) ? (box.wide ?? shape.width) : shape.width,
    );
    const columnWidth = Math.max(shape.width, ...widths);
    spans.set(column, { x: next, width: columnWidth });
    next += columnWidth + shape.gap;
  }
  const titles = new Map(boxes.map((box) => [box.id, box.title]));
  const placed: PlacedBox[] = [];
  const colourOf = new Map<string, string>();
  const slots: Slot[] = [];
  const through = new Map<string, Map<number, number>>();
  let width = 48;
  let height = 32;
  for (const column of [...columns.keys()].sort((a, b) => a - b)) {
    const { x, width: columnWidth } = spans.get(column) ?? {
      x: 24,
      width: shape.width,
    };
    let y = 20;
    for (const box of columns.get(column) ?? []) {
      const inside = open(box) ? (insides.get(box.id) ?? 0) : 0;
      const boxHeightPx = boxHeight(box, open(box), shape, inside);
      const colour = colourAt(palette, box.role, column);
      colourOf.set(box.id, colour);
      const boxWidth = open(box) ? (box.wide ?? shape.width) : shape.width;
      placed.push({
        box,
        x,
        y,
        width: boxWidth,
        height: boxHeightPx,
        inside,
        column,
        colour,
      });
      y += boxHeightPx + (shape.compact ? 16 : GEOMETRY.space);
    }
    for (const wire of joined) {
      const from = rank.get(wire.from) ?? 0;
      const to = rank.get(wire.to) ?? 0;
      if (!(from < column && column < to)) continue;
      const key = `${wire.from}.${wire.fromPort}`;
      const crossings = through.get(key) ?? new Map<number, number>();
      if (crossings.has(column)) continue;
      crossings.set(column, y + GEOMETRY.row / 2);
      through.set(key, crossings);
      slots.push({
        key: `${key}@${String(column)}`,
        x,
        y,
        label:
          labels && column === from + 1
            ? roles.get(wire.from) === 'input'
              ? wire.fromPort
              : `${wire.fromPort} from ${titles.get(wire.from) ?? wire.from}`
            : null,
        colour: colourOf.get(wire.from) ?? palette.input,
      });
      y += GEOMETRY.row + GEOMETRY.space / 2;
    }
    width = Math.max(width, x + columnWidth + 24);
    height = Math.max(height, y);
  }
  return { shape, placed, slots, through, columns: spans, width, height };
}

/** How far down a box a port's wire meets it. */
function portTop(
  place: PlacedBox,
  name: string,
  side: 'in' | 'out',
  open: boolean,
  shape: Shape,
): number {
  const { box } = place;
  if (!open) return pinOf(shape);
  const index = box.ports.findIndex((port) => port.name === name && port.side === side);
  if (index < 0) return pinOf(shape);
  return (
    STACK +
    BORDER +
    aboveRows(box, open, shape, place.inside) +
    index * GEOMETRY.row +
    GEOMETRY.row / 2
  );
}

/**
 * A wire as the workflow graph draws it: straight between boxes that stand
 * level, a smooth curve otherwise, and through a slot in each column it
 * skips. One that runs backwards, which only a cycle makes, goes round under
 * both boxes.
 */
export function wirePath(
  layout: Layout,
  wire: GraphWire,
  from: PlacedBox,
  to: PlacedBox,
  selected: string | null,
  detail = false,
): string {
  const { shape } = layout;
  const y1 =
    from.y +
    portTop(from, wire.fromPort, 'out', detail || from.box.id === selected, shape);
  const y2 =
    to.y + portTop(to, wire.toPort, 'in', detail || to.box.id === selected, shape);
  const x1 = from.x + from.width;
  const x2 = to.x;
  if (x2 <= x1) {
    const drop = Math.max(from.y + from.height, to.y + to.height) + 16;
    return curve([
      { x: x1, y: y1 },
      { x: x1 + 24, y: drop },
      { x: x2 - 24, y: drop },
      { x: x2, y: y2 },
    ]);
  }
  const crossings = layout.through.get(`${from.box.id}.${wire.fromPort}`);
  const points = [{ x: x1, y: y1 }];
  for (let column = from.column + 1; column < to.column; column += 1) {
    const y = crossings?.get(column);
    const span = layout.columns.get(column);
    if (y === undefined || span === undefined) continue;
    points.push({ x: span.x, y }, { x: span.x + span.width, y });
  }
  points.push({ x: x2, y: y2 });
  return curve(points);
}

/** Saves a step's program file. The mock has no files, so it saves a stand-in. */
export function saveProgram(name: string, about: string | undefined): void {
  saveFile(name, new Blob([`# ${name}\n# ${about ?? ''}\n`], { type: 'text/plain' }));
}
