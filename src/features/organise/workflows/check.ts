import { apiClient } from '@/api/client';
import type { Values } from '../forms/values';

/**
 * The forge's check of a draft's values as a version would be checked,
 * without writing anything: every problem at its path in the values, none
 * when they would make a version. Each answer is kept, as it doesn't change
 * while the page is open; a call for values since edited is cancelled.
 */
export function checkQuery(values: Values, paths?: readonly string[]) {
  const ordered = paths === undefined ? undefined : [...paths].sort();
  return {
    queryKey: ['workflow-check', values, ordered],
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const { data } = await apiClient.POST('/api/v1/workflows/check', {
        body: { values, ...(ordered === undefined ? {} : { paths: ordered }) },
        signal,
      });
      return data?.problems ?? [];
    },
    staleTime: Infinity,
    retry: false,
  } as const;
}
