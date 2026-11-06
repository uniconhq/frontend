import { useEffect } from 'react';
import { useLocation } from 'react-router';

/**
 * Calls `then` with what `find` finds, now or once drawn, since a card may show
 * its fields only after its data comes. The returned function stops looking.
 */
export function whenDrawn<T>(
  find: () => T | null,
  then: (found: T) => void,
): () => void {
  const now = find();
  if (now !== null) {
    then(now);
    return () => {};
  }
  const watch = new MutationObserver(() => {
    const found = find();
    if (found === null) return;
    watch.disconnect();
    then(found);
  });
  watch.observe(document.body, { childList: true, subtree: true });
  return () => watch.disconnect();
}

/** Whether anything drawn before `element` is still loading, and so will grow. */
function loadingAbove(element: Element): boolean {
  return [...document.querySelectorAll('[aria-label="Loading"]')].some(
    (loading) =>
      (loading.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING) !==
      0,
  );
}

/**
 * Scrolls to the address's anchor (`#file`) once nothing above it is still
 * loading, so it stays in place; and again each time a link names it.
 */
export function useAnchor() {
  const { hash, key } = useLocation();
  useEffect(() => {
    const id = decodeURIComponent(hash.slice(1));
    if (id === '') return;
    return whenDrawn(
      () => {
        const found = document.getElementById(id);
        return found === null || loadingAbove(found) ? null : found;
      },
      (found) => found.scrollIntoView?.({ block: 'start' }),
    );
  }, [hash, key]);
}
