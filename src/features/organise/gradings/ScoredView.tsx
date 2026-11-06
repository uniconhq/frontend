import { $api, queryView } from '@/api/query';
import type { FeedEntry } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { Loaded } from '@/ui/feedback/Loaded';
import { ScoredResult } from '@/ui/scored/ScoredResult';
import { overLimitSentence } from '@/ui/scored/scored-text';
import { Group } from '@/ui/layout';
import { StaffFiles } from '../staff-read';
import { staffText } from '../staff-text';
import { STATUS } from './feed';
import classes from './feed.module.css';

type ContestPath = { org: string; contest: string };

/**
 * A submission as its row reads it, with everything filled in, opened under
 * the submission in the feed: the same payload its entrant reads, scored by
 * the same code, with every value and run shown and each value saying when
 * its row sees it. The row
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
  const where = { ...path, task, number };
  const files = queryView(
    $api.useQuery(
      'get',
      '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/organise/submissions/{number}/files',
      { params: { path: where, query } },
    ),
  );
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
        The full result, as its entrant will see it once everything is shown. Each value
        says when its entrant sees it.
      </BodyText>
      <Loaded view={view}>
        {(scored) =>
          scored.grading === null ? (
            <BodyText tone="secondary">Not graded</BodyText>
          ) : (
            <>
              <Group gap={8}>
                <BodyText tone="secondary">
                  {scored.grading.status === 'over_limit'
                    ? overLimitSentence('the entrant', scored.grading.limit)
                    : STATUS[scored.grading.status]}
                </BodyText>
                {scored.grading.attempt !== entry.grading.attempt && (
                  <BodyText tone="secondary">
                    {`Attempt ${String(scored.grading.attempt)}'s result, the one that stands while attempt ${String(entry.grading.attempt)} has none.`}
                  </BodyText>
                )}
              </Group>
              {files.state === 'error' && (
                <ErrorBlock error={files.error} onRetry={files.retry} />
              )}
              {files.state === 'ready' && (
                <StaffFiles where={where} files={files.data} />
              )}
              <ScoredResult
                grading={scored.grading}
                readText={(ask) => staffText(where, entry.by.entrant, ask)}
              />
            </>
          )
        }
      </Loaded>
    </section>
  );
}
