import createQueryClient from 'openapi-react-query';
import type { QueryFunction, QueryKey, UseQueryResult } from '@tanstack/react-query';
import { apiClient } from './client';
import { type ApiError, toApiError } from './problem';

export const $api = createQueryClient(apiClient);

/** Forgets a key's literal type, so a choice between typed addresses fits `useQuery`. */
export function widenQuery<TData, TKey extends QueryKey>(options: {
  queryKey: TKey;
  queryFn: QueryFunction<TData, TKey>;
}): { queryKey: QueryKey; queryFn: QueryFunction<TData> } {
  const { queryKey, queryFn } = options;
  return { queryKey, queryFn: (context) => queryFn({ ...context, queryKey }) };
}

export type QueryView<T> =
  | { state: 'loading' }
  | { state: 'error'; error: ApiError; retry: () => void }
  | { state: 'ready'; data: T };

/** A failed refetch keeps the last answer, so one missed poll shows no error. */
export function queryView<T>(query: UseQueryResult<T, unknown>): QueryView<T> {
  if (query.isPending) return { state: 'loading' };
  if (query.data !== undefined) return { state: 'ready', data: query.data };
  if (query.isError) {
    return {
      state: 'error',
      error: toApiError(query.error),
      retry: () => void query.refetch(),
    };
  }
  return { state: 'ready', data: query.data };
}
