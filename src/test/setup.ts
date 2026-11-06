import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import { cleanup, configure } from '@testing-library/react';
import {
  platform as floatingPlatform,
  type Platform,
  type VirtualElement,
} from '@floating-ui/dom';
import { resetSessionExpiry } from '@/session/expired';
import { resetServerClock } from '@/lib/time';
import { leaveFor } from '@/lib/leave';
import { server } from './server';

// jsdom can't follow a full-page navigation; tests read this mock instead.
vi.mock('@/lib/leave', () => ({ leaveFor: vi.fn() }));

// The 1 s default fails under load; under the test timeout, a failed wait prints the page.
configure({ asyncUtilTimeout: 10_000 });

// CodeMirror needs layout jsdom lacks; `CodeEditor.test.tsx` tests the real one.
vi.mock('@/ui/CodeEditor', () => import('./code-editor'));

/**
 * Floating UI's style climb is most of a menu's cost in jsdom, and places come
 * out zero anyway. Patched in place, since Mantine loads it out of `vi.mock`'s reach.
 */
const boxOf = (element: Element | VirtualElement) => {
  const { x, y, width, height } = element.getBoundingClientRect();
  return { x, y, width, height };
};
Object.assign(floatingPlatform, {
  isRTL: () => false,
  getElementRects: ({ reference, floating }) => ({
    reference: boxOf(reference),
    floating: boxOf(floating),
  }),
  detectOverflow: () => Promise.resolve({ top: 0, right: 0, bottom: 0, left: 0 }),
} satisfies Partial<Platform>);

window.matchMedia = (query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
});

globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  server.resetHandlers();
  resetSessionExpiry();
  resetServerClock();
  vi.mocked(leaveFor).mockClear();
});

afterAll(() => {
  server.close();
});
