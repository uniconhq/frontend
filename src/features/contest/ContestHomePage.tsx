import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { $api, queryView } from '@/api/query';
import type { ContestHome, MyRegistration, PublicTask } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Card } from '@/ui/Card';
import { PageLink } from '@/ui/PageLink';
import { PageTitle } from '@/ui/PageTitle';
import { SectionTitle } from '@/ui/SectionTitle';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { taskPagePath } from '@/lib/contest-paths';
import { useContestParams } from '@/lib/route-params';
import { formatDateTime } from '@/lib/time';
import { ContestAnnouncements } from './threads/AnnouncementList';
import { QuestionsSection } from './threads/QuestionsSection';
import { TeamSection } from './teams/TeamSection';
import { BySession } from './BySession';
import { Countdown } from './Countdown';
import { RegistrationPanel } from './RegistrationPanel';
import { SignInButtons, SignInPrompt } from './SignInPrompt';
import { labelOf } from './task-names';
import classes from './contest.module.css';

/**
 * How often the home is read again: soon while the caller waits on an
 * organiser, and now and then otherwise, so an extension or a task released
 * by its own time reaches the page. Crossing the start or the deadline reads
 * it again at once.
 */
const WAITING_ON_ORGANISER_MS = 10_000;
const MEANWHILE_MS = 60_000;

function pollEvery(registration: MyRegistration | null | undefined): number {
  return registration?.status === 'pending' ? WAITING_ON_ORGANISER_MS : MEANWHILE_MS;
}

/** A contest's released tasks, each a link to its page. */
function TaskList({
  org,
  contest,
  tasks,
}: {
  org: string;
  contest: string;
  tasks: PublicTask[];
}) {
  if (tasks.length === 0) {
    return <BodyText tone="secondary">No task is released yet.</BodyText>;
  }
  return (
    <ul className={classes.tasks} aria-label="Tasks">
      {tasks.map((task) => {
        const label = labelOf(task);
        return (
          <li key={task.name} className={classes.task}>
            {label !== null && <span className={classes.label}>{label}</span>}
            <PageLink to={taskPagePath(org, contest, task.name)}>{task.title}</PageLink>
          </li>
        );
      })}
    </ul>
  );
}

function Dates({ start, end }: { start: string; end: string }) {
  return (
    <div className={classes.dates}>
      <BodyText tone="secondary">Starts {formatDateTime(new Date(start))}</BodyText>
      <BodyText tone="secondary">Ends {formatDateTime(new Date(end))}</BodyText>
    </div>
  );
}

/** The home as a signed-in person reads it, registration and countdown included. */
function SignedInHome({ org, contest }: { org: string; contest: string }) {
  const queryClient = useQueryClient();
  const view = queryView(
    $api.useQuery(
      'get',
      '/api/v1/orgs/{org}/contests/{contest}/home',
      { params: { path: { org, contest } } },
      { refetchInterval: (query) => pollEvery(query.state.data?.registration) },
    ),
  );
  const readAgain = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: $api.queryOptions('get', '/api/v1/orgs/{org}/contests/{contest}/home', {
        params: { path: { org, contest } },
      }).queryKey,
    });
  }, [queryClient, org, contest]);

  if (view.state === 'loading') return <PageSkeleton rows={4} />;
  if (view.state === 'error')
    return <ErrorBlock error={view.error} onRetry={view.retry} />;
  return <Home org={org} contest={contest} home={view.data} onBoundary={readAgain} />;
}

function Home({
  org,
  contest,
  home,
  onBoundary,
}: {
  org: string;
  contest: string;
  home: ContestHome;
  onBoundary: () => void;
}) {
  const extended = Date.parse(home.deadline) !== Date.parse(home.end);
  return (
    <div className={classes.page}>
      <PageTitle>{home.name}</PageTitle>
      {home.state === 'draft' && (
        <BodyText tone="secondary">
          This contest is a draft, so only its organisers see it.
        </BodyText>
      )}
      {home.description !== '' && <BodyText size="md">{home.description}</BodyText>}
      <Card>
        <div className={classes.stack}>
          <Dates start={home.start} end={home.end} />
          <Countdown
            start={home.start}
            deadline={home.deadline}
            onBoundary={onBoundary}
          />
          {extended && (
            <BodyText tone="secondary">
              Your time runs until {formatDateTime(new Date(home.deadline))}, with the
              extra time the organisers gave you.
            </BodyText>
          )}
          <RegistrationPanel org={org} contest={contest} home={home} />
        </div>
      </Card>
      {home.registration?.status === 'approved' && (
        <TeamSection org={org} contest={contest} end={home.end} state={home.state} />
      )}
      <Card>
        <div className={classes.stack}>
          <SectionTitle>Tasks</SectionTitle>
          <TaskList org={org} contest={contest} tasks={home.tasks} />
        </div>
      </Card>
      <Card>
        <ContestAnnouncements org={org} contest={contest} />
      </Card>
      {home.registration?.status === 'approved' && (
        <Card>
          <QuestionsSection
            org={org}
            contest={contest}
            tasks={home.tasks.map((task) => ({ name: task.name, title: task.title }))}
          />
        </Card>
      )}
    </div>
  );
}

/**
 * The contest as a visitor sees it: only a public contest and its released
 * tasks, with a way to sign in to register. A contest that is not public asks
 * them to sign in first, since it may be one they can see with a session.
 */
function PublicHome({ org, contest }: { org: string; contest: string }) {
  const view = queryView(
    $api.useQuery('get', '/api/v1/public/contests/{org}/{contest}', {
      params: { path: { org, contest } },
    }),
  );

  if (view.state === 'loading') return <PageSkeleton rows={4} />;
  if (view.state === 'error') {
    if (view.error.status === 404) {
      return <SignInPrompt title="Sign in to see this contest" />;
    }
    return <ErrorBlock error={view.error} onRetry={view.retry} />;
  }

  const found = view.data;
  return (
    <div className={classes.page}>
      <PageTitle>{found.name}</PageTitle>
      {found.description !== '' && <BodyText size="md">{found.description}</BodyText>}
      <Card>
        <div className={classes.stack}>
          <Dates start={found.start} end={found.end} />
          <BodyText>Sign in to register for this contest.</BodyText>
          <SignInButtons />
        </div>
      </Card>
      <Card>
        <div className={classes.stack}>
          <SectionTitle>Tasks</SectionTitle>
          <TaskList org={org} contest={contest} tasks={found.tasks} />
        </div>
      </Card>
    </div>
  );
}

/**
 * A contest's page for a contestant or a visitor, at one address for both.
 * A signed-in person reads the home, which follows their registration from
 * the register button through pending to the contest itself, read again
 * while they wait on an organiser. A visitor
 * reads the public contest.
 */
export function ContestHomePage() {
  const { org, contest } = useContestParams();
  return (
    <BySession
      signedIn={<SignedInHome org={org} contest={contest} />}
      visitor={<PublicHome org={org} contest={contest} />}
    />
  );
}
