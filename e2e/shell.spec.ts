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
    'Discover',
  );
  await expect(page.getByText('server time')).toBeVisible();
});

test('an unknown address renders the 404 inside the shell', async ({ page }) => {
  await stubApi(page);
  await page.goto('/no-such-page');

  await expect(page.getByRole('heading', { name: '404' })).toBeVisible();
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
