import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { isSeq } from 'yaml';
import { $api, queryView } from '@/api/query';
import type { TaskStanding } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Modal } from '@/ui/Modal';
import { Chip } from '@/ui/Chip';
import { ListCard, type ListRow } from '@/ui/ListCard';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { useMe } from '@/session';
import { taskPath } from '@/lib/organiser-paths';
import { formatDateTime } from '@/lib/time';
import { CreateButton } from '../Create';
import { DefinitionErrors } from '../DefinitionErrors';
import { definitionErrorsOf } from '../files/refusals';
import { holdsAtContest, tasksReached } from '../roles';
import type { ContestValues } from '../forms/contest-values';
import type { Doc } from '../forms/yaml-doc';
import { contestPlaceOf } from './opened';
import { FIELD_PARAM, ITEM_PARAM } from './places';
import { useContestChange } from './save';
import { useContestSettings } from './settings';
import { TaskTimelineForm } from './TaskTimelineForm';
import { FIRST_KIND, STARTER, startOn, type Kind } from '../task/new-task';
import { TaskKind } from '../task/TaskKind';
import { PageLink } from '@/ui/PageLink';
import { taskCardPath } from '@/lib/sections';
import { markedBoardCovers, timelineSentence } from './timeline';
import shared from '../organise.module.css';
import classes from './contest.module.css';

const STANDINGS = '/api/v1/orgs/{org}/contests/{contest}/organise/tasks';
const TASKS = '/api/v1/orgs/{org}/contests/{contest}/tasks';

function when(at: string): string {
  return formatDateTime(new Date(at));
}

/** Where its files stand: published, a draft kept back, or a save with problems. */
function TaskState({ standing }: { standing: TaskStanding }) {
  const { latest, draft, errors } = standing.state;
  const published =
    latest === null
      ? 'Never published'
      : `Publication ${String(latest.number)}, ${when(latest.at)}, ${
          latest.grading_changed ? 'changed how it grades' : 'grading unchanged'
        }`;
  return (
    <>
      {draft && errors.length > 0 && (
        <Chip tone="warn">
          {errors.length === 1 ? '1 problem' : `${String(errors.length)} problems`} in
          its last save
        </Chip>
      )}
      {draft && errors.length === 0 && <Chip>Draft kept back</Chip>}
      <span>{published}</span>
    </>
  );
}

function rowOf(
  org: string,
  contest: string,
  standing: TaskStanding,
  values: ContestValues | null,
  onEdit: (() => void) | null,
): ListRow {
  const label = `${standing.label} · ${standing.task.name}`;
  const entry = values?.tasks.find((found) => found.id === standing.task.name);
  const marks =
    values !== null && markedBoardCovers(values, standing.task.name)
      ? entry === undefined || entry.marks === ''
        ? '1'
        : entry.marks
      : null;
  return {
    key: standing.task.name,
    to: taskPath(org, contest, standing.task.name),
    name: label,
    label,
    text: label,
    detail: (
      <>
        <span className={classes.line}>
          <TaskState standing={standing} />
        </span>
        <span className={classes.line}>
          {timelineSentence(standing, values, marks)}
        </span>
      </>
    ),
    action:
      onEdit === null ? undefined : (
        <Button
          size="xs"
          variant="secondary"
          label={`Edit the timeline of ${label}`}
          onClick={onEdit}
        >
          Edit
        </Button>
      ),
  };
}

/** Move the task entry at `from` by one place in the contest's list. */
function moved(from: number, by: -1 | 1) {
  return (doc: Doc) => {
    const list = doc.get('tasks', true);
    if (!isSeq(list)) return;
    const [item] = list.items.splice(from, 1);
    if (item !== undefined) list.items.splice(from + by, 0, item);
  };
}

/**
 * The dialog a task's timeline is edited in, from its row, with the buttons
 * that move it up and down the contest's list, which save at once, since
 * its place is its letter.
 */
function EditTimeline({
  org,
  contest,
  standings,
  editing,
  onClose,
}: {
  org: string;
  contest: string;
  standings: TaskStanding[];
  editing: number | null;
  onClose: () => void;
}) {
  const { apply, pending } = useContestChange(org, contest);
  const [refused, setRefused] = useState<unknown>(null);
  const standing = editing === null ? undefined : standings[editing];
  const label =
    standing === undefined ? '' : `${standing.label} · ${standing.task.name}`;
  const move = async (by: -1 | 1) => {
    if (editing === null) return;
    setRefused(null);
    const outcome = await apply(moved(editing, by));
    if (outcome.kind === 'refused') setRefused(outcome.error);
    else onClose();
  };
  return (
    <Modal
      opened={standing !== undefined}
      onClose={onClose}
      title={`Timeline of ${label}`}
    >
      {standing !== undefined && editing !== null && (
        <div className={shared.stack}>
          <TaskTimelineForm org={org} contest={contest} standing={standing} />
          <div className={shared.actions}>
            <Button
              size="xs"
              variant="secondary"
              disabled={editing === 0}
              loading={pending}
              onClick={() => void move(-1)}
            >
              Move up
            </Button>
            <Button
              size="xs"
              variant="secondary"
              disabled={editing === standings.length - 1}
              loading={pending}
              onClick={() => void move(1)}
            >
              Move down
            </Button>
            <BodyText tone="secondary">
              A task’s letter is its place in the list.
            </BodyText>
          </div>
          {refused !== null && (
            <div role="alert">
              <ErrorBlock error={refused} compact />
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

/**
 * A contest's tasks as a list card, in the contest's order, each row its
 * letter and name, where its files stand and its timeline in the contest as
 * one line, which a manager edits from the row; "New task" at the bottom
 * for a manager, which also adds it to the contest's tasks. A link to a
 * task's timeline (`?part=tasks&item=` its place) opens it. Listing needs
 * the observer role at the contest;
 * someone who holds a role only at one of its tasks is refused the list, so
 * the refusal comes with the tasks their own roles reach. A `contest.yaml`
 * that does not pass validation shows its errors and lists the tasks by
 * name alone, so the way to each still works while it is mended.
 */
export function ContestTasks({ org, contest }: { org: string; contest: string }) {
  const roles = useMe().roles;
  const manages = holdsAtContest(roles, org, contest, 'manager');
  const settings = useContestSettings(org, contest);
  const values = settings.state === 'ready' ? settings.data : null;
  const [search, setSearch] = useSearchParams();
  const opened = search.get('part') === 'tasks' ? search.get(ITEM_PARAM) : null;
  const [editing, setEditing] = useState<number | null>(
    opened === null ? null : Number(opened),
  );
  // A link to a task's timeline followed while the page is open opens it too.
  const [shownOpened, setShownOpened] = useState(opened);
  if (shownOpened !== opened) {
    setShownOpened(opened);
    if (opened !== null) setEditing(Number(opened));
  }
  const card = useRef<HTMLDivElement>(null);
  const [kind, setKind] = useState<Kind>(FIRST_KIND);
  const [starting, setStarting] = useState(false);
  const [startFailed, setStartFailed] = useState<{
    task: string;
    workflow: string;
  } | null>(null);
  useEffect(() => {
    if (search.get('part') === 'tasks')
      card.current?.scrollIntoView?.({ block: 'start' });
  }, [search]);
  const path = { org, contest };
  const standingsKey = $api.queryOptions('get', STANDINGS, {
    params: { path },
  }).queryKey;
  const view = queryView(
    $api.useQuery(
      'get',
      STANDINGS,
      { params: { path } },
      // A save on the task's own page moves its state; read it again on the way back.
      { staleTime: 0 },
    ),
  );
  const unreadable = view.state === 'error' && view.error.code === 'invalid_definition';
  const names = queryView(
    $api.useQuery('get', TASKS, { params: { path } }, { enabled: unreadable }),
  );
  const queryClient = useQueryClient();
  const create = $api.useMutation('post', TASKS, {
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: standingsKey }),
        queryClient.invalidateQueries({
          queryKey: $api.queryOptions('get', TASKS, { params: { path } }).queryKey,
        }),
      ]),
  });

  const byName = (list: string[]): ListRow[] =>
    list.map((name) => ({
      key: name,
      to: taskPath(org, contest, name),
      name,
      text: name,
    }));
  const rows: ListRow[] =
    view.state === 'ready'
      ? view.data.map((standing, at) =>
          rowOf(org, contest, standing, values, manages ? () => setEditing(at) : null),
        )
      : unreadable
        ? names.state === 'ready'
          ? byName(names.data.map((task) => task.name))
          : []
        : view.state === 'error'
          ? byName(tasksReached(roles, org, contest))
          : [];

  const notice =
    startFailed !== null ? (
      <div className={classes.panel} role="alert">
        <BodyText>
          {startFailed.task} was made, but not on {startFailed.workflow}: it grades with{' '}
          {STARTER} until another workflow is chosen on{' '}
          <PageLink to={taskCardPath(org, contest, startFailed.task, 'workflow')}>
            its page
          </PageLink>
          .
        </BodyText>
      </div>
    ) : view.state !== 'error' ? undefined : unreadable ? (
      <div className={classes.panel} role="alert">
        <BodyText>The contest&apos;s settings do not read</BodyText>
        <BodyText tone="secondary">
          Where each task stands comes from the contest&apos;s settings, which do not
          pass validation. Mend each problem where it says.
        </BodyText>
        {definitionErrorsOf(view.error).length > 0 ? (
          <DefinitionErrors
            errors={definitionErrorsOf(view.error)}
            placeOf={contestPlaceOf(org, contest)}
          />
        ) : (
          view.error.detail !== undefined && (
            <BodyText tone="secondary">{view.error.detail}</BodyText>
          )
        )}
      </div>
    ) : (
      <>
        <ErrorBlock error={view.error} onRetry={view.retry} />
        {rows.length > 0 && (
          <BodyText>Tasks of this contest you hold a role at:</BodyText>
        )}
      </>
    );

  const closeEditing = () => {
    setEditing(null);
    if (search.has('part')) {
      const next = new URLSearchParams(search);
      for (const key of ['part', ITEM_PARAM, FIELD_PARAM]) next.delete(key);
      setSearch(next, { replace: true });
    }
    void queryClient.invalidateQueries({ queryKey: standingsKey });
  };

  return (
    <div ref={card}>
      <EditTimeline
        org={org}
        contest={contest}
        standings={view.state === 'ready' ? view.data : []}
        editing={editing}
        onClose={closeEditing}
      />
      <ListCard
        title="Tasks"
        rows={rows}
        empty="No tasks yet."
        notice={notice}
        body={
          view.state === 'loading' || (unreadable && names.state === 'loading') ? (
            <PageSkeleton rows={3} />
          ) : view.state === 'error' && rows.length === 0 ? (
            <></>
          ) : undefined
        }
        action={
          manages && (view.state === 'ready' || unreadable) ? (
            <CreateButton
              openLabel="New task"
              second={{
                label: 'Title',
                description: 'Shown on its pages. Its name is used when there is none.',
              }}
              submitLabel="Create task"
              pending={create.isPending || starting}
              error={create.error}
              onOpen={() => {
                create.reset();
                setKind(FIRST_KIND);
                setStartFailed(null);
              }}
              onSubmit={async (name, title) => {
                await create.mutateAsync({
                  params: { path },
                  body: { name, title: title === '' ? null : title },
                });
                if (kind.workflow === STARTER || kind.workflow === '') return;
                // The task is made; a workflow it could not be set to is said
                // beside the list, to choose on the task's page.
                setStarting(true);
                try {
                  await startOn({ org, contest, task: name }, kind.workflow);
                } catch {
                  setStartFailed({ task: name, workflow: kind.workflow });
                } finally {
                  setStarting(false);
                }
              }}
            >
              <TaskKind value={kind} onChange={setKind} />
            </CreateButton>
          ) : undefined
        }
      />
    </div>
  );
}
