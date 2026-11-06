import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { $api, queryView } from '@/api/query';
import { toApiError, type ApiError } from '@/api/problem';
import type { Marks } from '@/api/types';
import { serverNow } from '@/lib/time';

type TaskPath = { org: string; contest: string; task: string };

const MARKS = '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/marks';
const MARK = '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/marks/{number}';

// Polled so a teammate's mark shows, and marks turn final at the close.
const MEANWHILE_MS = 30_000;

/** Refusals no wait changes, so polling stops. */
const NOTHING_TO_MARK = new Set(['marks_off', 'not_approved']);

function readAgainIn(marks: Marks | undefined, error: unknown): number | false {
  if (error !== null && NOTHING_TO_MARK.has(toApiError(error).code)) return false;
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

/** The reader's row's marks on a task, read only when the page says `marked`. */
export function useMarks(path: TaskPath, marked: boolean): MarkState {
  const queryClient = useQueryClient();
  const [refusal, setRefusal] = useState<ApiError | null>(null);
  const options = { params: { path } };
  const view = queryView(
    $api.useQuery('get', MARKS, options, {
      enabled: marked,
      retry: false,
      refetchInterval: (query) => readAgainIn(query.state.data, query.state.error),
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
