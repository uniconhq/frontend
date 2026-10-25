import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryView } from '@/api/query';
import { toApiError } from '@/api/problem';
import type { FileContent, WorkflowForm } from '@/api/types';
import { formatSize } from '@/lib/size';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { FilesMerge, type MovedFile } from '../files/FilesMerge';
import { fileQuery, staleAfterWrite } from '../files/place';
import { SaveOutcome } from '../files/SaveOutcome';
import { UploadedFile } from '../files/UploadedFile';
import { useOwnFile } from '../forms/file-hooks';
import { MergeView } from '../forms/MergeView';
import {
  emptyInput,
  emptyTuple,
  heldTheOtherWay,
  readTask,
  writeTask,
  type AxisValues,
  type Give,
  type InputValues,
  type TaskValues,
} from '../forms/task-values';
import { exactJS, numberProblem, parseYaml, writeOver, type Doc } from '../forms/yaml-doc';
import {
  declaredOf,
  inputTitle,
  readSettings,
  formOf,
  refParts,
  useTestFolders,
  useWorkflowForm,
  useWorkflowVersion,
  type Declared,
  type GroupFolder,
  type TaskPlace,
} from './build-data';
import type { TaskSave } from './build-save';
import { changeLines } from './changes';
import { stageInputFiles, stageRunFile, type StagedInput } from './input-files';
import { InputsCard, type InputFiles } from './InputsCard';
import { taskMergeWords } from './merge-words';
import { taskPlace, taskPlaceOf } from './places';
import { SaveBar } from './SaveBar';
import { NOTHING_STAGED } from './staged';
import { RunsCard } from './RunsCard';
import { ChecksCard } from './ChecksCard';
import { ScoringCard } from './ScoringCard';
import { SubmissionsCard } from './SubmissionsCard';
import { WorkflowCard } from './WorkflowCard';
import { BodyText } from '@/ui/BodyText';
import { PageLink } from '@/ui/PageLink';
import { taskSectionPath } from '@/lib/sections';
import shared from '../organise.module.css';
import classes from './task.module.css';

const PATH = 'task.yaml';

/** The workflow's inputs as the cards type them, for the workflow chosen. */
function inputsFor(
  doc: Doc,
  folders: string[],
  declared: Declared,
  keepUndeclared: boolean,
): InputValues[] {
  const inputs = readTask(doc, folders, declared.inputs).values.inputs;
  return keepUndeclared
    ? inputs
    : inputs.filter((input) => declared.inputs.some((found) => found.id === input.id));
}

/** A file this save writes or takes out, in the words the conflict names it by. */
function movedLabel(path: string, titles: ReadonlyMap<string, string>): string {
  const place = taskPlace(path, '', titles);
  const parts = path.split('/');
  const entry =
    place.card !== 'inputs' && parts.length > 3 ? `: ${parts.slice(3).join('/')}` : '';
  return `${place.label}${entry}`;
}

/**
 * The cards that build the task, from its settings, its workflow and its
 * tests, with the one save bar they share. Built afresh from the settings
 * each time they are saved, so a save never runs on what was read before.
 */
function BuildForm({
  place,
  file,
  doc,
  form,
  folders,
  saving,
  admin,
  manager,
}: {
  place: TaskPlace;
  file: FileContent;
  doc: Doc;
  form: WorkflowForm | null;
  folders: GroupFolder[];
  saving: TaskSave;
  admin: boolean;
  manager: boolean;
}) {
  const saved = form?.workflow ?? null;
  const savedReadable = form !== null && form.problem === null && saved !== null;
  const names = folders.map((folder) => folder.name);
  const [read] = useState(() =>
    readTask(doc, names, savedReadable ? form.inputs : null),
  );
  const [values, setValues] = useState<TaskValues>(read.values);
  const queryClient = useQueryClient();
  const [inputFiles, setInputFiles] = useState<StagedInput[]>([]);
  // While a save asks before it publishes, its answer sends the cards as they
  // were asked about, so they stay so until it is answered or discarded.
  const asking =
    saving.outcome?.kind === 'refused' &&
    saving.outcome.error.code === 'confirmation_required';
  const disabled = !manager || saving.state.stage !== 'idle' || asking;

  const picked = values.workflow.trim();
  const version = queryView(
    useWorkflowVersion(refParts(picked) === null ? null : picked),
  );
  const text = version.state === 'ready' ? version.data.content : null;
  // The saved workflow is as the backend reads it, which says when it cannot
  // be used; another one chosen is read from its own file.
  const fromVersion = useMemo(() => (text === null ? null : declaredOf(text)), [text]);
  const declared = useMemo((): Declared | null => {
    if (picked !== saved) return fromVersion;
    return savedReadable
      ? { inputs: form.inputs, test: form.test, report: fromVersion?.report ?? [] }
      : null;
  }, [fromVersion, picked, saved, savedReadable, form]);
  const titles = useMemo(
    () =>
      new Map(
        (declared?.inputs ?? []).map((input) => [input.id, inputTitle(input)] as const),
      ),
    [declared],
  );

  // Another workflow chosen, its inputs come in its own types, and those it
  // does not have go; back to the saved one, the settings' own come back.
  const [typedFor, setTypedFor] = useState(picked);
  // A file chosen for a setting stays while the new one still takes that
  // input as the same kind, a file or a folder, the setting naming it; else
  // it goes with the input.
  if (declared !== null && typedFor !== picked) {
    setTypedFor(picked);
    const kept = inputFiles.filter((change) => {
      const input = declared.inputs.find((found) => found.id === change.id);
      const kind = change.value.endsWith('/') ? 'folder' : 'file';
      return input !== undefined && !input.contestant && input.type === kind;
    });
    if (kept.length !== inputFiles.length) setInputFiles(kept);
    setValues((before) => ({
      ...before,
      inputs: inputsFor(doc, names, declared, picked === saved).map((input) => {
        const change = kept.find((each) => each.id === input.id);
        return change === undefined ? input : { ...input, value: change.value };
      }),
    }));
  }

  const set = (change: Partial<TaskValues>) =>
    setValues((before) => ({ ...before, ...change }));
  const setInput = (id: string, change: Partial<InputValues>) =>
    setValues((before) => ({
      ...before,
      inputs: before.inputs.map((input) =>
        input.id === id ? { ...input, ...change } : input,
      ),
    }));
  // An axis with no inputs is not written, so it cannot sit before one that
  // is: a refusal names axes as the file numbers them, and the card's fields
  // use that same number.
  const settleAxes = (axes: AxisValues[]): AxisValues[] => {
    const filled: AxisValues[] = [];
    const empty: AxisValues[] = [];
    for (const axis of axes) (axis.inputs.length > 0 ? filled : empty).push(axis);
    return [...filled, ...empty];
  };
  const giveInput = (id: string, give: Give) =>
    setValues((before) => {
      const inputs = before.inputs.map((input) =>
        input.id === id
          ? {
              ...input,
              give,
              kind: give === 'entrant' ? ('details' as const) : ('value' as const),
            }
          : input,
      );
      const cleared = before.axes.map((axis) => ({
        ...axis,
        inputs: axis.inputs.filter((item) => item !== id),
      }));
      if (give !== 'per-run') return { ...before, inputs, axes: settleAxes(cleared) };
      const axes = cleared.length === 0 ? [{ inputs: [], tuples: [] }] : cleared;
      const emptyAt = axes.findIndex((axis) => axis.inputs.length === 0);
      const target = emptyAt >= 0 ? emptyAt : 0;
      const first = axes[target];
      if (first === undefined) return { ...before, inputs };
      const tuples =
        first.tuples.length === 0
          ? [emptyTuple([id])]
          : first.tuples.map((tuple) => ({
              ...tuple,
              cells: {
                ...tuple.cells,
                [id]: tuple.cells[id] ?? { entrant: false, value: '' },
              },
            }));
      axes[target] = { inputs: [...first.inputs, id], tuples };
      return { ...before, inputs, axes: settleAxes(axes) };
    });
  const moveAxis = (id: string, index: number) =>
    setValues((before) => {
      const axes = before.axes.map((axis) => ({
        ...axis,
        inputs: axis.inputs.filter((item) => item !== id),
      }));
      while (axes.length <= index) axes.push({ inputs: [], tuples: [emptyTuple([])] });
      const axis = axes[index];
      if (axis === undefined) return before;
      const tuples = (axis.tuples.length === 0 ? [emptyTuple([id])] : axis.tuples).map(
        (tuple) => ({
          ...tuple,
          cells: {
            ...tuple.cells,
            [id]: tuple.cells[id] ?? { entrant: false, value: '' },
          },
        }),
      );
      axes[index] = { inputs: [...axis.inputs, id], tuples };
      return { ...before, axes: settleAxes(axes) };
    });
  const [reading, setReading] = useState<unknown>(null);
  /** Files chosen for a setting wait for the save, which writes them and points the setting at them. */
  const files: InputFiles = {
    place,
    staged: inputFiles,
    onChoose: (input, chosen, was) => {
      setReading(null);
      stageInputFiles(place, input, chosen, was)
        .then((change) => {
          setInputFiles((before) => [
            ...before.filter((each) => each.id !== change.id),
            {
              ...change,
              was: before.find((each) => each.id === change.id)?.was ?? was,
            },
          ]);
          setInput(change.id, { value: change.value });
        })
        .catch((error: unknown) => setReading(error));
    },
    onUndo: (id) => {
      const undone = inputFiles.find((each) => each.id === id);
      setInputFiles((before) => before.filter((each) => each.id !== id));
      if (undone !== undefined) setInput(id, { value: undone.was });
    },
  };

  // A setting given a new file is one change, said once.
  const lines = changeLines(
    read.values,
    values,
    NOTHING_STAGED,
    titles,
    inputFiles.map((change) => change.id),
  );
  const changed = lines.length > 0 || values.inputs.some(heldTheOtherWay);
  // A save's answer is about that save: once something is changed again, it
  // goes, rather than standing in the bar beside changes it does not cover.
  // The cards read the task afresh once a save is through, so an answer that
  // was there when they did is one the organiser has seen beside no change.
  const [answered] = useState(() => saving.outcome);
  const stale =
    changed &&
    saving.state.stage === 'idle' &&
    saving.outcome !== null &&
    saving.outcome === answered &&
    saving.outcome.kind === 'saved';
  const { forget } = saving;
  useEffect(() => {
    if (stale) forget();
  }, [stale, forget]);
  // Once a save from these cards went through, what it sent is saved: nothing
  // is left to save while the task is read again, unless changed since (M66).
  const [sent, setSent] = useState<{
    values: TaskValues;
    inputFiles: StagedInput[];
  } | null>(null);
  const through =
    saving.outcome?.kind === 'saved' &&
    saving.outcome !== answered &&
    sent?.values === values &&
    sent.inputFiles === inputFiles;
  const toSave = changed && !through;
  const [scoreProblems, setScoreProblems] = useState<string[]>([]);
  const problems = [
    ...[values.max, values.rateCount, values.ratePer].map((text) =>
      numberProblem(text, true),
    ),
    ...values.inputs.flatMap((input) => [
      numberProblem(input.min),
      numberProblem(input.max),
      input.type === 'number'
        ? numberProblem(input.kind === 'value' ? input.value : input.default)
        : undefined,
    ]),
    ...(form?.runs === true ? scoreProblems : []),
  ].filter((problem): problem is string => problem !== undefined);
  const workflowRaw = useMemo(() => {
    if (text === null) return null;
    const parsed = parseYaml(text);
    return 'error' in parsed ? null : exactJS(parsed.doc);
  }, [text]);
  const draftErrors =
    saving.outcome?.kind === 'saved' && 'errors' in saving.outcome.result
      ? saving.outcome.result.errors
      : [];

  const save = () => {
    const fresh = parseYaml(file.content);
    if ('error' in fresh) return;
    writeTask(fresh.doc, read.values, values, { admin, unreadable: read.unreadable });
    const content = writeOver(file.content, fresh.doc);
    setSent({ values, inputFiles });
    void saving.save({
      yaml:
        content === file.content
          ? null
          : { content, base: file.content, token: file.token },
      planned: inputFiles.flatMap((change) => change.planned),
    });
  };

  const placeOf = taskPlaceOf(place.org, place.contest, place.task, titles);

  return (
    <div className={classes.build}>
      {read.unreadable.length > 0 && (
        <Unread
          place={place}
          admin={admin}
          reason={`The cards cannot read ${read.unreadable.join(', ')}.`}
          line="The cards leave that part as it is."
        />
      )}
      <WorkflowCard
        saved={saved}
        newer={form?.newer ?? null}
        problem={form?.problem ?? null}
        value={values.workflow}
        onChange={(workflow) => set({ workflow })}
        disabled={disabled}
      />
      <InputsCard
        declared={declared?.inputs ?? null}
        workflowProblem={
          declared !== null
            ? null
            : picked === saved
              ? (form?.problem ?? 'The workflow cannot be read.')
              : version.state === 'loading' && refParts(picked) !== null
                ? 'Loading the chosen workflow.'
                : 'The workflow chosen cannot be read.'
        }
        inputs={values.inputs}
        runs={form?.runs === true}
        axisCount={Math.max(values.axes.length, 1)}
        axisOf={(id) => {
          const index = values.axes.findIndex((axis) => axis.inputs.includes(id));
          return index < 0 ? 0 : index;
        }}
        onChange={setInput}
        onGive={giveInput}
        onAxis={moveAxis}
        onRemove={(id) =>
          set({ inputs: values.inputs.filter((input) => input.id !== id) })
        }
        onAdd={(id, kind) => set({ inputs: [...values.inputs, emptyInput(id, kind)] })}
        files={files}
        disabled={disabled}
      />
      <RunsCard
        active={form?.runs === true && declared !== null}
        declared={declared?.inputs ?? []}
        axes={values.axes}
        disabled={disabled}
        onChange={(axes) => set({ axes })}
        onFile={(path, file) => {
          setReading(null);
          const was = path;
          stageRunFile(place, path, file, '')
            .then((change) => {
              setInputFiles((before) => [
                ...before.filter((each) => each.id !== change.id),
                {
                  ...change,
                  was: before.find((each) => each.id === change.id)?.was ?? was,
                },
              ]);
              const [, axisText, rowText, id] = path.split('/');
              const axis = Number(axisText);
              const row = Number(rowText);
              if (id === undefined) return;
              setValues((before) => ({
                ...before,
                axes: before.axes.map((item, index) =>
                  index === axis
                    ? {
                        ...item,
                        tuples: item.tuples.map((tuple, at) =>
                          at === row
                            ? {
                                ...tuple,
                                cells: {
                                  ...tuple.cells,
                                  [id]: { entrant: false, value: path },
                                },
                              }
                            : tuple,
                        ),
                      }
                    : item,
                ),
              }));
            })
            .catch((error: unknown) => setReading(error));
        }}
      />
      {form?.runs === true && (
        <>
          <ScoringCard
            place={place}
            values={values}
            workflowText={workflowRaw}
            graded={form?.graded === true}
            disabled={disabled}
            errors={draftErrors}
            onChange={set}
            onProblems={setScoreProblems}
          />
          <ChecksCard
            values={values}
            disabled={disabled}
            onChange={(checks) => set({ checks })}
          />
        </>
      )}
      <SubmissionsCard
        values={values}
        admin={admin}
        disabled={disabled}
        onChange={set}
      />
      {reading !== null && <ErrorBlock error={toApiError(reading)} compact />}
      <SaveBar
        lines={toSave ? lines : []}
        notices={[]}
        problems={problems}
        state={saving.state}
        asking={asking}
        onSave={save}
        onDiscard={() => {
          setValues(read.values);
          setInputFiles([]);
          saving.forget();
        }}
        pinned={saving.merge !== null || saving.conflicts !== null || asking}
        onClose={saving.drop}
      >
        {(saving.outcome !== null ||
          saving.merge !== null ||
          saving.conflicts !== null) && (
          <SaveAnswer
            place={place}
            saving={saving}
            placeOf={placeOf}
            titles={titles}
            admin={admin}
            onDiscard={() => {
              // My changes go, and the cards read the task as it is now.
              setValues(read.values);
              setInputFiles([]);
              saving.drop();
              for (const queryKey of [
                fileQuery(place, PATH).queryKey,
                ...staleAfterWrite(place),
              ]) {
                void queryClient.invalidateQueries({ queryKey });
              }
            }}
          />
        )}
      </SaveBar>
    </div>
  );
}

/** What the last save came back with: its answer, the merge of the settings, or the files that moved. */
function SaveAnswer({
  place,
  saving,
  placeOf,
  titles,
  admin,
  onDiscard,
}: {
  place: TaskPlace;
  saving: TaskSave;
  placeOf: ReturnType<typeof taskPlaceOf>;
  titles: ReadonlyMap<string, string>;
  admin: boolean;
  /** Discard my changes, from a merge: the cards read the task again. */
  onDiscard: () => void;
}) {
  const busy = saving.state.stage !== 'idle';
  if (saving.merge !== null) {
    const { attempt, current } = saving.merge;
    return (
      <MergeView
        key={current.token}
        file={PATH}
        admin={admin}
        baseText={attempt.yaml?.base ?? ''}
        mineText={attempt.yaml?.content ?? ''}
        currentText={current.content}
        busy={busy}
        onSave={saving.saveMerged}
        onDrop={onDiscard}
        words={taskMergeWords(titles)}
      />
    );
  }
  if (saving.conflicts !== null) {
    const files: MovedFile[] = saving.conflicts.files.map(({ change }) => ({
      path: change.path,
      label: movedLabel(change.path, titles),
      mine:
        'remove' in change
          ? 'Taken out'
          : 'text' in change
            ? 'Its values as you set them'
            : `${change.path.split('/').pop() ?? ''}, ${formatSize(change.source.size)}`,
    }));
    return (
      <FilesMerge
        place={place}
        files={files}
        busy={busy}
        onSave={saving.saveResolved}
        onDrop={onDiscard}
      />
    );
  }
  if (saving.outcome === null) return null;
  return (
    <SaveOutcome
      outcome={saving.outcome}
      onConfirm={(body, asked) => saving.again(body, { confirm: true, asked })}
      onKeepAsDraft={(body) => saving.again(body, { keep_as_draft: true })}
      onReload={saving.drop}
      placeOf={placeOf}
    />
  );
}

/**
 * That the task's settings do not read, or hold a part the cards cannot, and
 * where an admin mends them as text: the settings as stored, in Settings.
 */
function Unread({
  place,
  reason,
  admin,
  line,
}: {
  place: TaskPlace;
  reason: string;
  admin: boolean;
  line: string;
}) {
  return (
    <div className={shared.panel} role="alert">
      <BodyText>
        The task’s settings cannot be read: {reason} {line}
      </BodyText>
      <BodyText tone="secondary">
        {admin
          ? 'Fix them as text in '
          : 'An admin of the task can fix them as text in '}
        <PageLink
          to={taskSectionPath(place.org, place.contest, place.task, 'settings')}
        >
          Settings
        </PageLink>
        . The cards come back once the settings can be read.
      </BodyText>
    </div>
  );
}

/**
 * The task's build cards, once its settings and its workflow's form are
 * read: Workflow, Inputs, Runs and Submissions, and their one save bar.
 * Settings that are an upload show as one; settings that do not read say why.
 */
export function TaskBuild({
  place,
  saving,
  admin,
  manager,
}: {
  place: TaskPlace;
  saving: TaskSave;
  admin: boolean;
  manager: boolean;
}) {
  const file = useOwnFile(place, PATH);
  const workflowForm = useWorkflowForm(place, true);
  const folders = useTestFolders(place, true);
  if (file.isPending || workflowForm.isPending || folders.state === 'loading') {
    return <PageSkeleton rows={8} />;
  }
  if (file.data === undefined) {
    return (
      <ErrorBlock error={toApiError(file.error)} onRetry={() => void file.refetch()} />
    );
  }
  if (folders.state === 'error') {
    return <ErrorBlock error={folders.error} onRetry={folders.retry} />;
  }
  if (file.data.upload) {
    return (
      <UploadedFile
        place={place}
        path={PATH}
        upload={file.data.upload}
        token={file.data.token}
      />
    );
  }
  const read = readSettings(file.data);
  if ('error' in read) {
    return (
      <Unread
        place={place}
        reason={read.error}
        admin={admin}
        line="So the cards that build the task cannot show them."
      />
    );
  }
  const form = formOf(workflowForm);
  return (
    <BuildForm
      key={`${file.data.token} ${JSON.stringify(form)}`}
      place={place}
      file={file.data}
      doc={read.doc}
      form={form}
      folders={folders.data}
      saving={saving}
      admin={admin}
      manager={manager}
    />
  );
}
