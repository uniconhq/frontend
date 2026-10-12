import { expect, test, type Page } from '@playwright/test';

/**
 * Smoke tests against the dev server with the API stubbed, so they need no
 * backend: the bundle boots, the shell renders, the router handles an address
 * it does not know, and a guarded page sends a signed-out visitor to login.
 */
async function stubApi(page: Page, options: { signedIn?: boolean } = {}) {
  await page.route('**/api/v1/time', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ now: '2026-09-12T10:00:00Z' }),
    }),
  );
  await page.route('**/api/v1/auth/register-url', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ url: null }),
    }),
  );
  await page.route('**/api/v1/auth/forge-url', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ url: 'http://forge.localhost:8080' }),
    }),
  );
  await page.route('**/api/v1/me', (route) =>
    options.signedIn === true
      ? route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            user: {
              id: 7,
              username: 'kenny',
              name: 'Kenny Lewi',
              avatar_url: null,
              email: 'kenny@example.org',
            },
            roles: [],
            degraded: false,
          }),
        })
      : route.fulfill({
          status: 401,
          contentType: 'application/problem+json',
          body: JSON.stringify({
            type: 'about:blank',
            title: 'Not signed in',
            status: 401,
            detail: 'No session',
            code: 'unauthenticated',
          }),
        }),
  );
}

test('the shell and the landing page render', async ({ page }) => {
  await stubApi(page);
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Unicon', level: 1 })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Sections' })).toContainText(
    'Browse contests',
  );
  await expect(page.getByText(/Deadlines and countdowns follow Unicon/)).toBeVisible();
});

test('an unknown address renders the 404 inside the shell', async ({ page }) => {
  await stubApi(page);
  await page.goto('/no-such-page');

  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Sections' })).toBeVisible();
});

test('the login page offers one button out of the app', async ({ page }) => {
  await stubApi(page);
  await page.goto('/login');

  const button = page.getByRole('link', { name: 'Sign in with Forgejo' });
  await expect(button).toBeVisible();
  await expect(button).toHaveAttribute('href', '/api/v1/auth/login?next=%2F');
});

test('a guarded page sends a signed-out visitor to login, remembering it', async ({
  page,
}) => {
  await stubApi(page);
  await page.goto('/account');

  await expect(page).toHaveURL(/\/login\?next=%2Faccount$/);
  await expect(
    page.getByRole('link', { name: 'Sign in with Forgejo' }),
  ).toHaveAttribute('href', '/api/v1/auth/login?next=%2Faccount');
});

test('a list card is as tall as its rows, fades while more are below, and lets the page scroll', async ({
  page,
}) => {
  // A window short enough that the page scrolls past the two cards.
  await page.setViewportSize({ width: 1280, height: 420 });
  await stubApi(page, { signedIn: true });
  await page.route('**/api/v1/workflows', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        Array.from({ length: 12 }, (_, at) => ({
          owner: 'kenny',
          name: `flow-${String(at + 1)}`,
          versions: ['v1'],
          editable: true,
          visibility: 'private',
        })),
      ),
    }),
  );
  await page.goto('/workflows');

  const long = page.getByRole('region', { name: 'Workflows you can change' });
  const empty = page.getByRole('region', { name: 'Workflows you can use' });
  await expect(long.getByRole('listitem')).toHaveCount(12);
  await expect(empty).toContainText('Nobody has shared a workflow with you');
  const rows = long
    .getByRole('list', { name: 'Workflows you can change' })
    .locator('..');
  // The box the rows scroll in, as the browser runs it, since these tests are
  // typed without the DOM's types.
  const box = `document.querySelector('ul[aria-label="Workflows you can change"]').parentElement`;
  const inBox = <T>(script: string) =>
    page.evaluate<T>(`(() => { const box = ${box}; return ${script}; })()`);

  // Twelve rows show about six and scroll inside; none leave no tall blank box.
  const sizes = await inBox<{ height: number; content: number; overscroll: string }>(
    '({ height: box.clientHeight, content: box.scrollHeight, overscroll: getComputedStyle(box).overscrollBehaviorY })',
  );
  expect(sizes.height).toBeGreaterThan(280);
  expect(sizes.height).toBeLessThanOrEqual(340);
  expect(sizes.content).toBeGreaterThan(sizes.height);
  expect(sizes.overscroll).toBe('auto');
  const emptyBox = await empty.boundingBox();
  expect(emptyBox?.height ?? 0).toBeLessThan(120);

  // The bottom edge fades while more rows are below, and not at the end.
  const mask = () => inBox<string>('getComputedStyle(box).maskImage');
  expect(await mask()).not.toBe('none');
  await inBox('box.scrollTop = box.scrollHeight');
  await expect.poll(mask).toBe('none');
  await inBox('box.scrollTop = 0');
  await expect.poll(mask).not.toBe('none');

  // Over a list with nothing to scroll, and over one at its top when the
  // wheel goes up, the page scrolls.
  const scrolled = () => page.evaluate<number>('window.scrollY');
  const toBottom = () =>
    page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
  await toBottom();
  const bottom = await scrolled();
  expect(bottom).toBeGreaterThan(0);
  await empty.hover();
  await page.mouse.wheel(0, -60);
  await expect.poll(scrolled).toBeLessThan(bottom);

  await toBottom();
  await rows.hover();
  await page.mouse.wheel(0, -60);
  await expect.poll(scrolled).toBeLessThan(bottom);
  expect(await inBox<number>('box.scrollTop')).toBe(0);
});

test('a signed-in person sees their account page', async ({ page }) => {
  await stubApi(page, { signedIn: true });
  await page.route('**/api/v1/me/sessions', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: '0f3a9c2e-6b1d-4e7f-8a9b-0c1d2e3f4a5b',
          created_at: '2026-09-12T08:00:00Z',
          last_seen_at: '2026-09-12T09:30:00Z',
          user_agent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/153.0',
          current: true,
        },
      ]),
    }),
  );
  await page.goto('/account');

  await expect(page.getByRole('heading', { name: 'Account', level: 1 })).toBeVisible();
  await expect(page.getByText('This device')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Account menu' })).toContainText(
    'kenny',
  );
});
