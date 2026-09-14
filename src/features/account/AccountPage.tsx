import { Card } from '@/ui/Card';
import { Avatar } from '@/ui/Avatar';
import { SectionTitle } from '@/ui/SectionTitle';
import { PageTitle } from '@/ui/PageTitle';
import { BodyText } from '@/ui/BodyText';
import { useMe } from '@/session';
import { forgeUrl } from '@/lib/config';
import { t } from '@/lib/t';
import { SessionList } from './SessionList';
import { DangerZone } from './DangerZone';
import classes from './AccountPage.module.css';

/**
 * Forgejo owns the account; Unicon owns the sessions. Everything here is either
 * read-only with a link into Forgejo, or a session this app issued.
 */
export function AccountPage() {
  const me = useMe();

  return (
    <div className={classes.page}>
      <PageTitle>{t('Account')}</PageTitle>

      <Card>
        <div className={classes.profile}>
          <Avatar src={me.avatar_url} name={me.name ?? me.username} size={56} />
          <div className={classes.fields}>
            <SectionTitle>{me.name ?? me.username}</SectionTitle>
            <BodyText tone="secondary" mono>
              {me.username}
            </BodyText>
            <BodyText tone="secondary">{me.email ?? t('No email on record')}</BodyText>
          </div>
        </div>
        {me.degraded && (
          <BodyText tone="secondary">
            {t(
              'Forgejo is not answering, so your name, avatar and email may be missing.',
            )}
          </BodyText>
        )}
        <div style={{ marginTop: 12 }}>
          <a href={forgeUrl('/user/settings')}>
            <BodyText tone="secondary">{t('Change in Forgejo')}</BodyText>
          </a>
        </div>
      </Card>

      <Card>
        <div className={classes.stack}>
          <SectionTitle>{t('Security')}</SectionTitle>
          <BodyText size="md">
            {t(
              'Forgejo owns your account. Your password, two-factor settings, email addresses and SSH keys all live there.',
            )}
          </BodyText>
          <div className={classes.forgeLinks}>
            <a href={forgeUrl('/user/settings/account')}>{t('Password')}</a>
            <a href={forgeUrl('/user/settings/account')}>{t('Email addresses')}</a>
            <a href={forgeUrl('/user/settings/security')}>{t('Two-factor')}</a>
            <a href={forgeUrl('/user/settings/keys')}>{t('SSH keys')}</a>
          </div>
          <SessionList />
        </div>
      </Card>

      <Card>
        <DangerZone />
      </Card>
    </div>
  );
}
