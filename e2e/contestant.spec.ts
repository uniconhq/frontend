import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * The contestant path against the dev server with the API stubbed, so it
 * needs no backend: a visitor finds a public contest on the landing page and
 * reads a released statement; signed in, they register, wait for an
 * organiser and land in the contest once approved,
 * with the time left, its tasks, where they stand on its leaderboard and the
 * way to ask a question, and the task's time left at its top, its limits
 * and the panel to submit from.
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
const ENTRANT = '0e000000-0000-4000-8000-000000000007';

/** The contest's one leaderboard, the caller's entrant first of two, its numbers exact strings. */
const STANDINGS = {
  board: 'Standings',
  over: 'all',
  select: 'best',
  who: 'contestants',
  keys: [{ by: 'points', better: 'higher', per_attempt: null }],
  tasks: [{ id: 'sum', label: 'A', worth: '100' }],
  not_in_view: [],
  rows: [
    {
      rank: 1,
      row: { entrant: ENTRANT, name: 'kenny' },
      keys: ['100'],
      cells: {
        sum: {
          attempts: 1,
          counting: true,
          grading: 0,
          numbers: { points: '100' },
          submissions: [],
        },
      },
    },
    {
      rank: 2,
      row: { entrant: '0e000000-0000-4000-8000-000000000008', name: 'ada' },
      keys: ['42.5'],
      cells: {
        sum: {
          attempts: 2,
          counting: true,
          grading: null,
          numbers: { points: '42.5' },
          submissions: null,
        },
      },
    },
  ],
  nothing_shown: false,
  shown_at: null,
};

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
        visibility: 'everyone',
        status: state.registered ? 'pending' : null,
      },
    ]),
  );

  /** The caller's entry: free to register, then registered alone, pending, then approved. */
  const registration = () => {
    const entry = {
      entrant: null as unknown,
      invitations: [],
      registration_open: true,
      can_register: true,
      asks_code: false,
      refused: null,
      most: 1,
      fewest: 1,
      locks: 'start',
    };
    if (!state.registered) return entry;
    state.homeReads += 1;
    const entrant = {
      id: ENTRANT,
      name: null,
      display_name: 'kenny',
      status: state.homeReads < 2 ? 'pending' : 'approved',
      registered_at: '2026-09-29T10:00:00Z',
      decided_at: null,
      reason: null,
      invites: [],
      time_extension: 0,
      extension_tasks: null,
      submitted: false,
      complete: true,
      locked: false,
      members: [
        {
          user_id: 7,
          user: { id: 7, username: 'kenny', name: null, avatar_url: null },
          way_kind: 'signup',
          way_name: null,
          joined_at: '2026-09-29T10:00:00Z',
        },
      ],
    };
    return { ...entry, entrant, can_register: false };
  };

  await page.route('**/api/v1/orgs/acme/contests/spring/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/entrants') && request.method() === 'POST') {
      state.registered = true;
      return json(route, {}, 201);
    }
    if (path.endsWith('/home')) {
      return json(route, {
        ...CONTEST,
        state: 'published',
        registration: registration(),
        now: '2026-09-29T10:00:00Z',
        tasks: [
          {
            name: 'sum',
            label: 'A',
            title: 'Sum of Two',
            worth: '100',
            release: OPEN,
            due: null,
            closes: CONTEST.end,
          },
        ],
      });
    }
    if (path.endsWith('/tasks/sum/page')) {
      return json(route, {
        name: 'sum',
        label: 'A',
        title: 'Sum of Two',
        worth: '100',
        statement: '# Sum\n\nPrint the sum of two numbers.\n',
        submissions: { max: 50, rate: { count: 1, per: 30 } },
        inputs: [
          {
            id: 'submission',
            type: 'file',
            label: 'Your solution',
            options: null,
            per_test: false,
            default: null,
            min: null,
            max: null,
            max_size: 10485760,
          },
          {
            id: 'language',
            type: 'enum',
            label: 'language',
            options: ['python'],
            per_test: false,
            default: null,
            min: null,
            max: null,
            max_size: 10485760,
          },
        ],
        release: OPEN,
        due: null,
        closes: CONTEST.end,
      });
    }
    if (path.endsWith('/tasks/sum/submissions')) return json(route, []);
    if (path.endsWith('/boards')) return json(route, [STANDINGS]);
    if (path.endsWith('/questions') && request.method() === 'GET') {
      return json(route, []);
    }
    if (path.endsWith('/announcements')) return json(route, []);
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
  await expect(page.getByRole('timer', { name: 'Contest countdown' })).toContainText(
    'Contest ends in',
  );
  await page.getByRole('button', { name: 'Register' }).click();

  await expect(page.getByText('Your registration is waiting')).toBeVisible();
  expect(state.registered).toBe(true);
  await expect(page.getByText('You are in')).toBeVisible({ timeout: 15_000 });

  // In race order: the time left, then the tasks, the leaderboard and the way to ask.
  const tasks = page.getByRole('list', { name: 'Tasks' });
  await expect(tasks).toContainText('100 points');
  await expect(tasks).toContainText('Closes in');
  await expect(
    page.getByRole('region', { name: 'Leaderboard' }).getByText('You are 1st of 2.'),
  ).toBeVisible();
  await expect(
    page
      .getByRole('region', { name: 'Questions to the organisers' })
      .getByRole('link', { name: 'Ask a question' }),
  ).toBeVisible();

  await page.getByRole('link', { name: 'Sum of Two' }).click();
  await expect(page.getByRole('timer', { name: 'Task countdown' })).toContainText(
    'Closes in',
  );
  await expect(page.getByLabel('Limits')).toContainText('1 in any 30 seconds');
  await expect(page.getByLabel('Limits')).toContainText('Closes');
  const form = page.getByRole('form', { name: 'Submit' });
  await expect(form).toBeVisible();
  await expect(form.getByText('language: python')).toBeVisible();
  await expect(
    page.getByText('You have not submitted to this task yet.'),
  ).toBeVisible();

  await page.getByRole('link', { name: 'Ask a question about this task' }).click();
  await expect(page).toHaveURL(/\/contests\/acme\/spring\/questions\?task=sum$/);
  await expect(
    page
      .getByRole('form', { name: 'Ask' })
      .getByRole('combobox', { name: 'About the task' }),
  ).toHaveValue('sum');
});
