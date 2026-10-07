import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { resetSessionExpiry } from '@/session/expired';
import { resetServerClock } from '@/lib/time';
import { leaveFor } from '@/lib/leave';
import { server } from './server';

/**
 * The app leaves for Forgejo with a full-page navigation, which jsdom cannot
 * follow; tests read where it went from this mock instead.
 */
vi.mock('@/lib/leave', () => ({ leaveFor: vi.fn() }));

/**
 * CodeMirror measures a layout jsdom does not have, so pages are tested with
 * a plain text field standing in for the code editor; `CodeEditor.test.tsx`
 * takes the stand-in away and tests the editor itself.
 */
vi.mock('@/ui/CodeEditor', () => import('./code-editor'));

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
  server.resetHandlers();
  resetSessionExpiry();
  resetServerClock();
  vi.mocked(leaveFor).mockClear();
});

afterAll(() => {
  server.close();
});
