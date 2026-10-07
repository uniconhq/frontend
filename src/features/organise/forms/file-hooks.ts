import { useQuery, useQueryClient } from '@tanstack/react-query';
import { $api } from '@/api/query';
import { toApiError } from '@/api/problem';
import type { WriteFile } from '@/api/types';
import type { Outcome } from '../files/SaveOutcome';
import { fileQuery, staleAfterWrite, type Place } from '../files/place';

/**
 * A file read for a form or the statement, under a key of its own: the file
 * editor's copy of the same file keeps its own token, so a save here never
 * swaps the text under an edit there, which then conflicts as it should.
 * Read once, never refetched behind the organiser's back, and read afresh
 * each time the view opens.
 */
export function useOwnFile(place: Place, path: string) {
  const { queryKey, queryFn } = fileQuery(place, path);
  return useQuery({
    queryKey: [...queryKey, 'own'],
    queryFn,
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

/**
 * The same write the file editor makes, at a contest or a task: at a task it
 * is the save of the task, which publishes or keeps a draft. A write that
 * went through leaves the place's tree, and a task's state and publications,
 * to be read again.
 */
export function useFileWrite(place: Place, path: string) {
  const queryClient = useQueryClient();
  const writeContest = $api.useMutation(
    'put',
    '/api/v1/orgs/{org}/contests/{contest}/files/{path}',
  );
  const writeTask = $api.useMutation(
    'put',
    '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/files/{path}',
  );

  const write = async (body: WriteFile): Promise<Outcome> => {
    let outcome: Outcome;
    try {
      if (place.kind === 'task') {
        const result = await writeTask.mutateAsync({
          params: {
            path: { org: place.org, contest: place.contest, task: place.task, path },
          },
          body,
        });
        outcome = { kind: 'saved', result };
      } else {
        const written = await writeContest.mutateAsync({
          params: { path: { org: place.org, contest: place.contest, path } },
          body,
        });
        outcome = { kind: 'written', version: written.version };
      }
    } catch (caught) {
      return { kind: 'refused', error: toApiError(caught), body };
    }
    await Promise.all(
      staleAfterWrite(place).map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    );
    return outcome;
  };

  return { write, pending: writeContest.isPending || writeTask.isPending };
}
