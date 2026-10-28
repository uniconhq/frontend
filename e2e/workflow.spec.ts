import { expect, test, type Locator, type Page, type Route } from '@playwright/test';
import type { components } from '../src/api/schema';

type Schemas = components['schemas'];

/**
 * The workflow editor in a real browser against the dev server with the API
 * stubbed: React Flow draws the graph at its actual size, at the places the
 * page works out; a wire drawn by dragging from one handle to another edits
 * the file, and a drag a version would refuse says why at the port; a step
 * added from the toolbar opens in the drawer, clear of the box it shows.
 * jsdom has no layout, so this is where the drags and the scrolling are
 * tried.
 */

/** Where the browser keeps whether the graph draws its inputs: `INPUTS_SHOWN_KEY`. */
const INPUTS_SHOWN_KEY = 'unicon.workflow-graph.inputs';

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

const port = (
  type: Schemas['PrimitivePort']['type'],
  more: Partial<Schemas['PrimitivePort']> = {},
): Schemas['PrimitivePort'] => ({
  type,
  options: null,
  optional: false,
  runs: null,
  secret: false,
  description: null,
  at_least: null,
  at_most: null,
  better: null,
  inputs: null,
  names: null,
  outcomes: null,
  outputs: null,
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
    forms: {},
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
    forms: {},
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
      time_ms: {
        input: 'time_limit',
        scale: '2000',
        add: '3000',
        max: null,
        sum: null,
      },
      memory_mb: {
        input: 'memory_limit',
        scale: '1',
        add: '256',
        max: null,
        sum: null,
      },
    },
    forms: {},
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
] satisfies Schemas['Primitive'][];

async function stubWorkflowApi(page: Page) {
  // The graph draws its inputs, which most of these tests drag wires from.
  await page.addInitScript(
    (key) => localStorage.setItem(key, 'shown'),
    INPUTS_SHOWN_KEY,
  );
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  await page.route('**/api/v1/time', (route) =>
    json(route, { now: '2026-10-09T10:00:00Z' } satisfies Schemas['ServerTime']),
  );
  await page.route('**/api/v1/me', (route) =>
    json(route, {
      user: { id: 7, username: 'kenny', name: null, avatar_url: null, email: null },
      roles: [],
      degraded: false,
    } satisfies Schemas['Me']),
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
  await page.route('**/api/v1/workflows/kenny/tuned/tree**', (route) =>
    json(route, []),
  );
}

function handle(page: Page, node: string, id: string): Locator {
  return page.locator(
    `.react-flow__node[data-id="${node}"] .react-flow__handle[data-handleid="${id}"]`,
  );
}

/** A step's box opened, as a person opens it, by its head; a closed box shows no ports. */
async function openBox(page: Page, id: string) {
  const box = page.getByRole('group', { name: `Step ${id}` });
  if ((await box.getAttribute('data-open')) === null)
    await box.getByRole('button', { name: new RegExp(`^${id}`) }).click();
  await expect(box).toHaveAttribute('data-open', 'true');
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
 * View YAML dialog, which holds every line where the page draws only those in
 * view; CodeMirror keeps its view on the content element's tile. A string the
 * browser runs, since these tests are typed without the DOM's types.
 */
const FILE = `(() => {
  const label = [...document.querySelectorAll('label')].find(
    (found) => found.textContent.trim() === 'The draft’s YAML');
  const content = document.querySelector('[aria-labelledby="' + label.id + '"]');
  const tile = content.cmTile || content.cmView;
  const view = tile && tile.view;
  if (!view) throw new Error('the file view holds no CodeMirror document');
  return view.state.doc.toString();
})()`;

async function file(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'View YAML' }).click();
  await expect(page.getByRole('dialog', { name: 'The draft’s YAML' })).toBeVisible();
  const text = await page.evaluate<string>(FILE);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'The draft’s YAML' })).toBeHidden();
  return text;
}

/**
 * How far each end of every wire is drawn from the nearest handle of its
 * box, the right kind, up or down: the wires are drawn from the layout's
 * points, the handles where the boxes' CSS puts them, so the two agree only
 * while the heights do. Sideways, a wire ends at the box's edge and the
 * handle sits inside its border. A string the browser runs, as `FILE` is.
 */
const WIRE_ENDS = `(() => [...document.querySelectorAll('.react-flow__edge')].map((edge) => {
  const [, from, to] = /^Edge from (.+) to (.+)$/.exec(edge.getAttribute('aria-label'));
  const path = edge.querySelector('path.react-flow__edge-path');
  const screen = (at) =>
    new DOMPoint(path.getPointAtLength(at).x, path.getPointAtLength(at).y)
      .matrixTransform(path.getScreenCTM());
  const off = (point, node, kind) => Math.min(...[...document.querySelectorAll(
    '.react-flow__node[data-id="' + node + '"] .react-flow__handle.' + kind,
  )].map((handle) => {
    const box = handle.getBoundingClientRect();
    return Math.abs(box.x + box.width / 2 - point.x) <= 2
      ? Math.abs(box.y + box.height / 2 - point.y)
      : Infinity;
  }));
  return {
    wire: from + ' to ' + to,
    start: off(screen(0), from, 'source'),
    end: off(screen(path.getTotalLength()), to, 'target'),
  };
}))()`;

test('with the inputs hidden, a step’s tab sits in the gap before it and pops out its inputs’ boxes', async ({
  page,
}) => {
  await stubWorkflowApi(page);
  await page.addInitScript(
    (key) => localStorage.setItem(key, 'hidden'),
    INPUTS_SHOWN_KEY,
  );
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/workflows/kenny/tuned');
  const run = page.getByRole('group', { name: 'Step run' });
  const tab = run.getByRole('button', { name: /inputs? of Step run/ });
  await expect(tab).toBeVisible();
  await expect(page.getByRole('group', { name: /^Input / })).toHaveCount(0);

  const ofTab = await tab.boundingBox();
  const ofRun = await run.boundingBox();
  const ofCompile = await page
    .getByRole('group', { name: 'Step compile' })
    .boundingBox();
  if (ofTab === null || ofRun === null || ofCompile === null)
    throw new Error('the tab and the boxes are drawn');
  expect(ofTab.x + ofTab.width).toBeLessThanOrEqual(ofRun.x + 1);
  expect(ofTab.x).toBeGreaterThanOrEqual(ofCompile.x + ofCompile.width);

  // The pointer crosses from the tab to the boxes it pops out, wired to it.
  await tab.hover();
  const limit = page.getByRole('group', { name: 'Input time_limit' });
  await expect(limit).toBeVisible();
  const ofLimit = await limit.boundingBox();
  if (ofLimit === null) throw new Error('the popped-out box is drawn');
  expect(Math.abs(ofLimit.x + ofLimit.width + 88 - ofTab.x)).toBeLessThanOrEqual(2);
  await limit.hover();
  await limit.getByRole('button').click();
  await expect(page.getByRole('complementary', { name: 'Inputs' })).toBeVisible();
  await expect(limit).toBeHidden();
});

test('a first step’s tab, with no room on its left, pops its inputs out on its right, wired back to it', async ({
  page,
}) => {
  await stubWorkflowApi(page);
  await page.addInitScript(
    (key) => localStorage.setItem(key, 'hidden'),
    INPUTS_SHOWN_KEY,
  );
  await page.setViewportSize({ width: 1000, height: 1000 });
  await page.goto('/workflows/kenny/tuned');
  const tab = page
    .getByRole('group', { name: 'Step compile' })
    .getByRole('button', { name: /inputs? of Step compile/ });
  await tab.hover();
  const submission = page.getByRole('group', { name: 'Input submission' });
  await expect(submission).toBeVisible();

  const ofTab = await tab.boundingBox();
  const ofBox = await submission.boundingBox();
  if (ofTab === null || ofBox === null)
    throw new Error('the tab and the box are drawn');
  expect(Math.abs(ofTab.x + ofTab.width + 88 - ofBox.x)).toBeLessThanOrEqual(2);
});

test('a version’s box opens in the editor’s drawer, clear of the box, with every field locked', async ({
  page,
}) => {
  await stubWorkflowApi(page);
  await page.route('**/api/v1/workflows/kenny/tuned', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        owner: 'kenny',
        name: 'tuned',
        visibility: 'private',
        versions: ['v1'],
        editable: false,
        draft: null,
        readers: [],
      }),
    }),
  );
  await page.route('**/api/v1/workflows/kenny/tuned/versions/v1', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ content: CLASSIC }),
    }),
  );
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/workflows/kenny/tuned');
  const check = page.getByRole('group', { name: 'Step check' });
  await check.getByRole('button', { name: /^check/ }).click();

  const drawer = page.getByRole('complementary', { name: 'Step check' });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('textbox', { name: 'Name' })).toBeDisabled();
  await expect(drawer.getByRole('button', { name: /^Remove/ })).toHaveCount(0);
  await expect(async () => {
    const ofBox = await check.boundingBox();
    const ofDrawer = await drawer.boundingBox();
    if (ofBox === null || ofDrawer === null) throw new Error('both are drawn');
    expect(ofBox.x + ofBox.width).toBeLessThanOrEqual(ofDrawer.x);
  }).toPass();
});

test('every wire meets a handle of its boxes, open, closed and with a problem line', async ({
  page,
}) => {
  await stubWorkflowApi(page);
  await page.route('**/api/v1/workflows/check', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        problems: [{ path: 'steps[0]', message: 'It does not build.', step: null }],
      }),
    }),
  );
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/workflows/kenny/tuned');
  const compile = page.getByRole('group', { name: 'Step compile' });
  await expect(compile.getByText('It does not build.')).toBeVisible();
  await openBox(page, 'run');

  const ends =
    await page.evaluate<{ wire: string; start: number; end: number }[]>(WIRE_ENDS);
  expect(ends.length).toBeGreaterThan(5);
  for (const { wire, start, end } of ends) {
    expect(start, `${wire}, its start`).toBeLessThanOrEqual(1);
    expect(end, `${wire}, its end`).toBeLessThanOrEqual(1);
  }
});

test('a wire dragged onto a port edits the file, and a refused one says why', async ({
  page,
}) => {
  await stubWorkflowApi(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/workflows/kenny/tuned');
  await expect(page.getByRole('group', { name: 'Step run' })).toBeVisible();

  // An input's closed box gives its one value from its pin.
  await openBox(page, 'run');
  await drag(
    page,
    handle(page, 'input:time_limit', 'out:*'),
    handle(page, 'step:1', 'in:args'),
  );
  await expect.poll(() => file(page)).toContain('args: ${{ inputs.time_limit }}');

  await openBox(page, 'run');
  await drag(
    page,
    handle(page, 'input:submission', 'out:*'),
    handle(page, 'step:1', 'in:memory_limit'),
  );
  const refused = page.getByRole('alert').filter({
    hasText: 'This takes a number, not a file.',
  });
  await expect(refused).toBeVisible();
  expect(await file(page)).toContain('memory_limit: ${{ inputs.memory_limit }}');
});

test('a refused wire’s message covers no port, and goes on a click, on Escape or by itself (M53)', async ({
  page,
}) => {
  await stubWorkflowApi(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/workflows/kenny/tuned');
  await expect(page.getByRole('group', { name: 'Step run' })).toBeVisible();
  const submission = handle(page, 'input:submission', 'out:*');
  const target = handle(page, 'step:1', 'in:memory_limit');
  await openBox(page, 'run');
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
    .getByRole('group', { name: 'Editing' })
    .click({ position: { x: 4, y: 4 } });
  await expect(refused).toBeHidden();

  await drag(page, submission, target);
  await expect(refused).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(refused).toBeHidden();

  // And it fades away by itself.
  await openBox(page, 'run');
  await drag(page, submission, target);
  await expect(refused).toBeVisible();
  await expect(refused).toBeHidden({ timeout: 8_000 });
});

test('a step added from the tray opens in the drawer clear of its box, and is wired by dragging', async ({
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

  await page
    .getByRole('region', { name: 'Primitives' })
    .getByRole('button', { name: 'Compare with the answer' })
    .click();
  const added = page.getByRole('group', { name: 'Step diff-check' });
  await expect(added).toBeVisible();
  const opened = page.getByRole('complementary', { name: 'Step diff-check' });
  // The box stands clear of the drawer over the right of the window.
  const box = await added.boundingBox();
  const over = await opened.boundingBox();
  expect(box !== null && over !== null && box.x + box.width <= over.x).toBe(true);

  await page.keyboard.press('Escape');
  await expect(opened).toBeHidden();
  // A step's output, from its box opened, onto the closed box: no input is
  // called output, so it goes to the first given nothing.
  await openBox(page, 'run');
  await drag(page, handle(page, 'step:1', 'out:output'), added);
  await expect.poll(() => file(page)).toContain('actual: ${{ steps.run.output }}');
  await openBox(page, 'diff-check');
  await drag(
    page,
    handle(page, 'input:answer', 'out:*'),
    handle(page, 'step:2', 'in:expected'),
  );
  await expect.poll(() => file(page)).toContain('expected: ${{ inputs.answer }}');
});

test('a lifted wire moves to the port it is dropped on, or clears its port on nothing, and a wire dropped on a closed box finds its port', async ({
  page,
}) => {
  await stubWorkflowApi(page);
  await page.setViewportSize({ width: 1600, height: 1400 });
  await page.goto('/workflows/kenny/tuned');
  const run = page.getByRole('group', { name: 'Step run' });
  await expect(run).toBeVisible();

  // A pin that gives several outputs starts no wire: a click there is a
  // click on the box, which opens it to choose one.
  await handle(page, 'step:1', 'out:*').click({ force: true });
  await expect(run).toHaveAttribute('data-open', 'true');

  /** The wire into `port` of run, lifted by its end and dropped at (x, y). */
  const lift = async (port: string, x: number, y: number) => {
    const end = await handle(page, 'step:1', `in:${port}`).boundingBox();
    if (end === null) throw new Error(`no handle for ${port}`);
    await page.mouse.move(end.x - 3, end.y + end.height / 2);
    await page.mouse.down();
    await page.mouse.move(x, y, { steps: 12 });
    await page.mouse.up();
  };
  const args = await handle(page, 'step:1', 'in:args').boundingBox();
  if (args === null) throw new Error('no handle for args');
  await lift('time_limit', args.x + args.width / 2, args.y + args.height / 2);
  await expect.poll(() => file(page)).toContain('args: ${{ inputs.time_limit }}');
  expect(await file(page)).not.toContain('time_limit: ${{ inputs.time_limit }}');

  const face = await run.boundingBox();
  if (face === null) throw new Error('run is not drawn');
  await lift('args', face.x - 44, face.y + face.height - 10);
  await expect.poll(() => file(page)).not.toContain('args:');

  // Closed, the box takes a wire anywhere on it, to the input of its name,
  // and while the wire is dragged says which boxes would take it.
  await run.getByRole('button', { name: /^run/ }).click();
  await expect(run).not.toHaveAttribute('data-open');
  const pin = handle(page, 'input:time_limit', 'out:*');
  await pin.hover();
  const closed = await run.boundingBox();
  if (closed === null) throw new Error('run is not drawn');
  await page.mouse.down();
  await page.mouse.move(closed.x + 40, closed.y + closed.height - 20, { steps: 12 });
  await expect(run).toHaveAttribute('data-drop', 'offered');
  await expect(page.getByRole('group', { name: 'Step check' })).toHaveAttribute(
    'data-drop',
    'refused',
  );
  await page.mouse.up();
  await expect.poll(() => file(page)).toContain('time_limit: ${{ inputs.time_limit }}');

  // Refused, it names the port it would have gone to, which the box hides.
  await drag(page, handle(page, 'input:submission', 'out:*'), run);
  await expect(
    page.getByRole('alert').filter({ hasText: 'args: This takes text, not a file.' }),
  ).toBeVisible();
});

test('only a wire that is a port’s whole value, into an open box, can be lifted', async ({
  page,
}) => {
  await stubWorkflowApi(page);
  const draft = CLASSIC.replace(
    '      stdin: ${{ inputs.input }}\n',
    '      stdin: ${{ inputs.input }}\n      files:\n        answer: ${{ inputs.answer }}\n        given: ${{ inputs.language }}\n',
  );
  await page.route('**/api/v1/workflows/kenny/tuned', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        owner: 'kenny',
        name: 'tuned',
        visibility: 'private',
        versions: [],
        editable: true,
        draft: { content: draft, token: 'token-1' },
        readers: [],
      }),
    }),
  );
  await page.goto('/workflows/kenny/tuned');
  // The handle React Flow draws at a wire's end that lifts it.
  const lifts = (from: string) =>
    page.locator(
      `.react-flow__edge[aria-label="Edge from ${from} to step:1"] .react-flow__edgeupdater-target`,
    );
  await expect(page.getByRole('group', { name: 'Step run' })).toBeVisible();
  // Closed, every wire ends on the one pin, and none is lifted from there.
  await expect(lifts('input:time_limit')).toHaveCount(0);

  await openBox(page, 'run');
  await expect(lifts('input:time_limit')).toHaveCount(1);
  // One of the values a mapping holds is changed in the drawer.
  await expect(lifts('input:answer')).toHaveCount(0);
  await expect(lifts('input:language')).toHaveCount(0);
});

test('a step added below the window is scrolled into it', async ({ page }) => {
  await stubWorkflowApi(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/workflows/kenny/tuned');
  await expect(page.getByRole('group', { name: 'Step run' })).toBeVisible();

  await page
    .getByRole('region', { name: 'Primitives' })
    .getByRole('button', { name: 'Run program' })
    .click();
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

test('the frame shades an edge with more of the graph past it, and a selected box moves only from under the drawer', async ({
  page,
}) => {
  await stubWorkflowApi(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/workflows/kenny/tuned');
  await expect(page.getByRole('group', { name: 'Step run' })).toBeVisible();
  // The frame's edges, and how far the graph has slid in it.
  const edges = page.locator('.react-flow').locator('xpath=../../..');
  const slid = () =>
    page.evaluate<number>(
      "document.querySelector('.react-flow').parentElement.parentElement.scrollLeft",
    );
  await expect(edges).toHaveAttribute('data-more-right', '');
  await expect(edges).not.toHaveAttribute('data-more-left', '');

  // A box in view, clear of where the drawer opens, leaves the graph still.
  await openBox(page, 'compile');
  expect(await slid()).toBe(0);

  // One the drawer would cover slides out from under it.
  await openBox(page, 'check');
  await expect.poll(slid).toBeGreaterThan(0);
  const check = await page.getByRole('group', { name: 'Step check' }).boundingBox();
  const drawer = await page
    .getByRole('complementary', { name: 'Step check' })
    .boundingBox();
  expect(check !== null && drawer !== null && check.x + check.width <= drawer.x).toBe(
    true,
  );
  await expect(edges).toHaveAttribute('data-more-left', '');

  // Slid back by hand, an edit leaves the graph where it was put.
  await page.evaluate(
    "document.querySelector('.react-flow').parentElement.parentElement.scrollLeft = 0",
  );
  await expect.poll(slid).toBe(0);
  const name = page
    .getByRole('complementary', { name: 'Step check' })
    .getByRole('textbox', { name: 'Name' });
  await name.fill('verdict');
  await name.press('Enter');
  await expect(page.getByRole('group', { name: 'Step verdict' })).toBeVisible();
  expect(await slid()).toBe(0);
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
    await openBox(page, step);
    await page.getByRole('button', { name: `The port ${port} of ${step}` }).click();
    await expect(
      page.getByRole('menu', { name: `The port ${port} of ${step}` }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
  }
  await openBox(page, 'run');
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
    description: null,
    run: true,
  };
  await page.route('**/api/v1/time', (route) =>
    json(route, { now: '2026-10-09T10:00:00Z' } satisfies Schemas['ServerTime']),
  );
  await page.route('**/api/v1/me', (route) =>
    json(route, {
      user: { id: 7, username: 'kenny', name: null, avatar_url: null, email: null },
      roles: [],
      degraded: false,
    } satisfies Schemas['Me']),
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
  await page.route('**/api/v1/workflows/kenny/tuned/tree**', (route) =>
    json(route, []),
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
  // Its problem stands on the line under its head, before that v2 is out.
  await expect(
    page
      .getByRole('group', { name: 'Step build' })
      .getByRole('note', { name: 'The link failed.' }),
  ).toBeVisible();
  await page
    .getByRole('region', { name: 'Problems' })
    .getByRole('button', { name: 'Step build' })
    .click();
  await expect(page.getByRole('group', { name: 'Step link' })).toBeVisible();
  const crumbs = page.getByRole('navigation', { name: 'Inside the workflow' });
  await expect(crumbs.getByText('compile')).toHaveAttribute('aria-current', 'page');
  await crumbs.getByRole('button', { name: 'tuned' }).click();
  await expect(page.getByRole('group', { name: 'Step build' })).toBeVisible();
  await page.getByRole('button', { name: 'Open build' }).click();
  await expect(page.getByRole('group', { name: 'Step compile' })).toBeVisible();
  await page.getByRole('button', { name: 'Open compile' }).click();
  await expect(page.getByRole('group', { name: 'Step link' })).toBeVisible();
  await crumbs.getByRole('button', { name: 'build' }).click();
  await expect(page.getByRole('group', { name: 'Step compile' })).toBeVisible();
});
