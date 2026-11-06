import type { ScopeNames } from '@/api/types';

export function scopeName(names: ScopeNames): string {
  return [names.org, names.contest, names.task]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join('/');
}
