import { $api, queryView } from '@/api/query';
import { SectionTitle } from '@/ui/SectionTitle';
import { useLiveConnected } from '@/live';
import { GradingsList } from '../gradings/GradingsList';
import { readAgainIn } from '../gradings/feed';
import classes from '../gradings/feed.module.css';

type TaskPath = { org: string; contest: string; task: string };

/**
 * The task's gradings, newest first, as the contest's feed shows them
 * narrowed to the task, read from the task's own route: who made each
 * submission, where its attempts stand, what they came to, why one failed
 * and its log. A manager of the task gets the same actions as on the feed,
 * and Rejudge for the whole task.
 */
export function GradingsSection({ path }: { path: TaskPath }) {
  const live = useLiveConnected();
  const view = queryView(
    $api.useQuery(
      'get',
      '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/gradings',
      { params: { path } },
      { refetchInterval: (query) => readAgainIn(live, query.state.data) },
    ),
  );
  return (
    <div className={classes.stack}>
      <SectionTitle>Gradings</SectionTitle>
      <GradingsList
        path={path}
        view={view}
        showTask={false}
        rejudge={{ task: path.task, button: 'Rejudge' }}
        empty="Nothing has been graded yet."
      />
    </div>
  );
}
