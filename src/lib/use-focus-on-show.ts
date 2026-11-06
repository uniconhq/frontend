import { useEffect, useRef } from 'react';

/** A ref whose element takes the focus as it first appears. */
export function useFocusOnShow<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return ref;
}
