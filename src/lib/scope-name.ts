import type { ScopeNames } from '@/api/types';

/**
 * A scope as one readable path: the org, then the contest and the task when
 * the scope reaches that deep.
 */
export function scopeName(names: ScopeNames): string {
  return [names.org, names.contest, names.task]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join('/');
}
