import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient, type Query, type QueryClient } from '@tanstack/react-query';
import { useSession, useSessionExpired } from '@/session';
import { isEdited } from './edited';
import { LiveContext, type LiveState } from './live-context';

const LIVE_PATH = '/api/v1/live';
const SESSION_PATH = '/api/v1/me';
/** How long nudges are gathered before the reads they name refetch. */
const GATHER_MS = 300;
/** How long after a stream is refused it is opened again, doubling to the last. */
const REOPEN_MS = [5_000, 10_000, 20_000, 40_000, 60_000];

/**
 * Which reads each kind of nudge makes stale, by the route the read was
 * made at: a grading moves a contestant's submissions, an organiser's
 * gradings, a contest's queue, the contest home and the leaderboards, whose
 * rows it moves, and the summaries of regrades under way, but not a
 * submission's files, which a grading never changes; an announcement the
 * announcement lists; and a
 * clarification the asker's questions and the organisers' inbox; a save's
 * checks the task and its publications; a release or a take-back the
 * submissions and the leaderboards, whose shown values change with no
 * grading moving.
 */
const STALE: Record<string, (path: string) => boolean> = {
  grading: (path) =>
    (path.includes('/submissions') && !path.endsWith('/files')) ||
    path.endsWith('/gradings') ||
    path.endsWith('/gradings/queue') ||
    path.endsWith('/gradings/regrades') ||
    path.endsWith('/home') ||
    path.endsWith('/leaderboards'),
  announcement: (path) => path.includes('/announcements'),
  clarification: (path) =>
    path.endsWith('/questions') || path.includes('/clarifications'),
  // A save's checks ended. The id on the event is the publication; the page
  // reads the task again, which carries the publication and its checks.
  checks: (path) => /\/tasks\/\{task\}$/.test(path) || path.endsWith('/publications'),
  // A release or a take-back. What a submission shows changes with no
  // grading moving, so the open result is read again.
  results: (path) =>
    (path.includes('/submissions') && !path.endsWith('/files')) ||
    path.endsWith('/home') ||
    path.endsWith('/leaderboards'),
};

function readAt(query: Query): string | null {
  const path = query.queryKey[1];
  return typeof path === 'string' ? path : null;
}

/** Whether the tab is in front, kept up to date. */
function useVisible(): boolean {
  const [visible, setVisible] = useState(() => document.visibilityState !== 'hidden');
  useEffect(() => {
    const changed = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', changed);
    return () => document.removeEventListener('visibilitychange', changed);
  }, []);
  return visible;
}

/** Every read, but those a form or an editor is editing from (`EDITED`). */
function refetchAll(client: QueryClient) {
  void client.invalidateQueries(
    { predicate: (query) => !isEdited(query) },
    { cancelRefetch: false },
  );
}

/**
 * One stream per signed-in tab, open while the tab is in front: a browser
 * holds few connections to one host at a time, and a stream in every
 * background tab would use them up. A nudge names only the kind of thing
 * that changed and its id, never what changed, so the nudges of a moment are
 * gathered and each kind refetches the reads that show it, never cutting
 * short a refetch already under way; the routes check the caller as for any
 * other request. Only the reads a page is showing refetch; the rest are
 * marked stale for the next time they are shown.
 *
 * Every opening after the tab's first, a tab brought back to the front
 * included, and `resync` refetch everything, since nudges may have been
 * missed meanwhile, except the reads a form or an editor is editing from
 * (`EDITED`), whose changes are met at their save. The browser reopens a
 * stream that dropped on its own; one that was refused, a deploy's moment of
 * errors or a session that ended, it gives up on, so it is opened again
 * after a wait that grows, and the session is read again so a signed-out
 * tab stops: once a read finds it ended, no stream is opened again. While no
 * stream is open, `useLiveConnected` is false and pages poll, and while one
 * waits after a refusal `useLiveRefused` is true and they poll less often.
 */
export function LiveProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  const client = useQueryClient();
  const visible = useVisible();
  const [state, setState] = useState<LiveState>('down');
  const everOpened = useRef(false);
  // A session that ended while the page was open still reads as signed in,
  // the page kept under the modal that says so; it opens no stream.
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
