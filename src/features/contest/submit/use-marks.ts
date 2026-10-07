import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { $api, queryView } from '@/api/query';
import { toApiError, type ApiError } from '@/api/problem';
import type { Marks } from '@/api/types';
import { serverNow } from '@/lib/time';

type TaskPath = { org: string; contest: string; task: string };

const MARKS = '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/marks';
const MARK = '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/marks/{number}';

/**
 * How often the marks are read again: a team's members share one set, so a
 * mark one of them sets reaches the others, and at the row's close they turn
 * final without a reload.
 */
const MEANWHILE_MS = 30_000;

function readAgainIn(marks: Marks | undefined): number | false {
  if (marks === undefined) return MEANWHILE_MS;
  if (marks.frozen) return false;
  const left = Date.parse(marks.closes_at) - serverNow().getTime();
  return Math.max(1_000, Math.min(MEANWHILE_MS, left + 1_000));
}

export type MarkState =
  /** No board counts marks on this task, or the reader holds no row. */
  | { kind: 'none' }
  | {
      kind: 'held';
      marks: Marks;
      refusal: ApiError | null;
      busy: boolean;
      toggle: (number: number, marked: boolean) => void;
    };

/**
 * The marks the reader's row holds on a task its `marked` boards count, and
 * a way to set or take one off. A task no such board covers answers
 * `marks_off`, and a reader who is no approved contestant `not_approved`;
 * both mean there is nothing to mark. A refused mark, such as one past the
 * task's `marks`, is kept to be said until the next toggle.
 */
export function useMarks(path: TaskPath): MarkState {
  const queryClient = useQueryClient();
  const [refusal, setRefusal] = useState<ApiError | null>(null);
  const options = { params: { path } };
  const view = queryView(
    $api.useQuery('get', MARKS, options, {
      retry: false,
      refetchInterval: (query) => readAgainIn(query.state.data),
    }),
  );
  const key = $api.queryOptions('get', MARKS, options).queryKey;
  const settled = {
    onSuccess: (marks: Marks) => queryClient.setQueryData(key, marks),
    onError: (error: unknown) => {
      setRefusal(toApiError(error));
      void queryClient.invalidateQueries({ queryKey: key });
    },
  };
  const mark = $api.useMutation('put', MARK, settled);
  const unmark = $api.useMutation('delete', MARK, settled);

  if (view.state !== 'ready') return { kind: 'none' };
  return {
    kind: 'held',
    marks: view.data,
    refusal,
    busy: mark.isPending || unmark.isPending,
    toggle: (number, marked) => {
      setRefusal(null);
      const sent = { params: { path: { ...path, number } } };
      if (marked) mark.mutate(sent);
      else unmark.mutate(sent);
    },
  };
}
