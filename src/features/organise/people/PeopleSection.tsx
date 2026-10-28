import { useRef, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useChange } from '@/api/change';
import { $api, queryView } from '@/api/query';
import { isApiError } from '@/api/problem';
import type { Holder, RoleName, ScopeNames } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Modal } from '@/ui/Modal';
import { PageLink } from '@/ui/PageLink';
import { SectionTitle } from '@/ui/SectionTitle';
import { RadioGroup } from '@/ui/RadioGroup';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { Loaded } from '@/ui/feedback/Loaded';
import { useMe } from '@/session';
import {
  CONTEST_SECTIONS,
  ORG_SECTIONS,
  TASK_SECTIONS,
  contestSectionPath,
  orgSectionPath,
  sectionOf,
  taskSectionPath,
} from '@/lib/sections';
import {
  holdsAt,
  isPlace,
  offered,
  ROLE_LABEL,
  ROLE_AREAS,
  roleMeans,
  type RolePlace,
} from '../roles';
import { InvitesSection } from '../invites/InvitesSection';
import { holdersQuery, useHolders, useRoleChanges } from './holders';
import classes from './people.module.css';

/**
 * The roles the caller may give, as Invite offers them, each with what it
 * lets its holder do: only an admin gives the admin role.
 */
function roleOptions(administers: boolean, kind: RolePlace['kind']) {
  return offered(administers).map((role) => ({
    value: role,
    label: ROLE_LABEL[role],
    description: roleMeans(role, kind).join(' '),
  }));
}

/** The broader scope a role was given at, which reaches the place it is listed at. */
function givenAt(names: ScopeNames): string {
  if (names.contest === null) return 'The org';
  if (names.task === null) return 'The contest';
  return 'The task';
}

/** The organisers page of the scope a role was given at, where it is changed. */
function organisersOf(names: ScopeNames): string {
  if (names.contest === null) return orgSectionPath(names.org, 'organisers');
  if (names.task === null) {
    return contestSectionPath(names.org, names.contest, 'organisers');
  }
  return taskSectionPath(names.org, names.contest, names.task, 'organisers');
}

/**
 * A refusal in words. Two read better here than the general sentence: the
 * admin role asked for by someone who is not an admin here, and the last
 * admin of a scope, whose reason names the scope.
 */
function Refusal({ error, role }: { error: unknown; role?: RoleName }) {
  if (isApiError(error) && error.code === 'forbidden' && role === 'admin') {
    return (
      <div role="alert">
        <BodyText tone="secondary">Only an admin gives the admin role</BodyText>
        <BodyText tone="secondary">
          {error.detail ?? 'Ask an admin here to give it.'}
        </BodyText>
      </div>
    );
  }
  if (isApiError(error) && error.code === 'sole_admin') {
    return (
      <div role="alert">
        <BodyText tone="secondary">That would leave no admin</BodyText>
        <BodyText tone="secondary">
          {error.detail ?? 'Someone else has to be an admin here first.'}
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
  /** The role last sent, which a refusal is about, whatever is picked since. */
  const [tried, setTried] = useState<RoleName | null>(null);
  const row = useRef<HTMLTableRowElement>(null);
  const isMe = holder.user.id === me;
  const change = useChange({ reread: () => afterChange(isMe), focus: row });
  const { error } = change;
  const pending = change.pending !== null;
  const name = holder.user.username;
  const inherited = !isPlace(holder.at_names, place);
  const changeable = manages && !inherited && (holder.role !== 'admin' || administers);

  const show = (next: 'role' | 'remove' | null) => {
    change.dismiss();
    setRole(holder.role);
    setTried(null);
    setOpen(next);
  };

  const run = async (key: string, made: () => Promise<void>) => {
    if ((await change.run(key, made)).ok) setOpen(null);
  };

  const submitRole = (event: FormEvent) => {
    event.preventDefault();
    if (role === holder.role) {
      show(null);
      return;
    }
    setTried(role);
    void run('role', () => grant(holder.user.username, role));
  };

  return (
    <tr ref={row} tabIndex={-1}>
      <th scope="row">
        <div className={classes.person}>
          <span>
            {name}
            {isMe && ' (you)'}
          </span>
          {holder.user.name !== null && (
            <BodyText tone="secondary">{holder.user.name}</BodyText>
          )}
        </div>
      </th>
      <td>{ROLE_LABEL[holder.role]}</td>
      <td>
        {inherited ? (
          <div className={classes.person}>
            <span>{givenAt(holder.at_names)}</span>
            {manages && (
              <PageLink to={organisersOf(holder.at_names)}>Change it there</PageLink>
            )}
          </div>
        ) : (
          `This ${place.kind}`
        )}
      </td>
      {manages && (
        <td>
          {changeable && (
            <div className={classes.actions}>
              <Button
                size="xs"
                variant="secondary"
                label={`Change role of ${name}`}
                onClick={() => show('role')}
              >
                Change role
              </Button>
              <Button
                size="xs"
                variant="danger"
                label={`Remove ${name}`}
                onClick={() => show('remove')}
              >
                Remove
              </Button>
            </div>
          )}
          {open === 'role' && (
            <form
              className={classes.inline}
              onSubmit={submitRole}
              aria-label={`Change role of ${name}`}
            >
              <RadioGroup
                label="Role"
                value={role}
                options={roleOptions(administers, place.kind)}
                onChange={(value) => setRole(value as RoleName)}
              />
              <div className={classes.actions}>
                <Button size="xs" type="submit" loading={pending}>
                  Save
                </Button>
                <Button size="xs" variant="secondary" onClick={() => show(null)}>
                  Cancel
                </Button>
              </div>
            </form>
          )}
          {error !== null && open !== 'remove' && (
            <Refusal error={error} role={tried ?? undefined} />
          )}
          <Modal
            opened={open === 'remove'}
            onClose={() => show(null)}
            title={
              isMe
                ? `Give up your role at this ${place.kind}?`
                : `Remove ${name}’s role?`
            }
          >
            <div className={classes.inline}>
              <BodyText>
                {isMe ? 'You' : name} will no longer see or change {REACHES[place.kind]}
                , unless a role given elsewhere covers it.
              </BodyText>
              {error !== null && <Refusal error={error} />}
              <div className={classes.actions}>
                <Button
                  variant="danger"
                  loading={pending}
                  onClick={() => void run('remove', () => revoke(holder.user.id))}
                >
                  Remove
                </Button>
                <Button variant="secondary" onClick={() => show(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          </Modal>
        </td>
      )}
    </tr>
  );
}

/** What a role at each level reaches, as a removal says what is lost. */
const REACHES: Record<RolePlace['kind'], string> = {
  org: 'this org and its contests',
  contest: 'this contest and its tasks',
  task: 'this task',
};

/** Each level's own list of organisers, by the name its card and its page have. */
const ORGANISERS_OF: Record<RolePlace['kind'], string> = {
  org: sectionOf(ORG_SECTIONS, 'organisers').label,
  contest: sectionOf(CONTEST_SECTIONS, 'organisers').label,
  task: sectionOf(TASK_SECTIONS, 'organisers').label,
};

/**
 * Who organises an org, a contest or a task: each person once, with the
 * highest role they hold here and where it was given, here or at a broader
 * scope that reaches here. Someone becomes an organiser only by accepting an
 * invite, which a manager makes below by username or email address; a
 * manager also changes a role and removes one, and a role given at a broader
 * scope is changed on that scope's page. Only an admin may change or remove
 * an admin. The admin role is offered to a manager too, and the forge refuses
 * it from one, which the section says, as it says why the last admin of a
 * scope cannot be removed or demoted. The rules are the forge's, and each
 * refusal is shown where the change was tried. The forge leaves the orgs'
 * service accounts out of every list, so they are not shown here. Someone
 * who does not observe the place is told whose list it is.
 */
export function PeopleSection({ place }: { place: RolePlace }) {
  const me = useMe();
  const observes = holdsAt(me.roles, place, 'observer');
  const manages = holdsAt(me.roles, place, 'manager');
  const administers = holdsAt(me.roles, place, 'admin');
  const view = queryView(useHolders(place, { enabled: observes }));
  const title = ORGANISERS_OF[place.kind];

  if (!observes) {
    return (
      <Card>
        <BodyText>Only the {place.kind}&apos;s own organisers see this list.</BodyText>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <div className={classes.stack}>
          <SectionTitle>What each role can do</SectionTitle>
          <div style={{ overflowX: 'auto' }}>
            <table className={classes.table} aria-label="What each role can do">
              <thead>
                <tr>
                  <th scope="col">Role</th>
                  {ROLE_AREAS.map((area) => (
                    <th scope="col" key={area}>
                      {area}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(['admin', 'manager', 'observer'] as const).map((role) => (
                  <tr key={role}>
                    <th scope="row">{ROLE_LABEL[role]}</th>
                    {roleMeans(role, place.kind).map((line) => (
                      <td key={line}>{line}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Card>
      <Card>
        <Loaded view={view}>
          {(holders) => (
            <table className={classes.table} aria-label={title}>
              <thead>
                <tr>
                  <th scope="col">Person</th>
                  <th scope="col">Role</th>
                  <th scope="col">Given at</th>
                  {manages && <th scope="col">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {holders.map((holder) => (
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
        </Loaded>
      </Card>
      <Card>
        <div className={classes.stack}>
          <SectionTitle>Invites</SectionTitle>
          <BodyText tone="secondary">
            Someone becomes an organiser here by accepting an invite.
          </BodyText>
          <InvitesSection
            place={place}
            audience="organisers"
            manages={manages}
            administers={administers}
          />
        </div>
      </Card>
    </>
  );
}
