import { refsOf, wireRefs, type Ref, type Workflow } from './model';
import { declared, type PrimitiveInfo } from './primitives';
import { refWords } from './words';

/**
 * Where everything of a workflow's graph stands, worked out from its
 * `workflow.yaml` alone (PROPOSAL.md section 12, #377). Nothing of it is
 * stored, so one file always draws one picture. The rules:
 *
 * - Columns. Each input is a box of its own in the first column: the task
 *   gives it. Each file or folder of the workflow a step reads is a box of
 *   its own in the next: the workflow gives it, the same on every run. A
 *   step stands one column right of the furthest step it reads, the first
 *   after those. The outputs stand in the last column.
 * - Slots. A wire that skips columns runs through a slot of its own in each
 *   column it crosses, labelled in words with its source where it starts
 *   ("time_ms from run"), and wires
 *   from one port share their slots. Every wire joins neighbouring columns
 *   only, through the gap between them, so none passes behind a box.
 * - Order. Each column's boxes and slots are sorted by where their wires come
 *   from and then by where they go, a few sweeps each way, keeping the order
 *   with the fewest crossings; ties keep the order of `steps:`.
 * - Colour. The inputs lilac, the workflow's files blue, the outputs gold,
 *   and the steps' columns the colours between, in turn and back
 *   (`PALETTE`); a wire takes the colour of the box it leaves.
 * - Open and closed. A closed box is its head and a line or two, with one
 *   pin a side on its title line, where every wire meets it. An open box
 *   adds a row for every port across its whole width, a step's inputs
 *   first and its outputs under them, and each wire meets its port's row.
 *   The outputs always stand open, so each is written out on its row.
 *   Every part is a fixed height (`BOX`), so where a wire meets a box is
 *   worked out here, never measured.
 *
 * Box keys, which the page and its tests find boxes by: `step:<index>` for
 * a step, by its place in `steps:`; `input:<name>` for an input;
 * `file:<path>` for a file of the workflow; `outputs`.
 */

/** The rows of a box, which the scoring flow's boxes share. */
export const GEOMETRY = {
  /** A box's head: its name, what it is, and what it does. */
  header: 84,
  /** One port's row. */
  row: 28,
  /** Below a box's last row. */
  foot: 10,
  /** Between two things in a column. */
  space: 24,
} as const;

/** The parts of a box, top to bottom, and how wide it is. */
export const BOX = {
  /** A closed box's width. */
  closed: 260,
  /** An open box's width, room for each port's row. */
  open: 320,
  /** The space between two columns, which the wires cross. */
  gap: 88,
  /** Room above every box for a workflow box's ears. */
  stack: 12,
  /** The box's border. */
  border: 2,
  /** Its head: its name and kind, what it is with its ref, what it does. */
  head: GEOMETRY.header,
  /** A line under the head: what is wrong, or what goes in and out. */
  line: 22,
  /** A workflow box's foot, which opens it. */
  foot: 26,
  /** How far down the face a closed box's pins stand: its title line. */
  pin: 15,
  /** Room left of the first column for a step's tab of the inputs it reads, while they are hidden. */
  tab: 76,
} as const;

/** `BOX` and the row height as the stylesheet reads them, in pixels. */
export const BOX_PROPERTIES = Object.fromEntries(
  Object.entries({ ...BOX, row: GEOMETRY.row }).map(([part, size]) => [
    `--box-${part}`,
    `${String(size)}px`,
  ]),
);

/**
 * The colours of a workflow's graph, the mark's gradient: lilac in, gold
 * out, and the columns between taking the middle colours in turn and back.
 * A file of the workflow stands apart from both, as neither the task nor a
 * step gives it.
 */
export const PALETTE = {
  input: '#c9a4e2',
  file: '#8fb3e0',
  middle: ['#e098c5', '#f78ca8', '#fbab72'],
  output: '#ffc93c',
} as const;

const SWEEPS = 4;
const BOUNCE = [...PALETTE.middle, ...PALETTE.middle.slice(1, -1).reverse()];

type BoxKind = 'step' | 'input' | 'file' | 'outputs';

export type Box = {
  key: string;
  kind: BoxKind;
  column: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** For a step box, the step's place in `steps:`. */
  step: number | null;
  /** For an input or a file, the steps that read it, in the order of `steps:`. */
  readers: string[];
  /** Ports down the left: a step's inputs, the outputs' entries. */
  left: string[];
  /** Ports down the right: a step's outputs, an input or a file itself. */
  right: string[];
  colour: string;
  /** Drawn with a row for each port. */
  open: boolean;
  /** A run workflow's step, drawn as a stack with a foot that opens it. */
  stacked: boolean;
  /** With a line under its head saying what is wrong, or that a newer version is out. */
  warned: boolean;
  /** With a line saying what it needs and gives, while it is closed. */
  needs: boolean;
};

type Slot = {
  key: string;
  column: number;
  x: number;
  y: number;
  width: number;
  height: number;
  source: string;
  /** The source's name, on the slot a wire enters first. */
  label: string | null;
  colour: string;
};

export type Point = { x: number; y: number };

type Wire = {
  key: string;
  /** `inputs:<id>`, `workflow:<path>` or `steps:<index>.<output>`. */
  source: string;
  /** `port:<index>.<port>` or `outputs:<name>`. */
  target: string;
  from: { box: string; port: string };
  to: { box: string; port: string };
  /** From the source port to the target port, through each slot. */
  points: Point[];
  colour: string;
};

export type Layout = {
  columns: number;
  boxes: Box[];
  /**
   * The inputs and files the steps read while they are hidden: each closed
   * and placed nowhere, for a step's tab to pop out.
   */
  hidden: Box[];
  slots: Slot[];
  wires: Wire[];
  width: number;
  height: number;
  crossings: number;
};

/** The colour of a box: an input's, a file's, the outputs', or its column's among the steps. */
function colourOf(kind: BoxKind, stepColumn: number): string {
  if (kind === 'input') return PALETTE.input;
  if (kind === 'file') return PALETTE.file;
  if (kind === 'outputs') return PALETTE.output;
  return BOUNCE[(stepColumn - 1) % BOUNCE.length] ?? PALETTE.input;
}

/** How far down its face a box's first port row stands: under its head and its problem line. */
export function rowsTop(box: Pick<Box, 'warned'>): number {
  return BOX.head + (box.warned ? BOX.line : 0);
}

/** How tall a box is drawn, its ears' room and its border too. */
function heightOf(
  box: Pick<Box, 'open' | 'warned' | 'needs' | 'stacked'>,
  rows: number,
): number {
  return (
    BOX.stack +
    2 * BOX.border +
    rowsTop(box) +
    (box.open ? rows * GEOMETRY.row + GEOMETRY.foot : box.needs ? BOX.line : 0) +
    (box.stacked ? BOX.foot : 0)
  );
}

/**
 * The row a port stands on in its box: a port down the left on its own
 * row, from the first; one down the right on the rows under every port on
 * the left.
 */
export function rowOf(
  box: Pick<Box, 'left' | 'right'>,
  side: 'left' | 'right',
  port: string,
): number {
  return side === 'left'
    ? Math.max(box.left.indexOf(port), 0)
    : box.left.length + Math.max(box.right.indexOf(port), 0);
}

/** How far down a box a wire meets it: a closed box's pins, an open box's row. */
function meetsAt(
  box: Pick<Box, 'open' | 'warned' | 'left' | 'right'>,
  side: 'left' | 'right',
  port: string,
): number {
  const face = BOX.stack + BOX.border;
  if (!box.open) return face + BOX.pin;
  return face + rowsTop(box) + rowOf(box, side, port) * GEOMETRY.row + GEOMETRY.row / 2;
}

const OUTPUTS_BOX = 'outputs';

function stepBox(index: number): string {
  return `step:${index}`;
}

function sourceKey(ref: Ref, steps: Map<string, number>): string | null {
  if (ref.kind !== 'steps') return `${ref.kind}:${ref.name}`;
  const index = steps.get(ref.name);
  return index === undefined ? null : `steps:${index}.${ref.output}`;
}

/** Each step's index by id, the first step of an id winning. */
function stepIndexes(workflow: Workflow): Map<string, number> {
  const found = new Map<string, number>();
  workflow.steps.forEach((step, index) => {
    if (!found.has(step.id)) found.set(step.id, index);
  });
  return found;
}

type Endpoint = { item: string; side: 'left' | 'right' | 'through'; row: number };

type Item = {
  key: string;
  column: number;
  rows: number;
  base: (number | string)[];
};

type Connection = {
  source: string;
  sourceBox: string;
  sourcePort: string;
  targetKey: string;
  targetBox: string;
  targetPort: string;
};

/** The ports of a run workflow drawn as a box, when the step is not a primitive. */
export type StepPorts = { inputs: string[]; outputs: string[] };

/**
 * Which boxes are drawn open, or all of them, as a box's inside is; which
 * have a line saying what is wrong, from the last check's answer; and
 * whether the inputs and files a step reads are drawn, or left to the step
 * to list. An input no step reads is drawn either way, so it can be found.
 */
export type Drawn = {
  open: ReadonlySet<string> | 'all';
  warned?: ReadonlySet<string>;
  inputs?: 'shown' | 'hidden';
};

/** The ports of each step: the primitive's own, or a box's, then the rest the file uses. */
function stepPorts(
  workflow: Workflow,
  primitives: Map<string, PrimitiveInfo>,
  boxes: ReadonlyMap<string, StepPorts>,
) {
  const indexes = stepIndexes(workflow);
  const left: string[][] = [];
  const right: string[][] = [];
  workflow.steps.forEach((step) => {
    const primitive = declared(primitives, step);
    const box = boxes.get(step.use);
    const inputs =
      primitive !== null ? Object.keys(primitive.inputs) : (box?.inputs ?? []);
    left.push([
      ...inputs,
      ...Object.keys(step.with).filter((port) => !inputs.includes(port)),
    ]);
    const outputs =
      primitive !== null
        ? Object.keys(primitive.outputs).filter((output) => output !== 'outcome')
        : [...(box?.outputs ?? [])];
    right.push(outputs);
  });
  const reads = (ref: Ref, before: number) => {
    if (ref.kind !== 'steps') return;
    const index = indexes.get(ref.name);
    if (index === undefined || index >= before) return;
    const outputs = right[index];
    if (
      outputs !== undefined &&
      !outputs.includes(ref.output) &&
      ref.output !== 'outcome'
    )
      outputs.push(ref.output);
  };
  workflow.steps.forEach((step, index) => {
    for (const value of Object.values(step.with))
      for (const ref of refsOf(value)) reads(ref, index);
  });
  for (const entry of workflow.outputs)
    if (entry.from !== null) reads(entry.from, Infinity);
  return { left, right };
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

/** The layout of a workflow, given the declarations of the primitives it uses. */
export function layoutWorkflow(
  workflow: Workflow,
  primitives: Map<string, PrimitiveInfo>,
  given: ReadonlyMap<string, StepPorts>,
  { open, warned = new Set(), inputs = 'shown' }: Drawn,
): Layout {
  const isOpen = (key: string) => open === 'all' || open.has(key);
  const { steps } = workflow;
  const indexes = stepIndexes(workflow);
  const ports = stepPorts(workflow, primitives, given);
  const declaredInputs = new Set(workflow.inputs.map((input) => input.id));

  // What each step reads, and who reads each input and each file.
  const reads = steps.map(() => new Set<number>());
  const inputReaders = new Map<string, Set<number>>();
  const firstUse = new Map<string, [number, number]>();
  const note = (key: string, by: number, port: number) => {
    const held = inputReaders.get(key) ?? new Set<number>();
    held.add(by);
    inputReaders.set(key, held);
    const use = firstUse.get(key);
    if (use === undefined || compare([by, port], use) < 0)
      firstUse.set(key, [by, port]);
  };
  // The steps that read an input or a file, which a tab lists while they are hidden.
  const readsOuter = new Set<number>();
  steps.forEach((step, index) => {
    const left = ports.left[index] ?? [];
    for (const [port, value] of Object.entries(step.with)) {
      const portIndex = left.indexOf(port);
      for (const ref of refsOf(value)) {
        if (ref.kind === 'inputs' && declaredInputs.has(ref.name)) {
          note(`inputs:${ref.name}`, index, portIndex);
          readsOuter.add(index);
        } else if (ref.kind === 'workflow') {
          note(`workflow:${ref.name}`, index, portIndex);
          readsOuter.add(index);
        } else if (ref.kind === 'steps') {
          const read = indexes.get(ref.name);
          if (read !== undefined && read < index) reads[index]?.add(read);
        }
      }
    }
  });

  // Columns: the inputs 0, the files 1, the steps from 2. A step's colour
  // is by its place among the steps alone, so the files never change it.
  const column: number[] = steps.map(() => 0);
  steps.forEach((_, index) => {
    let at = 1;
    for (const read of reads[index] ?? []) at = Math.max(at, (column[read] ?? 0) + 1);
    column[index] = at;
  });
  const reportColumn = Math.max(0, ...column) + 2;
  const readerName = (reader: number) => steps[reader]?.id ?? '';

  // Boxes.
  type Draft = Omit<Box, 'x' | 'y' | 'height' | 'width' | 'colour'> & {
    base: (number | string)[];
  };
  const drafts: Draft[] = [];
  const parts = (key: string, stacked: boolean, needs: boolean) => ({
    open: isOpen(key),
    stacked,
    warned: warned.has(key),
    needs,
  });
  steps.forEach((step, index) => {
    const left = ports.left[index] ?? [];
    const right = ports.right[index] ?? [];
    const boxed = declared(primitives, step) === null && given.has(step.use);
    drafts.push({
      key: stepBox(index),
      kind: 'step',
      column: (column[index] ?? 1) + 1,
      step: index,
      readers: [],
      left,
      right,
      base: [index, 1],
      ...parts(stepBox(index), boxed, left.length + right.length > 0),
    });
  });
  const hiding: Draft[] = [];
  workflow.inputs.forEach(({ id }, place) => {
    const by = [...(inputReaders.get(`inputs:${id}`) ?? [])].sort((a, b) => a - b);
    const first = firstUse.get(`inputs:${id}`);
    (inputs === 'hidden' && by.length > 0 ? hiding : drafts).push({
      key: `input:${id}`,
      kind: 'input',
      column: 0,
      step: null,
      readers: by.map(readerName),
      left: [],
      right: [id],
      base:
        first === undefined
          ? [Infinity, 0, 0, place]
          : [first[0], 0, 0, first[1], place],
      ...parts(`input:${id}`, false, false),
    });
  });
  const files = [...firstUse.keys()].filter((key) => key.startsWith('workflow:'));
  files.forEach((key, place) => {
    const path = key.slice('workflow:'.length);
    const by = [...(inputReaders.get(key) ?? [])].sort((a, b) => a - b);
    const first = firstUse.get(key) ?? [Infinity, 0];
    (inputs === 'hidden' ? hiding : drafts).push({
      key: `file:${path}`,
      kind: 'file',
      column: 1,
      step: null,
      readers: by.map(readerName),
      left: [],
      right: [path],
      base: [first[0], 0, 1, first[1], place],
      ...parts(`file:${path}`, false, false),
    });
  });
  drafts.push({
    key: OUTPUTS_BOX,
    kind: 'outputs',
    column: reportColumn,
    step: null,
    readers: [],
    left: workflow.outputs.map((entry) => entry.name),
    right: [],
    base: [Infinity, 2],
    ...parts(OUTPUTS_BOX, false, false),
    // Each output is written out on its row, whatever else is open.
    open: true,
  });
  // The colour a step takes is by its column among the steps, before any closes up.
  const stepColumn = new Map(
    drafts.map((draft) => [draft.key, draft.kind === 'step' ? draft.column - 1 : 0]),
  );

  // Empty columns closed up.
  const used = [...new Set(drafts.map((draft) => draft.column))].sort((a, b) => a - b);
  const dense = new Map(used.map((value, at) => [value, at]));
  for (const draft of drafts) draft.column = dense.get(draft.column) ?? 0;
  const lastColumn = used.length - 1;
  const boxOf = new Map(drafts.map((draft) => [draft.key, draft]));

  // Connections: each wire from its source port to the port it feeds.
  const sourceBox = new Map<string, string>();
  for (const draft of drafts) {
    if (draft.kind === 'input')
      for (const id of draft.right) sourceBox.set(`inputs:${id}`, draft.key);
    if (draft.kind === 'file')
      for (const path of draft.right) sourceBox.set(`workflow:${path}`, draft.key);
  }
  const connections: Connection[] = [];
  const connect = (
    ref: Ref,
    before: number,
    targetBox: string,
    targetPort: string,
    targetKey: string,
  ) => {
    const key = sourceKey(ref, indexes);
    if (key === null) return;
    let box: string | undefined;
    let port: string;
    if (ref.kind === 'steps') {
      const index = indexes.get(ref.name);
      if (index === undefined || index >= before || ref.output === 'outcome') return;
      box = stepBox(index);
      port = ref.output;
    } else {
      box = sourceBox.get(key);
      port = ref.name;
    }
    if (box === undefined) return;
    connections.push({
      source: key,
      sourceBox: box,
      sourcePort: port,
      targetKey,
      targetBox,
      targetPort,
    });
  };
  steps.forEach((step, index) => {
    for (const [port, value] of Object.entries(step.with))
      for (const ref of wireRefs(value))
        connect(ref, index, stepBox(index), port, `port:${index}.${port}`);
  });
  for (const entry of workflow.outputs)
    if (entry.from !== null)
      connect(entry.from, Infinity, OUTPUTS_BOX, entry.name, `outputs:${entry.name}`);
  const columnOfBox = (key: string) => boxOf.get(key)?.column ?? 0;
  const live = connections.filter(
    (connection) =>
      columnOfBox(connection.targetBox) > columnOfBox(connection.sourceBox),
  );

  // Slots.
  const slots = new Map<string, Item & { source: string; label: string | null }>();
  // Only a step's wire is labelled: an input's or a file's starts at a box
  // in the first columns that names it already.
  const labelOf = (connection: Connection) => {
    if (!connection.source.startsWith('steps:')) return null;
    const index = Number(connection.source.slice(6, connection.source.indexOf('.')));
    return refWords({
      kind: 'steps',
      name: steps[index]?.id ?? '',
      output: connection.sourcePort,
    });
  };
  const chains = live.map((connection) => {
    const from = columnOfBox(connection.sourceBox);
    const to = columnOfBox(connection.targetBox);
    const chain: string[] = [];
    for (let at = from + 1; at < to; at += 1) {
      const key = `slot:${connection.source}:${at}`;
      if (!slots.has(key)) {
        const source = boxOf.get(connection.sourceBox);
        slots.set(key, {
          key,
          column: at,
          rows: 1,
          base: [
            ...(source?.base ?? []),
            3,
            source?.right.indexOf(connection.sourcePort) ?? 0,
          ],
          source: connection.source,
          label: at === from + 1 ? labelOf(connection) : null,
        });
      }
      chain.push(key);
    }
    return chain;
  });

  // Every item of each column, and the segments between neighbouring columns.
  const items = new Map<string, Item>();
  const rowsIn = (draft: Draft) =>
    draft.kind === 'outputs'
      ? draft.left.length + 1
      : draft.left.length + draft.right.length;
  for (const draft of drafts)
    items.set(draft.key, {
      key: draft.key,
      column: draft.column,
      rows: draft.open ? Math.max(rowsIn(draft), 1) : 1,
      base: draft.base,
    });
  for (const slot of slots.values()) items.set(slot.key, slot);
  const columns = lastColumn + 1;
  const order: string[][] = Array.from({ length: columns }, () => []);
  for (const item of [...items.values()].sort(
    (a, b) => compare(a.base, b.base) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
  ))
    order[item.column]?.push(item.key);

  type Segment = { from: Endpoint; to: Endpoint; column: number };
  const segments: Segment[] = [];
  const seen = new Set<string>();
  live.forEach((connection, at) => {
    const source = boxOf.get(connection.sourceBox);
    const target = boxOf.get(connection.targetBox);
    if (source === undefined || target === undefined) return;
    const ends: Endpoint[] = [
      {
        item: source.key,
        side: 'right',
        row: source.open ? rowOf(source, 'right', connection.sourcePort) : 0,
      },
      ...(chains[at] ?? []).map((key): Endpoint => ({
        item: key,
        side: 'through',
        row: 0,
      })),
      {
        item: target.key,
        side: 'left',
        row: target.open ? target.left.indexOf(connection.targetPort) : 0,
      },
    ];
    for (let step = 0; step + 1 < ends.length; step += 1) {
      const from = ends[step];
      const to = ends[step + 1];
      if (from === undefined || to === undefined) continue;
      const key = `${from.item}#${from.row}>${to.item}#${to.row}`;
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
    return (end: Endpoint) => (offset.get(end.item) ?? 0) + Math.max(end.row, 0);
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
    const keys = current[col] ?? [];
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
    const keyed = keys.map((key, place) => {
      const first = down ? incoming(key) : outgoing(key);
      const second = down ? outgoing(key) : incoming(key);
      return { key, place, first, second, base: items.get(key)?.base ?? [] };
    });
    const movable = keyed
      .filter((entry) => entry.first !== null)
      .sort(
        (a, b) =>
          (a.first ?? 0) - (b.first ?? 0) ||
          (a.second ?? Infinity) - (b.second ?? Infinity) ||
          compare(a.base, b.base) ||
          a.place - b.place,
      );
    const next: string[] = [];
    let moved = 0;
    for (const entry of keyed) {
      if (entry.first === null) next.push(entry.key);
      else next.push(movable[moved++]?.key ?? entry.key);
    }
    const copy = current.map((keysOf) => [...keysOf]);
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

  // Coordinates. Each column is as wide as its widest box, after room for
  // the tab of a step in the first one.
  const tabbed =
    inputs === 'hidden' &&
    drafts.some(
      (draft) =>
        draft.column === 0 && draft.step !== null && readsOuter.has(draft.step),
    );
  const spans: { x: number; width: number }[] = [];
  let right = tabbed ? BOX.tab : 0;
  for (let col = 0; col < columns; col += 1) {
    const width = Math.max(
      BOX.closed,
      ...drafts
        .filter((draft) => draft.column === col)
        .map((draft) => (draft.open ? BOX.open : BOX.closed)),
    );
    spans.push({ x: right, width });
    right += width + BOX.gap;
  }
  const spanOf = (col: number) => spans[col] ?? { x: 0, width: BOX.closed };
  const placed = new Map<string, { x: number; y: number; height: number }>();
  let height = 0;
  best.forEach((keys, col) => {
    let y = 0;
    for (const key of keys) {
      const draft = boxOf.get(key);
      const tall = draft === undefined ? GEOMETRY.row : heightOf(draft, rowsIn(draft));
      placed.set(key, { x: spanOf(col).x, y, height: tall });
      y += tall + GEOMETRY.space;
    }
    height = Math.max(height, y - GEOMETRY.space);
  });
  const boxes: Box[] = drafts
    .map((draft) => {
      const at = placed.get(draft.key) ?? { x: 0, y: 0, height: 0 };
      const { base: _base, ...rest } = draft;
      void _base;
      return {
        ...rest,
        ...at,
        width: draft.open ? BOX.open : BOX.closed,
        colour: colourOf(draft.kind, stepColumn.get(draft.key) ?? 1),
      };
    })
    .sort((a, b) => a.column - b.column || a.y - b.y);
  const hidden: Box[] = hiding.map(({ base: _base, ...rest }) => {
    void _base;
    const closed = { ...rest, open: false };
    return {
      ...closed,
      x: 0,
      y: 0,
      width: BOX.closed,
      height: heightOf(closed, 0),
      colour: colourOf(rest.kind, 0),
    };
  });
  const placedBox = new Map(boxes.map((box) => [box.key, box]));
  const colourOfSource = (key: string) => placedBox.get(key)?.colour ?? PALETTE.input;
  const slotList: Slot[] = [...slots.values()]
    .map((slot) => {
      const at = placed.get(slot.key) ?? { x: 0, y: 0, height: GEOMETRY.row };
      const from = live.find((connection) => connection.source === slot.source);
      return {
        key: slot.key,
        column: slot.column,
        source: slot.source,
        label: slot.label,
        ...at,
        width: spanOf(slot.column).width,
        colour: colourOfSource(from?.sourceBox ?? ''),
      };
    })
    .sort((a, b) => a.column - b.column || a.y - b.y);
  const wires: Wire[] = live.map((connection, at) => {
    const source = placedBox.get(connection.sourceBox);
    const target = placedBox.get(connection.targetBox);
    const y1 =
      source === undefined
        ? 0
        : source.y + meetsAt(source, 'right', connection.sourcePort);
    const points: Point[] = [{ x: (source?.x ?? 0) + (source?.width ?? 0), y: y1 }];
    // From a box narrower than its column, straight to the column's edge.
    const edge =
      source === undefined ? 0 : spanOf(source.column).x + spanOf(source.column).width;
    if (source !== undefined && source.x + source.width < edge)
      points.push({ x: edge, y: y1 });
    for (const key of chains[at] ?? []) {
      const slot = placed.get(key);
      if (slot === undefined) continue;
      const y = slot.y + GEOMETRY.row / 2;
      const span = spanOf(items.get(key)?.column ?? 0);
      points.push({ x: span.x, y }, { x: span.x + span.width, y });
    }
    points.push({
      x: target?.x ?? 0,
      y:
        target === undefined
          ? 0
          : target.y + meetsAt(target, 'left', connection.targetPort),
    });
    return {
      key: `${connection.source}>${connection.targetKey}`,
      source: connection.source,
      target: connection.targetKey,
      from: { box: connection.sourceBox, port: connection.sourcePort },
      to: { box: connection.targetBox, port: connection.targetPort },
      points,
      colour: colourOfSource(connection.sourceBox),
    };
  });
  return {
    columns,
    boxes,
    hidden,
    slots: slotList,
    wires,
    width: Math.max(0, right - BOX.gap),
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
  let path = `M ${first.x} ${first.y}`;
  let previous = first;
  for (const point of rest) {
    if (point.y === previous.y) {
      path += ` L ${point.x} ${point.y}`;
    } else {
      const middle = (previous.x + point.x) / 2;
      path += ` C ${middle} ${previous.y} ${middle} ${point.y} ${point.x} ${point.y}`;
    }
    previous = point;
  }
  return path;
}
