import { useRef } from 'react';
import { queryView } from '@/api/query';
import type { Invite } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { PageLink } from '@/ui/PageLink';
import { SectionTitle } from '@/ui/SectionTitle';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { contestHomePath } from '@/lib/contest-paths';
import { contestPath, orgPath, taskPath } from '@/lib/organiser-paths';
import { scopeName } from '@/lib/scope-name';
import { formatDateTime } from '@/lib/time';
import { useDecide, useMyInvites } from './my-invites';
import classes from './invites.module.css';

const ROLE: Record<Exclude<Invite['grants'], 'contestant'>, string> = {
  admin: 'The admin role',
  manager: 'The manager role',
  observer: 'The observer role',
};

const NOW_HOLDS: Record<Exclude<Invite['grants'], 'contestant'>, string> = {
  admin: 'You are now an admin at',
  manager: 'You are now a manager at',
  observer: 'You are now an observer at',
};

/** What an invite offers and where, in a few words. */
function offer(invite: Invite): string {
  const where = scopeName(invite.where);
  return invite.grants === 'contestant'
    ? `A place in the contest ${where}`
    : `${ROLE[invite.grants]} at ${where}`;
}

/** The organiser's page of the place a role was accepted at. */
function placePath({ where }: Invite): string {
  if (where.contest === null) return orgPath(where.org);
  if (where.task === null) return contestPath(where.org, where.contest);
  return taskPath(where.org, where.contest, where.task);
}

/** What became of an invite that is no longer waiting, with where to go next. */
function Outcome({ invite }: { invite: Invite }) {
  const where = scopeName(invite.where);
  const { grants } = invite;
  if (invite.status === 'accepted' && grants === 'contestant') {
    return (
      <>
        <BodyText>
          You have a place in {where}. Register on the contest’s page to take part.
        </BodyText>
        {invite.where.contest !== null && (
          <PageLink to={contestHomePath(invite.where.org, invite.where.contest)}>
            Go to the contest
          </PageLink>
        )}
      </>
    );
  }
  if (invite.status === 'accepted' && grants !== 'contestant') {
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
 * and when it lapses, with Accept and Decline while it is open. A lapsed one
 * says to ask for a new one, and one decided here says what came of it. The
 * focus moves to the card once a choice is answered.
 */
export function InviteCard({
  invite,
  highlighted = false,
}: {
  invite: Invite;
  highlighted?: boolean;
}) {
  const card = useRef<HTMLLIElement>(null);
  const { pending, error, decide } = useDecide(card);
  const name = offer(invite);
  const open = invite.status === 'pending' && !invite.expired;

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
      {invite.status !== 'pending' && <Outcome invite={invite} />}
      {open && (
        <div className={classes.actions}>
          <Button
            size="xs"
            label={`Accept: ${name}`}
            loading={pending === 'accept'}
            disabled={pending === 'decline'}
            onClick={() => void decide(invite, 'accept')}
          >
            Accept
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
