import type { QueryView } from '@/api/query';
import { toApiError } from '@/api/problem';

/**
 * The forge answers the queue with a 404 for a task with no publication;
 * that means nothing to mark, not a missing page.
 */
export const UNPUBLISHED = 'Nothing to mark until the task is published.';

export function isUnpublished(view: QueryView<unknown>): boolean {
  return view.state === 'error' && view.error.status === 404;
}

/** Retries a failed read of the queue, but not the 404 a task with no publication gives. */
export function retryQueue(failures: number, error: unknown): boolean {
  return toApiError(error).status !== 404 && failures < 3;
}
