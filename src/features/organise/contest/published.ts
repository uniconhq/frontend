import { useQueries } from '@tanstack/react-query';
import { $api } from '@/api/query';
import type { FileContent, TaskStanding } from '@/api/types';
import type { HeldGroup } from '../forms/board-words';
import { readTask, type GroupValues, type TaskValues } from '../forms/task-values';
import { readSettings } from '../task/build-data';
import { closesWithContest } from './timeline';

const STANDINGS = '/api/v1/orgs/{org}/contests/{contest}/organise/tasks';

/**
 * What entrants are told of a task: its settings as its latest publication
 * holds them, not a draft saved since. A publication never changes, so once
 * read it is never read again.
 */
export function publishedQuery(
  org: string,
  contest: string,
  task: string,
  version: string,
) {
  return {
    ...$api.queryOptions(
      'get',
      '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/files/{path}',
      {
        params: {
          path: { org, contest, task, path: 'task.yaml' },
          query: { at: version },
        },
      },
    ),
    staleTime: Infinity,
    retry: false,
  };
}

/** A published task's test groups and how a test earns, or why they cannot be read. */
export type Published =
  | { groups: GroupValues[]; credit: TaskValues['credit'] }
  | { unreadable: 'settings' | 'groups' };

export function readPublished(file: FileContent): Published {
  const settings = readSettings(file);
  if ('error' in settings) return { unreadable: 'settings' };
  const { values, unreadable } = readTask(settings.doc, []);
  if (unreadable.includes('test_groups')) return { unreadable: 'groups' };
  return { groups: values.groups, credit: values.credit };
}

/**
 * A published task's test groups whose results entrants see only once the
 * task closes, as a board's sentence names them.
 */
export function heldOf(
  standing: TaskStanding,
  groups: GroupValues[],
  contest: { start: string; end: string } | null,
): HeldGroup[] {
  const closes = closesWithContest(standing, contest) ? null : standing.timeline.closes;
  return groups
    .filter((group) => group.show === 'after_close')
    .map((group) => ({
      task: standing.task.name,
      label: standing.label,
      group: group.name,
      closes,
    }));
}

/**
 * Every published task's held test groups, for the sentences of the boards
 * that cover them; null until every one is read, or when one cannot be, so a
 * sentence then says what its board counts in general.
 */
export function useHeldGroups(
  org: string,
  contest: string,
  times: { start: string; end: string } | null,
): HeldGroup[] | null {
  const standings = $api.useQuery(
    'get',
    STANDINGS,
    { params: { path: { org, contest } } },
    { retry: false },
  );
  const published = (standings.data ?? []).filter(
    (standing) => standing.state.latest !== null,
  );
  const reads = useQueries({
    queries: published.map((standing) =>
      publishedQuery(
        org,
        contest,
        standing.task.name,
        standing.state.latest?.version ?? '',
      ),
    ),
  });
  if (standings.data === undefined) return null;
  const held: HeldGroup[] = [];
  for (const [at, standing] of published.entries()) {
    const file = reads[at]?.data;
    if (file === undefined) return null;
    const read = readPublished(file);
    if ('unreadable' in read) return null;
    held.push(...heldOf(standing, read.groups, times));
  }
  return held;
}
