import { useRef, useState } from 'react';

/** `caret` is where the cursor lands in `text`. */
export type Insert = { text: string; caret?: number };

export type Inserter = (piece: Insert) => void;

/**
 * Tiles insert into the line focused last. One value can have a line in more
 * than one place, so `place` says which.
 */
export function useFormulaTarget() {
  const insert = useRef<Inserter | null>(null);
  const [target, setTarget] = useState<{ name: string; place: string } | null>(null);
  return {
    target: target?.name ?? null,
    place: target?.place ?? null,
    focus: (name: string, inserter: Inserter, place: string = name) => {
      insert.current = inserter;
      setTarget({ name, place });
    },
    insert: (piece: Insert) => insert.current?.(piece),
  };
}
