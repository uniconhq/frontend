import { useEffect, useMemo, useReducer, useState, type KeyboardEvent } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { $api } from '@/api/query';
import { toApiError, type ApiError } from '@/api/problem';
import type { SaveChange, WorkflowPage } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { UnsavedNote } from '@/ui/UnsavedNote';
import { Button } from '@/ui/Button';
import { Checkbox } from '@/ui/Checkbox';
import { CodeEditor } from '@/ui/CodeEditor';
import { LeaveGuard } from '@/ui/LeaveGuard';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { type MenuEntry } from '@/ui/ActionMenu';
import { MergeView } from '../forms/MergeView';
import { parseYaml } from '../forms/yaml-doc';
import { WorkflowBar } from './Bar';
import { checkQuery } from './check';
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
  setEntry,
  setInput,
  wire,
  workflowOf,
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
import { FileView } from './FileView';
import { Graph } from './Graph';
import { Inside } from './Inside';
import { useInputsShown } from './inputs-shown';
import { layoutWorkflow, type Box } from './layout';
import { drawerTitle, linesOf, selectionOf, type Selected } from './lines';
import { refsOf, type Ref, type ValueType, type Workflow } from './model';
import { FilePanel, InputsPanel, OutputsPanel, StepPanel } from './Panels';
import { pinned as pinProblems, placed, warnings } from './pins';
import { Problems } from './Problems';
import { byRef, type PrimitiveInfo } from './primitives';
import { PublishVersion, type SaveOutcome } from './Publish';
import {
  outputType,
  outputSources,
  stepInputs,
  stepOutputs,
  outputRefusal,
  portFor,
  wireRefusal,
} from './rules';
import { ShareButton } from './SharePanel';
import { Tray } from './Tray';
import { DRAFT_FILE, refWords } from './words';
import classes from './workflows.module.css';

/**
 * The page a workflow's draft is built on, and the only place one is edited
 * (#377). The graph is drawn from the draft every time, at its actual size;
 * each change is an edit of the YAML document in place, comments and all,
 * kept in the page's history for undo and redo. The bar above says it is the
 * draft and holds Save, "Publish version", Share and "View YAML" (M32); the
 * toolbar under it holds Undo and Redo (M37), and the tray over the graph adds
 * an input, a primitive or a run workflow. The box selected opens, and opens
 * in a drawer on the right. A moment after each change the draft is checked as a version would
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
  primitives,
}: {
  page: WorkflowPage & { draft: NonNullable<WorkflowPage['draft']> };
  primitives: PrimitiveInfo[];
}) {
  const { owner, name } = page;
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
  const [revision, setRevision] = useState(page.draft.revision ?? null);
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
    const found: PaletteWorkflow[] = [];
    for (const item of readable.data ?? [])
      for (const version of item.versions) {
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
  const usedBoxes = useBoxes(boxRefs);
  // The newer version a step could move to, read so Move to it can be checked
  // even when the list of workflows has not come.
  const newerRefs = useMemo(() => {
    const found = new Map<string, Frame['use']>();
    for (const step of workflow.steps) {
      const newer = usedBoxes.get(step.use)?.newer ?? null;
      const use = parseUse(step.use);
      if (newer === null || use === null) continue;
      const ref = { ...use, version: newer };
      if (!usedBoxes.has(formatUse(ref))) found.set(formatUse(ref), ref);
    }
    return [...found.values()];
  }, [workflow, usedBoxes]);
  const newerBoxes = useBoxes(newerRefs);
  const boxMap = useMemo(
    () => (newerBoxes.size === 0 ? usedBoxes : new Map([...usedBoxes, ...newerBoxes])),
    [usedBoxes, newerBoxes],
  );
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
  const { check, checking } = useCheck(text);
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
  const marked = useMemo(() => linesOf(text, selected), [text, selected]);
  const dirty = text !== saved.text || fileChanges.length > 0 || uploading;
  const drawing = !mending;

  const change = (next: string) => {
    clearNotice();
    setPublished(null);
    dispatch({ kind: 'change', text: next });
  };

  const save = $api.useMutation('put', '/api/v1/workflows/{owner}/{name}/draft');

  /** Write `content` over `over`, the file as last read: on a conflict the
   * merge view compares with what was written over. It says what the draft
   * was saved as, or why it was not. */
  const write = async (
    content: string,
    over: { text: string; token: string | null },
  ): Promise<SaveOutcome> => {
    setSaveError(null);
    try {
      const written = await save.mutateAsync({
        params: { path: { owner, name } },
        body: {
          content,
          token: over.token,
          ...(fileChanges.length === 0 ? {} : { changes: fileChanges }),
        },
      });
      setSaved({ text: written.content, token: written.token });
      setRevision(written.revision ?? null);
      setFileChanges([]);
      await queryClient.invalidateQueries({
        queryKey: $api.queryOptions('get', '/api/v1/workflows/{owner}/{name}/tree', {
          params: { path: { owner, name } },
        }).queryKey,
      });
      setConflict(null);
      return { token: written.token, revision: written.revision ?? null };
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
          if (fileChanges.length > 0 && current.content === content) {
            setSaveError(error);
            return { refused: error.detail ?? error.message };
          }
          setConflict({
            base: over.text,
            mine: content,
            current: current.content,
            token: current.token,
          });
          return {
            refused:
              'Someone else saved the draft meanwhile. Close this to merge their changes with yours, then publish.',
          };
        }
      }
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

  /** Why a wire may not go to `target`; on a closed box, naming the port picked, which it does not show. */
  const refusal = (source: Ref, target: Target): string | null => {
    const to = portOf(source, target);
    if (typeof to === 'string') return to;
    if (to.kind === 'outputs')
      return outputRefusal(workflow, primitiveMap, source, boxMap);
    const refused = wireRefusal(
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
  const wired = (base: string, source: Ref, target: PortTarget): string => {
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
    if (to !== null) change(wired(text, source, to));
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
      change(clearPort(text, from.step, from.port));
      return;
    }
    const to = accepted(source, drop.target, drop.box, drop.port);
    if (
      to === null ||
      (to.kind === 'port' && to.step === from.step && to.port === from.port)
    )
      return;
    change(wired(clearPort(text, from.step, from.port), source, to));
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
      stepOutputs(primitiveMap, boxMap, step)
        .filter((output) => output.type !== 'outcome')
        .map((output): Ref => ({ kind: 'steps', name: step.id, output: output.name })),
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
        const reported = outputRefusal(workflow, primitiveMap, source, boxMap);
        entries.push({
          kind: 'item',
          text: 'Name it as an output',
          reason: reported,
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
        text={text}
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
        change={change}
        onRemoved={() => {
          select(null);
          setStack([]);
        }}
        onZoom={() => openBox(selected.index)}
      />
    ) : selected.kind === 'input' ? (
      <InputsPanel
        text={text}
        workflow={workflow}
        primitives={primitiveMap}
        boxes={boxMap}
        pinned={pins}
        id={selected.id}
        files={files}
        staging={staging}
        change={change}
        onRenamed={(id) => select({ kind: 'input', id })}
        onGiven={(path) => select({ kind: 'file', path })}
      />
    ) : selected.kind === 'file' ? (
      <FilePanel
        text={text}
        workflow={workflow}
        primitives={primitiveMap}
        boxes={boxMap}
        path={selected.path}
        files={files}
        listed={savedFiles.isSuccess}
        staging={staging}
        change={change}
        onMoved={(path) => select({ kind: 'file', path })}
        onSupplied={(id) => select({ kind: 'input', id })}
      />
    ) : selected.kind === 'files' ? (
      <WorkflowFiles key={revision ?? 'draft'} {...staging} workflow={workflow} />
    ) : (
      <OutputsPanel
        text={text}
        workflow={workflow}
        primitives={primitiveMap}
        boxes={boxMap}
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
              {drawing && (
                <Button variant="secondary" onClick={() => select({ kind: 'files' })}>
                  Files
                </Button>
              )}
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
          onClick={() => void write(text, saved)}
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
          onSave={() => write(text, saved)}
          canSave={!uploading && !save.isPending}
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
      {saveError !== null && <ErrorBlock error={saveError} compact />}
      {savedFiles.isError && (
        <ErrorBlock
          error={toApiError(savedFiles.error)}
          compact
          onRetry={() => void savedFiles.refetch()}
        />
      )}
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
                if (!('refused' in done)) dispatch({ kind: 'change', text: merged });
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
      )}
      {drawing && stack.length === 0 && (
        <Tray
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
              setInput(text, id, {
                type,
                options: type === 'enum' ? ['a', 'b'] : null,
              }),
            );
            select({ kind: 'input', id });
          }}
          onPrimitive={(primitive) => {
            const next = addStep(text, primitive);
            const steps = workflowOf(next).steps;
            change(next);
            select({ kind: 'step', index: addedAt(steps) }, steps);
          }}
          onWorkflow={(chosen) => {
            const next = addUse(text, formatUse(chosen), chosen.name);
            const steps = workflowOf(next).steps;
            change(next);
            select({ kind: 'step', index: addedAt(steps) }, steps);
          }}
        />
      )}
      {drawing && stack.length > 0 ? (
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
      ) : drawing ? (
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
      <LeaveGuard dirty={dirty} what="Your changes to the draft" search />
    </div>
  );
}
