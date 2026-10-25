import { act } from '@testing-library/react';
import { vi } from 'vitest';

/**
 * The browser's EventSource as the live stream's tests drive it: each one
 * made is the last, opened and nudged by hand.
 */
class FakeSource {
  static readonly CONNECTING = 0;
  static readonly CLOSED = 2;
  static last: FakeSource | null = null;
  readyState = FakeSource.CONNECTING;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readonly listeners = new Map<string, () => void>();

  constructor() {
    FakeSource.last = this;
  }

  addEventListener(kind: string, listener: () => void) {
    this.listeners.set(kind, listener);
  }

  close() {
    this.readyState = FakeSource.CLOSED;
  }
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', {
    value: state,
    configurable: true,
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

/** Put the fake stream in the browser's place, for one test file's tests. */
export function fakeLiveStream() {
  vi.stubGlobal('EventSource', FakeSource);
}

/** Take the fake stream away again, the tab in front. */
export function realLiveStream() {
  vi.unstubAllGlobals();
  FakeSource.last = null;
  setVisibility('visible');
}

/** The stream opening for the first time, as a page loads. */
export function openStream() {
  act(() => FakeSource.last?.onopen?.());
}

/** One nudge, as the stream sends it. The page gathers it before it reads again. */
export function nudge(kind: string) {
  act(() => FakeSource.last?.listeners.get(kind)?.());
}

/**
 * Switching to another window and back: the tab hidden closes the stream,
 * and the tab in front again opens a new one, which re-reads what may have
 * been missed meanwhile.
 */
export function comeBackToTab() {
  act(() => setVisibility('hidden'));
  act(() => setVisibility('visible'));
  act(() => FakeSource.last?.onopen?.());
}
