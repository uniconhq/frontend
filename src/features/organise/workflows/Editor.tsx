import { useEffect, useMemo, useReducer, useState, type KeyboardEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { $api } from '@/api/query';
import { toApiError, type ApiError } from '@/api/problem';
import type { DefinitionProblem, WorkflowPage } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { CodeEditor } from '@/ui/CodeEditor';
import { SectionTitle } from '@/ui/SectionTitle';
import { TextInput } from '@/ui/TextInput';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { ActionMenu, type MenuEntry } from '@/ui/ActionMenu';
import { useMarkColours } from '@/ui/brand/mark-colours';
import { MergeView } from '../forms/MergeView';
import { parseYaml } from '../forms/yaml-doc';
import {
  addStep,
  clearPort,
  freeName,
  setEntry,
  setField,
  setInput,
  wire,
  workflowOf,
} from './edit';
import { sourceAt, targetAt, type Notice, type Target } from './ends';
import { Graph } from './Graph';
import { layoutWorkflow, type Box } from './layout';
import { linesOf, type Selected } from './lines';
import { refLabel, type Ref, type Workflow } from './model';
import { FieldsPanel, InputsPanel, Palette, ReportPanel, StepPanel } from './Panels';
import { pinned as pinProblems } from './pins';
import { byRef, declared, type PrimitiveInfo } from './primitives';
import { reportable, reportRefusal, wireRefusal } from './rules';
import { SharePanel } from './SharePanel';
import classes from './workflows.module.css';

/**
 * The page a workflow is built on, and the only place one is edited (#377).
 * The graph is drawn from the draft every time; each change is an edit of
 * the YAML document in place, kept in the page's history for undo and
 * redo; beside the graph is the file a save writes, read-only. A moment
 * after each change the definition is checked as a version would be, and
 * each problem is pinned by its path to the box, port or row it names. A
 * draft with problems saves; a version of one is refused. A save over
 * someone else's opens the merge view, steps matched by id.
 */

type History = { past: string[]; present: string; future: string[] };
type Action =
  | { kind: 'change'; text: string }
  | { kind: 'undo' }
  | { kind: 'redo' }
  | { kind: 'reset'; text: string };

function history(state: History, action: Action): History {
  switch (action.kind) {
    case 'change':
      if (action.text === state.present) return state;
      return { past: [...state.past, state.present], present: action.text, future: [] };
    case 'undo': {
      const previous = state.past.at(-1);
      if (previous === undefined) return state;
      return {
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future],
      };
    }
    case 'redo': {
      const [next, ...rest] = state.future;
      if (next === undefined) return state;
      return { past: [...state.past, state.present], present: next, future: rest };
    }
    case 'reset':
      return { past: [], present: action.text, future: [] };
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

/** What a version would be refused for, checked a moment after each change. */
function useCheck(text: string) {
  const settled = useSettled(text, 400);
  return useQuery({
    queryKey: ['workflow-check', settled],
    queryFn: async () => {
      const { data } = await apiClient.POST('/api/v1/workflows/check', {
        body: { content: settled },
      });
      return data?.problems ?? [];
    },
    staleTime: Infinity,
    retry: false,
  });
}

/** The box a selection stands on now, found again after the layout moved. */
function boxOf(
  boxes: Box[],
  workflow: Workflow,
  selected: Selected | null,
): string | null {
  if (selected === null) return null;
  if (selected.kind === 'report') return 'report';
  if (selected.kind === 'step') return `step:${String(selected.index)}`;
  const kind = selected.kind;
  const names = kind === 'inputs' ? selected.ids : selected.names;
  void workflow;
  return (
    boxes.find(
      (box) => box.kind === kind && box.right.some((name) => names.includes(name)),
    )?.key ?? null
  );
}

function selectionOf(box: Box | undefined): Selected | null {
  if (box === undefined) return null;
  if (box.kind === 'step' && box.step !== null)
    return { kind: 'step', index: box.step };
  if (box.kind === 'inputs') return { kind: 'inputs', ids: box.right };
  if (box.kind === 'test') return { kind: 'test', names: box.right };
  if (box.kind === 'report') return { kind: 'report' };
  return null;
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
  });
  const text = state.present;
  const [saved, setSaved] = useState({
    text: page.draft.content,
    token: page.draft.token,
  });
  const [selected, setSelected] = useState<Selected | null>(null);
  const [dragging, setDragging] = useState<Ref | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [conflict, setConflict] = useState<{
    mine: string;
    current: string;
    token: string | null;
  } | null>(null);
  const [saveError, setSaveError] = useState<ApiError | null>(null);
  const [version, setVersion] = useState(`v${String(page.versions.length + 1)}`);
  const [versioned, setVersioned] = useState<
    | { kind: 'made'; version: string }
    | { kind: 'refused'; error: ApiError; problems: DefinitionProblem[] }
    | null
  >(null);

  const primitiveMap = useMemo(() => byRef(primitives), [primitives]);
  const parsed = useMemo(() => parseYaml(text), [text]);
  const workflow = useMemo(() => workflowOf(text), [text]);
  const layout = useMemo(
    () => layoutWorkflow(workflow, primitiveMap),
    [workflow, primitiveMap],
  );
  const check = useCheck(text);
  const problems = useMemo(() => check.data ?? [], [check.data]);
  const pins = useMemo(
    () =>
      pinProblems(
        problems,
        workflow.steps.length,
        workflow.inputs.map((input) => input.id),
        workflow.test.map((field) => field.name),
        workflow.report.map((entry) => entry.name),
      ),
    [problems, workflow],
  );
  const selectedKey = boxOf(layout.boxes, workflow, selected);
  const marked = useMemo(() => linesOf(text, selected), [text, selected]);
  const dirty = text !== saved.text;

  const change = (next: string) => {
    setNotice(null);
    setVersioned(null);
    dispatch({ kind: 'change', text: next });
  };

  const pageKey = $api.queryOptions('get', '/api/v1/workflows/{owner}/{name}', {
    params: { path: { owner, name } },
  }).queryKey;
  const save = $api.useMutation('put', '/api/v1/workflows/{owner}/{name}/draft');
  const makeVersion = $api.useMutation(
    'post',
    '/api/v1/workflows/{owner}/{name}/versions',
  );

  const write = async (content: string, token: string | null) => {
    setSaveError(null);
    try {
      const written = await save.mutateAsync({
        params: { path: { owner, name } },
        body: { content, token },
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

  const createVersion = async () => {
    setVersioned(null);
    try {
      const made = await makeVersion.mutateAsync({
        params: { path: { owner, name } },
        body: { version: version.trim(), token: saved.token },
      });
      setVersioned({ kind: 'made', version: made.version });
      setVersion(`v${String(page.versions.length + 2)}`);
      await queryClient.invalidateQueries({ queryKey: pageKey });
    } catch (caught) {
      const error = toApiError(caught);
      const errors = Array.isArray(error.extensions.errors)
        ? (error.extensions.errors as DefinitionProblem[])
        : [];
      setVersioned({ kind: 'refused', error, problems: errors });
    }
  };

  const refusal = (source: Ref, target: Target): string | null =>
    target.kind === 'port'
      ? wireRefusal(workflow, primitiveMap, target.step, target.port, source)
      : reportRefusal(
          workflow,
          primitiveMap,
          source,
          workflow.report.find((entry) => entry.name === target.entry) ?? null,
        );

  const connect = (source: Ref, target: Target, box: string, port: string) => {
    const refused = refusal(source, target);
    if (refused !== null) {
      setNotice({ box, port, reason: refused });
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
        setEntry(text, existing.name, {
          from: source,
          fold: existing.fold,
          better: existing.better,
          at_least: existing.atLeast,
          at_most: existing.atMost,
        }),
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
    ...workflow.test.map((field): Ref => ({ kind: 'test', name: field.name })),
    ...workflow.steps.flatMap((step) =>
      Object.keys(declared(primitiveMap, step.use)?.outputs ?? {})
        .filter((output) => output !== 'outcome')
        .map((output): Ref => ({ kind: 'steps', name: step.id, output })),
    ),
  ];

  const menu = (box: Box, port: string, side: 'left' | 'right') => {
    const entries: MenuEntry[] = [];
    let label: string;
    if (side === 'left') {
      const target = targetAt(box, port);
      if (target === null) return <span>{port}</span>;
      if (target.kind === 'port') {
        const step = workflow.steps[target.step];
        label = `The port ${port} of ${step?.id ?? ''}`;
        entries.push({ kind: 'heading', text: 'Wire from' });
        for (const source of sources())
          entries.push({
            kind: 'item',
            text: refLabel(source),
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
            text: 'Give it a value in the step’s panel',
            onSelect: () => setSelected({ kind: 'step', index: target.step }),
          });
          entries.push({
            kind: 'item',
            text: `A new input of type ${decl.type}, wired here`,
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
          if (step?.perTest)
            entries.push({
              kind: 'item',
              text: `A new test field of type ${decl.type}, wired here`,
              onSelect: () => {
                const field = freeName(
                  port.replaceAll('_', '-'),
                  workflow.test.map((each) => each.name),
                );
                const declaredText = setField(text, field, {
                  type: decl.type,
                  options: decl.options,
                });
                change(
                  wire(declaredText, target.step, port, { kind: 'test', name: field }),
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
        label = `The report entry ${port}`;
        entries.push({ kind: 'heading', text: 'Read from' });
        for (const source of reportable(workflow, primitiveMap))
          entries.push({
            kind: 'item',
            text: refLabel(source),
            reason: refusal(source, target),
            onSelect: () => connect(source, target, box.key, port),
          });
        entries.push({ kind: 'divider' });
        entries.push({
          kind: 'item',
          text: 'Edit it in the report’s panel',
          onSelect: () => setSelected({ kind: 'report' }),
        });
      }
    } else {
      const source = sourceAt(box, port, workflow);
      if (source === null) return <span>{port}</span>;
      label = `The output ${refLabel(source)}`;
      if (source.kind === 'steps') {
        const reported = reportRefusal(workflow, primitiveMap, source);
        entries.push({
          kind: 'item',
          text: 'Report it',
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
            text: `${step.id}.${target}`,
            reason: refusal(source, to),
            onSelect: () => connect(source, to, `step:${String(index)}`, target),
          });
        }
      });
    }
    return (
      <ActionMenu
        text={port}
        label={label}
        entries={entries}
        className={classes.port}
      />
    );
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

  if ('error' in parsed)
    return (
      <Card>
        <BodyText>
          workflow.yaml is not YAML this page can read, so it cannot be drawn:{' '}
          {parsed.error}
        </BodyText>
        <CodeEditor label="workflow.yaml" value={text} readOnly language="yaml" />
      </Card>
    );
  if (workflow.legacy)
    return (
      <Card>
        <BodyText>
          This draft is in the format before 2026-10-07, which the page draws but does
          not edit. Copy a version of a current workflow, or start a new one.
        </BodyText>
      </Card>
    );

  const panel =
    selected === null ? (
      <Palette
        primitives={primitives}
        onAdd={(primitive, perTest) => {
          const next = addStep(text, primitive, perTest);
          const added = workflowOf(next).steps.findIndex(
            (step, at) => workflow.steps[at]?.id !== step.id,
          );
          change(next);
          setSelected({
            kind: 'step',
            index: added < 0 ? workflow.steps.length : added,
          });
        }}
      />
    ) : selected.kind === 'step' ? (
      <StepPanel
        text={text}
        workflow={workflow}
        primitives={primitiveMap}
        pinned={pins}
        index={selected.index}
        change={change}
        onRemoved={() => setSelected(null)}
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
    ) : selected.kind === 'test' ? (
      <FieldsPanel
        text={text}
        workflow={workflow}
        primitives={primitiveMap}
        pinned={pins}
        names={selected.names.length > 0 ? selected.names : null}
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

  return (
    <div className={classes.editor} onKeyDown={onKeyDown}>
      <div className={classes.toolbar} role="toolbar" aria-label="The workflow">
        <Button
          size="xs"
          disabled={!dirty}
          loading={save.isPending}
          onClick={() => void write(text, saved.token)}
        >
          Save
        </Button>
        <Button
          size="xs"
          variant="secondary"
          disabled={state.past.length === 0}
          onClick={() => dispatch({ kind: 'undo' })}
        >
          Undo
        </Button>
        <Button
          size="xs"
          variant="secondary"
          disabled={state.future.length === 0}
          onClick={() => dispatch({ kind: 'redo' })}
        >
          Redo
        </Button>
        <Button size="xs" variant="secondary" onClick={() => setSelected(null)}>
          Primitives
        </Button>
        <Button
          size="xs"
          variant="secondary"
          onClick={() => setSelected({ kind: 'inputs', ids: [] })}
        >
          Inputs
        </Button>
        <Button
          size="xs"
          variant="secondary"
          onClick={() => setSelected({ kind: 'test', names: [] })}
        >
          Test fields
        </Button>
        <Button
          size="xs"
          variant="secondary"
          onClick={() => setSelected({ kind: 'report' })}
        >
          Report
        </Button>
        <BodyText size="sm" tone="meta">
          {dirty ? 'Changes not saved yet.' : 'Saved.'}
        </BodyText>
      </div>
      {saveError !== null && <ErrorBlock error={saveError} />}
      {conflict !== null && (
        <MergeView
          file="workflow.yaml"
          admin
          baseText={saved.text}
          mineText={conflict.mine}
          currentText={conflict.current}
          busy={save.isPending}
          onSave={(merged) => {
            void write(merged, conflict.token).then((done) => {
              if (done) dispatch({ kind: 'change', text: merged });
            });
          }}
          onDrop={() => {
            setSaved({ text: conflict.current, token: conflict.token });
            dispatch({ kind: 'change', text: conflict.current });
            setConflict(null);
          }}
        />
      )}
      <section aria-label="What a version would be refused for">
        {check.isError ? (
          <BodyText size="sm">
            The check did not run, so this page cannot say what a version would be
            refused for:{' '}
            {toApiError(check.error).detail ?? toApiError(check.error).message}
          </BodyText>
        ) : check.isPending ? null : problems.length === 0 ? (
          <BodyText size="sm" tone="secondary">
            This definition passes every check a version must.
          </BodyText>
        ) : (
          <>
            <BodyText size="sm">
              {problems.length === 1
                ? 'One problem'
                : `${String(problems.length)} problems`}{' '}
              a version would be refused for. A draft saves with them; each is marked
              where it is.
            </BodyText>
            {pins.page.length > 0 && (
              <ul
                className={classes.problems}
                aria-label="Problems with the workflow as a whole"
              >
                {pins.page.map((problem) => (
                  <li key={`${problem.path} ${problem.message}`}>
                    {problem.path !== '' && <code>{problem.path}</code>}{' '}
                    {problem.message}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>
      <div className={classes.work}>
        <Graph
          layout={layout}
          workflow={workflow}
          primitives={primitiveMap}
          pinned={pins}
          colours={colours}
          selected={selectedKey}
          readOnly={false}
          dragging={dragging}
          notice={notice}
          refusal={refusal}
          menu={menu}
          onSelect={(key) =>
            setSelected(selectionOf(layout.boxes.find((box) => box.key === key)))
          }
          onDragStart={setDragging}
          onDrop={connect}
        />
        <div className={classes.side}>
          <Card>{panel}</Card>
        </div>
      </div>
      <div className={classes.work}>
        <CodeEditor
          label="workflow.yaml as a save writes it"
          value={text}
          readOnly
          language="yaml"
          rows={24}
          marked={marked}
        />
        <div className={classes.side}>
          <Card>
            <form
              className={classes.stack}
              aria-label="Make a version"
              onSubmit={(event) => {
                event.preventDefault();
                void createVersion();
              }}
            >
              <SectionTitle order={3}>Versions</SectionTitle>
              <BodyText size="sm" tone="secondary">
                {page.versions.length === 0 ? 'None yet.' : page.versions.join(', ')}
              </BodyText>
              <TextInput
                label="New version"
                value={version}
                onChange={setVersion}
                description={
                  dirty
                    ? 'Save first: a version is made of what is saved.'
                    : 'A version never changes; a task names one.'
                }
              />
              <div>
                <Button
                  size="xs"
                  type="submit"
                  disabled={dirty || version.trim() === ''}
                  loading={makeVersion.isPending}
                >
                  Make the version
                </Button>
              </div>
              {versioned?.kind === 'made' && (
                <p role="status" className={classes.note}>
                  {owner}/{name}@{versioned.version} is made.
                </p>
              )}
              {versioned?.kind === 'refused' && (
                <div role="alert">
                  <BodyText size="sm">
                    No version was made:{' '}
                    {versioned.error.detail ?? versioned.error.message}
                  </BodyText>
                  {versioned.problems.length > 0 && (
                    <ul className={classes.problems}>
                      {versioned.problems.map((problem) => (
                        <li key={`${problem.path} ${problem.message}`}>
                          <code>{problem.path}</code>: {problem.message}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </form>
          </Card>
          <Card>
            <SharePanel page={page} />
          </Card>
        </div>
      </div>
    </div>
  );
}
