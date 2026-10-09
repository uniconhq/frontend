import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { $api, queryView } from '@/api/query';
import { Card } from '@/ui/Card';
import { BodyText } from '@/ui/BodyText';
import { PageTitle } from '@/ui/PageTitle';
import { SectionTitle } from '@/ui/SectionTitle';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { useMe } from '@/session';
import { contestHomePath } from '@/lib/contest-paths';
import {
  boardsPath,
  contestantsPath,
  gradingsPath,
  taskPath,
  teamsPath,
} from '@/lib/organiser-paths';
import { PageLink } from '@/ui/PageLink';
import { Create } from '../Create';
import { DefinitionErrors } from '../DefinitionErrors';
import { definitionErrorsOf } from '../files/refusals';
import { AnnouncementsSection } from '../threads/AnnouncementsSection';
import { ContestClarifications } from '../threads/Clarifications';
import { PeopleSection } from '../people/PeopleSection';
import { LinkList } from '../LinkList';
import { TaskStandings } from './TaskStandings';
import { FileBrowser } from '../files/FileBrowser';
import { ContestSettingsSection } from '../forms/sections';
import { useContestParams } from '@/lib/route-params';
import { tasksReached } from '../roles';
import classes from '../organise.module.css';

const STANDINGS = '/api/v1/orgs/{org}/contests/{contest}/organise/tasks';

/** The writes of a contest's file, any of which may change a task's timeline. */
const CONTEST_WRITES = new Set([
  '/api/v1/orgs/{org}/contests/{contest}/files/{path}',
  '/api/v1/orgs/{org}/contests/{contest}/files/{path}/rollback',
]);

/**
 * Reads the standings again once a write of one of the contest's files has
 * gone through, from the settings form or the file editor alike, since
 * `contest.yaml` holds every task's timeline.
 */
function useStandingsFollowContestWrites(org: string, contest: string) {
  const queryClient = useQueryClient();
  useEffect(() => {
    const queryKey = $api.queryOptions('get', STANDINGS, {
      params: { path: { org, contest } },
    }).queryKey;
    return queryClient.getMutationCache().subscribe((event) => {
      const route = event.mutation?.options.mutationKey?.[1];
      if (
        event.type === 'updated' &&
        event.action.type === 'success' &&
        typeof route === 'string' &&
        CONTEST_WRITES.has(route)
      ) {
        void queryClient.invalidateQueries({ queryKey });
      }
    });
  }, [queryClient, org, contest]);
}

/**
 * A contest's tasks and where each stands, the button that opens the form
 * for a new one, which also adds it to `contest.yaml`'s tasks, and the
 * contest repo's files, `contest.yaml` among them, with the way to its
 * registrations, its teams, its gradings, its boards and the page its
 * contestants see.
 * Each part loads and fails on its own, so a refused task list still leaves
 * the files readable. Listing needs the observer role at the contest;
 * someone who holds a role only at one of its tasks is refused the list, so
 * the refusal comes with the tasks their own roles reach. A `contest.yaml`
 * that does not pass validation shows its errors, each at its YAML path,
 * and leaves the tasks by name alone, so the way to each still works while
 * it is mended.
 */
export function ContestPage() {
  const { org, contest } = useContestParams();
  const reached = tasksReached(useMe().roles, org, contest);
  const standingsKey = $api.queryOptions('get', STANDINGS, {
    params: { path: { org, contest } },
  }).queryKey;
  const standings = $api.useQuery(
    'get',
    STANDINGS,
    { params: { path: { org, contest } } },
    // A save on the task's own page moves its state; read it again on the way back.
    { staleTime: 0 },
  );
  const view = queryView(standings);
  useStandingsFollowContestWrites(org, contest);
  // `contest.yaml` that does not pass validation is refused as
  // `invalid_definition`, naming each error at its YAML path.
  const unreadable = view.state === 'error' && view.error.code === 'invalid_definition';
  const names = queryView(
    $api.useQuery(
      'get',
      '/api/v1/orgs/{org}/contests/{contest}/tasks',
      { params: { path: { org, contest } } },
      { enabled: unreadable },
    ),
  );
  const queryClient = useQueryClient();
  const create = $api.useMutation(
    'post',
    '/api/v1/orgs/{org}/contests/{contest}/tasks',
    {
      onSuccess: () =>
        Promise.all([
          queryClient.invalidateQueries({ queryKey: standingsKey }),
          queryClient.invalidateQueries({
            queryKey: $api.queryOptions(
              'get',
              '/api/v1/orgs/{org}/contests/{contest}/tasks',
              { params: { path: { org, contest } } },
            ).queryKey,
          }),
        ]),
    },
  );

  const links = (list: string[]) =>
    list.map((name) => ({ name, to: taskPath(org, contest, name) }));

  const createTask = (
    <Create
      openLabel="New task"
      title="New task"
      second={{
        label: 'Title',
        description: 'Optional. The name is used when there is none.',
      }}
      submitLabel="Create task"
      pending={create.isPending}
      error={create.error}
      onSubmit={async (name, title) => {
        await create.mutateAsync({
          params: { path: { org, contest } },
          body: { name, title: title === '' ? null : title },
        });
      }}
    />
  );

  return (
    <div className={classes.page}>
      <PageTitle>{contest}</PageTitle>
      <div className={classes.actions}>
        <PageLink to={contestantsPath(org, contest)}>Contestants</PageLink>
        <PageLink to={teamsPath(org, contest)}>Teams</PageLink>
        <PageLink to={gradingsPath(org, contest)}>Gradings</PageLink>
        <PageLink to={boardsPath(org, contest)}>Boards</PageLink>
        <PageLink to={contestHomePath(org, contest)}>The page contestants see</PageLink>
      </div>
      <Card>
        <div className={classes.stack}>
          <SectionTitle>Tasks</SectionTitle>
          {view.state === 'loading' && <PageSkeleton rows={3} />}
          {view.state === 'error' && (
            <>
              {unreadable ? (
                <div className={classes.panel} role="alert">
                  <BodyText>The contest&apos;s settings do not read</BodyText>
                  <BodyText tone="secondary">
                    Where each task stands comes from contest.yaml, which does not pass
                    validation. Mend it under Settings or Files below.
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
                <ErrorBlock error={view.error} onRetry={view.retry} />
              )}
              {unreadable && names.state === 'ready' && (
                <>
                  <LinkList
                    label="Tasks by name"
                    links={links(names.data.map((task) => task.name))}
                  />
                  {createTask}
                </>
              )}
              {!unreadable && reached.length > 0 && (
                <>
                  <BodyText>Tasks of this contest you hold a role at:</BodyText>
                  <LinkList label="Your tasks" links={links(reached)} />
                </>
              )}
            </>
          )}
          {view.state === 'ready' && (
            <>
              {view.data.length === 0 ? (
                <BodyText>No tasks yet.</BodyText>
              ) : (
                <TaskStandings org={org} contest={contest} standings={view.data} />
              )}
              {createTask}
            </>
          )}
        </div>
      </Card>
      <Card>
        <AnnouncementsSection place={{ kind: 'contest', org, contest }} />
      </Card>
      <Card>
        <ContestClarifications org={org} contest={contest} />
      </Card>
      <Card>
        <ContestSettingsSection place={{ kind: 'contest', org, contest }} />
      </Card>
      <Card>
        <FileBrowser place={{ kind: 'contest', org, contest }} />
      </Card>
      <Card>
        <PeopleSection place={{ kind: 'contest', org, contest }} />
      </Card>
    </div>
  );
}
