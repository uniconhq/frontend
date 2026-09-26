import type { ApiError } from '@/api/problem';

/**
 * `shared_workflow_owner` (409) names the workflows, as `owner/name`, that
 * other people still use and this person owns. Shape-checked rather than
 * trusted, so a stale backend cannot blank the dialog.
 */
export function sharedWorkflows(error: ApiError): string[] {
  const workflows = error.extensions['workflows'];
  if (!Array.isArray(workflows)) return [];
  return workflows.filter(
    (workflow): workflow is string => typeof workflow === 'string',
  );
}
