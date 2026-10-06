import { useRef, useState, type RefObject } from 'react';
import { isApiError } from './problem';

/** How a change went: its answer, or the refusal, or null when another was under way. */
type Outcome<T> = { ok: true; value: T } | { ok: false; error: unknown };

export type Change = {
  /** Which change is under way, such as `approve:20`, while one is. */
  pending: string | null;
  /** The last refusal, shown until the next change or until it is dismissed. */
  error: unknown;
  dismiss: () => void;
  /**
   * Make one change at a time, then read the page again, so a second click
   * while the page catches up never sends the same change twice. The focus
   * then moves to `focus`, since the button that was clicked has usually
   * gone. `own` is for a form that keeps the focus and says its own refusals.
   */
  run: <T>(
    key: string,
    change: () => Promise<T>,
    options?: { own?: boolean },
  ) => Promise<Outcome<T>>;
};

const NONE: ReadonlySet<string> = new Set();

/**
 * One busy flag and one refusal for a part of a page whose changes run
 * through more than one mutation, so that only one runs at a time.
 */
export function useChange({
  reread,
  rereadDone = true,
  behind = NONE,
  focus,
}: {
  /** The reads a change can move, read again before the change counts as done. */
  reread?: () => Promise<unknown>;
  /** False when each change writes its answer into the reads itself. */
  rereadDone?: boolean;
  /** Refusals that mean the page is behind, which read it again too. */
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
      outcome = { ok: true, value: await change() };
    } catch (refused) {
      outcome = { ok: false, error: refused };
    }
    if (!outcome.ok && options.own !== true) setError(outcome.error);
    const stale = outcome.ok
      ? rereadDone
      : isApiError(outcome.error) && behind.has(outcome.error.code);
    if (stale) await reread?.();
    running.current = false;
    setPending(null);
    if (outcome.ok && options.own !== true) focus?.current?.focus();
    return outcome;
  };

  return { pending, error, dismiss: () => setError(null), run };
}
