import type { FeedEntry, Rejudged } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Modal } from '@/ui/Modal';
import { Select } from '@/ui/Select';
import { TextInput } from '@/ui/TextInput';
import { PageLink } from '@/ui/PageLink';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { submissionsWords } from '@/ui/scored/scored-text';
import { contestSectionPath } from '@/lib/sections';
import { UNFINISHED, submitterOf } from './feed';
import { regradeSearch } from './regrades';
import type { Asking } from './use-grading-actions';
import shared from '../organise.module.css';
import classes from './feed.module.css';

/** The most characters the sentence a cancel gives its entrant may run to. */
const REASON_MAX = 500;

/**
 * What a latest attempt offers a manager of its task: Retry once it has
 * finished, drawn as the thing to do for a system error, and Cancel for a
 * system error alone. A submission the organisers cancelled is offered
 * neither, since a cancel is final.
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
    </div>
  );
}

/** A cancel that leaves an earlier result standing ends only the attempt. */
function endsAttempt(asking: Asking): boolean {
  return asking.kind === 'cancel' && asking.entry.grading.last_good !== null;
}

/** The entrant a submission is from, by the name entrants know them by. */
function entrantOf(entry: FeedEntry): string {
  return entry.by.entrant_name ?? entry.by.username ?? 'the entrant';
}

/**
 * The question a dialog asks, in the organiser's words, naming the
 * submission or the task: "Grade submission 2 again?" (M64).
 */
function titleOf(asking: Asking): string {
  if (asking.kind === 'rejudge') {
    return asking.choose !== undefined || asking.task === ''
      ? 'Grade every submission to a task again?'
      : `Grade every submission to ${asking.title} again?`;
  }
  const number = String(asking.entry.grading.submission_number);
  if (asking.kind === 'retry') return `Grade submission ${number} again?`;
  return endsAttempt(asking)
    ? `Keep submission ${number}’s earlier result?`
    : `Cancel submission ${number}?`;
}

/** The button that does it, saying what it does. */
function confirmOf(asking: Asking): string {
  if (asking.kind === 'rejudge') return 'Rejudge';
  if (asking.kind === 'retry') return 'Grade it again';
  return endsAttempt(asking) ? 'Keep the earlier result' : 'Cancel the submission';
}

/**
 * What confirming does, in words: what runs, on which version of the task,
 * why one would, and what the entrant and the leaderboards see meanwhile.
 */
function Consequence({ asking }: { asking: Asking }) {
  if (asking.kind === 'rejudge') {
    const task = asking.task === '' ? 'the task' : asking.title;
    return (
      <>
        {asking.task === '' && <BodyText>Choose the task to rejudge.</BodyText>}
        <BodyText>
          Every submission to {task} runs again on the task as it is now, its latest
          publication. For when its runs, its workflow or its scoring changed. To grade
          one submission again on the version it was graded on, retry it instead.
        </BodyText>
        <BodyText tone="secondary">
          Each new result replaces the one before, which stays in the list, marked as
          replaced. Until each new run finishes, entrants and the leaderboards keep
          seeing the current results. A submission still being graded on an older
          version of the task is stopped first; one already running on the latest is
          left to finish.
        </BodyText>
      </>
    );
  }
  const { grading } = asking.entry;
  const entrant = entrantOf(asking.entry);
  const submission = `${submitterOf(asking.entry.by)}'s submission ${String(grading.submission_number)}`;
  if (asking.kind === 'retry' && grading.retry_limit !== null) {
    return (
      <OverLimitRetry
        asking={asking}
        submission={submission}
        limit={grading.retry_limit}
      />
    );
  }
  if (asking.kind === 'retry') {
    const standing = grading.status === 'done' || grading.last_good !== null;
    return (
      <>
        <BodyText>
          {submission} to {asking.task} runs again on the same version of the task it
          was graded on (publication {grading.publication}). For when the grading itself
          went wrong, such as one that failed on Unicon’s side. To grade it against the
          task as it is now, rejudge the task.
        </BodyText>
        <BodyText tone="secondary">
          {grading.status === 'done'
            ? 'The new result replaces this one.'
            : 'The new result counts in place of this grading, which has none.'}{' '}
          This one stays in the list, marked as replaced.
        </BodyText>
        {standing && (
          <BodyText tone="secondary">
            Until the new run finishes, {entrant} and the leaderboards keep seeing the
            current result.
          </BodyText>
        )}
      </>
    );
  }
  return (
    <>
      {grading.last_good === null ? (
        <BodyText>
          {submission} to {asking.task} is not graded. {entrant} reads the sentence
          below in place of a result, and the submission no longer counts towards the
          task’s limit on submissions.
        </BodyText>
      ) : (
        <BodyText>
          The grading of {submission} to {asking.task} that failed is stopped, and the
          submission keeps the result it had, which {entrant} and the leaderboards go on
          seeing.
        </BodyText>
      )}
      <BodyText tone="secondary">
        This is final: neither a retry nor a rejudge grades it again.
      </BodyText>
    </>
  );
}

/**
 * What a retry of a submission with no result says when it would end over
 * the limit (#445): its entrant has as many submissions with a result as the
 * task takes, so the retry grades nothing and the submission ends not
 * graded. It is asked all the same, since room may open before it runs.
 */
function OverLimitRetry({
  asking,
  submission,
  limit,
}: {
  asking: Extract<Asking, { kind: 'retry' }>;
  submission: string;
  limit: number;
}) {
  const entrant = entrantOf(asking.entry);
  return (
    <>
      <BodyText>
        A retry now ends not graded: {entrant} has reached the limit of{' '}
        {submissionsWords(limit)} for {asking.task}, counting their submissions with a
        result, those waiting that are not delayed, and the delayed ones made before
        this one.
      </BodyText>
      <BodyText tone="secondary">
        {submission} then has no result and counts on no leaderboard, and {entrant}{' '}
        reads that they had reached the limit. A delayed submission is graded only while
        its entrant has room under the limit, so their earliest submissions are the ones
        that count.
      </BodyText>
    </>
  );
}

const REFUSED_HEADING: Record<Asking['kind'], string> = {
  cancel: 'Couldn’t cancel',
  retry: 'Couldn’t retry',
  rejudge: 'Couldn’t rejudge',
};

/** A refusal in the dialog, in the server's words. */
function Refusal({ asking, error }: { asking: Asking; error: unknown }) {
  return (
    <div role="alert">
      <ErrorBlock error={error} compact heading={REFUSED_HEADING[asking.kind]} />
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
      title={asking === null ? '' : titleOf(asking)}
    >
      {asking !== null && (
        <div className={shared.stack}>
          {asking.kind === 'rejudge' && asking.choose !== undefined && (
            <Select
              label="Task"
              value={asking.task}
              placeholder="Choose a task"
              options={asking.choose}
              onChange={(task) =>
                onChange({
                  ...asking,
                  task,
                  title:
                    asking.choose?.find((found) => found.value === task)?.label ?? task,
                })
              }
            />
          )}
          <Consequence asking={asking} />
          {asking.kind === 'cancel' && (
            <TextInput
              label={
                asking.entry.grading.last_good === null
                  ? 'What the entrant reads'
                  : 'Why it was cancelled'
              }
              description={
                asking.entry.grading.last_good === null
                  ? `One sentence, at most ${String(REASON_MAX)} characters, shown with the submission.`
                  : `One sentence, at most ${String(REASON_MAX)} characters, kept with the grading for the organisers.`
              }
              value={asking.reason}
              onChange={(reason) => onChange({ ...asking, reason })}
              required
            />
          )}
          {error !== null && <Refusal asking={asking} error={error} />}
          <div className={classes.actions}>
            <Button
              variant={asking.kind === 'cancel' ? 'danger' : 'primary'}
              loading={pending}
              disabled={
                (asking.kind === 'cancel' && asking.reason.trim() === '') ||
                (asking.kind === 'rejudge' && asking.task === '')
              }
              onClick={onConfirm}
            >
              {confirmOf(asking)}
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

/**
 * What a rejudge did, said once it has: how many it queued, cancelled and
 * left running, how many ended not graded since their entrants had reached
 * the task's limit (#445), and the way to what it changes, as Gradings sums
 * it up (#448).
 */
export function RejudgeOutcome({
  path,
  title,
  rejudged,
}: {
  path: { org: string; contest: string };
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
      {rejudged.over_limit > 0 && (
        <BodyText tone="secondary">
          {rejudged.over_limit === 1
            ? '1 submission ended not graded, since its entrant had reached the task’s limit on submissions.'
            : `${String(rejudged.over_limit)} submissions ended not graded, since their entrants had reached the task’s limit on submissions.`}
        </BodyText>
      )}
      {rejudged.regrade !== null && (
        <PageLink
          to={`${contestSectionPath(path.org, path.contest, 'gradings')}?${regradeSearch(rejudged.regrade, null)}`}
        >
          See what the rejudge changes
        </PageLink>
      )}
    </div>
  );
}
