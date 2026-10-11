import { useQuery } from '@tanstack/react-query';
import { $api, queryView } from '@/api/query';
import { BodyText } from '@/ui/BodyText';
import { useFallbackPoll } from '@/live';
import { treeQuery } from '../files/place';
import { count } from '../hub/count';
import { AnnouncementsLine, FilesLine, Line } from '../hub/lines';
import { announcementsQuery } from '../threads/announcements';
import { useContestSettings } from './settings';

type Path = { org: string; contest: string };

/** How many have registered, and how many wait for an organiser. */
export function ContestantsCard({ path }: { path: Path }) {
  const view = queryView(
    $api.useQuery('get', '/api/v1/orgs/{org}/contests/{contest}/contestants', {
      params: { path },
    }),
  );
  return (
    <Line
      view={view}
      say={(contestants) => {
        const approved = contestants.filter((one) => one.status === 'approved').length;
        const waiting = contestants.filter((one) => one.status === 'pending').length;
        if (approved === 0 && waiting === 0) return 'Nobody has registered yet.';
        return waiting === 0
          ? `${count(approved, 'contestant', 'contestants')} approved.`
          : `${count(approved, 'contestant', 'contestants')} approved, ${String(waiting)} waiting for approval.`;
      }}
    />
  );
}

/** How many teams there are, or that everyone enters alone. */
export function TeamsCard({ path }: { path: Path }) {
  const settings = useContestSettings(path.org, path.contest);
  const view = queryView(
    $api.useQuery('get', '/api/v1/orgs/{org}/contests/{contest}/organise/teams', {
      params: { path },
    }),
  );
  const alone =
    settings.state === 'ready' &&
    settings.data !== null &&
    (settings.data.teamSize === '' || settings.data.teamSize === '1');
  if (alone) return <BodyText>Everyone enters alone in this contest.</BodyText>;
  return (
    <Line
      view={view}
      say={(teams) =>
        teams.length === 0 ? 'No team yet.' : `${count(teams.length, 'team', 'teams')}.`
      }
    />
  );
}

/** How many submissions wait to be graded, and how many are being graded. */
export function GradingsCard({ path }: { path: Path }) {
  const view = queryView(
    $api.useQuery(
      'get',
      '/api/v1/orgs/{org}/contests/{contest}/gradings/queue',
      { params: { path } },
      { refetchInterval: useFallbackPoll(30_000) },
    ),
  );
  return (
    <Line
      view={view}
      say={({ queued, dispatched }) =>
        queued === 0 && dispatched === 0
          ? 'Nothing is waiting to be graded.'
          : `${String(queued)} waiting to be graded, ${String(dispatched)} being graded.`
      }
    />
  );
}

/** The contest's leaderboards, by name. */
export function BoardsCard({ path }: { path: Path }) {
  const view = queryView(
    $api.useQuery('get', '/api/v1/orgs/{org}/contests/{contest}/organise/boards', {
      params: { path },
    }),
  );
  return (
    <Line
      view={view}
      say={(boards) =>
        boards.length === 0
          ? 'No leaderboard yet.'
          : boards.map((board) => board.final.board).join(', ')
      }
    />
  );
}

export function AnnouncementsCard({ path }: { path: Path }) {
  return (
    <AnnouncementsLine
      view={queryView(useQuery(announcementsQuery({ kind: 'contest', ...path })))}
    />
  );
}

/** How many questions wait for an answer, of how many asked. */
export function QuestionsCard({ path }: { path: Path }) {
  const view = queryView(
    $api.useQuery(
      'get',
      '/api/v1/orgs/{org}/contests/{contest}/clarifications',
      { params: { path } },
      { refetchInterval: useFallbackPoll(60_000) },
    ),
  );
  return (
    <Line
      view={view}
      say={(questions) => {
        const open = questions.filter((one) => !one.answered && !one.closed).length;
        if (questions.length === 0) return 'Nobody has asked anything yet.';
        return open === 0
          ? `All ${String(questions.length)} answered.`
          : `${count(open, 'question waits', 'questions wait')} for an answer, of ${String(questions.length)}.`;
      }}
    />
  );
}

export function FilesCard({ path }: { path: Path }) {
  return (
    <FilesLine
      view={queryView(useQuery(treeQuery({ kind: 'contest', ...path }, '')))}
    />
  );
}
