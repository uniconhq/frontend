import { useRef, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryView } from '@/api/query';
import { isApiError } from '@/api/problem';
import type { Grant, Invite } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Select } from '@/ui/Select';
import { TextInput } from '@/ui/TextInput';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { formatDateTime } from '@/lib/time';
import { offered, ROLE_LABEL, ROLE_MEANS, type RolePlace } from '../roles';
import { invitesQuery, useInviteChanges, useInvites, type Target } from './invites';
import classes from './invites.module.css';

/**
 * Whose invites a section is about: the organisers', with a role to choose,
 * on the people section, or the contestants', each a place in the contest,
 * on the contestants page. A contest's one list holds both.
 */
type Audience = 'organisers' | 'contestants';

const GRANT_LABEL: Record<Grant, string> = {
  ...ROLE_LABEL,
  contestant: 'A contestant’s place',
};

const MAIL: Record<Invite['mail_status'], string> = {
  waiting: 'Waiting to send',
  sent: 'Sent',
  failed: 'Failed to send',
  off: 'No mail server',
};

/** How long an invite stands, the backend's default, since the form sets none. */
const STANDS_DAYS = 14;

function shownTo(audience: Audience, invite: Invite): boolean {
  return (invite.grants === 'contestant') === (audience === 'contestants');
}

/** Where an invite stands, a lapsed one apart from one still open. */
function standing(invite: Invite): string {
  if (invite.status !== 'pending') {
    return { accepted: 'Accepted', declined: 'Declined', withdrawn: 'Withdrawn' }[
      invite.status
    ];
  }
  return invite.expired ? 'Lapsed' : 'Pending';
}

/** The date beside the standing: when it lapses or lapsed, or when it was decided. */
function standingDate(invite: Invite): string {
  if (invite.status === 'pending') {
    const at = formatDateTime(new Date(invite.expires_at));
    return invite.expired ? `Lapsed ${at}` : `Lapses ${at}`;
  }
  return invite.decided_at === null ? '' : formatDateTime(new Date(invite.decided_at));
}

function who(invite: Invite): string {
  return invite.username ?? invite.email ?? 'Nobody named';
}

/** A username, or an email address when what was typed has an `@`. */
function targetOf(typed: string): Target {
  return typed.includes('@') ? { email: typed } : { username: typed };
}

/**
 * A refusal in words. A username nobody has reads better here than the
 * general sentence, since an address is the way to invite them.
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
          Nobody has the username {typed}. Invite their email address instead, and they
          can make an account.
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

function InviteRow({
  place,
  invite,
  manages,
  administers,
  audience,
}: {
  place: RolePlace;
  invite: Invite;
  manages: boolean;
  administers: boolean;
  audience: Audience;
}) {
  const queryClient = useQueryClient();
  const { sendAgain, withdraw } = useInviteChanges(place);
  const [pending, setPending] = useState<'again' | 'withdraw' | null>(null);
  const [error, setError] = useState<unknown>(null);
  const row = useRef<HTMLTableRowElement>(null);
  const listKey = invitesQuery(place).queryKey;
  const name = who(invite);
  const open = invite.status === 'pending';
  const changeable = manages && open && (invite.grants !== 'admin' || administers);
  const mailable = !invite.expired && invite.mail_status !== 'off';

  const run = async (action: 'again' | 'withdraw', change: () => Promise<Invite>) => {
    setPending(action);
    setError(null);
    try {
      const updated = await change();
      queryClient.setQueryData<Invite[]>(listKey, (rows) =>
        rows?.map((found) => (found.id === updated.id ? updated : found)),
      );
      row.current?.focus();
    } catch (refused) {
      setError(refused);
      if (
        isApiError(refused) &&
        (refused.code === 'wrong_status' || refused.code === 'invite_expired')
      ) {
        await queryClient.invalidateQueries({ queryKey: listKey });
      }
    } finally {
      setPending(null);
    }
  };

  return (
    <tr ref={row} tabIndex={-1}>
      <th scope="row">
        <div className={classes.cell}>
          <span className={invite.username === null ? classes.mono : undefined}>
            {name}
          </span>
          <BodyText tone="secondary">
            {invite.invited_by === null
              ? formatDateTime(new Date(invite.created_at))
              : `By ${invite.invited_by.username}, ${formatDateTime(new Date(invite.created_at))}`}
          </BodyText>
        </div>
      </th>
      {audience === 'organisers' && <td>{GRANT_LABEL[invite.grants]}</td>}
      <td>
        <div className={classes.cell}>
          <span>{standing(invite)}</span>
          <BodyText tone="secondary">{standingDate(invite)}</BodyText>
        </div>
      </td>
      <td>
        <div className={classes.cell}>
          <span>{MAIL[invite.mail_status]}</span>
          {invite.mail_status === 'sent' && invite.mailed_at !== null && (
            <BodyText tone="secondary">
              {formatDateTime(new Date(invite.mailed_at))}
            </BodyText>
          )}
        </div>
      </td>
      {manages && (
        <td>
          {changeable && (
            <div className={classes.actions}>
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
            </div>
          )}
          {error !== null && <Refusal error={error} />}
        </td>
      )}
    </tr>
  );
}

/**
 * Someone invited by username or by email address, to a role here or to a
 * place in the contest. One field takes either: a Forgejo username has no
 * `@`, so what has one is an address.
 */
function InviteForm({ place, grants }: { place: RolePlace; grants: Grant[] }) {
  const queryClient = useQueryClient();
  const { create } = useInviteChanges(place);
  const [typed, setTyped] = useState('');
  const [grant, setGrant] = useState<Grant>(
    grants.includes('manager') ? 'manager' : (grants[0] ?? 'contestant'),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [tried, setTried] = useState('');
  const [made, setMade] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const target = typed.trim();
    if (target === '') return;
    setPending(true);
    setError(null);
    setMade(null);
    setTried(target);
    try {
      await create(grant, targetOf(target));
      setTyped('');
      setMade(target);
      await queryClient.invalidateQueries({ queryKey: invitesQuery(place).queryKey });
    } catch (refused) {
      setError(refused);
    } finally {
      setPending(false);
    }
  };

  const means =
    grant === 'contestant'
      ? 'They get a place in this contest and register from its page.'
      : ROLE_MEANS[grant];

  return (
    <form
      className={classes.form}
      onSubmit={(event) => void submit(event)}
      aria-label="Invite someone"
    >
      <div className={classes.fields}>
        <TextInput
          label="Username or email address"
          description="A username for someone with an account, an email address for anyone."
          value={typed}
          onChange={setTyped}
          required
        />
        {grants.length > 1 && (
          <Select
            label="Role"
            value={grant}
            options={grants.map((value) => ({
              value,
              label: GRANT_LABEL[value],
            }))}
            onChange={(value) => setGrant(value as Grant)}
          />
        )}
      </div>
      <BodyText tone="secondary">
        {means} The invite stands for {STANDS_DAYS} days.
      </BodyText>
      <div className={classes.actions}>
        <Button size="xs" type="submit" loading={pending}>
          Invite
        </Button>
      </div>
      {made !== null && (
        <div role="status">
          <BodyText tone="secondary">Invited {made}.</BodyText>
        </div>
      )}
      {error !== null && <Refusal error={error} typed={tried} />}
    </form>
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
  administers,
}: {
  place: RolePlace;
  audience: Audience;
  manages: boolean;
  administers: boolean;
}) {
  const view = queryView(useInvites(place));
  const grants: Grant[] =
    audience === 'contestants' ? ['contestant'] : offered(administers);

  return (
    <div className={classes.stack}>
      {manages && <InviteForm place={place} grants={grants} />}
      {view.state === 'loading' && <PageSkeleton rows={2} />}
      {view.state === 'error' && <ErrorBlock error={view.error} onRetry={view.retry} />}
      {view.state === 'ready' && (
        <InviteTable
          place={place}
          invites={view.data.filter((invite) => shownTo(audience, invite))}
          audience={audience}
          manages={manages}
          administers={administers}
        />
      )}
    </div>
  );
}

function InviteTable({
  place,
  invites,
  audience,
  manages,
  administers,
}: {
  place: RolePlace;
  invites: Invite[];
  audience: Audience;
  manages: boolean;
  administers: boolean;
}) {
  if (invites.length === 0) {
    return <BodyText tone="secondary">No invites yet.</BodyText>;
  }
  return (
    <table className={classes.table} aria-label="Invites">
      <thead>
        <tr>
          <th scope="col">Invited</th>
          {audience === 'organisers' && <th scope="col">Grants</th>}
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
            administers={administers}
            audience={audience}
          />
        ))}
      </tbody>
    </table>
  );
}
