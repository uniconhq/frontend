import type { Query } from '@tanstack/react-query';

/**
 * The `meta` of a read that a form or an editor edits from: a file's text
 * and the token a save presents with it, a form's settings, or what a form
 * is built from. The re-read of everything when the live stream opens again
 * passes over it, so coming back to the tab never swaps what is being edited
 * for someone else's version or holds the form while it reads. A change made
 * elsewhere meanwhile is met at the save, which presents the token the text
 * was read with and so is refused as a conflict, on the conflict screen.
 * Such a read is read afresh each time its view opens and after each save.
 */
export const EDITED = { edited: true };

export function isEdited(query: Query): boolean {
  return query.meta?.['edited'] === true;
}
