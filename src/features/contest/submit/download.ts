import { apiClient } from '@/api/client';
import type { ShownFile } from '@/api/types';
import type { FilesAsk } from '@/ui/scored/ShownInputs';

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
