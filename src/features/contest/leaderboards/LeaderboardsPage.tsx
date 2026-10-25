import { $api, queryView, type QueryView } from '@/api/query';
import type { components } from '@/api/schema';
import { taskPagePath } from '@/lib/contest-paths';
import { useContestParams } from '@/lib/route-params';
import { entrantGradingsPath } from '@/lib/sections';
import { contestStaff } from '@/lib/viewer';
import { useFallbackPoll } from '@/live';
import { useSession } from '@/session';
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
 * follows the audience, the hold and a dropped sort key. A grading or a
 * release reads them again through the live stream; with no stream, as for
 * a visitor, they are read again every thirty seconds.
 */
export function LeaderboardsPage() {
  const { org, contest } = useContestParams();
  return (
    <BySession
      signedIn={<SignedInBoards org={org} contest={contest} />}
      visitor={<PublicBoards org={org} contest={contest} />}
    />
  );
}

function SignedInBoards({ org, contest }: { org: string; contest: string }) {
  const session = useSession();
  const staff =
    session.status === 'signed-in' && contestStaff(org, contest, session.me.roles);
  const query = $api.useQuery(
    'get',
    '/api/v1/orgs/{org}/contests/{contest}/leaderboards',
    {
      params: { path: { org, contest } },
    },
    { refetchInterval: useFallbackPoll(POLL_MS) },
  );
  return <Boards view={queryView(query)} org={org} contest={contest} staff={staff} />;
}

function PublicBoards({ org, contest }: { org: string; contest: string }) {
  const query = $api.useQuery(
    'get',
    '/api/v1/public/contests/{org}/{contest}/leaderboards',
    {
      params: { path: { org, contest } },
    },
    { refetchInterval: useFallbackPoll(POLL_MS) },
  );
  return <Boards view={queryView(query)} org={org} contest={contest} staff={false} />;
}

function Boards({
  view,
  org,
  contest,
  staff,
}: {
  view: QueryView<Leaderboard[]>;
  org: string;
  contest: string;
  staff: boolean;
}) {
  if (view.state === 'loading') return <PageSkeleton />;
  if (view.state === 'error')
    return <ErrorBlock error={view.error} onRetry={view.retry} />;
  // Staff open the entrant's submissions to the task; anyone else, who
  // reads only their own row, their own submission.
  const open = (task: string, number: number, entrant: string) =>
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
            submissionTo={open}
            staff={staff}
          />
        ))
      )}
    </Page>
  );
}
