import { useState, type ReactNode } from 'react';
import type { QueryView } from '@/api/query';
import type { FeedEntry, Rejudged } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { useMe } from '@/session';
import { holdsAt } from '../roles';
import { FeedTable, type RowActions } from './FeedTable';
import { AttemptActions, ConfirmDialog, RejudgeOutcome } from './FeedActions';
import { titleOf } from './feed';
import { useGradingActions, type Asking } from './use-grading-actions';
import classes from './feed.module.css';

type ContestPath = { org: string; contest: string };

/**
 * Gradings as the contest's feed and a task's page both show them: each
 * submission once, headed by its highest attempt, with the earlier ones
 * opening below it. A manager of a row's task gets its latest attempt's
 * Retry and, for a system error, Cancel, and Rejudge for `rejudge.task`;
 * each asks first in a dialog through the task's own routes, which shows a
 * refusal and closes once the change has gone through. An observer reads
 * the table alone.
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
  /** The task a Rejudge is offered for, and the button's own words when not its title. */
  rejudge: { task: string; button?: string } | null;
  empty: string;
  footer?: (entries: FeedEntry[]) => ReactNode;
}) {
  const roles = useMe().roles;
  const actions = useGradingActions(path);
  const [asking, setAsking] = useState<Asking | null>(null);
  const [rejudged, setRejudged] = useState<{
    title: string;
    rejudged: Rejudged;
  } | null>(null);

  const entries = view.state === 'ready' ? view.data : [];
  const manages = (task: string | null): task is string =>
    task !== null && holdsAt(roles, { kind: 'task', ...path, task }, 'manager');
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

  const rowActions: RowActions | null = entries.some((entry) => manages(entry.task))
    ? (entry, name) =>
        manages(entry.task) ? (
          <AttemptActions task={entry.task} entry={entry} name={name} onAsk={ask} />
        ) : null
    : null;

  const rejudging = rejudge !== null && manages(rejudge.task) ? rejudge : null;

  return (
    <>
      {rejudging !== null && (
        <div className={classes.actions}>
          <Button
            size="xs"
            variant="secondary"
            onClick={() => {
              setRejudged(null);
              ask({
                kind: 'rejudge',
                task: rejudging.task,
                title: titleFor(rejudging.task),
              });
            }}
          >
            {rejudging.button ?? `Rejudge ${titleFor(rejudging.task)}`}
          </Button>
        </div>
      )}
      {rejudged !== null && (
        <RejudgeOutcome title={rejudged.title} rejudged={rejudged.rejudged} />
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
