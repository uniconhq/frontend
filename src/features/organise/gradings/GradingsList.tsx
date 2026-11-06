import { useState, type ReactNode } from 'react';
import type { QueryView } from '@/api/query';
import type { FeedEntry, Rejudged } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { FeedTable, type RowActions } from './FeedTable';
import { AttemptActions, ConfirmDialog, RejudgeOutcome } from './FeedActions';
import { titleOf } from './feed';
import { useGradingActions, type Asking } from './use-grading-actions';
import classes from './feed.module.css';

type ContestPath = { org: string; contest: string };

/**
 * Where a Rejudge is offered: for one task, with the button's own words when
 * not its title; or, on the contest's gradings, for whichever of `tasks` the
 * manager chooses in its confirmation, `task` chosen to begin with. Each
 * task is one the server says the caller manages.
 */
export type RejudgeOffer =
  { task: string; button?: string } | { tasks: string[]; task: string | null };

/**
 * Gradings as the contest's feed and a task's page both show them: each
 * submission once, headed by its highest attempt, with the earlier ones
 * opening below it. A manager of a row's task gets its latest attempt's
 * Retry and, for a system error, Cancel; and Rejudge as `rejudge` offers it,
 * of the tasks they manage. Each asks first in a dialog through the task's
 * own routes, which shows a refusal and closes once the change has gone
 * through. An observer reads the table alone.
 */
export function GradingsList({
  path,
  view,
  showTask,
  rejudge,
  empty,
  footer,
}: {
  path: ContestPath;
  view: QueryView<FeedEntry[]>;
  /** False where every row is of one task. */
  showTask: boolean;
  rejudge: RejudgeOffer | null;
  empty: string;
  footer?: (entries: FeedEntry[]) => ReactNode;
}) {
  const actions = useGradingActions(path);
  const [asking, setAsking] = useState<Asking | null>(null);
  const [rejudged, setRejudged] = useState<{
    title: string;
    rejudged: Rejudged;
  } | null>(null);

  const entries = view.state === 'ready' ? view.data : [];
  const titleFor = (task: string) =>
    titleOf(task, entries.find((entry) => entry.task === task)?.label ?? null);

  const ask = (next: Asking | null) => {
    actions.reset();
    setAsking(next);
  };

  const confirm = async () => {
    if (asking === null) return;
    const done = await actions.run(asking);
    if (done === false) return;
    if (done !== true && asking.kind === 'rejudge') {
      setRejudged({ title: asking.title, rejudged: done });
    }
    setAsking(null);
  };

  const rowActions: RowActions | null = entries.some((entry) => entry.may_manage)
    ? (entry, name) =>
        entry.may_manage && entry.task !== null ? (
          <AttemptActions task={entry.task} entry={entry} name={name} onAsk={ask} />
        ) : null
    : null;

  /** The Rejudge button's words and what it asks, or null where none is offered. */
  const offer = ((): { words: string; asking: Asking } | null => {
    if (rejudge === null) return null;
    if ('tasks' in rejudge) {
      const choose = rejudge.tasks.map((task) => ({
        value: task,
        label: titleFor(task),
      }));
      if (choose.length === 0) return null;
      const first =
        rejudge.task !== null && choose.some((task) => task.value === rejudge.task)
          ? rejudge.task
          : '';
      return {
        words: 'Rejudge a task',
        asking: {
          kind: 'rejudge',
          task: first,
          title: first === '' ? '' : titleFor(first),
          choose,
        },
      };
    }
    return {
      words: rejudge.button ?? `Rejudge ${titleFor(rejudge.task)}`,
      asking: { kind: 'rejudge', task: rejudge.task, title: titleFor(rejudge.task) },
    };
  })();

  return (
    <>
      {offer !== null && (
        <div className={classes.actions}>
          <Button
            size="xs"
            variant="secondary"
            onClick={() => {
              setRejudged(null);
              ask(offer.asking);
            }}
          >
            {offer.words}
          </Button>
        </div>
      )}
      {rejudged !== null && (
        <RejudgeOutcome
          path={path}
          title={rejudged.title}
          rejudged={rejudged.rejudged}
        />
      )}
      {view.state === 'loading' && <PageSkeleton rows={4} />}
      {view.state === 'error' && <ErrorBlock error={view.error} onRetry={view.retry} />}
      {view.state === 'ready' &&
        (view.data.length === 0 ? (
          <BodyText>{empty}</BodyText>
        ) : (
          <>
            <FeedTable
              path={path}
              entries={view.data}
              showTask={showTask}
              actions={rowActions}
            />
            {footer?.(view.data)}
          </>
        ))}
      <ConfirmDialog
        asking={asking}
        pending={actions.pending}
        error={actions.error}
        onChange={setAsking}
        onConfirm={() => void confirm()}
        onClose={() => ask(null)}
      />
    </>
  );
}
