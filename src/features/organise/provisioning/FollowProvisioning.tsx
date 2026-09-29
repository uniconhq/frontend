import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryView } from '@/api/query';
import type { Provisioning } from '@/api/types';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { t } from '@/lib/t';
import { ProvisioningProgress } from './ProvisioningProgress';
import {
  nameOf,
  pageOf,
  provisioningQuery,
  staleOnceReady,
  type Following,
  type Target,
} from './target';

/** About once a second: forge's poller takes a waiting row every two. */
const FOLLOW_EVERY_MS = 1_000;
/** Slower while failed: forge waits before each new try, longer each time. */
const FOLLOW_FAILED_EVERY_MS = 5_000;

const KIND: Record<Target['kind'], string> = {
  org: 'the org',
  contest: 'the contest',
  task: 'the task',
};

function followEvery(record: Provisioning | undefined): number | false {
  switch (record?.status) {
    case 'pending':
    case 'running':
      return FOLLOW_EVERY_MS;
    case 'failed':
      return FOLLOW_FAILED_EVERY_MS;
    default:
      return false;
  }
}

/**
 * Follows the provisioning status of something just asked for, starting from
 * the record the create answered with, until it is ready: about once a second
 * while it is pending or running, and every five seconds while it is failed,
 * since forge tries a failed one again on its own. On ready, whatever lists
 * the new thing is fetched again, so it shows up without a reload.
 */
export function FollowProvisioning({ target, initial }: Following) {
  const queryClient = useQueryClient();
  const query = useQuery({
    ...provisioningQuery(target),
    initialData: initial,
    refetchInterval: (current) => followEvery(current.state.data),
  });
  const view = queryView(query);
  const status = view.state === 'ready' ? view.data.status : null;
  const announced = useRef(false);

  useEffect(() => {
    if (status !== 'ready' || announced.current) return;
    announced.current = true;
    void queryClient.invalidateQueries({ queryKey: staleOnceReady(target) });
  }, [status, queryClient, target]);

  if (view.state === 'loading') return <PageSkeleton rows={2} />;
  if (view.state === 'error')
    return <ErrorBlock error={view.error} onRetry={view.retry} />;

  return (
    <ProvisioningProgress
      record={view.data}
      label={`${t(KIND[target.kind])} ${nameOf(target)}`}
      page={pageOf(target)}
    />
  );
}
