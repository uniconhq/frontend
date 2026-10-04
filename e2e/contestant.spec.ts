import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * The contestant path against the dev server with the API stubbed, so it
 * needs no backend: a visitor finds a public contest on the landing page and
 * reads a released statement; signed in, they register, wait for an
 * organiser and land in the contest once approved,
 * with a countdown by the server's clock, and the task's limits and the panel
 * to submit from.
 * The stub keeps just enough state for each answer to follow from the last.
 */
const CONTEST = {
  where: { org: 'acme', contest: 'spring' },
  name: 'Spring 2026',
  description: 'Four tasks, five hours.',
  start: '2026-09-29T09:00:00Z',
  end: '2026-09-29T12:00:00Z',
};
const OPEN = { released: true, visible: true, open: true, closed: null };

async function stubContestantApi(page: Page, signedIn: boolean) {
  const state = { registered: false, homeReads: 0 };
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });

  await page.route('**/api/v1/time', (route) =>
    json(route, { now: '2026-09-29T10:00:00Z' }),
  );
  await page.route('**/api/v1/auth/register-url', (route) =>
    json(route, { url: null }),
  );
  await page.route('**/api/v1/auth/forge-url', (route) =>
    json(route, { url: 'http://forge.localhost:8080' }),
  );
  await page.route('**/api/v1/me', (route) =>
    signedIn
      ? json(route, {
          user: {
            id: 20,
            username: 'carol',
            name: 'Carol',
            avatar_url: null,
            email: 'carol@example.org',
          },
          roles: [],
          degraded: false,
        })
      : json(
          route,
          { code: 'unauthenticated', status: 401, title: 'x', detail: 'x' },
          401,
        ),
  );
  await page.route('**/api/v1/public/contests', (route) =>
    json(route, [{ ...CONTEST, tasks: [] }]),
  );
  await page.route('**/api/v1/public/contests/acme/spring', (route) =>
    json(route, {
      ...CONTEST,
      tasks: [{ name: 'sum', label: 'A', title: 'Sum of Two' }],
    }),
  );
  await page.route('**/api/v1/public/contests/acme/spring/tasks/sum', (route) =>
    json(route, {
      task: { name: 'sum', label: 'A', title: 'Sum of Two' },
      statement: '# Sum\n\nPrint the sum of two numbers.\n',
    }),
  );
  await page.route('**/api/v1/contests', (route) =>
    json(route, [
      {
        ...CONTEST,
        visibility: 'public',
        status: state.registered ? 'pending' : null,
      },
    ]),
  );

  const registration = () => {
    if (!state.registered) return null;
    state.homeReads += 1;
    const base = {
      reason: null,
      registered_at: '2026-09-29T10:00:00Z',
      decided_at: null,
      time_extension: 0,
    };
    if (state.homeReads < 2) return { ...base, status: 'pending' };
    return { ...base, status: 'approved' };
  };

  await page.route('**/api/v1/orgs/acme/contests/spring/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/registration') && request.method() === 'POST') {
      state.registered = true;
      return json(route, { status: 'pending' }, 201);
    }
    if (path.endsWith('/home')) {
      return json(route, {
        ...CONTEST,
        state: 'published',
        submissions_closed: false,
        registration: registration(),
        registration_open: true,
        invite_only: false,
        asks_code: false,
        deadline: CONTEST.end,
        now: '2026-09-29T10:00:00Z',
        tasks: [
          { name: 'sum', label: 'A', title: 'Sum of Two', points: 100, release: OPEN },
        ],
      });
    }
    if (path.endsWith('/tasks/sum/page')) {
      return json(route, {
        name: 'sum',
        label: 'A',
        title: 'Sum of Two',
        points: 100,
        statement: '# Sum\n\nPrint the sum of two numbers.\n',
        limits: {
          submissions: 50,
          rate: { count: 1, per: 30 },
          max_size: 10485760,
        },
        inputs: [
          {
            id: 'submission',
            type: 'code',
            label: 'Your solution',
            language: ['python'],
            min: null,
            max: null,
            accept: null,
            max_size: null,
            default: null,
          },
        ],
        release: OPEN,
      });
    }
    if (path.endsWith('/tasks/sum/submissions')) return json(route, []);
    return route.fulfill({ status: 404, body: 'not stubbed' });
  });
  return state;
}

test('a visitor finds a public contest and reads a released statement', async ({
  page,
}) => {
  await stubContestantApi(page, false);
  await page.goto('/');

  await page
    .getByRole('list', { name: 'Public contests' })
    .getByRole('link', { name: 'Spring 2026' })
    .click();
  await expect(page).toHaveURL(/\/contests\/acme\/spring$/);
  await expect(page.getByText('Sign in to register for this contest.')).toBeVisible();

  await page.getByRole('link', { name: 'Sum of Two' }).click();
  await expect(
    page.getByRole('heading', { name: 'A. Sum of Two', level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sum', level: 2 })).toBeVisible();
  await expect(page.getByLabel('Limits')).toHaveCount(0);
});

test('a contestant registers, waits, is let in and reads the task', async ({
  page,
}) => {
  const state = await stubContestantApi(page, true);
  await page.goto('/');

  await page
    .getByRole('list', { name: 'Contests' })
    .getByRole('link', { name: 'Spring 2026' })
    .click();
  await expect(page.getByRole('timer', { name: 'Countdown' })).toContainText(
    'Time left',
  );
  await page.getByRole('button', { name: 'Register' }).click();

  await expect(page.getByText('Your registration is waiting')).toBeVisible();
  expect(state.registered).toBe(true);
  await expect(page.getByText('You are in')).toBeVisible({ timeout: 15_000 });

  await page.getByRole('link', { name: 'Sum of Two' }).click();
  await expect(page.getByLabel('Limits')).toContainText('1 in any 30 seconds');
  await expect(page.getByRole('form', { name: 'Submit' })).toBeVisible();
  await expect(
    page.getByText('You have not submitted to this task yet.'),
  ).toBeVisible();
});
