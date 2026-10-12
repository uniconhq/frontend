import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { $api, queryView } from '@/api/query';
import { useServerClock } from '@/api/use-server-time';
import type { Board, ContestHome, PublicTask, TaskEntry } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Card } from '@/ui/Card';
import { PageLink } from '@/ui/PageLink';
import { Page, PageHeader } from '@/ui/Page';
import { SectionTitle } from '@/ui/SectionTitle';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { taskPagePath } from '@/lib/contest-paths';
import { inTeams } from '@/lib/entrants';
import { contestPath } from '@/lib/organiser-paths';
import { useContestParams } from '@/lib/route-params';
import { contestViewSectionPath } from '@/lib/sections';
import { formatDateTime, formatWhen } from '@/lib/time';
import { ContestAnnouncements } from './threads/AnnouncementList';
import { useMyQuestions } from './threads/questions';
import { BOARDS_EVERY_MS, BoardList } from './boards/BoardList';
import { BySession } from './BySession';
import { useAnchor } from '@/ui/anchor';
import { Countdown } from '@/ui/Countdown';
import { entryPollEvery } from './entry/poll';
import { YourEntry } from './entry/YourEntry';
import { SignInButtons, SignInPrompt } from './SignInPrompt';
import { labelOf } from './task-names';
import { boardPointsText, taskPointsText, type PointsText } from './task-points';
import { taskTimeLines } from './time-left';
import classes from './contest.module.css';

/** Where a task stands for the reader, when it is not simply open. */
const NOT_OPEN: Record<NonNullable<TaskEntry['release']['closed']>, string | null> = {
  not_released: 'Not released yet',
  archived: 'No longer takes submissions',
  closed: null,
  not_approved: 'Open once your registration is approved',
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
}: {
  task: TaskEntry;
  at: number;
  counting: boolean;
}) {
  const reason = task.release.closed === null ? null : NOT_OPEN[task.release.closed];
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

/** Points as a line reads them, and when held-back points are shown. */
function Points({ text }: { text: PointsText | null }) {
  return (
    <span className={classes.points}>
      {text !== null && <span>{text.score}</span>}
      {text?.pending != null && <span className={classes.pending}>{text.pending}</span>}
    </span>
  );
}

/**
 * Calls `onReveal` as the server's clock passes a time a task's held-back
 * points are shown on any leaderboard, so the page reads them then, not at
 * its next read.
 */
function useReveals(tasks: TaskEntry[], at: number, onReveal: () => void) {
  const passed = tasks
    .flatMap((task) => task.points)
    .filter((cell) => {
      const until = cell.points?.pending_until;
      return until != null && Date.parse(until) <= at;
    }).length;
  const last = useRef(passed);
  useEffect(() => {
    if (passed > last.current) onReveal();
    last.current = passed;
  }, [passed, onReveal]);
}

/**
 * The tasks with a column of points for each leaderboard the entrant sees
 * (#447), headed by its name, each cell the points as that board counts
 * them; each task's row headed by its letter and name, with where it stands
 * under it. The columns scroll sideways inside the card when there are more
 * than fit, the tasks' names staying in view.
 */
function BoardColumns({
  org,
  contest,
  tasks,
  boards,
  at,
  counting,
}: {
  org: string;
  contest: string;
  tasks: TaskEntry[];
  boards: string[];
  at: number;
  counting: boolean;
}) {
  const now = new Date(at);
  return (
    <div className={classes.columns}>
      <table className={classes.taskTable} aria-label="Tasks">
        <thead>
          <tr>
            <th scope="col">Task</th>
            {boards.map((board) => (
              <th key={board} scope="col">
                {board}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr key={task.name}>
              <th scope="row">
                <div className={classes.taskCell}>
                  <span className={classes.taskName}>
                    <span className={classes.label}>{labelOf(task)}</span>
                    <PageLink to={taskPagePath(org, contest, task.name)}>
                      {task.title}
                    </PageLink>
                  </span>
                  <Standing task={task} at={at} counting={counting} />
                </div>
              </th>
              {boards.map((board, index) => {
                const cell = task.points[index];
                return (
                  <td key={board}>
                    <Points
                      text={
                        cell === undefined
                          ? null
                          : boardPointsText(cell, task.worth, now)
                      }
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * A contest's released tasks as a signed-in person works from them, in the
 * contest's order: each a link to its page, with their points on it once
 * they are in an approved entrant, read again as held-back points are
 * shown, its worth alone before then, and where it stands for them, the
 * time left on it counted down by the server's clock. With one leaderboard
 * the points are one number, that board's; with several, a column each.
 */
function TaskList({
  org,
  contest,
  tasks,
  boards,
  onReveal,
}: {
  org: string;
  contest: string;
  tasks: TaskEntry[];
  boards: string[];
  onReveal: () => void;
}) {
  const { at, measured } = useServerClock();
  useReveals(tasks, at, onReveal);
  if (tasks.length === 0) {
    return <BodyText tone="secondary">No tasks are released yet.</BodyText>;
  }
  if (boards.length > 1) {
    return (
      <BoardColumns
        org={org}
        contest={contest}
        tasks={tasks}
        boards={boards}
        at={at}
        counting={measured}
      />
    );
  }
  return (
    <ul className={classes.tasks} aria-label="Tasks">
      {tasks.map((task) => (
        <li key={task.name} className={classes.task}>
          <span className={classes.label}>{labelOf(task)}</span>
          <PageLink to={taskPagePath(org, contest, task.name)}>{task.title}</PageLink>
          <Points text={taskPointsText(task, new Date(at))} />
          <Standing task={task} at={at} counting={measured} />
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

/** 1st, 2nd, 3rd, 4th, 11th, 21st: a place in a ranking. */
function ordinal(place: number): string {
  const tens = place % 100;
  const last = place % 10;
  const suffix =
    tens >= 11 && tens <= 13
      ? 'th'
      : last === 1
        ? 'st'
        : last === 2
          ? 'nd'
          : last === 3
            ? 'rd'
            : 'th';
  return `${String(place)}${suffix}`;
}

/**
 * Where the reader's entrant stands on one leaderboard, in a line, `team`
 * saying so of a team; how many it shows for a reader with no entrant. The
 * place is said alone: a board may show only the top rows or the reader's
 * own, so the rows served are not everyone on it.
 */
function placeOn(board: Board, entrant: string | null, team: boolean): string {
  if (board.nothing_shown) {
    return board.shown_at === null
      ? 'Shown once its tasks are released.'
      : `Shown from ${formatWhen(new Date(board.shown_at))}.`;
  }
  const count = board.rows.length;
  const row =
    entrant === null
      ? undefined
      : board.rows.find((found) => found.row.entrant === entrant);
  const who = team ? 'Your team is' : 'You are';
  if (row === undefined) {
    return entrant === null
      ? `It shows ${String(count)} ${count === 1 ? 'entrant' : 'entrants'}.`
      : `${who} not on it yet.`;
  }
  return `${who} ${ordinal(row.rank)}.`;
}

/**
 * The leaderboards the reader may see, as where they stand on each, with the
 * way to the boards themselves; nothing at all when the contest shows them
 * none. Read again now and then, as the leaderboards page reads them.
 */
function LeaderboardCard({
  org,
  contest,
  entrant,
  team,
}: {
  org: string;
  contest: string;
  entrant: string | null;
  team: boolean;
}) {
  const view = queryView(
    $api.useQuery(
      'get',
      '/api/v1/orgs/{org}/contests/{contest}/boards',
      { params: { path: { org, contest } } },
      { refetchInterval: BOARDS_EVERY_MS },
    ),
  );
  if (view.state === 'ready' && view.data.length === 0) return null;
  const several = view.state === 'ready' && view.data.length > 1;
  return (
    <Card>
      <section className={classes.stack} aria-label="Leaderboard">
        <SectionTitle>{several ? 'Leaderboards' : 'Leaderboard'}</SectionTitle>
        {view.state === 'loading' && <PageSkeleton rows={1} />}
        {view.state === 'error' && (
          <ErrorBlock error={view.error} onRetry={view.retry} compact />
        )}
        {view.state === 'ready' && (
          <ul className={classes.places} aria-label="Where you stand">
            {view.data.map((board) => (
              <li key={board.board}>
                {several && <strong>{board.board}: </strong>}
                {placeOn(board, entrant, team)}
              </li>
            ))}
          </ul>
        )}
        <div className={classes.links}>
          <PageLink to={contestViewSectionPath(org, contest, 'boards')}>
            {several ? 'See the leaderboards' : 'See the leaderboard'}
          </PageLink>
        </div>
      </section>
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
 * again at once.
 */
function SignedInHome({ org, contest }: { org: string; contest: string }) {
  const queryClient = useQueryClient();
  const view = queryView(
    $api.useQuery(
      'get',
      '/api/v1/orgs/{org}/contests/{contest}/home',
      { params: { path: { org, contest } } },
      { refetchInterval: (query) => entryPollEvery(query.state.data?.registration) },
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
 * left, then the tasks with their points and where each stands, the
 * leaderboard, the announcements and the way to ask a question. The
 * person's entry comes first while it is still to settle (to register, to
 * wait on, or refused), and last once they are in, or organise the contest.
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
            boards={home.boards}
            onReveal={onBoundary}
          />
        </div>
      </Card>
      <LeaderboardCard
        org={org}
        contest={contest}
        entrant={entrant?.id ?? null}
        team={inTeams(home.registration)}
      />
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
 * tasks and its leaderboards shown to everyone, with a way to sign in to
 * register. A contest that is not public asks them to sign in first, since
 * it may be one they can see with a session.
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
      <LandingBoards org={org} contest={contest} />
    </Page>
  );
}

/**
 * The contest's leaderboards shown to everyone, read without a session,
 * under its tasks; nothing at all when it shows none.
 */
function LandingBoards({ org, contest }: { org: string; contest: string }) {
  const view = queryView(
    $api.useQuery(
      'get',
      '/api/v1/public/contests/{org}/{contest}/boards',
      { params: { path: { org, contest } } },
      { refetchInterval: BOARDS_EVERY_MS },
    ),
  );
  if (view.state === 'ready' && view.data.length === 0) return null;
  return <BoardList view={view} empty="" />;
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
