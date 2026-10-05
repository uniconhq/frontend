import { act, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveProvider } from './LiveProvider';
import { useLiveConnected, useLiveRefused } from './live-context';

vi.mock('@/session', () => ({ useSession: () => ({ status: 'signed-in' }) }));

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

  addEventListener() {}

  close() {
    this.readyState = FakeSource.CLOSED;
  }
}

function Probe() {
  const live = useLiveConnected();
  const refused = useLiveRefused();
  return <p>{live ? 'open' : refused ? 'refused' : 'down'}</p>;
}

function renderProvider() {
  render(
    <QueryClientProvider client={new QueryClient()}>
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
});
