import { specCatalogue } from '../src/features/organise/formula/catalogue';
import { expect, test, type Page, type Route } from '@playwright/test';
import { parse } from 'yaml';
import type { components } from '../src/api/schema';

type Schemas = components['schemas'];

const CATALOGUE = specCatalogue();

/**
 * A contest manager writes the course gradebook, the olympiad leaderboard
 * and ICPC, and a hold, into contest.yaml. The API is stubbed.
 */

const START = [
  'name: Spring',
  'start: 2030-10-01T09:00:00Z',
  'end: 2030-10-01T14:00:00Z',
  'state: draft',
  'visibility: signed-in',
  'tasks: []',
  '',
].join('\n');

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function stub(page: Page) {
  const state = { yaml: START, saves: 0 };

  await page.route('**/api/v1/**', (route) => {
    if (route.request().method() === 'GET') return json(route, []);
    return route.fulfill({ status: 404, body: route.request().url() });
  });
  await page.route('**/api/v1/time', (route) =>
    json(route, { now: '2026-10-25T00:00:00Z' } satisfies Schemas['ServerTime']),
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
      roles: [
        { names: { org: 'acme', contest: 'spring', task: null }, role: 'manager' },
      ],
      degraded: false,
    } satisfies Schemas['Me']),
  );
  await page.route('**/api/v1/blocks', (route) => json(route, CATALOGUE));
  await page.route('**/api/v1/orgs/acme/contests/spring/organise/entrants', (route) =>
    json(route, []),
  );
  await page.route(/\/files\/contest\.yaml$/, (route) => {
    const request = route.request();
    if (request.method() === 'PUT') {
      state.yaml = (request.postDataJSON() as { content: string }).content;
      state.saves += 1;
      if (state.saves > 1) {
        return route.fulfill({
          status: 422,
          contentType: 'application/problem+json',
          body: JSON.stringify({
            type: 'about:blank',
            title: 'Unprocessable Content',
            status: 422,
            detail: 'invalid_definition',
            code: 'invalid_definition',
            errors: [
              {
                path: 'leaderboards.icpc.columns.solved',
                message: 'This column is refused.',
              },
            ],
          }),
        });
      }
      return json(route, { version: 'v1', notes: [] } satisfies Schemas['Written']);
    }
    return json(route, {
      path: 'contest.yaml',
      encoding: 'utf-8',
      content: state.yaml,
      token: `token-${String(state.saves)}`,
      upload: null,
      version: 'v0',
    } satisfies Schemas['FileContent']);
  });
  return state;
}

async function addBoard(page: Page, name: string) {
  await page.getByRole('button', { name: 'Add a leaderboard' }).click();
  await page
    .getByRole('region', { name: 'Leaderboard leaderboard', exact: true })
    .getByRole('textbox', { name: 'Name', exact: true })
    .first()
    .fill(name);
  return page.getByRole('region', {
    name: `Leaderboard ${name.toLowerCase().replaceAll(' ', '_')}`,
    exact: true,
  });
}

test('writes the three leaderboards and a hold, and marks a refused column', async ({
  page,
}) => {
  const state = await stub(page);
  await page.goto('/orgs/acme/contests/spring/leaderboards');

  const gradebook = await addBoard(page, 'Gradebook');
  await gradebook.getByRole('radio', { name: 'Entrants' }).click();
  await gradebook.getByRole('radio', { name: 'Only their own row' }).click();

  const olympiad = await addBoard(page, 'Olympiad');
  await olympiad.getByRole('radio', { name: 'Anyone' }).click();

  const icpc = await addBoard(page, 'ICPC');
  await icpc.getByRole('radio', { name: 'Anyone' }).click();
  await icpc.getByRole('textbox', { name: 'Name' }).nth(1).fill('solved');
  await icpc.getByRole('button', { name: 'Add a column', exact: true }).click();
  await icpc.getByRole('textbox', { name: 'Name' }).nth(2).fill('penalty');
  await icpc.getByRole('button', { name: 'Add a column', exact: true }).click();
  await icpc.getByRole('textbox', { name: 'Name' }).nth(3).fill('last_solve');
  await icpc.getByRole('button', { name: 'Add a tie-break' }).click();
  await icpc.getByRole('button', { name: 'Add a tie-break' }).click();
  const order = icpc.getByRole('combobox', { name: /^Order of/ });
  await order.nth(1).selectOption({ label: 'Lowest first' });
  await order.nth(2).selectOption({ label: 'Lowest first' });
  await icpc.getByRole('button', { name: 'Add a column to show' }).click();
  await icpc.getByRole('button', { name: 'Add a column to show' }).click();

  await page
    .getByRole('checkbox', { name: 'Freeze the leaderboards near the end' })
    .click();
  await page.getByRole('button', { name: 'An hour before the end' }).click();
  await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Saved.')).toBeVisible();

  const saved = parse(state.yaml) as {
    leaderboards: Record<
      string,
      { title?: string; audience?: { who?: string; rows?: string }; sort?: unknown }
    >;
    hold: { from: string; until: string };
  };
  expect(saved.leaderboards['gradebook']?.audience).toMatchObject({
    who: 'entrants',
    rows: 'own',
  });
  expect(saved.leaderboards['olympiad']?.title).toBe('Olympiad');
  expect(saved.leaderboards['olympiad']?.audience).toMatchObject({ who: 'everyone' });
  expect(saved.leaderboards['icpc']?.sort).toEqual([
    { solved: 'desc' },
    { penalty: 'asc' },
    { last_solve: 'asc' },
  ]);
  expect(saved.hold.until).toBe('staff');
  expect(new Date(saved.hold.from).getTime()).toBe(
    new Date('2030-10-01T14:00:00Z').getTime() - 60 * 60 * 1000,
  );

  await page.getByRole('button', { name: 'Save' }).click();
  await expect(
    page
      .getByRole('region', { name: 'Leaderboard icpc' })
      .getByText('This column is refused.', {
        exact: true,
      }),
  ).toBeVisible();
});

test('explains the top ten rows to entrants', async ({ page }) => {
  await stub(page);
  await page.goto('/orgs/acme/contests/spring/leaderboards');
  const card = await addBoard(page, 'Standings');
  await card.getByRole('radio', { name: 'Entrants', exact: true }).click();
  await card.getByRole('radio', { name: 'The top rows', exact: true }).click();
  await expect(
    card.getByText(
      'Entrants see the top 10 rows, and their own row when it is lower. Organisers always see every row.',
      { exact: true },
    ),
  ).toBeVisible();
});

test('a column’s flow shows its task and its picked column, and its tray uses its name', async ({
  page,
}) => {
  const state = await stub(page);
  state.yaml =
    START.replace('tasks: []', 'tasks: [{id: sum}]') +
    `leaderboards:
  standings:
    title: Standings
    columns:
      sum_pick: {block: highest, from: {results: sum}, by: {value: [sum, points]}}
      total: 1
  public:
    title: Public
    columns:
      summary: {text: hello}
      recent: {block: latest, from: {results: sum}}
`;
  await page.route('**/tasks/sum/files/task.yaml', (route) =>
    json(route, {
      path: 'task.yaml',
      content: 'name: Sum\nscoring: {values: {points: 1}}\n',
      encoding: 'utf-8',
      token: 't',
      version: 'v',
      upload: null,
    } satisfies Schemas['FileContent']),
  );
  await page.route('**/tasks/sum/workflow-form', (route) =>
    json(route, {
      workflow: null,
      newer: null,
      problem: null,
      inputs: [],
      graded: false,
      text_values: [],
    } satisfies Schemas['WorkflowForm']),
  );
  await page.goto('/orgs/acme/contests/spring/leaderboards');
  const card = page.getByRole('group', { name: 'total', exact: true });
  await card
    .getByRole('textbox', { name: 'total', exact: true })
    .fill('sum(sum.points) + sum_pick.points');
  await expect(card.getByRole('img', { name: 'sum task', exact: true })).toBeVisible();
  await expect(
    card.getByRole('img', { name: 'sum_pick column', exact: true }),
  ).toBeVisible();
  await expect(
    card.getByText('Click a tile to put it in total, at the cursor.', { exact: true }),
  ).toBeVisible();
  await expect(card.getByText(/put it in column-/)).toHaveCount(0);
  await expect(
    card.getByRole('button', { name: 'public.summary text', exact: true }),
  ).toBeVisible();
  await expect(
    card.getByRole('button', { name: 'public.recent one submission', exact: true }),
  ).toBeVisible();
  await expect(
    card.getByRole('button', { name: 'total one number', exact: true }),
  ).toHaveCount(0);
  await expect(
    card.getByRole('heading', { name: 'For each submission', exact: true }),
  ).toBeVisible();
  for (const tile of await card.locator('[class*="paletteItem"]').all()) {
    expect(
      await tile.evaluate(
        (element: { scrollWidth: number; clientWidth: number }) =>
          element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
  }
});

test('an added column opens its formula with its visible name', async ({ page }) => {
  await stub(page);
  await page.goto('/orgs/acme/contests/spring/leaderboards');
  const board = await addBoard(page, 'Standings');
  await board.getByRole('button', { name: 'Add a column', exact: true }).click();
  const card = board.getByRole('group', { name: 'column_2', exact: true });
  await expect(
    card.getByRole('textbox', { name: 'column_2', exact: true }),
  ).toBeFocused();
  await expect(
    card.getByText('Click a tile to put it in column_2, at the cursor.', {
      exact: true,
    }),
  ).toBeVisible();
});
