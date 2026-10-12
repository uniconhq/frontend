import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryView } from '@/api/query';
import { toApiError } from '@/api/problem';
import type { FileContent, WorkflowForm } from '@/api/types';
import { compareRatio, type Ratio } from '@/lib/exact';
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
  heldTheOtherWay,
  readTask,
  writeTask,
  type GroupValues,
  type InputValues,
  type TaskValues,
} from '../forms/task-values';
import { numberProblem, parseYaml, writeOver, type Doc } from '../forms/yaml-doc';
import { AddTests, type AddStart } from './AddTests';
import {
  declaredOf,
  inputTitle,
  readSettings,
  formOf,
  refParts,
  useTaskWorth,
  useTestFolders,
  useWorkflowForm,
  useWorkflowVersion,
  type Declared,
  type GroupFolder,
  type TaskPlace,
} from './build-data';
import type { TaskSave } from './build-save';
import { changeLines } from './changes';
import { stageInputFiles, type StagedInput } from './input-files';
import { InputsCard, type InputFiles } from './InputsCard';
import { taskMergeWords } from './merge-words';
import { taskPlace, taskPlaceOf } from './places';
import { SaveBar } from './SaveBar';
import { pointsText, ruleOf, shareProblem, taskWeight } from './scoring';
import {
  existingOf,
  NOTHING_STAGED,
  plannedChanges,
  type Staged,
  type StagedTest,
} from './staged';
import { TestsCard } from './TestsCard';
import { WorkflowCard } from './WorkflowCard';
import { BodyText } from '@/ui/BodyText';
import { PageLink } from '@/ui/PageLink';
import { taskSectionPath } from '@/lib/sections';
import shared from '../organise.module.css';
import classes from './task.module.css';

const PATH = 'task.yaml';

/** A new test group as the cards start one: no rule yet, so no points until one is chosen. */
function newGroup(name: string): GroupValues {
  return {
    name,
    read: false,
    folder: false,
    each: '',
    worst: '',
    pass: '',
    passAt: '',
    weights: [],
    show: '',
  };
}

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
  const [staged, setStaged] = useState<Staged>(NOTHING_STAGED);
  const [inputFiles, setInputFiles] = useState<StagedInput[]>([]);
  const [advanced, setAdvanced] = useState<Set<string>>(
    () =>
      new Set(
        read.values.groups
          .filter((group) => ruleOf(group) === 'advanced')
          .map((group) => group.name),
      ),
  );
  const [adding, setAdding] = useState<AddStart | null>(null);
  const { worth, known } = useTaskWorth(place);
  const disabled = !manager || saving.state.stage !== 'idle';

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
  const report = fromVersion?.report ?? null;
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
  if (declared !== null && typedFor !== picked) {
    setTypedFor(picked);
    setValues((before) => ({
      ...before,
      inputs: inputsFor(doc, names, declared, picked === saved),
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
  const setGroup = (name: string, change: Partial<GroupValues>) =>
    setValues((before) => ({
      ...before,
      groups: before.groups.map((group) =>
        group.name === name ? { ...group, ...change } : group,
      ),
    }));

  const stageTests = (tests: StagedTest[]) => {
    setStaged((before) => ({
      tests: [
        ...before.tests.filter(
          (old) =>
            !tests.some((test) => test.group === old.group && test.test === old.test),
        ),
        ...tests.map((test) => {
          const earlier = before.tests.find(
            (old) => old.group === test.group && old.test === test.test,
          );
          return earlier === undefined ? test : { ...test, existing: earlier.existing };
        }),
      ],
      removals: before.removals.filter(
        (old) =>
          !tests.some((test) => test.group === old.group && test.test === old.test),
      ),
    }));
    setValues((before) => {
      const added = [...new Set(tests.map((test) => test.group))].filter(
        (group) => !before.groups.some((known) => known.name === group),
      );
      return { ...before, groups: [...before.groups, ...added.map(newGroup)] };
    });
  };
  const [reading, setReading] = useState<unknown>(null);
  const removeTests = (group: string, tests: string[]) => {
    setReading(null);
    void Promise.all(
      tests.map(async (test) => ({
        group,
        test,
        existing: await existingOf(place, group, test),
      })),
    )
      .then((removals) => {
        // A removed test's weight goes with it, which the save would refuse
        // for a test the group no longer has (T2); Undo brings it back.
        setValues((before) => ({
          ...before,
          groups: before.groups.map((each) =>
            each.name === group
              ? {
                  ...each,
                  weights: each.weights.filter((row) => !tests.includes(row.test)),
                }
              : each,
          ),
        }));
        setStaged((before) => ({
          tests: before.tests.filter(
            (old) => !(old.group === group && tests.includes(old.test)),
          ),
          removals: [
            ...before.removals.filter(
              (old) => !(old.group === group && tests.includes(old.test)),
            ),
            ...removals,
          ],
        }));
      })
      .catch((error: unknown) => setReading(error));
  };
  const undoTest = (group: string, test: string) => {
    const removed = staged.removals.some(
      (old) => old.group === group && old.test === test,
    );
    const weight = read.values.groups
      .find((each) => each.name === group)
      ?.weights.find((row) => row.test === test);
    if (removed && weight !== undefined) {
      setValues((before) => ({
        ...before,
        groups: before.groups.map((each) =>
          each.name === group && !each.weights.some((row) => row.test === test)
            ? { ...each, weights: [...each.weights, weight] }
            : each,
        ),
      }));
    }
    setStaged((before) => ({
      tests: before.tests.filter((old) => !(old.group === group && old.test === test)),
      removals: before.removals.filter(
        (old) => !(old.group === group && old.test === test),
      ),
    }));
  };
  const removeGroup = (name: string) => {
    const folder = folders.find((each) => each.name === name);
    setValues((before) => ({
      ...before,
      groups: before.groups.filter((group) => group.name !== name),
    }));
    setStaged((before) => ({
      ...before,
      tests: before.tests.filter((test) => test.group !== name),
    }));
    if (folder !== undefined && folder.tests.length > 0)
      removeTests(name, folder.tests);
  };

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
    staged,
    titles,
    inputFiles.map((change) => change.id),
  );
  const changed = lines.length > 0 || values.inputs.some(heldTheOtherWay);
  const problems = [
    values.credit.kind !== 'none' && values.credit.name.trim() === ''
      ? 'Choose which value a test earns, under How a test earns.'
      : undefined,
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
    ...values.groups.flatMap((group) => [
      numberProblem(group.each),
      numberProblem(group.worst),
      numberProblem(group.pass),
      numberProblem(group.passAt) ?? shareProblem(group.passAt),
      ...group.weights.map((row) => numberProblem(row.weight)),
      form?.graded === true && !group.read && group.show === ''
        ? `Choose when entrants see ${group.name}’s results.`
        : undefined,
    ]),
  ].filter((problem): problem is string => problem !== undefined);
  const notices = [
    ...pointsNotice(
      taskWeight(read.values.groups),
      taskWeight(values.groups),
      worth,
      known,
    ),
    // A new group starts with no rule; in a task that gives points, say so.
    ...(taskWeight(values.groups).num === 0n
      ? []
      : values.groups
          .filter((group) => !group.read && ruleOf(group) === 'none')
          .map(
            (group) =>
              `${group.name} gives no points: it is for practice until you choose how it earns.`,
          )),
  ];

  const save = () => {
    const fresh = parseYaml(file.content);
    if ('error' in fresh) return;
    writeTask(fresh.doc, read.values, values, { admin, unreadable: read.unreadable });
    const content = writeOver(file.content, fresh.doc);
    void saving.save({
      yaml:
        content === file.content
          ? null
          : { content, base: file.content, token: file.token },
      planned: [
        ...plannedChanges(staged, declared?.test ?? []),
        ...inputFiles.flatMap((change) => change.planned),
      ],
    });
  };

  const groupsForAdding = values.groups.map((group) => ({
    name: group.name,
    tests: [
      ...new Set([
        ...(folders.find((folder) => folder.name === group.name)?.tests ?? []),
        ...staged.tests
          .filter((test) => test.group === group.name)
          .map((test) => test.test),
      ]),
    ],
  }));
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
        onChange={setInput}
        onRemove={(id) =>
          set({ inputs: values.inputs.filter((input) => input.id !== id) })
        }
        onAdd={(id, kind) => set({ inputs: [...values.inputs, emptyInput(id, kind)] })}
        files={files}
        disabled={disabled}
      />
      <TestsCard
        place={place}
        values={values}
        fields={declared?.test ?? null}
        report={report}
        folders={folders}
        staged={staged}
        worth={worth}
        graded={form?.graded ?? false}
        advanced={advanced}
        admin={admin}
        disabled={disabled}
        onValues={set}
        onGroup={setGroup}
        onAdvanced={(name, on) =>
          setAdvanced((before) => {
            const next = new Set(before);
            if (on) next.add(name);
            else next.delete(name);
            return next;
          })
        }
        onAddTests={(group) => setAdding({ group, test: null })}
        onReplaceTest={(group, test) => setAdding({ group, test })}
        onRemoveTest={(group, test) => removeTests(group, [test])}
        onUndoTest={undoTest}
        onRemoveGroup={removeGroup}
      />
      {reading !== null && <ErrorBlock error={toApiError(reading)} compact />}
      {adding !== null && declared !== null && (
        <AddTests
          place={place}
          fields={declared.test}
          groups={groupsForAdding}
          start={adding}
          onAdd={stageTests}
          onClose={() => setAdding(null)}
        />
      )}
      <SaveBar
        lines={changed ? lines : []}
        notices={changed ? notices : []}
        problems={problems}
        state={saving.state}
        onSave={save}
        onDiscard={() => {
          setValues(read.values);
          setStaged(NOTHING_STAGED);
          setInputFiles([]);
          saving.forget();
        }}
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
              setStaged(NOTHING_STAGED);
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

/**
 * Before a save that changes the task's total, that the task's points change
 * with it wherever its contest gives it no worth of its own (#435).
 */
function pointsNotice(
  before: Ratio,
  after: Ratio,
  worth: Ratio | null,
  known: boolean,
): string[] {
  if (compareRatio(before, after) === 0 || worth !== null) return [];
  const change = `the task will be worth ${pointsText(after)} points, not ${pointsText(before)}`;
  return known
    ? [
        `This changes the task’s points: its contest gives it no worth of its own, so ${change}.`,
      ]
    : [
        `This changes the task’s total: if its contest gives it no worth of its own, ${change}.`,
      ];
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
      onConfirm={(body) => saving.again(body, { confirm: true })}
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
 * The task's build cards, once its settings, its workflow's form and its
 * tests' folders are read: the Workflow, Inputs and Tests and scoring cards
 * and their one save bar. Settings that are an upload show as one; settings
 * that do not read say why.
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
