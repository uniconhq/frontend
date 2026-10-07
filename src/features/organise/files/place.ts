import type { QueryKey } from '@tanstack/react-query';
import { $api, widenQuery } from '@/api/query';

/**
 * A repo whose files an organiser edits: a contest's or a task's. The file
 * routes are the same under either prefix, so the file components take a
 * place and these choose the address.
 */
export type Place =
  | { kind: 'contest'; org: string; contest: string }
  | { kind: 'task'; org: string; contest: string; task: string };

const CONTEST_TREE = '/api/v1/orgs/{org}/contests/{contest}/tree';
const TASK_TREE = '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/tree';

export function treeQuery(place: Place, folder: string) {
  const query = { path: folder };
  return place.kind === 'task'
    ? widenQuery(
        $api.queryOptions('get', TASK_TREE, {
          params: {
            path: { org: place.org, contest: place.contest, task: place.task },
            query,
          },
        }),
      )
    : widenQuery(
        $api.queryOptions('get', CONTEST_TREE, {
          params: { path: { org: place.org, contest: place.contest }, query },
        }),
      );
}

export function fileQuery(place: Place, path: string) {
  return place.kind === 'task'
    ? widenQuery(
        $api.queryOptions(
          'get',
          '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/files/{path}',
          {
            params: {
              path: { org: place.org, contest: place.contest, task: place.task, path },
            },
          },
        ),
      )
    : widenQuery(
        $api.queryOptions('get', '/api/v1/orgs/{org}/contests/{contest}/files/{path}', {
          params: { path: { org: place.org, contest: place.contest, path } },
        }),
      );
}

/**
 * What a write leaves stale. Any folder of the place may list a changed size;
 * a key without the folder matches every folder of this place and no other.
 * A task's write is a save, so its state, its publications and the history
 * of every file move too.
 */
export function staleAfterWrite(place: Place): QueryKey[] {
  if (place.kind === 'contest') {
    const path = { org: place.org, contest: place.contest };
    return [$api.queryOptions('get', CONTEST_TREE, { params: { path } }).queryKey];
  }
  const path = { org: place.org, contest: place.contest, task: place.task };
  return [
    $api.queryOptions('get', TASK_TREE, { params: { path } }).queryKey,
    $api.queryOptions('get', '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}', {
      params: { path },
    }).queryKey,
    $api.queryOptions(
      'get',
      '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/publications',
      { params: { path } },
    ).queryKey,
    $api.queryOptions(
      'get',
      '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/history',
      {
        params: { path },
      },
    ).queryKey,
  ];
}
