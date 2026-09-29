import createQueryClient from 'openapi-react-query';
import type { QueryFunction, QueryKey, UseQueryResult } from '@tanstack/react-query';
import { apiClient } from './client';
import { type ApiError, toApiError } from './problem';

/**
 * Every server read goes through `$api`, so the request, the response and the
 * query key are all typed from the backend's OpenAPI document.
 */
export const $api = createQueryClient(apiClient);

/**
 * The same read at one of several typed addresses, such as a folder of a
 * contest or of a task. Each `$api.queryOptions` call keeps its own key type,
 * so a function choosing between them returns a union `useQuery` cannot take;
 * this keeps the key and the fetch exactly as generated and forgets only the
 * key's literal type.
 */
export function widenQuery<TData, TKey extends QueryKey>(options: {
  queryKey: TKey;
  queryFn: QueryFunction<TData, TKey>;
}): { queryKey: QueryKey; queryFn: QueryFunction<TData> } {
  const { queryKey, queryFn } = options;
  return { queryKey, queryFn: (context) => queryFn({ ...context, queryKey }) };
}

type QueryView<T> =
  | { state: 'loading' }
  | { state: 'error'; error: ApiError; retry: () => void }
  | { state: 'ready'; data: T };

/**
 * Three states a page has to render, from the dozen React Query exposes. It
 * also corrects the error type: the middleware in client.ts turns every failure
 * into an ApiError, which is not what the document declares.
 */
export function queryView<T>(query: UseQueryResult<T, unknown>): QueryView<T> {
  if (query.isPending) return { state: 'loading' };
  if (query.isError) {
    return {
      state: 'error',
      error: toApiError(query.error),
      retry: () => void query.refetch(),
    };
  }
  return { state: 'ready', data: query.data };
}
