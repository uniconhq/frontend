import { useMemo } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import type { DraftRuns } from '@/api/types';
import { repeatOf, type AxisValues, type InputValues } from '../forms/task-values';
import { taskPath, type TaskPlace } from './build-data';
import { draftRunRows, type DraftRunRows } from './scoring-model';

const TASK = '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}';

/**
 * The runs the draft's axes make, asked of the server as the axes change;
 * the last answer stays while the next loads. `runs` is null until the
 * first answer.
 */
export function useDraftRuns(
  place: TaskPlace,
  axes: AxisValues[],
  inputs: InputValues[],
): { runs: DraftRunRows | null; failed: boolean } {
  const path = taskPath(place);
  const repeat = repeatOf(axes, inputs);
  const answer = useQuery({
    queryKey: ['draft-runs', path, repeat],
    queryFn: async (): Promise<DraftRuns> => {
      const { data } = await apiClient.POST(`${TASK}/draft-runs`, {
        params: { path },
        body: { repeat },
      });
      if (data === undefined) throw new Error('The runs could not be read.');
      return data;
    },
    placeholderData: keepPreviousData,
    retry: false,
  });
  const data = answer.data;
  const runs = useMemo(
    () => (data === undefined ? null : draftRunRows(data, axes)),
    [data, axes],
  );
  return { runs, failed: answer.isError };
}
