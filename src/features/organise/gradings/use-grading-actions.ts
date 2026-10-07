import { useQueryClient } from '@tanstack/react-query';
import { $api } from '@/api/query';
import type { FeedEntry, Rejudged } from '@/api/types';

type ContestPath = { org: string; contest: string };

/**
 * What a manager is being asked to confirm, each about one task: a retry or a
 * cancel of a submission's latest attempt, the cancel with the sentence its
 * contestant will read, or a rejudge of the whole task.
 */
export type Asking =
  | { kind: 'retry'; task: string; entry: FeedEntry }
  | { kind: 'cancel'; task: string; entry: FeedEntry; reason: string }
  | { kind: 'rejudge'; task: string; title: string };

/** Every read a grading's change can move: a task's gradings, the feed and the queue. */
const READS = [
  '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/gradings',
  '/api/v1/orgs/{org}/contests/{contest}/gradings',
  '/api/v1/orgs/{org}/contests/{contest}/gradings/queue',
] as const;

/**
 * The three changes, through the task's own routes, each making a task's
 * gradings, the feed and the queue stale once answered or refused, since a
 * refusal here usually means the grading moved on.
 */
export function useGradingActions(path: ContestPath) {
  const queryClient = useQueryClient();
  const readAgain = {
    onSettled: () =>
      Promise.all(
        READS.map((route) =>
          queryClient.invalidateQueries({ queryKey: ['get', route] }),
        ),
      ),
  };
  const cancel = $api.useMutation(
    'post',
    '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/gradings/{grading}/cancel',
    readAgain,
  );
  const retry = $api.useMutation(
    'post',
    '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/gradings/{grading}/retry',
    readAgain,
  );
  const rejudge = $api.useMutation(
    'post',
    '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/rejudge',
    readAgain,
  );

  const reset = () => {
    cancel.reset();
    retry.reset();
    rejudge.reset();
  };

  /** Runs what was asked; true once it has gone through. */
  const run = async (asking: Asking): Promise<Rejudged | true | false> => {
    const task = { ...path, task: asking.task };
    try {
      if (asking.kind === 'rejudge')
        return await rejudge.mutateAsync({ params: { path: task } });
      const params = { path: { ...task, grading: asking.entry.grading.id } };
      if (asking.kind === 'retry') await retry.mutateAsync({ params });
      else await cancel.mutateAsync({ params, body: { reason: asking.reason.trim() } });
      return true;
    } catch {
      return false;
    }
  };

  return {
    run,
    reset,
    pending: cancel.isPending || retry.isPending || rejudge.isPending,
    error: cancel.error ?? retry.error ?? rejudge.error,
  };
}
