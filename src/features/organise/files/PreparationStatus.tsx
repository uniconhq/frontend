import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { staleAfterWrite, fileQuery } from './place';
import { $api } from '@/api/query';
import { toApiError } from '@/api/problem';
import { useTaskParams } from '@/lib/route-params';
import { BodyText } from '@/ui/BodyText';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';

/** A save finishes only after the server publishes the prepared lock. */
export function PreparationStatus({ id }: { id: string }) {
  const path = useTaskParams();
  const queryClient = useQueryClient();
  const query = $api.useQuery(
    'get',
    '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/preparation',
    { params: { path } },
    {
      refetchOnMount: 'always',
      refetchInterval: (query) =>
        query.state.data?.status === 'preparing' || query.state.data === undefined
          ? 1000
          : false,
    },
  );
  useEffect(() => {
    if (query.data?.id !== id || query.data.status !== 'ready') return;
    const place = {
      kind: 'task' as const,
      org: path.org,
      contest: path.contest,
      task: path.task,
    };
    for (const queryKey of [
      ...staleAfterWrite(place),
      fileQuery(place, 'task.yaml').queryKey,
    ])
      void queryClient.invalidateQueries({ queryKey });
  }, [query.data, id, queryClient, path.org, path.contest, path.task]);
  if (query.error !== null)
    return (
      <ErrorBlock
        error={toApiError(query.error)}
        onRetry={() => void query.refetch()}
      />
    );
  const result = query.data;
  if (result === undefined) return <BodyText>Preparing packages…</BodyText>;
  if (result.id !== id || result.status === 'replaced')
    return <BodyText>A later save replaced this preparation.</BodyText>;
  if (result.status === 'refused')
    return (
      <BodyText>
        Packages could not be prepared: {result.reason}. Nothing was published; the
        previous publication still grades.
      </BodyText>
    );
  if (result.status === 'ready' && result.result !== null)
    return (
      <BodyText>Saved and published as publication {result.result.number}.</BodyText>
    );
  return <BodyText>Preparing packages…</BodyText>;
}
