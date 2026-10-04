import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { $api, queryView } from '@/api/query';
import type { Grading, GradingStatus } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { SectionTitle } from '@/ui/SectionTitle';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { useMe } from '@/session';
import { formatDateTime } from '@/lib/time';
import { t } from '@/lib/t';
import { holdsAt } from '../roles';
import classes from './gradings.module.css';

/**
 * How often the list is read again while a grading on it is still to finish,
 * and otherwise. A grading takes seconds to minutes, and an organiser watching
 * for stuck ones needs no faster.
 */
const WAITING_MS = 10_000;
const MEANWHILE_MS = 60_000;

const STATUS: Record<GradingStatus, string> = {
  queued: 'Queued',
  dispatched: 'Waiting for a machine',
  running: 'Running',
  done: 'Done',
  cancelled: 'Cancelled',
  system_error: 'System error',
};

const UNFINISHED = new Set<GradingStatus>(['queued', 'dispatched', 'running']);

type TaskPath = { org: string; contest: string; task: string };

/**
 * One grading and, for a manager, what its status allows: cancel one still to
 * finish, retry one that is finished. A grading whose run is overdue or that
 * the grading machine lost reads as a system error with the reason, and retry
 * is the one click that grades it again, cancelling the old run. Each answer
 * reads the list again, and a refusal is shown on the row.
 */
function Row({
  path,
  grading,
  manages,
}: {
  path: TaskPath;
  grading: Grading;
  manages: boolean;
}) {
  const queryClient = useQueryClient();
  const listKey = $api.queryOptions(
    'get',
    '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/gradings',
    { params: { path } },
  ).queryKey;
  const cancel = $api.useMutation(
    'post',
    '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/gradings/{grading}/cancel',
  );
  const retry = $api.useMutation(
    'post',
    '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/gradings/{grading}/retry',
  );
  const [error, setError] = useState<unknown>(null);
  const params = { path: { ...path, grading: grading.id } };
  const name = `${t('submission')} ${String(grading.submission_number)}, ${grading.stage}, ${t('attempt')} ${String(grading.attempt)}`;

  const run = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
    } catch (refused) {
      setError(refused);
    }
    await queryClient.invalidateQueries({ queryKey: listKey });
  };

  const unfinished = UNFINISHED.has(grading.status);

  return (
    <tr>
      <th scope="row">
        {t('Submission')} {grading.submission_number}
        <BodyText tone="meta">
          {formatDateTime(new Date(grading.submitted_at))}
        </BodyText>
      </th>
      <td>{grading.stage}</td>
      <td>{grading.attempt}</td>
      <td>
        <span>{t(STATUS[grading.status])}</span>
        {grading.error !== null && (
          <BodyText tone="secondary">{grading.error}</BodyText>
        )}
        {grading.status === 'done' && grading.verdict !== null && (
          <BodyText tone="secondary">{grading.verdict.outcome}</BodyText>
        )}
      </td>
      {manages && (
        <td>
          <div className={classes.actions}>
            {unfinished ? (
              <Button
                size="xs"
                variant="secondary"
                label={`${t('Cancel')} ${name}`}
                loading={cancel.isPending}
                onClick={() => void run(() => cancel.mutateAsync({ params }))}
              >
                {t('Cancel')}
              </Button>
            ) : (
              <Button
                size="xs"
                label={`${t('Retry')} ${name}`}
                loading={retry.isPending}
                onClick={() => void run(() => retry.mutateAsync({ params }))}
              >
                {t('Retry')}
              </Button>
            )}
          </div>
          {error !== null && <ErrorBlock error={error} compact />}
        </td>
      )}
    </tr>
  );
}

/**
 * The task's gradings, newest first, for its organisers: which submission,
 * stage and attempt, where each stands and why one failed. A manager also
 * gets each row's cancel or retry; an observer reads the table alone.
 */
export function GradingsSection({ path }: { path: TaskPath }) {
  const manages = holdsAt(useMe().roles, { kind: 'task', ...path }, 'manager');
  const view = queryView(
    $api.useQuery(
      'get',
      '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/gradings',
      { params: { path } },
      {
        refetchInterval: (query) =>
          query.state.data?.some((grading) => UNFINISHED.has(grading.status))
            ? WAITING_MS
            : MEANWHILE_MS,
      },
    ),
  );

  return (
    <div className={classes.stack}>
      <SectionTitle>{t('Gradings')}</SectionTitle>
      {view.state === 'loading' && <PageSkeleton rows={3} />}
      {view.state === 'error' && <ErrorBlock error={view.error} onRetry={view.retry} />}
      {view.state === 'ready' &&
        (view.data.length === 0 ? (
          <BodyText>{t('Nothing has been graded yet.')}</BodyText>
        ) : (
          <table className={classes.table} aria-label={t('Gradings')}>
            <thead>
              <tr>
                <th scope="col">{t('Submission')}</th>
                <th scope="col">{t('Stage')}</th>
                <th scope="col">{t('Attempt')}</th>
                <th scope="col">{t('Status')}</th>
                {manages && <th scope="col">{t('Actions')}</th>}
              </tr>
            </thead>
            <tbody>
              {view.data.map((grading) => (
                <Row key={grading.id} path={path} grading={grading} manages={manages} />
              ))}
            </tbody>
          </table>
        ))}
    </div>
  );
}
