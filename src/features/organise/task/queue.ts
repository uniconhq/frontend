import type { QueryView } from '@/api/query';
import { toApiError } from '@/api/problem';

/**
 * What the grading queue says for a task with no publication, which the
 * forge answers with a 404: nothing can be graded on it, so nothing waits
 * for a mark, and the page is not missing.
 */
export const UNPUBLISHED = 'Nothing to mark until the task is published.';

export function isUnpublished(view: QueryView<unknown>): boolean {
  return view.state === 'error' && view.error.status === 404;
}

/** Retries a failed read of the queue, but not the 404 a task with no publication gives. */
export function retryQueue(failures: number, error: unknown): boolean {
  return toApiError(error).status !== 404 && failures < 3;
}
