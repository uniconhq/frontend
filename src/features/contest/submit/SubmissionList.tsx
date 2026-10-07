import { useState } from 'react';
import { $api, queryView, type QueryView } from '@/api/query';
import type { Submission } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { PageLink } from '@/ui/PageLink';
import { verdictLabel } from '@/ui/verdicts';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { formatDateTime } from '@/lib/time';
import { useLiveConnected, useLiveRefused } from '@/live';
import { serverNow } from '@/lib/time';
import { justFinished, lateness, newestFirst, pollEvery, verdictOf } from './grading';
import { Verdict } from './Results';
import { submissionHref } from './submission-param';
import classes from './submit.module.css';

/**
 * The caller's own submissions of the task, newest first, each with where its
 * grading stands or what came back: read every two seconds while any is still
 * being graded, so a queued one moves on to its outcome without a reload.
 * The server answers with the caller's own alone.
 */
/**
 * What a screen reader is told as the list is read again: each submission
 * whose grading has just finished, with its verdict. The table changes in
 * place, which a screen reader does not say on its own. The last read is
 * kept in state and compared as the component renders, so nothing is said on
 * the first read.
 */
function useJustFinished(submissions: Submission[] | undefined): string {
  const [previous, setPrevious] = useState(submissions);
  const [said, setSaid] = useState('');
  if (submissions !== previous) {
    setPrevious(submissions);
    const finished = justFinished(previous, submissions);
    if (finished.length > 0) {
      setSaid(
        finished
          .map(
            (found) =>
              `Submission #${found.number}: ${
                found.grading === null
                  ? 'Not graded'
                  : verdictLabel(verdictOf(found.grading))
              }.`,
          )
          .join(' '),
      );
    }
  }
  return said;
}

export function SubmissionList({
  org,
  contest,
  task,
}: {
  org: string;
  contest: string;
  task: string;
}) {
  const live = useLiveConnected();
  const refused = useLiveRefused();
  const view = queryView(
    $api.useQuery(
      'get',
      '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/submissions',
      { params: { path: { org, contest, task } } },
      {
        refetchInterval: (query) =>
          pollEvery(query.state.data, serverNow(), live, refused),
      },
    ),
  );

  const said = useJustFinished(view.state === 'ready' ? view.data : undefined);

  return (
    <>
      <div role="status" className={classes.announce}>
        {said}
      </div>
      <Listed view={view} />
    </>
  );
}

function Listed({ view }: { view: QueryView<Submission[]> }) {
  if (view.state === 'loading') return <PageSkeleton rows={2} />;
  if (view.state === 'error')
    return <ErrorBlock error={view.error} onRetry={view.retry} />;
  if (view.data.length === 0) {
    return (
      <BodyText tone="secondary">You have not submitted to this task yet.</BodyText>
    );
  }

  return (
    <table className={classes.table} aria-label="Your submissions">
      <thead>
        <tr>
          <th scope="col">Submission</th>
          <th scope="col">Submitted</th>
          <th scope="col">Result</th>
        </tr>
      </thead>
      <tbody>
        {newestFirst(view.data).map((submission) => (
          <tr key={submission.number}>
            <th scope="row">
              <PageLink to={submissionHref(submission.number)} mono>
                #{submission.number}
              </PageLink>
            </th>
            <td>
              {formatDateTime(new Date(submission.submitted_at))}
              {submission.late_days > 0 && (
                <BodyText tone="secondary">{lateness(submission.late_days)}</BodyText>
              )}
            </td>
            <td>
              <Verdict grading={submission.grading} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
