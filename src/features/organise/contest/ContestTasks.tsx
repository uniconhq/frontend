import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { isMap, isSeq } from 'yaml';
import { $api, queryView } from '@/api/query';
import type { TaskStanding } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { IconButton } from '@/ui/IconButton';
import { Chip } from '@/ui/Chip';
import { Modal } from '@/ui/Modal';
import { ListCard, type ListRow } from '@/ui/ListCard';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { useMe } from '@/session';
import { taskPath } from '@/lib/organiser-paths';
import { formatDateTime, serverNow } from '@/lib/time';
import { CreateButton } from '../Create';
import { DefinitionErrors } from '../DefinitionErrors';
import { definitionErrorsOf } from '../files/refusals';
import { SaveOutcome, type Outcome } from '../files/SaveOutcome';
import { holdsAtContest, tasksReached } from '../roles';
import type { ContestValues } from '../forms/contest-values';
import type { Doc } from '../forms/yaml-doc';
import { contestPlaceOf } from './opened';
import { FIELD_PARAM, ITEM_PARAM, viewFilePath } from './places';
import { useContestChange } from './save';
import { useContestSettings } from './settings';
import { EntryLine, TaskEntryDialog } from './TaskEntry';
import { STANDINGS, entrySentence, labelOf, useTaskTitles } from './task-entry';
import { FIRST_KIND, STARTER, startOn, type Kind } from '../task/new-task';
import { TaskKind } from '../task/TaskKind';
import shared from '../organise.module.css';
import { PageLink } from '@/ui/PageLink';
import { taskCardPath } from '@/lib/sections';
import classes from './contest.module.css';

const TASKS = '/api/v1/orgs/{org}/contests/{contest}/tasks';

function when(at: string): string {
  return formatDateTime(new Date(at));
}

/**
 * Where its files stand: published, a draft kept back, or a save with
 * problems; and "Withdrawn" first for a task withdrawn from the contest.
 */
function TaskState({ standing }: { standing: TaskStanding }) {
  const { latest, draft, errors } = standing.state;
  const published =
    latest === null
      ? 'Never published'
      : latest.number === 1
        ? `Publication 1, ${when(latest.at)}`
        : `Publication ${String(latest.number)}, ${when(latest.at)}${
            latest.grading_changed ? ', changed how it grades' : ''
          }`;
  return (
    <>
      {standing.withdrawn && <Chip tone="warn">Withdrawn</Chip>}
      {draft && errors.length > 0 && (
        <Chip tone="warn">
          {errors.length === 1 ? '1 problem' : `${String(errors.length)} problems`} in
          its last save
        </Chip>
      )}
      {draft && errors.length === 0 && <Chip>Draft, not published</Chip>}
      <span>{published}</span>
    </>
  );
}

/**
 * Who may change the contest's tasks, and how: open a task's dialog, put a
 * withdrawn one back, or move it.
 */
type Changing = {
  open: () => void;
  putBack: () => void;
  move: (by: -1 | 1) => void;
  first: boolean;
  last: boolean;
  /** Whether there is more than one task to move it among. */
  movable: boolean;
  moving: boolean;
};

/** A move asked about: the task, the way, and the two tasks' labels and letters. */
type Asked = {
  task: string;
  by: -1 | 1;
  label: string;
  letter: string;
  other: string;
  otherLetter: string;
};

function rowOf(
  org: string,
  contest: string,
  standing: TaskStanding,
  values: ContestValues | null,
  changing: Changing | null,
  titles: ReadonlyMap<string, string>,
): ListRow {
  const label = labelOf(standing, titles);
  return {
    key: standing.task.name,
    to: taskPath(org, contest, standing.task.name),
    name: label,
    label,
    text: `${label} ${standing.task.name}`,
    detail: (
      <>
        <span className={classes.line}>
          <TaskState standing={standing} />
        </span>
        <span className={classes.line}>
          <EntryLine
            sentence={entrySentence(standing, values)}
            label={label}
            onOpen={changing === null ? null : changing.open}
          />
        </span>
      </>
    ),
    action:
      changing === null || (!changing.movable && !standing.withdrawn) ? undefined : (
        <div className={classes.moves}>
          {standing.withdrawn && (
            <Button
              size="xs"
              variant="secondary"
              label={`Put ${label} back in the contest`}
              onClick={changing.putBack}
            >
              Put back
            </Button>
          )}
          {changing.movable && (
            <>
              <IconButton
                sign="↑"
                label={`Move ${label} up`}
                disabled={changing.first || changing.moving}
                onClick={() => changing.move(-1)}
              />
              <IconButton
                sign="↓"
                label={`Move ${label} down`}
                disabled={changing.last || changing.moving}
                onClick={() => changing.move(1)}
              />
            </>
          )}
        </div>
      ),
  };
}

/**
 * Move the entry of task `id` by one place in the contest's list, found by
 * its id in the settings as read, so a list someone else changed since the
 * page read it, or a retry on a newer version, still moves this task. At
 * either end of the list it stays.
 */
function moved(id: string, by: -1 | 1) {
  return (doc: Doc) => {
    const list = doc.get('tasks', true);
    if (!isSeq(list)) return;
    const from = list.items.findIndex((item) => isMap(item) && item.get('id') === id);
    const to = from + by;
    if (from < 0 || to < 0 || to >= list.items.length) return;
    const [item] = list.items.splice(from, 1);
    if (item !== undefined) list.items.splice(to, 0, item);
  };
}

/**
 * A contest's tasks as a list card, in the contest's order, each row its
 * letter and name, where its files stand, and its timeline in the
 * contest as one line, which a manager presses to change them, or take the
 * task out of the contest, in a dialog; a withdrawn task says so, with Put
 * back on its row;
 * with two tasks or more, arrows on each row move it up or down the list,
 * saving at once, since a task's letter is its place; once the contest has
 * started, entrants see the letters change, so a move asks first, as a save
 * of a task does then (#449). "New task" sits at the
 * bottom for a manager, which also adds it to the contest's tasks. A link to
 * a task's place in the contest (`?part=tasks&item=` its place in the list)
 * opens its dialog. Listing needs the observer role at the contest;
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
  // Opened by a withdrawn task's Put back, on its question.
  const [puttingBack, setPuttingBack] = useState(false);
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
  const titles = useTaskTitles(
    org,
    contest,
    view.state === 'ready' ? view.data.map((standing) => standing.task.name) : [],
  );
  const unreadable = view.state === 'error' && view.error.code === 'invalid_definition';
  const names = queryView(
    $api.useQuery('get', TASKS, { params: { path } }, { enabled: unreadable }),
  );
  const queryClient = useQueryClient();
  const change = useContestChange(org, contest);
  const [moveRefused, setMoveRefused] = useState<Outcome | null>(null);
  /** A move asked about, while the contest has started. */
  const [asked, setAsked] = useState<Asked | null>(null);
  const started =
    values !== null &&
    values.state === 'published' &&
    Date.parse(values.start) <= serverNow().getTime();
  const move = async (task: string, by: -1 | 1) => {
    setMoveRefused(null);
    setAsked(null);
    const outcome = await change.apply(moved(task, by));
    if (outcome.kind === 'refused') setMoveRefused(outcome);
    await queryClient.invalidateQueries({ queryKey: standingsKey });
  };
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
      ? view.data.map((standing, at, all) =>
          rowOf(
            org,
            contest,
            standing,
            values,
            manages
              ? {
                  open: () => {
                    setPuttingBack(false);
                    setEditing(at);
                  },
                  putBack: () => {
                    setPuttingBack(true);
                    setEditing(at);
                  },
                  move: (by) => {
                    const other = all[at + by];
                    if (!started || other === undefined) {
                      void move(standing.task.name, by);
                      return;
                    }
                    setAsked({
                      task: standing.task.name,
                      by,
                      label: labelOf(standing, titles),
                      letter: standing.label,
                      other: labelOf(other, titles),
                      otherLetter: other.label,
                    });
                  },
                  first: at === 0,
                  last: at === all.length - 1,
                  movable: all.length > 1,
                  moving: change.pending,
                }
              : null,
            titles,
          ),
        )
      : unreadable
        ? names.state === 'ready'
          ? byName(names.data.map((task) => task.name))
          : []
        : view.state === 'error'
          ? byName(tasksReached(roles, org, contest))
          : [];

  const notice =
    moveRefused !== null ? (
      <SaveOutcome
        outcome={moveRefused}
        onConfirm={(body, asked) => {
          void change
            .write({ ...body, confirm: true, asked })
            .then((answer) =>
              setMoveRefused(answer.kind === 'refused' ? answer : null),
            );
        }}
        onCancel={() => setMoveRefused(null)}
        onReload={() => setMoveRefused(null)}
      />
    ) : startFailed !== null ? (
      <div className={classes.panel} role="alert">
        <BodyText>
          {startFailed.task} was created, but its workflow could not be set to{' '}
          {startFailed.workflow}, so it is graded by {STARTER} for now. Choose its
          workflow on{' '}
          <PageLink to={taskCardPath(org, contest, startFailed.task, 'workflow')}>
            its page
          </PageLink>
          .
        </BodyText>
      </div>
    ) : view.state !== 'error' ? undefined : unreadable ? (
      <div className={classes.panel} role="alert">
        <BodyText>The contest&apos;s settings cannot be read</BodyText>
        <BodyText tone="secondary">
          Each task&apos;s timeline comes from the contest&apos;s settings, which have
          problems. Fix each problem where it is listed, or fix them as text in{' '}
          <PageLink to={viewFilePath(org, contest)}>the stored settings</PageLink>.
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
          <BodyText>Tasks of this contest where you have a role:</BodyText>
        )}
      </>
    );

  const editingStanding =
    editing === null || view.state !== 'ready' ? undefined : view.data[editing];
  const closeEditing = () => {
    setEditing(null);
    setPuttingBack(false);
    if (search.has('part')) {
      const next = new URLSearchParams(search);
      for (const key of ['part', ITEM_PARAM, FIELD_PARAM]) next.delete(key);
      setSearch(next, { replace: true });
    }
    void queryClient.invalidateQueries({ queryKey: standingsKey });
  };

  return (
    <div ref={card}>
      <Modal
        opened={asked !== null}
        onClose={() => setAsked(null)}
        title={
          asked === null ? '' : `Move ${asked.label} ${asked.by < 0 ? 'up' : 'down'}?`
        }
      >
        {asked !== null && (
          <div className={shared.stack}>
            <BodyText>
              The contest has started, so entrants see this at once: {asked.label}{' '}
              becomes {asked.otherLetter}, and {asked.other} becomes {asked.letter}. The
              leaderboards, the contest’s page and every announcement or question that
              names a task by its letter go by the new letters.
            </BodyText>
            <div className={shared.actions}>
              <Button
                loading={change.pending}
                onClick={() => void move(asked.task, asked.by)}
              >
                {asked.by < 0 ? 'Move it up' : 'Move it down'}
              </Button>
              <Button variant="secondary" onClick={() => setAsked(null)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Modal>
      <TaskEntryDialog
        org={org}
        contest={contest}
        standing={editingStanding}
        label={editingStanding === undefined ? '' : labelOf(editingStanding, titles)}
        start={puttingBack ? 'put-back' : null}
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
                description:
                  'Shown on the task’s pages. Left empty, its name is shown.',
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
