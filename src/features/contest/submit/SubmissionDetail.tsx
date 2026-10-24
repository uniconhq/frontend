import { apiClient } from '@/api/client';
import { $api, queryView } from '@/api/query';
import type { GradingResult, InputField } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { PageLink } from '@/ui/PageLink';
import { OutLink } from '@/ui/OutLink';
import { SectionTitle } from '@/ui/SectionTitle';
import { VerdictBadge } from '@/ui/VerdictBadge';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { ScoredResult, type TextAsk } from '@/ui/scored/ScoredResult';
import { formatDateTime } from '@/lib/time';
import { downloadHref, nameOf } from './download';
import { useLiveConnected, useLiveRefused } from '@/live';
import { serverNow } from '@/lib/time';
import { DELAYED_SENTENCE, cancelReason, pollEvery } from './grading';
import { overLimitSentence } from '@/ui/scored/scored-text';
import shared from '../contest.module.css';
import classes from './submit.module.css';

type Where = { org: string; contest: string; task: string; number: number };

/** A text the submission shows, read when its row is opened. */
function readText(where: Where, ask: TextAsk): Promise<string> {
  return apiClient
    .GET(
      '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/submissions/{number}/text',
      {
        params: {
          path: where,
          query: {
            field: ask.field,
            group: ask.group ?? undefined,
            place: ask.place ?? undefined,
            name: ask.name ?? undefined,
          },
        },
        parseAs: 'text',
      },
    )
    .then((found) => found.data ?? '');
}

/**
 * What the grading holds for the entrant: its verdict, the values and runs
 * the task shows, and what its steps done once reported, such as a compile
 * log. A grading the organisers cancelled holds their sentence instead,
 * and says the submission no longer counts against the task's limit: a cancel
 * with a sentence is the one the forge leaves out of the limit, so one
 * without (made before cancels carried one) says nothing about the limit. A
 * delayed one says its grading failed on Unicon's side, and nothing else;
 * one over the limit, that it was not graded and why (#445).
 */
function Grading({
  grading,
  readText,
}: {
  grading: GradingResult;
  readText: (ask: TextAsk) => Promise<string>;
}) {
  if (grading.status === 'delayed') {
    return (
      <>
        <div className={classes.verdict}>
          <VerdictBadge verdict="delayed" />
        </div>
        <BodyText>{DELAYED_SENTENCE}</BodyText>
      </>
    );
  }
  if (grading.status === 'over_limit') {
    return (
      <>
        <div className={classes.verdict}>
          <VerdictBadge verdict="over_limit" />
        </div>
        <BodyText>{overLimitSentence('you', grading.limit)}</BodyText>
        <BodyText tone="secondary">
          It has no result and counts on no leaderboard.
        </BodyText>
      </>
    );
  }
  if (grading.status === 'cancelled') {
    const reason = cancelReason(grading);
    return (
      <>
        <div className={classes.verdict}>
          <VerdictBadge verdict="cancelled" />
        </div>
        <BodyText>
          Cancelled by the organisers{reason === null ? '.' : `: ${reason}`}
        </BodyText>
        {reason !== null && (
          <BodyText tone="secondary">
            It is not graded, and it does not count against the task&apos;s limit on
            submissions.
          </BodyText>
        )}
      </>
    );
  }
  return (
    <>
      <div className={classes.verdict}>
        <VerdictBadge verdict={grading.status} />
        {/* Entrants' pages speak of a submission, not of its gradings' attempts. */}
        {grading.attempt > 1 && <BodyText tone="secondary">Graded again</BodyText>}
      </div>
      <ScoredResult grading={grading} readText={readText} />
    </>
  );
}

/**
 * What the submission was made with, input by input: each file a download of
 * the file as it was submitted, whatever its size, named with its input as
 * the form names it (its label; its key only for an input the task no longer
 * has), and each value given, as it was given.
 */
function Files({ where, inputs: fields }: { where: Where; inputs: InputField[] }) {
  const view = queryView(
    $api.useQuery(
      'get',
      '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/submissions/{number}/files',
      { params: { path: where } },
    ),
  );
  if (view.state === 'loading') return <PageSkeleton rows={1} />;
  if (view.state === 'error') return <ErrorBlock error={view.error} compact />;
  const labelOf = (id: string) => fields.find((field) => field.id === id)?.label ?? id;
  const inputs = Object.entries(view.data.inputs);
  const files = inputs.flatMap(([id, input]) =>
    input.files.map((path) => ({ id, path })),
  );
  const values = inputs.flatMap(([id, input]) =>
    input.value === null ? [] : [{ id, value: String(input.value) }],
  );
  return (
    <>
      {files.length > 0 && (
        <ul className={classes.files} aria-label="Files">
          {files.map(({ id, path }) => (
            <li key={path}>
              {labelOf(id)}:{' '}
              <OutLink href={downloadHref(where, path)}>{nameOf(path)}</OutLink>
            </li>
          ))}
        </ul>
      )}
      {values.length > 0 && (
        <ul className={classes.files} aria-label="Values given">
          {values.map(({ id, value }) => (
            <li key={id}>
              {labelOf(id)}: {value}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/**
 * One of the caller's submissions, opened from the list: when it was made and
 * how late, the files it was made with, and its grading, read again while it
 * is still to finish as the list is (`pollEvery`).
 */
export function SubmissionDetail({
  org,
  contest,
  task,
  number,
  closeTo,
  inputs,
}: Where & {
  /** Where closing it goes: the task page without the submission open. */
  closeTo: string;
  /** The task's inputs as its form names them. */
  inputs: InputField[];
}) {
  const live = useLiveConnected();
  const refused = useLiveRefused();
  const view = queryView(
    $api.useQuery(
      'get',
      '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/submissions/{number}',
      { params: { path: { org, contest, task, number } } },
      {
        refetchInterval: (query) =>
          pollEvery(query.state.data, serverNow(), live, refused),
      },
    ),
  );
  const where = { org, contest, task, number };

  return (
    <section className={shared.stack} aria-label={`Submission ${number}`}>
      <div className={classes.heading}>
        <SectionTitle>Submission #{number}</SectionTitle>
        <PageLink to={closeTo}>Close</PageLink>
      </div>
      {view.state === 'loading' && <PageSkeleton rows={3} />}
      {view.state === 'error' && <ErrorBlock error={view.error} onRetry={view.retry} />}
      {view.state === 'ready' && (
        <>
          <BodyText tone="secondary">
            Submitted {formatDateTime(new Date(view.data.submitted_at))}
          </BodyText>
          <Files where={where} inputs={inputs} />
          {view.data.grading === null ? (
            <BodyText tone="secondary">Not graded</BodyText>
          ) : (
            <Grading
              grading={view.data.grading}
              readText={(ask) => readText(where, ask)}
            />
          )}
        </>
      )}
    </section>
  );
}
