import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { $api } from '@/api/query';
import { toApiError } from '@/api/problem';
import type { TakeOut, TaskStanding } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { PageLink } from '@/ui/PageLink';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { contestSectionPath } from '@/lib/sections';
import { DefinitionErrors } from '../DefinitionErrors';
import { definitionErrorsOf } from '../files/refusals';
import { contestPlaceOf } from './opened';
import { takingOutOf, type TakingOut } from './take-out';
import shared from '../organise.module.css';

const TAKE_OUT = '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/take-out';
const PUT_BACK = '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/put-back';

/** How many submissions, in words: "1 submission", "14 submissions". */
function submissionsWords(count: number): string {
  return `${String(count)} ${count === 1 ? 'submission' : 'submissions'}`;
}

/**
 * The foot of a task's dialog for a manager, apart from its timeline: the
 * way to remove the task while nobody has submitted to it, or to withdraw it
 * once anyone has; or, for a withdrawn task, what that means and the way to
 * put it back. Each asks first.
 */
export function TakeOutFoot({
  standing,
  label,
  onAsk,
}: {
  standing: TaskStanding;
  label: string;
  onAsk: (asking: TakingOut) => void;
}) {
  if (standing.withdrawn) {
    return (
      <div className={shared.stack}>
        <BodyText tone="secondary">
          Withdrawn: entrants do not see it, and no leaderboard counts it. Its{' '}
          {submissionsWords(standing.submissions)} are kept.
        </BodyText>
        <div className={shared.actions}>
          <Button
            size="xs"
            variant="secondary"
            label={`Put ${label} back in the contest`}
            onClick={() => onAsk({ step: 'put-back' })}
          >
            Put it back
          </Button>
        </div>
      </div>
    );
  }
  const asking = takingOutOf(standing);
  if (asking.step !== 'take-out') return null;
  const remove = asking.would === 'remove';
  return (
    <div className={shared.actions}>
      <Button
        size="xs"
        variant="danger"
        label={`${remove ? 'Remove' : 'Withdraw'} ${label} from the contest`}
        onClick={() => onAsk(asking)}
      >
        {remove ? 'Remove from the contest' : 'Withdraw from the contest'}
      </Button>
    </div>
  );
}

/** What removing or withdrawing a task does, said before it is done. */
function TakeOutWords({
  asking,
  label,
}: {
  asking: Extract<TakingOut, { step: 'take-out' }>;
  label: string;
}) {
  const changed =
    asking.changed &&
    (asking.would === 'withdraw'
      ? `Someone has submitted to ${label} since this dialog opened, so it can no longer be removed, only withdrawn.`
      : `${label} has no submissions now, so it would be removed, not withdrawn.`);
  return (
    <>
      {changed !== false && (
        <div className={shared.panel} role="status">
          <BodyText>{changed}</BodyText>
        </div>
      )}
      {asking.would === 'withdraw' ? (
        <BodyText>
          {label} has {submissionsWords(asking.submissions)}. Withdrawing it hides it
          from entrants and takes its points off every leaderboard. Its submissions are
          kept, and you can put it back.
        </BodyText>
      ) : (
        <>
          <BodyText>
            Nobody has submitted to {label}. Removing it deletes the task and its files
            for good, and the tasks after it each move up a letter.
          </BodyText>
          <BodyText tone="secondary">This cannot be undone.</BodyText>
        </>
      )}
    </>
  );
}

/** A refusal to take the task out or put it back, in the dialog's words. */
function Refusal({
  error,
  org,
  contest,
}: {
  error: unknown;
  org: string;
  contest: string;
}) {
  const refused = toApiError(error);
  if (refused.code === 'take_out_refused') {
    const boards = refused.extensions['boards'];
    return (
      <div className={shared.panel} role="alert">
        <BodyText>
          {refused.detail ??
            'The task cannot be taken out of the contest as it stands.'}
        </BodyText>
        {Array.isArray(boards) && boards.length > 0 && (
          <PageLink to={contestSectionPath(org, contest, 'boards')}>
            Open Leaderboards
          </PageLink>
        )}
      </div>
    );
  }
  const errors = definitionErrorsOf(refused);
  if (refused.code === 'invalid_definition' && errors.length > 0) {
    return (
      <div className={shared.panel} role="alert">
        <BodyText>It cannot go back as the contest’s settings stand:</BodyText>
        <DefinitionErrors errors={errors} placeOf={contestPlaceOf(org, contest)} />
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
 * The dialog's body while a task is taken out of its contest or put back:
 * what it will do, asked first in the organiser's words, then done through
 * the task's routes. Someone submitting since the dialog opened turns a
 * removal into a withdrawal: the forge refuses the one confirmed, and the
 * dialog asks again with the count as it is now. Once done, `onDone` says
 * what was done, and everything it moves is read again.
 */
export function TakingOutBody({
  org,
  contest,
  task,
  label,
  asking,
  onAsk,
  onDone,
  onCancel,
}: {
  org: string;
  contest: string;
  task: string;
  label: string;
  asking: TakingOut;
  onAsk: (asking: TakingOut) => void;
  onDone: (done: TakeOut | 'put-back') => void;
  onCancel: () => void;
}) {
  const queryClient = useQueryClient();
  const takeOut = $api.useMutation('post', TAKE_OUT);
  const putBack = $api.useMutation('post', PUT_BACK);
  const [error, setError] = useState<unknown>(null);
  const path = { org, contest, task };
  const pending = takeOut.isPending || putBack.isPending;

  // Taking a task out moves the contest's tasks, its settings, its
  // leaderboards and the roles at the task, so everything is read again;
  // the dialog has closed by then, or still shows the same task.
  const readAgain = () => void queryClient.invalidateQueries();

  const confirm = async () => {
    setError(null);
    try {
      if (asking.step === 'take-out') {
        const done = await takeOut.mutateAsync({
          params: { path },
          body: { confirmed: asking.would },
        });
        onDone(done.done);
        readAgain();
        return;
      }
      if (asking.step === 'put-back') {
        const back = await putBack.mutateAsync({ params: { path } });
        readAgain();
        if (back.notes.length === 0) {
          onDone('put-back');
          return;
        }
        onAsk({ step: 'back', notes: back.notes });
      }
    } catch (caught) {
      const refused = toApiError(caught);
      const now = refused.extensions['take_out'];
      const submissions = refused.extensions['submissions'];
      if (
        refused.code === 'take_out_changed' &&
        (now === 'remove' || now === 'withdraw') &&
        typeof submissions === 'number'
      ) {
        onAsk({ step: 'take-out', would: now, submissions, changed: true });
        return;
      }
      setError(caught);
    }
  };

  if (asking.step === 'back') {
    return (
      <div className={shared.stack}>
        <BodyText>
          Entrants see it again, and every leaderboard counts it as before.
        </BodyText>
        <ul className={shared.named} aria-label="Notes">
          {asking.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
        <div className={shared.actions}>
          <Button variant="secondary" onClick={() => onDone('put-back')}>
            Done
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={shared.stack}>
      {asking.step === 'take-out' ? (
        <TakeOutWords asking={asking} label={label} />
      ) : (
        <BodyText>
          Entrants see it again and can submit to it while it is open, and every
          leaderboard counts it as before, its submissions included.
        </BodyText>
      )}
      {error !== null && <Refusal error={error} org={org} contest={contest} />}
      <div className={shared.actions}>
        <Button
          variant={asking.step === 'take-out' ? 'danger' : 'primary'}
          loading={pending}
          onClick={() => void confirm()}
        >
          {asking.step === 'put-back'
            ? 'Put it back'
            : asking.would === 'remove'
              ? 'Remove it'
              : 'Withdraw it'}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Not now
        </Button>
      </div>
    </div>
  );
}
