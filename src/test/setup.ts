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

/**
 * The app leaves for Forgejo with a full-page navigation, which jsdom cannot
 * follow; tests read where it went from this mock instead.
 */
vi.mock('@/lib/leave', () => ({ leaveFor: vi.fn() }));

/**
 * A `findBy*` or `waitFor` gives up after a second unless told otherwise,
 * which a page's first render on a busy machine can take by itself, so a
 * wait that would succeed failed under load. Ten seconds stays under the
 * test timeout (`vitest.config.ts`), so a wait that never succeeds still
 * prints the page rather than a bare timeout.
 */
configure({ asyncUtilTimeout: 10_000 });

/**
 * CodeMirror measures a layout jsdom does not have, so pages are tested with
 * a plain text field standing in for the code editor; `CodeEditor.test.tsx`
 * takes the stand-in away and tests the editor itself.
 */
vi.mock('@/ui/CodeEditor', () => import('./code-editor'));

/**
 * Mantine places its menus, popovers, comboboxes and tooltips with Floating
 * UI, which measures the page through `platform`: to find where a menu sits
 * and how far it may go before the page cuts it off, it reads the computed
 * style of every element up from the menu and from its button, which with the
 * app's stylesheets loaded is most of what opening a menu costs. jsdom lays
 * nothing out, so every element measured as an empty box at the corner and
 * every place worked out was zero, which no test could check. Here a menu and
 * its button are measured as jsdom draws them, without the climb, and nothing
 * overflows: the places come out zero as before, at once. Mantine still opens,
 * closes, focuses and chooses as it does on the page. Floating UI's own
 * `platform` is changed in place because Mantine loads it straight from Node,
 * where `vi.mock` does not reach. The build and the Playwright tests place
 * menus for real.
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
