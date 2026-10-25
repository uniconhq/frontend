import { useEffect, useMemo, useReducer, useState, type KeyboardEvent } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useBlocker } from 'react-router';
import { $api } from '@/api/query';
import { toApiError, type ApiError } from '@/api/problem';
import type { WorkflowPage } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { UnsavedNote } from '@/ui/UnsavedNote';
import { Button } from '@/ui/Button';
import { CodeEditor } from '@/ui/CodeEditor';
import { Modal } from '@/ui/Modal';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { type MenuEntry } from '@/ui/ActionMenu';
import { useMarkColours } from '@/ui/brand/mark-colours';
import { MergeView } from '../forms/MergeView';
import { parseYaml } from '../forms/yaml-doc';
import { AddStep } from './AddStep';
import { WorkflowBar } from './Bar';
import { checkQuery } from './check';
import { Drawer, DRAWER_WIDTH } from './Drawer';
import { formatUse, framesFor, parseUse, useBoxes, type Frame } from './boxes';
import {
  addStep,
  addUse,
  clearPort,
  entryFields,
  freeName,
  setEntry,
  setInput,
  wire,
  workflowOf,
} from './edit';
import { sourceAt, targetAt, type Target } from './ends';
import { useNotice } from './notice';
import { FileView } from './FileView';
import { Graph } from './Graph';
import { Inside } from './Inside';
import { layoutWorkflow, type Box, type StepPorts } from './layout';
import { linesOf, type Selected } from './lines';
import { type Ref, type Workflow } from './model';
import { InputsPanel, ReportPanel, StepPanel } from './Panels';
import { pinned as pinProblems, placed } from './pins';
import { Problems } from './Problems';
import { byRef, declared, type PrimitiveInfo } from './primitives';
import { PublishVersion } from './Publish';
import { outputType, reportable, reportRefusal, wireRefusal } from './rules';
import { ShareButton } from './SharePanel';
import { DRAFT_FILE, refWords } from './words';
import classes from './workflows.module.css';

/**
 * The page a workflow's draft is built on, and the only place one is edited
 * (#377). The graph is drawn from the draft every time, at its actual size;
 * each change is an edit of the YAML document in place, comments and all,
 * kept in the page's history for undo and redo. The bar above says it is the
 * draft and holds Save, "Publish version", Share and "View file" (M32); the
 * toolbar under it holds Undo, Redo, "Add step", the inputs and the outputs
 * (M37). The box selected opens in a drawer on the
 * right. A moment after each change the draft is checked as a version would
 * be, and each problem is said in the banner, linked to its box, and beside
 * its mark on the box (M31). A draft with problems saves; a version of one is
 * refused. A draft whose file cannot be read cannot be drawn, so it is fixed
 * as text, with Save and Undo, until it can be read (M30). A save over someone
 * else's opens the merge view, steps matched by id.
 */

type History = { past: string[]; present: string; future: string[]; typing: boolean };
type Action =
  | { kind: 'change'; text: string }
  | { kind: 'type'; text: string }
  | { kind: 'undo' }
  | { kind: 'redo' };

function history(state: History, action: Action): History {
  switch (action.kind) {
    case 'change':
      if (action.text === state.present) return state;
      return {
        past: [...state.past, state.present],
        present: action.text,
        future: [],
        typing: false,
      };
    case 'type':
      // A run of typing is one step back, not a step per key.
      if (action.text === state.present) return state;
      if (state.typing) return { ...state, present: action.text, future: [] };
      return {
        past: [...state.past, state.present],
        present: action.text,
        future: [],
        typing: true,
      };
    case 'undo': {
      const previous = state.past.at(-1);
      if (previous === undefined) return state;
      return {
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future],
        typing: false,
      };
    }
    case 'redo': {
      const [next, ...rest] = state.future;
      if (next === undefined) return state;
      return {
        past: [...state.past, state.present],
        present: next,
        future: rest,
        typing: false,
      };
    }
  }
}

/** `value`, once it has stayed the same for `delay` milliseconds. */
function useSettled<T>(value: T, delay: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return settled;
}

/**
 * What a version would be refused for, checked a moment after each change.
 * The last answer stays while the next is awaited, so the problems and their
 * marks do not leave and come back on every edit; `checking` says the answer
 * is not yet for the text as it is.
 */
function useCheck(text: string) {
  const settled = useSettled(text, 400);
  const check = useQuery({ ...checkQuery(settled), placeholderData: keepPreviousData });
  return { check, checking: settled !== text || check.isPlaceholderData };
}

/** The box a selection stands on now, found again after the layout moved. */
function boxOf(boxes: Box[], selected: Selected | null): string | null {
  if (selected === null) return null;
  if (selected.kind === 'report') return 'report';
  if (selected.kind === 'step') return `step:${String(selected.index)}`;
  const ids = selected.ids;
  return (
    boxes.find(
      (box) => box.kind === 'inputs' && box.right.some((name) => ids.includes(name)),
    )?.key ?? null
  );
}

/**
 * What the author chose, a step held by its id and its place: an edit, an
 * undo or a merge that moves the step in the list leaves it chosen, and a
 * rename, which keeps its place, too.
 */
type Chosen =
  Exclude<Selected, { kind: 'step' }> | { kind: 'step'; id: string; index: number };

function chosenStep(chosen: Chosen | null, workflow: Workflow): Selected | null {
  if (chosen?.kind !== 'step') return chosen;
  const found = workflow.steps.findIndex((step) => step.id === chosen.id);
  const index = found >= 0 ? found : chosen.index;
  return index < workflow.steps.length ? { kind: 'step', index } : null;
}

function selectionOf(box: Box | undefined): Selected | null {
  if (box === undefined) return null;
  if (box.kind === 'step' && box.step !== null)
    return { kind: 'step', index: box.step };
  if (box.kind === 'inputs') return { kind: 'inputs', ids: box.right };
  if (box.kind === 'report') return { kind: 'report' };
  return null;
}

function drawerTitle(selected: Selected | null, workflow: Workflow): string | null {
  if (selected === null) return null;
  if (selected.kind === 'step')
    return `Step ${workflow.steps[selected.index]?.id || '(no name)'}`;
  if (selected.kind === 'inputs') return 'Inputs';
  return 'Outputs';
}

/**
 * Leaving the page with changes not saved asks first: by a link, the
 * switcher or the browser's back, and by closing the tab.
 */
function LeaveGuard({ dirty }: { dirty: boolean }) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty &&
      (currentLocation.pathname !== nextLocation.pathname ||
        currentLocation.search !== nextLocation.search),
  );
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const asking = blocker.state === 'blocked';
  return (
    <Modal
      opened={asking}
      onClose={() => blocker.reset?.()}
      title="Leave without saving?"
    >
      <div className={classes.stack}>
        <BodyText size="md">
          Your changes to the draft are not saved. Leaving loses them.
        </BodyText>
        <div className={classes.actions}>
          <Button onClick={() => blocker.reset?.()}>Stay</Button>
          <Button variant="danger" onClick={() => blocker.proceed?.()}>
            Leave without saving
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function Editor({
  page,
  primitives,
}: {
  page: WorkflowPage & { draft: NonNullable<WorkflowPage['draft']> };
  primitives: PrimitiveInfo[];
}) {
  const { owner, name } = page;
  const colours = useMarkColours();
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(history, {
    past: [],
    present: page.draft.content,
    future: [],
    typing: false,
  });
  const text = state.present;
  const [saved, setSaved] = useState({
    text: page.draft.content,
    token: page.draft.token,
  });
  const [chosen, setChosen] = useState<Chosen | null>(null);
  const [nonce, setNonce] = useState(0);
  const [dragging, setDragging] = useState<Ref | null>(null);
  const { notice, show: showNotice, clear: clearNotice } = useNotice();
  const [conflict, setConflict] = useState<{
    base: string;
    mine: string;
    current: string;
    token: string | null;
  } | null>(null);
  const [saveError, setSaveError] = useState<ApiError | null>(null);
  const [published, setPublished] = useState<string | null>(null);
  const [stack, setStack] = useState<Frame[]>([]);

  const primitiveMap = useMemo(() => byRef(primitives), [primitives]);
  const parsed = useMemo(() => parseYaml(text), [text]);
  const unreadable = 'error' in parsed ? parsed.error : null;
  const [mending, setMending] = useState(unreadable !== null);
  if (unreadable !== null && !mending) setMending(true);
  const workflow = useMemo(() => workflowOf(text), [text]);
  const readable = $api.useQuery('get', '/api/v1/workflows', {}, { retry: false });
  const paletteRefs = useMemo(() => {
    const found: Frame['use'][] = [];
    for (const item of readable.data ?? [])
      for (const version of item.versions) {
        const ref = `${item.owner}/${item.name}@${version}`;
        if (item.owner === page.owner && item.name === page.name) continue;
        if (!primitiveMap.has(ref))
          found.push({ owner: item.owner, name: item.name, version });
      }
    return found;
  }, [readable.data, primitiveMap, page.owner, page.name]);
  const boxRefs = useMemo(() => {
    const seen = new Set(paletteRefs.map((use) => formatUse(use)));
    const found = [...paletteRefs];
    for (const step of workflow.steps) {
      if (primitiveMap.has(step.use) || seen.has(step.use)) continue;
      const parsed = parseUse(step.use);
      if (parsed === null) continue;
      seen.add(step.use);
      found.push(parsed);
    }
    return found;
  }, [paletteRefs, workflow, primitiveMap]);
  const boxMap = useBoxes(boxRefs);
  const palette = useMemo(
    () => paletteRefs.filter((use) => boxMap.get(formatUse(use))?.run === true),
    [paletteRefs, boxMap],
  );
  const ports = useMemo(() => {
    const found = new Map<string, StepPorts>();
    for (const [use, box] of boxMap)
      found.set(use, {
        inputs: box.inputs.map((input) => input.name),
        outputs: box.outputs.map((output) => output.name),
      });
    return found;
  }, [boxMap]);
  const layout = useMemo(
    () => layoutWorkflow(workflow, primitiveMap, ports),
    [workflow, primitiveMap, ports],
  );
  const { check, checking } = useCheck(text);
  const problems = useMemo(() => check.data ?? [], [check.data]);
  const pins = useMemo(
    () =>
      pinProblems(
        problems,
        workflow.steps.length,
        workflow.inputs.map((input) => input.id),
        workflow.report.map((entry) => entry.name),
      ),
    [problems, workflow],
  );
  const listed = useMemo(() => placed(problems, workflow), [problems, workflow]);
  const selected = useMemo(() => chosenStep(chosen, workflow), [chosen, workflow]);
  const select = (next: Selected | null, steps = workflow.steps) => {
    setNonce((count) => count + 1);
    setChosen(
      next?.kind === 'step'
        ? { kind: 'step', id: steps[next.index]?.id ?? '', index: next.index }
        : next,
    );
  };
  if (chosen?.kind === 'step' && selected?.kind === 'step') {
    // A step found again elsewhere, or renamed in its place, is held by where
    // and what it is now.
    const id = workflow.steps[selected.index]?.id;
    if (id !== undefined && (id !== chosen.id || selected.index !== chosen.index))
      setChosen({ kind: 'step', id, index: selected.index });
  }
  const selectedKey = boxOf(layout.boxes, selected);
  const reveal = useMemo(
    () => (selectedKey === null ? null : { key: selectedKey, nonce }),
    [selectedKey, nonce],
  );
  const marked = useMemo(() => linesOf(text, selected), [text, selected]);
  const dirty = text !== saved.text;
  const drawing = !mending;

  const change = (next: string) => {
    clearNotice();
    setPublished(null);
    dispatch({ kind: 'change', text: next });
  };

  const save = $api.useMutation('put', '/api/v1/workflows/{owner}/{name}/draft');

  /** Write `content` over `over`, the file as last read: on a conflict the
   * merge view compares with what was written over. */
  const write = async (
    content: string,
    over: { text: string; token: string | null },
  ) => {
    setSaveError(null);
    try {
      const written = await save.mutateAsync({
        params: { path: { owner, name } },
        body: { content, token: over.token },
      });
      setSaved({ text: written.content, token: written.token });
      setConflict(null);
      return true;
    } catch (caught) {
      const error = toApiError(caught);
      if (error.code === 'conflict') {
        const fresh = await queryClient.fetchQuery({
          ...$api.queryOptions('get', '/api/v1/workflows/{owner}/{name}', {
            params: { path: { owner, name } },
          }),
          staleTime: 0,
        });
        const current = fresh.draft;
        if (current !== null) {
          setConflict({
            base: over.text,
            mine: content,
            current: current.content,
            token: current.token,
          });
          return false;
        }
      }
      setSaveError(error);
      return false;
    }
  };

  const refusal = (source: Ref, target: Target): string | null =>
    target.kind === 'port'
      ? wireRefusal(workflow, primitiveMap, target.step, target.port, source, boxMap)
      : reportRefusal(workflow, primitiveMap, source, boxMap);

  const connect = (source: Ref, target: Target, box: string, port: string) => {
    const refused = refusal(source, target);
    if (refused !== null) {
      showNotice({ box, port, reason: refused });
      return;
    }
    if (target.kind === 'port') {
      change(wire(text, target.step, target.port, source));
      return;
    }
    if (source.kind !== 'steps') return;
    const existing = workflow.report.find((entry) => entry.name === target.entry);
    if (existing !== undefined) {
      change(
        setEntry(
          text,
          existing.name,
          entryFields(existing, outputType(workflow, primitiveMap, source), {
            from: source,
          }),
        ),
      );
      return;
    }
    change(
      setEntry(
        text,
        freeName(
          source.output,
          workflow.report.map((entry) => entry.name),
          '_',
        ),
        { from: source },
      ),
    );
  };

  /** Every source a port could be wired from, in the order the file declares them. */
  const sources = (): Ref[] => [
    ...workflow.inputs.map((input): Ref => ({ kind: 'inputs', name: input.id })),
    ...workflow.steps.flatMap((step) => {
      const declaredOutputs = declared(primitiveMap, step.use)?.outputs;
      const names =
        declaredOutputs !== undefined
          ? Object.keys(declaredOutputs)
          : (boxMap.get(step.use)?.outputs.map((output) => output.name) ?? []);
      return names
        .filter((output) => output !== 'outcome')
        .map((output): Ref => ({ kind: 'steps', name: step.id, output }));
    }),
  ];

  /** What a port's menu is called, or null for a port with none. */
  const menuLabel = (box: Box, port: string, side: 'left' | 'right'): string | null => {
    if (side === 'left') {
      const target = targetAt(box, port);
      if (target === null) return null;
      return target.kind === 'port'
        ? `The port ${port} of ${workflow.steps[target.step]?.id ?? ''}`
        : `The output ${port}`;
    }
    const source = sourceAt(box, port, workflow);
    if (source === null) return null;
    return source.kind === 'steps'
      ? `The output ${source.output} of ${source.name}`
      : source.kind === 'inputs'
        ? `The input ${source.name}`
        : `The file ${source.name}`;
  };

  /**
   * What a port's menu offers, built only when it opens: every source or
   * target, each checked against the rules, is too much work to do for
   * every port on every change.
   */
  const menuEntries = (box: Box, port: string, side: 'left' | 'right'): MenuEntry[] => {
    const entries: MenuEntry[] = [];
    if (side === 'left') {
      const target = targetAt(box, port);
      if (target === null) return entries;
      if (target.kind === 'port') {
        const step = workflow.steps[target.step];
        entries.push({ kind: 'heading', text: 'Wire from' });
        for (const source of sources())
          entries.push({
            kind: 'item',
            text: refWords(source),
            reason: refusal(source, target),
            onSelect: () => connect(source, target, box.key, port),
          });
        const decl =
          step !== undefined
            ? declared(primitiveMap, step.use)?.inputs[port]
            : undefined;
        const value = step?.with[port];
        entries.push({ kind: 'divider' });
        if (decl !== undefined) {
          entries.push({
            kind: 'item',
            text: 'Give it a value in the step’s drawer',
            onSelect: () => select({ kind: 'step', index: target.step }),
          });
          entries.push({
            kind: 'item',
            text: `A new input, of type ${decl.type}, wired here`,
            onSelect: () => {
              const id = freeName(
                port.replaceAll('_', '-'),
                workflow.inputs.map((input) => input.id),
              );
              const declaredText = setInput(text, id, {
                type: decl.type,
                options: decl.options,
              });
              change(
                wire(declaredText, target.step, port, { kind: 'inputs', name: id }),
              );
            },
          });
        }
        if (value !== undefined)
          entries.push({
            kind: 'item',
            text: value.kind === 'wire' ? 'Remove the wire' : 'Clear the value',
            onSelect: () => change(clearPort(text, target.step, port)),
          });
      } else {
        entries.push({ kind: 'heading', text: 'Read from' });
        for (const source of reportable(workflow, primitiveMap))
          entries.push({
            kind: 'item',
            text: refWords(source),
            reason: refusal(source, target),
            onSelect: () => connect(source, target, box.key, port),
          });
        entries.push({ kind: 'divider' });
        entries.push({
          kind: 'item',
          text: 'Change it in the outputs',
          onSelect: () => select({ kind: 'report' }),
        });
      }
    } else {
      const source = sourceAt(box, port, workflow);
      if (source === null) return entries;
      if (source.kind === 'steps') {
        const reported = reportRefusal(workflow, primitiveMap, source, boxMap);
        entries.push({
          kind: 'item',
          text: 'Name it as an output',
          reason: reported,
          onSelect: () =>
            connect(source, { kind: 'report', entry: null }, 'report', '+'),
        });
      }
      entries.push({ kind: 'heading', text: 'Wire to' });
      workflow.steps.forEach((step, index) => {
        for (const target of Object.keys(
          declared(primitiveMap, step.use)?.inputs ?? {},
        )) {
          if (source.kind === 'steps' && source.name === step.id) continue;
          const to: Target = { kind: 'port', step: index, port: target };
          entries.push({
            kind: 'item',
            text: `${target} of ${step.id}`,
            reason: refusal(source, to),
            onSelect: () => connect(source, to, `step:${String(index)}`, target),
          });
        }
      });
    }
    return entries;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const field = (event.target as HTMLElement).closest(
      'input, textarea, select, [contenteditable]',
    );
    if (
      field !== null ||
      !(event.ctrlKey || event.metaKey) ||
      (event.key.toLowerCase() !== 'z' && event.key.toLowerCase() !== 'y')
    )
      return;
    event.preventDefault();
    dispatch({
      kind: event.key.toLowerCase() === 'y' || event.shiftKey ? 'redo' : 'undo',
    });
  };

  const panel =
    selected === null ? null : selected.kind === 'step' ? (
      <StepPanel
        text={text}
        workflow={workflow}
        primitives={primitiveMap}
        pinned={pins}
        index={selected.index}
        change={change}
        onRemoved={() => select(null)}
      />
    ) : selected.kind === 'inputs' ? (
      <InputsPanel
        text={text}
        workflow={workflow}
        primitives={primitiveMap}
        pinned={pins}
        ids={selected.ids.length > 0 ? selected.ids : null}
        change={change}
      />
    ) : (
      <ReportPanel
        text={text}
        workflow={workflow}
        primitives={primitiveMap}
        pinned={pins}
        change={change}
      />
    );

  const checkFailure = check.isError
    ? (toApiError(check.error).detail ?? toApiError(check.error).message)
    : null;

  return (
    <div className={classes.editor} onKeyDown={onKeyDown}>
      <WorkflowBar
        page={page}
        version={null}
        status={
          dirty ? (
            <UnsavedNote />
          ) : (
            <BodyText size="sm" tone="secondary">
              All changes saved.
            </BodyText>
          )
        }
      >
        <Button
          disabled={!dirty}
          loading={save.isPending}
          onClick={() => void write(text, saved)}
        >
          Save
        </Button>
        <PublishVersion
          owner={owner}
          name={name}
          versions={page.versions}
          token={saved.token}
          dirty={dirty}
          problems={check.isSuccess ? problems.length : 0}
          checking={checking || check.isPending}
          onPublished={setPublished}
        />
        <ShareButton page={page} />
        <FileView title={DRAFT_FILE} label={DRAFT_FILE} text={text} marked={marked} />
      </WorkflowBar>
      {published !== null && (
        <p role="status" className={classes.note}>
          {published} is published. Tasks can choose it now.
        </p>
      )}
      <div className={classes.tools} role="toolbar" aria-label="Editing">
        <Button
          variant="secondary"
          disabled={state.past.length === 0}
          onClick={() => dispatch({ kind: 'undo' })}
        >
          Undo
        </Button>
        <Button
          variant="secondary"
          disabled={state.future.length === 0}
          onClick={() => dispatch({ kind: 'redo' })}
        >
          Redo
        </Button>
        <span className={classes.toolGap} aria-hidden />
        <AddStep
          primitives={primitives}
          workflows={palette}
          disabled={!drawing || stack.length > 0}
          onAddWorkflow={(chosen) => {
            const next = addUse(text, formatUse(chosen), chosen.name);
            const steps = workflowOf(next).steps;
            const added = steps.findIndex(
              (step, at) => workflow.steps[at]?.id !== step.id,
            );
            change(next);
            select({ kind: 'step', index: added < 0 ? workflow.steps.length : added });
          }}
          onAdd={(primitive) => {
            const next = addStep(text, primitive);
            const steps = workflowOf(next).steps;
            const added = steps.findIndex(
              (step, at) => workflow.steps[at]?.id !== step.id,
            );
            change(next);
            select(
              { kind: 'step', index: added < 0 ? workflow.steps.length : added },
              steps,
            );
          }}
        />
        <Button
          variant="secondary"
          disabled={!drawing}
          onClick={() => select({ kind: 'inputs', ids: [] })}
        >
          Inputs
        </Button>
        <Button
          variant="secondary"
          disabled={!drawing || stack.length > 0}
          onClick={() => select({ kind: 'report' })}
        >
          Outputs
        </Button>
      </div>
      {saveError !== null && <ErrorBlock error={saveError} compact />}
      {conflict !== null && (
        <MergeView
          key={conflict.token}
          file="workflow.yaml"
          admin
          baseText={conflict.base}
          mineText={conflict.mine}
          currentText={conflict.current}
          busy={save.isPending}
          onSave={(merged) => {
            void write(merged, { text: conflict.current, token: conflict.token }).then(
              (done) => {
                if (done) dispatch({ kind: 'change', text: merged });
              },
            );
          }}
          onDrop={() => {
            setSaved({ text: conflict.current, token: conflict.token });
            dispatch({ kind: 'change', text: conflict.current });
            setConflict(null);
          }}
        />
      )}
      {(drawing || listed.length > 0) && (
        // A file that does not read is not "nothing to fix", whatever the check says.
        <Problems
          status={check.isError ? 'failed' : check.isPending ? 'pending' : 'done'}
          checking={checking}
          failure={checkFailure}
          placed={drawing ? listed : listed.map((each) => ({ ...each, opens: null }))}
          onOpen={(item) => {
            const path = item.problem.step;
            if (typeof path === 'string' && path.includes('/')) {
              void framesFor(path, workflow, primitiveMap).then((frames) => {
                if (frames !== null && frames.length > 0) {
                  select(null);
                  setStack(frames);
                } else if (item.opens !== null) select(item.opens);
              });
              return;
            }
            if (item.opens !== null) select(item.opens);
          }}
        />
      )}
      {drawing && stack.length > 0 ? (
        <Inside
          root={page.name}
          frames={stack}
          primitives={primitives}
          onCrumb={(index) =>
            setStack((current) => (index < 0 ? [] : current.slice(0, index + 1)))
          }
          onOpen={(frame) => setStack((current) => [...current, frame])}
        />
      ) : drawing ? (
        <Graph
          layout={layout}
          workflow={workflow}
          primitives={primitiveMap}
          workflowBoxes={boxMap}
          onOpenBox={(index) => {
            const step = workflow.steps[index];
            const use = step === undefined ? null : parseUse(step.use);
            if (step === undefined || use === null || primitiveMap.has(step.use))
              return;
            select(null);
            setStack([{ use, title: step.id, rest: [] }]);
          }}
          pinned={pins}
          colours={colours}
          selected={selectedKey}
          readOnly={false}
          dragging={dragging}
          notice={notice}
          refusal={refusal}
          label={menuLabel}
          entries={menuEntries}
          onSelect={(key) =>
            select(selectionOf(layout.boxes.find((box) => box.key === key)))
          }
          onDragStart={(source) => {
            // Starting another wire puts the last refusal away.
            if (source !== null) clearNotice();
            setDragging(source);
          }}
          onDrop={connect}
          reveal={reveal}
          cover={selected === null ? 0 : DRAWER_WIDTH}
        />
      ) : (
        <section className={classes.mend} aria-label="Fix the draft">
          {unreadable !== null ? (
            <>
              <BodyText size="md">
                This draft cannot be drawn, because its file cannot be read. Fix it here
                and save it; Undo steps back through each change. What is wrong:
              </BodyText>
              <pre className={classes.unreadable}>{unreadable}</pre>
            </>
          ) : (
            <BodyText size="md">
              The file can be read again, so the draft can be drawn.
            </BodyText>
          )}
          <CodeEditor
            label={DRAFT_FILE}
            value={text}
            onChange={(next) => {
              setPublished(null);
              dispatch({ kind: 'type', text: next });
            }}
            language="yaml"
            rows={24}
          />
          <div>
            <Button disabled={unreadable !== null} onClick={() => setMending(false)}>
              Back to the graph
            </Button>
          </div>
        </section>
      )}
      <Drawer
        title={drawing ? drawerTitle(selected, workflow) : null}
        onClose={() => select(null)}
      >
        {panel}
      </Drawer>
      <LeaveGuard dirty={dirty} />
    </div>
  );
}
