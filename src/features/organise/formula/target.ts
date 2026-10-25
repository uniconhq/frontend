import { useRef, useState } from 'react';

/** What a tile or a suggestion puts in the line, and where the cursor lands in it. */
export type Insert = { text: string; caret?: number };

/** Puts a piece in a line at its cursor. */
export type Inserter = (piece: Insert) => void;

/**
 * The line the tiles put pieces in: the last one that had the cursor. One
 * value can have a line in more than one place, so `place` says which.
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
