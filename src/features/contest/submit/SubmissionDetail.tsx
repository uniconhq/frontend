import { $api, queryView } from '@/api/query';
import type { GradingResult, GroupShown } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { PageLink } from '@/ui/PageLink';
import { TextLink } from '@/ui/TextLink';
import { SectionTitle } from '@/ui/SectionTitle';
import { VerdictBadge } from '@/ui/VerdictBadge';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { formatDateTime } from '@/lib/time';
import { downloadHref, nameOf } from './download';
import { useLiveConnected, useLiveRefused } from '@/live';
import { serverNow } from '@/lib/time';
import { cancelReason, lateness, pollEvery, valueText, verdictOf } from './grading';
import { OnceValues } from './Results';
import shared from '../contest.module.css';
import classes from './submit.module.css';

type Where = { org: string; contest: string; task: string; number: number };

/**
 * One row per test of a group, with its own outcome and each value its steps
 * reported for it, such as its time and memory, a column per value.
 */
function Tests({ group }: { group: GroupShown }) {
  const rows = group.tests ?? [];
  if (rows.length === 0) return null;
  const names = [...new Set(rows.flatMap((row) => Object.keys(row.values)))];
  return (
    <table className={classes.table} aria-label={`Tests ${group.group}`}>
      <thead>
        <tr>
          <th scope="col">Test</th>
          <th scope="col">Outcome</th>
          {names.map((name) => (
            <th key={name} scope="col">
              {name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.test}>
            <th scope="row" className={classes.mono}>
              {row.test}
            </th>
            <td>
              <VerdictBadge verdict={row.outcome} />
            </td>
            {names.map((name) => {
              const value = row.values[name];
              return <td key={name}>{value === undefined ? '—' : valueText(value)}</td>;
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * One test group as the task shows it now: its outcome once its verdict is
 * shown, its tests once they are, and when the rest is shown while some is
 * held back. The route leaves out what the task withholds, so what is
 * missing is simply not shown, with nothing in its place. A group that did
 * not run on this grading says so where its outcome would be.
 */
function Group({ group }: { group: GroupShown }) {
  return (
    <section className={shared.stack} aria-label={`Group ${group.group}`}>
      <div className={classes.verdict}>
        <span className={classes.group}>{group.group}</span>
        {!group.ran ? (
          <BodyText tone="secondary">Not run on this grading</BodyText>
        ) : (
          group.outcome !== null && <VerdictBadge verdict={group.outcome} />
        )}
      </div>
      {group.shown_at !== null && (
        <BodyText tone="secondary">
          Shown at {formatDateTime(new Date(group.shown_at))}
        </BodyText>
      )}
      <Tests group={group} />
    </section>
  );
}

/**
 * What the grading holds for the contestant: its verdict, what the run
 * reported once, such as a compile log, and each test group as the task
 * shows it. A grading the organisers cancelled holds their sentence instead,
 * and says the submission no longer counts against the task's limit.
 */
function Grading({ grading }: { grading: GradingResult }) {
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
        <BodyText tone="secondary">
          It is not graded, and it does not count against the task&apos;s limit on
          submissions.
        </BodyText>
      </>
    );
  }
  return (
    <>
      <div className={classes.verdict}>
        <VerdictBadge verdict={verdictOf(grading)} />
        {grading.attempt > 1 && (
          <BodyText tone="secondary">Attempt {grading.attempt}</BodyText>
        )}
      </div>
      <OnceValues values={grading.values} />
      {grading.groups.map((group) => (
        <Group key={group.group} group={group} />
      ))}
    </>
  );
}

/**
 * The files the submission was made with, each a download of the file as it
 * was submitted, whatever its size.
 */
function Files({ where }: { where: Where }) {
  const view = queryView(
    $api.useQuery(
      'get',
      '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/submissions/{number}/files',
      { params: { path: where } },
    ),
  );
  if (view.state === 'loading') return <PageSkeleton rows={1} />;
  if (view.state === 'error') return <ErrorBlock error={view.error} compact />;
  const paths = Object.values(view.data.inputs).flatMap((input) => input.files);
  if (paths.length === 0) return null;
  return (
    <ul className={classes.files} aria-label="Files">
      {paths.map((path) => (
        <li key={path}>
          <TextLink href={downloadHref(where, path)}>{nameOf(path)}</TextLink>
        </li>
      ))}
    </ul>
  );
}

/**
 * One of the caller's submissions, opened from the list: when it was made and
 * how late, the files it was made with, and its grading, read again every two
 * seconds while it is still to finish.
 */
export function SubmissionDetail({
  org,
  contest,
  task,
  number,
  closeTo,
}: Where & {
  /** Where closing it goes: the task page without the submission open. */
  closeTo: string;
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
            {view.data.late_days > 0 && `, ${lateness(view.data.late_days)}`}
          </BodyText>
          <Files where={where} />
          {view.data.grading === null ? (
            <BodyText tone="secondary">Not graded</BodyText>
          ) : (
            <Grading grading={view.data.grading} />
          )}
        </>
      )}
    </section>
  );
}
