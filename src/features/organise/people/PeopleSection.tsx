import { useRef, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { $api, queryView } from '@/api/query';
import { isApiError } from '@/api/problem';
import type { Holder, RoleName, ScopeNames } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Modal } from '@/ui/Modal';
import { PageLink } from '@/ui/PageLink';
import { SectionTitle } from '@/ui/SectionTitle';
import { Select } from '@/ui/Select';
import { TextInput } from '@/ui/TextInput';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { useMe } from '@/session';
import { contestPath, orgPath, taskPath } from '@/lib/organiser-paths';
import { scopeName } from '@/lib/scope-name';
import { t } from '@/lib/t';
import {
  holdsAt,
  isPlace,
  offered,
  ROLE_LABEL,
  ROLE_MEANS,
  type RolePlace,
} from '../roles';
import { InvitesSection } from '../invites/InvitesSection';
import { holdersQuery, useHolders, useRoleChanges } from './holders';
import classes from './people.module.css';

function roleOptions(administers: boolean) {
  return offered(administers).map((role) => ({
    value: role,
    label: t(ROLE_LABEL[role]),
  }));
}

function pagePath(names: ScopeNames): string {
  if (names.contest === null) return orgPath(names.org);
  if (names.task === null) return contestPath(names.org, names.contest);
  return taskPath(names.org, names.contest, names.task);
}

/**
 * A refusal in words. Two read better here than the general sentence: the
 * last admin of a scope, whose reason names the scope, and a username nobody
 * has.
 */
function Refusal({ error, username }: { error: unknown; username?: string }) {
  if (isApiError(error) && error.code === 'sole_admin') {
    return (
      <div role="alert">
        <BodyText tone="secondary">{t('That would leave no admin')}</BodyText>
        <BodyText tone="secondary">
          {error.detail ?? t('Someone else has to be an admin here first.')}
        </BodyText>
      </div>
    );
  }
  if (isApiError(error) && error.code === 'not_found' && username !== undefined) {
    return (
      <div role="alert">
        <BodyText tone="secondary">
          {t('Nobody has the username')} {username}.{' '}
          {t('They need an account first, and the name as they sign in with it.')}
        </BodyText>
      </div>
    );
  }
  return (
    <div role="alert">
      <ErrorBlock error={error} compact />
    </div>
  );
}

/**
 * What every change leaves stale: the list here, and the caller's own roles
 * when the change was to them, since those decide what every page offers.
 */
function useAfterChange(place: RolePlace) {
  const queryClient = useQueryClient();
  return async (touchedMe: boolean) => {
    await queryClient.invalidateQueries({ queryKey: holdersQuery(place).queryKey });
    if (touchedMe) {
      await queryClient.invalidateQueries({
        queryKey: $api.queryOptions('get', '/api/v1/me').queryKey,
      });
    }
  };
}

function HolderRow({
  place,
  holder,
  manages,
  administers,
  me,
}: {
  place: RolePlace;
  holder: Holder;
  manages: boolean;
  administers: boolean;
  me: number;
}) {
  const { grant, revoke } = useRoleChanges(place);
  const afterChange = useAfterChange(place);
  const [open, setOpen] = useState<'role' | 'remove' | null>(null);
  const [role, setRole] = useState<RoleName>(holder.role);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const row = useRef<HTMLTableRowElement>(null);
  const isMe = holder.user.id === me;
  const name = holder.user.username;
  const inherited = !isPlace(holder.at_names, place);
  const changeable = manages && !inherited && (holder.role !== 'admin' || administers);

  const show = (next: 'role' | 'remove' | null) => {
    setError(null);
    setRole(holder.role);
    setOpen(next);
  };

  const run = async (change: () => Promise<void>) => {
    setPending(true);
    setError(null);
    try {
      await change();
      setOpen(null);
      await afterChange(isMe);
      row.current?.focus();
    } catch (refused) {
      setError(refused);
    } finally {
      setPending(false);
    }
  };

  const submitRole = (event: FormEvent) => {
    event.preventDefault();
    if (role === holder.role) {
      show(null);
      return;
    }
    void run(() => grant(holder.user.username, role));
  };

  return (
    <tr ref={row} tabIndex={-1}>
      <th scope="row">
        <div className={classes.person}>
          <span>
            {name}
            {isMe && ` (${t('you')})`}
          </span>
          {holder.user.name !== null && (
            <BodyText tone="secondary">{holder.user.name}</BodyText>
          )}
        </div>
      </th>
      <td>{t(ROLE_LABEL[holder.role])}</td>
      <td>
        {inherited ? (
          <div className={classes.person}>
            <span className={classes.mono}>{scopeName(holder.at_names)}</span>
            {manages && (
              <PageLink to={pagePath(holder.at_names)}>{t('Change it there')}</PageLink>
            )}
          </div>
        ) : (
          t('Here')
        )}
      </td>
      {manages && (
        <td>
          {changeable && (
            <div className={classes.actions}>
              <Button
                size="xs"
                variant="secondary"
                label={`${t('Change role of')} ${name}`}
                onClick={() => show('role')}
              >
                {t('Change role')}
              </Button>
              <Button
                size="xs"
                variant="danger"
                label={`${t('Remove')} ${name}`}
                onClick={() => show('remove')}
              >
                {t('Remove')}
              </Button>
            </div>
          )}
          {open === 'role' && (
            <form
              className={classes.inline}
              onSubmit={submitRole}
              aria-label={`${t('Change role of')} ${name}`}
            >
              <Select
                label={t('Role')}
                value={role}
                options={roleOptions(administers)}
                onChange={(value) => setRole(value as RoleName)}
              />
              <BodyText tone="secondary">{t(ROLE_MEANS[role])}</BodyText>
              <div className={classes.actions}>
                <Button size="xs" type="submit" loading={pending}>
                  {t('Save')}
                </Button>
                <Button size="xs" variant="secondary" onClick={() => show(null)}>
                  {t('Cancel')}
                </Button>
              </div>
            </form>
          )}
          {error !== null && open !== 'remove' && <Refusal error={error} />}
          <Modal
            opened={open === 'remove'}
            onClose={() => show(null)}
            title={isMe ? t('Give up your role here?') : t('Remove this role?')}
          >
            <div className={classes.inline}>
              <BodyText>
                {isMe
                  ? t(
                      'You will no longer see or change this unless a role elsewhere covers it.',
                    )
                  : `${name} ${t('will no longer see or change this, unless a role elsewhere covers it.')}`}
              </BodyText>
              {error !== null && <Refusal error={error} />}
              <div className={classes.actions}>
                <Button
                  variant="danger"
                  loading={pending}
                  onClick={() => void run(() => revoke(holder.user.id))}
                >
                  {t('Remove')}
                </Button>
                <Button variant="secondary" onClick={() => show(null)}>
                  {t('Cancel')}
                </Button>
              </div>
            </div>
          </Modal>
        </td>
      )}
    </tr>
  );
}

/**
 * Someone new, or someone already here moved to another role: granting a
 * role to a person who holds one directly here replaces it.
 */
function AddPerson({ place, administers }: { place: RolePlace; administers: boolean }) {
  const { grant } = useRoleChanges(place);
  const afterChange = useAfterChange(place);
  const me = useMe();
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<RoleName>('manager');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [tried, setTried] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const name = username.trim();
    if (name === '') return;
    setPending(true);
    setError(null);
    setTried(name);
    try {
      await grant(name, role);
      setUsername('');
      await afterChange(name === me.user.username);
    } catch (refused) {
      setError(refused);
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      className={classes.add}
      onSubmit={(event) => void submit(event)}
      aria-label={t('Add someone')}
    >
      <div className={classes.addFields}>
        <TextInput
          label={t('Username')}
          description={t('Their username at Forgejo, as they sign in with it.')}
          value={username}
          onChange={setUsername}
          required
        />
        <Select
          label={t('Role')}
          value={role}
          options={roleOptions(administers)}
          onChange={(value) => setRole(value as RoleName)}
        />
      </div>
      <BodyText tone="secondary">{t(ROLE_MEANS[role])}</BodyText>
      <div className={classes.actions}>
        <Button size="xs" type="submit" loading={pending}>
          {t('Add')}
        </Button>
      </div>
      {error !== null && <Refusal error={error} username={tried} />}
    </form>
  );
}

/**
 * Who holds a role at an org, a contest or a task, for the people who
 * organise it: each person once, with the highest role they hold here and
 * where they hold it, here or at a broader scope that reaches here. A
 * manager also adds someone by username, changes a role and removes one; a
 * role held at a broader scope is changed on that scope's page. Only an
 * admin is offered the admin role, or may change or remove an admin. The
 * rules are the forge's, and each refusal is shown where the change was
 * tried. Below them are the invites to a role here, which a manager makes by
 * username or email address. Someone who does not observe the place is not
 * shown the section.
 */
export function PeopleSection({ place }: { place: RolePlace }) {
  const me = useMe();
  const observes = holdsAt(me.roles, place, 'observer');
  const manages = holdsAt(me.roles, place, 'manager');
  const administers = holdsAt(me.roles, place, 'admin');
  const view = queryView(useHolders(place, { enabled: observes }));

  if (!observes) return null;

  return (
    <div className={classes.stack}>
      <SectionTitle>{t('Organisers')}</SectionTitle>
      {view.state === 'loading' && <PageSkeleton rows={3} />}
      {view.state === 'error' && <ErrorBlock error={view.error} onRetry={view.retry} />}
      {view.state === 'ready' && (
        <table className={classes.table} aria-label={t('Organisers')}>
          <thead>
            <tr>
              <th scope="col">{t('Person')}</th>
              <th scope="col">{t('Role')}</th>
              <th scope="col">{t('Held at')}</th>
              {manages && <th scope="col">{t('Actions')}</th>}
            </tr>
          </thead>
          <tbody>
            {view.data.map((holder) => (
              <HolderRow
                key={holder.user.id}
                place={place}
                holder={holder}
                manages={manages}
                administers={administers}
                me={me.user.id}
              />
            ))}
          </tbody>
        </table>
      )}
      {manages && <AddPerson place={place} administers={administers} />}
      <SectionTitle order={3}>{t('Invites')}</SectionTitle>
      <InvitesSection
        place={place}
        audience="organisers"
        manages={manages}
        administers={administers}
      />
    </div>
  );
}
