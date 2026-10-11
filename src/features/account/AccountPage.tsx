import { Card } from '@/ui/Card';
import { Avatar } from '@/ui/Avatar';
import { SectionTitle } from '@/ui/SectionTitle';
import { PageTitle } from '@/ui/PageTitle';
import { BodyText } from '@/ui/BodyText';
import { OutLink } from '@/ui/OutLink';
import { useForgeUrl, useMe } from '@/session';
import { SessionList } from './SessionList';
import { DangerZone } from './DangerZone';
import { scopeName } from '@/lib/scope-name';
import { contestPath, orgPath, taskPath } from '@/lib/organiser-paths';
import type { Me, ScopeNames } from '@/api/types';
import { PageLink } from '@/ui/PageLink';
import classes from './AccountPage.module.css';

/** Each role as a word, not as the name the backend sends. */
const ROLE_WORD: Record<Me['roles'][number]['role'], string> = {
  admin: 'Admin',
  manager: 'Manager',
  observer: 'Observer',
};

/** The organiser page of the place a role is held at. */
function placeOf(names: ScopeNames): string {
  if (names.contest === null) return orgPath(names.org);
  if (names.task === null) return contestPath(names.org, names.contest);
  return taskPath(names.org, names.contest, names.task);
}

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
      <PageTitle>Account</PageTitle>

      <Card>
        <div className={classes.profile}>
          <Avatar src={user.avatar_url} name={user.name ?? user.username} size={56} />
          <div className={classes.fields}>
            <SectionTitle>{user.name ?? user.username}</SectionTitle>
            <BodyText tone="secondary" mono>
              {user.username}
            </BodyText>
            <BodyText tone="secondary">{user.email ?? 'No email on record'}</BodyText>
          </div>
        </div>
        {me.degraded && (
          <BodyText tone="secondary">
            Forgejo is not answering, so your name, avatar and email may be missing.
          </BodyText>
        )}
        {forge !== null && (
          <div className={classes.change}>
            <OutLink href={`${forge}/user/settings`}>Change in Forgejo</OutLink>
          </div>
        )}
      </Card>

      {me.roles.length > 0 && (
        <Card>
          <div className={classes.stack}>
            <SectionTitle>Roles</SectionTitle>
            <ul className={classes.roles}>
              {me.roles.map(({ names, role }) => (
                <li key={`${scopeName(names)}:${role}`} className={classes.role}>
                  <PageLink to={placeOf(names)}>{scopeName(names)}</PageLink>
                  <span className={classes.roleName}>{ROLE_WORD[role]}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}

      <Card>
        <div className={classes.stack}>
          <SectionTitle>Security</SectionTitle>
          <BodyText size="md">
            Forgejo owns your account. Your password, email addresses, avatar, and
            two-factor settings all live there.
          </BodyText>
          {forge !== null && (
            <div className={classes.forgeLinks}>
              <OutLink href={`${forge}/user/settings/account`}>Password</OutLink>
              <OutLink href={`${forge}/user/settings/account`}>Email addresses</OutLink>
              <OutLink href={`${forge}/user/settings`}>Avatar</OutLink>
              <OutLink href={`${forge}/user/settings/security`}>Two-factor</OutLink>
            </div>
          )}
          <SessionList />
        </div>
      </Card>

      <Card>
        <DangerZone />
      </Card>
    </div>
  );
}
