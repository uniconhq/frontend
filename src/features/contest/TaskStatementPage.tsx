import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { $api, queryView } from '@/api/query';
import type { TaskPage } from '@/api/types';
import { Card } from '@/ui/Card';
import { Markdown } from '@/ui/Markdown';
import { PageLink } from '@/ui/PageLink';
import { PageTitle } from '@/ui/PageTitle';
import { SectionTitle } from '@/ui/SectionTitle';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { contestHomePath } from '@/lib/contest-paths';
import { useTaskParams } from '@/lib/route-params';
import { formatDateTime } from '@/lib/time';
import { TaskAnnouncements } from './threads/AnnouncementList';
import { BySession } from './BySession';
import { SignInPrompt } from './SignInPrompt';
import { TaskSubmissions } from './submit/TaskSubmissions';
import { headingOf } from './task-names';
import classes from './contest.module.css';

/** How often the page is read again, so a release or an extension reaches it. */
const MEANWHILE_MS = 60_000;

const PAGE = '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/page';

/** At most `count` in any window of `seconds`, in words. */
function rate(count: number, seconds: number): string {
  const window = seconds === 1 ? 'second' : `${seconds} seconds`;
  return `${count} in any ${window}`;
}

/**
 * When the task falls due, if it does, and closes for this person, their
 * extension included, and the caps a submit is counted against.
 */
function LimitList({ page }: { page: TaskPage }) {
  const { submissions } = page;
  return (
    <dl className={classes.limits} aria-label="Limits">
      {page.due !== null && (
        <>
          <dt>Due</dt>
          <dd>{formatDateTime(new Date(page.due))}</dd>
        </>
      )}
      {page.closes !== null && (
        <>
          <dt>Closes</dt>
          <dd>{formatDateTime(new Date(page.closes))}</dd>
        </>
      )}
      <dt>Submissions</dt>
      <dd>{submissions.max} in all</dd>
      <dt>How often</dt>
      <dd>{rate(submissions.rate.count, submissions.rate.per)}</dd>
    </dl>
  );
}

function Back({ org, contest }: { org: string; contest: string }) {
  return <PageLink to={contestHomePath(org, contest)}>Back to the contest</PageLink>;
}

/**
 * A released task as a signed-in person reads it: the statement, its times
 * and limits, the panel they submit from while the task is open, or why it
 * is not, with the countdowns to its due and close, and their submissions.
 * Crossing the due or the close reads the page again at once.
 */
function SignedInTask({
  org,
  contest,
  task,
}: {
  org: string;
  contest: string;
  task: string;
}) {
  const queryClient = useQueryClient();
  const view = queryView(
    $api.useQuery(
      'get',
      PAGE,
      { params: { path: { org, contest, task } } },
      { refetchInterval: MEANWHILE_MS },
    ),
  );
  const readAgain = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: $api.queryOptions('get', PAGE, {
        params: { path: { org, contest, task } },
      }).queryKey,
    });
  }, [queryClient, org, contest, task]);

  if (view.state === 'loading') return <PageSkeleton rows={6} />;
  if (view.state === 'error')
    return <ErrorBlock error={view.error} onRetry={view.retry} />;

  const page = view.data;
  return (
    <div className={classes.page}>
      <Back org={org} contest={contest} />
      <PageTitle>{headingOf(page)}</PageTitle>
      <TaskAnnouncements org={org} contest={contest} task={task} />
      <Card>
        <Markdown>{page.statement}</Markdown>
      </Card>
      <Card>
        <div className={classes.stack}>
          <SectionTitle>Limits</SectionTitle>
          <LimitList page={page} />
        </div>
      </Card>
      <TaskSubmissions
        org={org}
        contest={contest}
        task={task}
        page={page}
        onBoundary={readAgain}
      />
    </div>
  );
}

/**
 * A released task of a public contest as a visitor reads it, which is its
 * statement alone. Any other task asks them to sign in.
 */
function PublicTask({
  org,
  contest,
  task,
}: {
  org: string;
  contest: string;
  task: string;
}) {
  const view = queryView(
    $api.useQuery('get', '/api/v1/public/contests/{org}/{contest}/tasks/{task}', {
      params: { path: { org, contest, task } },
    }),
  );

  if (view.state === 'loading') return <PageSkeleton rows={6} />;
  if (view.state === 'error') {
    if (view.error.status === 404) {
      return (
        <SignInPrompt
          title="Sign in to see this task"
          back={<Back org={org} contest={contest} />}
        />
      );
    }
    return <ErrorBlock error={view.error} onRetry={view.retry} />;
  }

  const { task: found, statement } = view.data;
  return (
    <div className={classes.page}>
      <Back org={org} contest={contest} />
      <PageTitle>{headingOf(found)}</PageTitle>
      <Card>
        <Markdown>{statement}</Markdown>
      </Card>
    </div>
  );
}

/**
 * A task's page for a contestant or a visitor, at one address for both: the
 * statement, and for a signed-in person when it falls due and closes and the
 * caps a submit is counted against, why they may not submit now, when they may not, and their own
 * submissions, with the panel to make another while the task is open.
 */
export function TaskStatementPage() {
  const { org, contest, task } = useTaskParams();
  return (
    <BySession
      signedIn={<SignedInTask org={org} contest={contest} task={task} />}
      visitor={<PublicTask org={org} contest={contest} task={task} />}
    />
  );
}
