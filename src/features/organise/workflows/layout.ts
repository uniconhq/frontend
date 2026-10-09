import { refLabel, refsOf, type Ref, type Workflow } from './model';
import type { PrimitiveInfo } from './primitives';

/**
 * Where everything of a workflow's graph stands, worked out from its
 * `workflow.yaml` alone (PROPOSAL.md section 12, #377). Nothing of it is
 * stored, so one file always draws one picture. The rules:
 *
 * - Columns. A once step stands one column right of the furthest once step
 *   it reads, the first in column 1; a per-test step the same among the
 *   per-test steps, in a band after every once column. The report stands in
 *   the last column.
 * - Groups. Inputs read by exactly the same steps share a box, named for
 *   them, in the column just before the first of them, their rows in the
 *   order of the ports they feed; test fields likewise, never left of the
 *   band's first column. One that nothing reads stands in the first column,
 *   or the band's first. Text with an input written in counts as reading it.
 * - Slots. A wire that skips columns runs through a slot of its own in each
 *   column it crosses, labelled with its source where it starts, and wires
 *   from one port share their slots. Every wire joins neighbouring columns
 *   only, through the gap between them, so none passes behind a box.
 * - Order. Each column's boxes and slots are sorted by where their wires come
 *   from and then by where they go, a few sweeps each way, keeping the order
 *   with the fewest crossings; ties keep the order of `steps:`.
 * - Colour. Five colours cut from the mark's gradient, which the columns
 *   take 1 to 5 and back down, again and again; a wire takes the colour of
 *   the column it leaves.
 */

export const GEOMETRY = {
  /** A box's width, and a slot's. */
  width: 232,
  /** The space between two columns, which the wires cross. */
  gap: 112,
  /** A box's title rows. */
  header: 44,
  /** One port's row. */
  row: 26,
  /** Below a box's last row. */
  foot: 10,
  /** Between two things in a column. */
  space: 22,
} as const;

const SWEEPS = 4;
const PINGPONG = [0, 1, 2, 3, 4, 3, 2, 1];

type BoxKind = 'step' | 'inputs' | 'test' | 'report';

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
  /** For a group, the steps it is read by, in the order of `steps:`. */
  readers: string[];
  /** Ports down the left: a step's inputs, the report's entries. */
  left: string[];
  /** Ports down the right: a step's outputs, a group's inputs or fields. */
  right: string[];
  colour: number;
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
  colour: number;
};

export type Point = { x: number; y: number };

type Wire = {
  key: string;
  /** `inputs:<id>`, `test:<field>` or `steps:<index>.<output>`. */
  source: string;
  /** `port:<index>.<port>` or `report:<name>`. */
  target: string;
  from: { box: string; port: string };
  to: { box: string; port: string };
  /** From the source port to the target port, through each slot. */
  points: Point[];
  colour: number;
};

export type Layout = {
  columns: number;
  /** The columns of the per-test band, first to last. */
  band: { first: number; last: number } | null;
  boxes: Box[];
  slots: Slot[];
  wires: Wire[];
  width: number;
  height: number;
  crossings: number;
};

/** The colour a column takes, 0 to 4: 1 to 5 and back down, again and again. */
export function colourOf(column: number): number {
  return PINGPONG[column % PINGPONG.length] ?? 0;
}

export function columnX(column: number): number {
  return column * (GEOMETRY.width + GEOMETRY.gap);
}

const REPORT_BOX = 'report';

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

/** The ports of each step: the primitive's own, in its order, then the rest the file uses. */
function stepPorts(workflow: Workflow, primitives: Map<string, PrimitiveInfo>) {
  const indexes = stepIndexes(workflow);
  const left: string[][] = [];
  const right: string[][] = [];
  workflow.steps.forEach((step) => {
    const declared = primitives.get(step.use);
    const inputs =
      declared && declared.problem === null ? Object.keys(declared.inputs) : [];
    left.push([
      ...inputs,
      ...Object.keys(step.with).filter((port) => !inputs.includes(port)),
    ]);
    const outputs =
      declared && declared.problem === null
        ? Object.keys(declared.outputs).filter((output) => output !== 'outcome')
        : [];
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
  for (const entry of workflow.report)
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
): Layout {
  const { steps } = workflow;
  const indexes = stepIndexes(workflow);
  const ports = stepPorts(workflow, primitives);
  const declaredInputs = new Set(workflow.inputs.map((input) => input.id));
  const declaredFields = new Set(workflow.test.map((field) => field.name));

  // What each step reads, and who reads each input and field.
  const reads = steps.map(() => new Set<number>());
  const inputReaders = new Map<string, Set<number>>();
  const fieldReaders = new Map<string, Set<number>>();
  const firstUse = new Map<string, [number, number]>();
  const REPORT = steps.length;
  const note = (
    readers: Map<string, Set<number>>,
    key: string,
    by: number,
    port: number,
  ) => {
    const held = readers.get(key) ?? new Set<number>();
    held.add(by);
    readers.set(key, held);
    const use = firstUse.get(key);
    if (use === undefined || compare([by, port], use) < 0)
      firstUse.set(key, [by, port]);
  };
  steps.forEach((step, index) => {
    const left = ports.left[index] ?? [];
    for (const [port, value] of Object.entries(step.with)) {
      const portIndex = left.indexOf(port);
      for (const ref of refsOf(value)) {
        if (ref.kind === 'inputs' && declaredInputs.has(ref.name))
          note(inputReaders, `inputs:${ref.name}`, index, portIndex);
        else if (ref.kind === 'test' && declaredFields.has(ref.name))
          note(fieldReaders, `test:${ref.name}`, index, portIndex);
        else if (ref.kind === 'steps') {
          const read = indexes.get(ref.name);
          if (read !== undefined && read < index) reads[index]?.add(read);
        }
      }
    }
  });
  workflow.report.forEach((entry, at) => {
    if (entry.betterRef?.kind === 'inputs' && declaredInputs.has(entry.betterRef.name))
      note(inputReaders, `inputs:${entry.betterRef.name}`, REPORT, at);
  });

  // Columns.
  const column: number[] = steps.map(() => 0);
  steps.forEach((step, index) => {
    if (step.perTest) return;
    let at = 1;
    for (const read of reads[index] ?? [])
      if (!steps[read]?.perTest) at = Math.max(at, (column[read] ?? 0) + 1);
    column[index] = at;
  });
  const lastOnce = Math.max(
    0,
    ...steps.map((step, index) => (step.perTest ? 0 : (column[index] ?? 0))),
  );
  const bandFirst = lastOnce + 1;
  steps.forEach((step, index) => {
    if (!step.perTest) return;
    let at = bandFirst + 1;
    for (const read of reads[index] ?? [])
      if (steps[read]?.perTest) at = Math.max(at, (column[read] ?? 0) + 1);
    column[index] = at;
  });
  const reportColumn = Math.max(bandFirst, ...column) + 1;
  const readerColumn = (reader: number) =>
    reader === REPORT ? reportColumn : (column[reader] ?? 0);
  const readerName = (reader: number) =>
    reader === REPORT ? 'report' : (steps[reader]?.id ?? '');

  // Boxes.
  type Draft = Omit<Box, 'x' | 'y' | 'height' | 'width' | 'colour'> & {
    base: (number | string)[];
  };
  const drafts: Draft[] = [];
  steps.forEach((_, index) => {
    drafts.push({
      key: stepBox(index),
      kind: 'step',
      column: column[index] ?? 1,
      step: index,
      readers: [],
      left: ports.left[index] ?? [],
      right: ports.right[index] ?? [],
      base: [index, 1],
    });
  });
  const grouped = (
    kind: 'inputs' | 'test',
    names: string[],
    readers: Map<string, Set<number>>,
    unreadColumn: number,
    floor: number,
  ) => {
    const groups = new Map<string, string[]>();
    for (const name of names) {
      const by = [...(readers.get(`${kind}:${name}`) ?? [])].sort((a, b) => a - b);
      const key = by.join(',');
      groups.set(key, [...(groups.get(key) ?? []), name]);
    }
    for (const [key, members] of groups) {
      const by = key === '' ? [] : key.split(',').map(Number);
      const at =
        by.length === 0
          ? unreadColumn
          : Math.max(floor, Math.min(...by.map(readerColumn)) - 1);
      const ordered = [...members].sort((a, b) => {
        const first = firstUse.get(`${kind}:${a}`) ?? [Infinity, names.indexOf(a)];
        const second = firstUse.get(`${kind}:${b}`) ?? [Infinity, names.indexOf(b)];
        return compare(first, second) || names.indexOf(a) - names.indexOf(b);
      });
      const firstOf = firstUse.get(`${kind}:${ordered[0] ?? ''}`) ?? [-1, 0];
      drafts.push({
        key: `${kind}:${key}`,
        kind,
        column: at,
        step: null,
        readers: by.map(readerName),
        left: [],
        right: ordered,
        base: [firstOf[0], 0, kind === 'inputs' ? 0 : 1, firstOf[1]],
      });
    }
  };
  grouped(
    'inputs',
    workflow.inputs.map((input) => input.id),
    inputReaders,
    0,
    0,
  );
  grouped(
    'test',
    workflow.test.map((field) => field.name),
    fieldReaders,
    bandFirst,
    bandFirst,
  );
  drafts.push({
    key: REPORT_BOX,
    kind: 'report',
    column: reportColumn,
    step: null,
    readers: [],
    left: workflow.report.map((entry) => entry.name),
    right: [],
    base: [Infinity, 2],
  });

  // Empty columns closed up.
  const used = [...new Set(drafts.map((draft) => draft.column))].sort((a, b) => a - b);
  const dense = new Map(used.map((value, at) => [value, at]));
  for (const draft of drafts) draft.column = dense.get(draft.column) ?? 0;
  const firstBand = used.findIndex((value) => value >= bandFirst);
  const lastColumn = used.length - 1;
  const band =
    firstBand >= 0 &&
    firstBand < lastColumn &&
    (workflow.test.length > 0 || steps.some((step) => step.perTest))
      ? { first: firstBand, last: lastColumn - 1 }
      : null;
  const boxOf = new Map(drafts.map((draft) => [draft.key, draft]));

  // Connections: each wire from its source port to the port it feeds.
  const sourceBox = new Map<string, string>();
  for (const draft of drafts) {
    if (draft.kind === 'inputs')
      for (const id of draft.right) sourceBox.set(`inputs:${id}`, draft.key);
    if (draft.kind === 'test')
      for (const name of draft.right) sourceBox.set(`test:${name}`, draft.key);
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
      if (value.kind === 'wire')
        connect(value.ref, index, stepBox(index), port, `port:${index}.${port}`);
  });
  for (const entry of workflow.report)
    if (entry.from !== null)
      connect(entry.from, Infinity, REPORT_BOX, entry.name, `report:${entry.name}`);
  const columnOfBox = (key: string) => boxOf.get(key)?.column ?? 0;
  const live = connections.filter(
    (connection) =>
      columnOfBox(connection.targetBox) > columnOfBox(connection.sourceBox),
  );

  // Slots.
  const slots = new Map<string, Item & { source: string; label: string | null }>();
  const labelOf = (connection: Connection) => {
    if (connection.source.startsWith('steps:')) {
      const index = Number(connection.source.slice(6, connection.source.indexOf('.')));
      return `${steps[index]?.id ?? ''}.${connection.sourcePort}`;
    }
    const [kind, name] = connection.source.split(':') as ['inputs' | 'test', string];
    return refLabel({ kind, name });
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
  for (const draft of drafts)
    items.set(draft.key, {
      key: draft.key,
      column: draft.column,
      rows:
        draft.kind === 'report'
          ? draft.left.length + 1
          : Math.max(draft.left.length, draft.right.length, 1),
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
        row: source.right.indexOf(connection.sourcePort),
      },
      ...(chains[at] ?? []).map((key): Endpoint => ({
        item: key,
        side: 'through',
        row: 0,
      })),
      {
        item: target.key,
        side: 'left',
        row: target.left.indexOf(connection.targetPort),
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

  // Coordinates.
  const placed = new Map<string, { x: number; y: number; height: number }>();
  let height = 0;
  best.forEach((keys, col) => {
    let y = 0;
    for (const key of keys) {
      const item = items.get(key);
      const isSlot = slots.has(key);
      const tall = isSlot
        ? GEOMETRY.row
        : GEOMETRY.header + (item?.rows ?? 1) * GEOMETRY.row + GEOMETRY.foot;
      placed.set(key, { x: columnX(col), y, height: tall });
      y += tall + GEOMETRY.space;
    }
    height = Math.max(height, y - GEOMETRY.space);
  });
  const boxes: Box[] = drafts
    .map((draft) => {
      const at = placed.get(draft.key) ?? { x: 0, y: 0, height: 0 };
      const { base: _base, ...rest } = draft;
      void _base;
      return { ...rest, ...at, width: GEOMETRY.width, colour: colourOf(draft.column) };
    })
    .sort((a, b) => a.column - b.column || a.y - b.y);
  const slotList: Slot[] = [...slots.values()]
    .map((slot) => {
      const at = placed.get(slot.key) ?? { x: 0, y: 0, height: GEOMETRY.row };
      return {
        key: slot.key,
        column: slot.column,
        source: slot.source,
        label: slot.label,
        ...at,
        width: GEOMETRY.width,
        colour: colourOf(slot.column),
      };
    })
    .sort((a, b) => a.column - b.column || a.y - b.y);
  const portY = (key: string, row: number) => {
    const at = placed.get(key);
    if (at === undefined) return 0;
    if (slots.has(key)) return at.y + GEOMETRY.row / 2;
    return at.y + GEOMETRY.header + Math.max(row, 0) * GEOMETRY.row + GEOMETRY.row / 2;
  };
  const wires: Wire[] = live.map((connection, at) => {
    const source = boxOf.get(connection.sourceBox);
    const target = boxOf.get(connection.targetBox);
    const sourceRow = source?.right.indexOf(connection.sourcePort) ?? 0;
    const targetRow = target?.left.indexOf(connection.targetPort) ?? 0;
    const points: Point[] = [
      {
        x: columnX(source?.column ?? 0) + GEOMETRY.width,
        y: portY(connection.sourceBox, sourceRow),
      },
    ];
    for (const key of chains[at] ?? []) {
      const slot = placed.get(key);
      if (slot === undefined) continue;
      const y = portY(key, 0);
      points.push({ x: slot.x, y }, { x: slot.x + GEOMETRY.width, y });
    }
    points.push({
      x: columnX(target?.column ?? 0),
      y: portY(connection.targetBox, targetRow),
    });
    return {
      key: `${connection.source}>${connection.targetKey}`,
      source: connection.source,
      target: connection.targetKey,
      from: { box: connection.sourceBox, port: connection.sourcePort },
      to: { box: connection.targetBox, port: connection.targetPort },
      points,
      colour: colourOf(source?.column ?? 0),
    };
  });
  return {
    columns,
    band,
    boxes,
    slots: slotList,
    wires,
    width: Math.max(0, columns * (GEOMETRY.width + GEOMETRY.gap) - GEOMETRY.gap),
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
