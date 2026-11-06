import type { ApiError } from '@/api/problem';

export type AdminScope = { kind: string; name: string };

/** Shape-checked, so an odd answer cannot blank the dialog. */
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
