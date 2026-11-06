import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient, type Query, type QueryClient } from '@tanstack/react-query';
import { useSession, useSessionExpired } from '@/session';
import { isEdited } from './edited';
import { LiveContext, type LiveState } from './live-context';

const LIVE_PATH = '/api/v1/live';
const SESSION_PATH = '/api/v1/me';
const GATHER_MS = 300;
const LEADERBOARD_READ = /\/leaderboards(?:\/\{leaderboard\})?$/;
const REOPEN_MS = [5_000, 10_000, 20_000, 40_000, 60_000];

/** The reads each kind of nudge makes stale, by route. */
const STALE: Record<string, (path: string) => boolean> = {
  grading: (path) =>
    (path.includes('/submissions') && !path.endsWith('/files')) ||
    path.endsWith('/gradings') ||
    path.endsWith('/gradings/queue') ||
    path.endsWith('/gradings/regrades') ||
    path.endsWith('/home') ||
    LEADERBOARD_READ.test(path),
  announcement: (path) => path.includes('/announcements'),
  clarification: (path) =>
    path.endsWith('/questions') || path.includes('/clarifications'),
  // The task read carries the publication and its checks.
  checks: (path) => /\/tasks\/\{task\}$/.test(path) || path.endsWith('/publications'),
  // A release or take-back changes what a submission shows with no grading.
  results: (path) =>
    (path.includes('/submissions') && !path.endsWith('/files')) ||
    path.endsWith('/home') ||
    LEADERBOARD_READ.test(path),
};

function readAt(query: Query): string | null {
  const path = query.queryKey[1];
  return typeof path === 'string' ? path : null;
}

function useVisible(): boolean {
  const [visible, setVisible] = useState(() => document.visibilityState !== 'hidden');
  useEffect(() => {
    const changed = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', changed);
    return () => document.removeEventListener('visibilitychange', changed);
  }, []);
  return visible;
}

function refetchAll(client: QueryClient) {
  void client.invalidateQueries(
    { predicate: (query) => !isEdited(query) },
    { cancelRefetch: false },
  );
}

/**
 * Open only while the tab is in front: browsers allow few connections per host.
 * A reopen or `resync` refetches all but `EDITED` reads, as nudges may be missed.
 * A refused stream is reopened after a growing wait, and the session re-read.
 */
export function LiveProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  const client = useQueryClient();
  const visible = useVisible();
  const [state, setState] = useState<LiveState>('down');
  const everOpened = useRef(false);
  // An ended session still reads as signed in under the modal.
  const ended = useSessionExpired();
  const signedIn = session.status === 'signed-in' && !ended;

  useEffect(() => {
    if (!signedIn || !visible || typeof EventSource === 'undefined') return undefined;
    let source: EventSource | null = null;
    let reopen: ReturnType<typeof setTimeout> | undefined;
    let gather: ReturnType<typeof setTimeout> | undefined;
    let refused = 0;
    const pending = new Set<string>();

    const flush = () => {
      gather = undefined;
      const kinds = [...pending];
      pending.clear();
      void client.invalidateQueries(
        {
          predicate: (query) => {
            const path = readAt(query);
            return path !== null && kinds.some((kind) => STALE[kind]?.(path));
          },
        },
        { cancelRefetch: false },
      );
    };

    const open = () => {
      const next = new EventSource(LIVE_PATH);
      source = next;
      next.onopen = () => {
        refused = 0;
        setState('open');
        if (everOpened.current) refetchAll(client);
        everOpened.current = true;
      };
      next.onerror = () => {
        if (next.readyState !== EventSource.CLOSED) {
          setState('down');
          return;
        }
        setState('refused');
        void client.invalidateQueries({
          predicate: (query) => readAt(query) === SESSION_PATH,
        });
        const wait = REOPEN_MS[Math.min(refused, REOPEN_MS.length - 1)];
        refused += 1;
        reopen = setTimeout(open, wait);
      };
      for (const kind of Object.keys(STALE)) {
        next.addEventListener(kind, () => {
          pending.add(kind);
          gather ??= setTimeout(flush, GATHER_MS);
        });
      }
      next.addEventListener('resync', () => refetchAll(client));
    };

    open();
    return () => {
      clearTimeout(reopen);
      clearTimeout(gather);
      source?.close();
      setState('down');
    };
  }, [signedIn, visible, client]);

  return <LiveContext value={signedIn ? state : 'down'}>{children}</LiveContext>;
}
