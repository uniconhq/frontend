import { useQuery } from '@tanstack/react-query';
import { $api, queryView } from '@/api/query';
import { useFallbackPoll } from '@/live';
import { treeQuery } from '../files/place';
import { count } from '../hub/count';
import { AnnouncementsLine, FilesLine, Line } from '../hub/lines';
import { announcementsQuery } from '../threads/announcements';
import { entrantsLine, useEntrants } from '../entrants/names';
import { useInvites } from '../invites/invites';
import { DEFAULT_WAYS } from '../forms/ways';
import { BodyText } from '@/ui/BodyText';
import { Loaded } from '@/ui/feedback/Loaded';
import { useContestSettings } from './settings';

type Path = { org: string; contest: string };

/** How many entrants there are, and how many wait for an organiser. */
export function EntrantsCard({ path }: { path: Path }) {
  return (
    <Line view={queryView(useEntrants(path.org, path.contest))} say={entrantsLine} />
  );
}

/** The ways in, by name, and how many invites wait to be accepted. */
export function EntryCard({ path }: { path: Path }) {
  const settings = useContestSettings(path.org, path.contest);
  const invites = useInvites({ kind: 'contest', ...path }).data ?? [];
  const waiting = invites.filter(
    (invite) =>
      (invite.grants === 'contestant' || invite.grants === 'member') &&
      invite.status === 'pending' &&
      !invite.expired,
  ).length;
  return (
    <Loaded view={settings} compact>
      {(values) => {
        if (values === null)
          return <BodyText>The contest’s settings cannot be read.</BodyText>;
        const ways = values.ways ?? DEFAULT_WAYS;
        const named = ways.map((way) =>
          way.kind === 'invite'
            ? 'invites'
            : way.name.trim() === ''
              ? 'a sign-up'
              : `sign-up “${way.name.trim()}”`,
        );
        const line =
          ways.length === 0
            ? 'Nobody can register, since there is no way in.'
            : `${count(ways.length, 'way', 'ways')} in: ${named.join(', ')}.`;
        return (
          <BodyText>
            {line}
            {waiting > 0 &&
              ` ${count(waiting, 'invite waits', 'invites wait')} to be accepted.`}
          </BodyText>
        );
      }}
    </Loaded>
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
