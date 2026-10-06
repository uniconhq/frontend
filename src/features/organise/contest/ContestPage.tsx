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
import { contestantsPath, taskPath, teamsPath } from '@/lib/organiser-paths';
import { PageLink } from '@/ui/PageLink';
import { Create } from '../Create';
import { AnnouncementsSection } from '../threads/AnnouncementsSection';
import { ContestClarifications } from '../threads/Clarifications';
import { PeopleSection } from '../people/PeopleSection';
import { LinkList } from '../LinkList';
import { FileBrowser } from '../files/FileBrowser';
import { useContestParams } from '@/lib/route-params';
import { tasksReached } from '../roles';
import classes from '../organise.module.css';

/**
 * A contest's tasks, the button that opens the form for a new one, which
 * also adds it to `contest.yaml`'s tasks, and the contest repo's files,
 * `contest.yaml` among them, with the way to its registrations, its teams
 * and the page its contestants see. Each part loads and fails on its own, so a
 * refused task list still leaves the files readable. Listing needs the
 * observer role at the contest; someone who holds a role only at one of its
 * tasks is refused the list, so the refusal comes with the tasks their own
 * roles reach.
 */
export function ContestPage() {
  const { org, contest } = useContestParams();
  const reached = tasksReached(useMe().roles, org, contest);
  const view = queryView(
    $api.useQuery('get', '/api/v1/orgs/{org}/contests/{contest}/tasks', {
      params: { path: { org, contest } },
    }),
  );
  const queryClient = useQueryClient();
  const create = $api.useMutation(
    'post',
    '/api/v1/orgs/{org}/contests/{contest}/tasks',
  );

  const links = (names: string[]) =>
    names.map((name) => ({ name, to: taskPath(org, contest, name) }));

  return (
    <div className={classes.page}>
      <PageTitle>{contest}</PageTitle>
      <div className={classes.actions}>
        <PageLink to={contestantsPath(org, contest)}>Contestants</PageLink>
        <PageLink to={teamsPath(org, contest)}>Teams</PageLink>
        <PageLink to={contestHomePath(org, contest)}>The page contestants see</PageLink>
      </div>
      <Card>
        <div className={classes.stack}>
          <SectionTitle>Tasks</SectionTitle>
          {view.state === 'loading' && <PageSkeleton rows={3} />}
          {view.state === 'error' && (
            <>
              <ErrorBlock error={view.error} onRetry={view.retry} />
              {reached.length > 0 && (
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
                <LinkList
                  label="Tasks"
                  links={links(view.data.map((task) => task.name))}
                />
              )}
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
                  await queryClient.invalidateQueries({
                    queryKey: $api.queryOptions(
                      'get',
                      '/api/v1/orgs/{org}/contests/{contest}/tasks',
                      { params: { path: { org, contest } } },
                    ).queryKey,
                  });
                }}
              />
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
        <FileBrowser place={{ kind: 'contest', org, contest }} />
      </Card>
      <Card>
        <PeopleSection place={{ kind: 'contest', org, contest }} />
      </Card>
    </div>
  );
}
