import { act, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  armSessionExpiry,
  reportUnauthenticated,
  resetSessionExpiry,
} from '@/session/expired';
import { EDITED } from './edited';
import { LiveProvider } from './LiveProvider';
import { useLiveConnected, useLiveRefused } from './live-context';

vi.mock('@/session', async () => ({
  useSession: () => ({ status: 'signed-in' }),
  useSessionExpired: (await import('@/session/expired')).useSessionExpired,
}));

class FakeSource {
  static readonly CONNECTING = 0;
  static readonly CLOSED = 2;
  static last: FakeSource | null = null;
  readyState = FakeSource.CONNECTING;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor() {
    FakeSource.last = this;
  }

  readonly listeners = new Map<string, () => void>();

  addEventListener(kind: string, listener: () => void) {
    this.listeners.set(kind, listener);
  }

  close() {
    this.readyState = FakeSource.CLOSED;
  }
}

function Probe() {
  const live = useLiveConnected();
  const refused = useLiveRefused();
  return <p>{live ? 'open' : refused ? 'refused' : 'down'}</p>;
}

function renderProvider(client = new QueryClient()) {
  render(
    <QueryClientProvider client={client}>
      <LiveProvider>
        <Probe />
      </LiveProvider>
    </QueryClientProvider>,
  );
}

describe('where the live stream stands', () => {
  beforeEach(() => {
    vi.stubGlobal('EventSource', FakeSource);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    FakeSource.last = null;
  });

  it('is down until the stream opens, and open once it has', () => {
    renderProvider();
    expect(screen.getByText('down')).toBeVisible();

    act(() => FakeSource.last?.onopen?.());

    expect(screen.getByText('open')).toBeVisible();
  });

  it('is down while the browser opens a dropped stream again', () => {
    renderProvider();
    act(() => FakeSource.last?.onopen?.());

    act(() => FakeSource.last?.onerror?.());

    expect(screen.getByText('down')).toBeVisible();
  });

  it('is refused when the browser opens a dropped stream again and is turned away', () => {
    renderProvider();
    const source = FakeSource.last;
    act(() => source?.onopen?.());
    act(() => source?.onerror?.());
    expect(screen.getByText('down')).toBeVisible();

    act(() => {
      if (source) source.readyState = FakeSource.CLOSED;
      source?.onerror?.();
    });

    expect(screen.getByText('refused')).toBeVisible();
  });

  it('is down again once a refused tab is hidden', () => {
    renderProvider();
    const source = FakeSource.last;
    act(() => {
      if (source) source.readyState = FakeSource.CLOSED;
      source?.onerror?.();
    });
    expect(screen.getByText('refused')).toBeVisible();

    act(() => {
      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(screen.getByText('down')).toBeVisible();
    act(() => {
      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });
  });

  it('closes the stream and opens none again once the session has ended', () => {
    vi.useFakeTimers();
    try {
      armSessionExpiry(true);
      renderProvider();
      const first = FakeSource.last;
      act(() => {
        if (first) first.readyState = FakeSource.CLOSED;
        first?.onerror?.();
      });
      expect(screen.getByText('refused')).toBeVisible();

      act(() => reportUnauthenticated());
      act(() => {
        vi.advanceTimersByTime(120_000);
      });

      expect(FakeSource.last).toBe(first);
      expect(screen.getByText('down')).toBeVisible();
    } finally {
      vi.useRealTimers();
      resetSessionExpiry();
    }
  });

  it('is refused once the stream is turned away, until one opens again', () => {
    vi.useFakeTimers();
    try {
      renderProvider();
      const first = FakeSource.last;
      act(() => {
        if (first) first.readyState = FakeSource.CLOSED;
        first?.onerror?.();
      });

      expect(screen.getByText('refused')).toBeVisible();
      act(() => {
        vi.advanceTimersByTime(5_000);
      });
      expect(FakeSource.last).not.toBe(first);
      expect(screen.getByText('refused')).toBeVisible();
      act(() => FakeSource.last?.onopen?.());
      expect(screen.getByText('open')).toBeVisible();
    } finally {
      vi.useRealTimers();
    }
  });

  it('marks stale, after a moment, the reads each kind of nudge names, and every read on resync', () => {
    vi.useFakeTimers();
    try {
      const client = new QueryClient();
      // Every read a nudge could reach, as the client names it: the route's
      // own template from openapi.json.
      const org = '/api/v1/orgs/{org}';
      const contest = `${org}/contests/{contest}`;
      const task = `${contest}/tasks/{task}`;
      const graded = [
        `${task}/submissions`,
        `${task}/submissions/{number}`,
        `${task}/organise/submissions/{number}`,
        `${task}/gradings`,
        `${contest}/gradings`,
        `${contest}/gradings/queue`,
        `${contest}/gradings/regrades`,
        `${contest}/home`,
      ];
      const announced = [
        `${contest}/announcements`,
        `${contest}/home/announcements`,
        `${task}/announcements`,
        `${task}/page/announcements`,
      ];
      const asked = [
        `${contest}/questions`,
        `${contest}/clarifications`,
        `${org}/clarifications`,
      ];
      const checked = [`${task}`, `${task}/publications`];
      const untouched = [
        `${task}/submissions/{number}/files`,
        `${task}/gradings/{grading}/log`,
        `${task}/page`,
        '/api/v1/me',
      ];
      const reads = [...graded, ...announced, ...asked, ...checked, ...untouched];
      for (const path of reads) client.setQueryData(['get', path], {});
      const stale = () =>
        reads.filter((path) => client.getQueryState(['get', path])?.isInvalidated);
      renderProvider(client);
      const source = FakeSource.last;
      act(() => source?.onopen?.());

      act(() => source?.listeners.get('grading')?.());
      expect(stale()).toEqual([]);
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(stale()).toEqual(graded);

      act(() => {
        source?.listeners.get('announcement')?.();
        vi.advanceTimersByTime(300);
      });
      expect(stale()).toEqual([...graded, ...announced]);

      act(() => {
        source?.listeners.get('clarification')?.();
        vi.advanceTimersByTime(300);
      });
      expect(stale()).toEqual([...graded, ...announced, ...asked]);

      act(() => {
        source?.listeners.get('checks')?.();
        vi.advanceTimersByTime(300);
      });
      expect(stale()).toEqual([...graded, ...announced, ...asked, ...checked]);

      act(() => source?.listeners.get('resync')?.());
      expect(stale()).toEqual(reads);
    } finally {
      vi.useRealTimers();
    }
  });

  it('marks stale, on any nudge, none of the reads a form or an editor edits from', () => {
    vi.useFakeTimers();
    try {
      const client = new QueryClient();
      const contest = '/api/v1/orgs/{org}/contests/{contest}';
      const task = `${contest}/tasks/{task}`;
      // Every read marked EDITED, under the keys the forms and the task's
      // build cards give them.
      const edited = [
        ['get', `${contest}/files/{path}`, 'own'],
        ['get', `${task}/files/{path}`, 'own'],
        ['get', `${task}/files/{path}`, 'editor'],
        ['get', `${task}/workflow-form`, 'build'],
        ['get', `${task}/tree`, 'build'],
      ];
      for (const key of edited) {
        client.getQueryCache().build(client, { queryKey: key, meta: EDITED });
        client.setQueryData(key, {});
      }
      renderProvider(client);
      const source = FakeSource.last;
      act(() => source?.onopen?.());

      act(() => {
        for (const kind of ['grading', 'announcement', 'clarification', 'checks']) {
          source?.listeners.get(kind)?.();
        }
        vi.advanceTimersByTime(300);
      });

      expect(edited.filter((key) => client.getQueryState(key)?.isInvalidated)).toEqual(
        [],
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('passes over, on resync and when it opens again, the reads a form or an editor edits from', () => {
    const client = new QueryClient();
    const edited = ['get', '/api/v1/orgs/{org}/contests/{contest}/files/{path}', 'own'];
    const shown = ['get', '/api/v1/orgs/{org}/contests/{contest}/home'];
    client.getQueryCache().build(client, { queryKey: edited, meta: EDITED });
    client.setQueryData(edited, {});
    client.setQueryData(shown, {});
    const invalidated = (key: unknown[]) =>
      client.getQueryState(key)?.isInvalidated ?? false;
    renderProvider(client);
    const first = FakeSource.last;
    act(() => first?.onopen?.());

    act(() => first?.listeners.get('resync')?.());
    expect(invalidated(shown)).toBe(true);
    expect(invalidated(edited)).toBe(false);

    vi.useFakeTimers();
    try {
      client.setQueryData(shown, {});
      act(() => {
        if (first) first.readyState = FakeSource.CLOSED;
        first?.onerror?.();
        vi.advanceTimersByTime(5_000);
      });
      act(() => FakeSource.last?.onopen?.());
      expect(invalidated(shown)).toBe(true);
      expect(invalidated(edited)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
