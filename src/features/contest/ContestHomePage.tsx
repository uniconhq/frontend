import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { $api, queryView } from '@/api/query';
import { useServerClock } from '@/api/use-server-time';
import type { ContestHome, PublicTask, TaskEntry } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Card } from '@/ui/Card';
import { PageLink } from '@/ui/PageLink';
import { Page, PageHeader } from '@/ui/Page';
import { SectionTitle } from '@/ui/SectionTitle';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { taskPoints } from '@/ui/leaderboards/points';
import { ShownValue } from '@/ui/number/ShownValue';
import { formatExact } from '@/lib/exact';
import { LeaderboardTable } from '@/ui/leaderboards/table';
import { taskPagePath } from '@/lib/contest-paths';
import { contestPath } from '@/lib/organiser-paths';
import { contestStaff } from '@/lib/viewer';
import { useSession } from '@/session';
import { useContestParams } from '@/lib/route-params';
import { contestViewSectionPath, entrantGradingsPath } from '@/lib/sections';
import { formatDateTime } from '@/lib/time';
import { ContestAnnouncements } from './threads/AnnouncementList';
import { useMyQuestions } from './threads/questions';
import { BySession } from './BySession';
import { useAnchor } from '@/ui/anchor';
import { Countdown } from '@/ui/Countdown';
import { entryPollEvery } from './entry/poll';
import { YourEntry } from './entry/YourEntry';
import { notIn, TASK_STANDING } from './entry/not-in';
import { SignInButtons, SignInPrompt } from './SignInPrompt';
import { labelOf } from './task-names';
import { submissionHref } from './submit/submission-param';
import { taskTimeLines } from './time-left';
import classes from './contest.module.css';

/** How often a standing on the home is read again, as the leaderboards page is. */
const STANDING_MS = 30_000;

/**
 * Where a task stands for the reader, when it is not simply open; for one
 * who is not an approved entrant, what is true for them (`TASK_STANDING`).
 */
const NOT_OPEN: Record<
  Exclude<NonNullable<TaskEntry['release']['closed']>, 'not_approved'>,
  string | null
> = {
  not_released: 'Not released yet',
  archived: 'No longer takes submissions',
  closed: null,
  withdrawn: 'Withdrawn from the contest',
};

/**
 * Where one task stands for the reader and what is left of it: open, with
 * how long until it falls due and closes for them, their extra time
 * included; or why it takes nothing from them now.
 */
function Standing({
  task,
  at,
  counting,
  notApproved,
}: {
  task: TaskEntry;
  at: number;
  counting: boolean;
  notApproved: string;
}) {
  const { closed } = task.release;
  const reason =
    closed === null ? null : closed === 'not_approved' ? notApproved : NOT_OPEN[closed];
  const lines = taskTimeLines(task.due, task.closes, at, counting);
  const shown =
    reason !== null
      ? [
          { key: 'why', text: reason },
          ...(task.release.closed === 'not_approved' ? lines : []),
        ]
      : lines.length > 0
        ? lines
        : [{ key: 'open', text: 'Open' }];
  return (
    <span className={classes.standing}>
      {shown.map(({ key, text }) => (
        <span key={key}>{text}</span>
      ))}
    </span>
  );
}

/**
 * A contest's released tasks as a signed-in person works from them, in the
 * contest's order: each a link to its page, and where it stands for them,
 * the time left on it counted down by the server's clock.
 */
function TaskList({
  org,
  contest,
  tasks,
  notApproved,
  standing,
  staff,
}: {
  org: string;
  contest: string;
  tasks: TaskEntry[];
  /** Where a task stands for a reader who is not an approved entrant. */
  notApproved: string;
  standing: ContestHome['standing'];
  /** The most a column can show is told to staff only. */
  staff: boolean;
}) {
  const { at, measured } = useServerClock();
  if (tasks.length === 0) {
    return <BodyText tone="secondary">No tasks are released yet.</BodyText>;
  }
  return (
    <ul className={classes.tasks} aria-label="Tasks">
      {tasks.map((task) => (
        <li key={task.name} className={classes.task}>
          <span className={classes.label}>{labelOf(task)}</span>
          <PageLink to={taskPagePath(org, contest, task.name)}>{task.title}</PageLink>
          {taskPoints(task.name, standing).map((points) => (
            <span key={points.board}>
              <ShownValue number={points.number} places={points.places} />
              {staff && points.most !== null && ` / ${formatExact(points.most)}`}
            </span>
          ))}
          <Standing task={task} at={at} counting={measured} notApproved={notApproved} />
        </li>
      ))}
    </ul>
  );
}

/** A public contest's released tasks as a visitor reads them: each a link to its statement. */
function PublicTaskList({
  org,
  contest,
  tasks,
}: {
  org: string;
  contest: string;
  tasks: PublicTask[];
}) {
  if (tasks.length === 0) {
    return <BodyText tone="secondary">No tasks are released yet.</BodyText>;
  }
  return (
    <ul className={classes.tasks} aria-label="Tasks">
      {tasks.map((task) => (
        <li key={task.name} className={classes.task}>
          <span className={classes.label}>{labelOf(task)}</span>
          <PageLink to={taskPagePath(org, contest, task.name)}>{task.title}</PageLink>
        </li>
      ))}
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

/** The viewer's own row of each leaderboard they can read. */
function LeaderboardCard({
  org,
  contest,
  standing,
  staff,
}: {
  org: string;
  contest: string;
  standing: ContestHome['standing'];
  staff: boolean;
}) {
  // Staff open the entrant's submissions to the task; anyone else, who
  // reads only their own row, their own submission. A standing is an
  // approved entrant's, so the staff branch is for one who is staff too.
  const open = (task: string, number: number, entrant: string) =>
    staff
      ? entrantGradingsPath(org, contest, task, entrant)
      : `${taskPagePath(org, contest, task)}${submissionHref(number)}`;
  return (
    <Card>
      <div className={classes.stack}>
        <SectionTitle>Leaderboards</SectionTitle>
        {standing.length === 0 ? (
          <BodyText tone="secondary">Nothing is on a leaderboard yet.</BodyText>
        ) : (
          standing.map((board) => (
            <LeaderboardTable
              key={board.key}
              board={board}
              submissionTo={open}
              staff={staff}
            />
          ))
        )}
      </div>
    </Card>
  );
}

/**
 * A visitor, or a signed-in person who is not an approved entrant, has no
 * row here. The leaderboards are the contest's own page.
 */
function LeaderboardsLink({ org, contest }: { org: string; contest: string }) {
  return (
    <Card>
      <div className={classes.stack}>
        <SectionTitle>Leaderboards</SectionTitle>
        <PageLink to={contestViewSectionPath(org, contest, 'boards')}>
          See the leaderboards
        </PageLink>
      </div>
    </Card>
  );
}

/**
 * How many questions the reader's entrant has asked and how many are
 * answered, with the way to ask another, which every task's page offers too.
 */
function QuestionsCard({ org, contest }: { org: string; contest: string }) {
  const query = useMyQuestions(org, contest);
  const asked = query.data ?? [];
  const answered = asked.filter((question) => question.answered).length;
  return (
    <Card>
      <section className={classes.stack} aria-label="Questions to the organisers">
        <SectionTitle>Questions to the organisers</SectionTitle>
        <BodyText tone="secondary">
          {asked.length === 0
            ? 'Ask about a task or about the contest. Only the organisers see what you ask.'
            : `${String(asked.length)} asked, ${String(answered)} answered.`}
        </BodyText>
        <div className={classes.links}>
          <PageLink to={contestViewSectionPath(org, contest, 'questions')}>
            {asked.length === 0
              ? 'Ask a question'
              : 'Ask a question or read the answers'}
          </PageLink>
        </div>
      </section>
    </Card>
  );
}

/**
 * The home as a signed-in person reads it, their entry and the countdown
 * included. It is read again soon while they wait on an organiser or an
 * invite, and now and then otherwise, so extra time or a task released by
 * its own time reaches the page; crossing the start or the end reads it
 * again at once. While it shows a standing, it is read every thirty seconds.
 */
function SignedInHome({ org, contest }: { org: string; contest: string }) {
  const queryClient = useQueryClient();
  const view = queryView(
    $api.useQuery(
      'get',
      '/api/v1/orgs/{org}/contests/{contest}/home',
      { params: { path: { org, contest } } },
      {
        refetchInterval: (query) => {
          const every = entryPollEvery(query.state.data?.registration);
          // The stream tells no one of another entrant's grading, so a
          // standing is read again every thirty seconds, stream or not.
          return (query.state.data?.standing.length ?? 0) > 0
            ? Math.min(every, STANDING_MS)
            : every;
        },
      },
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

/**
 * A contest's page in the order a running contest is worked from: how long is
 * left, then the tasks and where each stands, the leaderboard, the
 * announcements and the way to ask a question. The person's entry comes
 * first while it is still to settle (to register, to wait on, or refused),
 * and last once they are in, or organise the contest.
 */
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
  const session = useSession();
  // Leaderboard staff as the forge reads it: a role at the contest or the
  // org, not one at a task alone, which `organises` counts.
  const staff =
    session.status === 'signed-in' && contestStaff(org, contest, session.me.roles);
  const entrant = home.registration.entrant;
  const approved = entrant?.status === 'approved';
  const settled = approved || home.organises;
  const entry = (
    <Card>
      <YourEntry org={org} contest={contest} home={home} />
    </Card>
  );
  return (
    <Page>
      <PageHeader
        title={home.name}
        links={
          home.organises ? (
            <PageLink to={contestPath(org, contest)}>Back to organising</PageLink>
          ) : undefined
        }
      >
        {home.state === 'draft' && (
          <BodyText tone="secondary">
            This contest is a draft, so only its organisers see it.
          </BodyText>
        )}
        {home.state === 'archived' && (
          <BodyText tone="secondary">
            This contest is archived: its tasks can still be read, and they take no
            submissions.
          </BodyText>
        )}
        {home.description !== '' && <BodyText size="md">{home.description}</BodyText>}
      </PageHeader>
      <Card>
        <div className={classes.stack}>
          <Countdown
            start={home.start}
            end={home.end}
            now={home.now}
            onBoundary={onBoundary}
            large
          />
          <Dates start={home.start} end={home.end} />
        </div>
      </Card>
      {!settled && entry}
      <Card>
        <div className={classes.stack}>
          <SectionTitle>Tasks</SectionTitle>
          <TaskList
            org={org}
            contest={contest}
            tasks={home.tasks}
            notApproved={TASK_STANDING[notIn(home)]}
            standing={home.standing}
            staff={staff}
          />
        </div>
      </Card>
      {/* The forge gives a standing to an approved entrant alone: anyone else
          reads the leaderboards on their own page. */}
      {approved ? (
        <LeaderboardCard
          org={org}
          contest={contest}
          standing={home.standing}
          staff={staff}
        />
      ) : (
        <LeaderboardsLink org={org} contest={contest} />
      )}
      <Card>
        <ContestAnnouncements org={org} contest={contest} />
      </Card>
      {approved && <QuestionsCard org={org} contest={contest} />}
      {settled && entry}
    </Page>
  );
}

/**
 * The contest as a visitor sees it: only a public contest, its released
 * tasks and its leaderboards, with a way to sign in to register. A contest
 * that is not public asks them to sign in first, since it may be one they
 * can see with a session.
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
    <Page>
      <PageHeader title={found.name}>
        {found.description !== '' && <BodyText size="md">{found.description}</BodyText>}
      </PageHeader>
      <Card>
        <div className={classes.stack}>
          <Countdown start={found.start} end={found.end} large />
          <Dates start={found.start} end={found.end} />
          <BodyText>Sign in to register for this contest.</BodyText>
          <SignInButtons />
        </div>
      </Card>
      <Card>
        <div className={classes.stack}>
          <SectionTitle>Tasks</SectionTitle>
          <PublicTaskList org={org} contest={contest} tasks={found.tasks} />
        </div>
      </Card>
      <LeaderboardsLink org={org} contest={contest} />
    </Page>
  );
}

/**
 * A contest's page for a contestant or a visitor, at one address for both.
 * A signed-in person reads the home, which follows their entry from the
 * register button through pending to the contest itself, read again while
 * they wait on an organiser or an invite. A visitor reads the public
 * contest.
 */
export function ContestHomePage() {
  const { org, contest } = useContestParams();
  // A link to one of its announcements, such as a public answer's, lands on it.
  useAnchor();
  return (
    <BySession
      signedIn={<SignedInHome org={org} contest={contest} />}
      visitor={<PublicHome org={org} contest={contest} />}
    />
  );
}
