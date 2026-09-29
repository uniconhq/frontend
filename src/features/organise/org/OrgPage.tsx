import { useState } from 'react';
import { $api, queryView } from '@/api/query';
import { Card } from '@/ui/Card';
import { BodyText } from '@/ui/BodyText';
import { PageTitle } from '@/ui/PageTitle';
import { SectionTitle } from '@/ui/SectionTitle';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { useMe } from '@/session';
import { contestPath } from '@/lib/organiser-paths';
import { t } from '@/lib/t';
import { CreateForm } from '../CreateForm';
import { LinkList } from '../LinkList';
import { useOrgParam } from '../params';
import { FollowProvisioning } from '../provisioning/FollowProvisioning';
import { pageOf, type Following } from '../provisioning/target';
import { contestsReached } from '../roles';
import classes from '../organise.module.css';

/**
 * An org's contests, each linking to its page, and the form for a new one.
 * Listing needs the observer role at the org. Someone who holds a role only
 * at one of its contests or tasks is refused the list, so the refusal comes
 * with the contests their own roles reach, and the path through the org still
 * works.
 */
export function OrgPage() {
  const org = useOrgParam();
  const reached = contestsReached(useMe().roles, org);
  const view = queryView(
    $api.useQuery('get', '/api/v1/orgs/{org}/contests', { params: { path: { org } } }),
  );
  const create = $api.useMutation('post', '/api/v1/orgs/{org}/contests');
  const [following, setFollowing] = useState<Following | null>(null);

  const links = (names: string[]) =>
    names.map((name) => ({ name, to: contestPath(org, name) }));

  return (
    <div className={classes.page}>
      <PageTitle>{org}</PageTitle>
      <Card>
        <div className={classes.stack}>
          <SectionTitle>{t('Contests')}</SectionTitle>
          {view.state === 'loading' && <PageSkeleton rows={3} />}
          {view.state === 'error' && (
            <>
              <ErrorBlock error={view.error} onRetry={view.retry} />
              {reached.length > 0 && (
                <>
                  <BodyText>{t('Contests of this org you hold a role at:')}</BodyText>
                  <LinkList label={t('Your contests')} links={links(reached)} />
                </>
              )}
            </>
          )}
          {view.state === 'ready' && (
            <>
              {view.data.length === 0 ? (
                <BodyText>{t('No contests yet.')}</BodyText>
              ) : (
                <LinkList
                  label={t('Contests')}
                  links={links(view.data.map((contest) => contest.name))}
                />
              )}
              <CreateForm
                title={t('New contest')}
                second={{
                  label: t('Title'),
                  description: t('Optional. The name is used when there is none.'),
                }}
                submitLabel={t('Create contest')}
                pending={create.isPending}
                error={create.error}
                onSubmit={async (name, title) => {
                  const initial = await create.mutateAsync({
                    params: { path: { org } },
                    body: { name, title: title === '' ? null : title },
                  });
                  setFollowing({
                    target: { kind: 'contest', org, contest: name },
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
    </div>
  );
}
