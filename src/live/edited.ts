import type { Query } from '@tanstack/react-query';

/**
 * `meta` for a read a form or editor edits from. Live re-reads skip it so the
 * draft is never swapped out; a change made elsewhere shows as a save conflict.
 */
export const EDITED = { edited: true };

export function isEdited(query: Query): boolean {
  return query.meta?.['edited'] === true;
}
