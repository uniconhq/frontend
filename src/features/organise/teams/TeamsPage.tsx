import { useRef, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { $api, queryView } from '@/api/query';
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
import { formatDateTime } from '@/lib/time';
import { t } from '@/lib/t';
import { holdsAtContest } from '../roles';
import classes from './teams.module.css';

const EVERY = '/api/v1/orgs/{org}/contests/{contest}/organise/teams';
const ONE = '/api/v1/orgs/{org}/contests/{contest}/organise/teams/{team_id}';

/** The most characters a team's name takes, as the forge has it. */
const NAME_MAX = 60;

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
  return member.user?.username ?? t('Deleted user');
}

/** The approved contestants, the people a manager may add to a team. */
function approvedOf(contestants: Contestant[] | undefined): Contestant[] {
  return (contestants ?? []).filter((found) => found.status === 'approved');
}

/** What removing someone does beyond taking them out, said before it is done. */
function removeOutcome(team: Team, member: TeamMember): string {
  const others = team.members.filter((found) => found.user_id !== member.user_id);
  if (others.length === 0) {
    return team.submitted
      ? t('Nobody is left in it, and the team stays with its results.')
      : t('Nobody is left in it, so the team is deleted.');
  }
  return team.leader === member.user_id
    ? t('The lead passes to the member who joined earliest.')
    : '';
}

/**
 * A team for its organisers: its members with when each joined, the people
 * asked in or asking, and whether it has submitted. A manager makes a member
 * the leader, moves one to another team, removes one, adds an approved
 * contestant, turns down a request or takes back an invitation, and deletes
 * a team that has submitted nothing. Each change that moves someone in or
 * out asks first, naming the team, since it changes who reaches that team's
 * work. A refusal shows where it was made, and one that shows the list was
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
  contestants: Contestant[];
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
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const card = useRef<HTMLElement>(null);
  const listKey = $api.queryOptions('get', EVERY, { params: { path } }).queryKey;
  const here = { ...path, team_id: team.id };
  const busy = pending !== null;
  const others = teams.filter((found) => found.id !== team.id);
  const leader = team.members.find((member) => member.user_id === team.leader);

  const teamOf = new Map(
    teams.flatMap((found) =>
      found.members.map((member) => [member.user_id, found] as const),
    ),
  );
  const addable = contestants.filter(
    (found) => teamOf.get(found.user_id)?.id !== team.id,
  );

  const ask = (next: Confirm | null) => {
    setError(null);
    setTarget('');
    setConfirm(next);
  };

  const run = async (key: string, change: () => Promise<unknown>, gone = false) => {
    if (busy) return;
    setPending(key);
    setError(null);
    try {
      await change();
    } catch (refused) {
      setError(refused);
      if (isApiError(refused) && BEHIND.has(refused.code)) {
        await queryClient.invalidateQueries({ queryKey: listKey });
      }
      setPending(null);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: listKey });
    setPending(null);
    setConfirm(null);
    if (gone) onGone();
    else card.current?.focus();
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
              {leader === undefined
                ? t('No leader.')
                : `${t('Led by')} ${nameOf(leader)}.`}{' '}
              {team.members.length} {t('in it.')}{' '}
              {team.submitted ? t('It has submitted.') : t('It has not submitted yet.')}
            </BodyText>
          </div>
          {manages && (
            <div className={classes.actions}>
              <Button
                size="xs"
                variant="secondary"
                label={`${t('Add a contestant to')} ${team.name}`}
                disabled={busy}
                onClick={() => ask({ kind: 'add' })}
              >
                {t('Add a contestant')}
              </Button>
              <Button
                size="xs"
                variant="danger"
                label={`${t('Delete')} ${team.name}`}
                disabled={busy || team.submitted}
                onClick={() => ask({ kind: 'delete' })}
              >
                {t('Delete')}
              </Button>
            </div>
          )}
        </div>
        {manages && team.submitted && (
          <BodyText tone="secondary">
            {t(
              'A team that has submitted stays with its results, so it is not deleted.',
            )}
          </BodyText>
        )}
        {team.members.length === 0 ? (
          <BodyText tone="secondary">{t('Nobody is in this team.')}</BodyText>
        ) : (
          <table
            className={classes.table}
            aria-label={`${t('Members of')} ${team.name}`}
          >
            <thead>
              <tr>
                <th scope="col">{t('Member')}</th>
                <th scope="col">{t('Joined')}</th>
                {manages && <th scope="col">{t('Actions')}</th>}
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
                        {leads && <BodyText tone="secondary">{t('Leader')}</BodyText>}
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
                              label={`${t('Make')} ${name} ${t('the leader')}`}
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
                              {t('Make leader')}
                            </Button>
                          )}
                          {others.length > 0 && (
                            <Button
                              size="xs"
                              variant="secondary"
                              label={`${t('Move')} ${name}`}
                              disabled={busy}
                              onClick={() => ask({ kind: 'move', member })}
                            >
                              {t('Move')}
                            </Button>
                          )}
                          <Button
                            size="xs"
                            variant="danger"
                            label={`${t('Remove')} ${name}`}
                            disabled={busy}
                            onClick={() => ask({ kind: 'remove', member })}
                          >
                            {t('Remove')}
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
          <table
            className={classes.table}
            aria-label={`${t('Waiting to join')} ${team.name}`}
          >
            <thead>
              <tr>
                <th scope="col">{t('Waiting to join')}</th>
                <th scope="col">{t('Since')}</th>
                {manages && <th scope="col">{t('Actions')}</th>}
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
                          {asked ? t('Asked to join') : t('Invited')}
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
                              ? `${t('Turn down the request of')} ${name}`
                              : `${t('Withdraw the invitation for')} ${name}`
                          }
                          loading={pending === `drop:${member.user_id}`}
                          disabled={busy}
                          onClick={() =>
                            void run(`drop:${member.user_id}`, takeOut(member))
                          }
                        >
                          {asked ? t('Turn down') : t('Withdraw invitation')}
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
          title={`${t('Move')} ${confirm?.kind === 'move' ? nameOf(confirm.member) : ''} ${t('out of')} ${team.name}?`}
        >
          {confirm?.kind === 'move' && (
            <div className={classes.form}>
              <Select
                label={t('Move to')}
                value={target}
                placeholder={t('Choose a team')}
                options={others.map((found) => ({
                  value: found.id,
                  label: found.name,
                }))}
                onChange={setTarget}
              />
              <BodyText>
                {nameOf(confirm.member)}{' '}
                {t('stops reaching the submissions and questions of')} {team.name}
                {chosenTeam === undefined
                  ? '.'
                  : ` ${t('and reaches those of')} ${chosenTeam.name} ${t('instead.')}`}
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
                  {chosenTeam === undefined
                    ? t('Move')
                    : `${t('Move to')} ${chosenTeam.name}`}
                </Button>
                <Button variant="secondary" onClick={() => ask(null)}>
                  {t('Cancel')}
                </Button>
              </div>
            </div>
          )}
        </Modal>
        <Modal
          opened={confirm?.kind === 'remove'}
          onClose={() => ask(null)}
          title={`${t('Remove')} ${confirm?.kind === 'remove' ? nameOf(confirm.member) : ''} ${t('from')} ${team.name}?`}
        >
          {confirm?.kind === 'remove' && (
            <div className={classes.form}>
              <BodyText>
                {nameOf(confirm.member)}{' '}
                {t('stops reaching the submissions and questions of')} {team.name}{' '}
                {t(
                  'and submits on their own from then. What the team made stays the team’s.',
                )}
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
                  {`${t('Remove from')} ${team.name}`}
                </Button>
                <Button variant="secondary" onClick={() => ask(null)}>
                  {t('Cancel')}
                </Button>
              </div>
            </div>
          )}
        </Modal>
        <Modal
          opened={confirm?.kind === 'add'}
          onClose={() => ask(null)}
          title={`${t('Add a contestant to')} ${team.name}?`}
        >
          {confirm?.kind === 'add' && (
            <div className={classes.form}>
              {addable.length === 0 ? (
                <BodyText>
                  {t('Every approved contestant is in this team already.')}
                </BodyText>
              ) : (
                <Select
                  label={t('Contestant')}
                  value={target}
                  placeholder={t('Choose an approved contestant')}
                  options={addable.map((found) => {
                    const theirs = teamOf.get(found.user_id);
                    const username = found.user?.username ?? t('Deleted user');
                    return {
                      value: String(found.user_id),
                      label:
                        theirs === undefined
                          ? username
                          : `${username} (${t('in')} ${theirs.name})`,
                    };
                  })}
                  onChange={setTarget}
                />
              )}
              {chosenPerson !== undefined && (
                <BodyText>
                  {chosenPerson.user?.username ?? t('Deleted user')}{' '}
                  {t('reaches the submissions and questions of')} {team.name}
                  {personsTeam === undefined
                    ? '.'
                    : ` ${t('and stops reaching those of')} ${personsTeam.name}.`}
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
                  {`${t('Add to')} ${team.name}`}
                </Button>
                <Button variant="secondary" onClick={() => ask(null)}>
                  {t('Cancel')}
                </Button>
              </div>
            </div>
          )}
        </Modal>
        <Modal
          opened={confirm?.kind === 'delete'}
          onClose={() => ask(null)}
          title={`${t('Delete')} ${team.name}?`}
        >
          <div className={classes.form}>
            <BodyText>
              {team.members.length === 0
                ? t('Nobody is in it, and its invitations and requests go with it.')
                : t(
                    'Everyone in it stops reaching its work and submits on their own from then.',
                  )}
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
                {`${t('Delete')} ${team.name}`}
              </Button>
              <Button variant="secondary" onClick={() => ask(null)}>
                {t('Cancel')}
              </Button>
            </div>
          </div>
        </Modal>
      </section>
    </Card>
  );
}

/**
 * A new team's name and, if it is to have one, the username of the approved
 * contestant who leads it. The form keeps what was typed and says why when
 * the team is refused.
 */
function CreateTeam({ path }: { path: Path }) {
  const queryClient = useQueryClient();
  const create = $api.useMutation('post', EVERY);
  const [name, setName] = useState('');
  const [leader, setLeader] = useState('');
  const [made, setMade] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMade(null);
    const trimmed = leader.trim();
    try {
      const team = await create.mutateAsync({
        params: { path },
        body: { name: name.trim(), leader: trimmed === '' ? null : trimmed },
      });
      setName('');
      setLeader('');
      setMade(team.name);
    } catch {
      // The refusal is the mutation's `error`, shown below the button.
      return;
    }
    await queryClient.invalidateQueries({
      queryKey: $api.queryOptions('get', EVERY, { params: { path } }).queryKey,
    });
  };

  return (
    <form
      className={classes.form}
      aria-label={t('Make a team')}
      onSubmit={(event) => void submit(event)}
    >
      <SectionTitle order={3}>{t('Make a team')}</SectionTitle>
      <TextInput
        label={t('Team name')}
        value={name}
        onChange={setName}
        maxLength={NAME_MAX}
        required
      />
      <TextInput
        label={t('Leader')}
        description={t(
          'Optional. The username of an approved contestant who is in no team. Without one, the team starts empty.',
        )}
        value={leader}
        onChange={setLeader}
      />
      <div className={classes.actions}>
        <Button size="xs" type="submit" loading={create.isPending}>
          {t('Make the team')}
        </Button>
      </div>
      {made !== null && (
        <div role="status">
          <BodyText tone="secondary">
            {t('Made the team')} {made}.
          </BodyText>
        </div>
      )}
      {create.error !== null && (
        <div role="alert">
          <ErrorBlock error={create.error} compact />
        </div>
      )}
    </form>
  );
}

/**
 * Every team of one contest, for its organisers: each team's leader, its
 * members and the people asked in or asking. A manager also makes, mends and
 * deletes teams; an observer reads the list alone. The routes check each
 * role again underneath.
 */
export function TeamsPage() {
  const { org, contest } = useContestParams();
  const path = { org, contest };
  const manages = holdsAtContest(useMe().roles, org, contest, 'manager');
  const list = useRef<HTMLDivElement>(null);
  const view = queryView($api.useQuery('get', EVERY, { params: { path } }));
  const contestants = $api.useQuery(
    'get',
    '/api/v1/orgs/{org}/contests/{contest}/contestants',
    { params: { path } },
    { enabled: manages },
  );
  const approved = approvedOf(contestants.data);

  return (
    <div className={classes.page}>
      <PageLink to={contestPath(org, contest)}>{t('Back to the contest')}</PageLink>
      <PageTitle>{t('Teams')}</PageTitle>
      <Card>
        <div className={classes.stack}>
          <BodyText tone="secondary">
            {t(
              'A contest has teams when its contest.yaml turns them on under teams, with enabled: true, and max_size says how many a team holds, three unless it says otherwise. Everyone in a team is an approved contestant first, and the team’s submissions, limits and questions are shared by everyone in it.',
            )}
          </BodyText>
          {manages && <CreateTeam path={path} />}
        </div>
      </Card>
      <div ref={list} className={classes.stack} tabIndex={-1} aria-label={t('Teams')}>
        {view.state === 'loading' && <PageSkeleton rows={4} />}
        {view.state === 'error' && (
          <Card>
            <ErrorBlock error={view.error} onRetry={view.retry} />
          </Card>
        )}
        {view.state === 'ready' &&
          (view.data.length === 0 ? (
            <Card>
              <BodyText>{t('Nobody has made a team yet.')}</BodyText>
            </Card>
          ) : (
            view.data.map((team) => (
              <TeamCard
                key={team.id}
                path={path}
                team={team}
                teams={view.data}
                contestants={approved}
                manages={manages}
                onGone={() => list.current?.focus()}
              />
            ))
          ))}
      </div>
    </div>
  );
}
