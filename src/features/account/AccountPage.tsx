import { Card } from '@/ui/Card';
import { Avatar } from '@/ui/Avatar';
import { SectionTitle } from '@/ui/SectionTitle';
import { PageTitle } from '@/ui/PageTitle';
import { BodyText } from '@/ui/BodyText';
import { TextLink } from '@/ui/TextLink';
import { useMe } from '@/session';
import { forgeUrl } from '@/lib/config';
import { t } from '@/lib/t';
import { SessionList } from './SessionList';
import { DangerZone } from './DangerZone';
import { scopeName } from './scope-name';
import classes from './AccountPage.module.css';

/**
 * Forgejo owns the account; Unicon owns the sessions and the roles. Everything
 * here is either read-only with a link into Forgejo, a role Unicon granted, or
 * a session this app issued.
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
          <TextLink href={forgeUrl('/user/settings')}>
            {t('Change in Forgejo')}
          </TextLink>
        </div>
      </Card>

      {me.roles.length > 0 && (
        <Card>
          <div className={classes.stack}>
            <SectionTitle>{t('Roles')}</SectionTitle>
            <ul className={classes.roles}>
              {me.roles.map(({ scope, role }) => (
                <li key={`${scope.kind}:${scopeName(scope)}`} className={classes.role}>
                  <span className={classes.scope}>{scopeName(scope)}</span>
                  <span className={classes.roleName}>{role}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}

      <Card>
        <div className={classes.stack}>
          <SectionTitle>{t('Security')}</SectionTitle>
          <BodyText size="md">
            {t(
              'Forgejo owns your account. Your password, email addresses, avatar, two-factor settings and SSH keys all live there.',
            )}
          </BodyText>
          <div className={classes.forgeLinks}>
            <a href={forgeUrl('/user/settings/account')}>{t('Password')}</a>
            <a href={forgeUrl('/user/settings/account')}>{t('Email addresses')}</a>
            <a href={forgeUrl('/user/settings')}>{t('Avatar')}</a>
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
