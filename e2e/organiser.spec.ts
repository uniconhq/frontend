import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * The organiser path against the dev server with the API stubbed, so it needs
 * no backend: make an org and land on its page, walk down to a task, open a
 * file and save it, and see the publication number the save answers with,
 * with the focus on that answer.
 * The stub keeps just enough state for each answer to follow from the last.
 */
async function stubOrganiserApi(page: Page) {
  const state = { orgMade: false, published: 1, saved: null as unknown };

  const taskState = () => ({
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

  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });

  await page.route('**/api/v1/time', (route) =>
    json(route, { now: '2026-09-29T10:00:00Z' }),
  );
  await page.route('**/api/v1/me', (route) =>
    json(route, {
      user: {
        id: 7,
        username: 'kenny',
        name: 'Kenny Lewi',
        avatar_url: null,
        email: 'kenny@example.org',
      },
      roles: state.orgMade
        ? [
            {
              names: { org: 'acme', contest: null, task: null },
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
      state.orgMade = true;
      return json(route, { name: 'acme' }, 201);
    }
    if (path.endsWith('/roles')) return json(route, []);
    if (path === '/api/v1/orgs/acme') {
      return json(route, { display_name: '', description: '' });
    }
    if (path === '/api/v1/orgs/acme/contests') return json(route, [{ name: 'spring' }]);
    if (path === '/api/v1/orgs/acme/contests/spring/tasks') {
      return json(route, [{ name: 'sum' }]);
    }
    if (path === '/api/v1/orgs/acme/contests/spring/organise/tasks') {
      return json(route, [
        {
          task: { name: 'sum' },
          label: 'A',
          state: taskState(),
          timeline: {
            release_at: '2026-10-01T09:00:00Z',
            due: null,
            late_per_day: null,
            closes: '2026-10-01T14:00:00Z',
            worth: 100,
          },
        },
      ]);
    }
    if (path === '/api/v1/orgs/acme/contests/spring/tree') {
      return json(route, [
        { path: 'contest.yaml', kind: 'file', size: 40, upload: null },
      ]);
    }
    if (path === task) return json(route, taskState());
    if (path === `${task}/publications`) return json(route, []);
    if (path === `${task}/tree`) {
      return json(route, [
        { path: 'statement.md', kind: 'file', size: 30, upload: null },
      ]);
    }
    if (path === `${task}/files/statement.md`) {
      if (request.method() === 'PUT') {
        state.saved = request.postDataJSON();
        state.published += 1;
        return json(route, {
          publication: `pub-${String(state.published)}`,
          number: state.published,
          grading_changed: false,
          changes: [],
          notes: [],
          regraded: 0,
        });
      }
      return json(route, {
        path: 'statement.md',
        encoding: 'utf-8',
        content: 'Write the sum.\n',
        token: `token-${String(state.published)}`,
        upload: null,
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

  await expect(page).toHaveURL(/\/orgs\/acme$/, { timeout: 10_000 });
  await expect(page.getByRole('heading', { name: 'acme', level: 1 })).toBeVisible();
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
