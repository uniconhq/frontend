import { $api, queryView } from '@/api/query';
import { useLiveConnected } from '@/live';
import { GradingsList } from '../gradings/GradingsList';
import { usePlaceMay } from '../may';
import { readAgainIn } from '../gradings/feed';
import { Stack } from '@/ui/layout';

type TaskPath = { org: string; contest: string; task: string };

/**
 * The task's gradings, newest first, as the contest's feed shows them
 * narrowed to the task, read from the task's own route: who made each
 * submission, where its attempts stand, what they came to and why one
 * failed. A manager of the task gets the same actions as on the feed,
 * and Rejudge for the whole task.
 */
export function GradingsSection({ path }: { path: TaskPath }) {
  const live = useLiveConnected();
  const may = usePlaceMay({ kind: 'task', ...path });
  const view = queryView(
    $api.useQuery(
      'get',
      '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/gradings',
      { params: { path } },
      { refetchInterval: (query) => readAgainIn(live, query.state.data) },
    ),
  );
  return (
    <Stack gap="sm">
      <GradingsList
        path={path}
        view={view}
        showTask={false}
        rejudge={may.manage ? { task: path.task, button: 'Rejudge' } : null}
        empty="Nothing has been graded yet."
      />
    </Stack>
  );
}
