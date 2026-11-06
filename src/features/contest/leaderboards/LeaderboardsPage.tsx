import { useParams } from 'react-router';
import { $api, queryView, type QueryView } from '@/api/query';
import type { components } from '@/api/schema';
import { useContestParams } from '@/lib/route-params';
import { BodyText } from '@/ui/BodyText';
import { Page, PageHeader } from '@/ui/Page';
import { Loaded } from '@/ui/feedback/Loaded';
import { LeaderboardTable } from '@/ui/leaderboards/table';
import { BySession } from '../BySession';
import { countedSubmissionTo } from '../submit/submission-param';

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
  const boards = (signedIn: boolean) =>
    leaderboard === undefined ? (
      <AllBoards org={org} contest={contest} signedIn={signedIn} />
    ) : (
      <OneBoard
        org={org}
        contest={contest}
        leaderboard={leaderboard}
        signedIn={signedIn}
      />
    );
  return <BySession signedIn={boards(true)} visitor={boards(false)} />;
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

function AllBoards({
  org,
  contest,
  signedIn,
}: {
  org: string;
  contest: string;
  signedIn: boolean;
}) {
  const query = $api.useQuery(
    'get',
    signedIn
      ? '/api/v1/orgs/{org}/contests/{contest}/leaderboards'
      : '/api/v1/public/contests/{org}/{contest}/leaderboards',
    { params: { path: { org, contest } } },
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
  return (
    <Loaded view={view}>
      {(boards) => (
        <Page>
          <PageHeader title="Leaderboards" />
          {boards.length === 0 ? (
            <BodyText tone="secondary">Nothing is on a leaderboard yet.</BodyText>
          ) : (
            boards.map((board) => (
              <LeaderboardTable
                key={board.key}
                board={board}
                submissionTo={countedSubmissionTo(org, contest, board.staff)}
              />
            ))
          )}
        </Page>
      )}
    </Loaded>
  );
}
