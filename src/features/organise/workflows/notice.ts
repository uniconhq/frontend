import { useEffect, useState } from 'react';
import type { Notice } from './ends';

/** How long a refused wire's message shows before it has faded away by itself. */
export const NOTICE_MS = 5_000;

/**
 * Why the last wire dropped was refused, said at the box of the port it was
 * dropped on (M53), for as long as nothing else happens: it goes on the next
 * thing done (a press anywhere, starting another wire among them, or Escape)
 * and by itself after `NOTICE_MS`, fading out as it ends. The reason is not
 * lost when it goes: while a wire is dragged, a port that would refuse it
 * says so on its mark and when hovered.
 */
export function useNotice(): {
  notice: Notice | null;
  show: (notice: Omit<Notice, 'count'>) => void;
  clear: () => void;
} {
  const [notice, setNotice] = useState<Notice | null>(null);
  const show = (next: Omit<Notice, 'count'>) =>
    setNotice((last) => ({ ...next, count: (last?.count ?? 0) + 1 }));
  useEffect(() => {
    if (notice === null) return;
    const clear = () => setNotice(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') clear();
    };
    const timer = window.setTimeout(clear, NOTICE_MS);
    // Capture, so a press that something else stops still counts.
    document.addEventListener('pointerdown', clear, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('pointerdown', clear, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [notice]);
  return { notice, show, clear: () => setNotice(null) };
}
