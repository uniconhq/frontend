import { useQueryClient } from '@tanstack/react-query';
import { $api, queryView } from '@/api/query';
import type { TaskStanding } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Chip } from '@/ui/Chip';
import { ListCard, type ListRow } from '@/ui/ListCard';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { useMe } from '@/session';
import { formatExact } from '@/lib/exact';
import { taskPath } from '@/lib/organiser-paths';
import { formatDateTime } from '@/lib/time';
import { CreateButton } from '../Create';
import { DefinitionErrors } from '../DefinitionErrors';
import { definitionErrorsOf } from '../files/refusals';
import { holdsAtContest, tasksReached } from '../roles';
import classes from './contest.module.css';

const STANDINGS = '/api/v1/orgs/{org}/contests/{contest}/organise/tasks';
const TASKS = '/api/v1/orgs/{org}/contests/{contest}/tasks';

function when(at: string): string {
  return formatDateTime(new Date(at));
}

/**
 * A fraction, served as exact digits, as the percentage it is, to the last
 * digit: 0.1 is `10%` and 0.0001 is `0.01%`.
 */
function percent(fraction: string): string {
  const [whole = '0', decimals = ''] = fraction.split('.');
  const padded = decimals.padEnd(2, '0');
  const rest = padded.slice(2);
  const digits = `${whole}${padded.slice(0, 2)}`.replace(/^0+(?=\d)/, '');
  return `${formatExact(rest === '' ? digits : `${digits}.${rest}`, rest.length)}%`;
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

/** When it opens, falls due and closes, and what it is worth, defaults resolved. */
function timeline({ timeline, state }: TaskStanding): string {
  const worth =
    timeline.worth !== null
      ? `${timeline.worth} ${timeline.worth === '1' ? 'point' : 'points'}`
      : state.latest === null
        ? 'Worth not known until published'
        : 'No points';
  const due =
    timeline.due === null
      ? 'no due time'
      : `due ${when(timeline.due)}${
          timeline.late_per_day === null
            ? ''
            : `, then ${percent(timeline.late_per_day)} off per late day started`
        }`;
  return `${worth} · released ${when(timeline.release_at)} · ${due} · closes ${when(timeline.closes)}`;
}

function rowOf(org: string, contest: string, standing: TaskStanding): ListRow {
  const label = `${standing.label} · ${standing.task.name}`;
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
        <span className={classes.line}>{timeline(standing)}</span>
      </>
    ),
  };
}

/**
 * A contest's tasks as a list card, in the contest's order, each row its
 * letter and name, where its files stand and its timeline from
 * `contest.yaml`; "New task" at the bottom for a manager, which also adds it
 * to the contest's tasks. Listing needs the observer role at the contest;
 * someone who holds a role only at one of its tasks is refused the list, so
 * the refusal comes with the tasks their own roles reach. A `contest.yaml`
 * that does not pass validation shows its errors and lists the tasks by
 * name alone, so the way to each still works while it is mended.
 */
export function ContestTasks({ org, contest }: { org: string; contest: string }) {
  const roles = useMe().roles;
  const manages = holdsAtContest(roles, org, contest, 'manager');
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
      ? view.data.map((standing) => rowOf(org, contest, standing))
      : unreadable
        ? names.state === 'ready'
          ? byName(names.data.map((task) => task.name))
          : []
        : view.state === 'error'
          ? byName(tasksReached(roles, org, contest))
          : [];

  const notice =
    view.state !== 'error' ? undefined : unreadable ? (
      <div className={classes.panel} role="alert">
        <BodyText>The contest&apos;s settings do not read</BodyText>
        <BodyText tone="secondary">
          Where each task stands comes from the contest&apos;s settings, which do not
          pass validation. Mend them in Settings or Files.
        </BodyText>
        {definitionErrorsOf(view.error).length > 0 ? (
          <DefinitionErrors errors={definitionErrorsOf(view.error)} />
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

  return (
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
              description: 'Shown to contestants. The name is used when there is none.',
            }}
            submitLabel="Create task"
            pending={create.isPending}
            error={create.error}
            onOpen={create.reset}
            onSubmit={async (name, title) => {
              await create.mutateAsync({
                params: { path },
                body: { name, title: title === '' ? null : title },
              });
            }}
          />
        ) : undefined
      }
    />
  );
}
