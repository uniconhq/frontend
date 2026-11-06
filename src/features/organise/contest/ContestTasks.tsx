import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { $api, isRefused, queryView } from '@/api/query';
import type { TaskStanding } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { IconButton } from '@/ui/IconButton';
import { Chip } from '@/ui/Chip';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { ListCard, type ListRow } from '@/ui/ListCard';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { taskPath } from '@/lib/organiser-paths';
import { formatDateTime, serverNow } from '@/lib/time';
import { useNamedTasks } from '@/session';
import { CreateButton } from '../Create';
import { DefinitionErrors } from '../DefinitionErrors';
import { definitionErrorsOf } from '../files/refusals';
import { SaveOutcome, type Outcome } from '../files/SaveOutcome';
import { settingsQuery } from '../files/place';
import { usePlaceMay } from '../may';
import type { ContestValues } from '../forms/contest-values';
import type { SettingsBody } from '../forms/settings-hooks';
import { isRecord, type Values } from '../forms/values';
import { contestPlaceOf } from './opened';
import { FIELD_PARAM, ITEM_PARAM, viewFilePath } from './places';
import { useContestChange } from './save';
import { useContestSettings } from './settings';
import { EntryLine, TaskEntryDialog } from './TaskEntry';
import { STANDINGS, entrySentence, labelOf, useTaskTitles } from './task-entry';
import { FIRST_KIND, STARTER, startOn, type Kind } from '../task/new-task';
import { TaskKind } from '../task/TaskKind';
import { PageLink } from '@/ui/PageLink';
import { Group } from '@/ui/layout';
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
        <Group gap={4} align="stretch" wrap="nowrap">
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
        </Group>
      ),
  };
}

/**
 * Move the entry of task `id` by one place in the contest's list, found by
 * its id in the settings as read, so a list someone else changed since the
 * page read it still moves this task. At either end of the list it stays.
 */
function moved(id: string, by: -1 | 1) {
  return (values: Values) => {
    const list: unknown = values['tasks'];
    if (!Array.isArray(list)) return;
    const items = list as unknown[];
    const from = items.findIndex((item) => isRecord(item) && item['id'] === id);
    const to = from + by;
    if (from < 0 || to < 0 || to >= items.length) return;
    items.splice(to, 0, ...items.splice(from, 1));
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
 * opens its dialog. The rows need the observer role at the contest;
 * someone refused them sees, by name, the tasks `me` names. A `contest.yaml`
 * that does not pass validation shows its errors and lists the tasks by
 * name alone, so the way to each still works while it is mended.
 */
export function ContestTasks({ org, contest }: { org: string; contest: string }) {
  const manages = usePlaceMay({ kind: 'contest', org, contest }).manage;
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
  const refused = isRefused(view);
  const named = useNamedTasks(org, contest);
  const names = queryView(
    $api.useQuery(
      'get',
      TASKS,
      { params: { path } },
      { enabled: view.state === 'error' && !refused },
    ),
  );
  const queryClient = useQueryClient();
  const change = useContestChange(org, contest);
  const [moveRefused, setMoveRefused] = useState<Outcome<SettingsBody> | null>(null);
  // A move someone else's save beat: the list is read again to move from.
  const [moveBeaten, setMoveBeaten] = useState(false);
  /** A move asked about, while the contest has started. */
  const [asked, setAsked] = useState<Asked | null>(null);
  const started =
    values !== null &&
    values.state === 'published' &&
    Date.parse(values.start) <= serverNow().getTime();
  const moveAnswered = async (outcome: Outcome<SettingsBody>) => {
    const beaten = outcome.kind === 'refused' && outcome.error.code === 'conflict';
    setMoveBeaten(beaten);
    setMoveRefused(outcome.kind === 'refused' && !beaten ? outcome : null);
    await queryClient.invalidateQueries({ queryKey: standingsKey });
    if (beaten) {
      await queryClient.invalidateQueries({
        queryKey: settingsQuery({ kind: 'contest', org, contest }).queryKey,
      });
    }
  };
  const move = async (task: string, by: -1 | 1) => {
    setMoveRefused(null);
    setMoveBeaten(false);
    setAsked(null);
    // A move is relative, so it is not made again on someone else's change.
    await moveAnswered(await change.apply(moved(task, by), { retry: false }));
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
      : refused
        ? byName(named)
        : names.state === 'ready'
          ? byName(names.data.map((task) => task.name))
          : [];

  const notice =
    moveRefused !== null ? (
      <SaveOutcome
        outcome={moveRefused}
        onConfirm={(body, asked) => {
          void change.write({ ...body, confirm: true, asked }).then(moveAnswered);
        }}
        onCancel={() => setMoveRefused(null)}
        onReload={() => setMoveRefused(null)}
      />
    ) : moveBeaten ? (
      <div className={classes.panel} role="alert">
        <BodyText>
          The tasks changed since this page read them, so nothing was moved. The list
          now shows them as they are. Move the task again if you still want to.
        </BodyText>
      </div>
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
      <ConfirmDialog
        opened={asked !== null}
        onClose={() => setAsked(null)}
        title={
          asked === null ? '' : `Move ${asked.label} ${asked.by < 0 ? 'up' : 'down'}?`
        }
        confirm={asked === null ? '' : asked.by < 0 ? 'Move it up' : 'Move it down'}
        loading={change.pending}
        onConfirm={() => asked !== null && void move(asked.task, asked.by)}
      >
        {asked !== null && (
          <BodyText>
            The contest has started, so entrants see this at once: {asked.label} becomes{' '}
            {asked.otherLetter}, and {asked.other} becomes {asked.letter}. The
            leaderboards, the contest’s page and every announcement or question that
            names a task by its letter go by the new letters.
          </BodyText>
        )}
      </ConfirmDialog>
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
