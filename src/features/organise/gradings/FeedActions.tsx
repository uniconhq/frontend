import { isApiError, toApiError } from '@/api/problem';
import type { FeedEntry, GradingStatus, Rejudged } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Modal } from '@/ui/Modal';
import { TextInput } from '@/ui/TextInput';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { STATUS, UNFINISHED } from './feed';
import type { Asking } from './use-feed-actions';
import shared from '../organise.module.css';
import classes from './feed.module.css';

/** The most characters the sentence a cancel gives its contestant may run to. */
const REASON_MAX = 500;

/**
 * What a latest attempt offers a manager of its task: Retry once it has
 * finished, drawn as the thing to do for a system error, and Cancel for a
 * system error alone.
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
  const { status } = entry.grading;
  return (
    <div className={classes.actions}>
      {!UNFINISHED.has(status) && (
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
    </div>
  );
}

const TITLE: Record<Asking['kind'], string> = {
  retry: 'Retry this grading?',
  cancel: 'Cancel this submission?',
  rejudge: 'Rejudge every submission of this task?',
};

const CONFIRM: Record<Asking['kind'], string> = {
  retry: 'Retry',
  cancel: 'Cancel the submission',
  rejudge: 'Rejudge',
};

/** What confirming does, in words. */
function Consequence({ asking, who }: { asking: Asking; who: string }) {
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
  const submission = `${who}'s submission ${String(grading.submission_number)}`;
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
      <BodyText>
        {submission} to {asking.task} ends as cancelled. Its contestant reads the
        sentence below in place of a result, and the submission no longer counts against
        the task&apos;s limit.
      </BodyText>
      <BodyText tone="secondary">
        A rejudge leaves it cancelled; a retry grades it again.
      </BodyText>
    </>
  );
}

/**
 * Why a cancel was refused, in the dialog's own words, the backend's sentence
 * in place of the fallback when it gives one.
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

/**
 * The confirmation for whatever is being asked, which keeps a refusal and
 * closes once the change has gone through.
 */
export function ConfirmDialog({
  asking,
  who,
  pending,
  error,
  onChange,
  onConfirm,
  onClose,
}: {
  asking: Asking | null;
  who: string;
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
          <Consequence asking={asking} who={who} />
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
