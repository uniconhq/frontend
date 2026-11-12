import { useMemo } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { $api, queryView, type QueryView } from '@/api/query';
import { toApiError } from '@/api/problem';
import type { ShowPreview as Preview, ShowPreviewRequest } from '@/api/types';
import { useSettled } from '@/lib/use-settled';
import { taskPath, type TaskPlace } from './build-data';
import { showLists, type Moment, type Show } from './scoring-model';

const TASK = '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}';

/** How long the grid stays still before the preview is asked for again. */
const SETTLE_MS = 400;

/**
 * A made-up graded submission of the saved draft, with the grid's show, as
 * an entrant would read it at a moment. Asked for again once the grid stays
 * still, and after each save.
 */
export function useShowPreview(
  place: TaskPlace,
  show: Show,
  moment: Moment,
): QueryView<Preview> {
  const path = taskPath(place);
  const task = $api.useQuery('get', TASK, { params: { path } });
  // Settled as text, which stays the same from render to render while the
  // grid does, where an object made afresh each render would not.
  const asked = useSettled(
    JSON.stringify({ show: showLists(show) ?? {}, moment }),
    SETTLE_MS,
  );
  const body = useMemo(() => JSON.parse(asked) as ShowPreviewRequest, [asked]);
  const preview = queryView(
    useQuery({
      queryKey: ['show-preview', path, task.data?.head, body],
      queryFn: async (): Promise<Preview> => {
        const { data } = await apiClient.POST(`${TASK}/show-preview`, {
          params: { path },
          body,
        });
        if (data === undefined) throw new Error('The preview could not be read.');
        return data;
      },
      enabled: task.data !== undefined,
      placeholderData: keepPreviousData,
      retry: false,
    }),
  );
  if (task.isError) {
    return {
      state: 'error',
      error: toApiError(task.error),
      retry: () => void task.refetch(),
    };
  }
  return preview;
}
