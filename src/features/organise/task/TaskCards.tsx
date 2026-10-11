import { useQuery } from '@tanstack/react-query';
import { $api, queryView } from '@/api/query';
import { BodyText } from '@/ui/BodyText';
import { useLiveConnected } from '@/live';
import { treeQuery } from '../files/place';
import { readAgainIn } from '../gradings/feed';
import { count } from '../hub/count';
import { AnnouncementsLine, FilesLine, Line } from '../hub/lines';
import { announcementsQuery } from '../threads/announcements';
import { publishedLine } from './published';

type TaskPath = { org: string; contest: string; task: string };

const TASK = '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}';

/** How many gradings there are, and how many still run. */
export function GradingsCard({ path }: { path: TaskPath }) {
  const live = useLiveConnected();
  const view = queryView(
    $api.useQuery(
      'get',
      `${TASK}/gradings`,
      { params: { path } },
      { refetchInterval: (query) => readAgainIn(live, query.state.data) },
    ),
  );
  return (
    <Line
      view={view}
      say={(gradings) => {
        if (gradings.length === 0) return 'Nothing has been graded yet.';
        const running = gradings.filter((entry) =>
          ['queued', 'dispatched', 'running'].includes(entry.grading.status),
        ).length;
        return running === 0
          ? `${count(gradings.length, 'grading', 'gradings')}, none still running.`
          : `${count(gradings.length, 'grading', 'gradings')}, ${String(running)} still running.`;
      }}
    />
  );
}

export function PublicationsCard({ path }: { path: TaskPath }) {
  const view = queryView($api.useQuery('get', TASK, { params: { path } }));
  return <Line view={view} say={(state) => publishedLine(state.latest)} />;
}

export function AnnouncementsCard({ path }: { path: TaskPath }) {
  return (
    <AnnouncementsLine
      view={queryView(useQuery(announcementsQuery({ kind: 'task', ...path })))}
    />
  );
}

export function FilesCard({ path }: { path: TaskPath }) {
  return (
    <FilesLine view={queryView(useQuery(treeQuery({ kind: 'task', ...path }, '')))} />
  );
}

export function SettingsCard() {
  return <BodyText>Its title, and its settings as they are stored.</BodyText>;
}
