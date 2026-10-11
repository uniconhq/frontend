import { useRef, useState } from 'react';
import { isApiError } from '@/api/problem';
import { queryView } from '@/api/query';
import type { Entered, Invite } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { PageLink } from '@/ui/PageLink';
import { SectionTitle } from '@/ui/SectionTitle';
import { TextInput } from '@/ui/TextInput';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { contestHomePath } from '@/lib/contest-paths';
import { contestPath, orgPath, taskPath } from '@/lib/organiser-paths';
import { scopeName } from '@/lib/scope-name';
import { formatDateTime } from '@/lib/time';
import { useDecide, useMyInvites } from './my-invites';
import classes from './invites.module.css';

type Role = Exclude<Invite['grants'], 'contestant' | 'member'>;

const ROLE: Record<Role, string> = {
  admin: 'The admin role',
  manager: 'The manager role',
  observer: 'The observer role',
};

const NOW_HOLDS: Record<Role, string> = {
  admin: 'You are now an admin at',
  manager: 'You are now a manager at',
  observer: 'You are now an observer at',
};

/** Whether an invite is to a place in a contest, alone or in a team, rather than a role. */
function isPlace(grants: Invite['grants']): grants is 'contestant' | 'member' {
  return grants === 'contestant' || grants === 'member';
}

/** What an invite offers and where, in a few words. */
function offer(invite: Invite): string {
  const where = scopeName(invite.where);
  if (!isPlace(invite.grants)) return `${ROLE[invite.grants]} at ${where}`;
  return invite.entrant === null
    ? `A place in the contest ${where}`
    : `A place in the team ${invite.entrant.name}, in the contest ${where}`;
}

/** What accepting a place did, in a sentence, with where the registration stands. */
function enteredSentence(entered: Entered, where: string): string {
  const { name } = entered.entrant;
  const then =
    entered.status === 'approved'
      ? ' You are in.'
      : entered.status === 'pending'
        ? ' An organiser approves each registration; the contest’s page says when.'
        : '';
  switch (entered.how) {
    case 'joined':
      return `You joined ${name} in ${where}.${then}`;
    case 'already':
      return `You were in ${name} in ${where} already.`;
    default:
      return `You are registered for ${where} as ${name}.${then}`;
  }
}

/** The organiser's page of the place a role was accepted at. */
function placePath({ where }: Invite): string {
  if (where.contest === null) return orgPath(where.org);
  if (where.task === null) return contestPath(where.org, where.contest);
  return taskPath(where.org, where.contest, where.task);
}

/**
 * What became of an invite that is no longer waiting, with where to go next.
 * An accepted place says what accepting did, from `entered` when this page
 * accepted it, and leads to the contest.
 */
function Outcome({ invite, entered }: { invite: Invite; entered: Entered | null }) {
  const where = scopeName(invite.where);
  const { grants } = invite;
  if (invite.status === 'accepted' && isPlace(grants)) {
    return (
      <>
        <BodyText>
          {entered === null
            ? `You accepted your place in ${where}.`
            : enteredSentence(entered, where)}
        </BodyText>
        {invite.where.contest !== null && (
          <PageLink to={contestHomePath(invite.where.org, invite.where.contest)}>
            Go to the contest
          </PageLink>
        )}
      </>
    );
  }
  if (invite.status === 'accepted' && !isPlace(grants)) {
    return (
      <>
        <BodyText>
          {NOW_HOLDS[grants]} {where}.
        </BodyText>
        <PageLink to={placePath(invite)}>Open {where}</PageLink>
      </>
    );
  }
  if (invite.status === 'declined') {
    return <BodyText>You declined this invite.</BodyText>;
  }
  return <BodyText>The organisers withdrew this invite.</BodyText>;
}

/**
 * One invite for the signed-in person: what it offers and where, who sent it
 * and when it lapses, with Accept and Decline while it is open. Accepting a
 * place registers them, or puts them in the team that invited them; a
 * contest that asks for its code, for which accepting is refused, asks for
 * it here and accepts again with it. A lapsed one says to ask for a new
 * one, and one decided here says what came of it. The focus moves to the
 * card once a choice is answered.
 */
export function InviteCard({
  invite,
  highlighted = false,
}: {
  invite: Invite;
  highlighted?: boolean;
}) {
  const card = useRef<HTMLLIElement>(null);
  const [entered, setEntered] = useState<Entered | null>(null);
  const { pending, error, decide } = useDecide(card, setEntered);
  const [code, setCode] = useState('');
  const name = offer(invite);
  const open = invite.status === 'pending' && !invite.expired;
  // Once asked for, the code stays asked for, through the next try too.
  const [asksCode, setAsksCode] = useState(false);
  if (
    !asksCode &&
    isPlace(invite.grants) &&
    isApiError(error) &&
    error.code === 'wrong_invite_code'
  ) {
    setAsksCode(true);
  }

  return (
    <li
      ref={card}
      tabIndex={-1}
      aria-label={name}
      className={highlighted ? `${classes.card} ${classes.highlighted}` : classes.card}
    >
      <span className={classes.offer}>{name}</span>
      <BodyText tone="secondary">
        {invite.invited_by === null
          ? 'Sent by an organiser.'
          : `Sent by ${invite.invited_by.username}.`}{' '}
        {invite.status === 'pending' &&
          (invite.expired
            ? `It lapsed on ${formatDateTime(new Date(invite.expires_at))}. Ask the organisers for a new one.`
            : `It lapses on ${formatDateTime(new Date(invite.expires_at))}.`)}
      </BodyText>
      {invite.status !== 'pending' && <Outcome invite={invite} entered={entered} />}
      {open && asksCode && (
        <TextInput
          label="Contest code"
          description="This contest asks for the code its organisers gave out."
          value={code}
          onChange={setCode}
          required
        />
      )}
      {open && (
        <div className={classes.actions}>
          <Button
            size="xs"
            label={`Accept: ${name}`}
            loading={pending === 'accept'}
            disabled={pending === 'decline' || (asksCode && code.trim() === '')}
            onClick={() => void decide(invite, 'accept', asksCode ? code : undefined)}
          >
            {asksCode ? 'Accept with the code' : 'Accept'}
          </Button>
          <Button
            size="xs"
            variant="secondary"
            label={`Decline: ${name}`}
            loading={pending === 'decline'}
            disabled={pending === 'accept'}
            onClick={() => void decide(invite, 'decline')}
          >
            Decline
          </Button>
        </div>
      )}
      {error !== null && (
        <div role="alert">
          <ErrorBlock error={error} compact />
        </div>
      )}
    </li>
  );
}

export function InviteList({ label, invites }: { label: string; invites: Invite[] }) {
  return (
    <ul className={classes.list} aria-label={label}>
      {invites.map((invite) => (
        <InviteCard key={invite.id} invite={invite} />
      ))}
    </ul>
  );
}

/**
 * The home page's invites, shown only while there are some: each waiting
 * invite with Accept and Decline, and those decided here with what came of
 * them. A list that would not load leaves the home page as it was; the
 * invites page says why.
 */
export function PendingInvites() {
  const view = queryView(useMyInvites());
  if (view.state !== 'ready' || view.data.length === 0) return null;
  return (
    <section className={classes.section}>
      <SectionTitle>Invites for you</SectionTitle>
      <InviteList label="Invites for you" invites={view.data} />
    </section>
  );
}
