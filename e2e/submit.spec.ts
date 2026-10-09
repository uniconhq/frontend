import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * The contestant submitting from a task page against the dev server with the
 * API and the object store stubbed, so it needs no backend: the panel shows a
 * drop zone per file input and a choice per enum, a file goes to the store as
 * the slot says, a folder's files by their paths in it, and one submission
 * comes of them, the list follows it from queued to its outcome, a submission
 * opens with what the task shows of it and the files it was made with to
 * download, and each refusal is said in words.
 * The stub keeps just enough state for each answer to follow from the last.
 */
const TASK = '/api/v1/orgs/acme/contests/spring/tasks/sum';
const OPEN = { released: true, visible: true, open: true, closed: null };

const input = (overrides: Record<string, unknown>) => ({
  id: 'submission',
  type: 'file',
  label: 'Your solution',
  options: null,
  per_test: false,
  default: null,
  min: null,
  max: null,
  max_size: 10485760,
  ...overrides,
});

const LANGUAGE = input({
  id: 'language',
  type: 'enum',
  label: 'Language',
  options: ['python', 'cpp'],
});

const THREE_INPUTS = [
  input({}),
  LANGUAGE,
  input({ id: 'program', type: 'folder', label: 'Your program' }),
];

const queued = {
  id: '5d2f0c1e-0000-4000-8000-000000000001',
  attempt: 1,
  status: 'queued',
  stopped: null,
  outcome: null,
  groups: [],
  values: { numbers: {}, texts: {} },
  reason: null,
  points: null,
  factor: null,
  folded: {},
};

const ranTest = (name: string, outcome: string, timeMs: string, credit: string) => ({
  test: name,
  outcome,
  values: { numbers: { time_ms: timeMs }, texts: {} },
  credit,
  best: null,
});

const graded = {
  ...queued,
  status: 'done',
  outcome: 'wrong_answer',
  values: { numbers: {}, texts: { log: 'Compiled cleanly.' } },
  points: { shown: '0', pending: '100', pending_until: '2026-09-29T12:00:00Z' },
  factor: '1',
  groups: [
    {
      group: 'samples',
      show: 'always',
      outcome: 'wrong_answer',
      tests: [
        ranTest('samples/1', 'accepted', '12', '1'),
        ranTest('samples/2', 'wrong_answer', '30', '0'),
      ],
      shown_at: null,
      ran: true,
      points: '0',
      max: '0',
    },
    {
      group: 'main',
      show: 'after_close',
      outcome: null,
      tests: null,
      shown_at: '2026-09-29T12:00:00Z',
      ran: true,
      points: null,
      max: '100',
    },
  ],
};

type Submission = {
  number: number;
  submitted_at: string;
  late_days: number;
  grading: unknown;
};

type State = {
  inputs: unknown[];
  submissions: Submission[];
  /** How often each submission has been read, so its grading can move on. */
  reads: number;
  /** Each slot asked for, as the browser described its file. */
  slots: { input: string; filename: string }[];
  /** Each file put through the upload door, as its bytes arrived. */
  sent: string[];
  completed: unknown[];
  submits: { idempotency_key: string; inputs: unknown }[];
  refusal: { status: number; code: string; extra: Record<string, unknown> } | null;
  /** The forge already holds the file, so the slot has nothing to send. */
  alreadyHeld: boolean;
};

async function stubApi(page: Page, overrides: Partial<State> = {}): Promise<State> {
  const state: State = {
    inputs: [input({}), LANGUAGE],
    submissions: [],
    reads: 0,
    slots: [],
    sent: [],
    completed: [],
    submits: [],
    refusal: null,
    alreadyHeld: false,
    ...overrides,
  };
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

  await page.route('**/-/uploads/*', async (route) => {
    state.sent.push(route.request().postData() ?? '');
    return route.fulfill({ status: 200 });
  });

  /** Each submission's grading moves on as it is read: queued, then graded. */
  const movedOn = (submission: Submission): Submission =>
    state.reads < 3 ? submission : { ...submission, grading: graded };

  await page.route(`**${TASK}/**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.slice(TASK.length);

    if (path === '/page') {
      return json(route, {
        name: 'sum',
        label: 'A',
        title: 'Sum of Two',
        worth: '100',
        statement: '# Sum\n\nPrint the sum of two numbers.\n',
        submissions: { max: 50, rate: { count: 1, per: 30 } },
        inputs: state.inputs,
        release: OPEN,
        due: null,
        closes: '2026-09-29T12:00:00Z',
        marks: null,
      });
    }
    if (path === '/uploads') {
      state.slots.push(request.postDataJSON() as State['slots'][number]);
      const number = state.completed.length + 1;
      const id = `00000000-0000-4000-8000-00000000000${number}`;
      return json(
        route,
        {
          id,
          url: state.alreadyHeld ? null : `/-/uploads/${id}`,
          ready: state.alreadyHeld,
          expires_at: '2026-09-29T10:15:00Z',
        },
        201,
      );
    }
    const completing = /^\/uploads\/([^/]+)\/complete$/.exec(path);
    if (completing !== null) {
      state.completed.push(request.postDataJSON());
      return json(route, {
        id: completing[1],
        input: 'submission',
        filename: 'main.py',
        content_type: null,
        declared_size: 1,
        size: 1,
        sha256: 'ab',
        status: 'verified',
      });
    }
    if (path === '/submissions' && request.method() === 'POST') {
      const body = request.postDataJSON() as State['submits'][number];
      state.submits.push(body);
      if (state.refusal !== null) {
        const { status, code, extra } = state.refusal;
        return route.fulfill({
          status,
          contentType: 'application/problem+json',
          body: JSON.stringify({
            type: 'about:blank',
            title: code,
            status,
            detail: code,
            code,
            ...extra,
          }),
        });
      }
      // Made now, as the backend would: the page asks for a verdict more
      // often the newer the submission waiting on one is.
      const made = {
        number: state.submissions.length + 1,
        submitted_at: new Date().toISOString(),
        late_days: 0,
        grading: queued,
      };
      state.submissions.push(made);
      state.reads = 0;
      return json(route, made, 201);
    }
    if (path === '/submissions') {
      state.reads += 1;
      return json(route, [...state.submissions].reverse().map(movedOn));
    }
    const one = /^\/submissions\/(\d+)$/.exec(path);
    if (one !== null) {
      const found = state.submissions.find((entry) => entry.number === Number(one[1]));
      return found === undefined
        ? route.fulfill({ status: 404, body: 'not stubbed' })
        : json(route, found);
    }
    if (/^\/submissions\/\d+\/files$/.test(path)) {
      return json(route, {
        number: 1,
        inputs: {
          submission: { files: ['files/submission/main.cpp'], value: null },
          language: { files: [], value: 'cpp' },
        },
      });
    }
    return route.fulfill({ status: 404, body: 'not stubbed' });
  });
  return state;
}

const PAGE = '/contests/acme/spring/tasks/sum';

test('a task with a file, a choice and a folder shows a field for each', async ({
  page,
}) => {
  await stubApi(page, { inputs: THREE_INPUTS });
  await page.goto(PAGE);

  const form = page.getByRole('form', { name: 'Submit' });
  await expect(form.locator('input[type="file"]')).toHaveCount(3);
  await expect(form.getByLabel('Your solution', { exact: true })).toBeAttached();
  await expect(form.getByLabel('Your program', { exact: true })).toHaveAttribute(
    'multiple',
  );
  await expect(
    form.getByLabel('Your program: a folder', { exact: true }),
  ).toHaveAttribute('webkitdirectory');
  await expect(form.getByRole('combobox', { name: 'Language' })).toBeVisible();
});

test('a task whose enum has one option says which, with nothing to choose', async ({
  page,
}) => {
  await stubApi(page, {
    inputs: [input({}), { ...LANGUAGE, label: 'language', options: ['python'] }],
  });
  await page.goto(PAGE);

  const form = page.getByRole('form', { name: 'Submit' });
  await expect(form.getByText('language: python')).toBeVisible();
  await expect(form.getByRole('combobox')).toHaveCount(0);
});

test('a full pass sends the files as the slot says and makes one submission', async ({
  page,
}, testInfo) => {
  const folder = testInfo.outputPath('program');
  for (const [path, content] of [
    ['Main.java', 'class Main {}\n'],
    ['lib/Util.java', 'class Util {}\n'],
  ] as const) {
    const file = `${folder}/${path}`;
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, content);
  }
  const state = await stubApi(page, { inputs: THREE_INPUTS });
  await page.goto(PAGE);

  const form = page.getByRole('form', { name: 'Submit' });
  await form.getByLabel('Your solution', { exact: true }).setInputFiles({
    name: 'main.py',
    mimeType: 'text/x-python',
    buffer: Buffer.from('print(sum(map(int, input().split())))\n'),
  });
  await form
    .getByLabel('Your program: a folder', { exact: true })
    .setInputFiles(folder);
  await expect(form.getByLabel('Your program: files chosen')).toContainText(
    'lib/Util.java',
  );
  await form.getByRole('combobox', { name: 'Language' }).selectOption('python');
  await form.getByRole('button', { name: 'Submit' }).dblclick();

  await expect(page.getByText('Submitted as #1.')).toBeVisible();
  expect(state.slots.map((slot) => `${slot.input}:${slot.filename}`).sort()).toEqual([
    'program:Main.java',
    'program:lib/Util.java',
    'submission:main.py',
  ]);
  expect(state.submits).toHaveLength(1);
  expect(state.submits[0]?.idempotency_key).toMatch(/^[A-Za-z0-9_-]{8,128}$/);
  expect(state.submits[0]?.inputs).toEqual({
    submission: { uploads: ['00000000-0000-4000-8000-000000000001'] },
    language: { uploads: [], value: 'python' },
    program: {
      uploads: [
        '00000000-0000-4000-8000-000000000002',
        '00000000-0000-4000-8000-000000000003',
      ],
    },
  });

  // One PUT per file, the file itself as the body and nothing around it.
  expect(state.sent).toHaveLength(3);

  const list = page.getByRole('table', { name: 'Your submissions' });
  await expect(list.getByText('QUEUED')).toBeVisible();
  await expect(list.getByText('WRONG ANSWER')).toBeVisible({ timeout: 15_000 });
});

test('a file the forge already holds is submitted without being sent', async ({
  page,
}) => {
  // The commit names bytes by their hash, so a file the forge has is one it
  // needs no copy of: the slot comes back ready and the browser sends nothing.
  const state = await stubApi(page, { alreadyHeld: true });
  await page.goto(PAGE);

  await page.getByLabel('Your solution', { exact: true }).setInputFiles({
    name: 'main.py',
    mimeType: 'text/x-python',
    buffer: Buffer.from('0123456789'),
  });
  await page.getByRole('combobox', { name: 'Language' }).selectOption('cpp');
  await page.getByRole('button', { name: 'Submit' }).click();

  await expect(page.getByText('Submitted as #1.')).toBeVisible();
  expect(state.sent).toEqual([]);
  expect(state.completed).toHaveLength(1);
});

test('a submission opens with its log, its groups and their tests', async ({
  page,
}) => {
  await stubApi(page, {
    submissions: [
      {
        number: 1,
        submitted_at: '2026-09-29T09:30:00Z',
        late_days: 0,
        grading: graded,
      },
    ],
  });
  await page.goto(PAGE);

  await page.getByRole('link', { name: '#1' }).click();
  await expect(page).toHaveURL(/\?submission=1$/);
  const detail = page.getByRole('region', { name: 'Submission 1' });
  await expect(detail.getByLabel('log', { exact: true })).toHaveText(
    'Compiled cleanly.',
  );
  const rows = detail.getByRole('table', { name: 'Tests samples' }).getByRole('row');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(2)).toContainText('WRONG ANSWER');
  const main = detail.getByRole('region', { name: 'Group main' });
  await expect(main.getByText(/^Shown at /)).toBeVisible();
  await expect(main.getByRole('table')).toHaveCount(0);
});

test('a submission that did not compile shows that as its verdict', async ({
  page,
}) => {
  await stubApi(page, {
    submissions: [
      {
        number: 1,
        submitted_at: '2026-09-29T09:30:00Z',
        late_days: 0,
        grading: {
          ...queued,
          status: 'done',
          stopped: 'compile_error',
          values: { numbers: {}, texts: { log: 'main.cpp:1: error' } },
        },
      },
    ],
  });
  await page.goto(`${PAGE}?submission=1`);

  await expect(
    page.getByRole('table', { name: 'Your submissions' }).getByText('COMPILE ERR'),
  ).toBeVisible();
  const detail = page.getByRole('region', { name: 'Submission 1' });
  await expect(detail.getByText('COMPILE ERR')).toBeVisible();
  await expect(detail.getByLabel('log', { exact: true })).toHaveText(
    'main.cpp:1: error',
  );
  await expect(detail.getByRole('table')).toHaveCount(0);
});

test('an earlier submission lists its files, each a download through the door', async ({
  page,
}) => {
  await stubApi(page, {
    submissions: [
      {
        number: 1,
        submitted_at: '2026-09-29T09:30:00Z',
        late_days: 0,
        grading: graded,
      },
    ],
  });
  await page.goto(`${PAGE}?submission=1`);

  await expect(page.getByRole('link', { name: 'main.cpp' })).toHaveAttribute(
    'href',
    '/-/downloads/acme/spring/sum/1/files/submission/main.cpp',
  );
});

const REFUSALS: [string, number, Record<string, unknown>, string][] = [
  ['task_closed', 403, { reason: 'closed' }, 'This task has closed for you'],
  ['archived', 403, {}, 'The contest is archived'],
  ['not_approved', 403, {}, 'You are not a contestant here yet'],
  ['submission_limit', 409, { limit: 50 }, 'This task takes 50 submissions in all'],
  [
    'rate_limited',
    429,
    { rate: '1 per 30s', retry_at: '2999-09-29T10:00:30Z' },
    'You can submit again at',
  ],
  [
    'too_large',
    413,
    { limit: 1048576, input: 'submission' },
    'may be at most 1 MB in all',
  ],
  ['upload_not_yours', 404, { uploads: [] }, 'A file is not one you uploaded'],
  ['upload_not_ready', 409, { uploads: [] }, 'A file did not arrive whole'],
  [
    'invalid_inputs',
    422,
    {
      errors: [{ input: 'submission', message: 'This input takes exactly one file.' }],
    },
    'Your solution: This input takes exactly one file.',
  ],
];

test('each refusal is said in words, and the files stay to send again', async ({
  page,
}) => {
  const state = await stubApi(page);
  await page.goto(PAGE);
  await page.getByLabel('Your solution', { exact: true }).setInputFiles({
    name: 'main.py',
    mimeType: 'text/x-python',
    buffer: Buffer.from('print(1)\n'),
  });
  await page.getByRole('combobox', { name: 'Language' }).selectOption('python');

  for (const [code, status, extra, sentence] of REFUSALS) {
    state.refusal = { status, code, extra };
    await page.getByRole('button', { name: 'Submit' }).click();
    const alert = page.getByRole('alert');
    await expect(alert, code).toContainText(sentence);
    await expect(page.getByRole('progressbar')).toHaveCount(0);
    await expect(page.getByLabel('Your solution: files chosen')).toContainText(
      'main.py',
    );
  }
  expect(state.submissions).toHaveLength(0);
});
