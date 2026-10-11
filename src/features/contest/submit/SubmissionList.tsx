import { useState } from 'react';
import { $api, queryView, type QueryView } from '@/api/query';
import type { Submission } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Checkbox } from '@/ui/Checkbox';
import { PageLink } from '@/ui/PageLink';
import { verdictLabel } from '@/ui/verdicts';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { formatDateTime } from '@/lib/time';
import { useLiveConnected, useLiveRefused } from '@/live';
import { serverNow } from '@/lib/time';
import {
  justFinished,
  lateness,
  newestFirst,
  pointsLine,
  pollEvery,
  verdictOf,
} from './grading';
import { Verdict } from './Results';
import { submissionHref } from './submission-param';
import { useMarks, type MarkState } from './use-marks';
import classes from './submit.module.css';

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

/**
 * The caller's own submissions of the task, newest first, each with where its
 * grading stands or what came back: read again while any is still being
 * graded, soon at first and less often the longer it waits (`pollEvery`),
 * and once a minute while the live stream tells the page, so a queued one
 * moves on to its outcome without a reload. The server answers with the
 * caller's own alone. On a task a `marked` board covers, each also has the
 * row's mark on it, a toggle until the row's close. On a task that gives
 * points, each row says its points too, so whether it scored needs no click.
 */
export function SubmissionList({
  org,
  contest,
  task,
  marked,
  points,
}: {
  org: string;
  contest: string;
  task: string;
  /** Whether the task page says the reader's row may mark submissions here. */
  marked: boolean;
  /** Whether the task gives points, and so each row says its own. */
  points: boolean;
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
  const marks = useMarks({ org, contest, task }, marked);

  return (
    <>
      <div role="status" className={classes.announce}>
        {said}
      </div>
      {marks.kind === 'held' && <MarksSummary state={marks} />}
      <Listed view={view} marks={marks} points={points} />
    </>
  );
}

/**
 * How many submissions the row has marked of the most it may, until when,
 * and why a mark was refused. A team's members share the one set.
 */
function MarksSummary({ state }: { state: Extract<MarkState, { kind: 'held' }> }) {
  const { marks, refusal } = state;
  const until = formatDateTime(new Date(marks.closes_at));
  return (
    <>
      <BodyText tone="secondary">
        {marks.frozen
          ? `Your marks are final: ${marks.numbers.length} of ${marks.most} marked.`
          : `Marked ${marks.numbers.length} of ${marks.most}. The boards that count marks count the best of those you mark, and you may change them until ${until}.`}
      </BodyText>
      {refusal !== null && (
        <div role="alert">
          <ErrorBlock error={refusal} compact />
        </div>
      )}
    </>
  );
}

/** A submission's mark: a toggle until the row's close, then whether it is marked. */
function MarkCell({
  state,
  number,
}: {
  state: Extract<MarkState, { kind: 'held' }>;
  number: number;
}) {
  const marked = state.marks.numbers.includes(number);
  if (state.marks.frozen) return <>{marked ? 'Marked' : ''}</>;
  return (
    <Checkbox
      label={`Mark #${number}`}
      checked={marked}
      disabled={state.busy}
      onChange={(checked) => state.toggle(number, checked)}
    />
  );
}

function Listed({
  view,
  marks,
  points,
}: {
  view: QueryView<Submission[]>;
  marks: MarkState;
  points: boolean;
}) {
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
          {points && <th scope="col">Points</th>}
          {marks.kind === 'held' && <th scope="col">Mark</th>}
        </tr>
      </thead>
      <tbody>
        {newestFirst(view.data).map((submission) => (
          <tr key={submission.number}>
            <th scope="row">
              <PageLink to={submissionHref(submission.number)}>
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
            {points && (
              <td className={classes.points}>{pointsLine(submission.grading)}</td>
            )}
            {marks.kind === 'held' && (
              <td>
                <MarkCell state={marks} number={submission.number} />
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
