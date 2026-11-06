import { useEffect, useState } from 'react';
import type { Notice } from './ends';

export const NOTICE_MS = 5_000;

/** Said at the port's box (M53). While a wire is dragged, a refusing port still says so on its mark. */
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
