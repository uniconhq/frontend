import type { ApiError } from '@/api/problem';

/** Shape-checked, so an odd answer cannot blank the dialog. */
export function sharedWorkflows(error: ApiError): string[] {
  const workflows = error.extensions['workflows'];
  if (!Array.isArray(workflows)) return [];
  return workflows.filter(
    (workflow): workflow is string => typeof workflow === 'string',
  );
}
