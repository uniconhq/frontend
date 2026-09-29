import { useState } from 'react';
import { $api, queryView } from '@/api/query';
import { Card } from '@/ui/Card';
import { BodyText } from '@/ui/BodyText';
import { PageTitle } from '@/ui/PageTitle';
import { SectionTitle } from '@/ui/SectionTitle';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { useMe } from '@/session';
import { taskPath } from '@/lib/organiser-paths';
import { t } from '@/lib/t';
import { CreateForm } from '../CreateForm';
import { LinkList } from '../LinkList';
import { FileBrowser } from '../files/FileBrowser';
import { useContestParams } from '../params';
import { FollowProvisioning } from '../provisioning/FollowProvisioning';
import { pageOf, type Following } from '../provisioning/target';
import { tasksReached } from '../roles';
import classes from '../organise.module.css';

/**
 * A contest's tasks, the form for a new one, and the contest repo's files,
 * `contest.yaml` among them. Each part loads and fails on its own, so a
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
  const create = $api.useMutation(
    'post',
    '/api/v1/orgs/{org}/contests/{contest}/tasks',
  );
  const [following, setFollowing] = useState<Following | null>(null);

  const links = (names: string[]) =>
    names.map((name) => ({ name, to: taskPath(org, contest, name) }));

  return (
    <div className={classes.page}>
      <PageTitle>{contest}</PageTitle>
      <Card>
        <div className={classes.stack}>
          <SectionTitle>{t('Tasks')}</SectionTitle>
          {view.state === 'loading' && <PageSkeleton rows={3} />}
          {view.state === 'error' && (
            <>
              <ErrorBlock error={view.error} onRetry={view.retry} />
              {reached.length > 0 && (
                <>
                  <BodyText>{t('Tasks of this contest you hold a role at:')}</BodyText>
                  <LinkList label={t('Your tasks')} links={links(reached)} />
                </>
              )}
            </>
          )}
          {view.state === 'ready' && (
            <>
              {view.data.length === 0 ? (
                <BodyText>{t('No tasks yet.')}</BodyText>
              ) : (
                <LinkList
                  label={t('Tasks')}
                  links={links(view.data.map((task) => task.name))}
                />
              )}
              <CreateForm
                title={t('New task')}
                second={{
                  label: t('Title'),
                  description: t('Optional. The name is used when there is none.'),
                }}
                submitLabel={t('Create task')}
                pending={create.isPending}
                error={create.error}
                onSubmit={async (name, title) => {
                  const initial = await create.mutateAsync({
                    params: { path: { org, contest } },
                    body: { name, title: title === '' ? null : title },
                  });
                  setFollowing({
                    target: { kind: 'task', org, contest, task: name },
                    initial,
                  });
                }}
              />
            </>
          )}
        </div>
      </Card>
      {following !== null && (
        <FollowProvisioning key={pageOf(following.target)} {...following} />
      )}
      <Card>
        <FileBrowser place={{ kind: 'contest', org, contest }} />
      </Card>
    </div>
  );
}
