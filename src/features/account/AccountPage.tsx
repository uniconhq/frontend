import { Card } from '@/ui/Card';
import { Avatar } from '@/ui/Avatar';
import { SectionTitle } from '@/ui/SectionTitle';
import { PageTitle } from '@/ui/PageTitle';
import { BodyText } from '@/ui/BodyText';
import { TextLink } from '@/ui/TextLink';
import { forgePage, useForgeUrl, useMe } from '@/session';
import { t } from '@/lib/t';
import { SessionList } from './SessionList';
import { DangerZone } from './DangerZone';
import { scopeName } from '@/lib/scope-name';
import classes from './AccountPage.module.css';

/**
 * Forgejo owns the account; Unicon owns the sessions and the roles. Everything
 * here is either read-only with a link into Forgejo, a role Unicon granted, or
 * a session this app issued.
 */
export function AccountPage() {
  const me = useMe();
  const { user } = me;
  const forge = useForgeUrl();

  return (
    <div className={classes.page}>
      <PageTitle>{t('Account')}</PageTitle>

      <Card>
        <div className={classes.profile}>
          <Avatar src={user.avatar_url} name={user.name ?? user.username} size={56} />
          <div className={classes.fields}>
            <SectionTitle>{user.name ?? user.username}</SectionTitle>
            <BodyText tone="secondary" mono>
              {user.username}
            </BodyText>
            <BodyText tone="secondary">
              {user.email ?? t('No email on record')}
            </BodyText>
          </div>
        </div>
        {me.degraded && (
          <BodyText tone="secondary">
            {t(
              'Forgejo is not answering, so your name, avatar and email may be missing.',
            )}
          </BodyText>
        )}
        {forge !== null && (
          <div className={classes.change}>
            <TextLink href={`${forge}/user/settings`}>
              {t('Change in Forgejo')}
            </TextLink>
          </div>
        )}
      </Card>

      {me.roles.length > 0 && (
        <Card>
          <div className={classes.stack}>
            <SectionTitle>{t('Roles')}</SectionTitle>
            <ul className={classes.roles}>
              {me.roles.map(({ names, role }) => (
                <li key={`${scopeName(names)}:${role}`} className={classes.role}>
                  <span className={classes.scope}>{scopeName(names)}</span>
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
              'Forgejo owns your account. Your password, email addresses, avatar, and two-factor settings all live there.',
            )}
          </BodyText>
          <div className={classes.forgeLinks}>
            <a href={forgePage(forge, '/user/settings/account')}>{t('Password')}</a>
            <a href={forgePage(forge, '/user/settings/account')}>
              {t('Email addresses')}
            </a>
            <a href={forgePage(forge, '/user/settings')}>{t('Avatar')}</a>
            <a href={forgePage(forge, '/user/settings/security')}>{t('Two-factor')}</a>
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
