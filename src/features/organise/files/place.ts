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

export type WorkflowPlace = { kind: 'workflow'; owner: string; name: string };
export type FilePlace = Place | WorkflowPlace;
/** A workflow's version, whose files are listed and downloaded, never read here. */
export type VersionPlace = {
  kind: 'version';
  owner: string;
  name: string;
  version: string;
};
/** A place whose files are listed. */
export type ListedPlace = FilePlace | VersionPlace;

const CONTEST_TREE = '/api/v1/orgs/{org}/contests/{contest}/tree';
const TASK_TREE = '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/tree';

/** The settings file of a place, changed on its pages and read in its files. */
export function settingsPath(place: Place): string {
  return place.kind === 'task' ? 'task.yaml' : 'contest.yaml';
}

export function treeQuery(place: ListedPlace, folder: string) {
  if (place.kind === 'version')
    return widenQuery(
      $api.queryOptions(
        'get',
        '/api/v1/workflows/{owner}/{name}/versions/{version}/tree',
        {
          params: {
            path: { owner: place.owner, name: place.name, version: place.version },
            query: { path: folder },
          },
        },
      ),
    );
  if (place.kind === 'workflow')
    return widenQuery(
      $api.queryOptions('get', '/api/v1/workflows/{owner}/{name}/tree', {
        params: {
          path: { owner: place.owner, name: place.name },
          query: { path: folder },
        },
      }),
    );
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

export function fileQuery(place: FilePlace, path: string) {
  if (place.kind === 'workflow')
    return widenQuery(
      $api.queryOptions('get', '/api/v1/workflows/{owner}/{name}/files/{path}', {
        params: { path: { owner: place.owner, name: place.name, path } },
      }),
    );
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

/** A place's settings as their form's values. */
export function settingsQuery(place: Place) {
  return place.kind === 'task'
    ? widenQuery(
        $api.queryOptions(
          'get',
          '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/settings',
          {
            params: {
              path: { org: place.org, contest: place.contest, task: place.task },
            },
          },
        ),
      )
    : widenQuery(
        $api.queryOptions('get', '/api/v1/orgs/{org}/contests/{contest}/settings', {
          params: { path: { org: place.org, contest: place.contest } },
        }),
      );
}

/**
 * What a write leaves stale. Any folder of the place may list a changed size;
 * a key without the folder matches every folder of this place and no other.
 * A task's write is a save, so its state, its publications and the history
 * of every file move too, and its contest's list of tasks, whose points can
 * move with it.
 */
export function staleAfterWrite(place: Place): QueryKey[] {
  if (place.kind === 'contest') {
    // The contest's settings, read for its page, its home and its tasks'
    // timelines move with a write of its settings.
    const path = { org: place.org, contest: place.contest };
    return [
      $api.queryOptions('get', CONTEST_TREE, { params: { path } }).queryKey,
      fileQuery(place, 'contest.yaml').queryKey,
      settingsQuery(place).queryKey,
      $api.queryOptions('get', '/api/v1/orgs/{org}/contests/{contest}/home', {
        params: { path },
      }).queryKey,
      $api.queryOptions('get', '/api/v1/orgs/{org}/contests/{contest}/organise/tasks', {
        params: { path },
      }).queryKey,
    ];
  }
  const path = { org: place.org, contest: place.contest, task: place.task };
  return [
    $api.queryOptions('get', TASK_TREE, { params: { path } }).queryKey,
    settingsQuery(place).queryKey,
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
    $api.queryOptions('get', '/api/v1/orgs/{org}/contests/{contest}/organise/tasks', {
      params: { path: { org: place.org, contest: place.contest } },
    }).queryKey,
  ];
}
