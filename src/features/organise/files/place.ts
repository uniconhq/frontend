import type { QueryKey } from '@tanstack/react-query';
import { byPlace, type At } from '@/api/place';
import { $api, widenQuery } from '@/api/query';

/**
 * A repo whose files an organiser edits: a contest's or a task's. The file
 * routes are the same under either prefix, so the file components take a
 * place and these choose the address.
 */
export type Place = At<'contest' | 'task'>;

export type WorkflowPlace = At<'workflow'>;
export type FilePlace = Place | WorkflowPlace;
/** A workflow's version, whose files are listed and downloaded, never read here. */
export type VersionPlace = At<'version'>;
/** A place whose files are listed. */
export type ListedPlace = FilePlace | VersionPlace;

const CONTEST_TREE = '/api/v1/orgs/{org}/contests/{contest}/tree';
const TASK_TREE = '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/tree';

/** The settings file of a place, changed on its pages and read in its files. */
export function settingsPath(place: Place): string {
  return place.kind === 'task' ? 'task.yaml' : 'contest.yaml';
}

export function treeQuery(place: ListedPlace, folder: string) {
  const query = { path: folder };
  return byPlace(place, {
    version: (path) =>
      widenQuery(
        $api.queryOptions(
          'get',
          '/api/v1/workflows/{owner}/{name}/versions/{version}/tree',
          { params: { path, query } },
        ),
      ),
    workflow: (path) =>
      widenQuery(
        $api.queryOptions('get', '/api/v1/workflows/{owner}/{name}/tree', {
          params: { path, query },
        }),
      ),
    contest: (path) =>
      widenQuery($api.queryOptions('get', CONTEST_TREE, { params: { path, query } })),
    task: (path) =>
      widenQuery($api.queryOptions('get', TASK_TREE, { params: { path, query } })),
  });
}

/** A file of a place, or of a contest or a task as it was at version `at`. */
export function fileQuery(place: FilePlace, path: string, at?: string) {
  const query = at === undefined ? undefined : { at };
  return byPlace(place, {
    workflow: (where) =>
      widenQuery(
        $api.queryOptions('get', '/api/v1/workflows/{owner}/{name}/files/{path}', {
          params: { path: { ...where, path } },
        }),
      ),
    contest: (where) =>
      widenQuery(
        $api.queryOptions('get', '/api/v1/orgs/{org}/contests/{contest}/files/{path}', {
          params: { path: { ...where, path }, query },
        }),
      ),
    task: (where) =>
      widenQuery(
        $api.queryOptions(
          'get',
          '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/files/{path}',
          { params: { path: { ...where, path }, query } },
        ),
      ),
  });
}

/** A place's settings as their form's values. */
export function settingsQuery(place: Place) {
  return byPlace(place, {
    contest: (path) =>
      widenQuery(
        $api.queryOptions('get', '/api/v1/orgs/{org}/contests/{contest}/settings', {
          params: { path },
        }),
      ),
    task: (path) =>
      widenQuery(
        $api.queryOptions(
          'get',
          '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/settings',
          { params: { path } },
        ),
      ),
  });
}

/**
 * What a write leaves stale. Any folder of the place may list a changed size;
 * a key without the folder matches every folder of this place and no other.
 * A task's write is a save, so its state, its publications and the history
 * of every file move too, and its contest's list of tasks, whose points can
 * move with it.
 */
export function staleAfterWrite(place: Place): QueryKey[] {
  return byPlace(place, {
    // The contest's settings, read for its page, its home and its tasks'
    // timelines move with a write of its settings.
    contest: (path) => [
      $api.queryOptions('get', CONTEST_TREE, { params: { path } }).queryKey,
      fileQuery(place, 'contest.yaml').queryKey,
      settingsQuery(place).queryKey,
      $api.queryOptions('get', '/api/v1/orgs/{org}/contests/{contest}/home', {
        params: { path },
      }).queryKey,
      $api.queryOptions('get', '/api/v1/orgs/{org}/contests/{contest}/organise/tasks', {
        params: { path },
      }).queryKey,
    ],
    task: (path) => [
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
        { params: { path } },
      ).queryKey,
      $api.queryOptions('get', '/api/v1/orgs/{org}/contests/{contest}/organise/tasks', {
        params: { path: { org: path.org, contest: path.contest } },
      }).queryKey,
    ],
  });
}
