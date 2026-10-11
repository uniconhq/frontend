import { useEffect } from 'react';
import { useSearchParams } from 'react-router';
import type { ProblemPlace } from '../DefinitionErrors';
import { contestPlace, FIELD_PARAM, ITEM_PARAM, placeHref } from './places';

/** Where each problem a refused save of the contest's settings lists is fixed. */
export function contestPlaceOf(org: string, contest: string) {
  return (path: string): ProblemPlace => {
    const place = contestPlace(path);
    return { label: place.label, to: placeHref(org, contest, place) };
  };
}

/**
 * The field a link opened (`?field=`, and `?item=` for a task, a board or
 * a way), focused and scrolled to once the page's form is there: a box
 * marked `data-field`, inside the one marked `data-item` when there is an
 * item, and the first thing in it that takes the focus. `byItem: false` is
 * for a form that holds the one item alone, such as a task's timeline.
 */
export function useOpenedField(ready: boolean, { byItem = true } = {}) {
  const [search] = useSearchParams();
  const field = search.get(FIELD_PARAM);
  const item = search.get(ITEM_PARAM);
  useEffect(() => {
    if (!ready || field === null) return;
    const scope =
      item === null || !byItem
        ? document
        : document.querySelector(`[data-item="${item}"]`);
    const box = scope?.querySelector(`[data-field="${field}"]`);
    if (box === null || box === undefined) return;
    const target = (
      box.matches('input, select, textarea, button')
        ? box
        : box.querySelector('input:not([disabled]), select, textarea, button')
    ) as HTMLElement | null;
    target?.focus();
    box.scrollIntoView?.({ block: 'center' });
    // A dialog takes the focus to its own first field as it opens; take it
    // back once it has.
    const again = window.setTimeout(() => {
      if (document.activeElement !== target) target?.focus();
    }, 150);
    return () => window.clearTimeout(again);
  }, [ready, field, item, byItem]);
  return { field, item: item === null ? null : Number(item) };
}
