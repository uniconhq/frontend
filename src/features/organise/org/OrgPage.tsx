import { useQueryClient } from '@tanstack/react-query';
import { $api, queryView } from '@/api/query';
import { Card } from '@/ui/Card';
import { BodyText } from '@/ui/BodyText';
import { PageLink } from '@/ui/PageLink';
import { PageTitle } from '@/ui/PageTitle';
import { SectionTitle } from '@/ui/SectionTitle';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { useMe } from '@/session';
import { clarificationsPath, contestPath } from '@/lib/organiser-paths';
import { t } from '@/lib/t';
import { Create } from '../Create';
import { PeopleSection } from '../people/PeopleSection';
import { LinkList } from '../LinkList';
import { useOrgParam } from '@/lib/route-params';
import { contestsReached } from '../roles';
import classes from '../organise.module.css';

/**
 * An org's contests, each linking to its page, and the button that opens the
 * form for a new one.
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
  const queryClient = useQueryClient();

  const links = (names: string[]) =>
    names.map((name) => ({ name, to: contestPath(org, name) }));

  return (
    <div className={classes.page}>
      <PageTitle>{org}</PageTitle>
      <div className={classes.actions}>
        <PageLink to={clarificationsPath(org)}>{t('Open questions')}</PageLink>
      </div>
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
              <Create
                openLabel={t('New contest')}
                title={t('New contest')}
                second={{
                  label: t('Title'),
                  description: t('Optional. The name is used when there is none.'),
                }}
                submitLabel={t('Create contest')}
                pending={create.isPending}
                error={create.error}
                onSubmit={async (name, title) => {
                  await create.mutateAsync({
                    params: { path: { org } },
                    body: { name, title: title === '' ? null : title },
                  });
                  await queryClient.invalidateQueries({
                    queryKey: $api.queryOptions('get', '/api/v1/orgs/{org}/contests', {
                      params: { path: { org } },
                    }).queryKey,
                  });
                }}
              />
            </>
          )}
        </div>
      </Card>
      <Card>
        <PeopleSection place={{ kind: 'org', org }} />
      </Card>
    </div>
  );
}
