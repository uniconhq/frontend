import { apiClient } from '@/api/client';
import { $api, queryView } from '@/api/query';
import type { InputField } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { PageLink } from '@/ui/PageLink';
import { OutLink } from '@/ui/OutLink';
import { SectionTitle } from '@/ui/SectionTitle';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { Grading } from '@/ui/scored/Grading';
import type { TextAsk } from '@/ui/scored/ScoredResult';
import { formatDateTime } from '@/lib/time';
import { readShownFiles } from './download';
import { nameOf, submittedItems } from '@/lib/submitted';
import { useLiveConnected, useLiveRefused } from '@/live';
import { serverNow } from '@/lib/time';
import { pollEvery } from './grading';
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
 * What the submission was made with, input by input: each file a download of
 * the file as it was submitted, whatever its size, named with its input as
 * the form names it (its label; its key only for an input the task no longer
 * has), and each value given, as it was given; an input given in parts
 * has each part under it.
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
  const { files, values } = submittedItems(view.data.inputs, fields);
  return (
    <>
      {files.length > 0 && (
        <ul className={classes.files} aria-label="Files">
          {files.map(({ key, label, path, href }) => (
            <li key={key}>
              {label}: <OutLink href={href}>{nameOf(path)}</OutLink>
            </li>
          ))}
        </ul>
      )}
      {values.length > 0 && (
        <ul className={classes.files} aria-label="Values given">
          {values.map(({ key, label, value }) => (
            <li key={key}>
              {label}: {value}
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
              readFiles={(ask) => readShownFiles(where, ask)}
            />
          )}
        </>
      )}
    </section>
  );
}
