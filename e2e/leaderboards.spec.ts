import { expect, test, type Page, type Route } from '@playwright/test';
import { parse } from 'yaml';

/** Enough of `GET /blocks` for a formula that is the number 1. */
const CATALOGUE = {
  blocks: [],
  facts: [],
  languages: [],
  leaderboard_facts: ['attempt', 'seconds', 'seconds_late', 'marked', 'compiled'],
  leaderboard_leaves: [],
  leaves: [],
  skip: 'SKIPPED',
};

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
    json(route, { now: '2026-10-25T00:00:00Z' }),
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
      roles: [{ names: { org: 'acme', contest: 'spring', task: null }, role: 'manager' }],
      degraded: false,
    }),
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
      return json(route, { version: 'v1', notes: [] });
    }
    return json(route, {
      path: 'contest.yaml',
      encoding: 'utf-8',
      content: state.yaml,
      token: `token-${String(state.saves)}`,
      upload: null,
      version: 'v0',
    });
  });
  return state;
}

async function addBoard(page: Page, key: string, title: string) {
  await page.getByRole('button', { name: 'Add a leaderboard' }).click();
  await page
    .getByRole('region', { name: 'Leaderboard board' })
    .getByRole('textbox', { name: 'Key' })
    .fill(key);
  const card = page.getByRole('region', { name: `Leaderboard ${key}` });
  await card.getByRole('textbox', { name: 'Title' }).fill(title);
  return card;
}

test('writes the three leaderboards and a hold, and marks a refused column', async ({
  page,
}) => {
  const state = await stub(page);
  await page.goto('/orgs/acme/contests/spring/leaderboards');

  const gradebook = await addBoard(page, 'gradebook', 'Course gradebook');
  await gradebook.getByRole('radio', { name: 'Entrants' }).click();
  await gradebook.getByRole('radio', { name: "Each entrant's own row" }).click();

  const olympiad = await addBoard(page, 'olympiad', 'Olympiad');
  await olympiad.getByRole('radio', { name: 'Everyone' }).click();

  const icpc = await addBoard(page, 'icpc', 'ICPC');
  await icpc.getByRole('radio', { name: 'Everyone' }).click();
  await icpc.getByRole('textbox', { name: 'Name' }).fill('solved');
  await icpc.getByRole('button', { name: 'Add a column', exact: true }).click();
  await icpc.getByRole('textbox', { name: 'Name' }).nth(1).fill('penalty');
  await icpc.getByRole('button', { name: 'Add a column', exact: true }).click();
  await icpc.getByRole('textbox', { name: 'Name' }).nth(2).fill('last_solve');
  await icpc.getByRole('button', { name: 'Add a sort' }).click();
  await icpc.getByRole('button', { name: 'Add a sort' }).click();
  const order = icpc.getByRole('combobox', { name: 'Order' });
  await order.nth(1).selectOption({ label: 'Lowest first' });
  await order.nth(2).selectOption({ label: 'Lowest first' });
  await icpc.getByRole('button', { name: 'Add a column to show' }).click();
  await icpc.getByRole('button', { name: 'Add a column to show' }).click();

  await page.getByRole('checkbox', { name: 'Hold' }).click();
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
    page.getByRole('region', { name: 'Leaderboard icpc' }).getByText('This column is refused.', {
      exact: true,
    }),
  ).toBeVisible();
});
