import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useChange } from '@/api/change';
import { queryView } from '@/api/query';
import { isApiError } from '@/api/problem';
import type { Grant, Invite, OfferedGrant } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { RadioGroup } from '@/ui/RadioGroup';
import { InviteForm, type Target } from '@/ui/InviteForm';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { Loaded } from '@/ui/feedback/Loaded';
import { Group, Stack } from '@/ui/layout';
import { formatDateTime } from '@/lib/time';
import { ROLE_LABEL, type RolePlace } from '../roles';
import { invitesQuery, useInviteChanges, useInvites } from './invites';
import tableClasses from '@/ui/table.module.css';
import classes from './invites.module.css';

/**
 * Whose invites a section is about: the organisers', with a role to choose,
 * on the people section, or the entrants', each a place in the contest, on
 * the contest's How people enter. A contest's one list holds both. The
 * entrants' list also holds the invites members of a team made into it,
 * which organisers see, send again and withdraw.
 */
type Audience = 'organisers' | 'contestants';

const GRANT_LABEL: Record<Grant, string> = {
  ...ROLE_LABEL,
  contestant: 'A place in the contest',
  member: 'A place in a team',
};

const MAIL: Record<Invite['mail_status'], string> = {
  waiting: 'Waiting to send',
  sent: 'Sent',
  failed: 'Failed to send',
  off: 'Not sent: no mail server',
};

/** Refusals that mean the list is behind: the invite was decided or lapsed. */
const BEHIND = new Set(['wrong_status', 'invite_expired']);

/** How long an invite stands, the backend's default, since the form sets none. */
const STANDS_DAYS = 14;

function shownTo(audience: Audience, invite: Invite): boolean {
  const place = invite.grants === 'contestant' || invite.grants === 'member';
  return place === (audience === 'contestants');
}

/** Where a place leads: into a team by name, or a place of their own. */
function intoText(invite: Invite): string {
  if (invite.entrant !== null) {
    return invite.grants === 'member'
      ? `${invite.entrant.name}, from a member`
      : invite.entrant.name;
  }
  return 'An entry of their own';
}

/** Where an invite stands, a lapsed one apart from one still open. */
function standing(invite: Invite): string {
  if (invite.status !== 'pending') {
    return { accepted: 'Accepted', declined: 'Declined', withdrawn: 'Withdrawn' }[
      invite.status
    ];
  }
  return invite.expired ? 'Expired' : 'Pending';
}

/** The date beside the standing: when it lapses or lapsed, or when it was decided. */
function standingDate(invite: Invite): string {
  if (invite.status === 'pending') {
    const at = formatDateTime(new Date(invite.expires_at));
    return invite.expired ? `Expired ${at}` : `Expires ${at}`;
  }
  return invite.decided_at === null ? '' : formatDateTime(new Date(invite.decided_at));
}

function who(invite: Invite): string {
  return invite.username ?? invite.email ?? 'Unknown';
}

/**
 * A refusal in the server's words. A username nobody has adds that an
 * address is the way to invite them.
 */
function Refusal({ error, typed }: { error: unknown; typed?: string }) {
  if (
    isApiError(error) &&
    error.code === 'not_found' &&
    typed !== undefined &&
    !typed.includes('@')
  ) {
    return (
      <div role="alert">
        <BodyText tone="secondary">
          {error.detail} Invite their email address instead, and they can make an
          account.
        </BodyText>
      </div>
    );
  }
  return <ErrorBlock error={error} compact alert heading="Couldn’t invite" />;
}

function InviteRow({
  place,
  invite,
  manages,
  audience,
}: {
  place: RolePlace;
  invite: Invite;
  manages: boolean;
  audience: Audience;
}) {
  const queryClient = useQueryClient();
  const { sendAgain, withdraw } = useInviteChanges(place);
  const row = useRef<HTMLTableRowElement>(null);
  const listKey = invitesQuery(place).queryKey;
  const change = useChange({
    reread: () => queryClient.invalidateQueries({ queryKey: listKey }),
    rereadDone: false,
    behind: BEHIND,
    focus: row,
  });
  const { pending, error } = change;
  const name = who(invite);
  const open = invite.status === 'pending';
  const changeable = invite.may_change && open;
  const mailable = !invite.expired && invite.mail_status !== 'off';

  /** Each change answers with the invite as it now stands, which replaces its row. */
  const run = (key: 'again' | 'withdraw', made: () => Promise<Invite>) =>
    change.run(key, async () => {
      const updated = await made();
      queryClient.setQueryData<Invite[]>(listKey, (rows) =>
        rows?.map((found) => (found.id === updated.id ? updated : found)),
      );
    });

  return (
    <tr ref={row} tabIndex={-1}>
      <th scope="row">
        <Stack gap={2}>
          <span className={invite.username === null ? classes.mono : undefined}>
            {name}
          </span>
          <BodyText tone="secondary">
            {invite.invited_by === null
              ? formatDateTime(new Date(invite.created_at))
              : `By ${invite.invited_by.username}, ${formatDateTime(new Date(invite.created_at))}`}
          </BodyText>
        </Stack>
      </th>
      {audience === 'organisers' ? (
        <td>{GRANT_LABEL[invite.grants]}</td>
      ) : (
        <td>{intoText(invite)}</td>
      )}
      <td>
        <Stack gap={2}>
          <span>{standing(invite)}</span>
          <BodyText tone="secondary">{standingDate(invite)}</BodyText>
        </Stack>
      </td>
      <td>
        <Stack gap={2}>
          <span>{MAIL[invite.mail_status]}</span>
          {invite.mail_status === 'sent' && invite.mailed_at !== null && (
            <BodyText tone="secondary">
              {formatDateTime(new Date(invite.mailed_at))}
            </BodyText>
          )}
        </Stack>
      </td>
      {manages && (
        <td>
          {changeable && (
            <Group gap={6} align="stretch">
              {mailable && (
                <Button
                  size="xs"
                  variant="secondary"
                  label={`Send again to ${name}`}
                  loading={pending === 'again'}
                  onClick={() => void run('again', () => sendAgain(invite.id))}
                >
                  Send again
                </Button>
              )}
              <Button
                size="xs"
                variant="danger"
                label={`Withdraw the invite for ${name}`}
                loading={pending === 'withdraw'}
                onClick={() => void run('withdraw', () => withdraw(invite.id))}
              >
                Withdraw
              </Button>
            </Group>
          )}
          {error !== null && <Refusal error={error} />}
        </td>
      )}
    </tr>
  );
}

/** Someone invited to a role here or to a place in the contest. */
function InviteSomeone({
  place,
  grants,
}: {
  place: RolePlace;
  grants: OfferedGrant[];
}) {
  const queryClient = useQueryClient();
  const { create } = useInviteChanges(place);
  const [grant, setGrant] = useState<OfferedGrant>(
    grants.includes('manager') ? 'manager' : (grants[0] ?? 'contestant'),
  );
  const [tried, setTried] = useState('');
  const [made, setMade] = useState<string | null>(null);
  const change = useChange({
    reread: () =>
      queryClient.invalidateQueries({ queryKey: invitesQuery(place).queryKey }),
  });

  const invite = async (target: Target, typed: string) => {
    setMade(null);
    setTried(typed);
    const { ok } = await change.run('invite', () => create(grant, target));
    if (ok) setMade(typed);
    return ok;
  };

  const meansOf = (offer: OfferedGrant) =>
    offer === 'contestant' ? 'Accepting registers them for this contest. ' : '';

  return (
    <InviteForm
      name="Invite someone"
      className={classes.form}
      required
      loading={change.pending !== null}
      onInvite={invite}
      outcome={
        <>
          {made !== null && (
            <div role="status">
              <BodyText tone="secondary">Invited {made}.</BodyText>
            </div>
          )}
          {change.error !== null && <Refusal error={change.error} typed={tried} />}
        </>
      }
    >
      {grants.length > 1 && (
        <RadioGroup
          label="Role"
          value={grant}
          options={grants.map((value) => ({
            value,
            label: GRANT_LABEL[value],
          }))}
          onChange={(value) => setGrant(value as OfferedGrant)}
        />
      )}
      <BodyText tone="secondary">
        {grants.length > 1 ? '' : meansOf(grant)}The invite expires after {STANDS_DAYS}{' '}
        days.
      </BodyText>
    </InviteForm>
  );
}

/**
 * The invites made here and, for a manager, the form that makes one: who
 * each is for, what it grants, where it stands, lapsed apart from pending,
 * and what became of its mail. A manager sends a pending one again, which
 * mails a new link, and withdraws one; an invite to the admin role only by
 * an admin, as the forge has it. An observer reads the list alone. While a
 * mail is still waiting to go out, the list is read again every few seconds.
 */
export function InvitesSection({
  place,
  audience,
  manages,
  giveAdmin,
}: {
  place: RolePlace;
  audience: Audience;
  manages: boolean;
  /** Whether the server says the caller may give the admin role here. */
  giveAdmin: boolean;
}) {
  const view = queryView(useInvites(place));
  const grants: OfferedGrant[] =
    audience === 'contestants'
      ? ['contestant']
      : giveAdmin
        ? ['admin', 'manager', 'observer']
        : ['manager', 'observer'];

  return (
    <Stack gap="sm">
      {manages && <InviteSomeone place={place} grants={grants} />}
      <Loaded view={view} rows={2}>
        {(invites) => (
          <InviteTable
            place={place}
            invites={invites.filter((invite) => shownTo(audience, invite))}
            audience={audience}
            manages={manages}
          />
        )}
      </Loaded>
    </Stack>
  );
}

function InviteTable({
  place,
  invites,
  audience,
  manages,
}: {
  place: RolePlace;
  invites: Invite[];
  audience: Audience;
  manages: boolean;
}) {
  if (invites.length === 0) {
    return <BodyText tone="secondary">No invites yet.</BodyText>;
  }
  return (
    <table className={tableClasses.table} aria-label="Invites">
      <thead>
        <tr>
          <th scope="col">Invited</th>
          {audience === 'organisers' ? (
            <th scope="col">Role</th>
          ) : (
            <th scope="col">Place</th>
          )}
          <th scope="col">Status</th>
          <th scope="col">Mail</th>
          {manages && <th scope="col">Actions</th>}
        </tr>
      </thead>
      <tbody>
        {invites.map((invite) => (
          <InviteRow
            key={invite.id}
            place={place}
            invite={invite}
            manages={manages}
            audience={audience}
          />
        ))}
      </tbody>
    </table>
  );
}
