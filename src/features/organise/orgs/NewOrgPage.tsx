import { useState } from 'react';
import { $api } from '@/api/query';
import { Card } from '@/ui/Card';
import { BodyText } from '@/ui/BodyText';
import { PageTitle } from '@/ui/PageTitle';
import { t } from '@/lib/t';
import { CreateForm } from '../CreateForm';
import { FollowProvisioning } from '../provisioning/FollowProvisioning';
import { pageOf, type Following } from '../provisioning/target';
import classes from '../organise.module.css';

/** The most an org's description holds: the forge takes no more. */
const DESCRIPTION_MAX = 255;

/**
 * Asks for an org and follows it until it is made. The create answers at
 * once with a pending record; the org, its teams, its event push and its
 * service account are made in the background, and the progress below shows
 * each step as it completes. The person who asked becomes its first admin.
 */
export function NewOrgPage() {
  const create = $api.useMutation('post', '/api/v1/orgs');
  const [following, setFollowing] = useState<Following | null>(null);

  return (
    <div className={classes.page}>
      <PageTitle>{t('New org')}</PageTitle>
      <Card>
        <div className={classes.stack}>
          <BodyText size="md">
            {t(
              'An org holds contests and the people who run them. You become its first admin.',
            )}
          </BodyText>
          <CreateForm
            title={t('The org')}
            second={{
              label: t('Description'),
              description: `${t('Optional, at most')} ${String(DESCRIPTION_MAX)} ${t('characters.')}`,
              maxLength: DESCRIPTION_MAX,
            }}
            submitLabel={t('Create org')}
            pending={create.isPending}
            error={create.error}
            onSubmit={async (name, description) => {
              const initial = await create.mutateAsync({ body: { name, description } });
              setFollowing({ target: { kind: 'org', org: name }, initial });
            }}
          />
        </div>
      </Card>
      {following !== null && (
        <FollowProvisioning key={pageOf(following.target)} {...following} />
      )}
    </div>
  );
}
