import { isApiError, toApiError } from '@/api/problem';
import type { FeedEntry, GradingStatus, Rejudged } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Modal } from '@/ui/Modal';
import { TextInput } from '@/ui/TextInput';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { STATUS, UNFINISHED, submitterOf } from './feed';
import type { Asking } from './use-grading-actions';
import shared from '../organise.module.css';
import classes from './feed.module.css';

/** The most characters the sentence a cancel gives its contestant may run to. */
const REASON_MAX = 500;

/**
 * What a latest attempt offers a manager of its task: Retry once it has
 * finished, drawn as the thing to do for a system error, and Cancel for a
 * system error alone. A submission staff cancelled is offered neither, since
 * a cancel is final. A broken attempt with an earlier result offers Fall back
 * while nothing counts that result, and Clear fallback while staff's own
 * fallback does; the contest's own needs nothing here.
 */
export function AttemptActions({
  task,
  entry,
  name,
  onAsk,
}: {
  task: string;
  entry: FeedEntry;
  name: string;
  onAsk: (asking: Asking) => void;
}) {
  const { status, last_good: lastGood, fallback } = entry.grading;
  return (
    <div className={classes.actions}>
      {!UNFINISHED.has(status) && status !== 'cancelled' && (
        <Button
          size="xs"
          variant={status === 'system_error' ? 'primary' : 'secondary'}
          label={`Retry ${name}`}
          onClick={() => onAsk({ kind: 'retry', task, entry })}
        >
          Retry
        </Button>
      )}
      {status === 'system_error' && (
        <Button
          size="xs"
          variant="secondary"
          label={`Cancel ${name}`}
          onClick={() => onAsk({ kind: 'cancel', task, entry, reason: '' })}
        >
          Cancel
        </Button>
      )}
      {lastGood !== null && fallback === null && (
        <Button
          size="xs"
          variant="secondary"
          label={`Fall back ${name} to attempt ${String(lastGood)}`}
          onClick={() => onAsk({ kind: 'fallBack', task, entry })}
        >
          Fall back
        </Button>
      )}
      {lastGood !== null && fallback === 'staff' && (
        <Button
          size="xs"
          variant="secondary"
          label={`Clear the fallback on ${name}`}
          onClick={() => onAsk({ kind: 'clearFallback', task, entry })}
        >
          Clear fallback
        </Button>
      )}
    </div>
  );
}

const TITLE: Record<Asking['kind'], string> = {
  retry: 'Retry this grading?',
  cancel: 'Cancel this submission?',
  fallBack: 'Fall back to the last good result?',
  clearFallback: 'Clear the fallback?',
  rejudge: 'Rejudge every submission of this task?',
};

const CONFIRM: Record<Asking['kind'], string> = {
  retry: 'Retry',
  cancel: 'Cancel the submission',
  fallBack: 'Fall back',
  clearFallback: 'Clear the fallback',
  rejudge: 'Rejudge',
};

/** What confirming does, in words. */
function Consequence({ asking }: { asking: Asking }) {
  if (asking.kind === 'rejudge') {
    return (
      <>
        <BodyText>
          Every submission of {asking.title} has its latest attempt graded again against
          the task&apos;s current publication, as a new attempt.
        </BodyText>
        <BodyText tone="secondary">
          The earlier attempts stay for the record. An attempt still being graded
          against an older publication is cancelled first; one already grading against
          the current publication is left to finish.
        </BodyText>
      </>
    );
  }
  const { grading } = asking.entry;
  const submission = `${submitterOf(asking.entry.by)}'s submission ${String(grading.submission_number)}`;
  if (asking.kind === 'fallBack') {
    return (
      <>
        <BodyText>
          {submission} to {asking.task} counts as attempt {grading.last_good}, its last
          attempt that finished with a result, in place of attempt {grading.attempt}: on
          the boards, to its contestant and under the task&apos;s limit.
        </BodyText>
        <BodyText tone="secondary">
          A cancel keeps that result. Clear the fallback to count the submission as the
          contest&apos;s settings say again.
        </BodyText>
      </>
    );
  }
  if (asking.kind === 'clearFallback') {
    return (
      <>
        <BodyText>
          {submission} to {asking.task} counts as the contest&apos;s settings say again:
          still being graded while attempt {grading.attempt} is a system error, and void
          once it is cancelled, unless the contest counts the last good result.
        </BodyText>
      </>
    );
  }
  if (asking.kind === 'retry') {
    return (
      <>
        <BodyText>
          {submission} to {asking.task} is graded again as a new attempt, against
          publication {grading.publication}, as attempt {grading.attempt} was.
        </BodyText>
        <BodyText tone="secondary">
          Attempt {grading.attempt} stays in the list for the record.
        </BodyText>
      </>
    );
  }
  return (
    <>
      {grading.fallback === null ? (
        <BodyText>
          {submission} to {asking.task} ends as cancelled. Its contestant reads the
          sentence below in place of a result, and the submission no longer counts
          against the task&apos;s limit.
        </BodyText>
      ) : (
        <BodyText>
          Attempt {grading.attempt} of {submission} to {asking.task} ends as cancelled.
          While the fallback holds, the submission keeps counting as attempt{' '}
          {grading.last_good}, its last good result, and its contestant reads that.
        </BodyText>
      )}
      <BodyText tone="secondary">
        A cancel is final: neither a retry nor a rejudge grades it again.
      </BodyText>
    </>
  );
}

type Words = Partial<Record<string, { title: string; fallback: string }>>;

/**
 * Why a cancel or a retry was refused, in the dialog's own words, the
 * backend's sentence in place of the fallback when it gives one.
 */
const CANCEL_REFUSED: Words = {
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

const RETRY_REFUSED: Words = {
  wrong_status: {
    title: 'It cannot be retried',
    fallback:
      'Only a finished grading can be retried, and never a submission staff cancelled.',
  },
  conflict: {
    title: 'Not the attempt to retry',
    fallback:
      'Only the latest attempt of a submission can be retried, once no attempt of it is being graded.',
  },
};

const FALL_BACK_REFUSED: Words = {
  wrong_status: {
    title: 'It is not broken',
    fallback:
      'Only a grading that reads as a system error, or one staff cancelled, falls back.',
  },
  conflict: {
    title: 'Nothing to fall back to',
    fallback:
      'Only the latest attempt falls back, and only to an earlier attempt that finished with a result.',
  },
};

const REFUSED: Record<Asking['kind'], Words> = {
  cancel: CANCEL_REFUSED,
  retry: RETRY_REFUSED,
  fallBack: FALL_BACK_REFUSED,
  clearFallback: {},
  rejudge: {},
};

/** A status a refusal names, in the feed's words when it is one of them. */
function statusNow(status: string): string {
  return Object.hasOwn(STATUS, status)
    ? STATUS[status as GradingStatus].toLowerCase()
    : status;
}

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
  const words = REFUSED[asking.kind][refused.code];
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

/**
 * The confirmation for whatever is being asked, which keeps a refusal and
 * closes once the change has gone through.
 */
export function ConfirmDialog({
  asking,
  pending,
  error,
  onChange,
  onConfirm,
  onClose,
}: {
  asking: Asking | null;
  pending: boolean;
  error: unknown;
  onChange: (asking: Asking) => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      opened={asking !== null}
      onClose={onClose}
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
              onChange={(reason) => onChange({ ...asking, reason })}
              maxLength={REASON_MAX}
              required
            />
          )}
          {error !== null && <Refusal asking={asking} error={error} />}
          <div className={classes.actions}>
            <Button
              variant={asking.kind === 'cancel' ? 'danger' : 'primary'}
              loading={pending}
              disabled={asking.kind === 'cancel' && asking.reason.trim() === ''}
              onClick={onConfirm}
            >
              {CONFIRM[asking.kind]}
            </Button>
            <Button variant="secondary" onClick={onClose}>
              Not now
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** What a rejudge did, said once it has. */
export function RejudgeOutcome({
  title,
  rejudged,
}: {
  title: string;
  rejudged: Rejudged;
}) {
  const attempts = (count: number) =>
    `${String(count)} ${count === 1 ? 'attempt' : 'attempts'}`;
  return (
    <div className={shared.panel} role="status">
      <BodyText>
        {title} rejudged against publication {rejudged.publication}:{' '}
        {attempts(rejudged.queued)} queued.
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
