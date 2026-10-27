import { expect, test, type Page, type Route } from '@playwright/test';
import type { components } from '../src/api/schema';

type Schemas = components['schemas'];

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

/** The caller's own row, which the home and the leaderboards show and the task list's points follow. */
function homeStanding(): Schemas['Leaderboard'] {
  return {
    key: 'gradebook',
    title: 'Gradebook',
    audience: { who: 'entrants', rows: 'own' },
    headers: [
      {
        name: 'points',
        decimals: null,
        at_least: null,
        at_most: '100',
        self_reported: [],
      },
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
            counted: [{ task: 'sum', number: 1 }],
            waiting: null,
          },
        ],
      },
    ],
  };
}

async function stubContestantApi(page: Page, signedIn: boolean) {
  const state = { registered: false, homeReads: 0 };
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });

  await page.route('**/api/v1/time', (route) =>
    json(route, { now: '2026-09-29T10:00:00Z' } satisfies Schemas['ServerTime']),
  );
  await page.route('**/api/v1/auth/register-url', (route) =>
    json(route, { url: null } satisfies Schemas['RegisterUrl']),
  );
  await page.route('**/api/v1/auth/forge-url', (route) =>
    json(route, { url: 'http://forge.localhost:8080' } satisfies Schemas['ForgeUrl']),
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
        } satisfies Schemas['Me'])
      : json(
          route,
          { code: 'unauthenticated', status: 401, title: 'x', detail: 'x' },
          401,
        ),
  );
  await page.route('**/api/v1/public/contests', (route) =>
    json(route, [{ ...CONTEST, tasks: [] }] satisfies Schemas['PublicContest'][]),
  );
  await page.route('**/api/v1/public/contests/acme/spring', (route) =>
    json(route, {
      ...CONTEST,
      tasks: [{ name: 'sum', label: 'A', title: 'Sum of Two' }],
    } satisfies Schemas['PublicContest']),
  );
  await page.route('**/api/v1/public/contests/acme/spring/tasks/sum', (route) =>
    json(route, {
      task: { name: 'sum', label: 'A', title: 'Sum of Two' },
      statement: '# Sum\n\nPrint the sum of two numbers.\n',
    } satisfies Schemas['PublicStatement']),
  );
  await page.route('**/api/v1/contests', (route) =>
    json(route, [
      {
        ...CONTEST,
        visibility: 'everyone',
        status: state.registered ? 'pending' : null,
      },
    ] satisfies Schemas['ContestSummary'][]),
  );

  /** The caller's entrant, carol alone, as the backend answers it. */
  const entrantOf = (status: 'pending' | 'approved'): Schemas['Entrant'] => ({
    id: ENTRANT,
    name: null,
    display_name: 'carol',
    status,
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
        user_id: 20,
        user: { id: 20, username: 'carol', name: 'Carol', avatar_url: null },
        way_kind: 'signup',
        way_name: null,
        joined_at: '2026-09-29T10:00:00Z',
      },
    ],
  });

  /** The caller's entry: free to register, then registered alone, pending, then approved. */
  const registration = () => {
    const entry: Schemas['MyEntry'] = {
      entrant: null,
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
    const entrant = entrantOf(state.homeReads < 2 ? 'pending' : 'approved');
    return { ...entry, entrant, can_register: false };
  };

  await page.route('**/api/v1/orgs/acme/contests/spring/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/entrants') && request.method() === 'POST') {
      state.registered = true;
      return json(route, entrantOf('pending'), 201);
    }
    if (path.endsWith('/home')) {
      const entry = registration();
      const approved = entry.entrant?.status === 'approved';
      return json(route, {
        ...CONTEST,
        state: 'published',
        registration: entry,
        organises: false,
        now: '2026-09-29T10:00:00Z',
        standing: approved ? [homeStanding()] : [],
        tasks: [
          {
            name: 'sum',
            label: 'A',
            title: 'Sum of Two',
            release: OPEN,
            due: null,
            closes: CONTEST.end,
          },
        ],
      } satisfies Schemas['ContestHome']);
    }
    if (path.endsWith('/tasks/sum/page')) {
      return json(route, {
        name: 'sum',
        label: 'A',
        title: 'Sum of Two',
        statement: '# Sum\n\nPrint the sum of two numbers.\n',
        submissions: { max: 50, rate: { count: 1, per: 30 } },
        inputs: [
          {
            id: 'submission',
            type: 'file',
            label: 'Your solution',
            options: null,
            default: null,
            min: null,
            max: null,
            max_size: 10485760,
            parts: null,
          },
          {
            id: 'language',
            type: 'enum',
            label: 'language',
            options: ['python'],
            default: null,
            min: null,
            max: null,
            max_size: 10485760,
            parts: null,
          },
        ],
        release: OPEN,
        due: null,
        closes: CONTEST.end,
        marks: null,
      } satisfies Schemas['TaskPage']);
    }
    if (path.endsWith('/tasks/sum/submissions')) return json(route, []);
    if (path.endsWith('/leaderboards')) return json(route, [homeStanding()]);
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
  await expect(tasks).toContainText('Closes in');
  // An entrant reads the points, not the most the column can show.
  await expect(tasks).toContainText('62');
  await expect(tasks).not.toContainText('/ 100');
  await expect(page.getByRole('table', { name: 'Gradebook' })).toBeVisible();
  await expect(
    page
      .getByRole('region', { name: 'Questions to the organisers' })
      .getByRole('link', { name: 'Ask a question' }),
  ).toBeVisible();

  await page.getByRole('link', { name: 'Sum of Two' }).click();
  await expect(page.getByRole('timer', { name: 'Task countdown' })).toContainText(
    'Closes in',
  );
  await expect(page.getByLabel('Limits')).toContainText('At most 1 in any 30 seconds');
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
