import { useRef, useState, type FormEvent, type RefObject } from 'react';
import { useQueryClient, type Query } from '@tanstack/react-query';
import { $api, queryView } from '@/api/query';
import { isApiError } from '@/api/problem';
import type { ListedTeam, MyTeams, Team, TeamMember } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Modal } from '@/ui/Modal';
import { SectionTitle } from '@/ui/SectionTitle';
import { TextInput } from '@/ui/TextInput';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { useMe } from '@/session';
import { formatDateTime } from '@/lib/time';
import { t } from '@/lib/t';
import classes from './teams.module.css';

const MY_TEAM = '/api/v1/orgs/{org}/contests/{contest}/my-team';
const TEAMS = '/api/v1/orgs/{org}/contests/{contest}/teams';

/** The most characters a team's name takes, as the forge has it. */
const NAME_MAX = 60;

/**
 * How often the team is read again, since nothing pushes a change to it:
 * soon while someone is asked in or asking, and now and then otherwise.
 */
const WAITING_MS = 10_000;
const MEANWHILE_MS = 30_000;

function pollEvery(mine: MyTeams | undefined): number {
  const waiting =
    mine !== undefined &&
    (mine.invited_to.length > 0 ||
      mine.requested.length > 0 ||
      (mine.team?.pending.length ?? 0) > 0);
  return waiting ? WAITING_MS : MEANWHILE_MS;
}

/** Refusals that mean the page is behind: a request, a place or a team moved on. */
const BEHIND = new Set(['not_found', 'in_team', 'team_full', 'forbidden']);

type Path = { org: string; contest: string };

/** Whether a read is one of this contest's, which a change of team may change. */
function ofContest(query: Query, { org, contest }: Path): boolean {
  const [, path, init] = query.queryKey as [unknown, unknown, unknown];
  if (typeof path !== 'string' || !path.includes('/contests/{contest}')) return false;
  const params = (init as { params?: { path?: Partial<Path> } } | undefined)?.params
    ?.path;
  return params?.org === org && params.contest === contest;
}

type Change = {
  /** Which change is under way, such as `approve:20`, while one is. */
  pending: string | null;
  error: unknown;
  /**
   * Make one change at a time, then read the team again, or, for one that
   * changes whose work the caller reaches, every read of the contest. The
   * section takes the focus once it has, since the button that was clicked
   * has usually gone.
   */
  run: (
    key: string,
    change: () => Promise<unknown>,
    options?: { everything?: boolean },
  ) => Promise<boolean>;
};

function useChange(path: Path, section: RefObject<HTMLElement | null>): Change {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const init = { params: { path } };

  const readTeams = () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: $api.queryOptions('get', MY_TEAM, init).queryKey,
      }),
      queryClient.invalidateQueries({
        queryKey: $api.queryOptions('get', TEAMS, init).queryKey,
      }),
    ]);

  const run: Change['run'] = async (key, change, options = {}) => {
    if (pending !== null) return false;
    setPending(key);
    setError(null);
    try {
      await change();
    } catch (refused) {
      setError(refused);
      if (isApiError(refused) && BEHIND.has(refused.code)) await readTeams();
      setPending(null);
      return false;
    }
    await (options.everything === true
      ? queryClient.invalidateQueries({ predicate: (query) => ofContest(query, path) })
      : readTeams());
    setPending(null);
    section.current?.focus();
    return true;
  };

  return { pending, error, run };
}

function nameOf(member: TeamMember): string {
  return member.user?.username ?? t('Deleted user');
}

/** Who someone is, with what they are to the team and to the reader. */
function Who({ member, notes }: { member: TeamMember; notes: string[] }) {
  return (
    <div className={classes.who}>
      <span className={classes.name}>{nameOf(member)}</span>
      {member.user !== null && member.user.name !== null && (
        <span>{member.user.name}</span>
      )}
      {notes.length > 0 && <BodyText tone="secondary">{notes.join(' · ')}</BodyText>}
    </div>
  );
}

/** A team as someone choosing one sees it: its name, its leader and its places. */
function Listed({ team }: { team: ListedTeam }) {
  return (
    <div className={classes.who}>
      <span className={classes.name}>{team.name}</span>
      <BodyText tone="secondary">
        {team.leader === null
          ? t('No leader')
          : `${t('Led by')} ${team.leader.username}`}{' '}
        · {team.size} {t('of')} {team.max_size} {t('places taken')}
      </BodyText>
    </div>
  );
}

/** The member who becomes leader when the leader leaves: whoever joined earliest. */
function nextLeader(team: Team, leaving: number): TeamMember | null {
  const others = team.members.filter((member) => member.user_id !== leaving);
  return others.reduce<TeamMember | null>(
    (earliest, member) =>
      earliest === null || Date.parse(member.since) < Date.parse(earliest.since)
        ? member
        : earliest,
    null,
  );
}

/**
 * What leaving does, said before it is done: the work stays the team's, the
 * lead passes on, and a team left with nobody and nothing submitted goes.
 */
function leaveOutcome(team: Team, me: number): string {
  const next = nextLeader(team, me);
  if (next === null) {
    return team.submitted
      ? t('Nobody is left in it, and the team stays with its results.')
      : t('Nobody is left in it, so the team is deleted.');
  }
  if (team.leader === me) {
    return `${nameOf(next)} ${t('becomes the leader, as the member who joined earliest.')}`;
  }
  return '';
}

/**
 * The leader's form to ask an approved contestant in by their username. It
 * says why it is off while the team is full, and a username nobody has, or
 * someone who is not yet a contestant here, is said in those words.
 */
function InviteForm({ path, team, full }: { path: Path; team: Team; full: boolean }) {
  const queryClient = useQueryClient();
  const invite = $api.useMutation(
    'post',
    '/api/v1/orgs/{org}/contests/{contest}/teams/{team_id}/invite',
  );
  const [typed, setTyped] = useState('');
  const [tried, setTried] = useState('');
  const [made, setMade] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const username = typed.trim();
    if (username === '' || pending) return;
    setPending(true);
    setError(null);
    setMade(null);
    setTried(username);
    try {
      await invite.mutateAsync({
        params: { path: { ...path, team_id: team.id } },
        body: { username },
      });
      setTyped('');
      setMade(username);
    } catch (refused) {
      setError(refused);
    }
    await queryClient.invalidateQueries({
      queryKey: $api.queryOptions('get', MY_TEAM, { params: { path } }).queryKey,
    });
    setPending(false);
  };

  return (
    <form
      className={classes.form}
      aria-label={t('Invite someone to your team')}
      onSubmit={(event) => void submit(event)}
    >
      <TextInput
        label={t('Username')}
        description={t('Someone already approved as a contestant of this contest.')}
        value={typed}
        onChange={setTyped}
        disabled={full}
        required
      />
      <div className={classes.actions}>
        <Button size="xs" type="submit" loading={pending} disabled={full}>
          {t('Invite')}
        </Button>
      </div>
      {made !== null && (
        <div role="status">
          <BodyText tone="secondary">
            {t('Invited')} {made}. {t('They join once they accept.')}
          </BodyText>
        </div>
      )}
      {error !== null && (
        <div role="alert">
          {isApiError(error) && error.code === 'not_found' ? (
            <BodyText tone="secondary">
              {t('Nobody has the username')} {tried}.
            </BodyText>
          ) : isApiError(error) && error.code === 'not_approved' ? (
            <BodyText tone="secondary">
              {tried}{' '}
              {t(
                'is not an approved contestant of this contest, so they cannot join a team yet.',
              )}
            </BodyText>
          ) : (
            <ErrorBlock error={error} compact />
          )}
        </div>
      )}
    </form>
  );
}

/**
 * The caller's team: its members and the people asked in or asking, and
 * Leave. Its leader also lets in or turns down a request, takes back an
 * invitation, removes a member and invites by username; while the team is
 * full, Approve and Invite are off with the reason beside them.
 */
function YourTeam({
  path,
  team,
  maxSize,
  me,
  change,
}: {
  path: Path;
  team: Team;
  maxSize: number;
  me: number;
  change: Change;
}) {
  const leave = $api.useMutation(
    'post',
    '/api/v1/orgs/{org}/contests/{contest}/my-team/leave',
  );
  const approve = $api.useMutation(
    'post',
    '/api/v1/orgs/{org}/contests/{contest}/teams/{team_id}/members/{user_id}/approve',
  );
  const remove = $api.useMutation(
    'delete',
    '/api/v1/orgs/{org}/contests/{contest}/teams/{team_id}/members/{user_id}',
  );
  const [leaving, setLeaving] = useState(false);
  const [removing, setRemoving] = useState<TeamMember | null>(null);
  const leads = team.leader === me;
  const full = team.members.length >= maxSize;
  const busy = change.pending !== null;
  const member = (user_id: number) => ({
    params: { path: { ...path, team_id: team.id, user_id } },
  });
  const outcome = leaveOutcome(team, me);

  const notes = (person: TeamMember) => [
    ...(person.user_id === team.leader ? [t('Leader')] : []),
    ...(person.user_id === me ? [t('You')] : []),
  ];

  return (
    <>
      <SectionTitle>{t('Your team')}</SectionTitle>
      <div className={classes.panel}>
        <BodyText>{team.name}</BodyText>
        <BodyText tone="secondary">
          {team.members.length} {t('of')} {maxSize} {t('places taken.')}{' '}
          {t(
            'Your submissions, limits and questions are the team’s, and everyone in it sees them.',
          )}
        </BodyText>
      </div>
      <ul className={classes.list} aria-label={t('Members')}>
        {team.members.map((person) => (
          <li key={person.user_id} className={classes.item}>
            <Who member={person} notes={notes(person)} />
            {leads && person.user_id !== me && (
              <div className={classes.actions}>
                <Button
                  size="xs"
                  variant="danger"
                  label={`${t('Remove')} ${nameOf(person)}`}
                  disabled={busy}
                  onClick={() => setRemoving(person)}
                >
                  {t('Remove')}
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {team.pending.length > 0 && (
        <>
          <SectionTitle order={3}>{t('Waiting to join')}</SectionTitle>
          <ul className={classes.list} aria-label={t('Waiting to join')}>
            {team.pending.map((person) => {
              const name = nameOf(person);
              const asked = person.status === 'requested';
              const since = formatDateTime(new Date(person.since));
              return (
                <li key={person.user_id} className={classes.item}>
                  <Who
                    member={person}
                    notes={[
                      asked
                        ? `${t('Asked to join')} ${since}`
                        : `${t('Invited')} ${since}`,
                    ]}
                  />
                  {leads && (
                    <div className={classes.actions}>
                      {asked && (
                        <Button
                          size="xs"
                          label={`${t('Approve')} ${name}`}
                          loading={change.pending === `approve:${person.user_id}`}
                          disabled={full || busy}
                          onClick={() =>
                            void change.run(`approve:${person.user_id}`, () =>
                              approve.mutateAsync(member(person.user_id)),
                            )
                          }
                        >
                          {t('Approve')}
                        </Button>
                      )}
                      <Button
                        size="xs"
                        variant="secondary"
                        label={
                          asked
                            ? `${t('Refuse')} ${name}`
                            : `${t('Withdraw the invitation for')} ${name}`
                        }
                        loading={change.pending === `drop:${person.user_id}`}
                        disabled={busy}
                        onClick={() =>
                          void change.run(`drop:${person.user_id}`, () =>
                            remove.mutateAsync(member(person.user_id)),
                          )
                        }
                      >
                        {asked ? t('Refuse') : t('Withdraw invitation')}
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
      {leads && full && (
        <BodyText tone="secondary">
          {t('Your team is full, since a team in this contest holds at most')} {maxSize}
          {t('. Nobody else can join until someone leaves.')}
        </BodyText>
      )}
      {leads && <InviteForm path={path} team={team} full={full} />}
      <div className={classes.actions}>
        <Button
          size="xs"
          variant="secondary"
          disabled={busy}
          loading={change.pending === 'leave'}
          onClick={() => setLeaving(true)}
        >
          {t('Leave the team')}
        </Button>
      </div>
      <Modal
        opened={leaving}
        onClose={() => setLeaving(false)}
        title={`${t('Leave')} ${team.name}?`}
      >
        <div className={classes.form}>
          <BodyText>
            {t(
              'You stop reaching the team’s submissions and questions, and submit on your own from then. What the team made stays the team’s.',
            )}
          </BodyText>
          {outcome !== '' && <BodyText>{outcome}</BodyText>}
          <div className={classes.actions}>
            <Button
              variant="danger"
              onClick={() => {
                setLeaving(false);
                void change.run(
                  'leave',
                  () => leave.mutateAsync({ params: { path } }),
                  { everything: true },
                );
              }}
            >
              {t('Leave')}
            </Button>
            <Button variant="secondary" onClick={() => setLeaving(false)}>
              {t('Cancel')}
            </Button>
          </div>
        </div>
      </Modal>
      <Modal
        opened={removing !== null}
        onClose={() => setRemoving(null)}
        title={`${t('Remove')} ${removing === null ? '' : nameOf(removing)} ${t('from')} ${team.name}?`}
      >
        <div className={classes.form}>
          <BodyText>
            {t(
              'They stop reaching the team’s submissions and questions, and submit on their own from then. What the team made stays the team’s.',
            )}
          </BodyText>
          <div className={classes.actions}>
            <Button
              variant="danger"
              onClick={() => {
                if (removing === null) return;
                const { user_id } = removing;
                setRemoving(null);
                void change.run(`remove:${user_id}`, () =>
                  remove.mutateAsync(member(user_id)),
                );
              }}
            >
              {t('Remove')}
            </Button>
            <Button variant="secondary" onClick={() => setRemoving(null)}>
              {t('Cancel')}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

/** A new team's name, and Create, which makes the caller its leader. */
function CreateTeam({ path, change }: { path: Path; change: Change }) {
  const create = $api.useMutation(
    'post',
    '/api/v1/orgs/{org}/contests/{contest}/teams',
  );
  const [name, setName] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void change.run(
      'create',
      () => create.mutateAsync({ params: { path }, body: { name: name.trim() } }),
      { everything: true },
    );
  };

  return (
    <form className={classes.form} aria-label={t('Make a team')} onSubmit={submit}>
      <TextInput
        label={t('Team name')}
        description={t('You lead the team you make, and invite the others.')}
        value={name}
        onChange={setName}
        maxLength={NAME_MAX}
        required
      />
      <div className={classes.actions}>
        <Button
          size="xs"
          type="submit"
          loading={change.pending === 'create'}
          disabled={change.pending !== null && change.pending !== 'create'}
        >
          {t('Make the team')}
        </Button>
      </div>
    </form>
  );
}

/**
 * Every team of the contest with how many places each has taken, and Ask to
 * join. A full team says so in place of the button, as does one the caller
 * has asked to join or is invited into already.
 */
function TeamList({
  path,
  mine,
  change,
}: {
  path: Path;
  mine: MyTeams;
  change: Change;
}) {
  const view = queryView(
    $api.useQuery(
      'get',
      TEAMS,
      { params: { path } },
      { refetchInterval: () => pollEvery(mine) },
    ),
  );
  const ask = $api.useMutation(
    'post',
    '/api/v1/orgs/{org}/contests/{contest}/teams/{team_id}/request',
  );
  const asked = new Set(mine.requested.map((team) => team.id));
  const invited = new Set(mine.invited_to.map((team) => team.id));

  if (view.state === 'loading') return <PageSkeleton rows={2} />;
  if (view.state === 'error')
    return <ErrorBlock error={view.error} onRetry={view.retry} />;
  if (view.data.length === 0) {
    return <BodyText tone="secondary">{t('Nobody has made a team yet.')}</BodyText>;
  }
  return (
    <ul className={classes.list} aria-label={t('Teams')}>
      {view.data.map((team) => {
        const key = `ask:${team.id}`;
        let note: string | null = null;
        if (asked.has(team.id)) note = t('You have asked to join.');
        else if (invited.has(team.id)) note = t('You are invited. Answer above.');
        else if (team.size >= team.max_size) note = t('This team is full.');
        return (
          <li key={team.id} className={classes.item}>
            <Listed team={team} />
            {note === null ? (
              <Button
                size="xs"
                label={`${t('Ask to join')} ${team.name}`}
                loading={change.pending === key}
                disabled={change.pending !== null && change.pending !== key}
                onClick={() =>
                  void change.run(key, () =>
                    ask.mutateAsync({
                      params: { path: { ...path, team_id: team.id } },
                    }),
                  )
                }
              >
                {t('Ask to join')}
              </Button>
            ) : (
              <BodyText tone="secondary">{note}</BodyText>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * For someone in no team: the invitations they have, with Accept and
 * Decline, the requests they made, with Withdraw, a form to make a team, and
 * the teams to ask to join.
 */
function NoTeam({ path, mine, change }: { path: Path; mine: MyTeams; change: Change }) {
  const accept = $api.useMutation(
    'post',
    '/api/v1/orgs/{org}/contests/{contest}/teams/{team_id}/request',
  );
  const cancel = $api.useMutation(
    'post',
    '/api/v1/orgs/{org}/contests/{contest}/teams/{team_id}/cancel',
  );
  const busy = change.pending !== null;
  const team = (id: string) => ({ params: { path: { ...path, team_id: id } } });

  return (
    <>
      <SectionTitle>{t('Team')}</SectionTitle>
      <BodyText tone="secondary">
        {t('This contest is entered in teams of up to')} {mine.max_size}
        {t(
          '. Make a team, or ask to join one. Once you submit on your own, you cannot join a team.',
        )}
      </BodyText>
      {mine.invited_to.length > 0 && (
        <>
          <SectionTitle order={3}>{t('Invitations for you')}</SectionTitle>
          <ul className={classes.list} aria-label={t('Invitations for you')}>
            {mine.invited_to.map((invited) => {
              const full = invited.size >= invited.max_size;
              return (
                <li key={invited.id} className={classes.item}>
                  <Listed team={invited} />
                  <div className={classes.actions}>
                    {full && (
                      <BodyText tone="secondary">{t('This team is full.')}</BodyText>
                    )}
                    <Button
                      size="xs"
                      label={`${t('Accept the invitation to')} ${invited.name}`}
                      loading={change.pending === `accept:${invited.id}`}
                      disabled={full || busy}
                      onClick={() =>
                        void change.run(
                          `accept:${invited.id}`,
                          () => accept.mutateAsync(team(invited.id)),
                          { everything: true },
                        )
                      }
                    >
                      {t('Accept')}
                    </Button>
                    <Button
                      size="xs"
                      variant="secondary"
                      label={`${t('Decline the invitation to')} ${invited.name}`}
                      loading={change.pending === `decline:${invited.id}`}
                      disabled={busy}
                      onClick={() =>
                        void change.run(`decline:${invited.id}`, () =>
                          cancel.mutateAsync(team(invited.id)),
                        )
                      }
                    >
                      {t('Decline')}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {mine.requested.length > 0 && (
        <>
          <SectionTitle order={3}>{t('Your requests')}</SectionTitle>
          <BodyText tone="secondary">
            {t('Each team’s leader decides. You join the first that lets you in.')}
          </BodyText>
          <ul className={classes.list} aria-label={t('Your requests')}>
            {mine.requested.map((requested) => (
              <li key={requested.id} className={classes.item}>
                <Listed team={requested} />
                <Button
                  size="xs"
                  variant="secondary"
                  label={`${t('Withdraw the request to join')} ${requested.name}`}
                  loading={change.pending === `withdraw:${requested.id}`}
                  disabled={busy}
                  onClick={() =>
                    void change.run(`withdraw:${requested.id}`, () =>
                      cancel.mutateAsync(team(requested.id)),
                    )
                  }
                >
                  {t('Withdraw')}
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
      <SectionTitle order={3}>{t('Make a team')}</SectionTitle>
      <CreateTeam path={path} change={change} />
      <SectionTitle order={3}>{t('Join a team')}</SectionTitle>
      <TeamList path={path} mine={mine} change={change} />
    </>
  );
}

/**
 * An approved contestant's place among the contest's teams, on the contest's
 * page, for a contest whose settings turn teams on. A contest without teams
 * answers `teams_off`, and the section is then not there at all, nor while
 * the first answer is on its way. Nothing pushes a change of team, so it is
 * read again every few seconds while someone waits on an answer, and now and
 * then otherwise. Each refusal is said in words, and one that shows the page
 * was behind reads the team again.
 */
export function TeamSection({ org, contest }: { org: string; contest: string }) {
  const me = useMe().user.id;
  const path = { org, contest };
  const section = useRef<HTMLElement>(null);
  const change = useChange(path, section);
  const view = queryView(
    $api.useQuery(
      'get',
      MY_TEAM,
      { params: { path } },
      { refetchInterval: (query) => pollEvery(query.state.data) },
    ),
  );

  if (view.state === 'loading') return null;
  if (view.state === 'error' && view.error.code === 'teams_off') return null;
  return (
    <Card>
      <section
        ref={section}
        className={classes.section}
        tabIndex={-1}
        aria-label={t('Team')}
      >
        {view.state === 'error' && (
          <>
            <SectionTitle>{t('Team')}</SectionTitle>
            <ErrorBlock error={view.error} onRetry={view.retry} />
          </>
        )}
        {view.state === 'ready' &&
          (view.data.team === null ? (
            <NoTeam path={path} mine={view.data} change={change} />
          ) : (
            <YourTeam
              path={path}
              team={view.data.team}
              maxSize={view.data.max_size}
              me={me}
              change={change}
            />
          ))}
        {change.error !== null && (
          <div role="alert">
            <ErrorBlock error={change.error} compact />
          </div>
        )}
      </section>
    </Card>
  );
}
