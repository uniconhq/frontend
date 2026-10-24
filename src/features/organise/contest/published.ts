import { $api } from '@/api/query';
import type { FileContent, TaskStanding } from '@/api/types';
import type { HeldGroup } from '../forms/board-words';
import { readTask, type GroupValues, type TaskValues } from '../forms/task-values';
import { readSettings } from '../task/build-data';
import { closesWithContest } from './timeline';

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
