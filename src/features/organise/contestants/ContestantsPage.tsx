import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { $api, queryView } from '@/api/query';
import { isApiError } from '@/api/problem';
import type { Contestant } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Modal } from '@/ui/Modal';
import { PageLink } from '@/ui/PageLink';
import { PageTitle } from '@/ui/PageTitle';
import { SectionTitle } from '@/ui/SectionTitle';
import { TextInput } from '@/ui/TextInput';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { useMe } from '@/session';
import { contestPath } from '@/lib/organiser-paths';
import { useContestParams } from '@/lib/route-params';
import { formatDateTime } from '@/lib/time';
import { t } from '@/lib/t';
import { holdsAtContest } from '../roles';
import { InvitesSection } from '../invites/InvitesSection';
import classes from './contestants.module.css';

const REASON_MAX = 1000;
const LONGEST_EXTENSION_MINUTES = 365 * 24 * 60;

const STATUS: Record<Contestant['status'], string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
  removed: 'Removed',
};

type Action = 'reject' | 'remove' | 'extension';

function who(contestant: Contestant): string {
  return contestant.user?.username ?? t('Deleted user');
}

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

/**
 * One registration and, for a manager, the actions its status allows: approve
 * or reject one that is pending, undo the rejection of one that is rejected,
 * which leaves it pending again, remove one that is approved, and give
 * either extra time. Each answer replaces the row with what the server now holds and
 * puts the focus back on the row. A refusal is shown where the action was
 * taken, and a registration that moved on under the organiser is read again.
 */
function Row({
  org,
  contest,
  contestant,
  manages,
}: {
  org: string;
  contest: string;
  contestant: Contestant;
  manages: boolean;
}) {
  const queryClient = useQueryClient();
  const listKey = $api.queryOptions(
    'get',
    '/api/v1/orgs/{org}/contests/{contest}/contestants',
    {
      params: { path: { org, contest } },
    },
  ).queryKey;
  const path = { org, contest, user_id: contestant.user_id };
  const approve = $api.useMutation(
    'post',
    '/api/v1/orgs/{org}/contests/{contest}/contestants/{user_id}/approve',
  );
  const reject = $api.useMutation(
    'post',
    '/api/v1/orgs/{org}/contests/{contest}/contestants/{user_id}/reject',
  );
  const reopen = $api.useMutation(
    'post',
    '/api/v1/orgs/{org}/contests/{contest}/contestants/{user_id}/reopen',
  );
  const remove = $api.useMutation(
    'post',
    '/api/v1/orgs/{org}/contests/{contest}/contestants/{user_id}/remove',
  );
  const extend = $api.useMutation(
    'put',
    '/api/v1/orgs/{org}/contests/{contest}/contestants/{user_id}/extension',
  );
  const [open, setOpen] = useState<Action | null>(null);
  const [reason, setReason] = useState('');
  const [minutes, setMinutes] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [unreadable, setUnreadable] = useState(false);
  const row = useRef<HTMLTableRowElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const name = who(contestant);

  useEffect(() => {
    if (open === 'reject' || open === 'extension') field.current?.focus();
  }, [open]);

  const show = (action: Action | null) => {
    setError(null);
    setUnreadable(false);
    setOpen(action);
  };

  const run = async (action: () => Promise<Contestant>) => {
    try {
      const updated = await action();
      queryClient.setQueryData<Contestant[]>(listKey, (rows) =>
        rows?.map((found) => (found.user_id === updated.user_id ? updated : found)),
      );
      show(null);
      row.current?.focus();
    } catch (refused) {
      setError(refused);
      if (isApiError(refused) && refused.code === 'wrong_status') {
        await queryClient.invalidateQueries({ queryKey: listKey });
      }
    }
  };

  const submitReason = (event: FormEvent) => {
    event.preventDefault();
    void run(() => reject.mutateAsync({ params: { path }, body: { reason } }));
  };

  const submitExtension = (event: FormEvent) => {
    event.preventDefault();
    const checked = checkedMinutes(minutes);
    setUnreadable(checked === null);
    if (checked === null) return;
    void run(() =>
      extend.mutateAsync({ params: { path }, body: { seconds: checked * 60 } }),
    );
  };

  const { user } = contestant;
  const decidable = contestant.status === 'pending';
  const rejected = contestant.status === 'rejected';
  const current = contestant.status === 'approved';
  const extensible = decidable || current;

  return (
    <tr ref={row} tabIndex={-1}>
      <th scope="row">
        <div className={classes.person}>
          <span>{name}</span>
          {user !== null && user.name !== null && (
            <BodyText tone="secondary">{user.name}</BodyText>
          )}
          {user !== null && user.email !== null && (
            <BodyText tone="secondary" mono>
              {user.email}
            </BodyText>
          )}
        </div>
      </th>
      <td>
        <span>{t(STATUS[contestant.status])}</span>
        {contestant.reason !== null && (
          <BodyText tone="secondary">{contestant.reason}</BodyText>
        )}
        <BodyText tone="meta">
          {formatDateTime(new Date(contestant.registered_at))}
        </BodyText>
      </td>
      <td>
        {contestant.time_extension > 0
          ? `${minutesOf(contestant.time_extension)} ${t('min')}`
          : '—'}
      </td>
      {manages && (
        <td>
          <div className={classes.actions}>
            {decidable && (
              <Button
                size="xs"
                label={`${t('Approve')} ${name}`}
                loading={approve.isPending}
                onClick={() => {
                  setError(null);
                  void run(() => approve.mutateAsync({ params: { path } }));
                }}
              >
                {t('Approve')}
              </Button>
            )}
            {decidable && (
              <Button
                size="xs"
                variant="secondary"
                label={`${t('Reject')} ${name}`}
                onClick={() => show('reject')}
              >
                {t('Reject')}
              </Button>
            )}
            {rejected && (
              <Button
                size="xs"
                variant="secondary"
                label={`${t('Undo rejection of')} ${name}`}
                loading={reopen.isPending}
                onClick={() => {
                  setError(null);
                  void run(() => reopen.mutateAsync({ params: { path } }));
                }}
              >
                {t('Undo rejection')}
              </Button>
            )}
            {current && (
              <Button
                size="xs"
                variant="danger"
                label={`${t('Remove')} ${name}`}
                onClick={() => show('remove')}
              >
                {t('Remove')}
              </Button>
            )}
            {extensible && (
              <Button
                size="xs"
                variant="secondary"
                label={`${t('Extend')} ${name}`}
                onClick={() => {
                  setMinutes(String(minutesOf(contestant.time_extension)));
                  show('extension');
                }}
              >
                {t('Extend')}
              </Button>
            )}
          </div>
          {open === 'reject' && (
            <form
              className={classes.inline}
              onSubmit={submitReason}
              aria-label={`${t('Reject')} ${name}`}
            >
              <TextInput
                ref={field}
                label={t('Reason')}
                description={t('The person reads this on their own page.')}
                value={reason}
                onChange={setReason}
                maxLength={REASON_MAX}
                required
              />
              <div className={classes.actions}>
                <Button size="xs" type="submit" loading={reject.isPending}>
                  {t('Reject')}
                </Button>
                <Button size="xs" variant="secondary" onClick={() => show(null)}>
                  {t('Cancel')}
                </Button>
              </div>
            </form>
          )}
          {open === 'extension' && (
            <form
              className={classes.inline}
              onSubmit={submitExtension}
              aria-label={`${t('Extend')} ${name}`}
            >
              <TextInput
                ref={field}
                label={t('Extra minutes')}
                description={t('In place of any extension they have. 0 takes it away.')}
                value={minutes}
                onChange={setMinutes}
                required
              />
              <div className={classes.actions}>
                <Button size="xs" type="submit" loading={extend.isPending}>
                  {t('Save')}
                </Button>
                <Button size="xs" variant="secondary" onClick={() => show(null)}>
                  {t('Cancel')}
                </Button>
              </div>
            </form>
          )}
          {unreadable && open === 'extension' && (
            <div role="alert">
              <BodyText>{t('Give a whole number of minutes, up to a year.')}</BodyText>
            </div>
          )}
          {error !== null && open !== 'remove' && (
            <div role="alert">
              <ErrorBlock error={error} compact />
            </div>
          )}
          <Modal
            opened={open === 'remove'}
            onClose={() => show(null)}
            title={t('Remove this contestant?')}
          >
            <div className={classes.inline}>
              <BodyText>
                {name} {t('can no longer submit or ask. What they submitted stays.')}
              </BodyText>
              {error !== null && (
                <div role="alert">
                  <ErrorBlock error={error} compact />
                </div>
              )}
              <div className={classes.actions}>
                <Button
                  variant="danger"
                  loading={remove.isPending}
                  onClick={() =>
                    void run(() => remove.mutateAsync({ params: { path } }))
                  }
                >
                  {t('Remove')}
                </Button>
                <Button variant="secondary" onClick={() => show(null)}>
                  {t('Cancel')}
                </Button>
              </div>
            </div>
          </Modal>
        </td>
      )}
    </tr>
  );
}

/**
 * Every registration of one contest, for its organisers: who, where their
 * registration stands with the reason for a rejection, and any extension
 * they have. A manager also gets each row's actions; an observer reads the
 * table alone. Below it are the invites to a place in the contest, which a
 * manager makes and an observer reads.
 */
export function ContestantsPage() {
  const { org, contest } = useContestParams();
  const manages = holdsAtContest(useMe().roles, org, contest, 'manager');
  const view = queryView(
    $api.useQuery('get', '/api/v1/orgs/{org}/contests/{contest}/contestants', {
      params: { path: { org, contest } },
    }),
  );

  return (
    <div className={classes.page}>
      <PageLink to={contestPath(org, contest)}>{t('Back to the contest')}</PageLink>
      <PageTitle>{t('Contestants')}</PageTitle>
      <Card>
        {view.state === 'loading' && <PageSkeleton rows={4} />}
        {view.state === 'error' && (
          <ErrorBlock error={view.error} onRetry={view.retry} />
        )}
        {view.state === 'ready' &&
          (view.data.length === 0 ? (
            <BodyText>{t('Nobody has registered yet.')}</BodyText>
          ) : (
            <table className={classes.table} aria-label={t('Registrations')}>
              <thead>
                <tr>
                  <th scope="col">{t('Person')}</th>
                  <th scope="col">{t('Registration')}</th>
                  <th scope="col">{t('Extension')}</th>
                  {manages && <th scope="col">{t('Actions')}</th>}
                </tr>
              </thead>
              <tbody>
                {view.data.map((contestant) => (
                  <Row
                    key={contestant.user_id}
                    org={org}
                    contest={contest}
                    contestant={contestant}
                    manages={manages}
                  />
                ))}
              </tbody>
            </table>
          ))}
      </Card>
      <Card>
        <div className={classes.stack}>
          <SectionTitle>{t('Invites')}</SectionTitle>
          <BodyText tone="secondary">
            {t(
              'An invite offers someone a place in this contest. Once they accept it, they may register even when the contest takes only the people it invites, and see it while it is hidden.',
            )}
          </BodyText>
          <InvitesSection
            place={{ kind: 'contest', org, contest }}
            audience="contestants"
            manages={manages}
            administers={false}
          />
        </div>
      </Card>
    </div>
  );
}
