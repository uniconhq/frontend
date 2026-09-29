import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * The organiser path against the dev server with the API stubbed, so it needs
 * no backend: make an org and watch it provisioned, walk down to a task, open
 * a file and save it, and see the publication number the save answers with,
 * with the focus on that answer.
 * The stub keeps just enough state for each answer to follow from the last.
 */
async function stubOrganiserApi(page: Page) {
  const state = { orgReady: false, polls: 0, published: 1, saved: null as unknown };

  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });

  const record = (status: string, lastStep: string | null) => ({
    kind: 'org',
    target: 'acme',
    status,
    steps: [
      'account_row',
      'org',
      'roles',
      'labels',
      'event_push',
      'first_admin',
      'service_account',
      'service_token',
      'ci_user',
      'ci_login',
    ],
    last_step: lastStep,
    failed_step: null,
    error: null,
    retry_at: null,
    attempts: status === 'pending' ? 0 : 1,
    ready_at: status === 'ready' ? '2026-09-29T10:00:05Z' : null,
  });

  await page.route('**/api/v1/time', (route) =>
    json(route, { now: '2026-09-29T10:00:00Z' }),
  );
  await page.route('**/api/v1/me', (route) =>
    json(route, {
      user_id: 7,
      username: 'kenny',
      name: 'Kenny Lewi',
      avatar_url: null,
      email: 'kenny@example.org',
      roles: state.orgReady
        ? [
            {
              scope: { kind: 'org', org: 'acme', contest: null, task: null },
              role: 'admin',
            },
          ]
        : [],
      degraded: false,
    }),
  );

  await page.route(/\/api\/v1\/orgs/, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const task = '/api/v1/orgs/acme/contests/spring/tasks/sum';

    if (request.method() === 'POST' && path === '/api/v1/orgs') {
      return json(route, record('pending', null), 202);
    }
    if (path === '/api/v1/orgs/acme/provisioning') {
      state.polls += 1;
      if (state.polls < 2) return json(route, record('running', 'labels'));
      state.orgReady = true;
      return json(route, record('ready', 'ci_login'));
    }
    if (path === '/api/v1/orgs/acme/contests') return json(route, [{ name: 'spring' }]);
    if (path === '/api/v1/orgs/acme/contests/spring/tasks') {
      return json(route, [{ name: 'sum' }]);
    }
    if (path === '/api/v1/orgs/acme/contests/spring/tree') {
      return json(route, [{ path: 'contest.yaml', kind: 'file', size: 40 }]);
    }
    if (path === task) {
      return json(route, {
        head: `head-${String(state.published)}`,
        latest: {
          id: `pub-${String(state.published)}`,
          number: state.published,
          version: `head-${String(state.published)}`,
          grading_changed: state.published === 1,
          changes: [],
          at: '2026-09-29T09:00:00Z',
        },
        draft: false,
        errors: [],
      });
    }
    if (path === `${task}/publications`) return json(route, []);
    if (path === `${task}/tree`) {
      return json(route, [{ path: 'statement.md', kind: 'file', size: 30 }]);
    }
    if (path === `${task}/files/statement.md`) {
      if (request.method() === 'PUT') {
        state.saved = request.postDataJSON();
        state.published += 1;
        return json(route, {
          outcome: 'published',
          publication: `pub-${String(state.published)}`,
          number: state.published,
          grading_changed: false,
          changes: [],
          registration: 'not_needed',
        });
      }
      return json(route, {
        path: 'statement.md',
        encoding: 'utf-8',
        content: 'Write the sum.\n',
        token: `token-${String(state.published)}`,
      });
    }
    return route.fulfill({ status: 404, body: 'not stubbed' });
  });

  return state;
}

test('an organiser makes an org, walks to a task and publishes a file', async ({
  page,
}) => {
  const state = await stubOrganiserApi(page);
  await page.goto('/orgs');

  await expect(page.getByText('You do not hold a role at any org yet.')).toBeVisible();
  await page.getByRole('link', { name: 'New org' }).click();

  await page.getByRole('textbox', { name: /^Name/ }).fill('acme');
  await page.getByRole('button', { name: 'Create org' }).click();

  const progress = page.getByRole('region', { name: 'Making the org acme' });
  await expect(progress).toBeVisible();
  await progress
    .getByRole('link', { name: 'Open the org acme' })
    .click({ timeout: 10_000 });

  await expect(page).toHaveURL(/\/orgs\/acme$/);
  await page.getByRole('link', { name: 'spring' }).click();
  await page.getByRole('link', { name: 'sum' }).click();

  await expect(page.getByText('Latest publication: 1.')).toBeVisible();
  await page.getByRole('link', { name: 'statement.md' }).click();
  await expect(page).toHaveURL(/\?file=statement\.md$/);

  await page
    .getByRole('textbox', { name: 'statement.md' })
    .fill('Write the sum of two.\n');
  await page.getByRole('button', { name: 'Save' }).click();

  const outcome = page.getByRole('status').filter({
    hasText: 'Published as publication 2.',
  });
  await expect(outcome).toBeVisible();
  await expect(outcome).toBeFocused();
  await expect(page.getByText('Latest publication: 2.')).toBeVisible();
  expect(state.saved).toMatchObject({
    content: 'Write the sum of two.\n',
    token: 'token-1',
  });

  await page.getByRole('link', { name: 'orgs', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Your orgs' })).toContainText('acme');
});
