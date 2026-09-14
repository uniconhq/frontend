import type { ApiError } from '@/api/problem';

export type AdminScope = { org: string; team: string };

/**
 * `last_admin` (409) carries the places that are blocking as an extension
 * member on the problem document. Shape-checked rather than trusted, so a stale
 * backend cannot blank the dialog.
 */
export function lastAdminScopes(error: ApiError): AdminScope[] {
  const scopes = error.extensions['scopes'];
  if (!Array.isArray(scopes)) return [];

  return scopes.filter(
    (scope): scope is AdminScope =>
      typeof scope === 'object' &&
      scope !== null &&
      typeof (scope as AdminScope).org === 'string' &&
      typeof (scope as AdminScope).team === 'string',
  );
}
