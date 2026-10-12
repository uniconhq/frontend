import { expect, test, type Page, type Route } from '@playwright/test';

/** The version the uploaded part of test 1 was last changed at. */
const UPLOADED_AT = 'a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6a7b8c9d0';

/** unicon/classic@v2 as deploy seeds it, its inputs titled for the task's form (#434). */
const CLASSIC = `inputs:
  submission: {type: file, contestant: true, title: Solution}
  language: {type: enum, options: [c, cpp, java, python], contestant: true, title: Language}
  time_limit: {type: number, title: Time limit, unit: seconds, help: The CPU time the program may use on each test.}
  memory_limit: {type: number, title: Memory limit, unit: MB}
test:
  input: file
  answer: file
steps: []
`;

/**
 * The organiser path against the dev server with the API stubbed, so it needs
 * no backend: make an org and land on its page, walk down to a task, open a
 * file and save it, and see the publication number the save answers with,
 * with the focus on that answer.
 * The stub keeps just enough state for each answer to follow from the last.
 */
async function stubOrganiserApi(page: Page) {
  const state = {
    orgMade: false,
    published: 1,
    saved: null as unknown,
    contestYaml:
      'name: Spring 2026\nstart: 2030-10-01T09:00:00Z\nend: 2030-10-01T14:00:00Z\nstate: draft\nvisibility: signed-in\ntasks:\n  - id: sum\n',
    contestSaves: 0,
    taskYaml:
      'name: Sum\nworkflow: unicon/classic@v2\ninputs:\n  submission: {label: Your solution}\n  language: {options: [python]}\n  time_limit: 2\n  memory_limit: 256\ntest_groups:\n  main: {each: 100}\n',
    taskSaves: [] as unknown[],
    /** How many gradings failed and wait, as the queue counts them. */
    failed: 0,
    /** The feed's queries, each as the page asked it. */
    feedAsked: [] as string[],
  };

  const taskState = () => ({
    head: `head-${String(state.published)}`,
    latest: {
      id: `pub-${String(state.published)}`,
      number: state.published,
      version: `head-${String(state.published)}`,
      grading_changed: state.published === 1,
      changes: [],
      at: '2026-09-29T09:00:00Z',
      meanings: [],
    },
    draft: false,
    errors: [],
    statement_written: true,
    head_statement_written: true,
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
  await page.route('**/api/v1/workflows', (route) =>
    json(route, [
      {
        owner: 'unicon',
        name: 'classic',
        versions: ['v2'],
        editable: false,
        visibility: 'public',
      },
    ]),
  );
  await page.route('**/api/v1/workflows/unicon/classic/versions/v2', (route) =>
    json(route, { content: CLASSIC }),
  );
  await page.route('**/api/v1/primitives', (route) => json(route, []));
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
    if (path.endsWith('/roles') || path.endsWith('/invites')) return json(route, []);
    if (path === '/api/v1/orgs/acme') {
      return json(route, { display_name: '', description: '' });
    }
    if (path === '/api/v1/orgs/acme/clarifications') return json(route, []);
    if (path === '/api/v1/orgs/acme/contests/spring/home') {
      return json(route, {
        where: { org: 'acme', contest: 'spring' },
        name: 'Spring 2026',
        description: '',
        start: '2026-10-01T09:00:00Z',
        end: '2026-10-01T14:00:00Z',
        state: 'draft',
        now: '2026-09-29T10:00:00Z',
        registration: {
          entrant: null,
          invitations: [],
          registration_open: false,
          can_register: false,
          asks_code: false,
          refused: null,
          most: 1,
          fewest: 1,
          locks: 'start',
        },
        organises: true,
        tasks: [],
      });
    }
    if (path === '/api/v1/orgs/acme/contests/spring/files/contest.yaml') {
      if (request.method() === 'PUT') {
        state.contestYaml = (request.postDataJSON() as { content: string }).content;
        state.contestSaves += 1;
        return json(route, { version: `v${String(state.contestSaves)}`, notes: [] });
      }
      return json(route, {
        path: 'contest.yaml',
        encoding: 'utf-8',
        content: state.contestYaml,
        token: `token-contest-${String(state.contestSaves)}`,
        upload: null,
        version: '3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d',
      });
    }
    const contest = '/api/v1/orgs/acme/contests/spring';
    if (
      [
        `${contest}/organise/entrants`,
        `${contest}/organise/boards`,
        `${contest}/announcements`,
        `${contest}/clarifications`,
        `${task}/announcements`,
        `${task}/gradings`,
      ].includes(path)
    ) {
      return json(route, []);
    }
    if (path === `${contest}/gradings/queue`) {
      return json(route, { queued: 0, dispatched: 0, failed: state.failed });
    }
    if (path === `${contest}/gradings`) {
      state.feedAsked.push(new URL(request.url()).searchParams.toString());
      return json(route, []);
    }
    if (path === `${task}/workflow-form`) {
      const input = (id: string, type: string, more: object) => ({
        id,
        type,
        contestant: false,
        options: null,
        per_test: false,
        optional: false,
        title: null,
        help: null,
        unit: null,
        ...more,
      });
      return json(route, {
        workflow: 'unicon/classic@v2',
        newer: null,
        problem: null,
        inputs: [
          input('submission', 'file', { contestant: true, title: 'Solution' }),
          input('language', 'enum', {
            contestant: true,
            title: 'Language',
            options: ['c', 'cpp', 'java', 'python'],
          }),
          input('time_limit', 'number', {
            title: 'Time limit',
            unit: 'seconds',
            help: 'The CPU time the program may use on each test.',
          }),
          input('memory_limit', 'number', { title: 'Memory limit', unit: 'MB' }),
        ],
        test: [
          { name: 'input', type: 'file', options: null },
          { name: 'answer', type: 'file', options: null },
        ],
        graded: false,
      });
    }
    if (path === '/api/v1/orgs/acme/contests') {
      return json(route, [
        {
          name: 'spring',
          state: 'draft',
          start: '2026-10-01T09:00:00Z',
          end: '2026-10-01T14:00:00Z',
        },
      ]);
    }
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
            worth: '100',
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
    if (path === `${task}/history`) return json(route, []);
    if (path === `${task}/save` && request.method() === 'POST') {
      state.taskSaves.push(request.postDataJSON());
      state.published += 1;
      return json(route, {
        publication: `pub-${String(state.published)}`,
        number: state.published,
        grading_changed: true,
        changes: ['The time limit changes.'],
        notes: [],
        regraded: 0,
        effect: {
          results_change: false,
          summary: "Nobody's result changes.",
          runs_again: [
            'No submission runs again: there are none yet.',
            'The time limit changes.',
          ],
          scores: ['No score changes.'],
          reading: ['Nothing entrants read changes.'],
        },
      });
    }
    if (path === `${task}/tree`) {
      const folder = new URL(request.url()).searchParams.get('path') ?? '';
      const tree: Record<string, unknown[]> = {
        '': [
          { path: 'statement.md', kind: 'file', size: 30, upload: null },
          { path: 'task.yaml', kind: 'file', size: 120, upload: null },
          { path: 'tests', kind: 'directory', size: null, upload: null },
        ],
        tests: [{ path: 'tests/main', kind: 'directory', size: null, upload: null }],
        'tests/main': [
          { path: 'tests/main/1', kind: 'directory', size: null, upload: null },
        ],
        'tests/main/1': [
          // A small text file's start, as the listing gives it (M67); none for an upload.
          {
            path: 'tests/main/1/input',
            kind: 'file',
            size: 4,
            upload: null,
            start: '1 2',
          },
          {
            path: 'tests/main/1/answer',
            kind: 'file',
            size: 2,
            upload: null,
            start: '3',
          },
          {
            path: 'tests/main/1/expected',
            kind: 'file',
            size: 130,
            upload: { size: 10_485_760, digest: 'ab'.repeat(32) },
            start: null,
          },
        ],
      };
      return json(route, tree[folder] ?? []);
    }
    if (path === `${task}/files/${encodeURIComponent('tests/main/1/expected')}`) {
      // An upload reads as its pointer, at the version that last changed it.
      return json(route, {
        path: 'tests/main/1/expected',
        encoding: 'utf-8',
        content: 'version https://git-lfs.github.com/spec/v1\n',
        token: 'token-expected',
        upload: { size: 10_485_760, digest: 'ab'.repeat(32) },
        version: UPLOADED_AT,
      });
    }
    if (path.startsWith(`${task}/files/tests`)) {
      // A test's file, its path one segment of the address, its slashes encoded.
      const at = decodeURIComponent(path.slice(`${task}/files/`.length));
      return json(route, {
        path: at,
        encoding: 'utf-8',
        content: at.endsWith('/input') ? '1 2\n' : '3\n',
        token: `token-${at}`,
        upload: null,
        version: '3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d',
      });
    }
    if (path === `${task}/files/task.yaml`) {
      return json(route, {
        path: 'task.yaml',
        encoding: 'utf-8',
        content: state.taskYaml,
        token: `token-task-${String(state.published)}`,
        upload: null,
        version: '3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d',
      });
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
          effect: {
            results_change: false,
            summary: "Nobody's result changes.",
            runs_again: [
              'No submission runs again: the tests and how they run are the same.',
            ],
            scores: ['No score changes.'],
            reading: ['The statement changes.'],
          },
        });
      }
      return json(route, {
        path: 'statement.md',
        encoding: 'utf-8',
        content: 'Write the sum.\n',
        token: `token-${String(state.published)}`,
        upload: null,
        version: '3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d',
      });
    }
    return route.fulfill({ status: 404, body: 'not stubbed' });
  });

  return state;
}

test('an organiser makes an org, walks to a task and publishes its statement', async ({
  page,
}) => {
  const state = await stubOrganiserApi(page);
  await page.goto('/orgs');

  await expect(page.getByText('You do not have a role at any org yet.')).toBeVisible();
  await page.getByRole('button', { name: 'New org' }).click();

  const form = page.getByRole('form', { name: 'New org' });
  await form.getByRole('textbox', { name: /^Name/ }).fill('acme');
  await form.getByRole('button', { name: 'Create org' }).click();

  await expect(page).toHaveURL(/\/orgs\/acme$/, { timeout: 10_000 });
  await expect(page.getByRole('heading', { name: 'acme', level: 1 })).toBeVisible();
  await page
    .getByRole('list', { name: 'Contests' })
    .getByRole('link', { name: 'spring' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Spring 2026', level: 1 }),
  ).toBeVisible();
  await page
    .getByRole('list', { name: 'Tasks' })
    .getByRole('link', { name: 'A · sum' })
    .click();

  const standing = page.getByLabel('Where the task stands');
  await expect(standing).toContainText('Entrants are graded on publication 1');
  const sidebar = page.getByRole('navigation', { name: 'Sections' });
  // A task has no Files page: each file is changed on its own card (M51).
  await expect(sidebar.getByRole('link', { name: 'Files' })).toHaveCount(0);
  await sidebar.getByRole('link', { name: 'Statement' }).click();

  await page
    .getByRole('textbox', { name: 'Statement source' })
    .fill('Write the sum of two.\n');
  await page.getByRole('button', { name: 'Save statement' }).click();

  const outcome = page.getByRole('status').filter({
    hasText: 'Saved and published as publication 2.',
  });
  await expect(outcome).toBeVisible();
  expect(state.saved).toMatchObject({
    content: 'Write the sum of two.\n',
    token: 'token-1',
  });
  await expect(standing).toContainText('Entrants are graded on publication 2');

  // An old link to the task's Files page lands on the task's page.
  await page.goto('/orgs/acme/contests/spring/tasks/sum/files?file=statement.md');
  await expect(page).toHaveURL(/\/orgs\/acme\/contests\/spring\/tasks\/sum$/);
  await expect(standing).toBeVisible();

  const trail = page.getByRole('navigation', { name: 'Breadcrumb' });
  await trail.getByRole('link', { name: 'Orgs', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Your orgs' })).toContainText('acme');
});

test('a contest has no Files page: an old link to one lands on its stored settings', async ({
  page,
}) => {
  const state = await stubOrganiserApi(page);
  state.orgMade = true;
  await page.goto('/orgs/acme/contests/spring');
  const sidebar = page.getByRole('navigation', { name: 'Sections' });
  await expect(sidebar.getByRole('link', { name: 'Settings' })).toBeVisible();
  await expect(sidebar.getByRole('link', { name: 'Files' })).toHaveCount(0);

  await page.goto('/orgs/acme/contests/spring/files?file=contest.yaml');
  await expect(page).toHaveURL(/\/orgs\/acme\/contests\/spring\/settings#file$/);
  const stored = page.getByRole('region', { name: 'The settings as stored' });
  await expect(
    stored.getByRole('textbox', { name: 'The contest’s settings' }),
  ).toBeVisible();
  await expect(stored).toBeInViewport();
});

test('an organiser opens a contest from its checklist', async ({ page }) => {
  const state = await stubOrganiserApi(page);
  state.orgMade = true;
  await page.goto('/orgs/acme/contests/spring');

  const status = page.getByRole('region', { name: 'Status' });
  await expect(status).toContainText('Only its organisers can see it.');
  const checklist = status.getByRole('list', { name: 'Before it opens' });
  await expect(checklist).toContainText('A · sum: published');
  await status.getByRole('button', { name: 'Open the contest' }).click();

  const dialog = page.getByRole('dialog', { name: 'Open the contest?' });
  await expect(dialog).toContainText('Anyone signed in can see it.');
  await expect(dialog).toContainText('Registration opens now.');
  await dialog.getByRole('button', { name: 'Open the contest' }).click();

  await expect(status).toContainText('Live');
  expect(state.contestYaml).toContain('state: published');
});

test('an organiser sets a task up on its cards and saves them in one save', async ({
  page,
}) => {
  const state = await stubOrganiserApi(page);
  state.orgMade = true;
  await page.goto('/orgs/acme/contests/spring/tasks/sum');

  const inputs = page.getByRole('region', { name: 'Inputs' });
  const limit = inputs
    .getByRole('group', { name: 'Time limit (seconds)' })
    .getByRole('textbox', { name: /^Time limit/ });
  await expect(limit).toHaveValue('2');
  await limit.fill('3');
  const scoring = page.getByRole('region', { name: 'Tests and scoring' });
  await expect(scoring.getByRole('group', { name: 'main' })).toContainText(
    'Its one test earns 100 points when it passes.',
  );

  const bar = page.getByRole('region', { name: 'Save the task' });
  await expect(bar.getByRole('list', { name: 'What changed' })).toContainText(
    'Inputs: Time limit (seconds)',
  );
  await bar.getByRole('button', { name: 'Save' }).click();

  const answer = bar.getByRole('status');
  await expect(answer).toContainText('Saved and published as publication 2.');
  await expect(answer.getByRole('list', { name: 'Runs again' })).toContainText(
    'The time limit changes.',
  );
  await expect(answer).not.toContainText('It changes how the task grades');
  const [saved] = state.taskSaves as { changes: { path: string; content: string }[] }[];
  expect(saved?.changes.map((change) => change.path)).toEqual(['task.yaml']);
  expect(saved?.changes[0]?.content).toContain('time_limit: 3');
});

test('an organiser follows the failed gradings from the contest page', async ({
  page,
}) => {
  const state = await stubOrganiserApi(page);
  state.orgMade = true;
  state.failed = 2;
  await page.goto('/orgs/acme/contests/spring');

  const failed = page.getByRole('region', { name: 'Failed gradings' });
  await expect(failed).toContainText("2 gradings failed on Unicon's side.");
  await failed.getByRole('link', { name: 'Show the failed gradings' }).click();

  await expect(page).toHaveURL(/\/gradings\?status=system_error&latest=true$/);
  await expect(
    page.getByRole('checkbox', { name: 'Latest attempts only' }),
  ).toBeChecked();
  await expect(page.getByLabel('Queue')).toContainText('Failed2');
  await expect(page.getByText('No grading matches these filters.')).toBeVisible();
  expect(state.feedAsked).toContain('status=system_error&latest=true');
});

test('an organiser reads a test in place, its parts side by side, and is told how to name test files', async ({
  page,
}) => {
  const state = await stubOrganiserApi(page);
  state.orgMade = true;
  await page.goto('/orgs/acme/contests/spring/tasks/sum');

  const scoring = page.getByRole('region', { name: 'Tests and scoring' });
  const row = scoring.getByRole('listitem', { name: 'Test 1' });
  await expect(row).toContainText('Test 1 · 1 2 → 3 → expected 10 MB');
  await row.getByRole('button', { name: /Test 1/ }).click();
  const view = row.getByRole('region', { name: 'What test 1 holds' });
  await expect(view.getByLabel('What input holds')).toHaveText('1 2');
  await expect(view.getByLabel('What answer holds')).toHaveText('3');
  const input = await view.getByRole('region', { name: 'input' }).boundingBox();
  const answer = await view.getByRole('region', { name: 'answer' }).boundingBox();
  expect(answer?.x ?? 0).toBeGreaterThan((input?.x ?? 0) + (input?.width ?? 0) - 1);
  expect(Math.abs((answer?.y ?? 0) - (input?.y ?? 0))).toBeLessThan(2);

  // An uploaded part downloads whole through the download door (#444).
  await page.route('**/-/downloads/**', (route) =>
    route.fulfill({
      status: 200,
      headers: { 'Content-Disposition': 'attachment; filename="expected"' },
      body: '3\n',
    }),
  );
  const expected = view.getByRole('region', { name: 'expected' });
  await expect(expected).toContainText(
    'It was uploaded, so it is shown by its size rather than as text.',
  );
  const download = expected.getByRole('link', { name: 'Download expected' });
  await expect(download).toHaveAttribute(
    'href',
    `/-/downloads/acme/spring/sum/versions/${UPLOADED_AT}/tests/main/1/expected`,
  );
  const [saved] = await Promise.all([page.waitForEvent('download'), download.click()]);
  expect(saved.suggestedFilename()).toBe('expected');

  await scoring.getByRole('button', { name: 'Add tests', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add tests' });
  await dialog.getByRole('radio', { name: 'Many files at once' }).check();
  await expect(dialog.getByLabel('How to name the files')).toContainText(
    "Name them like 1.in (test 1's input) and 1.out (test 1's answer).",
  );
  await expect(dialog.getByRole('button', { name: 'Add tests' })).toBeDisabled();
  await expect(dialog).toContainText('Drop files above to see the tests they make.');
});
