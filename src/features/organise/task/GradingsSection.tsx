import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { $api, queryView } from '@/api/query';
import { isApiError, toApiError } from '@/api/problem';
import type { Grading, GradingStatus, Rejudged } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Modal } from '@/ui/Modal';
import { TextInput } from '@/ui/TextInput';
import { TextLink } from '@/ui/TextLink';
import { SectionTitle } from '@/ui/SectionTitle';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { useMe } from '@/session';
import { useLiveConnected } from '@/live';
import { formatDateTime } from '@/lib/time';
import { holdsAt } from '../roles';
import shared from '../organise.module.css';
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
 * Which gradings are offered Cancel: the latest attempt of a submission whose
 * grading reads as a system error, stored or because its run is overdue or
 * lost. Cancel ends the submission for good, with a sentence its contestant
 * reads, when a retry would only repeat the fault.
 */
function cancellable(grading: Grading): boolean {
  return grading.status === 'system_error';
}

/** The most characters the sentence a cancel gives its contestant may run to. */
const REASON_MAX = 500;

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
 * Where a grading's run log is read: the API route itself, on this origin,
 * which answers plain text the browser shows as it is and runs nothing in.
 */
function logHref(path: TaskPath, grading: string): string {
  const part = encodeURIComponent;
  const task = `/api/v1/orgs/${part(path.org)}/contests/${part(path.contest)}/tasks/${part(path.task)}`;
  return `${task}/gradings/${part(grading)}/log`;
}

function nameOf(grading: Grading): string {
  return `submission ${String(grading.submission_number)}, attempt ${String(grading.attempt)}`;
}

/**
 * A submission's attempts together, the latest first, in the order the list
 * gives the submissions, which is newest first.
 */
function bySubmission(gradings: Grading[]): Grading[][] {
  const groups = new Map<number, Grading[]>();
  for (const grading of gradings) {
    groups.set(grading.submission_number, [
      ...(groups.get(grading.submission_number) ?? []),
      grading,
    ]);
  }
  return [...groups.values()].map((attempts) =>
    [...attempts].sort((a, b) => b.attempt - a.attempt),
  );
}

/**
 * What a manager is being asked to confirm. A cancel carries the sentence
 * its contestant will read.
 */
type Asking =
  | { kind: 'retry'; grading: Grading }
  | { kind: 'cancel'; grading: Grading; reason: string }
  | { kind: 'rejudge' };

/**
 * The three changes, each reading the list again once answered or refused,
 * since a refusal here usually means the grading moved on.
 */
function useActions(path: TaskPath) {
  const queryClient = useQueryClient();
  const listKey = $api.queryOptions(
    'get',
    '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/gradings',
    { params: { path } },
  ).queryKey;
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
  const rejudge = $api.useMutation(
    'post',
    '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/rejudge',
    readAgain,
  );

  const reset = () => {
    cancel.reset();
    retry.reset();
    rejudge.reset();
  };

  /** Runs what was asked; true once it has gone through. */
  const run = async (asking: Asking): Promise<Rejudged | true | false> => {
    try {
      if (asking.kind === 'rejudge')
        return await rejudge.mutateAsync({ params: { path } });
      const params = { path: { ...path, grading: asking.grading.id } };
      if (asking.kind === 'retry') await retry.mutateAsync({ params });
      else await cancel.mutateAsync({ params, body: { reason: asking.reason.trim() } });
      return true;
    } catch {
      return false;
    }
  };

  return {
    run,
    reset,
    pending: cancel.isPending || retry.isPending || rejudge.isPending,
    error: cancel.error ?? retry.error ?? rejudge.error,
  };
}

/**
 * One attempt as a row. The latest attempt of a submission is headed by the
 * submission and, for a manager, carries what its status allows: Retry for
 * one that is finished, and Cancel as well for a system error. A cancelled
 * one shows the sentence its contestant was given. A grading whose run
 * is overdue or that the grading machine lost reads as a system error with
 * the reason, and its Retry is drawn as the thing to do, since grading a
 * verdict again is not. An earlier attempt is there to be read.
 */
function AttemptRow({
  path,
  grading,
  latest,
  manages,
  earlier,
  onAsk,
}: {
  path: TaskPath;
  grading: Grading;
  latest: boolean;
  manages: boolean;
  earlier?: { count: number; shown: boolean; toggle: () => void };
  onAsk: (asking: Asking) => void;
}) {
  const name = nameOf(grading);

  return (
    <tr className={latest ? undefined : classes.earlier}>
      <th scope="row">
        {latest ? (
          <>
            Submission {grading.submission_number}
            <BodyText tone="meta">
              {formatDateTime(new Date(grading.submitted_at))}
            </BodyText>
            {earlier !== undefined && earlier.count > 0 && (
              <button
                type="button"
                className={classes.toggle}
                aria-expanded={earlier.shown}
                onClick={earlier.toggle}
              >
                {earlier.shown ? 'Hide' : 'Show'} earlier attempts ({earlier.count})
              </button>
            )}
          </>
        ) : (
          <span className={classes.earlierName}>
            Submission {grading.submission_number}, earlier
          </span>
        )}
      </th>
      <td>
        {grading.attempt}
        <BodyText tone="meta">publication {grading.publication}</BodyText>
      </td>
      <td>
        <span>{STATUS[grading.status]}</span>
        {grading.error !== null && (
          <BodyText tone="secondary">{grading.error}</BodyText>
        )}
        {grading.cancel_reason !== null && (
          <BodyText tone="secondary">
            Told the contestant: {grading.cancel_reason}
          </BodyText>
        )}
        {grading.status === 'done' && grading.result !== null && (
          <BodyText tone="secondary">{resultOf(grading.result)}</BodyText>
        )}
        {grading.log && (
          <TextLink href={logHref(path, grading.id)} label={`Log of ${name}`} newTab>
            Log
          </TextLink>
        )}
      </td>
      {manages && (
        <td>
          {latest && (
            <div className={classes.actions}>
              {!UNFINISHED.has(grading.status) && (
                <Button
                  size="xs"
                  variant={grading.status === 'system_error' ? 'primary' : 'secondary'}
                  label={`Retry ${name}`}
                  onClick={() => onAsk({ kind: 'retry', grading })}
                >
                  Retry
                </Button>
              )}
              {cancellable(grading) && (
                <Button
                  size="xs"
                  variant="secondary"
                  label={`Cancel ${name}`}
                  onClick={() => onAsk({ kind: 'cancel', grading, reason: '' })}
                >
                  Cancel
                </Button>
              )}
            </div>
          )}
        </td>
      )}
    </tr>
  );
}

/** A submission's rows: its latest attempt, and the earlier ones when shown. */
function Submission({
  path,
  attempts,
  manages,
  onAsk,
}: {
  path: TaskPath;
  attempts: Grading[];
  manages: boolean;
  onAsk: (asking: Asking) => void;
}) {
  const [shown, setShown] = useState(false);
  const [latest, ...earlier] = attempts;
  if (latest === undefined) return null;

  return (
    <tbody aria-label={`Submission ${String(latest.submission_number)}`}>
      <AttemptRow
        path={path}
        grading={latest}
        latest
        manages={manages}
        earlier={{ count: earlier.length, shown, toggle: () => setShown(!shown) }}
        onAsk={onAsk}
      />
      {shown &&
        earlier.map((grading) => (
          <AttemptRow
            key={grading.id}
            path={path}
            grading={grading}
            latest={false}
            manages={manages}
            onAsk={onAsk}
          />
        ))}
    </tbody>
  );
}

const TITLE: Record<Asking['kind'], string> = {
  retry: 'Retry this grading?',
  cancel: 'Cancel this grading?',
  rejudge: 'Rejudge every submission?',
};

const CONFIRM: Record<Asking['kind'], string> = {
  retry: 'Retry',
  cancel: 'Cancel the grading',
  rejudge: 'Rejudge',
};

/** What confirming does, in words. */
function Consequence({ asking }: { asking: Asking }) {
  if (asking.kind === 'rejudge') {
    return (
      <>
        <BodyText>
          Every submission&apos;s latest attempt is graded again against the current
          publication, as a new attempt.
        </BodyText>
        <BodyText tone="secondary">
          The earlier attempts stay for the record. An attempt still being graded
          against an older publication is cancelled first; one already grading against
          the current publication is left to finish.
        </BodyText>
      </>
    );
  }
  const { grading } = asking;
  const submission = `Submission ${String(grading.submission_number)}`;
  if (asking.kind === 'retry') {
    return (
      <>
        <BodyText>
          {submission} is graded again as a new attempt, against publication{' '}
          {grading.publication}, as attempt {grading.attempt} was.
        </BodyText>
        <BodyText tone="secondary">
          Attempt {grading.attempt} stays in the list for the record.
        </BodyText>
      </>
    );
  }
  return (
    <>
      <BodyText>
        Attempt {grading.attempt} of {submission.toLowerCase()} ends as cancelled. Its
        contestant reads the sentence below in place of a result, and the submission no
        longer counts against the task&apos;s limit.
      </BodyText>
      <BodyText tone="secondary">
        A rejudge leaves it cancelled; a retry grades it again.
      </BodyText>
    </>
  );
}

/**
 * Why a cancel was refused, in the dialog's own words: the sentence would not
 * do, the grading is no longer a system error, or a later attempt has
 * started. The backend's sentence follows when it gives one.
 */
const CANCEL_REFUSED: Partial<Record<string, { title: string; fallback: string }>> = {
  invalid_reason: {
    title: 'That sentence will not do',
    fallback: `Give the contestant a sentence of 1 to ${String(REASON_MAX)} characters.`,
  },
  wrong_status: {
    title: 'It is no longer a system error',
    fallback: 'Only a grading that reads as a system error can be cancelled.',
  },
  conflict: {
    title: 'A later attempt is there',
    fallback: 'Only the latest attempt of a submission can be cancelled.',
  },
};

/** A refusal in the dialog. A rejudge with nothing published to grade against says so. */
function Refusal({ asking, error }: { asking: Asking; error: unknown }) {
  if (asking.kind === 'rejudge' && isApiError(error) && error.code === 'not_found') {
    return (
      <div role="alert">
        <BodyText tone="secondary">Nothing to rejudge against</BodyText>
        <BodyText tone="secondary">
          The task has no publication yet. The first valid save publishes one.
        </BodyText>
      </div>
    );
  }
  const refused = toApiError(error);
  const words = asking.kind === 'cancel' ? CANCEL_REFUSED[refused.code] : undefined;
  if (words !== undefined) {
    const current = refused.extensions['current'];
    return (
      <div role="alert">
        <BodyText tone="secondary">{words.title}</BodyText>
        <BodyText tone="secondary">{refused.detail ?? words.fallback}</BodyText>
        {refused.code === 'wrong_status' && typeof current === 'string' && (
          <BodyText tone="secondary">It is {statusNow(current)} now.</BodyText>
        )}
      </div>
    );
  }
  return (
    <div role="alert">
      <ErrorBlock error={error} compact />
    </div>
  );
}

/** A status a refusal names, in the list's words when it is one of them. */
function statusNow(status: string): string {
  return Object.hasOwn(STATUS, status)
    ? STATUS[status as GradingStatus].toLowerCase()
    : status;
}

/** What a rejudge did, said once it has. */
function RejudgeOutcome({ rejudged }: { rejudged: Rejudged }) {
  const attempts = (count: number) =>
    `${String(count)} ${count === 1 ? 'attempt' : 'attempts'}`;
  return (
    <div className={shared.panel} role="status">
      <BodyText>
        Rejudged against publication {rejudged.publication}: {attempts(rejudged.queued)}{' '}
        queued.
      </BodyText>
      {rejudged.cancelled > 0 && (
        <BodyText tone="secondary">
          {attempts(rejudged.cancelled)} against an older publication cancelled first.
        </BodyText>
      )}
      {rejudged.left_running > 0 && (
        <BodyText tone="secondary">
          {attempts(rejudged.left_running)} already grading against it left to finish.
        </BodyText>
      )}
    </div>
  );
}

/**
 * The task's gradings, newest submission first, for its organisers: each
 * submission once, headed by its latest attempt, where it stands, what it
 * came to, why it failed and, where its run wrote one, a link to its log,
 * which opens in a tab of its own. Its earlier attempts open below it, to be
 * read. A manager also gets the latest attempt's Cancel or Retry, and
 * Rejudge for the whole task; each asks first in a dialog, which shows a
 * refusal and closes once the change has gone through. An observer reads the
 * table alone.
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
  const actions = useActions(path);
  const [asking, setAsking] = useState<Asking | null>(null);
  const [rejudged, setRejudged] = useState<Rejudged | null>(null);

  const ask = (next: Asking | null) => {
    actions.reset();
    setAsking(next);
  };

  const confirm = async () => {
    if (asking === null) return;
    const done = await actions.run(asking);
    if (done === false) return;
    if (done !== true) setRejudged(done);
    setAsking(null);
  };

  return (
    <div className={classes.stack}>
      <SectionTitle>Gradings</SectionTitle>
      {manages && (
        <div className={classes.actions}>
          <Button
            size="xs"
            variant="secondary"
            onClick={() => {
              setRejudged(null);
              ask({ kind: 'rejudge' });
            }}
          >
            Rejudge
          </Button>
        </div>
      )}
      {rejudged !== null && <RejudgeOutcome rejudged={rejudged} />}
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
            {bySubmission(view.data).map((attempts) => (
              <Submission
                key={attempts[0]?.submission_number}
                path={path}
                attempts={attempts}
                manages={manages}
                onAsk={ask}
              />
            ))}
          </table>
        ))}
      <Modal
        opened={asking !== null}
        onClose={() => ask(null)}
        title={asking === null ? '' : TITLE[asking.kind]}
      >
        {asking !== null && (
          <div className={shared.stack}>
            <Consequence asking={asking} />
            {asking.kind === 'cancel' && (
              <TextInput
                label="What the contestant reads"
                description={`One sentence, at most ${String(REASON_MAX)} characters, shown with the submission.`}
                value={asking.reason}
                onChange={(reason) => setAsking({ ...asking, reason })}
                maxLength={REASON_MAX}
                required
              />
            )}
            {actions.error !== null && (
              <Refusal asking={asking} error={actions.error} />
            )}
            <div className={classes.actions}>
              <Button
                variant={asking.kind === 'cancel' ? 'danger' : 'primary'}
                loading={actions.pending}
                disabled={asking.kind === 'cancel' && asking.reason.trim() === ''}
                onClick={() => void confirm()}
              >
                {CONFIRM[asking.kind]}
              </Button>
              <Button variant="secondary" onClick={() => ask(null)}>
                Not now
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
