import type { ApiError } from '@/api/problem';
import type { DefinitionError, SaveEffect } from '@/api/types';

/**
 * The members a refusal carries beside its detail, so the page can name what
 * stands in the way: `admin_only` its `keys`, `reserved_path` its `paths`,
 * `confirmation_required` its `changes` and what the save would do
 * (`effectOf`), `invalid_definition`
 * its `errors` and `invalid_path` its `path`. Shape-checked rather than
 * trusted, so a stale backend cannot blank the page.
 */
export function stringsOf(error: ApiError, member: string): string[] {
  const value = error.extensions[member];
  if (typeof value === 'string') return [value];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

/**
 * What a save would do, as `confirmation_required` says it beside its
 * `changes`, or null from a backend that does not say it yet: no `summary`.
 */
export function effectOf(error: ApiError): SaveEffect | null {
  const summary = error.extensions['summary'];
  if (typeof summary !== 'string') return null;
  return {
    summary,
    results_change: error.extensions['results_change'] === true,
    runs_again: stringsOf(error, 'runs_again'),
    scores: stringsOf(error, 'scores'),
    reading: stringsOf(error, 'reading'),
  };
}

/**
 * What a `confirmation_required` was worked out from, the head and the
 * latest publication, which a confirmation sends back as `asked` so it
 * stands for nothing saved since; undefined from a backend that does not
 * say it yet.
 */
export function askedOf(error: ApiError): string | undefined {
  const asked = error.extensions['asked'];
  return typeof asked === 'string' ? asked : undefined;
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
