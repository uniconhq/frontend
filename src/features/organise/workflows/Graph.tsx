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
import {
  GEOMETRY,
  columnX,
  headerOf,
  rowOf,
  wirePath,
  type Box,
  type Layout,
  type Point,
} from './layout';
import type { BoxDecl } from './boxes';
import { sourceAt, targetAt, type Notice, type Target } from './ends';
import { NOTICE_MS } from './notice';
import { NumberText } from '../forms/yaml-doc';
import { type Ref, type Workflow } from './model';
import type { Pinned } from './pins';
import { declared, type PrimitiveInfo } from './primitives';
import {
  boxName,
  entryMarks,
  portMarks,
  primitiveTitle,
  readersWords,
  refWords,
  BAND_LABEL,
  runsWords,
} from './words';
import classes from './workflows.module.css';

/**
 * The workflow drawn as boxes and wires. React Flow draws them and handles
 * the drags; where everything stands is `layout`'s, worked out from the file,
 * so React Flow places nothing and no node can be dragged. A wire is drawn by
 * dragging from a source's handle to a port's; while one is dragged, each
 * port says whether it would take it, and one that would not says why, at
 * the port, when the wire is dropped there. Every port is also a button
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
  /** What the row reads as: a report entry by its title, its key only where it has none (M58). */
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
  /** The report's row for an entry not made yet, which a wire is dropped on. */
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

/** What the head of a box shows. */
type HeadView =
  | {
      kind: 'step';
      name: string;
      /** The step's place in `steps:`, so Open can name it. */
      step: number | null;
      runs: string;
      primitive: string | null;
      use: string;
      description: string | null | undefined;
      problems: DefinitionProblem[];
      /** A run workflow, which Open shows. */
      openable: boolean;
      /** A later version of that workflow, when there is one. */
      newer: string | null;
    }
  | { kind: 'group'; name: string; detail: string };

/** What a box shows. */
type BoxData = {
  key: string;
  kind: Box['kind'];
  name: string;
  colour: string | undefined;
  selected: boolean;
  dimmed: boolean;
  header: number;
  head: HeadView;
  rows: RowView[];
  /** Why the wire last dropped on one of its ports was refused, while that shows. */
  notice: { reason: string; count: number } | null;
};

type BoxNode = Node<BoxData, 'box'>;
type SlotNode = Node<{ label: string | null; colour: string | undefined }, 'slot'>;
type BandNode = Node<Record<string, never>, 'band'>;
type WireEdge = Edge<
  { points: Point[]; colour: string | undefined; marked: boolean; dimmed: boolean },
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
  colours: string[];
  selected: string | null;
  dragging: Ref | null;
  refusal: (source: Ref, target: Target) => string | null;
  notice: Notice | null;
  label: ((box: Box, port: string, side: Side) => string | null) | null;
  /** The ports a drawn wire feeds, `port:<step>.<port>`. */
  drawn: Set<string>;
  /** Run workflows the steps use, by `owner/name@version`. */
  workflowBoxes: ReadonlyMap<string, BoxDecl>;
};

/**
 * What a port without a drawn wire is given, as the port shows it: a value,
 * text with values written in, or a wire the layout cannot draw, such as a
 * once step reading a per-test one, which the file holds all the same.
 */
function shownValue(
  workflow: Workflow,
  box: Box,
  port: string,
  drawn: Set<string>,
): string | null {
  if (box.step === null) return null;
  const value = workflow.steps[box.step]?.with[port];
  if (value === undefined) return null;
  if (value.kind === 'wire')
    return drawn.has(`port:${String(box.step)}.${port}`)
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
      : box.kind === 'inputs'
        ? (pinned.inputs.get(port) ?? [])
        : box.kind === 'test'
          ? (pinned.fields.get(port) ?? [])
          : box.kind === 'report'
            ? (pinned.entries.get(port) ?? [])
            : [];
  const noticed =
    seen.notice !== null && seen.notice.box === box.key && seen.notice.port === port;
  const value = side === 'left' ? shownValue(workflow, box, port, seen.drawn) : null;
  const input =
    box.kind === 'inputs'
      ? workflow.inputs.find((found) => found.id === port)
      : undefined;
  const field =
    box.kind === 'test'
      ? workflow.test.find((found) => found.name === port)
      : undefined;
  const entry =
    box.kind === 'report'
      ? workflow.report.find((found) => found.name === port)
      : undefined;
  const step = box.step !== null ? workflow.steps[box.step] : undefined;
  const boxed = step !== undefined ? seen.workflowBoxes.get(step.use) : undefined;
  const boxType =
    side === 'left'
      ? boxed?.inputs.find((input) => input.name === port)?.type
      : boxed?.outputs.find((output) => output.name === port)?.type;
  const type = decl?.type ?? boxType ?? input?.type ?? field?.type ?? null;
  const marks = [
    ...(side === 'left' && primitive !== null ? portMarks(primitive, port) : []),
    ...(entry !== undefined ? entryMarks(entry) : []),
  ];
  const said = [type, ...marks, value].filter((part) => part !== null).join(' · ');
  const isNew = box.kind === 'report' && port === '+';
  const output = box.kind === 'step' && side === 'right';
  return {
    port,
    name: entry?.title ?? port,
    side,
    top: headerOf(box.kind) + row * GEOMETRY.row,
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

function boxedRun(seen: Seen, use: string | undefined): boolean {
  return use !== undefined && seen.workflowBoxes.get(use)?.run === true;
}

function boxData(seen: Seen, box: Box): BoxData {
  const { workflow } = seen;
  const step = box.step !== null ? workflow.steps[box.step] : undefined;
  const primitive = step !== undefined ? declared(seen.primitives, step.use) : null;
  const name = boxName(box, workflow);
  const left = box.kind === 'report' ? [...box.left, '+'] : box.left;
  return {
    key: box.key,
    kind: box.kind,
    name,
    colour: seen.colours[box.colour],
    selected: seen.selected === box.key,
    dimmed: seen.selected !== null && seen.selected !== box.key,
    header: headerOf(box.kind),
    head:
      box.kind === 'step'
        ? {
            kind: 'step',
            name: step?.id || '(no name)',
            step: box.step,
            runs: runsWords(false),
            primitive: primitive !== null ? primitiveTitle(primitive) : null,
            use: step?.use ?? '',
            description: primitive?.description,
            problems: box.step !== null ? (seen.pinned.steps.get(box.step) ?? []) : [],
            openable: primitive === null && boxedRun(seen, step?.use),
            newer: step === undefined ? null : (seen.workflowBoxes.get(step.use)?.newer ?? null),
          }
        : {
            kind: 'group',
            name,
            detail:
              box.kind === 'report'
                ? 'What each run gives'
                : readersWords(box.readers),
          },
    rows: [
      ...left.map((port, row) => rowView(seen, box, primitive, port, row, 'left')),
      ...box.right.map((port) =>
        rowView(seen, box, primitive, port, rowOf(box, 'right', port), 'right'),
      ),
    ],
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

const PortRow = memo(function PortRow({ box, row }: { box: string; row: RowView }) {
  const actions = useActions();
  const { port, side, problems } = row;
  const first = problems[0];
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
        isConnectable={!actions.readOnly}
        isConnectableStart={side === 'right'}
        isConnectableEnd={side === 'left'}
      />
      {row.isNew ? (
        <span className={classes.drop}>
          {actions.readOnly ? '' : 'Drop an output here to report it'}
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

/** The head of a step's box: its name and how often it runs, its primitive, what that does. */
const StepHead = memo(function StepHead({
  box,
  head,
}: {
  box: string;
  head: Extract<HeadView, { kind: 'step' }>;
}) {
  const actions = useActions();
  return (
    <>
      <button
        type="button"
        className={`${classes.headButton} nodrag nopan`}
        onClick={() => actions.select(box)}
      >
        <span className={classes.titleLine}>
          <span className={classes.title}>{head.name}</span>
          <span className={classes.runs}>{head.runs}</span>
        </span>
        <span className={classes.primitiveLine}>
          {head.primitive !== null && (
            <span className={classes.primitiveTitle}>{head.primitive}</span>
          )}
          <span className={classes.ref}>{head.use}</span>
        </span>
      </button>
      {head.openable && (
        <button
          type="button"
          className={`${classes.headButton} nodrag nopan`}
          aria-label={`Open ${head.name}`}
          onClick={() => {
            if (head.step !== null) actions.openBox(head.step);
          }}
        >
          Open
        </button>
      )}
      {head.newer !== null && (
        <p className={classes.description}>A newer version is {head.newer}</p>
      )}
      {head.problems.length > 0 ? (
        <p className={classes.headProblem}>
          {head.problems.map((problem) => (
            <ProblemMark key={problem.message} problem={problem} />
          ))}
        </p>
      ) : (
        head.description && (
          <p className={classes.description} title={head.description}>
            {head.description}
          </p>
        )
      )}
    </>
  );
});

const GroupHead = memo(function GroupHead({
  box,
  head,
}: {
  box: string;
  head: Extract<HeadView, { kind: 'group' }>;
}) {
  const actions = useActions();
  return (
    <button
      type="button"
      className={`${classes.headButton} nodrag nopan`}
      onClick={() => actions.select(box)}
    >
      <span className={classes.title}>{head.name}</span>
      <span className={classes.detail}>{head.detail}</span>
    </button>
  );
});

const BoxView = memo(function BoxView({ data }: NodeProps<BoxNode>) {
  return (
    <div
      className={classes.box}
      data-kind={data.kind}
      data-selected={data.selected || undefined}
      data-dimmed={data.dimmed || undefined}
      style={{ borderColor: data.colour }}
      role="group"
      aria-label={data.name}
    >
      <div className={classes.header} style={{ height: data.header }}>
        {data.head.kind === 'step' ? (
          <StepHead box={data.key} head={data.head} />
        ) : (
          <GroupHead box={data.key} head={data.head} />
        )}
      </div>
      {data.rows.map((row) => (
        <PortRow
          key={`${row.side === 'left' ? 'in' : 'out'} ${row.port}`}
          box={data.key}
          row={row}
        />
      ))}
      {data.notice !== null && (
        // Over the box's own title, which holds no port, growing upwards when
        // it is longer, so it covers no port; the refused port keeps its ✕.
        <p
          key={data.notice.count}
          className={classes.notice}
          role="alert"
          style={{
            bottom: `calc(100% - ${String(data.header)}px)`,
            minHeight: data.header,
            animationDuration: `${String(NOTICE_MS)}ms`,
          }}
        >
          {data.notice.reason}
        </p>
      )}
    </div>
  );
});

const SlotView = memo(function SlotView({ data }: NodeProps<SlotNode>) {
  return (
    <div className={classes.slot} style={{ color: data.colour }}>
      {data.label !== null && <span className={classes.slotLabel}>{data.label}</span>}
    </div>
  );
});

/**
 * The shaded band behind the steps that run for each test and the test's
 * files, labelled at its top so it says what it is (M55).
 */
function BandView() {
  return (
    <div className={classes.band}>
      <span className={classes.bandLabel}>{BAND_LABEL}</span>
    </div>
  );
}

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

const NODE_TYPES = { box: BoxView, slot: SlotView, band: BandView };
const EDGE_TYPES = { wire: WireView };

/** Space around the graph inside its frame, room for the band and the handles. */
const PAD = 32;

const VIEWPORT = { x: PAD, y: PAD, zoom: 1 };
const PRO_OPTIONS = { hideAttribution: true };
const ANY_CONNECTION = () => true;

/** A box asked to be scrolled into view; `nonce` asks again for the same box. */
export type Reveal = { key: string; nonce: number };

/**
 * Scroll the box `reveal` names into view: sideways inside the graph's own
 * frame, clear of `cover` pixels of it hidden under a drawer on the right,
 * and up or down in the page.
 */
function useReveal(
  frame: RefObject<HTMLDivElement | null>,
  layout: Layout,
  reveal: Reveal | null,
  cover: number,
) {
  useEffect(() => {
    const scroller = frame.current;
    if (reveal === null || scroller === null) return;
    const box = layout.boxes.find((found) => found.key === reveal.key);
    if (box === undefined) return;
    const rect = scroller.getBoundingClientRect();
    const hidden = Math.max(0, rect.right - (window.innerWidth - cover));
    const seen = scroller.clientWidth - hidden;
    const left = PAD + box.x - 16;
    const right = PAD + box.x + box.width + 16;
    let to = scroller.scrollLeft;
    if (right > to + seen) to = right - seen;
    if (left < to) to = left;
    if (to !== scroller.scrollLeft) scroller.scrollTo?.({ left: Math.max(0, to) });
    // React Flow draws a box it has just been given a frame or two later, and
    // the frame grows to hold it then, so up or down the page waits for that.
    const selector = `.react-flow__node[data-id="${CSS.escape(box.key)}"]`;
    let tries = 0;
    let waiting = 0;
    const down = () => {
      const node = scroller.querySelector<HTMLElement>(selector);
      const drawn =
        node !== null &&
        scroller.getBoundingClientRect().bottom >= node.getBoundingClientRect().bottom;
      if (node !== null && (drawn || tries >= 30)) {
        node.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
        return;
      }
      tries += 1;
      if (tries <= 30) waiting = requestAnimationFrame(down);
    };
    down();
    return () => cancelAnimationFrame(waiting);
  }, [frame, layout, reveal, cover]);
}

/**
 * The graph at its actual size, never scaled: as tall as its tallest column,
 * so the page scrolls down it, and as wide as its columns, sliding sideways
 * inside its frame with a scrollbar, Shift and the wheel, or a trackpad's
 * sideways swipe. The wheel alone scrolls the page, as anywhere else, since
 * a graph that took it would trap the page under it. React Flow only draws
 * and drags here: its viewport is fixed, with no zoom and no pan of its own.
 * `reveal` scrolls a box into view, clear of `cover` pixels a drawer hides
 * on the right, where the graph keeps that much room past its last column.
 * Each port is a menu when `label` and `entries` are given, built only when
 * it opens; without them, each port is only its name.
 */
const NO_WORKFLOW_BOXES = new Map<string, BoxDecl>();

export function Graph({
  layout,
  workflow,
  primitives,
  pinned,
  colours,
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
  reveal = null,
  cover = 0,
  workflowBoxes = NO_WORKFLOW_BOXES,
  onOpenBox,
}: {
  layout: Layout;
  workflow: Workflow;
  primitives: Map<string, PrimitiveInfo>;
  pinned: Pinned;
  colours: string[];
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
  reveal?: Reveal | null;
  cover?: number;
  workflowBoxes?: ReadonlyMap<string, BoxDecl>;
  onOpenBox?: (index: number) => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  useReveal(frame, layout, reveal, cover);
  const boxes = useMemo(
    () => new Map(layout.boxes.map((box) => [box.key, box])),
    [layout],
  );
  const drawn = useMemo(
    () => new Set(layout.wires.map((wire) => wire.target)),
    [layout],
  );
  const menus = label !== undefined && entries !== undefined;

  // Worked out on every draw, and kept where equal to the last, so React Flow
  // and the boxes see a change only in the boxes and wires it touches.
  const seen: Seen = {
    workflow,
    primitives,
    pinned,
    colours,
    selected,
    dragging,
    refusal,
    notice,
    label: menus ? label : null,
    drawn,
    workflowBoxes,
  };
  const found: (BoxNode | SlotNode | BandNode)[] = [];
  if (layout.band !== null) {
    const left = columnX(layout.band.first) - GEOMETRY.gap / 2;
    const right = columnX(layout.band.last) + GEOMETRY.width + GEOMETRY.gap / 2;
    found.push({
      id: 'band',
      type: 'band',
      position: { x: left, y: -GEOMETRY.space },
      width: right - left,
      height: layout.height + 2 * GEOMETRY.space,
      data: {},
      selectable: false,
      draggable: false,
      connectable: false,
      zIndex: -1,
    });
  }
  for (const box of layout.boxes)
    found.push({
      id: box.key,
      type: 'box',
      position: { x: box.x, y: box.y },
      width: box.width,
      height: box.height,
      data: boxData(seen, box),
      draggable: false,
      className: 'nopan',
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
      data: { label: slot.label, colour: colours[slot.colour] },
      draggable: false,
      selectable: false,
      connectable: false,
    });
  const nodes = useKept(found);
  const edges = useKept(
    layout.wires.map((wire): WireEdge => {
      const marked =
        selected !== null && (wire.from.box === selected || wire.to.box === selected);
      return {
        id: wire.key,
        type: 'wire',
        source: wire.from.box,
        sourceHandle: `out:${wire.from.port}`,
        target: wire.to.box,
        targetHandle: `in:${wire.to.port}`,
        selectable: false,
        data: {
          points: wire.points,
          colour: colours[wire.colour],
          marked,
          dimmed: selected !== null && !marked,
        },
      };
    }),
  );

  // What the parts do reads the graph as it was last drawn, so the parts
  // need not be drawn again when only a handler changed.
  const latest = useRef({
    boxes,
    workflow,
    selected,
    entries,
    onSelect,
    onDragStart,
    onDrop,
    onOpenBox,
  });
  useLayoutEffect(() => {
    latest.current = {
      boxes,
      workflow,
      selected,
      entries,
      onSelect,
      onDragStart,
      onDrop,
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
      return { box, port: handleId.slice(handleId.indexOf(':') + 1) };
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
  const onConnectStart = useCallback<OnConnectStart>(
    (_, params) => {
      const from = ends(params.nodeId, params.handleId);
      latest.current.onDragStart(
        from !== null && params.handleType === 'source'
          ? sourceAt(from.box, from.port, latest.current.workflow)
          : null,
      );
    },
    [ends],
  );
  const onConnectEnd = useCallback<OnConnectEnd>(
    (_, state: FinalConnectionState) => {
      const { onDragStart: tell, onDrop: drop, workflow: now } = latest.current;
      tell(null);
      if (
        state.fromHandle === null ||
        state.toHandle === null ||
        state.toHandle === undefined
      )
        return;
      const from = ends(state.fromHandle.nodeId, state.fromHandle.id);
      const to = ends(state.toHandle.nodeId, state.toHandle.id);
      if (from === null || to === null) return;
      const source = sourceAt(from.box, from.port, now);
      const target = targetAt(to.box, to.port);
      if (source !== null && target !== null) drop(source, target, to.box.key, to.port);
    },
    [ends],
  );

  return (
    <ActionsContext value={actions}>
      <ReactFlowProvider>
        <div className={classes.frame} ref={frame}>
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
            />
          </div>
        </div>
      </ReactFlowProvider>
    </ActionsContext>
  );
}
