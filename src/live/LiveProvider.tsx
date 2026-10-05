import { useEffect, useState, type ReactNode } from 'react';
import { useQueryClient, type Query } from '@tanstack/react-query';
import { useSession } from '@/session';
import { LiveContext } from './live-context';

const LIVE_PATH = '/api/v1/live';

/**
 * Which reads each kind of nudge makes stale, by the route the read was
 * made at: a grading moves a contestant's submissions and an organiser's
 * gradings, an announcement the announcement lists, and a clarification
 * the asker's questions and the organisers' inbox.
 */
const STALE: Record<string, (path: string) => boolean> = {
  grading: (path) => path.includes('/submissions') || path.endsWith('/gradings'),
  announcement: (path) => path.includes('/announcements'),
  clarification: (path) =>
    path.endsWith('/questions') || path.includes('/clarifications'),
};

function readAt(query: Query): string | null {
  const path = query.queryKey[1];
  return typeof path === 'string' ? path : null;
}

/**
 * One stream per signed-in session. A nudge names only the kind of thing that
 * changed and its id, never what changed, so each one refetches the reads
 * that show that kind and the routes check the caller as for any other
 * request. Only the reads a page is showing refetch; the rest are marked
 * stale for the next time they are shown. `resync`, after nudges may have
 * been missed, refetches everything. The browser reopens a dropped stream on
 * its own; while it is closed, `useLiveConnected` is false and pages poll.
 */
export function LiveProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  const client = useQueryClient();
  const [connected, setConnected] = useState(false);
  const signedIn = session.status === 'signed-in';

  useEffect(() => {
    if (!signedIn || typeof EventSource === 'undefined') return undefined;
    const source = new EventSource(LIVE_PATH);
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    for (const [kind, stale] of Object.entries(STALE)) {
      source.addEventListener(kind, () => {
        void client.invalidateQueries({
          predicate: (query) => {
            const path = readAt(query);
            return path !== null && stale(path);
          },
        });
      });
    }
    source.addEventListener('resync', () => void client.invalidateQueries());
    return () => {
      source.close();
      setConnected(false);
    };
  }, [signedIn, client]);

  return <LiveContext value={signedIn && connected}>{children}</LiveContext>;
}
