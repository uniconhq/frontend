import { expect, test, type Locator, type Page, type Route } from '@playwright/test';

/**
 * The workflow editor in a real browser against the dev server with the API
 * stubbed: React Flow draws the graph at the places the page works out, a
 * wire drawn by dragging from one handle to another edits the file, and a
 * drag a version would refuse says why at the port. jsdom has no layout, so
 * this is where the drags themselves are tried.
 */

const CLASSIC = `# kenny/tuned, a workflow.
inputs:
  submission: {type: file, contestant: true}
  language: {type: enum, options: [c, cpp, java, python], contestant: true}
  time_limit: number
  memory_limit: number
test:
  input: file
  answer: file
steps:
  - id: compile
    use: unicon/compile@v2
    with:
      source: \${{ inputs.submission }}
      language: \${{ inputs.language }}
  - id: run
    use: unicon/sandbox-run@v2
    per_test: true
    with:
      binary: \${{ steps.compile.binary }}
      input: \${{ test.input }}
      time_limit: \${{ inputs.time_limit }}
      memory_limit: \${{ inputs.memory_limit }}
  - id: check
    use: unicon/diff-check@v2
    per_test: true
    with:
      actual: \${{ steps.run.output }}
      expected: \${{ test.answer }}
report:
  log: \${{ steps.compile.compile_log }}
`;

const port = (type: string, more: Record<string, unknown> = {}) => ({
  type,
  options: null,
  optional: false,
  runs: null,
  secret: false,
  ...more,
});

const LIMITS = {
  time_ms: 2000,
  cpu_ms: 2000,
  memory_mb: 256,
  pids: 128,
  output_mb: 64,
  gpus: 0,
};

const PRIMITIVES = [
  {
    ref: 'unicon/compile@v2',
    name: 'compile',
    version: 'v2',
    batch: false,
    network: false,
    limits: LIMITS,
    limits_from: {},
    inputs: {
      source: port('folder', { runs: true }),
      language: port('enum', { options: ['c', 'cpp', 'java', 'python'] }),
      entry: port('text', { optional: true }),
    },
    outputs: {
      binary: port('file'),
      compile_log: port('text'),
      outcome: port('outcome'),
    },
    problem: null,
  },
  {
    ref: 'unicon/diff-check@v2',
    name: 'diff-check',
    version: 'v2',
    batch: true,
    network: false,
    limits: LIMITS,
    limits_from: {},
    inputs: {
      actual: port('file', { runs: false }),
      expected: port('file', { runs: false }),
    },
    outputs: { outcome: port('outcome') },
    problem: null,
  },
  {
    ref: 'unicon/sandbox-run@v2',
    name: 'sandbox-run',
    version: 'v2',
    batch: true,
    network: false,
    limits: LIMITS,
    limits_from: {
      time_ms: { input: 'time_limit', scale: '2000', add: '3000' },
      memory_mb: { input: 'memory_limit', scale: '1', add: '256' },
    },
    inputs: {
      binary: port('file', { runs: true }),
      input: port('file', { runs: false }),
      args: port('text', { optional: true }),
      time_limit: port('number'),
      memory_limit: port('number'),
    },
    outputs: {
      output: port('file'),
      time_ms: port('number'),
      memory_kb: port('number'),
      outcome: port('outcome'),
    },
    problem: null,
  },
];

async function stubWorkflowApi(page: Page) {
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  await page.route('**/api/v1/time', (route) =>
    json(route, { now: '2026-10-09T10:00:00Z' }),
  );
  await page.route('**/api/v1/me', (route) =>
    json(route, {
      user: { id: 7, username: 'kenny', name: null, avatar_url: null, email: null },
      roles: [],
      degraded: false,
    }),
  );
  await page.route('**/api/v1/primitives', (route) => json(route, PRIMITIVES));
  await page.route('**/api/v1/workflows/check', (route) =>
    json(route, { problems: [] }),
  );
  await page.route('**/api/v1/workflows/kenny/tuned', (route) =>
    json(route, {
      owner: 'kenny',
      name: 'tuned',
      visibility: 'private',
      versions: [],
      editable: true,
      draft: { content: CLASSIC, token: 'token-1' },
      readers: [],
    }),
  );
}

function handle(page: Page, node: string, id: string): Locator {
  return page.locator(
    `.react-flow__node[data-id="${node}"] .react-flow__handle[data-handleid="${id}"]`,
  );
}

/** A wire dragged with the mouse from one handle to another. */
async function drag(page: Page, from: Locator, to: Locator) {
  await from.hover();
  await page.mouse.down();
  const box = await to.boundingBox();
  if (box === null) throw new Error('the target handle is not drawn');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 12 });
  await page.mouse.up();
}

/**
 * The file the preview shows, read from CodeMirror's document, which holds
 * every line where the page draws only those in view. A string the browser
 * runs, since these tests are typed without the DOM's types.
 */
const PREVIEW = `(() => {
  const label = [...document.querySelectorAll('label')].find(
    (found) => found.textContent.trim() === 'workflow.yaml as a save writes it');
  const content = document.querySelector('[aria-labelledby="' + label.id + '"]');
  const view = content.cmView && content.cmView.view;
  return view ? view.state.doc.toString() : content.innerText;
})()`;

async function preview(page: Page): Promise<string> {
  return page.evaluate<string>(PREVIEW);
}

test('a wire dragged onto a port edits the file, and a refused one says why', async ({
  page,
}) => {
  await stubWorkflowApi(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/workflows/kenny/tuned');
  await expect(page.getByRole('group', { name: 'Step run' })).toBeVisible();

  const limit = page.locator('.react-flow__handle[data-handleid="out:time_limit"]');
  const inputs = await limit.getAttribute('data-nodeid');
  await drag(page, limit, handle(page, 'step:1', 'in:args'));
  await expect.poll(() => preview(page)).toContain('args: ${{ inputs.time_limit }}');

  const submission = page.locator(
    '.react-flow__handle[data-handleid="out:submission"]',
  );
  await drag(page, submission, handle(page, 'step:1', 'in:memory_limit'));
  await expect(
    page.getByRole('alert').filter({
      hasText:
        'This port raises a limit, so the task must give it, not the contestant.',
    }),
  ).toBeVisible();
  expect(await preview(page)).toContain('memory_limit: ${{ inputs.memory_limit }}');
  expect(inputs).not.toBeNull();
});

test('a step added from the palette is wired by dragging', async ({ page }) => {
  await stubWorkflowApi(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/workflows/kenny/tuned');
  await page
    .getByRole('group', { name: 'Step check' })
    .getByRole('button', { name: /^check/ })
    .click();
  await page.getByRole('button', { name: 'Remove the step check' }).click();
  await page.getByRole('button', { name: 'Primitives', exact: true }).click();
  await page
    .getByRole('button', { name: 'Add unicon/diff-check@v2, run per test' })
    .click();
  await expect(page.getByRole('group', { name: 'Step diff-check' })).toBeVisible();

  await drag(
    page,
    handle(page, 'step:1', 'out:output'),
    handle(page, 'step:2', 'in:actual'),
  );

  await expect.poll(() => preview(page)).toContain('actual: ${{ steps.run.output }}');
});

test('every port of a step opens its menu with the mouse', async ({ page }) => {
  await stubWorkflowApi(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/workflows/kenny/tuned');
  await expect(page.getByRole('group', { name: 'Step run' })).toBeVisible();

  for (const [step, port] of [
    ['compile', 'source'],
    ['compile', 'language'],
    ['run', 'binary'],
    ['run', 'input'],
    ['check', 'actual'],
  ] as const) {
    await page.getByRole('button', { name: `The port ${port} of ${step}` }).click();
    await expect(
      page.getByRole('menu', { name: `The port ${port} of ${step}` }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
  }
  await page.getByRole('button', { name: 'The output run.time_ms' }).click();
  await expect(page.getByRole('menuitem', { name: 'Report it' })).toBeVisible();
});
