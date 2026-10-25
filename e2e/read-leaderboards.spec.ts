import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * An entrant reads the gradebook, one row and no place, and ICPC while a
 * hold is on. The API is stubbed.
 */

const ENTRANT = '0e000000-0000-4000-8000-000000000007';

const GRADEBOOK = {
  key: 'gradebook',
  title: 'Gradebook',
  audience: { who: 'entrants', rows: 'own' },
  headers: [
    { name: 'points', places: null, at_least: null, at_most: '100', self_reported: [] },
  ],
  sort: [{ column: 'points', way: 'desc' }],
  dropped: [],
  held_from: null,
  rows: [
    {
      place: null,
      grading: null,
      held: 0,
      row: { entrant: ENTRANT, name: 'carol' },
      cells: [
        {
          column: 'points',
          number: '62',
          text: null,
          hidden: false,
          counted: [{ task: 'sum', number: 4 }],
          waiting: null,
        },
      ],
    },
  ],
};

const ICPC = {
  key: 'icpc',
  title: 'ICPC',
  audience: { who: 'everyone', rows: 'all' },
  headers: [
    { name: 'solved', places: 0, at_least: null, at_most: null, self_reported: [] },
  ],
  sort: [{ column: 'solved', way: 'desc' }],
  dropped: [],
  held_from: '2030-10-01T13:00:00Z',
  rows: [
    {
      place: 1,
      grading: null,
      held: 3,
      row: { entrant: ENTRANT, name: 'carol' },
      cells: [
        {
          column: 'solved',
          number: '1',
          text: null,
          hidden: false,
          counted: null,
          waiting: null,
        },
      ],
    },
  ],
};

function json(route: Route, body: unknown) {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function stub(page: Page) {
  await page.route('**/api/v1/**', (route) => {
    if (route.request().method() === 'GET') return json(route, []);
    return route.fulfill({ status: 404, body: route.request().url() });
  });
  await page.route('**/api/v1/time', (route) =>
    json(route, { now: '2026-10-25T00:00:00Z' }),
  );
  await page.route('**/api/v1/me', (route) =>
    json(route, {
      user: {
        id: 20,
        username: 'carol',
        name: 'Carol',
        avatar_url: null,
        email: 'carol@example.org',
      },
      roles: [],
      degraded: false,
    }),
  );
  await page.route('**/api/v1/orgs/acme/contests/spring/leaderboards', (route) =>
    json(route, [GRADEBOOK, ICPC]),
  );
}

test('an entrant reads the gradebook and ICPC during a hold', async ({ page }) => {
  await stub(page);
  await page.goto('/contests/acme/spring/leaderboards');

  const gradebook = page.getByRole('table', { name: 'Gradebook' });
  await expect(gradebook).toBeVisible();
  await expect(gradebook.getByRole('row', { name: /carol/ })).toContainText('62');
  await expect(gradebook.getByRole('cell').first()).toHaveText('–');
  await expect(gradebook.getByRole('link', { name: 'Submission 4' })).toHaveAttribute(
    'href',
    '/contests/acme/spring/tasks/sum?submission=4',
  );

  const icpc = page.getByRole('table', { name: 'ICPC' });
  await expect(icpc.getByRole('row', { name: /carol/ })).toContainText('3 held');
  await expect(page.getByText(/Held from /)).toBeVisible();
});
