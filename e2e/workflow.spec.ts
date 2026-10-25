import { expect, test, type Locator, type Page, type Route } from '@playwright/test';

/**
 * The workflow editor in a real browser against the dev server with the API
 * stubbed: React Flow draws the graph at its actual size, at the places the
 * page works out; a wire drawn by dragging from one handle to another edits
 * the file, and a drag a version would refuse says why at the port; a step
 * added from the toolbar opens in the drawer, clear of the box it shows.
 * jsdom has no layout, so this is where the drags and the scrolling are
 * tried.
 */

const CLASSIC = `# kenny/tuned, a workflow.
inputs:
  submission: {type: file, title: Solution}
  language: {type: enum, options: [c, cpp, java, python], title: Language}
  time_limit: {type: number, title: Time limit}
  memory_limit: {type: number, title: Memory limit}
  input: {type: file, title: Input}
  answer: {type: file, title: Answer}
steps:
  - id: compile
    use: unicon/compile@v3
    with:
      source: \${{ inputs.submission }}
      language: \${{ inputs.language }}
  - id: run
    use: unicon/exec@v1
    with:
      program: \${{ steps.compile.program }}
      stdin: \${{ inputs.input }}
      time_limit: \${{ inputs.time_limit }}
      memory_limit: \${{ inputs.memory_limit }}
  - id: check
    use: unicon/diff-check@v2
    with:
      actual: \${{ steps.run.output }}
      expected: \${{ inputs.answer }}
outputs:
  log: \${{ steps.compile.log }}
`;

const port = (type: string, more: Record<string, unknown> = {}) => ({
  type,
  options: null,
  optional: false,
  runs: null,
  secret: false,
  description: null,
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
    ref: 'unicon/compile@v3',
    name: 'compile',
    title: 'Compile',
    description: 'Compiles source files into one program.',
    version: 'v3',
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
      program: port('file'),
      log: port('text'),
      outcome: port('outcome'),
    },
    problem: null,
  },
  {
    ref: 'unicon/diff-check@v2',
    name: 'diff-check',
    title: 'Compare with the answer',
    description:
      "Compares a program's output with the answer, ignoring trailing whitespace.",
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
    ref: 'unicon/exec@v1',
    name: 'exec',
    title: 'Run program',
    description:
      'Runs a program once under limits and records its output, time and memory.',
    version: 'v1',
    batch: true,
    network: false,
    limits: LIMITS,
    limits_from: {
      time_ms: { input: 'time_limit', scale: '2000', add: '3000' },
      memory_mb: { input: 'memory_limit', scale: '1', add: '256' },
    },
    inputs: {
      program: port('file', { runs: true }),
      stdin: port('file', { runs: false }),
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
  await page.route(/\/api\/v1\/workflows$/, (route) => json(route, []));
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
  await from.scrollIntoViewIfNeeded();
  await from.hover();
  await page.mouse.down();
  await to.scrollIntoViewIfNeeded();
  const box = await to.boundingBox();
  if (box === null) throw new Error('the target handle is not drawn');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 12 });
  await page.mouse.up();
}

/**
 * The file as a save would write it, read from CodeMirror's document in the
 * View file dialog, which holds every line where the page draws only those in
 * view; CodeMirror keeps its view on the content element's tile. A string the
 * browser runs, since these tests are typed without the DOM's types.
 */
const FILE = `(() => {
  const label = [...document.querySelectorAll('label')].find(
    (found) => found.textContent.trim() === 'The draft’s file');
  const content = document.querySelector('[aria-labelledby="' + label.id + '"]');
  const tile = content.cmTile || content.cmView;
  const view = tile && tile.view;
  if (!view) throw new Error('the file view holds no CodeMirror document');
  return view.state.doc.toString();
})()`;

async function file(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'View file' }).click();
  await expect(page.getByRole('dialog', { name: 'The draft’s file' })).toBeVisible();
  const text = await page.evaluate<string>(FILE);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'The draft’s file' })).toBeHidden();
  return text;
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
  await expect.poll(() => file(page)).toContain('args: ${{ inputs.time_limit }}');

  const submission = page.locator(
    '.react-flow__handle[data-handleid="out:submission"]',
  );
  await drag(page, submission, handle(page, 'step:1', 'in:memory_limit'));
  const refused = page.getByRole('alert').filter({
    hasText: 'This takes a number, not a file.',
  });
  await expect(refused).toBeVisible();
  expect(await file(page)).toContain('memory_limit: ${{ inputs.memory_limit }}');
  expect(inputs).not.toBeNull();
});

test('a refused wire’s message covers no port, and goes on a click, on Escape or by itself (M53)', async ({
  page,
}) => {
  await stubWorkflowApi(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/workflows/kenny/tuned');
  await expect(page.getByRole('group', { name: 'Step run' })).toBeVisible();
  const submission = page.locator(
    '.react-flow__handle[data-handleid="out:submission"]',
  );
  const target = handle(page, 'step:1', 'in:memory_limit');
  const refused = page.getByRole('alert').filter({
    hasText: 'This takes a number, not a file.',
  });

  await drag(page, submission, target);
  await expect(refused).toBeVisible();
  // It sits clear of every port, the refused one marked where it is.
  const said = await refused.boundingBox();
  if (said === null) throw new Error('the message is not drawn');
  for (const port of await page.locator('.react-flow__handle').all()) {
    const at = await port.boundingBox();
    if (at === null) continue;
    const apart =
      at.x + at.width <= said.x ||
      said.x + said.width <= at.x ||
      at.y + at.height <= said.y ||
      said.y + said.height <= at.y;
    expect(apart).toBe(true);
  }
  await expect(
    page.locator('.react-flow__node[data-id="step:1"]').getByText('✕'),
  ).toBeVisible();

  // A click anywhere puts it away.
  await page
    .getByRole('toolbar', { name: 'Editing' })
    .click({ position: { x: 4, y: 4 } });
  await expect(refused).toBeHidden();

  await drag(page, submission, target);
  await expect(refused).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(refused).toBeHidden();

  // And it fades away by itself.
  await drag(page, submission, target);
  await expect(refused).toBeVisible();
  await expect(refused).toBeHidden({ timeout: 8_000 });
});

test('a step added from the toolbar opens in the drawer clear of its box, and is wired by dragging', async ({
  page,
}) => {
  await stubWorkflowApi(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/workflows/kenny/tuned');
  await page
    .getByRole('group', { name: 'Step check' })
    .getByRole('button', { name: /^check/ })
    .click();
  const drawer = page.getByRole('complementary', { name: 'Step check' });
  await expect(drawer).toBeVisible();
  await drawer.getByRole('button', { name: 'Remove the step check' }).click();
  await expect(drawer).toBeHidden();

  await page.getByRole('button', { name: 'Add step' }).click();
  await page.getByRole('menuitem', { name: /^Compare with the answer/ }).click();
  const added = page.getByRole('group', { name: 'Step diff-check' });
  await expect(added).toBeVisible();
  const opened = page.getByRole('complementary', { name: 'Step diff-check' });
  // The box stands clear of the drawer over the right of the window.
  const box = await added.boundingBox();
  const over = await opened.boundingBox();
  expect(box !== null && over !== null && box.x + box.width <= over.x).toBe(true);

  await page.keyboard.press('Escape');
  await expect(opened).toBeHidden();
  await drag(
    page,
    handle(page, 'step:1', 'out:output'),
    handle(page, 'step:2', 'in:actual'),
  );
  await expect.poll(() => file(page)).toContain('actual: ${{ steps.run.output }}');
});

test('a step added below the window is scrolled into it', async ({ page }) => {
  await stubWorkflowApi(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/workflows/kenny/tuned');
  await expect(page.getByRole('group', { name: 'Step run' })).toBeVisible();

  await page.getByRole('button', { name: 'Add step' }).click();
  await page.getByRole('menuitem', { name: /^Run program/ }).click();
  const added = page.getByRole('group', { name: 'Step exec' });
  await expect(added).toBeVisible();
  // Up or down the page as well as sideways in the frame, the whole box in the window.
  await expect
    .poll(async () => {
      const box = await added.boundingBox();
      return box !== null && box.y >= 0 && box.y + box.height <= 1000;
    })
    .toBe(true);
});

test('the graph stands at its actual size and slides sideways in its frame', async ({
  page,
}) => {
  await stubWorkflowApi(page);
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.goto('/workflows/kenny/tuned');
  await expect(page.getByRole('group', { name: 'Step run' })).toBeVisible();

  expect(await page.locator('.react-flow__viewport').getAttribute('style')).toContain(
    'scale(1)',
  );
  const widths = await page.evaluate<[number, number]>(`(() => {
    const frame = document.querySelector('.react-flow').parentElement.parentElement;
    return [frame.scrollWidth, frame.clientWidth];
  })()`);
  expect(widths[0]).toBeGreaterThan(widths[1]);
  const pageWidths = await page.evaluate<[number, number]>(
    '[document.documentElement.scrollWidth, document.documentElement.clientWidth]',
  );
  expect(pageWidths[0]).toBe(pageWidths[1]);
  await expect(page.locator('.react-flow__attribution')).toHaveCount(0);
});

test('every port of a step opens its menu with the mouse', async ({ page }) => {
  await stubWorkflowApi(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/workflows/kenny/tuned');
  await expect(page.getByRole('group', { name: 'Step run' })).toBeVisible();

  for (const [step, port] of [
    ['compile', 'source'],
    ['compile', 'language'],
    ['run', 'program'],
    ['run', 'stdin'],
    ['check', 'actual'],
  ] as const) {
    await page.getByRole('button', { name: `The port ${port} of ${step}` }).click();
    await expect(
      page.getByRole('menu', { name: `The port ${port} of ${step}` }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
  }
  await page.getByRole('button', { name: 'The output time_ms of run' }).click();
  await expect(
    page.getByRole('menuitem', { name: 'Name it as an output' }),
  ).toBeVisible();
});

test('a box opens two levels in, and a problem opens the step inside', async ({
  page,
}) => {
  const json = (route: Route, body: unknown) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  const draft = 'steps:\n  - {id: build, use: kenny/inner@v1}\n';
  const inner = 'steps:\n  - {id: compile, use: kenny/deep@v1}\n';
  const deep = 'steps:\n  - {id: link, use: unicon/compile@v3}\n';
  const box = {
    inputs: [
      {
        name: 'source',
        type: 'folder',
        optional: false,
        options: null,
        title: null,
        unit: null,
      },
    ],
    outputs: [
      {
        name: 'program',
        type: 'file',
        title: null,
        unit: null,
        at_least: null,
        at_most: null,
        better: null,
      },
    ],
    newer_version: null,
    run: true,
  };
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
  await page.route(/\/api\/v1\/workflows$/, (route) =>
    json(route, [
      {
        owner: 'kenny',
        name: 'inner',
        visibility: 'private',
        versions: ['v1'],
        editable: true,
      },
      {
        owner: 'kenny',
        name: 'deep',
        visibility: 'private',
        versions: ['v1'],
        editable: true,
      },
    ]),
  );
  await page.route('**/api/v1/workflows/check', (route) =>
    json(route, {
      problems: [
        { path: 'steps[0]', message: 'The link failed.', step: 'build/compile/link' },
      ],
    }),
  );
  await page.route('**/api/v1/workflows/kenny/tuned', (route) =>
    json(route, {
      owner: 'kenny',
      name: 'tuned',
      visibility: 'private',
      versions: [],
      editable: true,
      draft: { content: draft, token: 'token-1' },
      readers: [],
    }),
  );
  await page.route(/\/versions\/[^/]+\/box$/, (route) => {
    const newer = route.request().url().includes('/inner/') ? 'v2' : null;
    return json(route, { ...box, newer_version: newer });
  });
  await page.route(/\/versions\/v1$/, (route) =>
    json(route, {
      content: route.request().url().includes('/inner/') ? inner : deep,
    }),
  );

  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/workflows/kenny/tuned');
  await expect(page.getByRole('group', { name: 'Step build' })).toBeVisible();
  await expect(page.getByText('A newer version is v2')).toBeVisible();
  await page
    .getByRole('region', { name: 'Problems' })
    .getByRole('button', { name: 'Step build' })
    .click();
  await expect(page.getByRole('group', { name: 'Step link' })).toBeVisible();
  const crumbs = page.getByRole('navigation', { name: 'Where this box sits' });
  await expect(crumbs.getByRole('button', { name: 'compile' })).toBeVisible();
  await crumbs.getByRole('button', { name: 'tuned' }).click();
  await expect(page.getByRole('group', { name: 'Step build' })).toBeVisible();
  await page.getByRole('button', { name: 'Open build' }).click();
  await expect(page.getByRole('group', { name: 'Step compile' })).toBeVisible();
  await page.getByRole('button', { name: 'Open compile' }).click();
  await expect(page.getByRole('group', { name: 'Step link' })).toBeVisible();
  await crumbs.getByRole('button', { name: 'build' }).click();
  await expect(page.getByRole('group', { name: 'Step compile' })).toBeVisible();
});
