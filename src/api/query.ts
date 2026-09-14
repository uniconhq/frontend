import createQueryClient from 'openapi-react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import { apiClient } from './client';
import { type ApiError, toApiError } from './problem';

/**
 * Every server read goes through `$api`, so the request, the response and the
 * query key are all typed from the backend's OpenAPI document.
 */
export const $api = createQueryClient(apiClient);

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
