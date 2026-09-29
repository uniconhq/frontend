import type { ApiError } from '@/api/problem';
import type { DefinitionError } from '@/api/types';

/**
 * The members a refusal carries beside its detail, so the page can name what
 * stands in the way: `admin_only` its `keys`, `reserved_path` its `paths`,
 * `confirmation_required` its `changes`, `invalid_definition` its `errors`
 * and `invalid_path` its `path`. Shape-checked rather than trusted, so a stale
 * backend cannot blank the page.
 */
export function stringsOf(error: ApiError, member: string): string[] {
  const value = error.extensions[member];
  if (typeof value === 'string') return [value];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

export function definitionErrorsOf(error: ApiError): DefinitionError[] {
  const value = error.extensions['errors'];
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is DefinitionError =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as DefinitionError).path === 'string' &&
      typeof (item as DefinitionError).message === 'string',
  );
}
