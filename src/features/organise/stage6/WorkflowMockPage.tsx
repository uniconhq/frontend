import { useState, type CSSProperties, type ReactNode } from 'react';
import { useMarkColours } from '@/ui/brand/mark-colours';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Checkbox } from '@/ui/Checkbox';
import { Chip } from '@/ui/Chip';
import { Modal } from '@/ui/Modal';
import { Page, PageHeader } from '@/ui/Page';
import { RadioGroup } from '@/ui/RadioGroup';
import { Select } from '@/ui/Select';
import { TextInput } from '@/ui/TextInput';
import { Drawer } from '../workflows/Drawer';
import flow from '../workflows/workflows.module.css';
import { BoxGraph, PaletteButton, PaletteGroup, type Connect } from './BoxGraph';
import { saveProgram } from './graph';
import { MockLinks } from './MockLinks';
import classes from './stage6.module.css';
import {
  addStepTo,
  CLASSIC,
  INNERS,
  INPUTS,
  moveToNewer,
  PRIMITIVES,
  problemsOfLevel,
  renameStep,
  setInput,
  setOutputs,
  setSecret,
  viewOf,
  WORKFLOWS,
  type CatalogueItem,
  type Level,
  type Report,
  type Step,
} from './workflow-doc';

type Showing = 'draft' | 'v2' | 'v3';
type History = { past: Level[]; present: Level; future: Level[] };

const SHARE = [
  {
    value: 'private',
    label: 'Private',
    description: 'Only its owner can see it and choose it for a task.',
  },
  {
    value: 'shared',
    label: 'Shared',
    description: 'Its owner and the people listed here can see it and choose it.',
  },
  {
    value: 'public',
    label: 'Public',
    description: 'Everyone with an account can see it and choose it.',
  },
];

/**
 * The run-workflow editor with nothing loaded from the API: three workflows
 * as boxes, each opening onto the one it pins, down to primitives.
 */
export function WorkflowMockPage() {
  const [history, setHistory] = useState<History>({
    past: [],
    present: CLASSIC,
    future: [],
  });
  const [saved, setSaved] = useState<Level>(CLASSIC);
  const [showing, setShowing] = useState<Showing>('draft');
  const [path, setPath] = useState<string[]>(['classic-run']);
  const [selected, setSelected] = useState<string | null>(null);
  const [details, setDetails] = useState(false);
  const [origin, setOrigin] = useState({ x: 50, y: 40 });
  const [share, setShare] = useState(false);
  const [who, setWho] = useState('private');
  const [published, setPublished] = useState<string | null>(null);
  const [find, setFind] = useState('');
  const here = path[path.length - 1] ?? 'classic-run';
  const parentName = path.length > 1 ? (path[path.length - 2] ?? null) : null;
  const atDraft = showing === 'draft';
  const picture = (name: string): Level =>
    name === 'classic-run'
      ? atDraft
        ? history.present
        : CLASSIC
      : (INNERS[name] ?? CLASSIC);
  const shown = picture(here);
  const parentLevel = parentName === null ? null : picture(parentName);
  const parentStep = parentLevel?.boxes.find((box) => box.opens === here) ?? null;
  const atOuter = atDraft && here === 'classic-run';
  const dirty = history.present !== saved;
  const problems = problemsOfLevel(atDraft ? history.present : shown);
  const graph = viewOf(shown);
  const chosen =
    details && parentStep !== null
      ? parentStep
      : selected === 'outputs'
        ? { kind: 'outputs' as const }
        : selected?.startsWith('input:')
          ? { kind: 'inputs' as const, name: selected.slice('input:'.length) }
          : (shown.boxes.find((box) => box.id === selected) ?? null);
  const focusLevel = details && parentLevel !== null ? parentLevel : shown;
  const canEdit =
    atDraft && (details ? parentName === 'classic-run' : here === 'classic-run');
  const kin = relatives(parentLevel, parentStep?.id ?? '');

  const commit = (next: Level) => {
    if (!atDraft) return;
    setHistory((curr) =>
      next === curr.present
        ? curr
        : { past: [...curr.past, curr.present], present: next, future: [] },
    );
    setPublished(null);
  };
  // A wire dragged in the picture: from an output dot onto an input or a
  // box, or pulled off an input and dropped elsewhere or nowhere.
  const connect = (move: Connect) => {
    if (!atOuter) return;
    let next = history.present;
    if (move.lifted !== undefined)
      next =
        move.lifted.box === 'outputs'
          ? setOutputs(
              next,
              next.outputs.filter((output) => output.name !== move.lifted?.port),
            )
          : setInput(next, move.lifted.box, move.lifted.port, '');
    const to = move.to;
    const fromInput = move.from.box.startsWith('input:');
    const fromName = fromInput ? move.from.box.slice('input:'.length) : move.from.box;
    const fromBox = next.boxes.find((box) => box.id === move.from.box);
    if (to !== null && to.box === 'outputs') {
      const port = move.from.port ?? fromBox?.outputs[0];
      if (!fromInput && port !== undefined) {
        const name = to.port ?? port;
        const kept = next.outputs.filter((output) => output.name !== name);
        next = setOutputs(next, [...kept, { name, box: move.from.box, port }]);
      }
    }
    const target =
      to === null ? undefined : next.boxes.find((box) => box.id === to.box);
    if (target !== undefined && target.id !== move.from.box) {
      const unfed = (port: string) =>
        !next.wires.some((wire) => wire.to === target.id && wire.toPort === port);
      const toPort =
        to?.port ??
        target.inputs.find((port) => port === (move.from.port ?? '')) ??
        target.inputs.find(unfed) ??
        target.inputs[0];
      const fromPort = fromInput
        ? fromName
        : (move.from.port ??
          fromBox?.outputs.find((port) => port === toPort) ??
          fromBox?.outputs[0]);
      if (toPort !== undefined && fromPort !== undefined)
        next = setInput(
          next,
          target.id,
          toPort,
          `${fromInput ? 'inputs' : move.from.box}.${fromPort}`,
        );
    }
    commit(next);
  };
  const undo = () => {
    setHistory((curr) => {
      const previous = curr.past.at(-1);
      if (previous === undefined) return curr;
      return {
        past: curr.past.slice(0, -1),
        present: previous,
        future: [curr.present, ...curr.future],
      };
    });
  };
  const redo = () => {
    setHistory((curr) => {
      const [next, ...rest] = curr.future;
      if (next === undefined) return curr;
      return { past: [...curr.past, curr.present], present: next, future: rest };
    });
  };

  const pick = (id: string | null) => {
    setDetails(false);
    setSelected(id);
  };
  const zoom = (opens: string, at?: { x: number; y: number }) => {
    setOrigin(at ?? { x: 50, y: 40 });
    setPath([...path, opens]);
    setSelected(null);
    setDetails(false);
  };
  const showNeighbor = (box: Step) => {
    const above = path.slice(0, -1);
    setOrigin({ x: box === kin.parents[0] ? 18 : 82, y: 40 });
    if (box.opens !== undefined) {
      setPath([...above, box.opens]);
      setSelected(null);
      setDetails(false);
      return;
    }
    setPath(above);
    setSelected(box.id);
    setDetails(false);
  };

  // A new box opens its drawer at once, since that is where it is wired.
  const add = (item: CatalogueItem) => {
    const next = addStepTo(history.present, item);
    commit(next);
    const box = next.boxes.find(
      (each) => !history.present.boxes.some((old) => old.id === each.id),
    );
    const input = next.inputs.find(
      (each) => !history.present.inputs.some((old) => old.name === each.name),
    );
    pick(box?.id ?? (input === undefined ? null : `input:${input.name}`));
  };

  const found = WORKFLOWS.filter((item) => {
    const query = find.trim().toLowerCase();
    return query === '' || item.title.toLowerCase().includes(query);
  });
  const sources = [
    ...focusLevel.inputs.map((each) => ({
      value: `inputs.${each.name}`,
      label: `input ${each.name}`,
    })),
    ...focusLevel.boxes.flatMap((box) =>
      box.outputs.map((port) => ({
        value: `${box.id}.${port}`,
        label: `${box.title}.${port}`,
      })),
    ),
  ];

  return (
    <Page label="Run workflow">
      <PageHeader
        title="unicon/classic"
        meta={
          <Chip tone={who === 'public' ? 'live' : 'quiet'}>
            {who === 'public' ? 'Public' : who === 'shared' ? 'Shared' : 'Private'}
          </Chip>
        }
        links={<MockLinks />}
      >
        <BodyText size="sm" tone="secondary">
          Draft, and two versions.
        </BodyText>
      </PageHeader>
      <div className={flow.editor}>
        <div className={flow.barFrame} data-workflow-bar>
          <div className={flow.bar} role="toolbar" aria-label="The workflow">
            <div className={flow.switch}>
              <Select
                label="Showing"
                value={showing}
                options={[
                  { value: 'draft', label: 'The draft' },
                  { value: 'v3', label: 'v3, the latest version' },
                  { value: 'v2', label: 'Version v2' },
                ]}
                onChange={(value) => {
                  setShowing(value as Showing);
                  setPath(['classic-run']);
                  setSelected(null);
                  setDetails(false);
                }}
              />
            </div>
            <div className={flow.status}>
              {showing === 'draft' && (
                <BodyText size="sm" tone="secondary">
                  {dirty ? 'Unsaved changes' : 'All changes saved'}
                </BodyText>
              )}
            </div>
            <div className={flow.barActions}>
              <Button
                disabled={!atDraft || !dirty}
                onClick={() => {
                  setSaved(history.present);
                  setPublished(null);
                }}
              >
                Save
              </Button>
              <Button
                variant="secondary"
                disabled={!atDraft || dirty || problems.length > 0}
                onClick={() =>
                  setPublished('v4 is published. Tasks can choose it now.')
                }
              >
                Publish version
              </Button>
              <Button
                variant="secondary"
                disabled={showing !== 'draft'}
                onClick={() => setShare(true)}
              >
                Share
              </Button>
            </div>
          </div>
          <p className={flow.where}>
            {showing === 'draft'
              ? 'You are editing the draft. Saving keeps your changes; publishing a version freezes the draft as it was saved, for tasks to choose.'
              : `You are looking at ${showing}, a version: it never changes, and every task that chose it grades with it.`}
          </p>
        </div>
        {published !== null && (
          <p role="status" className={flow.note}>
            {published}
          </p>
        )}
        <div className={flow.tools} role="toolbar" aria-label="Editing">
          <Button
            variant="secondary"
            disabled={!atDraft || history.past.length === 0}
            onClick={undo}
          >
            Undo
          </Button>
          <Button
            variant="secondary"
            disabled={!atDraft || history.future.length === 0}
            onClick={redo}
          >
            Redo
          </Button>
        </div>
        {path.length > 1 && (
          <BodyText size="sm" tone="secondary">
            Inside {INNERS[here]?.name ?? here}, at the version this step uses. Read
            only.
          </BodyText>
        )}
        {atDraft && (
          <ProblemList
            problems={problems}
            onOpen={(id) => {
              if (here !== 'classic-run') {
                setOrigin({ x: 50, y: 40 });
                setPath(['classic-run']);
              }
              pick(id);
            }}
          />
        )}
        {atOuter && (
          <div className={classes.trays}>
            <BodyText size="sm" tone="secondary">
              Click to add. The layout places it, and its drawer opens so you can pick
              what goes into it.
            </BodyText>
            <div className={classes.trayRow}>
              <PaletteGroup tray title="Inputs">
                {INPUTS.map((item) => (
                  <PaletteButton
                    key={item.title}
                    name={item.title}
                    line={item.line}
                    note={item.note}
                    onAdd={() => add(item)}
                  />
                ))}
              </PaletteGroup>
              <PaletteGroup tray title="Primitives">
                {PRIMITIVES.map((item) => (
                  <PaletteButton
                    key={item.title}
                    name={item.title}
                    line={item.line}
                    note={item.note}
                    onAdd={() => add(item)}
                  />
                ))}
              </PaletteGroup>
              <PaletteGroup tray title="Workflows">
                <TextInput label="Find a workflow" value={find} onChange={setFind} />
                {found.map((item) => (
                  <PaletteButton
                    key={item.title}
                    name={item.title}
                    line={item.line}
                    note={item.note}
                    onAdd={() => add(item)}
                  />
                ))}
              </PaletteGroup>
            </div>
          </div>
        )}
        <div className={classes.graphColumn}>
          <nav className={classes.crumb} aria-label="Inside the workflow">
            {path.map((part, index) => {
              const last = index === path.length - 1;
              return (
                <span key={`${part}:${String(index)}`} className={classes.crumb}>
                  {index > 0 && (
                    <span className={classes.caret} aria-hidden>
                      ›
                    </span>
                  )}
                  <button
                    type="button"
                    className={classes.crumbButton}
                    data-here={last || undefined}
                    aria-current={last ? 'page' : undefined}
                    onClick={() => {
                      if (last) return;
                      setOrigin({ x: 50, y: 40 });
                      setPath(path.slice(0, index + 1));
                      setSelected(null);
                      setDetails(false);
                    }}
                  >
                    {part === 'classic-run' ? 'classic' : (INNERS[part]?.name ?? part)}
                  </button>
                </span>
              );
            })}
          </nav>
          <div
            key={path.join('/')}
            className={classes.zoom}
            style={
              {
                '--zoom-x': `${String(origin.x)}%`,
                '--zoom-y': `${String(origin.y)}%`,
              } as CSSProperties
            }
          >
            {path.length > 1 ? (
              <ZoomWell
                parents={kin.parents}
                downstream={kin.children}
                onNeighbor={showNeighbor}
                onDetails={() => {
                  setSelected(null);
                  setDetails(true);
                }}
                note={
                  parentStep?.newer !== undefined
                    ? `${parentStep.newer} is out`
                    : parentStep?.line
                }
              >
                <BoxGraph
                  detail
                  boxes={graph.boxes}
                  wires={graph.wires}
                  selected={details ? null : selected}
                  onSelect={pick}
                  onConnect={atOuter && !details ? connect : undefined}
                  onOpen={(id, at) => {
                    const box = shown.boxes.find((item) => item.id === id);
                    if (box?.opens !== undefined) zoom(box.opens, at);
                  }}
                />
              </ZoomWell>
            ) : (
              <BoxGraph
                boxes={graph.boxes}
                wires={graph.wires}
                selected={selected}
                onSelect={pick}
                onConnect={atOuter ? connect : undefined}
                onOpen={(id, at) => {
                  const box = shown.boxes.find((item) => item.id === id);
                  if (box?.opens !== undefined) zoom(box.opens, at);
                }}
              />
            )}
          </div>
        </div>
        <Drawer
          title={
            chosen === null
              ? null
              : chosen.kind === 'outputs'
                ? 'Outputs'
                : chosen.kind === 'inputs'
                  ? chosen.name
                  : chosen.title
          }
          onClose={() => pick(null)}
        >
          {chosen !== null && chosen.kind === 'outputs' && (
            <OutputsDrawer
              level={shown}
              sources={sources}
              readOnly={!canEdit}
              onChange={(next) => commit(setOutputs(history.present, next))}
            />
          )}
          {chosen !== null &&
            chosen.kind === 'inputs' &&
            focusLevel.inputs
              .filter((each) => each.name === chosen.name)
              .map((each) => {
                const readers = focusLevel.wires
                  .filter(
                    (wire) => wire.from === 'inputs' && wire.fromPort === each.name,
                  )
                  .map((wire) => {
                    const box = focusLevel.boxes.find((item) => item.id === wire.to);
                    return `${box?.title ?? wire.to}.${wire.toPort}`;
                  });
                return (
                  <div key={each.name} className={flow.panel}>
                    <BodyText size="sm" tone="secondary">
                      {each.own === true
                        ? 'A file this workflow holds, beside its workflow.yaml.'
                        : 'An input: what a task gives this workflow for each run.'}
                    </BodyText>
                    <div className={flow.declaration}>
                      <span className={flow.primitiveLine}>
                        <span className={flow.port}>{each.name}</span>
                        <span className={flow.ref}>{each.type}</span>
                      </span>
                      <BodyText size="sm" tone="secondary">
                        {each.said}
                      </BodyText>
                    </div>
                    {each.own !== true && (
                      <Checkbox
                        label="Secret: only one of the contest's secrets can fill it, and only a step input marked secret can read it"
                        checked={each.secret === true}
                        disabled={!canEdit}
                        onChange={(secret) =>
                          commit(setSecret(history.present, each.name, secret))
                        }
                      />
                    )}
                    {each.own === true && (
                      <div>
                        <Button
                          variant="secondary"
                          onClick={() => saveProgram(each.name, each.said)}
                        >
                          Download {each.name}
                        </Button>
                      </div>
                    )}
                    <p className={flow.part}>Read by</p>
                    <BodyText size="sm">
                      {readers.length === 0 ? 'Nothing yet' : readers.join(', ')}
                    </BodyText>
                  </div>
                );
              })}
          {chosen !== null && chosen.kind !== 'outputs' && chosen.kind !== 'inputs' && (
            <div className={flow.panel}>
              <TextInput
                label="Name"
                value={chosen.title}
                disabled={!canEdit}
                onChange={(title) =>
                  commit(renameStep(history.present, chosen.id, title))
                }
              />
              <div className={flow.declaration}>
                <span className={flow.primitiveLine}>
                  <span className={flow.ref}>{chosen.line}</span>
                </span>
                <BodyText size="sm" tone="secondary">
                  {chosen.description}
                  {chosen.kind === 'workflow' &&
                    ` ${String(chosen.steps ?? 0)} steps inside.`}
                </BodyText>
              </div>
              {chosen.newer !== undefined && (
                <>
                  <BodyText>{chosen.newer} is out.</BodyText>
                  {canEdit && (
                    <div>
                      <Button
                        variant="secondary"
                        onClick={() => commit(moveToNewer(history.present, chosen.id))}
                      >
                        Move to it
                      </Button>
                    </div>
                  )}
                </>
              )}
              {chosen.opens !== undefined && chosen.opens !== here && (
                <div>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      if (chosen.opens !== undefined) zoom(chosen.opens);
                    }}
                  >
                    Zoom in
                  </Button>
                </div>
              )}
              {!canEdit && (
                <BodyText size="sm" tone="secondary">
                  Read only. Open this workflow on its own to change it, then move the
                  step to the new version.
                </BodyText>
              )}
              <p className={flow.part}>Inputs</p>
              {chosen.inputs.length === 0 && <BodyText size="sm">None</BodyText>}
              {chosen.inputs.map((port) => {
                const wire = focusLevel.wires.find(
                  (item) => item.to === chosen.id && item.toPort === port,
                );
                return (
                  <Select
                    key={port}
                    label={port}
                    value={wire === undefined ? '' : `${wire.from}.${wire.fromPort}`}
                    disabled={!canEdit}
                    placeholder="Nothing yet"
                    options={sources.filter(
                      (source) => !source.value.startsWith(`${chosen.id}.`),
                    )}
                    onChange={(next) =>
                      commit(setInput(history.present, chosen.id, port, next))
                    }
                  />
                );
              })}
              <p className={flow.part}>Outputs</p>
              <ul className={flow.outputs}>
                {chosen.outputs.map((port) => (
                  <li key={port}>{port}</li>
                ))}
              </ul>
            </div>
          )}
        </Drawer>
      </div>
      <Modal opened={share} onClose={() => setShare(false)} title="Who can use it">
        <RadioGroup
          label="Who can use it"
          value={who}
          options={SHARE}
          onChange={setWho}
        />
      </Modal>
    </Page>
  );
}

function relatives(
  level: Level | null,
  id: string,
): { parents: Step[]; children: Step[] } {
  if (level === null || id === '') return { parents: [], children: [] };
  const incoming = new Set(
    level.wires.filter((wire) => wire.to === id).map((wire) => wire.from),
  );
  const outgoing = new Set(
    level.wires.filter((wire) => wire.from === id).map((wire) => wire.to),
  );
  return {
    parents: level.boxes.filter((box) => incoming.has(box.id)),
    children: level.boxes.filter((box) => outgoing.has(box.id)),
  };
}

function ZoomWell({
  parents,
  downstream,
  onNeighbor,
  onDetails,
  note,
  children,
}: {
  parents: Step[];
  downstream: Step[];
  onNeighbor: (box: Step) => void;
  onDetails: () => void;
  note: string | undefined;
  children: ReactNode;
}) {
  const colours = useMarkColours();
  return (
    <div
      className={classes.zoomWell}
      data-in={parents.length > 0 || undefined}
      data-out={downstream.length > 0 || undefined}
    >
      {parents.length > 0 && (
        <div className={classes.side} data-side="in">
          {parents.map((box) => (
            <SideBox
              key={box.id}
              box={box}
              colour={colours[0]}
              onClick={() => onNeighbor(box)}
            />
          ))}
        </div>
      )}
      <div className={classes.zoomCenter}>
        <div className={classes.zoomBar}>
          <BodyText size="sm" tone="secondary">
            {note ?? 'Inside this step.'}
          </BodyText>
          <Button size="xs" variant="secondary" onClick={onDetails}>
            Details
          </Button>
        </div>
        {children}
      </div>
      {downstream.length > 0 && (
        <div className={classes.side} data-side="out">
          {downstream.map((box) => (
            <SideBox
              key={box.id}
              box={box}
              colour={colours[2]}
              onClick={() => onNeighbor(box)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SideBox({
  box,
  colour,
  onClick,
}: {
  box: Step;
  colour: string | undefined;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`${flow.box} ${classes.sideBox}`}
      style={{ borderColor: colour, color: colour }}
      onClick={onClick}
    >
      <span className={flow.title}>{box.title}</span>
      <span className={flow.detail}>{box.line}</span>
    </button>
  );
}

function ProblemList({
  problems,
  onOpen,
}: {
  problems: { id: string; where: string; message: string }[];
  onOpen: (id: string) => void;
}) {
  if (problems.length === 0) {
    return (
      <section className={flow.banner} aria-label="Problems" data-tone="ok">
        <BodyText size="sm" tone="secondary">
          Nothing to fix: this draft can be published as a version.
        </BodyText>
      </section>
    );
  }
  const one = problems.length === 1;
  return (
    <section className={flow.banner} aria-label="Problems" data-tone="problem">
      <BodyText size="sm">
        {one ? 'One problem' : `${String(problems.length)} problems`} to fix before
        publishing a version. You can still save the draft with {one ? 'it' : 'them'}.
      </BodyText>
      <ul className={flow.problemList}>
        {problems.map((problem) => (
          <li key={`${problem.id}:${problem.message}`}>
            <button
              type="button"
              className={flow.problemLink}
              onClick={() => onOpen(problem.id)}
            >
              {problem.where}
            </button>
            : {problem.message}
          </li>
        ))}
      </ul>
    </section>
  );
}

function OutputsDrawer({
  level,
  sources,
  readOnly,
  onChange,
}: {
  level: Level;
  sources: { value: string; label: string }[];
  readOnly: boolean;
  onChange: (next: Report[]) => void;
}) {
  const items = level.outputs;
  const steps = sources.filter((source) => !source.value.startsWith('inputs.'));
  return (
    <div className={flow.panel}>
      {items.length === 0 && <BodyText size="sm">None yet.</BodyText>}
      {items.map((item, index) => {
        const change = (patch: Partial<Report>) =>
          onChange(
            items.map((each, at) => (at === index ? { ...each, ...patch } : each)),
          );
        return (
          <div key={`${item.name}:${String(index)}`} className={flow.declaration}>
            <TextInput
              label="Name"
              value={item.name}
              disabled={readOnly}
              onChange={(name) => change({ name })}
            />
            <Select
              label="From"
              value={`${item.box}.${item.port}`}
              disabled={readOnly}
              options={steps}
              onChange={(value) => {
                const dot = value.indexOf('.');
                if (dot <= 0) return;
                change({ box: value.slice(0, dot), port: value.slice(dot + 1) });
              }}
            />
            <TextInput
              label="Unit, if it has one"
              value={item.unit ?? ''}
              disabled={readOnly}
              onChange={(unit) => change({ unit: unit === '' ? undefined : unit })}
            />
            {!readOnly && (
              <div>
                <Button
                  size="xs"
                  variant="secondary"
                  onClick={() => onChange(items.filter((_, at) => at !== index))}
                >
                  Remove
                </Button>
              </div>
            )}
          </div>
        );
      })}
      {!readOnly && (
        <div>
          <Button
            variant="secondary"
            onClick={() => {
              const first = steps[0];
              if (first === undefined) return;
              const dot = first.value.indexOf('.');
              onChange([
                ...items,
                {
                  name: first.value.slice(dot + 1),
                  box: first.value.slice(0, dot),
                  port: first.value.slice(dot + 1),
                },
              ]);
            }}
          >
            Add an output
          </Button>
        </div>
      )}
    </div>
  );
}
