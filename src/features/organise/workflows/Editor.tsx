import { useMemo, useReducer, useState, type KeyboardEvent } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { $api } from '@/api/query';
import { toApiError, type ApiError } from '@/api/problem';
import type { SaveChange, WorkflowDraft, WorkflowPage } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { UnsavedNote } from '@/ui/UnsavedNote';
import { Button } from '@/ui/Button';
import { Checkbox } from '@/ui/Checkbox';
import { LeaveGuard } from '@/ui/LeaveGuard';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { type MenuEntry } from '@/ui/ActionMenu';
import { useSettled } from '@/lib/use-settled';
import type { Values } from '../forms/values';
import { WorkflowBar } from './Bar';
import { checkQuery } from './check';
import { draftQuery } from './draft';
import { DescriptionField } from './Description';
import { Drawer, DRAWER_WIDTH } from './Drawer';
import {
  formatUse,
  framesFor,
  parseUse,
  portsOf,
  useBoxes,
  useReadingBoxes,
  type Frame,
  type PaletteWorkflow,
} from './boxes';
import {
  addStep,
  addUse,
  clearPort,
  entryFields,
  freeName,
  sharedNames,
  setDescription,
  setEntry,
  setInput,
  wire,
} from './edit';
import {
  sourceAt,
  targetAt,
  workflowSources,
  type Drop,
  type PortTarget,
  type Target,
} from './ends';
import { treeQuery, type WorkflowPlace } from '../files/place';
import { useNotice } from './notice';
import { WorkflowFiles } from './Files';
import type { Staging } from './staged-upload';
import { Graph } from './Graph';
import { Inside } from './Inside';
import { useInputsShown } from './inputs-shown';
import { layoutWorkflow, type Box } from './layout';
import { drawerTitle, selectionOf, type Selected } from './lines';
import { readWorkflow, refsOf, type Ref, type ValueType, type Workflow } from './model';
import { FilePanel, InputsPanel, OutputsPanel, StepPanel } from './Panels';
import { pinned as pinProblems, placed, warnings } from './pins';
import { Problems } from './Problems';
import { byRef, type PrimitiveInfo } from './primitives';
import { PublishVersion, type SaveOutcome } from './Publish';
import {
  dragRefusal,
  outputType,
  outputSources,
  stepInputs,
  stepOutputs,
  portFor,
} from './rules';
import { SaveRefusal } from './SaveRefusal';
import { ShareButton } from './SharePanel';
import { Tray } from './Tray';
import { refWords } from './words';
import classes from './workflows.module.css';

/**
 * The page a workflow's draft is built on, and the only place one is edited
 * (#377). The graph is drawn from the draft's values every time, at its
 * actual size; each change is an edit of the values, kept in the page's
 * history for undo and redo. The bar above says it is the draft and holds
 * Save, "Publish version" and Share (M32); the toolbar under it holds Undo
 * and Redo (M37), and the tray over the graph adds an input, a primitive or
 * a run workflow. The box selected opens in a drawer on the right. A moment
 * after each change the draft is checked as a version would be, and each
 * problem is said in the banner, linked to its box, and beside its mark on
 * the box (M31). A draft with problems saves; a version of one is refused. A
 * save over someone else's is refused, and the draft is reloaded.
 */

type History = {
  past: Values[];
  present: Values;
  future: Values[];
};
type Action = { kind: 'change'; values: Values } | { kind: 'undo' } | { kind: 'redo' };

function same(a: Values, b: Values): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function history(state: History, action: Action): History {
  switch (action.kind) {
    case 'change':
      if (same(action.values, state.present)) return state;
      return {
        past: [...state.past, state.present],
        present: action.values,
        future: [],
      };
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
  }
}

/**
 * What a version would be refused for, checked a moment after each change.
 * The last answer stays while the next is awaited, so the problems and their
 * marks do not leave and come back on every edit; `checking` says the answer
 * is not yet for the values as they are.
 */
function useCheck(values: Values, paths: readonly string[] | undefined) {
  const settled = useSettled(values, 400);
  const check = useQuery({
    ...checkQuery(settled, paths),
    placeholderData: keepPreviousData,
  });
  return { check, checking: settled !== values || check.isPlaceholderData };
}

/** The key of the box a selection stands on (`layout.ts`), or null for none. */
function boxOf(selected: Selected | null): string | null {
  if (selected === null) return null;
  if (selected.kind === 'outputs') return 'outputs';
  if (selected.kind === 'files') return null;
  if (selected.kind === 'step') return `step:${String(selected.index)}`;
  if (selected.kind === 'file') return `file:${selected.path}`;
  return `input:${selected.id}`;
}

/**
 * What the author chose, a step held by its id and its place: an edit, an
 * undo or a merge that moves the step in the list leaves it chosen, and a
 * rename, which keeps its place, too.
 */
type Chosen =
  Exclude<Selected, { kind: 'step' }> | { kind: 'step'; id: string; index: number };

function chosenStep(chosen: Chosen | null, workflow: Workflow): Selected | null {
  // An input removed, by its drawer, an undo or a merge, is no longer chosen.
  if (chosen?.kind === 'input')
    return workflow.inputs.some((input) => input.id === chosen.id) ? chosen : null;
  // So is a file no step reads any more, as it has no box.
  if (chosen?.kind === 'file')
    return workflow.steps.some((step) =>
      Object.values(step.with).some((value) =>
        refsOf(value).some(
          (ref) => ref.kind === 'workflow' && ref.name === chosen.path,
        ),
      ),
    )
      ? chosen
      : null;
  if (chosen?.kind !== 'step') return chosen;
  const found = workflow.steps.findIndex((step) => step.id === chosen.id);
  const index = found >= 0 ? found : chosen.index;
  return index < workflow.steps.length ? { kind: 'step', index } : null;
}

/** What a new input of each type is called, before a number makes it unique. */
const INPUT_NAMES: Record<ValueType, string> = {
  text: 'text',
  number: 'number',
  boolean: 'switch',
  enum: 'choice',
  file: 'file',
  folder: 'folder',
};

export function Editor({
  page,
  draft,
  primitives,
  onReload,
}: {
  page: WorkflowPage;
  draft: WorkflowDraft & { values: Values };
  primitives: PrimitiveInfo[];
  /** Reads the draft again, dropping the changes made here. */
  onReload: () => void;
}) {
  const { owner, name } = page;
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(history, {
    past: [],
    present: draft.values,
    future: [],
  });
  const values = state.present;
  const [saved, setSaved] = useState({ values: draft.values, token: draft.token });
  const [revision, setRevision] = useState(draft.revision);
  const [fileChanges, setFileChanges] = useState<SaveChange[]>([]);
  const [uploading, setUploading] = useState(false);
  const filePlace: WorkflowPlace = { kind: 'workflow', owner, name };
  const savedFiles = useQuery({
    queryKey: [
      ...$api.queryOptions('get', '/api/v1/workflows/{owner}/{name}/tree', {
        params: { path: { owner, name } },
      }).queryKey,
      'wire-sources',
    ],
    queryFn: async () => {
      const paths: string[] = [];
      const folders = [''];
      const visited = new Set<string>();
      for (let at = 0; at < folders.length; at += 1) {
        const folder = folders[at];
        if (folder === undefined || visited.has(folder)) continue;
        visited.add(folder);
        const entries = await queryClient.fetchQuery({
          ...treeQuery(filePlace, folder),
          staleTime: Infinity,
        });
        for (const entry of entries) {
          if (entry.kind === 'directory') folders.push(entry.path);
          else paths.push(entry.path);
        }
      }
      return paths;
    },
  });

  const [chosen, setChosen] = useState<Chosen | null>(null);
  const [nonce, setNonce] = useState(0);
  const [dragging, setDragging] = useState<Ref | null>(null);
  const { notice, show: showNotice, clear: clearNotice } = useNotice();
  const [saveError, setSaveError] = useState<ApiError | null>(null);
  const [published, setPublished] = useState<string | null>(null);
  const [stack, setStack] = useState<Frame[]>([]);

  const primitiveMap = useMemo(() => byRef(primitives), [primitives]);
  const workflow = useMemo(() => readWorkflow(values), [values]);
  const readable = $api.useQuery('get', '/api/v1/workflows', {}, { retry: false });
  const paletteRefs = useMemo(() => {
    const found: PaletteWorkflow[] = [];
    for (const item of readable.data ?? [])
      for (const version of item.versions) {
        if (item.yanked?.[version]) continue;
        const ref = `${item.owner}/${item.name}@${version}`;
        if (item.owner === page.owner && item.name === page.name) continue;
        if (!primitiveMap.has(ref))
          found.push({
            owner: item.owner,
            name: item.name,
            version,
            visibility: item.visibility,
          });
      }
    return found;
  }, [readable.data, primitiveMap, page.owner, page.name]);
  const boxRefs = useMemo(() => {
    const seen = new Set(paletteRefs.map((use) => formatUse(use)));
    const found: Frame['use'][] = [...paletteRefs];
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
  const readingBoxes = useReadingBoxes();
  const palette = useMemo(
    () =>
      paletteRefs.flatMap((use) => {
        const box = boxMap.get(formatUse(use));
        return box === undefined ? [] : [{ ...use, box }];
      }),
    [paletteRefs, boxMap],
  );
  const ports = useMemo(() => portsOf(boxMap), [boxMap]);
  const checkedPaths = useMemo(() => {
    if (savedFiles.data === undefined) return undefined;
    const paths = new Set(savedFiles.data);
    for (const change of fileChanges) {
      if (change.remove) paths.delete(change.path);
      else paths.add(change.path);
    }
    return [...paths].sort();
  }, [savedFiles.data, fileChanges]);
  const { check, checking } = useCheck(values, checkedPaths);
  const problems = useMemo(() => check.data ?? [], [check.data]);
  const pins = useMemo(
    () =>
      pinProblems(
        problems,
        workflow.steps.length,
        workflow.inputs.map((input) => input.id),
        workflow.outputs.map((entry) => entry.name),
      ),
    [problems, workflow],
  );
  const listed = useMemo(() => placed(problems, workflow), [problems, workflow]);
  const warned = useMemo(
    () => warnings(pins, workflow, (use) => boxMap.get(use)?.newer ?? null),
    [pins, workflow, boxMap],
  );
  const selected = useMemo(() => chosenStep(chosen, workflow), [chosen, workflow]);
  const selectedKey = boxOf(selected);
  const [inputsShown, showInputs] = useInputsShown();
  const layout = useMemo(
    () =>
      layoutWorkflow(workflow, primitiveMap, ports, {
        open: new Set(selectedKey === null ? [] : [selectedKey]),
        warned: new Set(warned.keys()),
        inputs: inputsShown ? 'shown' : 'hidden',
      }),
    [workflow, primitiveMap, ports, selectedKey, warned, inputsShown],
  );
  /** Where the step `steps` has that the workflow had not stands. */
  const addedAt = (steps: Workflow['steps']): number => {
    const at = steps.findIndex((step, index) => workflow.steps[index]?.id !== step.id);
    return at < 0 ? workflow.steps.length : at;
  };

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
  const first = stack[0];
  if (first !== undefined && selected?.kind === 'step') {
    // Inside a box, only Details selects a step of the draft: the step the
    // box is. A rename follows it; another version is that version's inside.
    const step = workflow.steps[selected.index];
    const use = step === undefined ? null : parseUse(step.use);
    if (step === undefined || use === null || primitiveMap.has(step.use)) setStack([]);
    else if (formatUse(use) !== formatUse(first.use))
      setStack([{ use, title: step.id, rest: [], mark: null }]);
    else if (step.id !== first.title)
      setStack([{ ...first, title: step.id }, ...stack.slice(1)]);
  }
  const reveal = useMemo(
    () => (selectedKey === null ? null : { key: selectedKey, nonce }),
    [selectedKey, nonce],
  );
  const dirty = useMemo(
    () => !same(values, saved.values) || fileChanges.length > 0 || uploading,
    [values, saved.values, fileChanges, uploading],
  );

  const change = (next: Values) => {
    clearNotice();
    setPublished(null);
    dispatch({ kind: 'change', values: next });
  };
  const edit = (apply: (current: Values) => Values) => change(apply(values));

  const save = $api.useMutation('put', '/api/v1/workflows/{owner}/{name}/draft');

  /** Saves the values as they are now; says what the draft was saved as, or why it was not. */
  const write = async (): Promise<SaveOutcome> => {
    const sent = values;
    setSaveError(null);
    try {
      const written = await save.mutateAsync({
        params: { path: { owner, name } },
        body: {
          values: sent,
          token: saved.token,
          ...(fileChanges.length === 0 ? {} : { changes: fileChanges }),
        },
      });
      setSaved({ values: sent, token: written.token });
      setRevision(written.revision);
      setFileChanges([]);
      queryClient.setQueryData(draftQuery(owner, name).queryKey, written);
      await queryClient.invalidateQueries({
        queryKey: $api.queryOptions('get', '/api/v1/workflows/{owner}/{name}/tree', {
          params: { path: { owner, name } },
        }).queryKey,
      });
      return { token: written.token, revision: written.revision };
    } catch (caught) {
      const error = toApiError(caught);
      setSaveError(error);
      return { refused: error.detail ?? error.message };
    }
  };

  /** The port a wire dropped on `target` goes to, picked on a step's box, or why none. */
  const portOf = (source: Ref, target: Target): PortTarget | string => {
    if (target.kind !== 'step') return target;
    const picked = portFor(workflow, primitiveMap, target.step, source, boxMap);
    return 'reason' in picked
      ? picked.reason
      : { kind: 'port', step: target.step, port: picked.port };
  };

  /**
   * Why a wire can't be dropped on `target` while dragging; on a closed box,
   * naming the port picked, which it does not show. The check says the rest
   * after the drop.
   */
  const refusal = (source: Ref, target: Target): string | null => {
    const to = portOf(source, target);
    if (typeof to === 'string') return to;
    // An output is named after the step output it reads.
    if (to.kind === 'outputs')
      return source.kind === 'steps'
        ? null
        : 'Only a step’s output goes in the outputs.';
    const refused = dragRefusal(
      workflow,
      primitiveMap,
      to.step,
      to.port,
      source,
      boxMap,
    );
    return refused !== null && target.kind === 'step'
      ? `${to.port}: ${refused}`
      : refused;
  };

  /** `base` with `source` wired into `target`, a port or the outputs. */
  const wired = (base: Values, source: Ref, target: PortTarget): Values => {
    if (target.kind === 'port') return wire(base, target.step, target.port, source);
    if (source.kind !== 'steps') return base;
    const existing = workflow.outputs.find((entry) => entry.name === target.entry);
    if (existing !== undefined)
      return setEntry(
        base,
        existing.name,
        entryFields(existing, outputType(workflow, primitiveMap, source, boxMap), {
          from: source,
        }),
      );
    return setEntry(base, freeName(source.output, sharedNames(workflow), '_'), {
      from: source,
    });
  };

  /**
   * Where a wire from `source` dropped on `target` goes, or null when it is
   * refused, said at the box `box` it was dropped on, at the port picked.
   */
  const accepted = (
    source: Ref,
    target: Target,
    box: string,
    port: string,
  ): PortTarget | null => {
    const to = portOf(source, target);
    if (typeof to === 'string') {
      showNotice({ box, port, reason: to });
      return null;
    }
    const refused = refusal(source, target);
    if (refused === null) return to;
    showNotice({ box, port: to.kind === 'port' ? to.port : port, reason: refused });
    return null;
  };

  const connect = (source: Ref, target: Target, box: string, port: string) => {
    const to = accepted(source, target, box, port);
    if (to !== null) change(wired(values, source, to));
  };

  /**
   * A wire's end lifted off the port `from` and dropped on `target`, moved
   * there in one change; dropped on nothing, the port is cleared.
   */
  const lift = (
    source: Ref,
    from: { step: number; port: string },
    drop: Drop | null,
  ) => {
    if (drop === null) {
      change(clearPort(values, from.step, from.port));
      return;
    }
    const to = accepted(source, drop.target, drop.box, drop.port);
    if (
      to === null ||
      (to.kind === 'port' && to.step === from.step && to.port === from.port)
    )
      return;
    change(wired(clearPort(values, from.step, from.port), source, to));
  };

  /** Shows the inside of the workflow the step at `index` runs. */
  const openBox = (index: number) => {
    const step = workflow.steps[index];
    const use = step === undefined ? null : parseUse(step.use);
    if (step === undefined || use === null || primitiveMap.has(step.use)) return;
    select(null);
    setStack([{ use, title: step.id, rest: [], mark: null }]);
  };

  const files = workflowSources(savedFiles.data ?? [], fileChanges);
  const staging: Staging = {
    place: filePlace,
    changes: fileChanges,
    onChange: (update) => {
      setFileChanges(update);
      setPublished(null);
    },
    onBusy: setUploading,
    disabled: uploading || save.isPending,
  };

  /** Every source a port could be wired from, in the order the file declares them. */
  const sources = (): Ref[] => [
    ...workflow.inputs.map((input): Ref => ({ kind: 'inputs', name: input.id })),
    ...workflow.steps.flatMap((step) =>
      stepOutputs(primitiveMap, boxMap, step).map((output): Ref => ({
        kind: 'steps',
        name: step.id,
        output: output.name,
      })),
    ),
    ...files,
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
            ? stepInputs(primitiveMap, boxMap, step)?.find(
                (input) => input.name === port,
              )
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
              const id = freeName(port, sharedNames(workflow), '_');
              const declared = setInput(values, id, {
                type: decl.type,
                options: decl.options,
              });
              change(wire(declared, target.step, port, { kind: 'inputs', name: id }));
            },
          });
        }
        if (value !== undefined)
          entries.push({
            kind: 'item',
            text: value.kind === 'wire' ? 'Remove the wire' : 'Clear the value',
            onSelect: () => change(clearPort(values, target.step, port)),
          });
      } else {
        entries.push({ kind: 'heading', text: 'Read from' });
        for (const source of outputSources(workflow, primitiveMap, boxMap))
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
          onSelect: () => select({ kind: 'outputs' }),
        });
      }
    } else {
      const source = sourceAt(box, port, workflow);
      if (source === null) return entries;
      if (source.kind === 'steps') {
        entries.push({
          kind: 'item',
          text: 'Name it as an output',
          onSelect: () =>
            connect(source, { kind: 'outputs', entry: null }, 'outputs', '+'),
        });
      }
      entries.push({ kind: 'heading', text: 'Wire to' });
      workflow.steps.forEach((step, index) => {
        for (const { name: target } of stepInputs(primitiveMap, boxMap, step) ?? []) {
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
      // Nothing is changed inside a box.
      stack.length > 0 ||
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
        key={workflow.steps[selected.index]?.id ?? selected.index}
        workflow={workflow}
        primitives={primitiveMap}
        boxes={boxMap}
        reading={readingBoxes}
        pinned={pins}
        index={selected.index}
        fitting={(port) => {
          const target: Target = { kind: 'port', step: selected.index, port };
          return sources().filter((source) => refusal(source, target) === null);
        }}
        change={edit}
        onRemoved={() => {
          select(null);
          setStack([]);
        }}
        onZoom={() => openBox(selected.index)}
      />
    ) : selected.kind === 'input' ? (
      <InputsPanel
        workflow={workflow}
        pinned={pins}
        id={selected.id}
        files={files}
        staging={staging}
        change={edit}
        onRenamed={(id) => select({ kind: 'input', id })}
        onGiven={(path) => select({ kind: 'file', path })}
      />
    ) : selected.kind === 'file' ? (
      <FilePanel
        workflow={workflow}
        path={selected.path}
        files={files}
        listed={savedFiles.isSuccess}
        staging={staging}
        change={edit}
        onMoved={(path) => select({ kind: 'file', path })}
        onSupplied={(id) => select({ kind: 'input', id })}
      />
    ) : selected.kind === 'files' ? (
      <WorkflowFiles key={revision ?? 'draft'} {...staging} workflow={workflow} />
    ) : (
      <OutputsPanel
        workflow={workflow}
        primitives={primitiveMap}
        boxes={boxMap}
        pinned={pins}
        change={edit}
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
        tools={
          stack.length === 0 ? (
            <>
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
              <Button variant="secondary" onClick={() => select({ kind: 'files' })}>
                Files
              </Button>
              <Checkbox
                label="Show inputs and files"
                checked={inputsShown}
                onChange={showInputs}
              />
            </>
          ) : undefined
        }
      >
        <Button
          disabled={!dirty || uploading}
          loading={save.isPending}
          onClick={() => void write()}
        >
          Save
        </Button>
        <PublishVersion
          owner={owner}
          name={name}
          versions={page.versions}
          token={saved.token}
          revision={revision}
          dirty={dirty}
          problems={check.isSuccess ? problems.length : 0}
          checking={checking || check.isPending}
          onSave={write}
          canSave={!uploading && !save.isPending}
          onPublished={setPublished}
        />
        <ShareButton page={page} />
      </WorkflowBar>
      {published !== null && (
        <p role="status" className={classes.note}>
          {published} is published. Tasks can choose it now.
        </p>
      )}
      {saveError !== null && <SaveRefusal error={saveError} onReload={onReload} />}
      {savedFiles.isError && (
        <ErrorBlock
          error={toApiError(savedFiles.error)}
          compact
          onRetry={() => void savedFiles.refetch()}
        />
      )}
      <Problems
        status={check.isError ? 'failed' : check.isPending ? 'pending' : 'done'}
        checking={checking}
        failure={checkFailure}
        placed={listed}
        onOpen={(item) => {
          const path = item.problem.step;
          if (typeof path === 'string' && path.includes('/')) {
            void framesFor(path, workflow, primitiveMap).then((frames) => {
              if (frames !== null && frames.length > 0) {
                select(null);
                setStack(frames);
              } else if (item.opens !== null) {
                setStack([]);
                select(item.opens);
              }
            });
            return;
          }
          if (item.opens !== null) {
            // A problem of the draft is shown at the draft, out of any box.
            setStack([]);
            select(item.opens);
          }
        }}
      />
      {stack.length === 0 && (
        <DescriptionField
          value={workflow.description}
          apply={(said) => change(setDescription(values, said))}
        />
      )}
      {stack.length === 0 && (
        <Tray
          exclude={`${page.owner}/${page.name}`}
          primitives={primitives}
          workflows={palette}
          finding={
            readable.isError
              ? 'failed'
              : readable.isPending || readingBoxes
                ? 'reading'
                : 'done'
          }
          onInput={(type) => {
            // Inputs and outputs are one set of names, which the forge
            // writes with underscores.
            const id = freeName(INPUT_NAMES[type], sharedNames(workflow), '_');
            change(
              setInput(values, id, {
                type,
                options: type === 'enum' ? ['a', 'b'] : null,
              }),
            );
            select({ kind: 'input', id });
          }}
          onPrimitive={(primitive) => {
            const next = addStep(values, primitive);
            const steps = readWorkflow(next).steps;
            change(next);
            select({ kind: 'step', index: addedAt(steps) }, steps);
          }}
          onWorkflow={(chosen) => {
            const next = addUse(values, formatUse(chosen), chosen.name);
            const steps = readWorkflow(next).steps;
            change(next);
            select({ kind: 'step', index: addedAt(steps) }, steps);
          }}
        />
      )}
      {stack.length > 0 ? (
        <Inside
          root={page.name}
          draft={{ workflow, boxes: boxMap, layout }}
          frames={stack}
          primitives={primitives}
          onCrumb={(index) =>
            setStack((current) => (index < 0 ? [] : current.slice(0, index + 1)))
          }
          onGo={(next, box) => {
            select(next.length === 0 ? selectionOf(box?.key) : null);
            setStack(next);
          }}
          onDetails={(index) => select({ kind: 'step', index })}
        />
      ) : (
        <Graph
          layout={layout}
          workflow={workflow}
          primitives={primitiveMap}
          workflowBoxes={boxMap}
          onOpenBox={openBox}
          pinned={pins}
          warnings={warned}
          selected={selectedKey}
          readOnly={false}
          dragging={dragging}
          notice={notice}
          refusal={refusal}
          label={menuLabel}
          entries={menuEntries}
          onSelect={(key) => select(selectionOf(key))}
          onDragStart={(source) => {
            // Starting another wire puts the last refusal away.
            if (source !== null) clearNotice();
            setDragging(source);
          }}
          onDrop={connect}
          onLift={lift}
          reveal={reveal}
          cover={selected === null ? 0 : DRAWER_WIDTH}
        />
      )}
      <Drawer title={drawerTitle(selected, workflow)} onClose={() => select(null)}>
        {panel}
      </Drawer>
      <LeaveGuard dirty={dirty} what="Your changes to the draft" search />
    </div>
  );
}
