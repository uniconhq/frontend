import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { isApiError } from '@/api/problem';
import { SaveOutcome, type Outcome } from '../files/SaveOutcome';
import { useChange, type Change } from '@/api/change';
import { $api, queryView } from '@/api/query';
import type { EntrantStatus, OrganisedEntrant, OrganisedMember } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Checkbox } from '@/ui/Checkbox';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { InviteForm } from '@/ui/InviteForm';
import { Modal } from '@/ui/Modal';
import { SectionTitle } from '@/ui/SectionTitle';
import { Select } from '@/ui/Select';
import { TextInput } from '@/ui/TextInput';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { Loaded } from '@/ui/feedback/Loaded';
import { memberName, STATUS_WORD, wayText } from '@/lib/entrants';
import { useContestParams } from '@/lib/route-params';
import { CONTEST_SECTIONS, contestSectionPath, sectionOf } from '@/lib/sections';
import { formatDateTime } from '@/lib/time';
import { PageLink } from '@/ui/PageLink';
import { Group, Stack } from '@/ui/layout';
import { useInviteChanges } from '../invites/invites';
import { usePlaceMay } from '../may';
import { SectionPage } from '../SectionPage';
import { ENTRANTS, entrantsLine, useEntrants } from './names';
import tableClasses from '@/ui/table.module.css';
import classes from './entrants.module.css';

const ONE = `${ENTRANTS}/{entrant_id}` as const;
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

/** The minutes typed, when they are a whole number. */
function checkedMinutes(typed: string): number | null {
  const trimmed = typed.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : null;
}

function extensionText(entrant: OrganisedEntrant): string {
  if (entrant.time_extension <= 0) return '—';
  const minutes = `${String(minutesOf(entrant.time_extension))} min`;
  return entrant.extension_tasks === null
    ? `${minutes} on every task`
    : `${minutes} on ${entrant.extension_tasks.join(', ')}`;
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
  const [extensionOutcome, setExtensionOutcome] = useState<Outcome<{
    seconds: number;
    tasks: string[] | null;
    confirm?: boolean;
  }> | null>(null);
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
    void run(
      'rename',
      () => rename.mutateAsync({ params: { path: here }, body: { name: name.trim() } }),
      'Renamed.',
    );
  };

  const sendExtension = async (body: {
    seconds: number;
    tasks: string[] | null;
    confirm?: boolean;
  }) => {
    setExtensionOutcome(null);
    await run('extension', async () => {
      try {
        await extend.mutateAsync({
          params: { path: here },
          body: { confirm: false, ...body },
        });
      } catch (error) {
        if (isApiError(error) && error.code === 'confirmation_required') {
          setExtensionOutcome({ kind: 'refused', error, body });
          return;
        }
        throw error;
      }
      setSaid(
        body.seconds === 0
          ? 'The extra time is taken away.'
          : 'The extra time is saved.',
      );
    });
  };

  const submitExtension = (event: FormEvent) => {
    event.preventDefault();
    const checked = checkedMinutes(minutes);
    if (checked === null) {
      setSaid('Give a whole number of minutes.');
      return;
    }
    void sendExtension({ seconds: checked * 60, tasks: only });
  };

  const deletable = !entrant.submitted;

  return (
    <Stack gap="sm">
      {extensionOutcome !== null && (
        <SaveOutcome
          outcome={extensionOutcome}
          bare
          onConfirm={(body) => void sendExtension({ ...body, confirm: true })}
          onCancel={() => setExtensionOutcome(null)}
          onReload={() => setExtensionOutcome(null)}
        />
      )}
      {teams && (
        <form className={classes.inline} aria-label="Rename" onSubmit={submitName}>
          <TextInput label="Name" value={name} onChange={setName} />
          <Group gap={6} align="stretch">
            <Button
              size="xs"
              variant="secondary"
              type="submit"
              loading={change.pending === 'rename'}
              disabled={busy || name.trim() === (entrant.name ?? '')}
            >
              Rename
            </Button>
          </Group>
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
        <Group gap={6} align="stretch">
          <Button
            size="xs"
            variant="secondary"
            type="submit"
            loading={change.pending === 'extension'}
            disabled={busy || (only !== null && only.length === 0)}
          >
            Save the extra time
          </Button>
        </Group>
      </form>
      {teams && (
        <InviteForm
          name="Invite someone into it"
          className={classes.inline}
          label="Invite someone into it"
          size="xs"
          variant="secondary"
          loading={change.pending === 'invite'}
          blocked={busy}
          onInvite={(target, typed) =>
            run(
              'invite',
              () => create('contestant', target, entrant.id),
              `Invited ${typed}. They join ${entrant.display_name} once they accept.`,
            )
          }
        />
      )}
      {teams && entrant.members.length > 0 && (
        <Stack gap="sm">
          <SectionTitle order={3}>Members</SectionTitle>
          <ul className={classes.members} aria-label="Members">
            {entrant.members.map((member) => {
              const who = memberName(member);
              return (
                <li key={member.user_id} className={classes.member}>
                  <span>{who}</span>
                  <Group gap={6} align="stretch">
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
                  </Group>
                </li>
              );
            })}
          </ul>
        </Stack>
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
          <Group gap={6} align="stretch">
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
          </Group>
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
          <Group gap={6} align="stretch">
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
          </Group>
        </div>
      )}
      <Stack gap="sm">
        <SectionTitle order={3}>Delete</SectionTitle>
        {deletable ? (
          asking?.kind === 'delete' ? (
            <div className={classes.panel} role="alert">
              <BodyText>
                Delete {entrant.display_name}? Its registration and invites are removed,
                and its members are no longer entered in this contest.
              </BodyText>
              <Group gap={6} align="stretch">
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
              </Group>
            </div>
          ) : (
            <Group gap={6} align="stretch">
              <Button
                size="xs"
                variant="danger"
                disabled={busy}
                onClick={() => setAsking({ kind: 'delete' })}
              >
                Delete this entrant
              </Button>
            </Group>
          )
        ) : (
          <BodyText tone="secondary">
            It has submitted, so it stays with its results. Remove it instead to stop it
            submitting.
          </BodyText>
        )}
      </Stack>
      {said !== null && (
        <div role="status">
          <BodyText tone="secondary">{said}</BodyText>
        </div>
      )}
      {refused !== null && (
        <ErrorBlock error={refused} compact alert heading="Couldn’t do that" />
      )}
    </Stack>
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
  // What the row's dialog changes, named on its button rather than a bare "Manage".
  const changes = teams ? 'name, members and extra time' : 'extra time';

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
          <Group gap={6} align="stretch">
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
              label={`Change the ${changes} of ${name}`}
              onClick={() => show('manage')}
            >
              {teams ? 'Name, members, extra time' : 'Extra time'}
            </Button>
          </Group>
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
                required
              />
              <Group gap={6} align="stretch">
                <Button size="xs" type="submit" loading={pending === 'reject'}>
                  Reject
                </Button>
                <Button size="xs" variant="secondary" onClick={() => show(null)}>
                  Cancel
                </Button>
              </Group>
            </form>
          )}
          {error !== null && open !== 'remove' && open !== 'manage' && (
            <ErrorBlock error={error} compact alert heading="Couldn’t do that" />
          )}
          <ConfirmDialog
            opened={open === 'remove'}
            onClose={() => show(null)}
            title={`Remove ${name}?`}
            confirm="Remove"
            variant="danger"
            loading={pending === 'remove'}
            error={error}
            refused="Couldn’t do that"
            onConfirm={() =>
              void decide('remove', () =>
                remove.mutateAsync({ params: { path: here } }),
              )
            }
          >
            <BodyText>
              {teams ? 'Its members' : name} can no longer submit or ask. What was
              submitted stays, and so does its place on the leaderboards.
            </BodyText>
          </ConfirmDialog>
          <Modal
            opened={open === 'manage'}
            onClose={() => show(null)}
            title={`${name}: ${changes}`}
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
  const manages = usePlaceMay({ kind: 'contest', org, contest }).manage;
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
              <Stack gap="sm">
                <BodyText>{entrantsLine(entrants)}</BodyText>
                {entrants.length > 0 && (
                  <Group gap="sm" align="flex-end">
                    <Select
                      label="Show"
                      value={status ?? ''}
                      options={options}
                      placeholder={`Every entrant (${String(entrants.length)})`}
                      onChange={filter}
                    />
                  </Group>
                )}
                {entrants.length > 0 &&
                  (shown.length === 0 ? (
                    <BodyText tone="secondary">No entrants have this status.</BodyText>
                  ) : (
                    <div className={tableClasses.scroll}>
                      <table className={tableClasses.table} aria-label="Entrants">
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
              </Stack>
            );
          }}
        </Loaded>
      </Card>
    </SectionPage>
  );
}
