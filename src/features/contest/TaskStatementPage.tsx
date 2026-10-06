import { $api, queryView } from '@/api/query';
import type { Limits, TaskRelease } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Card } from '@/ui/Card';
import { Markdown } from '@/ui/Markdown';
import { PageLink } from '@/ui/PageLink';
import { PageTitle } from '@/ui/PageTitle';
import { SectionTitle } from '@/ui/SectionTitle';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { contestHomePath } from '@/lib/contest-paths';
import { useTaskParams } from '@/lib/route-params';
import { formatLimit } from '@/lib/size';
import { TaskAnnouncements } from './threads/AnnouncementList';
import { BySession } from './BySession';
import { SignInPrompt } from './SignInPrompt';
import { TaskSubmissions } from './submit/TaskSubmissions';
import { headingOf } from './task-names';
import classes from './contest.module.css';

/** How often the page is read again, so a closing reaches it. */
const MEANWHILE_MS = 60_000;

/** At most `count` in any window of `seconds`, in words. */
function rate(count: number, seconds: number): string {
  const window = seconds === 1 ? 'second' : `${seconds} seconds`;
  return `${count} in any ${window}`;
}

/** Why a released task takes no submission from this person now. */
const CLOSED: Record<NonNullable<TaskRelease['closed']>, string> = {
  not_released: 'This task is not released yet.',
  archived: 'The contest is archived.',
  ended: 'The contest has ended for you.',
  submissions_closed: 'The organisers have closed submissions.',
};

function LimitList({ limits }: { limits: Limits }) {
  return (
    <dl className={classes.limits} aria-label="Limits">
      <dt>Submissions</dt>
      <dd>{limits.submissions} in all</dd>
      <dt>How often</dt>
      <dd>{rate(limits.rate.count, limits.rate.per)}</dd>
      <dt>Largest submission</dt>
      <dd>{formatLimit(limits.max_size)}</dd>
    </dl>
  );
}

function Back({ org, contest }: { org: string; contest: string }) {
  return <PageLink to={contestHomePath(org, contest)}>Back to the contest</PageLink>;
}

/**
 * A released task as a signed-in person reads it: the statement, the limits,
 * the panel they submit from while the task is open, and their submissions.
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
  const view = queryView(
    $api.useQuery(
      'get',
      '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/page',
      { params: { path: { org, contest, task } } },
      { refetchInterval: MEANWHILE_MS },
    ),
  );

  if (view.state === 'loading') return <PageSkeleton rows={6} />;
  if (view.state === 'error')
    return <ErrorBlock error={view.error} onRetry={view.retry} />;

  const page = view.data;
  return (
    <div className={classes.page}>
      <Back org={org} contest={contest} />
      <PageTitle>{headingOf(page)}</PageTitle>
      {page.release.closed !== null && (
        <BodyText tone="secondary">{CLOSED[page.release.closed]}</BodyText>
      )}
      <TaskAnnouncements org={org} contest={contest} task={task} />
      <Card>
        <Markdown>{page.statement}</Markdown>
      </Card>
      <Card>
        <div className={classes.stack}>
          <SectionTitle>Limits</SectionTitle>
          <LimitList limits={page.limits} />
        </div>
      </Card>
      <TaskSubmissions org={org} contest={contest} task={task} page={page} />
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
 * statement, and for a signed-in person the limits a submit is checked
 * against, why they may not submit now, when they may not, and their own
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
