import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { $api, queryView } from '@/api/query';
import type { TaskPage } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Card } from '@/ui/Card';
import { Markdown } from '@/ui/Markdown';
import { PageLink } from '@/ui/PageLink';
import { PageTitle } from '@/ui/PageTitle';
import { BackToOrganising } from './BackToOrganising';
import { SectionTitle } from '@/ui/SectionTitle';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { contestHomePath } from '@/lib/contest-paths';
import { formatWorth, withPointsWord } from '@/lib/exact';
import { useTaskParams } from '@/lib/route-params';
import { contestViewSectionPath } from '@/lib/sections';
import { formatDateTime } from '@/lib/time';
import { TaskAnnouncements } from './threads/AnnouncementList';
import { ASK_ABOUT } from './threads/questions';
import { BySession } from './BySession';
import { SignInPrompt } from './SignInPrompt';
import { TaskCountdown } from './TaskCountdown';
import { TaskSubmissions } from './submit/TaskSubmissions';
import { headingOf } from './task-names';
import classes from './contest.module.css';

/** How often the page is read again, so a release or an extension reaches it. */
const MEANWHILE_MS = 60_000;

const PAGE = '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/page';

/** At most `count` in any window of `seconds`, in words. */
function rate(count: number, seconds: number): string {
  const window = seconds === 1 ? 'second' : `${seconds} seconds`;
  return `At most ${count} in any ${window}`;
}

/**
 * What the task is worth, the most points it gives, on a task that gives
 * points; when it falls due, if it does, and closes for this person, their
 * extension included; and the caps a submit is counted against.
 */
function LimitList({ page }: { page: TaskPage }) {
  const { submissions } = page;
  return (
    <dl className={classes.limits} aria-label="Limits">
      {page.worth !== null && (
        <>
          <dt>Worth</dt>
          <dd>{withPointsWord(formatWorth(page.worth))}</dd>
        </>
      )}
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
      <dt>Submissions allowed</dt>
      <dd>{submissions.max} in all</dd>
      <dt>Submission rate</dt>
      <dd>{rate(submissions.rate.count, submissions.rate.per)}</dd>
    </dl>
  );
}

function Back({ org, contest }: { org: string; contest: string }) {
  return <PageLink to={contestHomePath(org, contest)}>Back to the contest</PageLink>;
}

/**
 * A task the person cannot open, in words with the way back to the contest:
 * one not released yet, one the organisers withdrew or removed from the
 * contest, as a link kept from before reaches it, or a wrong address. They
 * read alike, so a withdrawn task says nothing of itself.
 */
function NoSuchTask({ org, contest }: { org: string; contest: string }) {
  return (
    <div className={classes.page}>
      <div className={classes.links}>
        <Back org={org} contest={contest} />
      </div>
      <PageTitle>Task not found</PageTitle>
      <BodyText>
        It is not released yet, the organisers took it out of the contest, or the
        address is wrong. The contest’s page lists the tasks you can open.
      </BodyText>
    </div>
  );
}

/**
 * A released task as a signed-in person reads it: first the time left on it
 * for them, counted to its due and its close, and the way to ask the
 * organisers about it; then its announcements, the statement, its times and
 * limits, the panel they submit from while the task is open, or why it is
 * not, and their submissions. Crossing the due or the close reads the page
 * again at once.
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
  if (view.state === 'error') {
    if (view.error.status === 404) return <NoSuchTask org={org} contest={contest} />;
    return <ErrorBlock error={view.error} onRetry={view.retry} />;
  }

  const page = view.data;
  const asks = page.release.closed !== 'not_approved';
  return (
    <div className={classes.page}>
      <div className={classes.links}>
        <Back org={org} contest={contest} />
        <BackToOrganising org={org} contest={contest} />
      </div>
      <PageTitle>{headingOf(page)}</PageTitle>
      <TaskCountdown due={page.due} closes={page.closes} onBoundary={readAgain} />
      {asks && (
        <div className={classes.links}>
          <PageLink
            to={`${contestViewSectionPath(org, contest, 'questions')}?${ASK_ABOUT}=${encodeURIComponent(task)}`}
          >
            Ask a question about this task
          </PageLink>
        </div>
      )}
      <TaskAnnouncements org={org} contest={contest} task={task} />
      <Card>
        <Markdown task={{ org, contest, task }}>{page.statement}</Markdown>
      </Card>
      <Card>
        <div className={classes.stack}>
          <SectionTitle>Limits</SectionTitle>
          <LimitList page={page} />
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
        <Markdown task={{ org, contest, task }}>{statement}</Markdown>
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
