import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * The contestant submitting from a task page against the dev server with the
 * API and the object store stubbed, so it needs no backend: the panel shows a
 * drop zone per file input, a file goes to the store as the slot says and
 * one submission comes of it, the list follows it from queued to its outcome,
 * a submission opens with what the task shows of it, restore puts an earlier
 * submission's files back, and each refusal is said in words.
 * The stub keeps just enough state for each answer to follow from the last.
 */
const TASK = '/api/v1/orgs/acme/contests/spring/tasks/sum';
const OPEN = { released: true, visible: true, open: true, closed: null };

const input = (overrides: Record<string, unknown>) => ({
  id: 'submission',
  type: 'code',
  label: 'Your solution',
  language: ['python', 'cpp'],
  min: null,
  max: null,
  accept: null,
  max_size: null,
  default: null,
  ...overrides,
});

const TWO_INPUTS = [
  input({}),
  input({
    id: 'weights',
    type: 'file[]',
    label: 'Model weights',
    language: null,
    accept: ['.bin'],
  }),
];

const queued = {
  id: '5d2f0c1e-0000-4000-8000-000000000001',
  stage: 'default',
  attempt: 1,
  status: 'queued',
  show: 'full',
  outcome: null,
  metrics: null,
  summary: null,
  tests: null,
  log: false,
};

const accepted = {
  ...queued,
  status: 'done',
  outcome: 'accepted',
  metrics: { points: 100 },
  summary: 'Compiled cleanly.',
  tests: [
    { id: '1', outcome: 'accepted', time_ms: 12, memory_kb: 2048, metrics: {} },
    { id: '2', outcome: 'wrong_answer', time_ms: 30, memory_kb: 1024, metrics: {} },
  ],
  log: true,
};

type Submission = { number: number; submitted_at: string; gradings: unknown[] };

type State = {
  inputs: unknown[];
  submissions: Submission[];
  /** How often each submission has been read, so its grading can move on. */
  reads: number;
  forms: string[];
  parts: number[];
  completed: unknown[];
  submits: { idempotency_key: string; inputs: unknown }[];
  refusal: { status: number; code: string; extra: Record<string, unknown> } | null;
  multipart: boolean;
};

async function stubApi(page: Page, overrides: Partial<State> = {}): Promise<State> {
  const state: State = {
    inputs: [input({})],
    submissions: [],
    reads: 0,
    forms: [],
    parts: [],
    completed: [],
    submits: [],
    refusal: null,
    multipart: false,
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
  await page.route('**/api/v1/me', (route) =>
    json(route, {
      user_id: 20,
      username: 'carol',
      name: 'Carol',
      avatar_url: null,
      email: 'carol@example.org',
      roles: [],
      degraded: false,
    }),
  );

  await page.route('**/unicon-uploads/**', async (route) => {
    const request = route.request();
    if (request.method() === 'POST') {
      state.forms.push(request.postData() ?? '');
      return route.fulfill({ status: 204 });
    }
    state.parts.push(request.postDataBuffer()?.length ?? 0);
    return route.fulfill({
      status: 200,
      headers: { ETag: `"part-${state.parts.length}"` },
    });
  });

  /** Each submission's grading moves on as it is read: queued, then accepted. */
  const graded = (submission: Submission): Submission =>
    state.reads < 3 ? submission : { ...submission, gradings: [accepted] };

  await page.route(`**${TASK}/**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.slice(TASK.length);

    if (path === '/page') {
      return json(route, {
        name: 'sum',
        label: 'A',
        title: 'Sum of Two',
        points: 100,
        statement: '# Sum\n\nPrint the sum of two numbers.\n',
        limits: {
          submissions: 50,
          rate_count: 1,
          rate_seconds: 30,
          max_size: 10485760,
        },
        inputs: state.inputs,
        release: OPEN,
      });
    }
    if (path === '/uploads') {
      const number = state.completed.length + 1;
      const id = `00000000-0000-4000-8000-00000000000${number}`;
      if (state.multipart) {
        return json(
          route,
          {
            id,
            method: 'multipart',
            part_size: 4,
            parts: [1, 2, 3].map((part) => ({
              number: part,
              url: `http://localhost:8080/unicon-uploads/uploads/${id}?partNumber=${part}&X-Amz-Signature=s`,
            })),
            expires_at: '2026-09-29T12:00:00Z',
          },
          201,
        );
      }
      return json(
        route,
        {
          id,
          method: 'post',
          url: 'http://localhost:8080/unicon-uploads/',
          fields: {
            bucket: 'unicon-uploads',
            key: `uploads/${id}`,
            policy: 'cG9saWN5',
          },
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
      const made = {
        number: state.submissions.length + 1,
        submitted_at: '2026-09-29T10:00:00Z',
        gradings: [queued],
      };
      state.submissions.push(made);
      state.reads = 0;
      return json(route, made, 201);
    }
    if (path === '/submissions') {
      state.reads += 1;
      return json(route, [...state.submissions].reverse().map(graded));
    }
    const one = /^\/submissions\/(\d+)$/.exec(path);
    if (one !== null) {
      const found = state.submissions.find((entry) => entry.number === Number(one[1]));
      return found === undefined
        ? route.fulfill({ status: 404, body: 'not stubbed' })
        : json(route, found);
    }
    if (/^\/submissions\/\d+\/log$/.test(path)) {
      return route.fulfill({
        status: 200,
        contentType: 'text/plain; charset=utf-8',
        body: 'step compile: ok\nstep run: 2 tests\n',
      });
    }
    if (/^\/submissions\/\d+\/files$/.test(path)) {
      return json(route, {
        number: 1,
        inputs: {
          submission: {
            files: ['files/submission/main.cpp'],
            language: 'cpp',
            value: null,
          },
        },
      });
    }
    if (path === '/submissions/1/files/files%2Fsubmission%2Fmain.cpp') {
      return route.fulfill({
        status: 200,
        contentType: 'application/octet-stream',
        body: 'int main() { return 0; }\n',
      });
    }
    return route.fulfill({ status: 404, body: 'not stubbed' });
  });
  return state;
}

const PAGE = '/contests/acme/spring/tasks/sum';

test('a task with two file inputs shows two drop zones', async ({ page }) => {
  await stubApi(page, { inputs: TWO_INPUTS });
  await page.goto(PAGE);

  const form = page.getByRole('form', { name: 'Submit' });
  await expect(form.locator('input[type="file"]')).toHaveCount(2);
  await expect(form.getByLabel('Your solution', { exact: true })).toBeAttached();
  await expect(form.getByLabel('Model weights', { exact: true })).toHaveAttribute(
    'accept',
    '.bin',
  );
  await expect(
    form.getByRole('combobox', { name: 'Language of Your solution' }),
  ).toBeVisible();
});

test('a full pass sends the files as the slot says and makes one submission', async ({
  page,
}) => {
  const state = await stubApi(page, { inputs: TWO_INPUTS });
  await page.goto(PAGE);

  const form = page.getByRole('form', { name: 'Submit' });
  await form.getByLabel('Your solution', { exact: true }).setInputFiles({
    name: 'main.py',
    mimeType: 'text/x-python',
    buffer: Buffer.from('print(sum(map(int, input().split())))\n'),
  });
  await form.getByLabel('Model weights', { exact: true }).setInputFiles([
    { name: 'a.bin', mimeType: 'application/octet-stream', buffer: Buffer.from('abc') },
    {
      name: 'b.bin',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from('defg'),
    },
  ]);
  await form
    .getByRole('combobox', { name: 'Language of Your solution' })
    .selectOption('python');
  await form.getByRole('button', { name: 'Submit' }).dblclick();

  await expect(page.getByText('Submitted as #1.')).toBeVisible();
  expect(state.submits).toHaveLength(1);
  expect(state.submits[0]?.idempotency_key).toMatch(/^[A-Za-z0-9_-]{8,128}$/);
  expect(state.submits[0]?.inputs).toEqual({
    submission: {
      uploads: ['00000000-0000-4000-8000-000000000001'],
      language: 'python',
    },
    weights: {
      uploads: [
        '00000000-0000-4000-8000-000000000002',
        '00000000-0000-4000-8000-000000000003',
      ],
      language: null,
    },
  });

  expect(state.forms).toHaveLength(3);
  const first = state.forms[0] ?? '';
  const names = [...first.matchAll(/; name="([^"]+)"/g)].map((found) => found[1]);
  expect(names).toEqual(['bucket', 'key', 'policy', 'file']);
  expect(first).toContain('filename="main.py"');
  expect(first).not.toMatch(/name="Content-Type"/i);

  const list = page.getByRole('table', { name: 'Your submissions' });
  await expect(list.getByText('QUEUED')).toBeVisible();
  await expect(list.getByText('ACCEPTED')).toBeVisible({ timeout: 15_000 });
  await expect(list.getByLabel('Metrics')).toContainText('100');
});

test('a file sent in parts puts each part at its length and completes with the ETags', async ({
  page,
}) => {
  const state = await stubApi(page, { multipart: true });
  await page.goto(PAGE);

  await page.getByLabel('Your solution', { exact: true }).setInputFiles({
    name: 'main.py',
    mimeType: 'text/x-python',
    buffer: Buffer.from('0123456789'),
  });
  await page
    .getByRole('combobox', { name: 'Language of Your solution' })
    .selectOption('cpp');
  await page.getByRole('button', { name: 'Submit' }).click();

  await expect(page.getByText('Submitted as #1.')).toBeVisible();
  expect(state.parts).toEqual([4, 4, 2]);
  expect(state.completed).toEqual([
    {
      parts: [
        { number: 1, etag: '"part-1"' },
        { number: 2, etag: '"part-2"' },
        { number: 3, etag: '"part-3"' },
      ],
    },
  ]);
});

test('a submission opens with its summary, tests and log', async ({ page }) => {
  await stubApi(page, {
    submissions: [
      { number: 1, submitted_at: '2026-09-29T09:30:00Z', gradings: [accepted] },
    ],
  });
  await page.goto(PAGE);

  await page.getByRole('link', { name: '#1' }).click();
  await expect(page).toHaveURL(/\?submission=1$/);
  const detail = page.getByRole('region', { name: 'Submission 1' });
  await expect(detail.getByLabel('Summary default')).toHaveText('Compiled cleanly.');
  const rows = detail.getByRole('table', { name: 'Tests default' }).getByRole('row');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(2)).toContainText('WRONG ANSWER');
  await expect(detail.getByLabel('Log default')).toContainText('step run: 2 tests');
});

test('a submission whose task hides the result shows its status alone', async ({
  page,
}) => {
  await stubApi(page, {
    submissions: [
      {
        number: 1,
        submitted_at: '2026-09-29T09:30:00Z',
        gradings: [{ ...queued, status: 'done', show: 'hidden' }],
      },
    ],
  });
  await page.goto(`${PAGE}?submission=1`);

  const detail = page.getByRole('region', { name: 'Submission 1' });
  await expect(detail.getByText('GRADED')).toBeVisible();
  await expect(detail.getByRole('table')).toHaveCount(0);
  await expect(detail.getByLabel('Log default')).toHaveCount(0);
  await expect(detail.getByLabel('Summary default')).toHaveCount(0);
});

test('restore fills the panel with an earlier submission to submit again', async ({
  page,
}) => {
  const state = await stubApi(page, {
    submissions: [
      { number: 1, submitted_at: '2026-09-29T09:30:00Z', gradings: [accepted] },
    ],
  });
  await page.goto(PAGE);

  await page.getByRole('button', { name: 'Restore the files of submission 1' }).click();
  await expect(
    page.getByText(/The files of submission #1 are in the panel/),
  ).toBeVisible();
  await expect(page.getByLabel('Your solution: files chosen')).toContainText(
    'main.cpp',
  );
  await expect(
    page.getByRole('combobox', { name: 'Language of Your solution' }),
  ).toHaveValue('cpp');

  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByText('Submitted as #2.')).toBeVisible();
  expect(state.forms[0]).toContain('int main() { return 0; }');
  expect(state.submissions).toHaveLength(2);
});

const REFUSALS: [string, number, Record<string, unknown>, string][] = [
  ['task_closed', 403, { reason: 'ended' }, 'The contest has ended for you'],
  ['archived', 403, {}, 'The contest is archived'],
  ['not_approved', 403, {}, 'You are not a contestant here yet'],
  ['workspace_not_ready', 409, {}, 'Your workspace is still being made'],
  ['submission_limit', 409, { limit: 50 }, 'This task takes 50 submissions in all'],
  [
    'rate_limited',
    429,
    { rate: '1 per 30s', retry_at: '2999-09-29T10:00:30Z' },
    'You can submit again at',
  ],
  ['too_large', 413, { limit: 1048576, input: 'submission' }, 'may be at most 1 MB'],
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
  await page
    .getByRole('combobox', { name: 'Language of Your solution' })
    .selectOption('python');

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
