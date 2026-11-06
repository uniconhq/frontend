import { useParams } from 'react-router';
import { $api, queryView, type QueryView } from '@/api/query';
import type { components } from '@/api/schema';
import { taskPagePath } from '@/lib/contest-paths';
import { useContestParams } from '@/lib/route-params';
import { entrantGradingsPath } from '@/lib/sections';
import { BodyText } from '@/ui/BodyText';
import { Page, PageHeader } from '@/ui/Page';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { LeaderboardTable } from '@/ui/leaderboards/table';
import { BySession } from '../BySession';
import { submissionHref } from '../submit/submission-param';

type Leaderboard = components['schemas']['Leaderboard'];

const POLL_MS = 30_000;

/**
 * The contest's leaderboards as this caller is shown them. A visitor reads
 * the public list; a signed-in person reads their own, which already
 * follows the audience, the hold and a dropped sort key. Their own grading
 * or a release reads them again through the live stream, which tells no one
 * of another entrant's grading, so they are also read again every thirty
 * seconds, stream or not.
 */
export function LeaderboardsPage() {
  const { org, contest } = useContestParams();
  const { leaderboard } = useParams();
  return (
    <BySession
      signedIn={
        leaderboard === undefined ? (
          <SignedInBoards org={org} contest={contest} />
        ) : (
          <OneBoard org={org} contest={contest} leaderboard={leaderboard} signedIn />
        )
      }
      visitor={
        leaderboard === undefined ? (
          <PublicBoards org={org} contest={contest} />
        ) : (
          <OneBoard
            org={org}
            contest={contest}
            leaderboard={leaderboard}
            signedIn={false}
          />
        )
      }
    />
  );
}

function OneBoard({
  org,
  contest,
  leaderboard,
  signedIn,
}: {
  org: string;
  contest: string;
  leaderboard: string;
  signedIn: boolean;
}) {
  const query = $api.useQuery(
    'get',
    signedIn
      ? '/api/v1/orgs/{org}/contests/{contest}/leaderboards/{leaderboard}'
      : '/api/v1/public/contests/{org}/{contest}/leaderboards/{leaderboard}',
    { params: { path: { org, contest, leaderboard } } },
    { refetchInterval: POLL_MS },
  );
  const view = queryView(query);
  return (
    <Boards
      view={view.state === 'ready' ? { ...view, data: [view.data] } : view}
      org={org}
      contest={contest}
    />
  );
}

function SignedInBoards({ org, contest }: { org: string; contest: string }) {
  const query = $api.useQuery(
    'get',
    '/api/v1/orgs/{org}/contests/{contest}/leaderboards',
    {
      params: { path: { org, contest } },
    },
    { refetchInterval: POLL_MS },
  );
  return <Boards view={queryView(query)} org={org} contest={contest} />;
}

function PublicBoards({ org, contest }: { org: string; contest: string }) {
  const query = $api.useQuery(
    'get',
    '/api/v1/public/contests/{org}/{contest}/leaderboards',
    {
      params: { path: { org, contest } },
    },
    { refetchInterval: POLL_MS },
  );
  return <Boards view={queryView(query)} org={org} contest={contest} />;
}

function Boards({
  view,
  org,
  contest,
}: {
  view: QueryView<Leaderboard[]>;
  org: string;
  contest: string;
}) {
  if (view.state === 'loading') return <PageSkeleton />;
  if (view.state === 'error')
    return <ErrorBlock error={view.error} onRetry={view.retry} />;
  // Staff, as the server says on each board, open the entrant's submissions
  // to the task; anyone else, who reads only their own row, their own
  // submission.
  const open = (staff: boolean) => (task: string, number: number, entrant: string) =>
    staff
      ? entrantGradingsPath(org, contest, task, entrant)
      : `${taskPagePath(org, contest, task)}${submissionHref(number)}`;
  return (
    <Page>
      <PageHeader title="Leaderboards" />
      {view.data.length === 0 ? (
        <BodyText tone="secondary">Nothing is on a leaderboard yet.</BodyText>
      ) : (
        view.data.map((board) => (
          <LeaderboardTable
            key={board.key}
            board={board}
            submissionTo={open(board.staff)}
          />
        ))
      )}
    </Page>
  );
}
