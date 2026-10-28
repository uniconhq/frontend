import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
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
  type OnConnectEnd,
  type OnConnectStart,
  type NodeMouseHandler,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { DefinitionProblem } from '@/api/types';
import { keepEqual } from '@/lib/keep-equal';
import { ActionMenu, type MenuEntry } from '@/ui/ActionMenu';
import { Popout } from '@/ui/Popout';
import {
  BOX,
  BOX_PROPERTIES,
  GEOMETRY,
  PALETTE,
  rowOf,
  rowsTop,
  wirePath,
  type Box,
  type Layout,
  type Point,
} from './layout';
import type { BoxDecl } from './boxes';
import {
  sourceAt,
  targetAt,
  targetOf,
  type Drop,
  type Notice,
  type Target,
} from './ends';
import { NOTICE_MS } from './notice';
import { NumberText } from '../forms/yaml-doc';
import { refsOf, type OutputEntry, type Ref, type Workflow } from './model';
import type { Pinned, Warning } from './pins';
import { declared, type PrimitiveInfo } from './primitives';
import { outputType } from './rules';
import {
  boxName,
  fileType,
  entryMarks,
  needsWords,
  portMarks,
  primitiveTitle,
  readersWords,
  refWords,
  typeWords,
} from './words';
import classes from './workflows.module.css';

/**
 * The workflow drawn as boxes and wires. React Flow draws them and handles
 * the drags; where everything stands is `layout`'s, worked out from the file,
 * so React Flow places nothing and no node can be dragged. Every box is
 * closed, its head and a line or two with a pin a side, but the one
 * selected, which opens to a row for each port. A wire is drawn by
 * dragging from a source's handle, or a closed box's pin when it gives one
 * output, to a port's, or onto a closed box, whose port the editor picks;
 * while one is dragged, each port and closed box says whether it would take
 * it, and one that would not says why when the wire is dropped there. A
 * wire's end lifted off a step's port moves to wherever it is dropped, or,
 * dropped on nothing, leaves the port empty. Every port is also a button
 * whose menu does what a drag does, for the keyboard. Each box and row says
 * what it is in words (M31): a step its primitive's title and what it does,
 * a port what it does that the author acts on, and a problem its message
 * beside its mark.
 *
 * What each box and port shows is worked out here, from the workflow, as
 * plain data, and a box or port is drawn again only when what it shows
 * changes: a change to the file draws again the boxes it touches, not every
 * box on the graph, which on each change made the editor slow.
 */

type Side = 'left' | 'right';

/** What a port's row shows. */
type RowView = {
  port: string;
  /** What the row reads as: an output by its title, its key only where it has none (M58). */
  name: string;
  side: Side;
  /** How far down its box the row stands. */
  top: number;
  /** A step's output, and the first of them. */
  output: boolean;
  firstOutput: boolean;
  /** While a wire is dragged: this port would take it, or why it would not. */
  offered: boolean;
  refused: string | null;
  title: string | undefined;
  /** The outputs' row for one not made yet, which a wire is dropped on. */
  isNew: boolean;
  /** What the port's menu is called, or null for a port with none. */
  label: string | null;
  optional: boolean;
  problems: DefinitionProblem[];
  /** Its type, its marks and its value, in words. */
  said: string;
  /** Whether the wire last dropped here was refused, while its box says why. */
  noticed: boolean;
};

/** What the head of a box shows: its name and kind, what it is with its ref, and what it does. */
type HeadView = {
  title: string;
  /** The kind of box, in the pill beside its name. */
  pill: string | null;
  what: string | null;
  ref: string | null;
  description: string | null;
  /** A step's place in `steps:`, so a workflow box's Open can name it. */
  step: number | null;
};

/**
 * An input or a file of the workflow a box reads that is not drawn, as its
 * box would show it, and the ports it feeds.
 */
type Fed = {
  key: string;
  kind: Box['kind'];
  name: string;
  colour: string;
  height: number;
  head: HeadView;
  ports: string[];
};

/** What a box shows. */
type BoxData = {
  key: string;
  kind: Box['kind'];
  name: string;
  colour: string;
  selected: boolean;
  /** Drawn with its ports' rows; closed, it is its head and a line or two. */
  open: boolean;
  /** A run workflow's step, drawn as a stack with a foot that opens it. */
  stacked: boolean;
  head: HeadView;
  warning: Warning | null;
  /** What a closed step needs and gives. */
  needs: string | null;
  /** Whether a closed box has a pin on each side, and gives one output, which its pin drags. */
  pins: { left: boolean; right: boolean; single: boolean };
  /** While a wire is dragged, whether this closed box would take it, or why not. */
  drop: { refused: string | null } | null;
  rows: RowView[];
  /** The inputs and files it reads that are not drawn, which a tab on its left pops out. */
  fed: Fed[];
  /** Why the wire last dropped on one of its ports was refused, while that shows. */
  notice: { reason: string; count: number } | null;
};

type BoxNode = Node<BoxData, 'box'>;
type SlotNode = Node<{ label: string | null; colour: string }, 'slot'>;
type WireEdge = Edge<
  { points: Point[]; colour: string; marked: boolean; dimmed: boolean },
  'wire'
>;

/** What the graph's parts do, the same for as long as the graph is drawn. */
type Actions = {
  readOnly: boolean;
  /** The ports have menus; without, each port is only its name. */
  menus: boolean;
  select: (key: string) => void;
  entries: (box: string, port: string, side: Side) => MenuEntry[];
  /** Open the run workflow a step uses. */
  openBox: (index: number) => void;
};

const ActionsContext = createContext<Actions | null>(null);

function useActions(): Actions {
  const found = useContext(ActionsContext);
  if (found === null) throw new Error('A graph node renders inside Graph.');
  return found;
}

/** Everything a box's view is worked out from. */
type Seen = {
  workflow: Workflow;
  primitives: Map<string, PrimitiveInfo>;
  pinned: Pinned;
  selected: string | null;
  dragging: Ref | null;
  refusal: (source: Ref, target: Target) => string | null;
  notice: Notice | null;
  label: ((box: Box, port: string, side: Side) => string | null) | null;
  /** The ports a drawn wire feeds, `port:<step>.<port>`. */
  drawn: Set<string>;
  /** The box of an input or a file that is not drawn, which a tab pops out. */
  unboxed: (ref: Ref) => Box | null;
  /** Run workflows the steps use, by `owner/name@version`. */
  workflowBoxes: ReadonlyMap<string, BoxDecl>;
  warnings: ReadonlyMap<string, Warning>;
};

/**
 * What a port without a drawn wire is given, as the port shows it: a value,
 * text with values written in, or a wire the layout cannot draw, such as a
 * step reading one written after it, which the file holds all the same.
 */
function shownValue(seen: Seen, box: Box, port: string): string | null {
  if (box.step === null) return null;
  const value = seen.workflow.steps[box.step]?.with[port];
  if (value === undefined) return null;
  // An input left undrawn is listed by the box's tab, not missed.
  if (value.kind === 'wire')
    return seen.drawn.has(`port:${String(box.step)}.${port}`) ||
      seen.unboxed(value.ref) !== null
      ? null
      : `${refWords(value.ref)}, not drawn`;
  if (value.kind === 'literal')
    return value.value instanceof NumberText
      ? `= ${value.value.text}`
      : `= ${JSON.stringify(value.value)}`;
  if (value.kind === 'text') return `= ${JSON.stringify(value.text)}`;
  if (value.kind === 'mapping' || value.kind === 'list') return null;
  return 'a value no port takes';
}

/** What feeds a port with a wire, in words, or "nothing yet" when nothing does. */
function fedBy(
  seen: Seen,
  box: Box,
  port: string,
  side: Side,
  entry: OutputEntry | undefined,
): string | null {
  if (side === 'right' || port === '+') return null;
  if (box.kind === 'outputs')
    return entry?.from === null || entry === undefined
      ? 'nothing yet'
      : refWords(entry.from);
  const value =
    box.step === null ? undefined : seen.workflow.steps[box.step]?.with[port];
  if (value === undefined) return 'nothing yet';
  return value.kind === 'wire' ? refWords(value.ref) : null;
}

function rowView(
  seen: Seen,
  box: Box,
  primitive: PrimitiveInfo | null,
  port: string,
  row: number,
  side: Side,
): RowView {
  const { workflow, pinned, dragging } = seen;
  const decl =
    side === 'left'
      ? primitive?.inputs[port]
      : box.kind === 'step'
        ? primitive?.outputs[port]
        : undefined;
  const target = side === 'left' ? targetAt(box, port) : null;
  const refused =
    dragging !== null && target !== null ? seen.refusal(dragging, target) : null;
  const offered = dragging !== null && target !== null && refused === null;
  const problems =
    side === 'left' && box.step !== null
      ? (pinned.ports.get(`${String(box.step)}.${port}`) ?? [])
      : box.kind === 'input'
        ? (pinned.inputs.get(port) ?? [])
        : box.kind === 'outputs'
          ? (pinned.entries.get(port) ?? [])
          : [];
  const noticed =
    seen.notice !== null && seen.notice.box === box.key && seen.notice.port === port;
  const value = side === 'left' ? shownValue(seen, box, port) : null;
  const input =
    box.kind === 'input'
      ? workflow.inputs.find((found) => found.id === port)
      : undefined;
  const entry =
    box.kind === 'outputs'
      ? workflow.outputs.find((found) => found.name === port)
      : undefined;
  const step = box.step !== null ? workflow.steps[box.step] : undefined;
  const boxed = step !== undefined ? seen.workflowBoxes.get(step.use) : undefined;
  const boxType =
    side === 'left'
      ? boxed?.inputs.find((input) => input.name === port)?.type
      : boxed?.outputs.find((output) => output.name === port)?.type;
  const type =
    decl?.type ??
    boxType ??
    input?.type ??
    (entry !== undefined
      ? outputType(workflow, seen.primitives, entry.from, seen.workflowBoxes)
      : null) ??
    (box.kind === 'file' ? fileType(port) : null);
  const marks = [
    ...(side === 'left' && primitive !== null ? portMarks(primitive, port) : []),
    ...(entry !== undefined ? entryMarks(entry) : []),
  ];
  // A file fits a step's folder port, as a folder of one, as the forge has it.
  const typeSaid =
    side === 'left' && step !== undefined && type === 'folder'
      ? 'file or folder'
      : type;
  const said = [typeSaid, ...marks, value ?? fedBy(seen, box, port, side, entry)]
    .filter((part) => part !== null)
    .join(' · ');
  const isNew = box.kind === 'outputs' && port === '+';
  const output = box.kind === 'step' && side === 'right';
  return {
    port,
    name: entry?.title ?? port,
    side,
    top: rowsTop(box) + row * GEOMETRY.row,
    output,
    firstOutput: output && box.right[0] === port,
    offered,
    refused,
    title: refused ?? problems[0]?.message ?? (isNew ? undefined : `${port} · ${said}`),
    isNew,
    label: isNew || seen.label === null ? null : seen.label(box, port, side),
    optional: decl?.optional === true || input?.optional === true,
    problems,
    said,
    noticed,
  };
}

function headOf(
  seen: Seen,
  box: Box,
  step: Workflow['steps'][number] | undefined,
  primitive: PrimitiveInfo | null,
): HeadView {
  const { workflow } = seen;
  if (box.kind === 'step')
    return {
      title: step?.id || '(no name)',
      pill: box.stacked ? 'workflow' : primitive !== null ? 'primitive' : null,
      what: primitive !== null ? primitiveTitle(primitive) : null,
      ref: step?.use ?? null,
      description:
        primitive !== null
          ? primitive.description
          : step === undefined
            ? null
            : (seen.workflowBoxes.get(step.use)?.description ?? null),
      step: box.step,
    };
  if (box.kind === 'input') {
    const input = workflow.inputs.find((found) => found.id === box.right[0]);
    return {
      title: box.right[0] ?? '',
      pill: 'input',
      what:
        input === undefined
          ? null
          : [typeWords(input.type), input.title]
              .filter((part) => part !== null)
              .join(' · '),
      ref: null,
      description: input?.help ?? readersWords(box.readers),
      step: null,
    };
  }
  if (box.kind === 'file')
    return {
      title: box.right[0] ?? '',
      pill: 'workflow file',
      what: `${typeWords(fileType(box.right[0] ?? ''))} · the same on every run`,
      ref: null,
      description: readersWords(box.readers),
      step: null,
    };
  const entries = workflow.outputs;
  return {
    title: 'Outputs',
    pill: String(entries.length),
    what: 'What each run gives',
    ref: null,
    // Each is written out on its row.
    description: entries.length === 0 ? 'None yet.' : null,
    step: null,
  };
}

/**
 * The inputs and files a box reads that are not drawn: a step's, with the
 * ports each feeds, and the inputs an output gives back.
 */
function fedOf(seen: Seen, box: Box): Fed[] {
  const found = new Map<string, Fed>();
  const add = (ref: Ref, port: string) => {
    const hidden = seen.unboxed(ref);
    if (hidden === null) return;
    const fed = found.get(hidden.key) ?? {
      key: hidden.key,
      kind: hidden.kind,
      name: boxName(hidden, seen.workflow),
      colour: hidden.colour,
      height: hidden.height,
      head: headOf(seen, hidden, undefined, null),
      ports: [],
    };
    if (!fed.ports.includes(port)) fed.ports.push(port);
    found.set(hidden.key, fed);
  };
  const step = box.step === null ? undefined : seen.workflow.steps[box.step];
  for (const [port, value] of Object.entries(step?.with ?? {}))
    for (const ref of refsOf(value)) add(ref, port);
  if (box.kind === 'outputs')
    for (const entry of seen.workflow.outputs)
      if (entry.from?.kind === 'inputs') add(entry.from, entry.name);
  return [...found.values()];
}

function boxData(seen: Seen, box: Box): BoxData {
  const { workflow, dragging } = seen;
  const step = box.step !== null ? workflow.steps[box.step] : undefined;
  // The box a wire is dragged from takes nothing from it.
  const whole =
    box.open || (dragging?.kind === 'steps' && step?.id === dragging.name)
      ? null
      : targetOf(box);
  const primitive = step !== undefined ? declared(seen.primitives, step) : null;
  const left = box.kind === 'outputs' ? [...box.left, '+'] : box.left;
  return {
    key: box.key,
    kind: box.kind,
    name: boxName(box, workflow),
    colour: box.colour,
    selected: seen.selected === box.key,
    open: box.open,
    stacked: box.stacked,
    head: headOf(seen, box, step, primitive),
    warning: seen.warnings.get(box.key) ?? null,
    needs: !box.open && box.needs ? needsWords(box.left, box.right) : null,
    pins: {
      left: box.kind === 'outputs' || box.left.length > 0,
      right: box.right.length > 0,
      single: box.right.length === 1,
    },
    drop:
      dragging === null || whole === null
        ? null
        : { refused: seen.refusal(dragging, whole) },
    rows: box.open
      ? [
          ...left.map((port, row) => rowView(seen, box, primitive, port, row, 'left')),
          ...box.right.map((port) =>
            rowView(seen, box, primitive, port, rowOf(box, 'right', port), 'right'),
          ),
        ]
      : [],
    fed: fedOf(seen, box),
    notice:
      seen.notice !== null && seen.notice.box === box.key
        ? { reason: seen.notice.reason, count: seen.notice.count }
        : null,
  };
}

/**
 * `items`, each one equal to one given last time, by its id, given as that
 * one; the list itself kept when nothing in it changed. What was given is
 * held as state, set while drawing only when it changed, as React allows.
 */
function useKept<T extends { id: string }>(items: T[]): T[] {
  const [last, setLast] = useState(items);
  const before = new Map(last.map((item) => [item.id, item]));
  const kept = items.map((item) => keepEqual(before.get(item.id), item));
  const same =
    kept.length === last.length && kept.every((item, at) => item === last[at]);
  if (!same) setLast(kept);
  return same ? last : kept;
}

/** A problem's mark, read out as its message, with the message beside it. */
function ProblemMark({ problem }: { problem: DefinitionProblem }) {
  return (
    <>
      <span
        className={classes.problem}
        role="note"
        aria-label={problem.message}
        title={problem.message}
      >
        !
      </span>
      <span className={classes.problemBeside} aria-hidden>
        {problem.message}
      </span>
    </>
  );
}

const PortRow = memo(function PortRow({
  box,
  row,
  colour,
}: {
  box: string;
  row: RowView;
  colour: string;
}) {
  const actions = useActions();
  const { port, side, problems } = row;
  const first = problems[0];
  // Nothing is dropped on a version, so its row stays empty.
  if (row.isNew && actions.readOnly) return null;
  return (
    <div
      className={classes.row}
      data-side={side}
      data-output={row.output || undefined}
      data-first-output={row.firstOutput || undefined}
      data-offered={row.offered || undefined}
      data-refused={row.refused !== null || undefined}
      style={{ top: row.top, height: GEOMETRY.row }}
      title={row.title}
    >
      <Handle
        type={side === 'left' ? 'target' : 'source'}
        position={side === 'left' ? Position.Left : Position.Right}
        id={`${side === 'left' ? 'in' : 'out'}:${port}`}
        className={classes.handle}
        style={{ background: colour }}
        isConnectable={!actions.readOnly}
        isConnectableStart={side === 'right'}
        isConnectableEnd={side === 'left'}
      />
      {row.isNew ? (
        <span className={classes.drop}>
          Drop a step’s output here to make it an output
        </span>
      ) : (
        <>
          {!actions.menus ? (
            <span className={classes.port}>{row.name}</span>
          ) : row.label === null ? (
            <span>{row.name}</span>
          ) : (
            <ActionMenu
              text={row.name}
              label={row.label}
              entries={() => actions.entries(box, port, side)}
              className={classes.port}
            />
          )}
          {row.optional && <span className={classes.optional}>(optional)</span>}
          {first !== undefined ? (
            problems.map((problem) => (
              <ProblemMark key={problem.message} problem={problem} />
            ))
          ) : (
            <span className={classes.said}>{row.said}</span>
          )}
        </>
      )}
      {(row.refused !== null || row.noticed) && (
        <span className={classes.refusedMark} aria-hidden>
          ✕
        </span>
      )}
    </div>
  );
});

/** A box's head, a button that selects it: its name and kind, what it is, what it does. */
const Head = memo(function Head({
  box,
  head,
  open,
}: {
  box: string;
  head: HeadView;
  open: boolean;
}) {
  const actions = useActions();
  return (
    <button
      type="button"
      className={`${classes.header} ${classes.headButton} nodrag nopan`}
      aria-expanded={open}
      onClick={() => actions.select(box)}
    >
      <span className={classes.titleLine}>
        <span className={classes.title}>{head.title}</span>
        {head.pill !== null && <span className={classes.pill}>{head.pill}</span>}
      </span>
      {(head.what !== null || head.ref !== null) && (
        <span className={classes.primitiveLine}>
          {head.what !== null && (
            <span className={classes.primitiveTitle}>{head.what}</span>
          )}
          {head.ref !== null && <span className={classes.ref}>{head.ref}</span>}
        </span>
      )}
      {head.description !== null && head.description !== '' && (
        <span className={classes.description} title={head.description}>
          {head.description}
        </span>
      )}
    </button>
  );
});

/**
 * The line under a box's head: what is wrong with it, or that a newer
 * version is out. A problem pinned to a row is said at that row while the
 * box is open, so the line then only shows it.
 */
function WarningLine({ warning, rows }: { warning: Warning; rows: RowView[] }) {
  const repeated =
    warning.kind === 'problem' &&
    rows.some((row) => row.problems.includes(warning.problem));
  return (
    <p
      className={`${classes.line} ${classes.headProblem}`}
      aria-hidden={repeated || undefined}
    >
      {warning.kind === 'problem' ? (
        <ProblemMark problem={warning.problem} />
      ) : (
        `${warning.version} is out`
      )}
    </p>
  );
}

/**
 * A closed box's pin on one side, where every wire to or from it meets it.
 * On the left it takes a wire, as the box does; on the right, a box with
 * one output gives a wire from it. One with several starts nothing, so a
 * click there is a click on the box, which opens it to choose which.
 */
function Pin({ side, colour, live }: { side: Side; colour: string; live: boolean }) {
  return (
    <Handle
      type={side === 'left' ? 'target' : 'source'}
      position={side === 'left' ? Position.Left : Position.Right}
      id={`${side === 'left' ? 'in' : 'out'}:*`}
      className={classes.pin}
      style={{ top: BOX.pin, background: colour }}
      isConnectable={live}
      isConnectableStart={live && side === 'right'}
      isConnectableEnd={live && side === 'left'}
    />
  );
}

/** How many inputs `count` is, in words. */
function inputsWords(count: number): string {
  return count === 1 ? '1 input' : `${String(count)} inputs`;
}

/** Between two boxes a tab pops out, and round them on its card. */
const PEEK_SPACE = 12;
/** How far down a box's face its pin stands, from the top of its room. */
const PIN_AT = BOX.stack + BOX.border + BOX.pin;

/**
 * The tab on a box's left that stands for the inputs and files it reads
 * while they are not drawn: how many, and, hovered or clicked, their boxes
 * as the graph draws them, each wired to the tab with the ports it feeds. A
 * box's head opens its drawer, as on the graph. With no room on the left,
 * they pop out on the right, wired back to the tab.
 */
function FedTab({ fed, box }: { fed: Fed[]; box: string }) {
  const tops = fed.map((_, at) =>
    fed.slice(0, at).reduce((sum, each) => sum + each.height + PEEK_SPACE, 0),
  );
  const height =
    fed.reduce((sum, each) => sum + each.height, 0) + PEEK_SPACE * (fed.length - 1);
  const end = height / 2;
  return (
    <Popout
      label={`${inputsWords(fed.length)} of ${box}`}
      className={`${classes.fedTab} nodrag nopan`}
      style={{
        background: fed.some((each) => each.kind === 'input')
          ? PALETTE.input
          : PALETTE.file,
      }}
      button={inputsWords(fed.length)}
      position="left"
      width="max-content"
      bare
    >
      {(close, placed) => {
        const right = placed.startsWith('right');
        // The tab's end of each wire, and its box's.
        const [tab, pin] = right ? [0, BOX.gap] : [BOX.gap, 0];
        const mid = BOX.gap / 2;
        return (
          // Out of the graph's frame, it takes the boxes' sizes itself.
          <div
            className={classes.peek}
            data-side={right ? 'right' : 'left'}
            style={{
              ...BOX_PROPERTIES,
              height,
              padding: right
                ? `${String(PEEK_SPACE)}px ${String(PEEK_SPACE)}px ${String(PEEK_SPACE)}px 0`
                : `${String(PEEK_SPACE)}px 0 ${String(PEEK_SPACE)}px ${String(PEEK_SPACE)}px`,
            }}
          >
            <div className={classes.peekBoxes}>
              {fed.map((each) => (
                <div
                  key={each.key}
                  style={{ height: each.height }}
                  onClickCapture={close}
                >
                  <div
                    className={classes.box}
                    data-kind={each.kind}
                    style={{ borderColor: each.colour }}
                    role="group"
                    aria-label={each.name}
                  >
                    <Head box={each.key} head={each.head} open={false} />
                  </div>
                </div>
              ))}
            </div>
            <svg
              width={BOX.gap}
              height={height}
              className={classes.peekWires}
              aria-hidden
            >
              {fed.map((each, at) => {
                const y = (tops[at] ?? 0) + PIN_AT;
                return (
                  <g key={each.key}>
                    <path
                      d={`M ${String(pin)} ${String(y)} C ${String(mid)} ${String(y)}, ${String(mid)} ${String(end)}, ${String(tab)} ${String(end)}`}
                      stroke={each.colour}
                      strokeWidth={2}
                      fill="none"
                    />
                    <circle cx={pin} cy={y} r={4} fill={each.colour} />
                    <text
                      x={right ? pin - 8 : pin + 8}
                      y={y - 6}
                      textAnchor={right ? 'end' : 'start'}
                      className={classes.peekLabel}
                    >
                      {each.ports.join(', ')}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        );
      }}
    </Popout>
  );
}

const BoxView = memo(function BoxView({ data }: NodeProps<BoxNode>) {
  const actions = useActions();
  const { head } = data;
  return (
    <>
      {data.stacked && (
        <>
          <span
            className={classes.ear}
            style={{ top: 0, left: 16, right: 16, borderColor: data.colour }}
            aria-hidden
          />
          <span
            className={classes.ear}
            style={{ top: 6, left: 8, right: 8, borderColor: data.colour }}
            aria-hidden
          />
        </>
      )}
      <div
        className={classes.box}
        data-kind={data.kind}
        data-open={data.open || undefined}
        data-selected={data.selected || undefined}
        data-drop={
          data.drop === null
            ? undefined
            : data.drop.refused === null
              ? 'offered'
              : 'refused'
        }
        title={data.drop?.refused ?? undefined}
        style={{ borderColor: data.colour }}
        role="group"
        aria-label={data.name}
      >
        <Head box={data.key} head={head} open={data.open} />
        {data.fed.length > 0 && <FedTab fed={data.fed} box={data.name} />}
        {data.warning !== null && (
          <WarningLine warning={data.warning} rows={data.rows} />
        )}
        {data.needs !== null && (
          <p className={`${classes.line} ${classes.detail}`}>{data.needs}</p>
        )}
        {!data.open && data.pins.left && (
          <Pin side="left" colour={data.colour} live={!actions.readOnly} />
        )}
        {!data.open && data.pins.right && (
          <Pin
            side="right"
            colour={data.colour}
            live={!actions.readOnly && data.pins.single}
          />
        )}
        {data.rows.map((row) => (
          <PortRow
            key={`${row.side === 'left' ? 'in' : 'out'} ${row.port}`}
            box={data.key}
            row={row}
            colour={data.colour}
          />
        ))}
        {data.stacked && (
          <button
            type="button"
            className={`${classes.foot} nodrag nopan`}
            aria-label={`Open ${head.title}`}
            onClick={() => {
              if (head.step !== null) actions.openBox(head.step);
            }}
          >
            Open ›
          </button>
        )}
        {data.notice !== null && (
          // Over the box's own title, which holds no port, growing upwards when
          // it is longer, so it covers no port; the refused port keeps its ✕.
          <p
            key={data.notice.count}
            className={classes.notice}
            role="alert"
            style={{
              bottom: `calc(100% - ${String(BOX.head)}px)`,
              minHeight: BOX.head,
              animationDuration: `${String(NOTICE_MS)}ms`,
            }}
          >
            {data.notice.reason}
          </p>
        )}
      </div>
    </>
  );
});

const SlotView = memo(function SlotView({ data }: NodeProps<SlotNode>) {
  return (
    <div className={classes.slot} style={{ color: data.colour }}>
      {data.label !== null && <span className={classes.slotLabel}>{data.label}</span>}
    </div>
  );
});

const WireView = memo(function WireView({ data }: EdgeProps<WireEdge>) {
  if (data === undefined) return null;
  return (
    <BaseEdge
      path={wirePath(data.points)}
      style={{
        stroke: data.colour,
        strokeWidth: data.marked ? 3 : 2,
        opacity: data.dimmed ? 0.2 : 1,
      }}
    />
  );
});

const NODE_TYPES = { box: BoxView, slot: SlotView };
const EDGE_TYPES = { wire: WireView };

/** Space around the graph inside its frame, room for the handles. */
const PAD = 32;

const VIEWPORT = { x: PAD, y: PAD, zoom: 1 };
const PRO_OPTIONS = { hideAttribution: true };
const ANY_CONNECTION = () => true;
// React Flow draws a wire's lift handle only when given this; a lifted wire
// is moved when it is dropped, in `onReconnectEnd`, which hears of a drop on
// nothing too.
const NO_RECONNECT = () => undefined;

/** A box asked to be scrolled into view; `nonce` asks again for the same box. */
export type Reveal = { key: string; nonce: number };

/**
 * Bring the box `reveal` names into view, only as far as it is not in view
 * already: sideways inside the graph's own frame when it is cut off at the
 * frame's left or would sit under `cover` pixels a drawer hides on the
 * right, and up or down the page when its head is not in the window below
 * the workflow's bar. Each reveal is done once, so an edit made while a box
 * is selected never moves the graph back to it.
 */
function useReveal(
  frame: RefObject<HTMLDivElement | null>,
  layout: Layout,
  reveal: Reveal | null,
  cover: number,
) {
  const done = useRef<Reveal | null>(null);
  useEffect(() => {
    const scroller = frame.current;
    if (reveal === null || scroller === null || done.current === reveal) return;
    const box = layout.boxes.find((found) => found.key === reveal.key);
    // A box not laid out yet is revealed once it is.
    if (box === undefined) return;
    done.current = reveal;
    const rect = scroller.getBoundingClientRect();
    const width = document.documentElement.clientWidth || window.innerWidth;
    const hidden = Math.max(0, rect.right - (width - cover));
    const seen = scroller.clientWidth - hidden;
    const left = PAD + box.x;
    const right = left + box.width;
    const from = scroller.scrollLeft;
    let to = from;
    if (right > from + seen) to = right + 16 - seen;
    if (left < to) to = left - 16;
    if (to !== from) scroller.scrollTo?.({ left: Math.max(0, to) });
    // React Flow draws a box it has just been given a frame or two later, and
    // the frame grows to hold it then, so up or down the page waits for that.
    const selector = `.react-flow__node[data-id="${CSS.escape(box.key)}"]`;
    let tries = 0;
    let waiting = 0;
    let finished = false;
    const down = () => {
      const node = scroller.querySelector<HTMLElement>(selector);
      const drawn =
        node !== null &&
        scroller.getBoundingClientRect().bottom >= node.getBoundingClientRect().bottom;
      if (node !== null && (drawn || tries >= 30)) {
        finished = true;
        const bar = document.querySelector('[data-workflow-bar]');
        const top = bar === null ? 0 : Math.max(0, bar.getBoundingClientRect().bottom);
        const at = node.getBoundingClientRect();
        // A box whose head is in view stays where it is, though opening it
        // runs it past the window's foot.
        if (at.top >= top && at.top + BOX.head <= window.innerHeight) return;
        // Clear of the bar, which stays over the page's top as it scrolls.
        node.style.scrollMarginTop = `${String(top + 8)}px`;
        node.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
        return;
      }
      tries += 1;
      if (tries <= 30) waiting = requestAnimationFrame(down);
      else finished = true;
    };
    down();
    return () => {
      cancelAnimationFrame(waiting);
      // Stopped before the page was scrolled, the next run does it.
      if (!finished) done.current = null;
    };
  }, [frame, layout, reveal, cover]);
}

/**
 * Which sides of the graph's frame have more of the graph past them, kept
 * up to date as it slides, as it changes size and as the graph does, so an
 * edge with more beyond it can say so.
 */
function useMoreSideways(frame: RefObject<HTMLDivElement | null>) {
  const [more, setMore] = useState({ left: false, right: false });
  useEffect(() => {
    const element = frame.current;
    if (element === null) return undefined;
    const measure = () => {
      const left = element.scrollLeft > 1;
      const right = element.scrollLeft + element.clientWidth < element.scrollWidth - 1;
      setMore((before) =>
        before.left === left && before.right === right ? before : { left, right },
      );
    };
    element.addEventListener('scroll', measure, { passive: true });
    // It tells of each size it watches as it starts, and the graph's size
    // moves with the graph, which the frame's first child holds.
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(element);
    if (element.firstElementChild !== null)
      observer?.observe(element.firstElementChild);
    return () => {
      element.removeEventListener('scroll', measure);
      observer?.disconnect();
    };
  }, [frame]);
  return more;
}

/**
 * The graph at its actual size, never scaled: as tall as its tallest column,
 * so the page scrolls down it, and as wide as its columns, sliding sideways
 * inside its frame with a scrollbar, Shift and the wheel, or a trackpad's
 * sideways swipe, its edge shaded on a side with more of the graph past it.
 * The wheel alone scrolls the page, as anywhere else, since a graph that
 * took it would trap the page under it. React Flow only draws
 * and drags here: its viewport is fixed, with no zoom and no pan of its own.
 * `reveal` scrolls a box into view, clear of `cover` pixels a drawer hides
 * on the right, where the graph keeps that much room past its last column.
 * Each port is a menu when `label` and `entries` are given, built only when
 * it opens; without them, each port is only its name.
 */
const NO_WORKFLOW_BOXES = new Map<string, BoxDecl>();
const NO_WARNINGS = new Map<string, Warning>();

export function Graph({
  layout,
  workflow,
  primitives,
  pinned,
  selected,
  readOnly,
  dragging,
  notice,
  refusal,
  label,
  entries,
  onSelect,
  onDragStart,
  onDrop,
  onLift,
  reveal = null,
  cover = 0,
  workflowBoxes = NO_WORKFLOW_BOXES,
  warnings = NO_WARNINGS,
  onOpenBox,
}: {
  layout: Layout;
  workflow: Workflow;
  primitives: Map<string, PrimitiveInfo>;
  pinned: Pinned;
  selected: string | null;
  readOnly: boolean;
  dragging: Ref | null;
  notice: Notice | null;
  refusal: (source: Ref, target: Target) => string | null;
  label?: (box: Box, port: string, side: Side) => string | null;
  entries?: (box: Box, port: string, side: Side) => MenuEntry[];
  onSelect: (key: string | null) => void;
  onDragStart: (source: Ref | null) => void;
  onDrop: (source: Ref, target: Target, box: string, port: string) => void;
  /**
   * A wire's end lifted off the step port `from` and dropped on `target`, or
   * on nothing; without it, no wire can be lifted.
   */
  onLift?: (
    source: Ref,
    from: { step: number; port: string },
    drop: Drop | null,
  ) => void;
  reveal?: Reveal | null;
  cover?: number;
  workflowBoxes?: ReadonlyMap<string, BoxDecl>;
  /** The line under each box's head, which `layout` left room for. */
  warnings?: ReadonlyMap<string, Warning>;
  onOpenBox?: (index: number) => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  useReveal(frame, layout, reveal, cover);
  const more = useMoreSideways(frame);
  const boxes = useMemo(
    () => new Map(layout.boxes.map((box) => [box.key, box])),
    [layout],
  );
  const drawn = useMemo(
    () => new Set(layout.wires.map((wire) => wire.target)),
    [layout],
  );
  const unboxed = useMemo(() => {
    const hidden = new Map(layout.hidden.map((box) => [box.key, box]));
    return (ref: Ref): Box | null =>
      (ref.kind === 'inputs'
        ? hidden.get(`input:${ref.name}`)
        : ref.kind === 'workflow'
          ? hidden.get(`file:${ref.name}`)
          : undefined) ?? null;
  }, [layout]);
  const menus = label !== undefined && entries !== undefined;
  const lifts = !readOnly && onLift !== undefined;
  // A wire's end is lifted off an open step's port, where it is the port's
  // whole value: lifting one of the values a mapping or list holds would take
  // the others with it, and a closed box's wires all end on its one pin.
  const liftable = (key: string, port: string) => {
    const box = boxes.get(key);
    return (
      box?.open === true &&
      box.step !== null &&
      workflow.steps[box.step]?.with[port]?.kind === 'wire'
    );
  };
  const wires = useMemo(
    () => new Map(layout.wires.map((wire) => [wire.key, wire])),
    [layout],
  );

  // Worked out on every draw, and kept where equal to the last, so React Flow
  // and the boxes see a change only in the boxes and wires it touches.
  const seen: Seen = {
    workflow,
    primitives,
    pinned,
    selected,
    dragging,
    refusal,
    notice,
    label: menus ? label : null,
    drawn,
    unboxed,
    workflowBoxes,
    warnings,
  };
  const found: (BoxNode | SlotNode)[] = [];
  for (const box of layout.boxes)
    found.push({
      id: box.key,
      type: 'box',
      position: { x: box.x, y: box.y },
      width: box.width,
      height: box.height,
      data: boxData(seen, box),
      draggable: false,
      className: `nopan ${classes.node}`,
      // Above its neighbours while it says why a wire was refused.
      ...(seen.notice?.box === box.key && { zIndex: 10 }),
    });
  for (const slot of layout.slots)
    found.push({
      id: slot.key,
      type: 'slot',
      position: { x: slot.x, y: slot.y },
      width: slot.width,
      height: slot.height,
      data: { label: slot.label, colour: slot.colour },
      draggable: false,
      selectable: false,
      connectable: false,
    });
  const nodes = useKept(found);
  // An input picked from a step's tab is not drawn, so no wire is its own.
  const drawnSelected = selected !== null && boxes.has(selected) ? selected : null;
  const edges = useKept(
    layout.wires.map((wire): WireEdge => {
      const marked =
        drawnSelected !== null &&
        (wire.from.box === drawnSelected || wire.to.box === drawnSelected);
      return {
        id: wire.key,
        type: 'wire',
        source: wire.from.box,
        sourceHandle: boxes.get(wire.from.box)?.open
          ? `out:${wire.from.port}`
          : 'out:*',
        target: wire.to.box,
        targetHandle: boxes.get(wire.to.box)?.open ? `in:${wire.to.port}` : 'in:*',
        reconnectable: lifts && liftable(wire.to.box, wire.to.port) ? 'target' : false,
        selectable: false,
        data: {
          points: wire.points,
          colour: wire.colour,
          marked,
          dimmed: drawnSelected !== null && !marked,
        },
      };
    }),
  );

  // What the parts do reads the graph as it was last drawn, so the parts
  // need not be drawn again when only a handler changed.
  const latest = useRef({
    boxes,
    wires,
    workflow,
    selected,
    entries,
    onSelect,
    onDragStart,
    onDrop,
    onLift,
    onOpenBox,
  });
  useLayoutEffect(() => {
    latest.current = {
      boxes,
      wires,
      workflow,
      selected,
      entries,
      onSelect,
      onDragStart,
      onDrop,
      onLift,
      onOpenBox,
    };
  });
  const select = useCallback((key: string) => {
    const { selected: now, onSelect: tell } = latest.current;
    tell(key === now ? null : key);
  }, []);
  const actions = useMemo<Actions>(
    () => ({
      readOnly,
      menus,
      select,
      entries: (key, port, side) => {
        const { boxes: now, entries: build } = latest.current;
        const box = now.get(key);
        return box !== undefined && build !== undefined ? build(box, port, side) : [];
      },
      openBox: (index) => latest.current.onOpenBox?.(index),
    }),
    [readOnly, menus, select],
  );

  const ends = useCallback(
    (
      nodeId: string | null | undefined,
      handleId: string | null | undefined,
    ): { box: Box; port: string } | null => {
      const box = nodeId ? latest.current.boxes.get(nodeId) : undefined;
      if (box === undefined || !handleId) return null;
      const port = handleId.slice(handleId.indexOf(':') + 1);
      // A closed box's pin stands for its one output.
      if (port === '*')
        return handleId.startsWith('out:') && box.right.length === 1
          ? { box, port: box.right[0] ?? '' }
          : null;
      return { box, port };
    },
    [],
  );
  const onPaneClick = useCallback(() => latest.current.onSelect(null), []);
  const onNodeClick = useCallback<NodeMouseHandler>(
    (event, node) => {
      const inside = (event.target as HTMLElement).closest('button, [role="menu"]');
      if (inside === null && latest.current.boxes.has(node.id)) select(node.id);
    },
    [select],
  );
  // The wire whose end is lifted, from its reconnect's start to its end,
  // when React Flow tells the connect handlers too.
  const lifting = useRef<{ source: Ref; step: number; port: string } | null>(null);
  const onConnectStart = useCallback<OnConnectStart>(
    (_, params) => {
      const from = ends(params.nodeId, params.handleId);
      latest.current.onDragStart(
        lifting.current?.source ??
          (from !== null && params.handleType === 'source'
            ? sourceAt(from.box, from.port, latest.current.workflow)
            : null),
      );
    },
    [ends],
  );
  /**
   * Where a wire dragged from the box `from` was dropped: a port's handle, a
   * closed box's pin or the closed box itself, with the box and port to say
   * a refusal at; `'box'` for a box that takes nothing so; null for nothing.
   */
  const dropOf = useCallback(
    (
      event: MouseEvent | TouchEvent,
      state: FinalConnectionState,
      from: string,
    ): Drop | 'box' | null => {
      const { boxes: now } = latest.current;
      const handle = state.toHandle;
      if (handle?.type === 'target' && handle.id) {
        const box = now.get(handle.nodeId);
        const port = handle.id.slice(handle.id.indexOf(':') + 1);
        const target =
          box === undefined || box.key === from
            ? null
            : port === '*'
              ? targetOf(box)
              : targetAt(box, port);
        return target === null ? 'box' : { target, box: handle.nodeId, port };
      }
      const point = 'changedTouches' in event ? event.changedTouches[0] : event;
      const id =
        point === undefined
          ? undefined
          : document
              .elementFromPoint(point.clientX, point.clientY)
              ?.closest<HTMLElement>('.react-flow__node[data-id]')?.dataset.id;
      const box = id === undefined ? undefined : now.get(id);
      if (box === undefined) return null;
      const target = box.open || box.key === from ? null : targetOf(box);
      return target === null ? 'box' : { target, box: box.key, port: '*' };
    },
    [],
  );
  const onConnectEnd = useCallback<OnConnectEnd>(
    (event, state: FinalConnectionState) => {
      const { onDragStart: tell, onDrop: drop, workflow: now } = latest.current;
      tell(null);
      if (lifting.current !== null || state.fromHandle === null) return;
      const from = ends(state.fromHandle.nodeId, state.fromHandle.id);
      if (from === null) return;
      const source = sourceAt(from.box, from.port, now);
      const to = dropOf(event, state, from.box.key);
      if (source !== null && to !== null && to !== 'box')
        drop(source, to.target, to.box, to.port);
    },
    [ends, dropOf],
  );
  const onReconnectStart = useCallback((_: unknown, edge: Edge) => {
    const { boxes: now, wires: drawn, workflow: doc } = latest.current;
    const wire = drawn.get(edge.id);
    const from = wire === undefined ? undefined : now.get(wire.from.box);
    const to = wire === undefined ? undefined : now.get(wire.to.box);
    const source =
      wire === undefined || from === undefined
        ? null
        : sourceAt(from, wire.from.port, doc);
    lifting.current =
      source !== null && wire !== undefined && to?.step != null
        ? { source, step: to.step, port: wire.to.port }
        : null;
  }, []);
  const onReconnectEnd = useCallback(
    (
      event: MouseEvent | TouchEvent,
      edge: Edge,
      _: unknown,
      state: FinalConnectionState,
    ) => {
      const lifted = lifting.current;
      lifting.current = null;
      if (lifted === null) return;
      const to = dropOf(event, state, edge.source);
      if (to !== 'box')
        latest.current.onLift?.(
          lifted.source,
          { step: lifted.step, port: lifted.port },
          to,
        );
    },
    [dropOf],
  );

  return (
    <ActionsContext value={actions}>
      <ReactFlowProvider>
        <div
          className={classes.frameEdges}
          data-more-left={more.left ? '' : undefined}
          data-more-right={more.right ? '' : undefined}
        >
          <div className={classes.frame} ref={frame} style={BOX_PROPERTIES}>
            <div
              className={classes.canvas}
              style={{
                width: layout.width + 2 * PAD + cover,
                height: layout.height + 2 * PAD,
              }}
            >
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={NODE_TYPES}
                edgeTypes={EDGE_TYPES}
                nodesDraggable={false}
                nodesConnectable={!readOnly}
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
                autoPanOnConnect={false}
                autoPanOnNodeFocus={false}
                proOptions={PRO_OPTIONS}
                isValidConnection={ANY_CONNECTION}
                onPaneClick={onPaneClick}
                onNodeClick={onNodeClick}
                onConnectStart={onConnectStart}
                onConnectEnd={onConnectEnd}
                onReconnect={lifts ? NO_RECONNECT : undefined}
                onReconnectStart={onReconnectStart}
                onReconnectEnd={onReconnectEnd}
              />
            </div>
          </div>
        </div>
      </ReactFlowProvider>
    </ActionsContext>
  );
}
