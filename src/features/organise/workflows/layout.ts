import {
  GEOMETRY,
  WORKFLOW_PALETTE,
  boxHeight,
  layoutGraph,
  type GraphBox,
  type GraphWire,
  type Point,
  type Shape,
} from '../flow/graph';
import { BOX } from '../flow/box';
import { refsOf, wireRefs, type Ref, type Workflow } from './model';
import { declared, type PrimitiveInfo } from './primitives';
import { refWords } from './words';

/**
 * A workflow's graph as boxes and wires, worked out from its
 * `workflow.yaml` alone (PROPOSAL.md section 12, #377), so one file always
 * draws one picture. `flow/graph.ts` places them. What is the workflow's:
 *
 * - Each input is a box in the first column. Each file or folder of the
 *   workflow a step reads is a box in the next. A step stands one column
 *   right of the furthest step it reads, a reference inside text too. The
 *   outputs stand last, always open.
 * - A box starts in its column by the step that first reads it, then in
 *   the order of `steps:` and `inputs:`.
 * - Only a step's wire is labelled: an input or a file names itself.
 *
 * Box keys, which the page and its tests find boxes by: `step:<index>` for
 * a step, by its place in `steps:`; `input:<name>` for an input;
 * `file:<path>` for a file of the workflow; `outputs`.
 */

const SHAPE: Shape = { width: BOX.closed, gap: BOX.gap };

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

const OUTPUTS_BOX = 'outputs';

function stepBox(index: number): string {
  return `step:${String(index)}`;
}

function sourceKey(ref: Ref, steps: Map<string, number>): string | null {
  if (ref.kind !== 'steps') return `${ref.kind}:${ref.name}`;
  const index = steps.get(ref.name);
  return index === undefined ? null : `steps:${String(index)}.${ref.output}`;
}

/** Each step's index by id, the first step of an id winning. */
function stepIndexes(workflow: Workflow): Map<string, number> {
  const found = new Map<string, number>();
  workflow.steps.forEach((step, index) => {
    if (!found.has(step.id)) found.set(step.id, index);
  });
  return found;
}

/** The ports of a run workflow drawn as a box, when the step is not a primitive. */
export type StepPorts = {
  inputs: { name: string; optional: boolean }[];
  outputs: string[];
};

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

/**
 * The ports of each step: the primitive's or box's inputs, an optional one
 * only once it is given, then the rest the file gives. The step's panel
 * lists them all.
 */
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
    const declaredPorts =
      primitive !== null
        ? Object.entries(primitive.inputs).map(([name, port]) => ({
            name,
            optional: port.optional,
          }))
        : (box?.inputs ?? []);
    const inputs = declaredPorts
      .filter((port) => !port.optional || port.name in step.with)
      .map((port) => port.name);
    left.push([
      ...inputs,
      ...Object.keys(step.with).filter(
        (port) => !declaredPorts.some((found) => found.name === port),
      ),
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

type Draft = Omit<Box, 'x' | 'y' | 'height' | 'width' | 'colour' | 'column'> & {
  /** Where it starts in its column. */
  order: number[];
};

const ROLES = {
  step: undefined,
  input: 'input',
  file: 'file',
  outputs: 'output',
} as const satisfies Record<BoxKind, GraphBox['role']>;

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

  // What each step reads, and who first reads each input and each file.
  const reads = steps.map(() => new Set<number>());
  const inputReaders = new Map<string, Set<number>>();
  const firstUse = new Map<string, [number, number]>();
  const note = (key: string, by: number, port: number) => {
    const held = inputReaders.get(key) ?? new Set<number>();
    held.add(by);
    inputReaders.set(key, held);
    const use = firstUse.get(key);
    if (use === undefined || by < use[0] || (by === use[0] && port < use[1]))
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
  // A step's column among the steps alone, from 1, so the files never move it.
  const column: number[] = steps.map(() => 0);
  steps.forEach((_, index) => {
    let at = 1;
    for (const read of reads[index] ?? []) at = Math.max(at, (column[read] ?? 0) + 1);
    column[index] = at;
  });
  const readerName = (reader: number) => steps[reader]?.id ?? '';

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
      step: index,
      readers: [],
      left,
      right,
      order: [index, 1],
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
      step: null,
      readers: by.map(readerName),
      left: [],
      right: [id],
      order:
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
      step: null,
      readers: by.map(readerName),
      left: [],
      right: [path],
      order: [first[0], 0, 1, first[1], place],
      ...parts(`file:${path}`, false, false),
    });
  });
  drafts.push({
    key: OUTPUTS_BOX,
    kind: 'outputs',
    step: null,
    readers: [],
    left: workflow.outputs.map((entry) => entry.name),
    right: [],
    order: [Infinity, 2],
    ...parts(OUTPUTS_BOX, false, false),
    open: true,
  });

  // Each wire from its source port to the port it feeds.
  const sourceBox = new Map<string, string>();
  for (const draft of drafts) {
    if (draft.kind === 'input')
      for (const id of draft.right) sourceBox.set(`inputs:${id}`, draft.key);
    if (draft.kind === 'file')
      for (const path of draft.right) sourceBox.set(`workflow:${path}`, draft.key);
  }
  const wires: (GraphWire & { source: string; target: string })[] = [];
  const connect = (
    ref: Ref,
    before: number,
    to: string,
    toPort: string,
    target: string,
  ) => {
    const source = sourceKey(ref, indexes);
    if (source === null) return;
    if (ref.kind === 'steps') {
      const index = indexes.get(ref.name);
      if (index === undefined || index >= before || ref.output === 'outcome') return;
      wires.push({
        source,
        target,
        from: stepBox(index),
        fromPort: ref.output,
        to,
        toPort,
        label: refWords({
          kind: 'steps',
          name: steps[index]?.id ?? '',
          output: ref.output,
        }),
      });
      return;
    }
    const from = sourceBox.get(source);
    if (from !== undefined)
      wires.push({ source, target, from, fromPort: ref.name, to, toPort });
  };
  steps.forEach((step, index) => {
    for (const [port, value] of Object.entries(step.with))
      for (const ref of wireRefs(value))
        connect(ref, index, stepBox(index), port, `port:${String(index)}.${port}`);
  });
  for (const entry of workflow.outputs)
    if (entry.from !== null)
      connect(entry.from, Infinity, OUTPUTS_BOX, entry.name, `outputs:${entry.name}`);

  const graphBox = (draft: Draft): GraphBox => ({
    id: draft.key,
    role: ROLES[draft.kind],
    ports: [
      ...draft.left.map((name) => ({ name, side: 'in' as const })),
      ...draft.right.map((name) => ({ name, side: 'out' as const })),
    ],
    open: draft.open,
    // After the inputs' column and the files'.
    least: draft.step === null ? undefined : (column[draft.step] ?? 1) + 1,
    order: draft.order,
    wide: BOX.open,
    warned: draft.warned,
    below:
      (draft.kind === 'outputs' ? GEOMETRY.row : 0) +
      (!draft.open && draft.needs ? BOX.line : 0) +
      (draft.stacked ? BOX.foot : 0),
  });
  // With nothing drawn before them, the first steps leave room for their tabs.
  const tabbed =
    inputs === 'hidden' &&
    !drafts.some((draft) => draft.kind === 'input' || draft.kind === 'file') &&
    steps.some((_, index) => readsOuter.has(index) && column[index] === 1);
  const laid = layoutGraph(drafts.map(graphBox), wires, {
    shape: SHAPE,
    palette: WORKFLOW_PALETTE,
    left: tabbed ? BOX.tab : 0,
  });

  const byKey = new Map(drafts.map((draft) => [draft.key, draft]));
  const strip = ({ order, ...rest }: Draft) => {
    void order;
    return rest;
  };
  const boxes: Box[] = laid.boxes.map(
    ({ box, column, x, y, width, height, colour }) => {
      const draft = byKey.get(box.id);
      if (draft === undefined) throw new Error(`${box.id} has no draft`);
      return { ...strip(draft), column, x, y, width, height, colour };
    },
  );
  const hidden: Box[] = hiding.map((draft) => {
    const file = draft.kind === 'file';
    return {
      ...strip(draft),
      open: false,
      column: file ? 1 : 0,
      x: 0,
      y: 0,
      width: BOX.closed,
      height: boxHeight({ id: draft.key, ports: [], warned: draft.warned }, SHAPE),
      colour: file ? WORKFLOW_PALETTE.file : WORKFLOW_PALETTE.input,
    };
  });
  const slots: Slot[] = laid.slots.map((slot) => {
    // Every slot is a wire's, and the wires from one port share a source.
    const source =
      wires.find((wire) => wire.from === slot.from && wire.fromPort === slot.fromPort)
        ?.source ?? '';
    return {
      key: `slot:${source}:${String(slot.column)}`,
      column: slot.column,
      x: slot.x,
      y: slot.y,
      width: slot.width,
      height: slot.height,
      source,
      label: slot.label,
      colour: slot.colour,
    };
  });
  return {
    columns: laid.columns,
    boxes,
    hidden,
    slots,
    wires: laid.wires.map(({ wire, points, colour }) => ({
      key: `${wire.source}>${wire.target}`,
      source: wire.source,
      target: wire.target,
      from: { box: wire.from, port: wire.fromPort },
      to: { box: wire.to, port: wire.toPort },
      points,
      colour,
    })),
    width: laid.width,
    height: laid.height,
    crossings: laid.crossings,
  };
}
