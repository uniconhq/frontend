import { apiClient } from '@/api/client';

/**
 * The forge's check of a definition as a version would be checked, without
 * writing anything: every problem at its YAML path, none when the text would
 * make a version. Each text is checked once, as its answer doesn't change
 * while the page is open; a call for text since edited is cancelled.
 */
export function checkQuery(text: string, paths?: readonly string[]) {
  const ordered = paths === undefined ? undefined : [...paths].sort();
  return {
    queryKey: ['workflow-check', text, ordered],
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const { data } = await apiClient.POST('/api/v1/workflows/check', {
        body: { content: text, ...(ordered === undefined ? {} : { paths: ordered }) },
        signal,
      });
      return data?.problems ?? [];
    },
    staleTime: Infinity,
    retry: false,
  } as const;
}
