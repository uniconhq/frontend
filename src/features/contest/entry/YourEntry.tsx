import { useRef, useState, type FormEvent } from 'react';
import { useQueryClient, type Query } from '@tanstack/react-query';
import { useChange, type Change } from '@/api/change';
import { describeError } from '@/api/describe-error';
import { ApiError } from '@/api/problem';
import { $api } from '@/api/query';
import type { ContestHome, Entrant, Invitation, MyEntry } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Modal } from '@/ui/Modal';
import { SectionTitle } from '@/ui/SectionTitle';
import { TextInput } from '@/ui/TextInput';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { useMe } from '@/session';
import {
  inTeams,
  lockSentence,
  memberName,
  sizeSentence,
  wayText,
} from '@/lib/entrants';
import { teamNameProblem } from '@/lib/team-fields';
import { formatDateTime } from '@/lib/time';
import classes from './entry.module.css';

type Path = { org: string; contest: string };

/** Refusals that mean the page is behind: an invite, a team or a place moved on. */
const BEHIND = new Set([
  'not_found',
  'in_entrant',
  'entrant_full',
  'roster_locked',
  'entrant_changed',
  'wrong_status',
  'invite_expired',
]);

/** Whether a read is one of this contest's, which a change of entry may change. */
function ofContest(query: Query, { org, contest }: Path): boolean {
  const [, path, init] = query.queryKey as [unknown, unknown, unknown];
  if (typeof path !== 'string' || !path.includes('/contests/{contest}')) return false;
  const params = (init as { params?: { path?: Partial<Path> } } | undefined)?.params
    ?.path;
  return params?.org === org && params.contest === contest;
}

type Standing = { title: string; message: string };

/** What an entry that exists says, by where it stands, in a team or alone. */
function standing(entrant: Entrant, entry: MyEntry): Standing {
  const team = inTeams(entry);
  switch (entrant.status) {
    case 'pending':
      if (!entrant.complete) {
        return {
          title: 'Your team is not complete yet',
          message: `A team needs at least ${String(entry.fewest)} people before it can be approved. ${
            entrant.locked
              ? 'Your team is fixed now, so ask the organisers to add the others.'
              : 'Invite the others below.'
          }`,
        };
      }
      return {
        title: team
          ? 'Your team’s registration is waiting'
          : 'Your registration is waiting',
        message: 'An organiser decides it. This page moves on when they do.',
      };
    case 'rejected':
      return {
        title: team
          ? 'Your team’s registration was not accepted'
          : 'Your registration was not accepted',
        message: entrant.reason ?? 'The organisers gave no reason.',
      };
    case 'approved':
      return team
        ? {
            title: 'Your team is in',
            message:
              'Any member submits to any task that is open. The team’s submissions, its extra time and its questions are shared by everyone in it.',
          }
        : { title: 'You are in', message: 'Submit to any task that is open.' };
    case 'removed':
      return {
        title: team
          ? 'Your team was removed from this contest'
          : 'You were removed from this contest',
        message: 'What was submitted stays, and nothing more can be added to it.',
      };
    case 'withdrawn':
      return {
        title: 'You withdrew from this contest',
        message: 'What was submitted stays, and nothing more can be added to it.',
      };
  }
}

/**
 * Where something stands, as a status the page reads out. After the person's
 * own change the focus is on the section around it, whose button has gone.
 */
function Status({ title, message }: Standing) {
  return (
    <div className={classes.panel} role="status" aria-label="Registration">
      <BodyText>{title}</BodyText>
      <BodyText tone="secondary">{message}</BodyText>
    </div>
  );
}

/** Why the caller cannot register now, in words from its code. */
function refusedStanding(entry: MyEntry): Standing {
  if (!entry.registration_open) {
    return {
      title: 'Registration is closed',
      message: 'This contest is not taking registrations right now.',
    };
  }
  if (entry.refused === null) {
    return {
      title: 'You cannot register',
      message: 'This contest is not taking your registration.',
    };
  }
  const { title, message } = describeError(
    new ApiError({
      code: entry.refused.code,
      status: 403,
      title: entry.refused.detail,
      detail: entry.refused.detail,
    }),
  );
  return { title, message };
}

/**
 * The form that registers: a name in a team contest, which the person's team
 * goes by, and the code only when a code is their way in.
 */
function RegisterForm({
  path,
  entry,
  change,
}: {
  path: Path;
  entry: MyEntry;
  change: Change;
}) {
  const register = $api.useMutation(
    'post',
    '/api/v1/orgs/{org}/contests/{contest}/entrants',
  );
  const team = inTeams(entry);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found = team ? teamNameProblem(name) : null;
    setProblem(found);
    if (found !== null) return;
    void change.run('register', () =>
      register.mutateAsync({
        params: { path },
        body: {
          name: team ? name.trim() : null,
          code: entry.asks_code ? code : null,
        },
      }),
    );
  };

  return (
    <form
      className={classes.form}
      aria-label={team ? 'Register a team' : 'Register'}
      onSubmit={submit}
    >
      {team && (
        <BodyText tone="secondary">
          {sizeSentence(entry)} You register a team and invite the others to it; each of
          them joins by accepting.
        </BodyText>
      )}
      {team && (
        <TextInput
          label="Team name"
          value={name}
          onChange={setName}
          maxLength={60}
          required
        />
      )}
      {problem !== null && (
        <div role="alert">
          <BodyText tone="secondary">{problem}</BodyText>
        </div>
      )}
      {entry.asks_code && (
        <TextInput
          label="Contest code"
          description="The code the organisers gave you."
          value={code}
          onChange={setCode}
          required
        />
      )}
      <div className={classes.actions}>
        <Button type="submit" loading={change.pending === 'register'}>
          {team ? 'Register the team' : 'Register'}
        </Button>
      </div>
    </form>
  );
}

/**
 * Why the person cannot leave their entrant for another, or null when they
 * can: it is fixed, has submitted, or was turned away.
 */
function stuckBecause(entrant: Entrant): string | null {
  if (entrant.status === 'rejected' || entrant.status === 'removed') {
    return 'You cannot move to another team, since yours was not accepted.';
  }
  if (entrant.locked)
    return 'You cannot move to another team, since yours is fixed now.';
  if (entrant.submitted) {
    return 'You cannot move to another team, since yours has submitted.';
  }
  return null;
}

/**
 * The invites the person holds into other teams of the contest, each with
 * Accept and Decline. For someone in a team already, accepting moves them,
 * which it says, and which is off once their own team can no longer lose
 * them. The code is asked for when a member's invite needs it.
 */
function Invitations({ entry, change }: { entry: MyEntry; change: Change }) {
  const accept = $api.useMutation('post', '/api/v1/me/invites/{invite_id}/accept');
  const decline = $api.useMutation('post', '/api/v1/me/invites/{invite_id}/decline');
  const [code, setCode] = useState('');
  const own = entry.entrant;
  const stuck = own === null ? null : stuckBecause(own);
  const busy = change.pending !== null;
  const needsCode =
    entry.asks_code && entry.invitations.some((one) => !one.by_organiser);

  if (entry.invitations.length === 0) return null;
  return (
    <>
      <SectionTitle order={3}>Invites for you</SectionTitle>
      {own !== null && (
        <BodyText tone="secondary">
          {stuck ??
            `Accepting one moves you out of ${own.display_name} and into the team that invited you.`}
        </BodyText>
      )}
      {needsCode && stuck === null && (
        <TextInput
          label="Contest code"
          description="Joining a team that invited you still needs the contest’s code."
          value={code}
          onChange={setCode}
        />
      )}
      <ul className={classes.list} aria-label="Invites for you">
        {entry.invitations.map((invitation: Invitation) => {
          const into = invitation.entrant.name;
          return (
            <li key={invitation.invite} className={classes.item}>
              <div className={classes.who}>
                <span className={classes.name}>{into}</span>
                <BodyText tone="secondary">
                  {invitation.by_organiser
                    ? 'The organisers invited you into this team.'
                    : 'A member invited you to join them.'}{' '}
                  It expires on {formatDateTime(new Date(invitation.expires_at))}.
                </BodyText>
              </div>
              <div className={classes.actions}>
                <Button
                  size="xs"
                  label={`Join ${into}`}
                  loading={change.pending === `accept:${invitation.invite}`}
                  disabled={stuck !== null || busy}
                  onClick={() =>
                    void change.run(`accept:${invitation.invite}`, () =>
                      accept.mutateAsync({
                        params: { path: { invite_id: invitation.invite } },
                        body: {
                          code:
                            needsCode && !invitation.by_organiser && code !== ''
                              ? code
                              : null,
                        },
                      }),
                    )
                  }
                >
                  Join
                </Button>
                <Button
                  size="xs"
                  variant="secondary"
                  label={`Decline the invite to ${into}`}
                  loading={change.pending === `decline:${invitation.invite}`}
                  disabled={busy}
                  onClick={() =>
                    void change.run(`decline:${invitation.invite}`, () =>
                      decline.mutateAsync({
                        params: { path: { invite_id: invitation.invite } },
                      }),
                    )
                  }
                >
                  Decline
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** A username, or an email address when what was typed has an `@`. */
function targetOf(typed: string): { username: string } | { email: string } {
  return typed.includes('@') ? { email: typed } : { username: typed };
}

/**
 * The form a member asks someone into the team with, by username or email
 * address. It is off while the team is full, counting the invites waiting.
 */
function InviteForm({
  path,
  full,
  most,
  change,
}: {
  path: Path;
  full: boolean;
  most: number;
  change: Change;
}) {
  const invite = $api.useMutation(
    'post',
    '/api/v1/orgs/{org}/contests/{contest}/entrants/mine/invites',
  );
  const [typed, setTyped] = useState('');
  const [made, setMade] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const target = typed.trim();
    if (target === '') return;
    setMade(null);
    const outcome = await change.run('invite', () =>
      invite.mutateAsync({ params: { path }, body: targetOf(target) }),
    );
    if (outcome.ok) {
      setTyped('');
      setMade(`Invited ${target}. They join once they accept.`);
    }
  };

  return (
    <form
      className={classes.form}
      aria-label="Invite someone to your team"
      onSubmit={(event) => void submit(event)}
    >
      <TextInput
        label="Username or email address"
        description={
          full
            ? `Your team is full: a team holds at most ${String(most)}, counting the people invited.`
            : 'A username for someone with an account, an email address for anyone.'
        }
        value={typed}
        onChange={setTyped}
        maxLength={254}
        disabled={full}
        required
      />
      <div className={classes.actions}>
        <Button
          size="xs"
          type="submit"
          loading={change.pending === 'invite'}
          disabled={full || (change.pending !== null && change.pending !== 'invite')}
        >
          Invite
        </Button>
      </div>
      {made !== null && (
        <div role="status">
          <BodyText tone="secondary">{made}</BodyText>
        </div>
      )}
    </form>
  );
}

/** The team's new name, by any member while the team is not fixed. */
function RenameForm({
  path,
  entrant,
  change,
}: {
  path: Path;
  entrant: Entrant;
  change: Change;
}) {
  const rename = $api.useMutation(
    'put',
    '/api/v1/orgs/{org}/contests/{contest}/entrants/mine/name',
  );
  const [name, setName] = useState(entrant.name ?? '');
  const [problem, setProblem] = useState<string | null>(null);
  const changed = name.trim() !== (entrant.name ?? '');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found = teamNameProblem(name);
    setProblem(found);
    if (found !== null) return;
    void change.run('rename', () =>
      rename.mutateAsync({ params: { path }, body: { name: name.trim() } }),
    );
  };

  return (
    <form className={classes.inline} aria-label="Rename your team" onSubmit={submit}>
      <TextInput label="Team name" value={name} onChange={setName} maxLength={60} />
      <Button
        size="xs"
        variant="secondary"
        type="submit"
        loading={change.pending === 'rename'}
        disabled={!changed || (change.pending !== null && change.pending !== 'rename')}
      >
        Rename
      </Button>
      {problem !== null && (
        <div role="alert">
          <BodyText tone="secondary">{problem}</BodyText>
        </div>
      )}
    </form>
  );
}

/**
 * The caller's team: who is in it and how each came in, the invites waiting
 * to be accepted, and, until it is fixed, the forms to invite someone and to
 * rename it. The size and lock rules are said plainly above them.
 */
function TeamPart({
  path,
  entry,
  entrant,
  change,
}: {
  path: Path;
  entry: MyEntry;
  entrant: Entrant;
  change: Change;
}) {
  const me = useMe().user.id;
  const withdraw = $api.useMutation(
    'delete',
    '/api/v1/orgs/{org}/contests/{contest}/entrants/mine/invites/{invite_id}',
  );
  const open =
    !entrant.locked && entrant.status !== 'rejected' && entrant.status !== 'removed';
  const full = entrant.members.length + entrant.invites.length >= entry.most;
  const nameOf = (userId: number) =>
    entrant.members.find((member) => member.user_id === userId)?.user?.username;

  return (
    <>
      <div className={classes.panel}>
        <BodyText>{entrant.display_name}</BodyText>
        <BodyText tone="secondary">
          {sizeSentence(entry)} {lockSentence(entry.locks, entrant.locked)}
        </BodyText>
      </div>
      <ul className={classes.list} aria-label="Members">
        {entrant.members.map((member) => (
          <li key={member.user_id} className={classes.item}>
            <div className={classes.who}>
              <span className={classes.name}>{memberName(member)}</span>
              {member.user !== null && member.user.name !== null && (
                <span>{member.user.name}</span>
              )}
              <BodyText tone="secondary">
                {[...(member.user_id === me ? ['You'] : []), wayText(member)].join(
                  ' · ',
                )}
              </BodyText>
            </div>
          </li>
        ))}
      </ul>
      {entrant.invites.length > 0 && (
        <>
          <SectionTitle order={3}>Invited, not joined yet</SectionTitle>
          <ul className={classes.list} aria-label="Invited, not joined yet">
            {entrant.invites.map((invited) => {
              const who = invited.username ?? invited.email ?? 'Someone';
              const by = invited.by_organiser
                ? 'by the organisers'
                : `by ${nameOf(invited.invited_by) ?? 'a member'}`;
              return (
                <li key={invited.invite} className={classes.item}>
                  <div className={classes.who}>
                    <span className={classes.name}>{who}</span>
                    <BodyText tone="secondary">
                      Invited {by}. The invite expires on{' '}
                      {formatDateTime(new Date(invited.expires_at))}.
                    </BodyText>
                  </div>
                  {open && !invited.by_organiser && (
                    <Button
                      size="xs"
                      variant="secondary"
                      label={`Withdraw the invite for ${who}`}
                      loading={change.pending === `withdraw:${invited.invite}`}
                      disabled={change.pending !== null}
                      onClick={() =>
                        void change.run(`withdraw:${invited.invite}`, () =>
                          withdraw.mutateAsync({
                            params: { path: { ...path, invite_id: invited.invite } },
                          }),
                        )
                      }
                    >
                      Withdraw
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
      {open && (
        <>
          <SectionTitle order={3}>Invite someone</SectionTitle>
          <InviteForm path={path} full={full} most={entry.most} change={change} />
          <RenameForm
            key={entrant.name}
            path={path}
            entrant={entrant}
            change={change}
          />
        </>
      )}
    </>
  );
}

/**
 * Leaving the team, or withdrawing a registration of one, said before it is
 * done; there only until the entry is fixed, and never for one turned away.
 */
function Leave({
  path,
  entry,
  entrant,
  change,
}: {
  path: Path;
  entry: MyEntry;
  entrant: Entrant;
  change: Change;
}) {
  const leave = $api.useMutation(
    'post',
    '/api/v1/orgs/{org}/contests/{contest}/entrants/mine/leave',
  );
  const [asking, setAsking] = useState(false);
  const team = inTeams(entry);
  if (entrant.locked || entrant.status === 'rejected' || entrant.status === 'removed') {
    return null;
  }
  const last = entrant.members.length <= 1;
  const outcome = team
    ? last && !entrant.submitted
      ? 'Nobody is left in it, so the team is deleted.'
      : 'You lose access to the team’s submissions and questions.'
    : 'Your registration is taken away. You can register again while registration is open.';

  return (
    <>
      <div className={classes.actions}>
        <Button
          size="xs"
          variant="secondary"
          disabled={change.pending !== null}
          loading={change.pending === 'leave'}
          onClick={() => setAsking(true)}
        >
          {team ? 'Leave the team' : 'Withdraw my registration'}
        </Button>
      </div>
      <Modal
        opened={asking}
        onClose={() => setAsking(false)}
        title={team ? `Leave ${entrant.display_name}?` : 'Withdraw your registration?'}
      >
        <div className={classes.form}>
          <BodyText>{outcome}</BodyText>
          <div className={classes.actions}>
            <Button
              variant="danger"
              onClick={() => {
                setAsking(false);
                void change.run('leave', () => leave.mutateAsync({ params: { path } }));
              }}
            >
              {team ? 'Leave' : 'Withdraw'}
            </Button>
            <Button variant="secondary" onClick={() => setAsking(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

/** Extra time the organisers gave the entry, said once it has some. */
function Extension({ entrant }: { entrant: Entrant }) {
  if (entrant.time_extension <= 0) return null;
  const minutes = Math.round(entrant.time_extension / 60);
  const on =
    entrant.extension_tasks === null
      ? 'every task'
      : `${entrant.extension_tasks.join(', ')}`;
  return (
    <BodyText tone="secondary">
      The organisers gave you {minutes} more {minutes === 1 ? 'minute' : 'minutes'} on{' '}
      {on}.
    </BodyText>
  );
}

/**
 * The caller's part in the contest, on its page: registering, with a name in
 * a team contest and the code only when a code is their way in; then where
 * the registration stands; in a team contest the team, its members and how
 * each came in, the invites waiting, and inviting, renaming and leaving
 * until the team is fixed; and the invitations they hold into other teams.
 * Every change reads the contest's reads again, since submissions, their
 * caps, extra time and questions are the entry's. Each refusal is said in
 * words until it is dismissed, and one that shows the page was behind reads
 * it again.
 */
export function YourEntry({
  org,
  contest,
  home,
}: {
  org: string;
  contest: string;
  home: ContestHome;
}) {
  const path = { org, contest };
  const entry = home.registration;
  const queryClient = useQueryClient();
  const section = useRef<HTMLElement>(null);
  const change = useChange({
    reread: () =>
      Promise.all([
        queryClient.invalidateQueries({ predicate: (query) => ofContest(query, path) }),
        queryClient.invalidateQueries({
          queryKey: $api.queryOptions('get', '/api/v1/contests').queryKey,
        }),
        queryClient.invalidateQueries({
          queryKey: $api.queryOptions('get', '/api/v1/me/invites').queryKey,
        }),
      ]),
    behind: BEHIND,
    focus: section,
  });
  const team = inTeams(entry);
  const entrant = entry.entrant;

  return (
    <section
      ref={section}
      className={classes.section}
      tabIndex={-1}
      aria-label="Your entry"
    >
      {entrant === null ? (
        home.organises ? (
          <Status
            title="You organise this contest"
            message="Organisers of a contest cannot also enter it."
          />
        ) : entry.can_register ? (
          <RegisterForm path={path} entry={entry} change={change} />
        ) : (
          <Status {...refusedStanding(entry)} />
        )
      ) : (
        <>
          <Status {...standing(entrant, entry)} />
          <Extension entrant={entrant} />
          {team && (
            <TeamPart path={path} entry={entry} entrant={entrant} change={change} />
          )}
          <Leave path={path} entry={entry} entrant={entrant} change={change} />
        </>
      )}
      {!home.organises && <Invitations entry={entry} change={change} />}
      {change.error !== null && (
        <div className={classes.panel} role="alert">
          <ErrorBlock error={change.error} compact />
          <div className={classes.actions}>
            <Button size="xs" variant="secondary" onClick={change.dismiss}>
              Dismiss
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
