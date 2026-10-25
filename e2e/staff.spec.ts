import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * A task manager marks a counted submission, releases results, ends a hold,
 * and reads a regrade's row moving. The API is stubbed.
 */

const TASK = {
  draft: false,
  errors: [],
  head: 'v1',
  head_statement_written: true,
  latest: null,
  statement_written: true,
  results: { released: false, history: [] as { action: string; at: string; by: number; by_name: string | null }[] },
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function stub(page: Page) {
  const state = { marked: false, released: false, holding: true };
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/workflow-form')) {
      return json(route, {
        graded: false,
        inputs: [],
        newer: null,
        problem: null,
        runs: false,
        test: [],
        workflow: null,
      });
    }
    if (path.includes('/regrades/')) {
      return json(route, {
        id: 'r1',
        cause: { kind: 'save' },
        publication: 2,
        total: 1,
        running: 0,
        failed: 0,
        unread: 0,
        more_changed: 0,
        changed: [],
        leaderboards: [
          {
            leaderboard: 'gradebook',
            title: 'Gradebook',
            unread: false,
            headers: [],
            sort: [],
            rows: [
              {
                row: { entrant: 'ada', name: 'ada' },
                place_before: 3,
                place_after: 1,
                regrading: [],
                cells: [
                  {
                    column: 'points',
                    before: '1',
                    after: '7.5',
                    text_before: null,
                    text_after: null,
                    waiting: [],
                  },
                ],
              },
            ],
          },
        ],
      });
    }
    if (path.endsWith('/organise/queue')) {
      return json(route, [
        {
          closed_at: '2026-10-01T12:00:00Z',
          row: { entrant: 'ada', name: 'ada' },
          submissions: [
            {
              number: 4,
              counted_by: [{ leaderboard: 'gradebook', column: 'points' }],
              marks: [{ value: 'score', mark: state.marked ? '7.5' : null }],
            },
          ],
        },
      ]);
    }
    if (route.request().method() === 'GET') return json(route, []);
    return route.fulfill({ status: 404, body: route.request().url() });
  });
  await page.route('**/api/v1/time', (route) => json(route, { now: '2026-10-25T00:00:00Z' }));
  await page.route('**/api/v1/me', (route) =>
    json(route, {
      user: { id: 7, username: 'kenny', name: 'Kenny Lewi', avatar_url: null, email: 'kenny@example.org' },
      roles: [{ names: { org: 'acme', contest: 'spring', task: null }, role: 'manager' }],
      degraded: false,
    }),
  );
  const file = (path: string, content: string) => ({
    path,
    encoding: 'utf-8',
    content,
    token: 't',
    upload: null,
    version: 'v0',
  });
  await page.route(/\/files\/contest\.yaml$/, (route) =>
    json(
      route,
      file(
        'contest.yaml',
        'name: Spring\nstart: 2030-10-01T09:00:00Z\nend: 2030-10-01T14:00:00Z\n',
      ),
    ),
  );
  await page.route(/\/files\/task\.yaml$/, (route) =>
    json(route, file('task.yaml', 'name: Sum\nworkflow: unicon/classic@v2\n')),
  );
  await page.route(/\/tree(\?|$)/, (route) =>
    route.fulfill({
      status: 404,
      contentType: 'application/problem+json',
      body: JSON.stringify({
        code: 'not_found',
        status: 404,
        title: 'not found',
        detail: 'missing',
      }),
    }),
  );
  await page.route('**/api/v1/orgs/acme/contests/spring/tasks/sum', (route) => {
    if (!new URL(route.request().url()).pathname.endsWith('/tasks/sum')) return route.fallback();
    return json(route, {
      ...TASK,
      results: state.released
        ? {
            released: true,
            history: [
              { action: 'released', at: '2026-10-25T01:00:00Z', by: 7, by_name: 'kenny' },
            ],
          }
        : TASK.results,
    });
  });
  await page.route('**/tasks/sum/organise/queue', (route) =>
    json(route, [
      {
        closed_at: '2026-10-01T12:00:00Z',
        row: { entrant: 'ada', name: 'ada' },
        submissions: [
          {
            number: 4,
            counted_by: [{ leaderboard: 'gradebook', column: 'points' }],
            marks: [{ value: 'score', mark: state.marked ? '7.5' : null }],
          },
        ],
      },
    ]),
  );
  await page.route('**/entries?*', (route) => {
    state.marked = true;
    return json(route, { value: 'score', mark: '7.5', by: 7, at: '2026-10-25T01:00:00Z' });
  });
  await page.route('**/leaderboards', (route) =>
    json(route, [
      {
        key: 'gradebook',
        title: 'Gradebook',
        audience: { who: 'staff', rows: 'all' },
        headers: [{ name: 'points', places: null, at_least: '0', at_most: '10', self_reported: [] }],
        sort: [{ column: 'points', way: 'desc' }],
        dropped: [],
        held_from: null,
        rows: [
          {
            place: 1,
            grading: null,
            held: 0,
            row: { entrant: 'ada', name: 'ada' },
            cells: [
              {
                column: 'points',
                number: state.marked ? '7.5' : null,
                text: null,
                hidden: !state.marked,
                counted: [{ task: 'sum', number: 4 }],
                waiting: null,
              },
            ],
          },
        ],
      },
    ]),
  );
  await page.route('**/results/release', (route) => {
    const body = route.request().postDataJSON() as { confirm?: boolean };
    if (!body.confirm) {
      return route.fulfill({
        status: 409,
        contentType: 'application/problem+json',
        body: JSON.stringify({
          code: 'confirmation_required',
          detail: 'Score becomes visible to entrants.',
          status: 409,
          title: 'confirmation required',
        }),
      });
    }
    state.released = true;
    return json(route, {
      released: true,
      history: [{ action: 'released', at: '2026-10-25T01:00:00Z', by: 7, by_name: 'kenny' }],
    });
  });
  await page.route('**/hold', (route) => {
    if (route.request().method() === 'GET') {
      return json(route, {
        from: '2030-10-01T13:00:00Z',
        until: 'staff',
        holding: state.holding,
        ended_at: state.holding ? null : '2026-10-25T01:00:00Z',
        ended_by: state.holding ? null : 7,
        ended_by_name: state.holding ? null : 'kenny',
      });
    }
    return route.fallback();
  });
  await page.route('**/hold/end', (route) => {
    const body = route.request().postDataJSON() as { confirm?: boolean };
    if (!body.confirm) {
      return route.fulfill({
        status: 409,
        contentType: 'application/problem+json',
        body: JSON.stringify({
          code: 'confirmation_required',
          detail: 'Every row becomes visible, and this hold cannot be put back.',
          status: 409,
          title: 'confirmation required',
        }),
      });
    }
    state.holding = false;
    return json(route, {
      from: '2030-10-01T13:00:00Z',
      until: 'staff',
      holding: false,
      ended_at: '2026-10-25T01:00:00Z',
      ended_by: 7,
      ended_by_name: 'kenny',
    });
  });
}

test('a manager marks, releases, ends a hold and reads a regrade', async ({ page }) => {
  await stub(page);
  await page.goto('/orgs/acme/contests/spring/tasks/sum/queue');
  await page.getByRole('textbox', { name: 'score' }).fill('7.5');
  await page.getByRole('textbox', { name: 'score' }).press('Enter');
  await expect(page.getByText(/Saved /)).toBeVisible();

  await page.goto('/contests/acme/spring/boards');
  await expect(page.getByRole('table', { name: 'Gradebook' })).toContainText('7.5');

  await page.goto('/orgs/acme/contests/spring/tasks/sum/regrades/r1');
  await expect(page.getByRole('table', { name: 'Gradebook' })).toContainText('moved from 3 to 1');
});
