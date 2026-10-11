import { $api, queryView } from '@/api/query';
import type { FeedEntry } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { VerdictBadge } from '@/ui/VerdictBadge';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { ScoredResult } from '@/ui/scored/ScoredResult';
import { STATUS } from './feed';
import classes from './feed.module.css';

type ContestPath = { org: string; contest: string };

/**
 * A submission as its row reads it, with everything filled in (TASK-FORMAT.md
 * section 1.7), opened beside its grading: the same payload its contestant
 * reads, scored by the same code, with every group's outcome, tests and
 * points shown and each group saying when its row sees it. The row is the
 * contestant or the team who made it, as the feed names them.
 */
export function ScoredView({
  path,
  task,
  entry,
}: {
  path: ContestPath;
  task: string;
  entry: FeedEntry;
}) {
  const number = entry.grading.submission_number;
  const query =
    entry.by.team !== null ? { team: entry.by.team } : { user_id: entry.by.user_id };
  const view = queryView(
    $api.useQuery(
      'get',
      '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/organise/submissions/{number}',
      { params: { path: { ...path, task, number }, query } },
    ),
  );
  return (
    <section
      className={classes.scored}
      aria-label={`Submission ${String(number)}, scored`}
    >
      <BodyText tone="secondary">
        As its row reads it, with everything filled in; each group says when its row
        sees it.
      </BodyText>
      {view.state === 'loading' && <PageSkeleton rows={3} />}
      {view.state === 'error' && <ErrorBlock error={view.error} onRetry={view.retry} />}
      {view.state === 'ready' &&
        (view.data.grading === null ? (
          <BodyText tone="secondary">Not graded</BodyText>
        ) : (
          <>
            <div className={classes.scoredHead}>
              {view.data.grading.outcome !== null && (
                <VerdictBadge verdict={view.data.grading.outcome} />
              )}
              <BodyText tone="secondary">{STATUS[view.data.grading.status]}</BodyText>
            </div>
            <ScoredResult
              grading={view.data.grading}
              shownAt="Its row sees this at"
              testsShownAt="Its row sees its tests at"
            />
          </>
        ))}
    </section>
  );
}
