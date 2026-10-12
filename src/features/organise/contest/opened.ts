import { useEffect } from 'react';
import { useSearchParams } from 'react-router';
import type { ProblemPlace } from '../DefinitionErrors';
import { whenDrawn } from '@/ui/anchor';
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
 * a way), focused and scrolled to once the page's form is there, however
 * long its cards take to load: a box marked `data-field`, inside the one
 * marked `data-item` when there is an item, and the first thing in it that
 * takes the focus (a radio group's chosen one), any closed part around it
 * opened. `byItem: false` is for a form that holds the one item alone, such
 * as a task's timeline.
 */
export function useOpenedField(ready: boolean, { byItem = true } = {}) {
  const [search] = useSearchParams();
  const field = search.get(FIELD_PARAM);
  const item = search.get(ITEM_PARAM);
  useEffect(() => {
    if (!ready || field === null) return;
    let again = 0;
    const stop = whenDrawn(
      () => {
        const scope =
          item === null || !byItem
            ? document
            : document.querySelector(`[data-item="${CSS.escape(item)}"]`);
        return scope?.querySelector(`[data-field="${CSS.escape(field)}"]`) ?? null;
      },
      (box) => {
        for (let part = box.closest('details'); part !== null;) {
          part.open = true;
          part = part.parentElement?.closest('details') ?? null;
        }
        const target = (
          box.matches('input, select, textarea, button')
            ? box
            : (box.querySelector('input[type="radio"]:checked:not([disabled])') ??
              // A field before a button, so the ⓘ beside a label never takes it.
              box.querySelector('input:not([disabled]), select, textarea') ??
              box.querySelector('button'))
        ) as HTMLElement | null;
        target?.focus();
        box.scrollIntoView?.({ block: 'center' });
        // A dialog takes the focus to its own first field as it opens; take it
        // back once it has.
        again = window.setTimeout(() => {
          if (document.activeElement !== target) target?.focus();
        }, 150);
      },
    );
    return () => {
      stop();
      window.clearTimeout(again);
    };
  }, [ready, field, item, byItem]);
  return { field, item: item === null ? null : Number(item) };
}
