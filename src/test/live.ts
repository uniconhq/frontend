import { act } from '@testing-library/react';
import { vi } from 'vitest';

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

export function fakeLiveStream() {
  vi.stubGlobal('EventSource', FakeSource);
}

export function realLiveStream() {
  vi.unstubAllGlobals();
  FakeSource.last = null;
  setVisibility('visible');
}

export function openStream() {
  act(() => FakeSource.last?.onopen?.());
}

export function nudge(kind: string) {
  act(() => FakeSource.last?.listeners.get(kind)?.());
}

/** Hiding the tab closes the stream; showing it opens a new one, which re-reads. */
export function comeBackToTab() {
  act(() => setVisibility('hidden'));
  act(() => setVisibility('visible'));
  act(() => FakeSource.last?.onopen?.());
}
