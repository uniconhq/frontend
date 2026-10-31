import { specCatalogue } from '../src/features/organise/formula/catalogue';
import { expect, test, type Page, type Route } from '@playwright/test';
import type { components } from '../src/api/schema';

type Schemas = components['schemas'];

/** The version the uploaded part of test 1 was last changed at. */
const UPLOADED_AT = 'a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6a7b8c9d0';

/**
 * The inputs a task's form reads of unicon/classic@v4, titled for the form
 * (#434), with no steps: a stand-in, not deploy's, which names the solution
 * `code`, a folder, and has an input and an answer.
 */
const CLASSIC = `inputs:
  submission: {type: file, title: Solution}
  language: {type: enum, options: [c, cpp, java, python], title: Language}
  time_limit: {type: number, title: Time limit, unit: seconds, help: The CPU time the program may use on each run.}
  memory_limit: {type: number, title: Memory limit, unit: MB}
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
      'name: Sum\nworkflow: unicon/classic@v4\ninputs:\n  submission: {entrant: {label: Your solution}}\n  language: {entrant: {options: [python]}}\n  time_limit: 2\n  memory_limit: 256\n',
    taskSaves: [] as unknown[],
    /** How many gradings failed and wait, as the queue counts them. */
    failed: 0,
    /** The feed's queries, each as the page asked it. */
    feedAsked: [] as string[],
  };

  const taskState = (): Schemas['TaskState'] => ({
    head: `head-${String(state.published)}`,
    latest: {
      number: state.published,
      version: `head-${String(state.published)}`,
      grading_changed: state.published === 1,
      changes: [],
      at: '2026-09-29T09:00:00Z',
      check: null,
      failed_checks: [],
    },
    draft: false,
    errors: [],
    statement_written: true,
    head_statement_written: true,
    results: { released: false, history: [] },
  });

  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });

  await page.route('**/api/v1/time', (route) =>
    json(route, { now: '2026-09-29T10:00:00Z' } satisfies Schemas['ServerTime']),
  );
  await page.route('**/api/v1/workflows', (route) =>
    json(route, [
      {
        owner: 'unicon',
        name: 'classic',
        versions: ['v4'],
        editable: false,
        visibility: 'public',
      },
    ] satisfies Schemas['WorkflowItem'][]),
  );
  await page.route('**/api/v1/workflows/unicon/classic/versions/v4', (route) =>
    json(route, { content: CLASSIC }),
  );
  await page.route('**/api/v1/blocks', (route) => json(route, specCatalogue()));
  await page.route('**/api/v1/workflows/unicon/classic/versions/v4/box', (route) =>
    json(route, {
      run: true,
      newer_version: null,
      description: null,
      inputs: [],
      outputs: [],
    } satisfies Schemas['WorkflowBox']),
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
    } satisfies Schemas['Me']),
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
      const input = (
        id: string,
        type: string,
        more: Partial<Schemas['DeclaredInput']>,
      ): Schemas['DeclaredInput'] => ({
        id,
        type,
        options: null,
        optional: false,
        title: null,
        help: null,
        unit: null,
        ...more,
      });
      return json(route, {
        workflow: 'unicon/classic@v4',
        newer: null,
        problem: null,
        inputs: [
          input('submission', 'file', { title: 'Solution' }),
          input('language', 'enum', {
            title: 'Language',
            options: ['c', 'cpp', 'java', 'python'],
          }),
          input('time_limit', 'number', {
            title: 'Time limit',
            unit: 'seconds',
            help: 'The CPU time the program may use on each run.',
          }),
          input('memory_limit', 'number', { title: 'Memory limit', unit: 'MB' }),
        ],
        graded: false,
        text_values: null,
      } satisfies Schemas['WorkflowForm']);
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
            closes: '2026-10-01T14:00:00Z',
          },
          submissions: 0,
          take_out: null,
          withdrawn: false,
        },
      ] satisfies Schemas['TaskStanding'][]);
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
        number: state.published,
        grading_changed: true,
        check: null,
        regrade: null,
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
      } satisfies Schemas['Published']);
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
  await expect(checklist).toContainText('A · Sum: published');
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
  await expect(page.getByRole('region', { name: 'Runs' })).toContainText(
    'A submission runs once, since nothing changes from run to run.',
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
  await expect(page.getByRole('group', { name: 'Failed gradings' })).toContainText(
    '2 gradings failed on Unicon’s side.',
  );
  await expect(page.getByText('No grading matches these filters.')).toBeVisible();
  expect(state.feedAsked).toContain('status=system_error&latest=true');
});

test('an organiser reads how many submissions a task takes', async ({ page }) => {
  const state = await stubOrganiserApi(page);
  state.orgMade = true;
  await page.goto('/orgs/acme/contests/spring/tasks/sum');

  const submissions = page.getByRole('region', { name: 'Submissions' });
  await expect(
    submissions.getByRole('textbox', { name: 'Most submissions' }),
  ).toHaveValue('');
  await expect(submissions).toContainText(
    'How many times each entrant may submit, and how often.',
  );
  await expect(
    submissions.getByRole('textbox', { name: 'Most submissions' }),
  ).toHaveAttribute('placeholder', '50');
});

test('an organiser ticks the named runs of a group and keeps its shown setting on rename', async ({
  page,
}) => {
  const state = await stubOrganiserApi(page);
  state.orgMade = true;
  state.taskYaml += `repeat:
  - inputs: [input]
    tuples:
      - {title: Sample 1, input: samples/1.in}
      - {input: small/1.in}
scoring:
  groups:
    samples: {input: samples/1.in}
  show:
    now: [samples]
`;
  await page.goto('/orgs/acme/contests/spring/tasks/sum');
  const groups = page.getByRole('table', { name: 'Groups', exact: true });
  await groups
    .getByRole('checkbox', { name: 'small/1.in in samples', exact: true })
    .check();
  await expect(
    groups.getByRole('checkbox', { name: 'Sample 1 in samples', exact: true }),
  ).toBeChecked();
  await groups
    .getByRole('textbox', { name: 'Name of samples', exact: true })
    .fill('tests');
  await groups
    .getByRole('textbox', { name: 'Name of tests', exact: true })
    .press('Tab');
  await expect(
    groups.getByRole('combobox', { name: 'When tests is shown', exact: true }),
  ).toHaveValue('now');
});

test('the result flow goes to a value’s only formula and reads its shown setting', async ({
  page,
}) => {
  const state = await stubOrganiserApi(page);
  state.orgMade = true;
  state.taskYaml += `repeat:
  - inputs: [input]
    tuples: [{input: sample.in}]
scoring:
  groups: {samples: {input: sample.in}}
  values: {points: 1}
`;
  await page.goto('/orgs/acme/contests/spring/tasks/sum');
  const result = page.getByRole('list', { name: 'Result', exact: true });
  await expect(result.getByText('points', { exact: true })).toBeVisible();
  await expect(result.getByText('samples', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'points number', exact: true }).click();
  await expect(
    page.getByRole('textbox', { name: 'points', exact: true }),
  ).toBeFocused();
  await expect(page.getByRole('textbox', { name: 'points', exact: true })).toHaveCount(
    1,
  );
  const card = page.getByRole('group', { name: 'Value points', exact: true });
  await card
    .getByRole('combobox', { name: 'Shown to entrants', exact: true })
    .selectOption('after_close');
  await expect(
    result.getByRole('listitem').filter({ hasText: /^points/ }),
  ).toContainText('After the close');
  await expect(page.locator('[data-show-part="points"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'samples group', exact: true }).click();
  await expect(page.locator('[id="group-samples"]')).toHaveAttribute(
    'data-marked',
    'true',
  );
});

test('the Runs card pairs files, lines up its cells, and gives a cell to the entrant through its menu', async ({
  page,
}) => {
  const state = await stubOrganiserApi(page);
  state.orgMade = true;
  state.taskYaml += 'repeat:\n  - inputs: [input, answer]\n    tuples: []\n';
  await page.route(
    '**/api/v1/orgs/acme/contests/spring/tasks/sum/files/runs*',
    (route) =>
      route.fulfill({
        status: 404,
        contentType: 'application/problem+json',
        body: JSON.stringify({
          type: 'about:blank',
          title: 'Not found',
          status: 404,
          detail: 'not_found',
          code: 'not_found',
        }),
      }),
  );
  await page.route(
    '**/api/v1/orgs/acme/contests/spring/tasks/sum/workflow-form',
    (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          workflow: 'unicon/classic@v4',
          newer: null,
          problem: null,
          graded: false,
          text_values: [],
          inputs: ['input', 'answer'].map((id) => ({
            id,
            type: 'file',
            title: id,
            help: null,
            unit: null,
            options: null,
            optional: false,
          })),
        }),
      }),
  );
  await page.route('**/api/v1/workflows/unicon/classic/versions/v4', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        content: CLASSIC.replace(
          'inputs:\n',
          'inputs:\n  input: file\n  answer: file\n',
        ),
      }),
    }),
  );
  await page.goto('/orgs/acme/contests/spring/tasks/sum');
  const runs = page.getByRole('region', { name: 'Runs', exact: true });
  await runs.getByLabel('Add files', { exact: true }).setInputFiles([
    { name: '1.in', mimeType: 'text/plain', buffer: Buffer.from('1') },
    { name: '1.ans', mimeType: 'text/plain', buffer: Buffer.from('2') },
  ]);
  await runs.getByRole('button', { name: 'Add these', exact: true }).click();
  await expect(runs.getByText('New', { exact: true })).toHaveCount(2);
  const cells = await runs
    .getByRole('table', { name: 'Runs', exact: true })
    .locator('tbody tr')
    .first()
    .locator('td')
    .evaluateAll((cells: { getBoundingClientRect: () => { height: number } }[]) =>
      cells.map((cell) => cell.getBoundingClientRect().height),
    );
  expect(Math.max(...cells) - Math.min(...cells)).toBeLessThan(1);
  expect(Math.max(...cells)).toBeLessThanOrEqual(45);
  await runs
    .getByRole('button', { name: 'Actions for row 1 answer', exact: true })
    .click();
  await page
    .getByRole('menuitem', { name: 'The entrant gives this one', exact: true })
    .click();
  await expect(
    runs.getByText('The entrant gives it · up to 10 MB', { exact: true }),
  ).toBeVisible();
});

test('an old queue bookmark opens Marking and keeps its query', async ({ page }) => {
  const state = await stubOrganiserApi(page);
  state.orgMade = true;
  await page.route(
    '**/api/v1/orgs/acme/contests/spring/tasks/sum/organise/queue',
    (route) => route.fulfill({ json: [] }),
  );
  await page.goto('/orgs/acme/contests/spring/tasks/sum/queue?unmarked=true');
  await expect(page).toHaveURL(/\/marking\?unmarked=true$/);
  await expect(
    page.getByRole('heading', { name: 'Marking', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Nothing is waiting for a mark.')).toBeVisible();
});

test('a new workflow asks only for its owner and name and opens an empty draft', async ({
  page,
}) => {
  await stubOrganiserApi(page);
  const message = 'A workflow needs at least one step. Add one from the tray.';
  let made: unknown = null;
  await page.route('**/api/v1/workflows', async (route) => {
    if (route.request().method() === 'POST') {
      made = route.request().postDataJSON();
      return route.fulfill({ status: 201, json: { owner: 'kenny', name: 'empty' } });
    }
    return route.fulfill({ json: [] });
  });
  await page.route('**/api/v1/workflows/kenny/empty', (route) =>
    route.fulfill({
      json: {
        owner: 'kenny',
        name: 'empty',
        visibility: 'private',
        versions: [],
        editable: true,
        readers: [],
        draft: { content: 'steps: []\n', token: 'empty-token', revision: 'empty-head' },
      },
    }),
  );
  await page.route('**/api/v1/workflows/kenny/empty/tree**', (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route('**/api/v1/workflows/check', (route) =>
    route.fulfill({ json: { problems: [{ path: 'steps', message }] } }),
  );
  await page.goto('/workflows');
  await page.getByRole('button', { name: 'New workflow', exact: true }).click();
  const form = page.getByRole('form', { name: 'New workflow' });
  await expect(form.getByRole('combobox')).toHaveCount(1);
  await expect(form.getByRole('textbox')).toHaveCount(1);
  await expect(form.getByRole('radio')).toHaveCount(0);
  await form.getByRole('textbox', { name: /Name/ }).fill('empty');
  await form.getByRole('button', { name: 'Create workflow' }).click();
  await expect(page).toHaveURL(/\/workflows\/kenny\/empty$/);
  await expect(page.getByText(message, { exact: false })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Add to the workflow' })).toBeVisible();
  await expect(page.getByRole('group', { name: /^Step / })).toHaveCount(0);
  expect(made).toEqual({ owner: 'kenny', name: 'empty' });
});

test('long run paths and report titles stay within the page and their Result rows', async ({
  page,
}) => {
  const state = await stubOrganiserApi(page);
  state.orgMade = true;
  const path = `tests/${'z'.repeat(240)}/1.in`;
  state.taskYaml = `name: Islands\nworkflow: unicon/classic@v4\nrepeat:\n  - inputs: [input]\n    tuples: [{input: ${path}}]\nscoring:\n  groups: {samples: {input: ${path}}}\n`;
  const outputs = Array.from({ length: 12 }, (_, index) => ({
    name: `out_${index}`,
    title: `Detailed report number ${index} from the program being tested`,
    type: 'number',
    unit: 'seconds',
    better: null,
    at_least: null,
    at_most: null,
  }));
  await page.route(
    '**/api/v1/orgs/acme/contests/spring/tasks/sum/workflow-form',
    (route) =>
      route.fulfill({
        json: {
          workflow: 'unicon/classic@v4',
          newer: null,
          problem: null,
          graded: false,
          text_values: [],
          inputs: [
            {
              id: 'input',
              type: 'file',
              title: 'Input',
              help: null,
              unit: null,
              options: null,
              optional: false,
            },
          ],
        },
      }),
  );
  await page.route('**/api/v1/workflows/unicon/classic/versions/v4', (route) =>
    route.fulfill({
      json: {
        content:
          'inputs: {input: file}\nsteps: []\noutputs:\n' +
          outputs
            .map(
              (output) =>
                `  ${output.name}: {from: 1, title: ${output.title}, unit: seconds}`,
            )
            .join('\n'),
      },
    }),
  );
  await page.route('**/api/v1/workflows/unicon/classic/versions/v4/box', (route) =>
    route.fulfill({
      json: { run: true, inputs: [], outputs, newer_version: null, description: null },
    }),
  );
  await page.setViewportSize({ width: 760, height: 1000 });
  await page.goto('/orgs/acme/contests/spring/tasks/sum');
  await expect(
    page.getByRole('table', { name: 'What one submission gives' }),
  ).toBeVisible();
  expect(
    await page
      .locator('html')
      .evaluate((el: { scrollWidth: number }) => el.scrollWidth),
  ).toBeLessThanOrEqual(760);
  const result = page.getByRole('list', { name: 'Result', exact: true });
  const detail = result.locator('[class*="resultParts"]').first();
  await expect(detail).toBeVisible();
  const sizes = await detail.evaluate(
    (el: {
      getBoundingClientRect: () => { bottom: number };
      parentElement: { getBoundingClientRect: () => { bottom: number } } | null;
    }) => ({
      detail: el.getBoundingClientRect().bottom,
      row: el.parentElement?.getBoundingClientRect().bottom ?? 0,
    }),
  );
  expect(sizes.detail).toBeLessThanOrEqual(sizes.row);
  await detail.focus();
  await detail.press('Space');
  await expect
    .poll(() => detail.evaluate((element: { scrollTop: number }) => element.scrollTop))
    .toBeGreaterThan(0);
});

test('Islands explains formula shapes and inserts a tile without offering its own value', async ({
  page,
}) => {
  const state = await stubOrganiserApi(page);
  state.orgMade = true;
  state.taskYaml =
    state.taskYaml.replace('name: Sum', 'name: Islands') +
    `repeat:
  - inputs: [input]
    tuples:
      - {input: small/1.in}
      - {input: small/2.in}
      - {input: small/3.in}
scoring:
  groups: {small: {input: [small/1.in, small/2.in, small/3.in]}}
  values: {points: 1}
`;
  await page.route('**/api/v1/workflows/unicon/classic/versions/v4', (route) =>
    route.fulfill({
      json: { content: CLASSIC + 'outputs: {score: 1, time_ms: 1}\n' },
    }),
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/orgs/acme/contests/spring/tasks/sum');
  const card = page.getByRole('group', { name: 'Value points', exact: true });
  const line = card.getByRole('textbox', { name: 'points', exact: true });
  await line.click();
  await expect(
    card.getByRole('button', { name: 'points one number', exact: true }),
  ).toHaveCount(0);
  await expect(
    card.getByRole('button', { name: 'small a group · 3 runs', exact: true }),
  ).toBeVisible();
  await line.press('Home');
  const tile = card.getByRole('button', {
    name: 'sum(…) numbers → one number',
    exact: true,
  });
  await tile.hover();
  const help = page.getByRole('tooltip');
  await expect(help).toContainText('sum(small.score)');
  await expect(help).toContainText("a column summed over a group's runs");
  await expect(help).toContainText('Takes');
  await expect(help).toContainText('Gives');
  const bounds = await help.boundingBox();
  const lineBounds = await line.boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(lineBounds!.y + lineBounds!.height);
  await expect(line).toBeFocused();
  await line.press('Escape');
  await expect(help).toHaveCount(0);
  await line.hover();
  await tile.hover();
  await expect(help).toBeVisible();
  for (const text of await card.locator('[class*="paletteItem"]').all()) {
    expect(
      await text.evaluate(
        (element: { scrollWidth: number; clientWidth: number }) =>
          element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
  }
  await tile.focus();
  await expect(help).toBeVisible();
  await expect(tile).toBeFocused();
  await tile.press('Escape');
  await expect(help).toHaveCount(0);
  await tile.click();
  await expect(line).toHaveText('sum()1');
  await line.fill('');
  await expect(card.getByText('empty', { exact: true })).toBeVisible();
  await card.getByRole('button', { name: 'Total score sum(all.score)' }).click();
  await expect(line).toHaveText('sum(all.score)');
  await page.setViewportSize({ width: 1440, height: 420 });
  const min = card.getByRole('button', {
    name: 'min(…) numbers → one number',
    exact: true,
  });
  await min.scrollIntoViewIfNeeded();
  await min.evaluate(
    (element: {
      getBoundingClientRect: () => { bottom: number };
      ownerDocument: {
        defaultView: {
          innerHeight: number;
          scrollBy: (x: number, y: number) => void;
        } | null;
      };
    }) => {
      const view = element.ownerDocument.defaultView;
      if (view !== null)
        view.scrollBy(
          0,
          element.getBoundingClientRect().bottom - view.innerHeight + 12,
        );
    },
  );
  await min.hover();
  await expect(help).toBeVisible();
  expect((await help.boundingBox())!.height).toBeGreaterThan(200);
  await min.focus();
  await min.press('PageDown');
  expect(
    await help.evaluate((element: { scrollTop: number }) => element.scrollTop),
  ).toBeGreaterThan(0);
  await expect(min).toBeFocused();
});

test.describe('a formula tray on a touch screen', () => {
  test.use({ hasTouch: true });
  test('the information button explains a tile and the tile inserts once', async ({
    page,
  }) => {
    const state = await stubOrganiserApi(page);
    state.orgMade = true;
    state.taskYaml += 'scoring: {values: {points: 1}}\n';
    await page.setViewportSize({ width: 760, height: 1000 });
    await page.goto('/orgs/acme/contests/spring/tasks/sum');
    const card = page.getByRole('group', { name: 'Value points', exact: true });
    const line = card.getByRole('textbox', { name: 'points', exact: true });
    await line.tap();
    const about = card.getByRole('button', { name: 'About sum(…)', exact: true });
    await expect(about).toBeVisible();
    await about.tap();
    await expect(page.getByRole('tooltip')).toContainText('Takes');
    await expect(line).toHaveText('1');
    await card
      .getByRole('button', { name: 'sum(…) numbers → one number', exact: true })
      .tap();
    await expect(line).toHaveText('1sum()');
  });
});
