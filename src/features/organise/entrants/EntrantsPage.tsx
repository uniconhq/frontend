import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useChange, type Change } from '@/api/change';
import { $api, queryView } from '@/api/query';
import type { EntrantStatus, OrganisedEntrant, OrganisedMember } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Checkbox } from '@/ui/Checkbox';
import { Modal } from '@/ui/Modal';
import { SectionTitle } from '@/ui/SectionTitle';
import { Select } from '@/ui/Select';
import { TextInput } from '@/ui/TextInput';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { Loaded } from '@/ui/feedback/Loaded';
import { useMe } from '@/session';
import { memberName, STATUS_WORD, wayText } from '@/lib/entrants';
import { useContestParams } from '@/lib/route-params';
import { CONTEST_SECTIONS, contestSectionPath, sectionOf } from '@/lib/sections';
import { teamNameProblem } from '@/lib/team-fields';
import { formatDateTime } from '@/lib/time';
import { PageLink } from '@/ui/PageLink';
import { useInviteChanges } from '../invites/invites';
import { holdsAtContest } from '../roles';
import { SectionPage } from '../SectionPage';
import { ENTRANTS, entrantsLine, useEntrants } from './names';
import classes from './entrants.module.css';

const ONE = `${ENTRANTS}/{entrant_id}` as const;
const REASON_MAX = 1000;
const LONGEST_EXTENSION_MINUTES = 365 * 24 * 60;
/** How often the list is read again, since nothing pushes a change of entrant. */
const POLL_MS = 30_000;
/** The address's filter, an entrant's status. */
const STATUS_PARAM = 'status';

/** The refusals that mean the list is behind: an entrant or a member moved on. */
const BEHIND = new Set([
  'wrong_status',
  'not_found',
  'entrant_has_submissions',
  'entrant_full',
  'in_entrant',
]);

const ORDER: EntrantStatus[] = [
  'pending',
  'approved',
  'rejected',
  'removed',
  'withdrawn',
];

type Path = { org: string; contest: string };

/** An extension in whole minutes, as the table shows it and the form starts from. */
function minutesOf(seconds: number): number {
  return Math.round(seconds / 60);
}

/** The minutes typed, when they are a whole number the server takes. */
function checkedMinutes(typed: string): number | null {
  const trimmed = typed.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const minutes = Number(trimmed);
  return minutes <= LONGEST_EXTENSION_MINUTES ? minutes : null;
}

function extensionText(entrant: OrganisedEntrant): string {
  if (entrant.time_extension <= 0) return '—';
  const minutes = `${String(minutesOf(entrant.time_extension))} min`;
  return entrant.extension_tasks === null
    ? `${minutes} on every task`
    : `${minutes} on ${entrant.extension_tasks.join(', ')}`;
}

/** A username, or an email address when what was typed has an `@`. */
function targetOf(typed: string): { username: string } | { email: string } {
  return typed.includes('@') ? { email: typed } : { username: typed };
}

/**
 * Who is in an entrant: each member with their email and the way they came
 * in by, and for a manager in a contest of teams, removing a member or
 * moving them to another entrant, each asked first in the manage dialog.
 */
function Members({ entrant }: { entrant: OrganisedEntrant }) {
  return (
    <ul className={classes.members} aria-label={`Members of ${entrant.display_name}`}>
      {entrant.members.map((member) => (
        <li key={member.user_id} className={classes.person}>
          <span>{memberName(member)}</span>
          {member.user?.email !== undefined && member.user.email !== null && (
            <BodyText tone="secondary" mono>
              {member.user.email}
            </BodyText>
          )}
          <BodyText tone="secondary">{wayText(member)}</BodyText>
        </li>
      ))}
      {entrant.invites.map((invited) => (
        <li key={invited.invite} className={classes.person}>
          <span>{invited.username ?? invited.email ?? 'Someone'}</span>
          <BodyText tone="secondary">
            Invited, not joined yet. The invite expires on{' '}
            {formatDateTime(new Date(invited.expires_at))}.
          </BodyText>
        </li>
      ))}
    </ul>
  );
}

/**
 * What a manager does with one entrant beyond deciding it: rename it (in a
 * contest of teams), give it extra time, ask someone straight into it, take a
 * member out or move them to another entrant, and delete one that has not
 * submitted. Each that takes away asks first, here in the dialog.
 */
function Manage({
  path,
  entrant,
  entrants,
  teams,
  change,
  onClose,
}: {
  path: Path;
  entrant: OrganisedEntrant;
  entrants: OrganisedEntrant[];
  teams: boolean;
  change: Change;
  onClose: () => void;
}) {
  const here = { ...path, entrant_id: entrant.id };
  const rename = $api.useMutation('put', `${ONE}/name` as const);
  const extend = $api.useMutation('put', `${ONE}/extension` as const);
  const removeMember = $api.useMutation('delete', `${ONE}/members/{user_id}` as const);
  const moveMember = $api.useMutation('post', `${ONE}/members/{user_id}/move` as const);
  const drop = $api.useMutation('delete', ONE);
  const { create } = useInviteChanges({ kind: 'contest', ...path });
  const tasks = $api.useQuery('get', '/api/v1/orgs/{org}/contests/{contest}/tasks', {
    params: { path },
  }).data;
  const [name, setName] = useState(entrant.name ?? '');
  const [minutes, setMinutes] = useState(String(minutesOf(entrant.time_extension)));
  const [only, setOnly] = useState<string[] | null>(entrant.extension_tasks);
  const [typed, setTyped] = useState('');
  const [asking, setAsking] = useState<
    | { kind: 'remove'; member: OrganisedMember }
    | { kind: 'move'; member: OrganisedMember; to: string }
    | { kind: 'delete' }
    | null
  >(null);
  const [said, setSaid] = useState<string | null>(null);
  const [refused, setRefused] = useState<unknown>(null);
  const busy = change.pending !== null;
  const others = entrants.filter((found) => found.id !== entrant.id);

  const run = async (key: string, made: () => Promise<unknown>, after?: string) => {
    setSaid(null);
    setRefused(null);
    const outcome = await change.run(key, made, { own: true });
    if (outcome.ok) {
      setAsking(null);
      if (after !== undefined) setSaid(after);
    } else if (outcome.error !== null) {
      setRefused(outcome.error);
    }
    return outcome.ok;
  };

  const submitName = (event: FormEvent) => {
    event.preventDefault();
    const problem = teamNameProblem(name);
    if (problem !== null) {
      setSaid(problem);
      return;
    }
    void run(
      'rename',
      () => rename.mutateAsync({ params: { path: here }, body: { name: name.trim() } }),
      'Renamed.',
    );
  };

  const submitExtension = (event: FormEvent) => {
    event.preventDefault();
    const checked = checkedMinutes(minutes);
    if (checked === null) {
      setSaid('Give a whole number of minutes, up to a year.');
      return;
    }
    void run(
      'extension',
      () =>
        extend.mutateAsync({
          params: { path: here },
          body: { seconds: checked * 60, tasks: only },
        }),
      checked === 0 ? 'The extra time is taken away.' : 'The extra time is saved.',
    );
  };

  const submitInvite = (event: FormEvent) => {
    event.preventDefault();
    const target = typed.trim();
    if (target === '') return;
    void run(
      'invite',
      async () => {
        await create('contestant', targetOf(target), entrant.id);
        setTyped('');
      },
      `Invited ${target}. They join ${entrant.display_name} once they accept.`,
    );
  };

  const deletable = !entrant.submitted;

  return (
    <div className={classes.stack}>
      {teams && (
        <form className={classes.inline} aria-label="Rename" onSubmit={submitName}>
          <TextInput label="Name" value={name} onChange={setName} maxLength={60} />
          <div className={classes.actions}>
            <Button
              size="xs"
              variant="secondary"
              type="submit"
              loading={change.pending === 'rename'}
              disabled={busy || name.trim() === (entrant.name ?? '')}
            >
              Rename
            </Button>
          </div>
        </form>
      )}
      <form
        className={classes.inline}
        aria-label="Extra time"
        onSubmit={submitExtension}
      >
        <TextInput
          label="Extra minutes"
          description="Moves the due and closing times of the tasks below. Enter 0 to take the extra time away."
          value={minutes}
          onChange={setMinutes}
          inputMode="decimal"
          required
        />
        <Checkbox
          label="On every task"
          checked={only === null}
          onChange={(every) => setOnly(every ? null : [])}
        />
        {only !== null &&
          (tasks ?? []).map((task) => (
            <Checkbox
              key={task.name}
              label={task.name}
              checked={only.includes(task.name)}
              onChange={(on) =>
                setOnly(
                  on ? [...only, task.name] : only.filter((name) => name !== task.name),
                )
              }
            />
          ))}
        <div className={classes.actions}>
          <Button
            size="xs"
            variant="secondary"
            type="submit"
            loading={change.pending === 'extension'}
            disabled={busy || (only !== null && only.length === 0)}
          >
            Save the extra time
          </Button>
        </div>
      </form>
      {teams && (
        <form
          className={classes.inline}
          aria-label="Invite someone into it"
          onSubmit={submitInvite}
        >
          <TextInput
            label="Invite someone into it"
            description="A username, or an email address for someone without an account. They join once they accept."
            value={typed}
            onChange={setTyped}
            maxLength={254}
          />
          <div className={classes.actions}>
            <Button
              size="xs"
              variant="secondary"
              type="submit"
              loading={change.pending === 'invite'}
              disabled={busy}
            >
              Invite
            </Button>
          </div>
        </form>
      )}
      {teams && entrant.members.length > 0 && (
        <div className={classes.stack}>
          <SectionTitle order={3}>Members</SectionTitle>
          <ul className={classes.members} aria-label="Members">
            {entrant.members.map((member) => {
              const who = memberName(member);
              return (
                <li key={member.user_id} className={classes.member}>
                  <span>{who}</span>
                  <div className={classes.actions}>
                    {others.length > 0 && (
                      <Button
                        size="xs"
                        variant="secondary"
                        label={`Move ${who}`}
                        disabled={busy}
                        onClick={() => setAsking({ kind: 'move', member, to: '' })}
                      >
                        Move
                      </Button>
                    )}
                    <Button
                      size="xs"
                      variant="danger"
                      label={`Take ${who} out`}
                      disabled={busy}
                      onClick={() => setAsking({ kind: 'remove', member })}
                    >
                      Take out
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {asking?.kind === 'remove' && (
        <div className={classes.panel} role="alert">
          <BodyText>
            Take {memberName(asking.member)} out of {entrant.display_name}? They lose
            access to its submissions and questions.
            {entrant.members.length === 1 && !entrant.submitted
              ? ' Nobody is left in it, so it is deleted.'
              : ''}
          </BodyText>
          <div className={classes.actions}>
            <Button
              size="xs"
              variant="danger"
              loading={change.pending === 'remove-member'}
              onClick={() =>
                void run('remove-member', () =>
                  removeMember.mutateAsync({
                    params: { path: { ...here, user_id: asking.member.user_id } },
                  }),
                ).then((ok) => {
                  if (ok && entrant.members.length === 1) onClose();
                })
              }
            >
              Take out
            </Button>
            <Button size="xs" variant="secondary" onClick={() => setAsking(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {asking?.kind === 'move' && (
        <div className={classes.panel} role="alert">
          <Select
            label={`Move ${memberName(asking.member)} to`}
            value={asking.to}
            placeholder="Choose an entrant"
            options={others.map((found) => ({
              value: found.id,
              label: found.display_name,
            }))}
            onChange={(to) => setAsking({ ...asking, to })}
          />
          <BodyText>
            They lose access to the submissions and questions of {entrant.display_name}
            {asking.to === ''
              ? '.'
              : ` and gain access to those of ${others.find((found) => found.id === asking.to)?.display_name ?? 'the other'} instead.`}
          </BodyText>
          <div className={classes.actions}>
            <Button
              size="xs"
              variant="danger"
              disabled={asking.to === ''}
              loading={change.pending === 'move'}
              onClick={() =>
                void run('move', () =>
                  moveMember.mutateAsync({
                    params: { path: { ...here, user_id: asking.member.user_id } },
                    body: { to: asking.to },
                  }),
                )
              }
            >
              Move
            </Button>
            <Button size="xs" variant="secondary" onClick={() => setAsking(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      <div className={classes.stack}>
        <SectionTitle order={3}>Delete</SectionTitle>
        {deletable ? (
          asking?.kind === 'delete' ? (
            <div className={classes.panel} role="alert">
              <BodyText>
                Delete {entrant.display_name}? Its registration and invites are removed,
                and its members are no longer entered in this contest.
              </BodyText>
              <div className={classes.actions}>
                <Button
                  size="xs"
                  variant="danger"
                  loading={change.pending === 'delete'}
                  onClick={() =>
                    void run('delete', () =>
                      drop.mutateAsync({ params: { path: here } }),
                    ).then((ok) => {
                      if (ok) onClose();
                    })
                  }
                >
                  Delete
                </Button>
                <Button size="xs" variant="secondary" onClick={() => setAsking(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className={classes.actions}>
              <Button
                size="xs"
                variant="danger"
                disabled={busy}
                onClick={() => setAsking({ kind: 'delete' })}
              >
                Delete this entrant
              </Button>
            </div>
          )
        ) : (
          <BodyText tone="secondary">
            It has submitted, so it stays with its results. Remove it instead to stop it
            submitting.
          </BodyText>
        )}
      </div>
      {said !== null && (
        <div role="status">
          <BodyText tone="secondary">{said}</BodyText>
        </div>
      )}
      {refused !== null && (
        <div role="alert">
          <ErrorBlock error={refused} compact />
        </div>
      )}
    </div>
  );
}

/**
 * One entrant: its name and members with the way each came in, where its
 * registration stands with the reason for a rejection, and its extension.
 * A manager decides it here: approve one waiting (not while it is short of
 * people), reject it with a reason its members read, undo a rejection, and
 * remove an approved one, asked first; and opens the rest in a dialog.
 * Each answer reads the list again and puts the focus back on the row.
 */
function Row({
  path,
  entrant,
  entrants,
  teams,
  manages,
}: {
  path: Path;
  entrant: OrganisedEntrant;
  entrants: OrganisedEntrant[];
  teams: boolean;
  manages: boolean;
}) {
  const queryClient = useQueryClient();
  const here = { ...path, entrant_id: entrant.id };
  const approve = $api.useMutation('post', `${ONE}/approve` as const);
  const reject = $api.useMutation('post', `${ONE}/reject` as const);
  const reopen = $api.useMutation('post', `${ONE}/reopen` as const);
  const remove = $api.useMutation('post', `${ONE}/remove` as const);
  const row = useRef<HTMLTableRowElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const change = useChange({
    reread: () =>
      queryClient.invalidateQueries({
        queryKey: $api.queryOptions('get', ENTRANTS, { params: { path } }).queryKey,
      }),
    behind: BEHIND,
    focus: row,
  });
  const [open, setOpen] = useState<'reject' | 'remove' | 'manage' | null>(null);
  const [reason, setReason] = useState('');
  const name = entrant.display_name;
  const { pending, error } = change;

  useEffect(() => {
    if (open === 'reject') field.current?.focus();
  }, [open]);

  const show = (next: typeof open) => {
    change.dismiss();
    setOpen(next);
  };

  const decide = async (key: string, made: () => Promise<unknown>) => {
    const outcome = await change.run(key, made);
    if (outcome.ok) setOpen(null);
  };

  return (
    <tr ref={row} tabIndex={-1}>
      <th scope="row">
        <div className={classes.person}>
          {teams && <strong>{name}</strong>}
          <Members entrant={entrant} />
        </div>
      </th>
      <td>
        <div className={classes.person}>
          <span>{STATUS_WORD[entrant.status]}</span>
          {entrant.reason !== null && (
            <BodyText tone="secondary">{entrant.reason}</BodyText>
          )}
          {!entrant.complete && entrant.status === 'pending' && (
            <BodyText tone="secondary">Too few members to be approved yet.</BodyText>
          )}
          {teams && entrant.locked && <BodyText tone="secondary">Team fixed</BodyText>}
          <BodyText tone="meta">
            Registered {formatDateTime(new Date(entrant.registered_at))}
          </BodyText>
        </div>
      </td>
      <td>{extensionText(entrant)}</td>
      {manages && (
        <td>
          <div className={classes.actions}>
            {entrant.status === 'pending' && (
              <>
                <Button
                  size="xs"
                  label={`Approve ${name}`}
                  loading={pending === 'approve'}
                  disabled={!entrant.complete}
                  onClick={() =>
                    void decide('approve', () =>
                      approve.mutateAsync({ params: { path: here } }),
                    )
                  }
                >
                  Approve
                </Button>
                <Button
                  size="xs"
                  variant="secondary"
                  label={`Reject ${name}`}
                  onClick={() => show('reject')}
                >
                  Reject
                </Button>
              </>
            )}
            {entrant.status === 'rejected' && (
              <Button
                size="xs"
                variant="secondary"
                label={`Undo the rejection of ${name}`}
                loading={pending === 'reopen'}
                onClick={() =>
                  void decide('reopen', () =>
                    reopen.mutateAsync({ params: { path: here } }),
                  )
                }
              >
                Undo rejection
              </Button>
            )}
            {entrant.status === 'approved' && (
              <Button
                size="xs"
                variant="danger"
                label={`Remove ${name}`}
                onClick={() => show('remove')}
              >
                Remove
              </Button>
            )}
            <Button
              size="xs"
              variant="secondary"
              label={`Manage ${name}`}
              onClick={() => show('manage')}
            >
              Manage
            </Button>
          </div>
          {open === 'reject' && (
            <form
              className={classes.inline}
              aria-label={`Reject ${name}`}
              onSubmit={(event) => {
                event.preventDefault();
                void decide('reject', () =>
                  reject.mutateAsync({ params: { path: here }, body: { reason } }),
                );
              }}
            >
              <TextInput
                ref={field}
                label="Reason"
                description="Its members read this on the contest's page."
                value={reason}
                onChange={setReason}
                maxLength={REASON_MAX}
                required
              />
              <div className={classes.actions}>
                <Button size="xs" type="submit" loading={pending === 'reject'}>
                  Reject
                </Button>
                <Button size="xs" variant="secondary" onClick={() => show(null)}>
                  Cancel
                </Button>
              </div>
            </form>
          )}
          {error !== null && open !== 'remove' && open !== 'manage' && (
            <div role="alert">
              <ErrorBlock error={error} compact />
            </div>
          )}
          <Modal
            opened={open === 'remove'}
            onClose={() => show(null)}
            title={`Remove ${name}?`}
          >
            <div className={classes.inline}>
              <BodyText>
                {teams ? 'Its members' : name} can no longer submit or ask. What was
                submitted stays, and so does its place on the leaderboards.
              </BodyText>
              {error !== null && (
                <div role="alert">
                  <ErrorBlock error={error} compact />
                </div>
              )}
              <div className={classes.actions}>
                <Button
                  variant="danger"
                  loading={pending === 'remove'}
                  onClick={() =>
                    void decide('remove', () =>
                      remove.mutateAsync({ params: { path: here } }),
                    )
                  }
                >
                  Remove
                </Button>
                <Button variant="secondary" onClick={() => show(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          </Modal>
          <Modal
            opened={open === 'manage'}
            onClose={() => show(null)}
            title={`Manage ${name}`}
          >
            {open === 'manage' && (
              <Manage
                path={path}
                entrant={entrant}
                entrants={entrants}
                teams={teams}
                change={change}
                onClose={() => show(null)}
              />
            )}
          </Modal>
        </td>
      )}
    </tr>
  );
}

/**
 * Every entrant of one contest, for its organisers: each row an entrant,
 * one person or a team, with its members and the way each came in, where
 * its registration stands, its extension and, for a manager, its actions; an
 * observer reads the table alone. The list filters by status, kept in the
 * page's address. Invites to enter are made under How people enter.
 */
export function EntrantsPage() {
  const { org, contest } = useContestParams();
  const path = { org, contest };
  const manages = holdsAtContest(useMe().roles, org, contest, 'manager');
  const [search, setSearch] = useSearchParams();
  const status = search.get(STATUS_PARAM);
  const view = queryView(useEntrants(org, contest, { every: POLL_MS }));

  const filter = (value: string) => {
    const next = new URLSearchParams(search);
    if (value === '') next.delete(STATUS_PARAM);
    else next.set(STATUS_PARAM, value);
    setSearch(next);
  };

  return (
    <SectionPage
      section={sectionOf(CONTEST_SECTIONS, 'entrants')}
      links={
        <PageLink to={contestSectionPath(org, contest, 'entry')}>
          How people enter
        </PageLink>
      }
    >
      <Card>
        <Loaded view={view} rows={4}>
          {(entrants) => {
            const teams = entrants.some((entrant) => entrant.name !== null);
            const shown =
              status === null
                ? entrants
                : entrants.filter((entrant) => entrant.status === status);
            const options = ORDER.map((value) => ({
              value,
              label: `${STATUS_WORD[value]} (${String(entrants.filter((one) => one.status === value).length)})`,
            }));
            return (
              <div className={classes.stack}>
                <BodyText>{entrantsLine(entrants)}</BodyText>
                {entrants.length > 0 && (
                  <div className={classes.filters}>
                    <Select
                      label="Show"
                      value={status ?? ''}
                      options={options}
                      placeholder={`Every entrant (${String(entrants.length)})`}
                      onChange={filter}
                    />
                  </div>
                )}
                {entrants.length > 0 &&
                  (shown.length === 0 ? (
                    <BodyText tone="secondary">No entrants have this status.</BodyText>
                  ) : (
                    <div className={classes.scroll}>
                      <table className={classes.table} aria-label="Entrants">
                        <thead>
                          <tr>
                            <th scope="col">{teams ? 'Entrant' : 'Person'}</th>
                            <th scope="col">Registration</th>
                            <th scope="col">Extra time</th>
                            {manages && <th scope="col">Actions</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {shown.map((entrant) => (
                            <Row
                              key={entrant.id}
                              path={path}
                              entrant={entrant}
                              entrants={entrants}
                              teams={teams}
                              manages={manages}
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
              </div>
            );
          }}
        </Loaded>
      </Card>
    </SectionPage>
  );
}
