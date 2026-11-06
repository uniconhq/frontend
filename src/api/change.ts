import { useRef, useState, type RefObject } from 'react';
import { isApiError } from './problem';

/** `error` is null when another change was already under way. */
type Outcome<T> = { ok: true; value: T } | { ok: false; error: unknown };

export type Change = {
  /** Such as `approve:20`. */
  pending: string | null;
  error: unknown;
  dismiss: () => void;
  /**
   * One at a time, so a second click never sends twice. Focus moves to `focus`,
   * as the button has usually gone; with `own` the form keeps focus and error.
   */
  run: <T>(
    key: string,
    change: () => Promise<T>,
    options?: { own?: boolean },
  ) => Promise<Outcome<T>>;
};

const NONE: ReadonlySet<string> = new Set();

export function useChange({
  reread,
  rereadDone = true,
  behind = NONE,
  focus,
}: {
  reread?: () => Promise<unknown>;
  /** False when each change writes its answer into the reads itself. */
  rereadDone?: boolean;
  /** Refusal codes that mean the page is behind, so it re-reads. */
  behind?: ReadonlySet<string>;
  focus?: RefObject<HTMLElement | null>;
} = {}): Change {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const running = useRef(false);

  const run = async <T>(
    key: string,
    change: () => Promise<T>,
    options: { own?: boolean } = {},
  ): Promise<Outcome<T>> => {
    if (running.current) return { ok: false, error: null };
    running.current = true;
    setPending(key);
    setError(null);
    let outcome: Outcome<T>;
    try {
      try {
        outcome = { ok: true, value: await change() };
      } catch (refused) {
        outcome = { ok: false, error: refused };
      }
      if (!outcome.ok && options.own !== true) setError(outcome.error);
      const stale = outcome.ok
        ? rereadDone
        : isApiError(outcome.error) && behind.has(outcome.error.code);
      if (stale) await reread?.();
    } finally {
      // A read that throws must not leave the part of the page busy for good.
      running.current = false;
      setPending(null);
    }
    if (outcome.ok && options.own !== true) focus?.current?.focus();
    return outcome;
  };

  return { pending, error, dismiss: () => setError(null), run };
}
