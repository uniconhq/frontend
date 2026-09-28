import type { Scope } from '@/api/types';

/**
 * A scope as one readable path: the org, then the contest and the task when
 * the scope reaches that deep.
 */
export function scopeName(scope: Scope): string {
  return [scope.org, scope.contest, scope.task]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join('/');
}
