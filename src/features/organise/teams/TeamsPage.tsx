import { useRef, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useChange } from '@/api/change';
import { $api, queryView, type QueryView } from '@/api/query';
import { isApiError } from '@/api/problem';
import type { Contestant, Team, TeamMember } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Modal } from '@/ui/Modal';
import { PageLink } from '@/ui/PageLink';
import { PageTitle } from '@/ui/PageTitle';
import { SectionTitle } from '@/ui/SectionTitle';
import { Select } from '@/ui/Select';
import { TextInput } from '@/ui/TextInput';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { useMe } from '@/session';
import { contestPath } from '@/lib/organiser-paths';
import { useContestParams } from '@/lib/route-params';
import { teamNameProblem, USERNAME_MAX } from '@/lib/team-fields';
import { formatDateTime } from '@/lib/time';
import { holdsAtContest } from '../roles';
import classes from './teams.module.css';

const EVERY = '/api/v1/orgs/{org}/contests/{contest}/organise/teams';
const ONE = '/api/v1/orgs/{org}/contests/{contest}/organise/teams/{team_id}';
const CONTESTANTS = '/api/v1/orgs/{org}/contests/{contest}/contestants';

/** How often the list is read again, since nothing pushes a change of team. */
const POLL_MS = 30_000;

/** Refusals that mean the list is behind: a person or a team moved on. */
const BEHIND = new Set(['not_found', 'in_team', 'team_full', 'team_has_submissions']);

type Path = { org: string; contest: string };

/** What a manager is asked to confirm, each naming the team it changes. */
type Confirm =
  | { kind: 'move'; member: TeamMember }
  | { kind: 'remove'; member: TeamMember }
  | { kind: 'add' }
  | { kind: 'delete' };

function nameOf(member: TeamMember): string {
  return member.user?.username ?? 'Deleted user';
}

/** The approved contestants, the people a manager may add to a team. */
function approvedOf(contestants: Contestant[]): Contestant[] {
  return contestants.filter((found) => found.status === 'approved');
}

/** What removing someone does beyond taking them out, said before it is done. */
function removeOutcome(team: Team, member: TeamMember): string {
  const others = team.members.filter((found) => found.user_id !== member.user_id);
  if (others.length === 0) {
    return team.submitted
      ? 'Nobody is left in it, and the team stays with its results.'
      : 'Nobody is left in it, so the team is deleted.';
  }
  return team.leader === member.user_id
    ? 'The lead passes to the member who joined earliest.'
    : '';
}

/**
 * A team for its organisers: its members with when each joined, the people
 * asked in or asking, and whether it has submitted. A manager makes a member
 * the leader, moves one to another team, removes one, adds an approved
 * contestant, turns down a request or takes back an invitation, and deletes
 * a team that has submitted nothing. Each change that moves someone in or
 * out asks first, naming the team, since it changes who reaches that team's
 * work. Opening one reads the list again, so it asks about the team as it
 * is. A refusal shows where it was made, and one that shows the list was
 * behind reads it again.
 */
function TeamCard({
  path,
  team,
  teams,
  contestants,
  manages,
  onGone,
}: {
  path: Path;
  team: Team;
  teams: Team[];
  contestants: QueryView<Contestant[]>;
  manages: boolean;
  onGone: () => void;
}) {
  const queryClient = useQueryClient();
  const remove = $api.useMutation('delete', `${ONE}/members/{user_id}` as const);
  const move = $api.useMutation('post', `${ONE}/members` as const);
  const lead = $api.useMutation('put', `${ONE}/leader` as const);
  const drop = $api.useMutation('delete', ONE);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [target, setTarget] = useState('');
  const card = useRef<HTMLElement>(null);
  const listKey = $api.queryOptions('get', EVERY, { params: { path } }).queryKey;
  const change = useChange({
    reread: () => queryClient.invalidateQueries({ queryKey: listKey }),
    behind: BEHIND,
    focus: card,
  });
  const { pending, error } = change;
  const here = { ...path, team_id: team.id };
  const busy = pending !== null;
  const others = teams.filter((found) => found.id !== team.id);
  const leader = team.members.find((member) => member.user_id === team.leader);

  const teamOf = new Map(
    teams.flatMap((found) =>
      found.members.map((member) => [member.user_id, found] as const),
    ),
  );
  const addable =
    contestants.state === 'ready'
      ? approvedOf(contestants.data).filter(
          (found) => teamOf.get(found.user_id)?.id !== team.id,
        )
      : [];

  const ask = (next: Confirm | null) => {
    change.dismiss();
    setTarget('');
    setConfirm(next);
    if (next === null) return;
    void queryClient.invalidateQueries({ queryKey: listKey });
    if (next.kind === 'add') {
      void queryClient.invalidateQueries({
        queryKey: $api.queryOptions('get', CONTESTANTS, { params: { path } }).queryKey,
      });
    }
  };

  const run = async (key: string, made: () => Promise<unknown>, gone = false) => {
    const outcome = await change.run(key, made);
    if (!outcome.ok) return;
    setConfirm(null);
    if (gone) onGone();
  };

  const takeOut = (member: TeamMember) => () =>
    remove.mutateAsync({ params: { path: { ...here, user_id: member.user_id } } });
  const putIn = (into: string, user_id: number) => () =>
    move.mutateAsync({
      params: { path: { ...path, team_id: into } },
      body: { user_id },
    });

  const chosenTeam = others.find((found) => found.id === target);
  const chosenPerson = addable.find((found) => String(found.user_id) === target);
  const personsTeam =
    chosenPerson === undefined ? undefined : teamOf.get(chosenPerson.user_id);

  const refusal = error !== null && (
    <div role="alert">
      <ErrorBlock error={error} compact />
    </div>
  );

  return (
    <Card>
      <section
        ref={card}
        className={classes.stack}
        tabIndex={-1}
        aria-label={team.name}
      >
        <div className={classes.heading}>
          <div className={classes.person}>
            <SectionTitle>{team.name}</SectionTitle>
            <BodyText tone="secondary">
              {leader === undefined ? 'No leader.' : `Led by ${nameOf(leader)}.`}{' '}
              {team.members.length} in it.{' '}
              {team.submitted ? 'It has submitted.' : 'It has not submitted yet.'}
            </BodyText>
          </div>
          {manages && (
            <div className={classes.actions}>
              <Button
                size="xs"
                variant="secondary"
                label={`Add a contestant to ${team.name}`}
                disabled={busy}
                onClick={() => ask({ kind: 'add' })}
              >
                Add a contestant
              </Button>
              <Button
                size="xs"
                variant="danger"
                label={`Delete ${team.name}`}
                disabled={busy || team.submitted}
                onClick={() => ask({ kind: 'delete' })}
              >
                Delete
              </Button>
            </div>
          )}
        </div>
        {manages && team.submitted && (
          <BodyText tone="secondary">
            A team that has submitted stays with its results, so it is not deleted.
          </BodyText>
        )}
        {team.members.length === 0 ? (
          <BodyText tone="secondary">Nobody is in this team.</BodyText>
        ) : (
          <table className={classes.table} aria-label={`Members of ${team.name}`}>
            <thead>
              <tr>
                <th scope="col">Member</th>
                <th scope="col">Joined</th>
                {manages && <th scope="col">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {team.members.map((member) => {
                const name = nameOf(member);
                const leads = member.user_id === team.leader;
                return (
                  <tr key={member.user_id}>
                    <th scope="row">
                      <div className={classes.person}>
                        <span>{name}</span>
                        {member.user !== null && member.user.name !== null && (
                          <BodyText tone="secondary">{member.user.name}</BodyText>
                        )}
                        {leads && <BodyText tone="secondary">Leader</BodyText>}
                      </div>
                    </th>
                    <td>{formatDateTime(new Date(member.since))}</td>
                    {manages && (
                      <td>
                        <div className={classes.actions}>
                          {!leads && (
                            <Button
                              size="xs"
                              variant="secondary"
                              label={`Make ${name} the leader`}
                              loading={pending === `lead:${member.user_id}`}
                              disabled={busy}
                              onClick={() =>
                                void run(`lead:${member.user_id}`, () =>
                                  lead.mutateAsync({
                                    params: { path: here },
                                    body: { user_id: member.user_id },
                                  }),
                                )
                              }
                            >
                              Make leader
                            </Button>
                          )}
                          {others.length > 0 && (
                            <Button
                              size="xs"
                              variant="secondary"
                              label={`Move ${name}`}
                              disabled={busy}
                              onClick={() => ask({ kind: 'move', member })}
                            >
                              Move
                            </Button>
                          )}
                          <Button
                            size="xs"
                            variant="danger"
                            label={`Remove ${name}`}
                            disabled={busy}
                            onClick={() => ask({ kind: 'remove', member })}
                          >
                            Remove
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {team.pending.length > 0 && (
          <table className={classes.table} aria-label={`Waiting to join ${team.name}`}>
            <thead>
              <tr>
                <th scope="col">Waiting to join</th>
                <th scope="col">Since</th>
                {manages && <th scope="col">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {team.pending.map((member) => {
                const name = nameOf(member);
                const asked = member.status === 'requested';
                return (
                  <tr key={member.user_id}>
                    <th scope="row">
                      <div className={classes.person}>
                        <span>{name}</span>
                        <BodyText tone="secondary">
                          {asked ? 'Asked to join' : 'Invited'}
                        </BodyText>
                      </div>
                    </th>
                    <td>{formatDateTime(new Date(member.since))}</td>
                    {manages && (
                      <td>
                        <Button
                          size="xs"
                          variant="secondary"
                          label={
                            asked
                              ? `Turn down the request of ${name}`
                              : `Withdraw the invitation for ${name}`
                          }
                          loading={pending === `drop:${member.user_id}`}
                          disabled={busy}
                          onClick={() =>
                            void run(`drop:${member.user_id}`, takeOut(member))
                          }
                        >
                          {asked ? 'Turn down' : 'Withdraw invitation'}
                        </Button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {confirm === null && refusal}
        <Modal
          opened={confirm?.kind === 'move'}
          onClose={() => ask(null)}
          title={`Move ${confirm?.kind === 'move' ? nameOf(confirm.member) : ''} out of ${team.name}?`}
        >
          {confirm?.kind === 'move' && (
            <div className={classes.form}>
              <Select
                label="Move to"
                value={target}
                placeholder="Choose a team"
                options={others.map((found) => ({
                  value: found.id,
                  label: found.name,
                }))}
                onChange={setTarget}
              />
              <BodyText>
                {nameOf(confirm.member)} stops reaching the submissions and questions of{' '}
                {team.name}
                {chosenTeam === undefined
                  ? '.'
                  : ` and reaches those of ${chosenTeam.name} instead.`}
              </BodyText>
              {refusal}
              <div className={classes.actions}>
                <Button
                  variant="danger"
                  disabled={chosenTeam === undefined}
                  loading={pending === 'move'}
                  onClick={() => {
                    if (chosenTeam === undefined) return;
                    void run('move', putIn(chosenTeam.id, confirm.member.user_id));
                  }}
                >
                  {chosenTeam === undefined ? 'Move' : `Move to ${chosenTeam.name}`}
                </Button>
                <Button variant="secondary" onClick={() => ask(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </Modal>
        <Modal
          opened={confirm?.kind === 'remove'}
          onClose={() => ask(null)}
          title={`Remove ${confirm?.kind === 'remove' ? nameOf(confirm.member) : ''} from ${team.name}?`}
        >
          {confirm?.kind === 'remove' && (
            <div className={classes.form}>
              <BodyText>
                {nameOf(confirm.member)} stops reaching the submissions and questions of{' '}
                {team.name} and submits on their own from then. What the team made stays
                the team’s.
              </BodyText>
              {removeOutcome(team, confirm.member) !== '' && (
                <BodyText>{removeOutcome(team, confirm.member)}</BodyText>
              )}
              {refusal}
              <div className={classes.actions}>
                <Button
                  variant="danger"
                  loading={pending === 'remove'}
                  onClick={() => void run('remove', takeOut(confirm.member))}
                >
                  {`Remove from ${team.name}`}
                </Button>
                <Button variant="secondary" onClick={() => ask(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </Modal>
        <Modal
          opened={confirm?.kind === 'add'}
          onClose={() => ask(null)}
          title={`Add a contestant to ${team.name}?`}
        >
          {confirm?.kind === 'add' && (
            <div className={classes.form}>
              {contestants.state === 'loading' && <PageSkeleton rows={2} />}
              {contestants.state === 'error' && (
                <ErrorBlock error={contestants.error} onRetry={contestants.retry} />
              )}
              {contestants.state === 'ready' && addable.length === 0 && (
                <BodyText>Every approved contestant is in this team already.</BodyText>
              )}
              {addable.length > 0 && (
                <Select
                  label="Contestant"
                  value={target}
                  placeholder="Choose an approved contestant"
                  options={addable.map((found) => {
                    const theirs = teamOf.get(found.user_id);
                    const username = found.user?.username ?? 'Deleted user';
                    return {
                      value: String(found.user_id),
                      label:
                        theirs === undefined
                          ? username
                          : `${username} (in ${theirs.name})`,
                    };
                  })}
                  onChange={setTarget}
                />
              )}
              {chosenPerson !== undefined && (
                <BodyText>
                  {chosenPerson.user?.username ?? 'Deleted user'} reaches the
                  submissions and questions of {team.name}
                  {personsTeam === undefined
                    ? '.'
                    : ` and stops reaching those of ${personsTeam.name}.`}
                </BodyText>
              )}
              {refusal}
              <div className={classes.actions}>
                <Button
                  variant="danger"
                  disabled={chosenPerson === undefined}
                  loading={pending === 'add'}
                  onClick={() => {
                    if (chosenPerson === undefined) return;
                    void run('add', putIn(team.id, chosenPerson.user_id));
                  }}
                >
                  {`Add to ${team.name}`}
                </Button>
                <Button variant="secondary" onClick={() => ask(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </Modal>
        <Modal
          opened={confirm?.kind === 'delete'}
          onClose={() => ask(null)}
          title={`Delete ${team.name}?`}
        >
          <div className={classes.form}>
            <BodyText>
              {team.members.length === 0
                ? 'Nobody is in it, and its invitations and requests go with it.'
                : 'Everyone in it stops reaching its work and submits on their own from then.'}
            </BodyText>
            {refusal}
            <div className={classes.actions}>
              <Button
                variant="danger"
                loading={pending === 'delete'}
                onClick={() =>
                  void run(
                    'delete',
                    () => drop.mutateAsync({ params: { path: here } }),
                    true,
                  )
                }
              >
                {`Delete ${team.name}`}
              </Button>
              <Button variant="secondary" onClick={() => ask(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </Modal>
      </section>
    </Card>
  );
}

/**
 * A refused team in words, a leader nobody has or who is not yet an approved
 * contestant said with their username.
 */
function CreateRefusal({ error, leader }: { error: unknown; leader: string }) {
  if (isApiError(error) && error.code === 'not_found' && leader !== '') {
    return <BodyText tone="secondary">Nobody has the username {leader}.</BodyText>;
  }
  if (isApiError(error) && error.code === 'not_approved' && leader !== '') {
    return (
      <BodyText tone="secondary">
        {leader} is not an approved contestant of this contest, so they cannot lead a
        team yet.
      </BodyText>
    );
  }
  return <ErrorBlock error={error} compact />;
}

/**
 * A new team's name and, if it is to have one, the username of the approved
 * contestant who leads it. The form keeps what was typed and says why when
 * the team is refused.
 */
function CreateTeam({ path }: { path: Path }) {
  const queryClient = useQueryClient();
  const create = $api.useMutation('post', EVERY, {
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: $api.queryOptions('get', EVERY, { params: { path } }).queryKey,
      }),
  });
  const [name, setName] = useState('');
  const [leader, setLeader] = useState('');
  const [tried, setTried] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [made, setMade] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (create.isPending) return;
    setMade(null);
    const found = teamNameProblem(name);
    setProblem(found);
    if (found !== null) return;
    const trimmed = leader.trim();
    setTried(trimmed);
    // The refusal is the mutation's `error`, shown below the button.
    create.mutate(
      {
        params: { path },
        body: { name: name.trim(), leader: trimmed === '' ? null : trimmed },
      },
      {
        onSuccess: (team) => {
          setName('');
          setLeader('');
          setMade(team.name);
        },
      },
    );
  };

  return (
    <form className={classes.form} aria-label="Make a team" onSubmit={submit}>
      <SectionTitle order={3}>Make a team</SectionTitle>
      <TextInput label="Team name" value={name} onChange={setName} required />
      {problem !== null && (
        <div role="alert">
          <BodyText tone="secondary">{problem}</BodyText>
        </div>
      )}
      <TextInput
        label="Leader"
        description="Optional. The username of an approved contestant who is in no team. Without one, the team starts empty."
        value={leader}
        onChange={setLeader}
        maxLength={USERNAME_MAX}
      />
      <div className={classes.actions}>
        <Button size="xs" type="submit" loading={create.isPending}>
          Make the team
        </Button>
      </div>
      {made !== null && (
        <div role="status">
          <BodyText tone="secondary">Made the team {made}.</BodyText>
        </div>
      )}
      {create.error !== null && (
        <div role="alert">
          <CreateRefusal error={create.error} leader={tried} />
        </div>
      )}
    </form>
  );
}

/**
 * Every team of one contest, for its organisers: each team's leader, its
 * members and the people asked in or asking. A manager also makes, mends and
 * deletes teams; an observer reads the list alone. The routes check each
 * role again underneath. Nothing pushes a change of team, so the list is read
 * again every half minute.
 */
export function TeamsPage() {
  const { org, contest } = useContestParams();
  const path = { org, contest };
  const manages = holdsAtContest(useMe().roles, org, contest, 'manager');
  const list = useRef<HTMLElement>(null);
  const view = queryView(
    $api.useQuery('get', EVERY, { params: { path } }, { refetchInterval: POLL_MS }),
  );
  const contestants = queryView(
    $api.useQuery('get', CONTESTANTS, { params: { path } }, { enabled: manages }),
  );

  return (
    <div className={classes.page}>
      <PageLink to={contestPath(org, contest)}>Back to the contest</PageLink>
      <PageTitle>Teams</PageTitle>
      <Card>
        <div className={classes.stack}>
          <BodyText tone="secondary">
            A contest has teams when its contest.yaml turns them on under teams, with
            enabled: true, and max_size says how many a team holds, three unless it says
            otherwise. Everyone in a team is an approved contestant first, and the
            team’s submissions, limits and questions are shared by everyone in it.
          </BodyText>
          {manages && <CreateTeam path={path} />}
        </div>
      </Card>
      <section ref={list} className={classes.stack} tabIndex={-1} aria-label="Teams">
        {view.state === 'loading' && <PageSkeleton rows={4} />}
        {view.state === 'error' && (
          <Card>
            <ErrorBlock error={view.error} onRetry={view.retry} />
          </Card>
        )}
        {view.state === 'ready' &&
          (view.data.length === 0 ? (
            <Card>
              <BodyText>Nobody has made a team yet.</BodyText>
            </Card>
          ) : (
            view.data.map((team) => (
              <TeamCard
                key={team.id}
                path={path}
                team={team}
                teams={view.data}
                contestants={contestants}
                manages={manages}
                onGone={() => list.current?.focus()}
              />
            ))
          ))}
      </section>
    </div>
  );
}
