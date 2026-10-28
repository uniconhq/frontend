import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { $api, queryView } from '@/api/query';
import type { OrganisedEntrant, QueueDepth } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Checkbox } from '@/ui/Checkbox';
import { PageLink } from '@/ui/PageLink';
import { SectionTitle } from '@/ui/SectionTitle';
import { Select } from '@/ui/Select';
import { TextInput } from '@/ui/TextInput';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { useLiveConnected } from '@/live';
import { useContestParams } from '@/lib/route-params';
import { CONTEST_SECTIONS, sectionOf } from '@/lib/sections';
import { useEntrants } from '../entrants/names';
import { SectionPage } from '../SectionPage';
import { GradingsList } from './GradingsList';
import { RegradeSummaries } from './RegradeSummaries';
import { CHANGE_WORDS, regradedTask, useRegrades } from './regrades';
import { count } from '../hub/count';
import {
  FAILED_SEARCH,
  STATUS,
  STATUSES,
  feedQuery,
  readAgainIn,
  readFilters,
  withFilter,
  type FilterKey,
  type Filters,
} from './feed';
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

/** The contest's entrants, for the filter, by the name each goes by. */
function useEntrantList(path: ContestPath): OrganisedEntrant[] {
  return useEntrants(path.org, path.contest).data ?? [];
}

/**
 * How many of the contest's gradings wait, by status, and apart from them
 * how many failed on Unicon's side, with a link to those unless the feed
 * already shows them.
 */
function QueueDepthPanel({
  path,
  showingFailed,
}: {
  path: ContestPath;
  showingFailed: boolean;
}) {
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
      <SectionTitle>Waiting to be graded</SectionTitle>
      {view.state === 'loading' && <PageSkeleton rows={1} />}
      {view.state === 'error' && (
        <ErrorBlock error={view.error} onRetry={view.retry} compact />
      )}
      {view.state === 'ready' && (
        <dl className={classes.queue} aria-label="Waiting to be graded">
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
      {view.state === 'ready' && (
        <div aria-label="Failed gradings" role="group">
          <BodyText>
            {view.data.failed === 0
              ? 'No grading failed on Unicon’s side.'
              : `${count(view.data.failed, 'grading', 'gradings')} failed on Unicon’s side.`}
          </BodyText>
          {view.data.failed > 0 && (
            <BodyText tone="secondary">
              Unicon tries a failed grading again once by itself. If that fails too, it
              waits for you to retry or cancel it.
              {!showingFailed && (
                <>
                  {' '}
                  <PageLink to={`?${FAILED_SEARCH}`}>Show the failed gradings</PageLink>
                </>
              )}
            </BodyText>
          )}
        </div>
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
  entrants,
}: {
  filters: Filters;
  tasks: { value: string; label: string }[];
  entrants: OrganisedEntrant[];
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

  const regrade = filters.regrade !== null;
  const entrantOptions = entrants
    .map((entrant) => ({ value: entrant.id, label: entrant.display_name }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const teams = entrants.some((entrant) => entrant.members.length > 1);
  const anySet = Object.values(filters).some((value) => value !== null);

  return (
    <div className={classes.filters}>
      {regrade ? (
        <Select
          label="What the regrade did"
          value={filters.change ?? ''}
          options={Object.entries(CHANGE_WORDS).map(([value, label]) => ({
            value,
            label,
          }))}
          placeholder="Every submission it graded"
          onChange={(value) => set('change', value)}
        />
      ) : (
        <>
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
            options={STATUSES.map((status) => ({
              value: status,
              label: STATUS[status],
            }))}
            placeholder="Every status"
            onChange={(value) => set('status', value)}
          />
          <Checkbox
            label="Latest attempts only"
            description="Each submission's latest attempt, without the earlier ones."
            checked={filters.latest !== null}
            onChange={(checked) => set('latest', checked ? 'true' : '')}
          />
        </>
      )}
      {(entrantOptions.length > 0 || filters.entrant !== null) && (
        <Select
          label="Entrant"
          value={filters.entrant ?? ''}
          options={keep(entrantOptions, filters.entrant)}
          placeholder="Every entrant"
          onChange={(value) => set('entrant', value)}
        />
      )}
      <form
        className={classes.user}
        onSubmit={submitUser}
        aria-label="By who submitted"
      >
        <TextInput
          label="Submitted by"
          placeholder="A username"
          description={
            teams ? 'Finds the submissions one member of a team made.' : undefined
          }
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
 * contest or one of its tasks: what waits to be graded above, with the gradings that failed on Unicon's side
 * that wait and a link to them; the filters by task, entrant, the member who
 * submitted, status and latest attempts only, kept in the page's address;
 * and the gradings as `GradingsList` shows them, with Rejudge always there,
 * asking which task in its confirmation, the one the feed is filtered to
 * chosen to begin with. The live stream makes the feed and the queue stale
 * as gradings move; while it is down both are read again every ten seconds
 * while something is still to finish.
 */
export function GradingsFeedPage() {
  const path = useContestParams();
  const [search] = useSearchParams();
  const filters = readFilters(search);
  const live = useLiveConnected();
  const tasks = useTasks(path);
  const entrants = useEntrantList(path);
  const view = queryView(
    $api.useQuery(
      'get',
      '/api/v1/orgs/{org}/contests/{contest}/gradings',
      { params: { path, query: feedQuery(filters) } },
      { refetchInterval: (query) => readAgainIn(live, query.state.data) },
    ),
  );
  const filtered = Object.values(filters).some((value) => value !== null);
  const regrade = useRegrades(path).data?.find((found) => found.id === filters.regrade);

  return (
    <SectionPage section={sectionOf(CONTEST_SECTIONS, 'gradings')}>
      <Card>
        <QueueDepthPanel
          path={path}
          showingFailed={filters.status === 'system_error' && filters.latest === true}
        />
      </Card>
      <RegradeSummaries path={path} />
      <Card>
        <div className={classes.stack}>
          <SectionTitle>
            {filters.regrade === null
              ? 'Every grading'
              : regrade === undefined
                ? 'What a regrade changed'
                : `What the regrade of ${regradedTask(regrade)} changed`}
          </SectionTitle>
          {filters.regrade !== null && (
            <BodyText tone="secondary">
              Each submission it graded, with its result before the regrade and after
              it. <PageLink to="?">Show every grading</PageLink>
            </BodyText>
          )}
          <FilterBar filters={filters} tasks={tasks} entrants={entrants} />
          <GradingsList
            path={path}
            view={view}
            showTask
            rejudge={{ tasks: tasks.map((task) => task.value), task: filters.task }}
            empty={
              filters.regrade !== null
                ? 'No submission of this regrade matches.'
                : filtered
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
    </SectionPage>
  );
}
