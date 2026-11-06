import { apiClient } from '@/api/client';
import type { ShownFile } from '@/api/types';
import type { FilesAsk } from '@/ui/scored/ShownInputs';

/**
 * Where one file of one of your own submissions downloads from: the download
 * door on this origin. The proxy in `deploy` asks the backend whether the file
 * is yours and then streams it from the forge, so a file of any size comes
 * back without passing through the platform, and a dropped download resumes.
 * Each part of the address is encoded on its own, so a name stays one segment.
 */
export function downloadHref(
  where: { org: string; contest: string; task: string; number: number },
  path: string,
): string {
  const parts = [where.org, where.contest, where.task, String(where.number)];
  return `/-/downloads/${[...parts, ...path.split('/')].map(encodeURIComponent).join('/')}`;
}

/**
 * The files of an input the task's page or one of your submissions shows,
 * each by its address at the download door: a setting the task shows, a
 * run's input the task's page lists, or, with the submission's `number`, a
 * run's input its result shows, by the entry's `of` and the run's place.
 */
export async function readShownFiles(
  where: { org: string; contest: string; task: string; number?: number },
  ask: FilesAsk,
): Promise<ShownFile[]> {
  const { org, contest, task, number } = where;
  const { group, place, name } = ask;
  const found =
    group === null || place === null
      ? await apiClient.GET(
          '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/inputs/{name}',
          {
            params: { path: { org, contest, task, name } },
          },
        )
      : number === undefined
        ? await apiClient.GET(
            '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/runs/{group}/{place}/inputs/{name}',
            { params: { path: { org, contest, task, group, place, name } } },
          )
        : await apiClient.GET(
            '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/submissions/{number}/runs/{group}/{place}/inputs/{name}',
            { params: { path: { org, contest, task, number, group, place, name } } },
          );
  if (found.data === undefined) throw new Error('The files could not be listed.');
  return found.data.files;
}
