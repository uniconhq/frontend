import { $api, queryView } from '@/api/query';
import type { FeedEntry } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { VerdictBadge } from '@/ui/VerdictBadge';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { ScoredResult } from '@/ui/scored/ScoredResult';
import { STATUS, overLimitSentence } from './feed';
import classes from './feed.module.css';

type ContestPath = { org: string; contest: string };

/**
 * A submission as its row reads it, with everything filled in (TASK-FORMAT.md
 * section 1.7), opened under the submission in the feed: the same payload its
 * contestant reads, scored by the same code, with every group's outcome,
 * tests and points shown and each group saying when its row sees it. The row
 * is the entrant that made it, as the feed names it. It is the attempt that
 * counts (#442), an earlier one than the feed's head while a later attempt
 * has no result; the view then says which attempt it shows.
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
  const query = { entrant: entry.by.entrant };
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
        The full result, as its entrant will see it once everything is shown. Each test
        group says when its entrant sees it.
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
              <BodyText tone="secondary">
                {view.data.grading.status === 'over_limit'
                  ? overLimitSentence(view.data.grading.limit)
                  : STATUS[view.data.grading.status]}
              </BodyText>
              {view.data.grading.attempt !== entry.grading.attempt && (
                <BodyText tone="secondary">
                  {`Attempt ${String(view.data.grading.attempt)}'s result, the one that stands while attempt ${String(entry.grading.attempt)} has none.`}
                </BodyText>
              )}
            </div>
            <ScoredResult
              grading={view.data.grading}
              shownAt="Its entrant sees this at"
              testsShownAt="Its entrant sees its tests at"
            />
          </>
        ))}
    </section>
  );
}
