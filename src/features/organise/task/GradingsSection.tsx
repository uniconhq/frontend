import { useQueryClient } from '@tanstack/react-query';
import { $api, queryView } from '@/api/query';
import type { Grading, GradingStatus } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { SectionTitle } from '@/ui/SectionTitle';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { useMe } from '@/session';
import { useLiveConnected } from '@/live';
import { formatDateTime } from '@/lib/time';
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

/**
 * What a finished grading's result comes to: what stopped the run, or the
 * first test that did not pass, or accepted when every one did.
 */
function resultOf(result: NonNullable<Grading['result']>): string {
  return (
    result.stopped ??
    result.tests.find((test) => test.outcome !== 'accepted')?.outcome ??
    'accepted'
  );
}

type TaskPath = { org: string; contest: string; task: string };

/**
 * One grading and, for a manager, what its status allows: cancel one still to
 * finish, retry one that is finished. A grading whose run is overdue or that
 * the grading machine lost reads as a system error with the reason, and retry
 * is the one click that grades it again, cancelling the old run; it is the
 * one retry drawn as the thing to do, since grading a verdict again is not. Each answer
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
  // Answered or refused, the list is read again before the row is done.
  const readAgain = {
    onSettled: () => queryClient.invalidateQueries({ queryKey: listKey }),
  };
  const cancel = $api.useMutation(
    'post',
    '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/gradings/{grading}/cancel',
    readAgain,
  );
  const retry = $api.useMutation(
    'post',
    '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/gradings/{grading}/retry',
    readAgain,
  );
  const error = cancel.error ?? retry.error;
  const params = { path: { ...path, grading: grading.id } };
  const name = `submission ${String(grading.submission_number)}, attempt ${String(grading.attempt)}`;

  const unfinished = UNFINISHED.has(grading.status);

  return (
    <tr>
      <th scope="row">
        Submission {grading.submission_number}
        <BodyText tone="meta">
          {formatDateTime(new Date(grading.submitted_at))}
        </BodyText>
      </th>
      <td>{grading.attempt}</td>
      <td>
        <span>{STATUS[grading.status]}</span>
        {grading.error !== null && (
          <BodyText tone="secondary">{grading.error}</BodyText>
        )}
        {grading.status === 'done' && grading.result !== null && (
          <BodyText tone="secondary">{resultOf(grading.result)}</BodyText>
        )}
      </td>
      {manages && (
        <td>
          <div className={classes.actions}>
            {unfinished ? (
              <Button
                size="xs"
                variant="secondary"
                label={`Cancel ${name}`}
                loading={cancel.isPending}
                onClick={() => {
                  retry.reset();
                  cancel.mutate({ params });
                }}
              >
                Cancel
              </Button>
            ) : (
              <Button
                size="xs"
                variant={grading.status === 'system_error' ? 'primary' : 'secondary'}
                label={`Retry ${name}`}
                loading={retry.isPending}
                onClick={() => {
                  cancel.reset();
                  retry.mutate({ params });
                }}
              >
                Retry
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
 * The task's gradings, newest first, for its organisers: which submission
 * and attempt, where each stands, what it came to and why one failed. A
 * manager also gets each row's cancel or retry; an observer reads the table
 * alone.
 */
export function GradingsSection({ path }: { path: TaskPath }) {
  const manages = holdsAt(useMe().roles, { kind: 'task', ...path }, 'manager');
  const live = useLiveConnected();
  const view = queryView(
    $api.useQuery(
      'get',
      '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/gradings',
      { params: { path } },
      {
        refetchInterval: (query) =>
          !live && query.state.data?.some((grading) => UNFINISHED.has(grading.status))
            ? WAITING_MS
            : MEANWHILE_MS,
      },
    ),
  );

  return (
    <div className={classes.stack}>
      <SectionTitle>Gradings</SectionTitle>
      {view.state === 'loading' && <PageSkeleton rows={3} />}
      {view.state === 'error' && <ErrorBlock error={view.error} onRetry={view.retry} />}
      {view.state === 'ready' &&
        (view.data.length === 0 ? (
          <BodyText>Nothing has been graded yet.</BodyText>
        ) : (
          <table className={classes.table} aria-label="Gradings">
            <thead>
              <tr>
                <th scope="col">Submission</th>
                <th scope="col">Attempt</th>
                <th scope="col">Status</th>
                {manages && <th scope="col">Actions</th>}
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
