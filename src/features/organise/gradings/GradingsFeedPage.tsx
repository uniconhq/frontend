import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { $api, queryView } from '@/api/query';
import type { QueueDepth, Team } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { PageLink } from '@/ui/PageLink';
import { PageTitle } from '@/ui/PageTitle';
import { SectionTitle } from '@/ui/SectionTitle';
import { Select } from '@/ui/Select';
import { TextInput } from '@/ui/TextInput';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { useLiveConnected } from '@/live';
import { useContestParams } from '@/lib/route-params';
import { GradingsList } from './GradingsList';
import {
  STATUS,
  STATUSES,
  feedQuery,
  readAgainIn,
  readFilters,
  withFilter,
  type FilterKey,
  type Filters,
} from './feed';
import shared from '../organise.module.css';
import classes from './feed.module.css';

/** How often the queue is read again while one waits and the stream is down, and otherwise. */
const WAITING_MS = 10_000;
const MEANWHILE_MS = 60_000;
/** How many gradings the feed reads, the backend's own default. */
const LIMIT = 100;

const USERNAME_MAX = 40;

type ContestPath = { org: string; contest: string };

/**
 * The contest's tasks by name, for the filter. The rows carry each task's
 * letter, so the feed reads nothing else for one.
 */
function useTasks(path: ContestPath) {
  const query = $api.useQuery('get', '/api/v1/orgs/{org}/contests/{contest}/tasks', {
    params: { path },
  });
  return (query.data ?? []).map((task) => ({ value: task.name, label: task.name }));
}

/** The contest's teams, for the filter; none in a contest without teams. */
function useTeams(path: ContestPath): Team[] {
  const query = $api.useQuery(
    'get',
    '/api/v1/orgs/{org}/contests/{contest}/organise/teams',
    { params: { path } },
    { retry: false },
  );
  return query.data ?? [];
}

/** How many of the contest's gradings wait, by status. */
function QueueDepthPanel({ path }: { path: ContestPath }) {
  const live = useLiveConnected();
  const view = queryView(
    $api.useQuery(
      'get',
      '/api/v1/orgs/{org}/contests/{contest}/gradings/queue',
      { params: { path } },
      {
        refetchInterval: (query) => {
          const depth: QueueDepth | undefined = query.state.data;
          const waiting = depth !== undefined && depth.queued + depth.dispatched > 0;
          return !live && waiting ? WAITING_MS : MEANWHILE_MS;
        },
      },
    ),
  );
  return (
    <div className={classes.stack}>
      <SectionTitle>Queue</SectionTitle>
      {view.state === 'loading' && <PageSkeleton rows={1} />}
      {view.state === 'error' && (
        <ErrorBlock error={view.error} onRetry={view.retry} compact />
      )}
      {view.state === 'ready' && (
        <dl className={classes.queue} aria-label="Queue">
          <div>
            <dt>{STATUS.queued}</dt>
            <dd>{view.data.queued}</dd>
          </div>
          <div>
            <dt>{STATUS.dispatched}</dt>
            <dd>{view.data.dispatched}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}

/**
 * The filters, each kept in the page's address. A choice applies at once; a
 * username applies once sent, so the feed is not read again on every key.
 */
function FilterBar({
  filters,
  tasks,
  teams,
}: {
  filters: Filters;
  tasks: { value: string; label: string }[];
  teams: Team[];
}) {
  const [search, setSearch] = useSearchParams();
  const [user, setUser] = useState(filters.user ?? '');
  const [shownUser, setShownUser] = useState(filters.user);
  // The address changed under the field, by the back button or a clear.
  if (shownUser !== filters.user) {
    setShownUser(filters.user);
    setUser(filters.user ?? '');
  }

  const set = (key: FilterKey, value: string) =>
    setSearch(withFilter(search, key, value));

  const submitUser = (event: FormEvent) => {
    event.preventDefault();
    set('user', user);
  };

  /** A filter set in the address that the lists do not hold stays choosable. */
  const keep = (options: { value: string; label: string }[], value: string | null) =>
    value === null || options.some((option) => option.value === value)
      ? options
      : [...options, { value, label: value }];

  const teamOptions = teams.map((team) => ({ value: team.id, label: team.name }));
  const anySet = Object.values(filters).some((value) => value !== null);

  return (
    <div className={classes.filters}>
      <Select
        label="Task"
        value={filters.task ?? ''}
        options={keep(tasks, filters.task)}
        placeholder="Every task"
        onChange={(value) => set('task', value)}
      />
      <Select
        label="Status"
        value={filters.status ?? ''}
        options={STATUSES.map((status) => ({ value: status, label: STATUS[status] }))}
        placeholder="Every status"
        onChange={(value) => set('status', value)}
      />
      {(teamOptions.length > 0 || filters.team !== null) && (
        <Select
          label="Team"
          value={filters.team ?? ''}
          options={keep(teamOptions, filters.team)}
          placeholder="Every team"
          onChange={(value) => set('team', value)}
        />
      )}
      <form className={classes.user} onSubmit={submitUser} aria-label="By contestant">
        <TextInput
          label="Contestant's username"
          value={user}
          onChange={setUser}
          maxLength={USERNAME_MAX}
        />
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </form>
      {anySet && <PageLink to="?">Clear filters</PageLink>}
    </div>
  );
}

/**
 * Every grading of the contest, newest first, for anyone with a role at the
 * contest or one of its tasks: the queue above, the filters by task,
 * contestant, team and status kept in the page's address, and the gradings as
 * `GradingsList` shows them, with Rejudge for the task the feed is filtered
 * to. The live stream makes the feed and the queue stale as gradings move;
 * while it is down both are read again every ten seconds while something is
 * still to finish.
 */
export function GradingsFeedPage() {
  const path = useContestParams();
  const [search] = useSearchParams();
  const filters = readFilters(search);
  const live = useLiveConnected();
  const tasks = useTasks(path);
  const teams = useTeams(path);
  const view = queryView(
    $api.useQuery(
      'get',
      '/api/v1/orgs/{org}/contests/{contest}/gradings',
      { params: { path, query: feedQuery(filters) } },
      { refetchInterval: (query) => readAgainIn(live, query.state.data) },
    ),
  );
  const filtered = Object.values(filters).some((value) => value !== null);

  return (
    <div className={shared.page}>
      <PageTitle>Gradings</PageTitle>
      <Card>
        <QueueDepthPanel path={path} />
      </Card>
      <Card>
        <div className={classes.stack}>
          <SectionTitle>Every grading</SectionTitle>
          <FilterBar filters={filters} tasks={tasks} teams={teams} />
          <GradingsList
            path={path}
            view={view}
            showTask
            rejudge={filters.task === null ? null : { task: filters.task }}
            empty={
              filtered
                ? 'No grading matches these filters.'
                : 'Nothing has been graded yet.'
            }
            footer={(entries) =>
              entries.length >= LIMIT && (
                <BodyText tone="secondary">
                  The newest {LIMIT} gradings. Filter to reach older ones.
                </BodyText>
              )
            }
          />
        </div>
      </Card>
    </div>
  );
}
