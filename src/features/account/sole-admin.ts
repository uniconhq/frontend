import type { ApiError } from '@/api/problem';

export type AdminScope = { kind: string; name: string };

/**
 * `sole_admin` (409) carries the scopes where this person is the only admin as
 * an extension member on the problem document. Shape-checked rather than
 * trusted, so a stale backend cannot blank the dialog.
 */
export function soleAdminScopes(error: ApiError): AdminScope[] {
  const scopes = error.extensions['scopes'];
  if (!Array.isArray(scopes)) return [];

  return scopes.filter(
    (scope): scope is AdminScope =>
      typeof scope === 'object' &&
      scope !== null &&
      typeof (scope as AdminScope).kind === 'string' &&
      typeof (scope as AdminScope).name === 'string',
  );
}
