import { useQuery } from '@tanstack/react-query';
import { $api, queryView } from '@/api/query';
import type { FileChange, TaskState, WorkflowForm } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { HubCard } from '@/ui/HubCard';
import { Chip } from '@/ui/Chip';
import { Loaded } from '@/ui/feedback/Loaded';
import { Group } from '@/ui/layout';
import { taskCardPath, taskSectionPath } from '@/lib/sections';
import { formatDateTime } from '@/lib/time';
import { DefinitionErrors } from '../DefinitionErrors';
import { TaskInContest } from '../contest/TaskEntry';
import { settingsQuery } from '../files/place';
import { readTask } from '../forms/task-values';
import { useDraftRuns } from './draft-runs';
import type { Values } from '../forms/values';
import { inputTitle, taskPath, useWorkflowForm, type TaskPlace } from './build-data';
import type { TaskSave } from './build-save';
import { taskPlaceOf } from './places';
import { publishedLine, savedBy } from './published';
import { Checklist, StatusBox, Summary } from '../hub/Status';
import classes from './task.module.css';

const TASK = '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}';

/** What pages call each language a task's toolchain is prepared for. */
const LANGUAGE_NAMES: Record<string, string> = {
  c: 'C',
  cpp: 'C++',
  java: 'Java',
  kotlin: 'Kotlin',
  python: 'Python',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  csharp: 'C#',
  rust: 'Rust',
  r: 'R',
  ruby: 'Ruby',
};

/**
 * A toolchain's package as people know it, before its version: the
 * compiler or runtime by its own name, and none where the language's name
 * already says it, as "Python: 3.14.3".
 */
const TOOL_NAMES: Record<string, string> = {
  gcc: 'gcc ',
  gxx: 'gcc ',
  openjdk: 'OpenJDK ',
  nodejs: 'Node.js ',
  dotnet: '.NET ',
  python: '',
  kotlin: '',
  typescript: '',
  rust: '',
  'r-base': '',
  ruby: '',
};

/** A toolchain as it was picked, "gxx 14.3.0", in the words above: "gcc 14.3.0". */
function pickedWords(picked: string): string {
  const space = picked.indexOf(' ');
  if (space < 0) return picked;
  const tool = TOOL_NAMES[picked.slice(0, space)];
  return tool === undefined ? picked : `${tool}${picked.slice(space + 1)}`;
}

/** Where the task's files stand, in a word beside its name. */
function StateChip({ state }: { state: TaskState }) {
  if (state.draft && state.errors.length > 0) {
    return <Chip tone="warn">Last save has problems</Chip>;
  }
  if (state.latest === null) return <Chip>Not published</Chip>;
  if (state.latest.check === 'checking') return <Chip>Checking</Chip>;
  if (state.latest.check === 'refused') return <Chip tone="warn">Refused</Chip>;
  if (state.latest.check === 'unchecked') return <Chip>Never checked</Chip>;
  if (state.draft) return <Chip>Draft, not published</Chip>;
  return <Chip tone="live">Published</Chip>;
}

type Card = 'workflow' | 'inputs' | 'runs' | 'statement';

type Item = { card: Card; ok: boolean; text: string };

const under = (state: TaskState, top: string) =>
  state.errors.some((error) => error.path[0] === top);

/**
 * Each part of the task, ticked when it is done or saying what it is
 * missing, in the order its cards build it: its statement, its workflow, its
 * inputs and its runs (M11).
 */
/** The saved settings as the cards read them. */
function savedTask(form: WorkflowForm | null, settings: Values | null) {
  const declared = form?.problem === null ? form.inputs : null;
  return settings === null ? null : readTask(settings, declared).values;
}

function readiness(
  state: TaskState,
  form: WorkflowForm | null,
  settings: Values | null,
  runs: number | null,
): Item[] {
  // The forge says whether the statement saved is written: not blank, and not
  // the one a new task starts with (M57).
  const written = state.head_statement_written;
  const declared = form?.problem === null ? form.inputs : null;
  // Read against the inputs declared, so one only a run gives, in `repeat`
  // and not `inputs`, is read as given each run.
  const values = settings === null ? null : readTask(settings, declared).values;
  const needed = (declared ?? []).filter((input) => !input.optional);
  // An input the entrant gives, or one each run gives, needs no value here.
  const missing = needed.find((input) => {
    const given = values?.inputs.find((found) => found.id === input.id);
    if (given?.give === 'entrant' || given?.give === 'per-run') return false;
    return (given?.value.trim() ?? '') === '';
  });
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
      card: 'runs',
      ok: !under(state, 'repeat'),
      text: under(state, 'repeat')
        ? 'Runs: see the problems below'
        : runs === null
          ? 'Runs'
          : `Runs: ${String(runs)}`,
    },
  ];
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
    <Group gap="6px 10px">
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
    </Group>
  );
}

/** Where the task's files stand, and when they were last saved, by whom. */
export function TaskStateLine({ place }: { place: TaskPlace }) {
  const path = taskPath(place);
  const state = $api.useQuery('get', TASK, { params: { path } }).data;
  const last = $api.useQuery('get', `${TASK}/history`, { params: { path } }).data?.[0];
  if (state === undefined) return null;
  return (
    <>
      <StateChip state={state} />
      {last !== undefined && (
        <BodyText tone="secondary">
          Last saved {formatDateTime(new Date(last.at))}
          {last.author === null ? '' : ` by ${last.author}`}
        </BodyText>
      )}
    </>
  );
}

/**
 * Under a task's title: a box with a tick for each part of the task that is
 * done, or what it lacks, each going to its card, and what to do next when a
 * save is stuck; then its facts at a glance: its timeline in the contest
 * (M68), what entrants are graded on (M21), its results and its toolchains.
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
  const settings = useQuery({ ...settingsQuery(place), retry: false });
  const saved = savedTask(
    form.isError ? null : (form.data ?? null),
    settings.data?.values ?? null,
  );
  const runs = useDraftRuns(place, saved?.axes ?? [], saved?.inputs ?? []).runs;
  const changes: FileChange[] | undefined = history.data;

  return (
    <Loaded view={state} rows={2}>
      {(task) => {
        const toolchains = Object.entries(task.toolchains ?? {});
        return (
          <div className={classes.standing} aria-label="Where the task stands">
            <StatusBox>
              {/* Only once both are read, so it never says what they lack meanwhile. */}
              {!form.isPending && !settings.isPending && (
                <Checklist
                  label="What the task has"
                  checks={readiness(
                    task,
                    form.isError ? null : (form.data ?? null),
                    settings.data?.values ?? null,
                    runs?.count ?? null,
                  ).map((item) => ({
                    key: item.card,
                    ok: item.ok,
                    text: item.text,
                    to: taskCardPath(place.org, place.contest, place.task, item.card),
                  }))}
                />
              )}
              {(task.latest?.failed_checks ?? []).length > 0 && (
                <ul aria-label="Failed checks">
                  {(task.latest?.failed_checks ?? []).map((check) => (
                    <li key={check.index}>
                      Check {String(check.index)}
                      <ul>
                        {check.failing.map((sentence) => (
                          <li key={sentence}>{sentence}</li>
                        ))}
                        {check.runs.map((run) => (
                          <li key={run.id}>
                            {run.id}: {run.verdict}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
              <BodyText>
                {publishedLine(
                  task.latest,
                  task.latest === null ? null : savedBy(task.latest, changes),
                )}
              </BodyText>
              <NextStep place={place} state={task} saving={saving} manager={manager} />
            </StatusBox>
            <HubCard
              title="Settings"
              to={taskSectionPath(place.org, place.contest, place.task, 'settings')}
            >
              <Summary
                label="The settings"
                items={[
                  {
                    term: 'Timeline',
                    value: (
                      <TaskInContest
                        org={place.org}
                        contest={place.contest}
                        task={place.task}
                        readOnly
                      />
                    ),
                  },
                  ...(task.results === undefined
                    ? []
                    : [
                        {
                          term: 'Results',
                          value: task.results.released ? 'Released' : 'Not released',
                        },
                      ]),
                  ...(toolchains.length === 0
                    ? []
                    : [
                        {
                          term: 'Toolchains',
                          value: toolchains.map(([language, toolchain]) => (
                            <div key={language}>
                              {LANGUAGE_NAMES[language] ?? language}:{' '}
                              {pickedWords(toolchain.picked)} (
                              {toolchain.version === null
                                ? 'newest when first prepared'
                                : `named ${toolchain.version}`}
                              )
                            </div>
                          )),
                        },
                      ]),
                ]}
              />
            </HubCard>
          </div>
        );
      }}
    </Loaded>
  );
}
