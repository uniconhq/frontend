import { Card } from '@/ui/Card';
import { BodyText } from '@/ui/BodyText';
import { PageLink } from '@/ui/PageLink';
import { PageTitle } from '@/ui/PageTitle';
import { useMe } from '@/session';
import { NEW_ORG_PATH, orgPath } from '@/lib/organiser-paths';
import { t } from '@/lib/t';
import { LinkList } from '../LinkList';
import { orgsReached } from '../roles';
import classes from '../organise.module.css';

/**
 * The orgs this person holds a role at, read from the roles the session
 * already has. A role at one contest or task counts, since that is reached
 * through its org. The session is loaded, or failed, before this page
 * renders, so the guard above it owns those two states.
 */
export function OrgsPage() {
  const orgs = orgsReached(useMe().roles);

  return (
    <div className={classes.page}>
      <PageTitle>{t('Orgs')}</PageTitle>
      <Card>
        <div className={classes.stack}>
          {orgs.length === 0 ? (
            <BodyText>{t('You do not hold a role at any org yet.')}</BodyText>
          ) : (
            <LinkList
              label={t('Your orgs')}
              links={orgs.map((org) => ({ name: org, to: orgPath(org) }))}
            />
          )}
          <div>
            <PageLink to={NEW_ORG_PATH}>{t('New org')}</PageLink>
          </div>
        </div>
      </Card>
    </div>
  );
}
