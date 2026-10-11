import { useQuery } from '@tanstack/react-query';
import { $api, queryView } from '@/api/query';
import type { FileChange, TaskState, TreeEntry, WorkflowForm } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { PageLink } from '@/ui/PageLink';
import { Loaded } from '@/ui/feedback/Loaded';
import { taskCardPath } from '@/lib/sections';
import { formatDateTime } from '@/lib/time';
import { DefinitionErrors } from '../DefinitionErrors';
import { fileQuery, treeQuery } from '../files/place';
import { readTask } from '../forms/task-values';
import {
  inputTitle,
  readSettings,
  taskPath,
  useTestFolders,
  useWorkflowForm,
  type GroupFolder,
  type TaskPlace,
} from './build-data';
import type { TaskSave } from './build-save';
import { taskPlaceOf } from './places';
import { publishedLine, savedBy } from './published';
import { pointsText, taskWeight } from './scoring';
import classes from './task.module.css';

const TASK = '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}';

/** Where the task's files stand, in a word beside its name. */
function StateChip({ state }: { state: TaskState }) {
  if (state.draft && state.errors.length > 0) {
    return <Chip tone="warn">Last save has problems</Chip>;
  }
  if (state.latest === null) return <Chip>Not published</Chip>;
  if (state.draft) return <Chip>Draft, not published</Chip>;
  return <Chip tone="live">Published</Chip>;
}

type Card = 'workflow' | 'inputs' | 'tests' | 'statement';

/** The statement a new task starts with, which is not yet written (TASK-FORMAT 1.2). */
const STARTER_STATEMENT = 'Write the statement entrants read here.';
type Item = { card: Card; ok: boolean; text: string };

const under = (state: TaskState, ...tops: string[]) =>
  state.errors.some((error) =>
    tops.some(
      (top) =>
        error.path === top ||
        error.path.startsWith(`${top}.`) ||
        error.path.startsWith(`${top}/`),
    ),
  );

/**
 * Each part of the task, ticked when it is done or saying what it is
 * missing, in the order its cards build it: its statement, its workflow, its
 * inputs, its tests and its scoring (M11).
 */
function readiness(
  state: TaskState,
  form: WorkflowForm | null,
  settings: string | null,
  folders: GroupFolder[],
  top: TreeEntry[],
  statementText: string | null,
): Item[] {
  const statement = top.find((entry) => entry.path === 'statement.md');
  const written =
    statement !== undefined &&
    (statement.size ?? 1) > 0 &&
    statementText?.trim() !== STARTER_STATEMENT;
  const read =
    settings === null
      ? null
      : readSettings({
          path: 'task.yaml',
          encoding: 'utf-8',
          content: settings,
          token: '',
          upload: null,
        });
  const values =
    read === null || 'error' in read
      ? null
      : readTask(
          read.doc,
          folders.map((folder) => folder.name),
        ).values;
  const needed = (form?.problem === null ? form.inputs : []).filter(
    (input) => !input.contestant && !input.optional,
  );
  const missing = needed.find(
    (input) =>
      (values?.inputs.find((given) => given.id === input.id)?.value.trim() ?? '') ===
      '',
  );
  const tests = folders.reduce((total, folder) => total + folder.tests.length, 0);
  const empty = folders.find((folder) => folder.tests.length === 0);
  const total = values === null ? null : taskWeight(values.groups);
  return [
    {
      card: 'statement',
      ok: written,
      text: written ? 'Statement' : 'Statement: not written yet',
    },
    {
      card: 'workflow',
      ok: form !== null && form.workflow !== null && form.problem === null,
      text:
        form?.workflow == null
          ? 'Workflow: none chosen'
          : form.problem !== null
            ? 'Workflow: cannot be read'
            : 'Workflow',
    },
    {
      card: 'inputs',
      ok: missing === undefined && !under(state, 'inputs'),
      text:
        missing !== undefined
          ? `Inputs: ${inputTitle(missing)} needs a value`
          : under(state, 'inputs')
            ? 'Inputs: see the problems below'
            : 'Inputs',
    },
    {
      card: 'tests',
      ok: tests > 0 && empty === undefined && !under(state, 'tests'),
      text:
        tests === 0
          ? 'Tests: none yet'
          : `Tests: ${String(tests)} in ${folders.length === 1 ? '1 group' : `${String(folders.length)} groups`}${empty !== undefined ? `, ${empty.name} has none` : ''}`,
    },
    {
      card: 'tests',
      ok: total !== null && !under(state, 'test_groups', 'credit'),
      text:
        total === null
          ? 'Scoring: cannot be read'
          : under(state, 'test_groups', 'credit')
            ? 'Scoring: see the problems below'
            : total.num === 0n
              ? 'Scoring: no points, ranked on reported values'
              : `Scoring: ${pointsText(total)} points`,
    },
  ];
}

/** The readiness row: a link to each part's card, ticked or saying what it lacks. */
function Ready({ place, items }: { place: TaskPlace; items: Item[] }) {
  return (
    <ul className={classes.ready} aria-label="What the task has">
      {items.map((item) => (
        <li key={item.text}>
          <span
            className={item.ok ? classes.tick : classes.missing}
            role="img"
            aria-label={item.ok ? 'Done' : 'Not done'}
          >
            {item.ok ? '✓' : '✗'}
          </span>
          <PageLink to={taskCardPath(place.org, place.contest, place.task, item.card)}>
            {item.text}
          </PageLink>
        </li>
      ))}
    </ul>
  );
}

/**
 * What a save left the task with, and what to do next: a save with problems,
 * each linked to where it is fixed; or a draft kept back, with Publish it.
 */
function NextStep({
  place,
  state,
  saving,
  manager,
}: {
  place: TaskPlace;
  state: TaskState;
  saving: TaskSave;
  manager: boolean;
}) {
  if (!state.draft) return null;
  if (state.errors.length > 0) {
    return (
      <>
        <BodyText>
          The last save has problems, so it was kept as a draft
          {state.latest === null ? '' : ' and entrants are graded as before'}. Fix each
          where it says, then save:
        </BodyText>
        <DefinitionErrors
          errors={state.errors}
          placeOf={taskPlaceOf(place.org, place.contest, place.task)}
        />
      </>
    );
  }
  return (
    <div className={classes.statusLine}>
      <BodyText>
        {state.latest === null
          ? 'The task is saved and has no problems, but it is not published yet.'
          : 'The last save was kept as a draft, so entrants are graded as before.'}
      </BodyText>
      {manager && (
        <Button
          size="xs"
          loading={saving.state.stage !== 'idle'}
          onClick={() =>
            saving.again({ changes: [], confirm: false, keep_as_draft: false }, {})
          }
        >
          Publish it
        </Button>
      )}
    </div>
  );
}

/**
 * The top of a task's page: where its files stand and when they were last
 * saved, by whom; a tick for each part of the task that is done, or what it
 * lacks, each going to its card; what entrants are graded on (M21); and what
 * to do next when a save is stuck.
 */
export function TaskStanding({
  place,
  saving,
  manager,
}: {
  place: TaskPlace;
  saving: TaskSave;
  manager: boolean;
}) {
  const path = taskPath(place);
  const state = queryView($api.useQuery('get', TASK, { params: { path } }));
  const history = $api.useQuery('get', `${TASK}/history`, { params: { path } });
  const form = useWorkflowForm(place);
  const settings = useQuery({ ...fileQuery(place, 'task.yaml'), retry: false });
  const folders = useTestFolders(place);
  const top = useQuery(treeQuery(place, ''));
  // Read to tell the statement a new task starts with from one written.
  const statement = useQuery({
    ...fileQuery(place, 'statement.md'),
    retry: false,
    enabled: top.data?.some((entry) => entry.path === 'statement.md') ?? false,
  });
  const changes: FileChange[] | undefined = history.data;
  const last = changes?.[0];

  return (
    <Loaded view={state} rows={2}>
      {(task) => (
        <div className={classes.status} aria-label="Where the task stands">
          <div className={classes.statusLine}>
            <StateChip state={task} />
            {last !== undefined && (
              <BodyText tone="secondary">
                Last saved {formatDateTime(new Date(last.at))}
                {last.author === null ? '' : ` by ${last.author}`}
              </BodyText>
            )}
          </div>
          {folders.state === 'ready' && top.data !== undefined && (
            <Ready
              place={place}
              items={readiness(
                task,
                form.isError ? null : (form.data ?? null),
                settings.data?.encoding === 'utf-8' ? settings.data.content : null,
                folders.data,
                top.data,
                statement.data?.encoding === 'utf-8' ? statement.data.content : null,
              )}
            />
          )}
          <BodyText>
            {publishedLine(
              task.latest,
              task.latest === null ? null : savedBy(task.latest, changes),
            )}
          </BodyText>
          <NextStep place={place} state={task} saving={saving} manager={manager} />
        </div>
      )}
    </Loaded>
  );
}
