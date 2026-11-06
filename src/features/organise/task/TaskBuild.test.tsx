import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@/test/user-event';
import { delay, http, HttpResponse, type RequestHandler } from 'msw';
import type {
  DeclaredInput,
  SaveRequest,
  TreeEntry,
  WorkflowForm,
  WorkflowItem,
} from '@/api/types';
import { partTransfer } from '@/test/part-uploads';
import { renderApp } from '@/test/render';
import { CLASSIC, PRIMITIVES, versionOf, workflowItem } from '@/test/workflows';
import { afterAnswers, problem, server, signedIn, signedInAs } from '@/test/server';
import {
  TASK_API,
  CONTEST_API,
  draftTask,
  publicationList,
  publications,
  publishedTask,
  repoFiles,
  settingsOf,
  taskState,
  unchanged,
  fileContent,
  published,
  treeEntry,
} from '@/test/organiser';
import { declared, taskFileOf, taskValuesOf } from '@/test/task-values';
import {
  comeBackToTab,
  fakeLiveStream,
  nudge,
  openStream,
  realLiveStream,
} from '@/test/live';
import { specCatalogue } from '@/test/catalogue';
import { INPUTS_SHOWN_KEY } from '../workflows/inputs-shown';

/** The names of the files handed to the browser to save, in turn. */
const saved = vi.hoisted((): string[] => []);
vi.mock('@/lib/save-file', () => ({
  saveFile: (name: string) => {
    saved.push(name);
  },
}));

const TASK = `name: Shortest Path   # the title
workflow: unicon/checked@v1
inputs:
  submission: {entrant: {label: Your solution, max_size: 1MB}}
  language: {entrant: {options: [cpp, python], default: cpp}}
  checker: checker/checker.cpp
  time_limit: 2
  token: {secret: judge-token}
submissions:
  max: 50
  rate: {count: 1, per: 30}
`;

/** The commit a listed file was last changed at, as the tree names it. */
const LISTED_AT = '9f8e7d6c5b4a39281706f5e4d3c2b1a098765432';

function file(path: string, size = 4, version: string | null = LISTED_AT): TreeEntry {
  return treeEntry({
    path,
    size,
    token: `token-${path}`,
    version,
    href:
      version === null
        ? null
        : `/-/downloads/acme/spring/sum/versions/${version}/${path}`,
  });
}

/** A workflow form whose workflow cannot be read. */
const UNREAD: WorkflowForm = {
  workflow: 'unicon/checked@v1',
  inputs: [],
  problem: 'The workflow unicon/checked@v1 cannot be read.',
  graded: false,
  newer: null,
  yanked: null,
  text_values: null,
};

/** What unicon/checked@v1 declares, as the backend reads it. */
const CHECKED: WorkflowForm = {
  workflow: 'unicon/checked@v1',
  problem: null,
  graded: false,
  newer: null,
  inputs: [
    declared('submission', 'file'),
    declared('language', 'enum', { options: ['cpp', 'python', 'java'] }),
    declared('checker', 'file'),
    declared('time_limit', 'number', {
      title: 'Time limit',
      unit: 'seconds',
      help: 'The CPU time the program may use on each test.',
    }),
    declared('memory_limit', 'number', { optional: true }),
    declared('strict', 'boolean'),
    declared('greeting', 'text', { optional: true }),
    declared('token', 'text'),
  ],
  yanked: null,
  text_values: null,
};

/** unicon/checked's file, which reports the fraction its checker gives a run. */
const CHECKED_YAML = `inputs:
  submission: file
  language: {type: enum, options: [cpp, python, java]}
  checker: file
  time_limit: {type: number, title: Time limit, unit: seconds}
  memory_limit: {type: number, optional: true}
  strict: boolean
  greeting: {type: text, optional: true}
  token: text
steps: []
outputs:
  fraction: {from: "\${{ steps.check.fraction }}"}
  time_ms: {from: "\${{ steps.run.time_ms }}", unit: ms}
`;

/** A workflow like unicon/checked with no checker and no token. */
const TUNABLE_YAML = CHECKED_YAML.replace('  checker: file\n', '').replace(
  '  token: text\n',
  '',
);

const WORKFLOWS: WorkflowItem[] = [
  workflowItem({
    owner: 'unicon',
    name: 'checked',
    versions: ['v1', 'v3'],
    editable: false,
    visibility: 'public',
  }),
  workflowItem({ owner: 'my-org', name: 'tunable' }),
];

const PUBLISHED = published({ number: 4, grading_changed: true });

/**
 * The sum task with its settings as above, read and saved as values, and its
 * workflow declaring what `form` says. Each save is kept in `sent`; with
 * `conflictWith`, the first is refused as a conflict and the settings become
 * that text's, as if someone else had saved them.
 */
function taskBackend(
  options: {
    answer?: () => Response;
    conflictWith?: string;
    form?: WorkflowForm;
    contest?: string;
    /** The settings as stored, in place of the ones above. */
    content?: string;
    /** What the settings' read waits for once a save went through. */
    readAfterSave?: Promise<void>;
  } = {},
) {
  const { answer = () => HttpResponse.json(PUBLISHED), form = UNREAD } = options;
  let declaredNow = form;
  let settings = settingsOf(taskValuesOf(options.content ?? TASK), 'token-task');
  const sent: SaveRequest[] = [];
  server.use(
    signedIn,
    taskState,
    publicationList,
    http.get(`${TASK_API}/tree`, () => HttpResponse.json([])),
    http.get('/api/v1/blocks', () => HttpResponse.json(specCatalogue())),
    http.get(`${TASK_API}/settings`, async () => {
      if (sent.length > 0) await options.readAfterSave;
      return HttpResponse.json(settings);
    }),
    http.get(`${TASK_API}/workflow-form`, () => HttpResponse.json(declaredNow)),
    http.get('/api/v1/workflows', () => HttpResponse.json(WORKFLOWS)),
    http.get('/api/v1/workflow-search', () =>
      HttpResponse.json({ items: WORKFLOWS, next: null }),
    ),
    http.get('/api/v1/workflows/:owner/:name/versions/:version', ({ params }) =>
      HttpResponse.json(
        versionOf(params['name'] === 'tunable' ? TUNABLE_YAML : CHECKED_YAML),
      ),
    ),
    http.post(`${TASK_API}/save`, async ({ request }) => {
      const body = (await request.json()) as SaveRequest;
      sent.push(body);
      if (options.conflictWith !== undefined && sent.length === 1) {
        settings = settingsOf(taskValuesOf(options.conflictWith), 'token-theirs');
        return problem(409, 'conflict');
      }
      const change = body.changes.find((each) => each.path === 'task.yaml');
      // A save made with the token of settings since saved over is refused.
      if (change !== undefined && change.token !== settings.token) {
        return problem(409, 'conflict');
      }
      const answered = answer();
      // A refused save, such as one asking to confirm, writes nothing.
      if (change?.values != null && answered.ok) {
        settings = settingsOf(change.values, `token-${String(sent.length)}`);
      }
      return answered;
    }),
    ...repoFiles,
  );
  const { contest } = options;
  if (contest !== undefined) {
    server.use(
      http.get(`${CONTEST_API}/files/:path`, () =>
        HttpResponse.json(
          fileContent({
            path: 'contest.yaml',
            content: contest,
            token: 'token-contest',
          }),
        ),
      ),
    );
  }
  /** Someone else saving the task: its settings and what its workflow declares. */
  const elsewhere = (now: { content: string; form: WorkflowForm }) => {
    settings = settingsOf(taskValuesOf(now.content), 'token-theirs');
    declaredNow = now.form;
  };
  return { sent, elsewhere };
}

function asManager() {
  server.use(...signedInAs('manager', { task: publishedTask }));
}

function fill(field: HTMLElement, value: string) {
  fireEvent.change(field, { target: { value } });
}

/** A field inside one box of a card, found by the box's name. */
function fieldIn(
  scope: HTMLElement,
  box: string | RegExp,
  name: string | RegExp,
): HTMLElement {
  return within(within(scope).getByRole('group', { name: box })).getByLabelText(name);
}

/** The settings a save sent, as the file holds them. */
function written(body: SaveRequest | undefined): Record<string, unknown> {
  const change = body?.changes.find((each) => each.path === 'task.yaml');
  return taskFileOf(change?.values);
}

async function openTask() {
  renderApp('/orgs/acme/contests/spring/tasks/sum');
  const inputs = await screen.findByRole('region', { name: 'Inputs' });
  const tests = screen.getByRole('region', { name: 'Submissions' });
  const workflow = screen.getByRole('region', { name: 'Workflow' });
  return { inputs, tests, workflow };
}

/** The task opened by its manager, its checker stored as checker/checker.cpp. */
async function openWithChecker(form: WorkflowForm, ...handlers: RequestHandler[]) {
  const backend = taskBackend({ form });
  asManager();
  server.use(
    http.get(`${TASK_API}/tree`, ({ request }) =>
      new URL(request.url).searchParams.get('path') === 'checker'
        ? HttpResponse.json([file('checker/checker.cpp', 21)])
        : undefined,
    ),
    http.get(`${TASK_API}/files/:path`, ({ params }) =>
      decodeURIComponent(String(params['path'])) === 'checker/checker.cpp'
        ? HttpResponse.json(
            fileContent({
              path: 'checker/checker.cpp',
              content: 'int main() { return 0; }\n',
              token: 'token-checker',
            }),
          )
        : undefined,
    ),
    ...handlers,
  );
  const opened = await openTask();
  const checker = within(opened.inputs).getByRole('group', { name: 'checker' });
  return { ...backend, ...opened, checker };
}

async function save() {
  const bar = await screen.findByRole('region', { name: 'Save the task' });
  await userEvent.click(within(bar).getByRole('button', { name: 'Save' }));
  return bar;
}

/**
 * Each test drives the whole task page, its cards built from many reads,
 * which takes jsdom far longer than a browser, more so with the rest of the
 * suite running beside it.
 */
describe('the cards that build a task', { timeout: 30_000 }, () => {
  it('asks before leaving with changes not saved, and leaves at once after the save', async () => {
    taskBackend({ form: CHECKED });
    const page = '/orgs/acme/contests/spring/tasks/sum';
    const away = '/orgs/acme/contests/spring';
    const { router } = renderApp(page);
    const inputs = await screen.findByRole('region', { name: 'Inputs' });

    fill(fieldIn(inputs, 'Time limit (seconds)', /^Time limit/), '3');
    await act(() => router.navigate(away));
    const asking = await screen.findByRole('dialog', { name: 'Leave without saving?' });
    expect(asking).toHaveTextContent('Your changes to the task are not saved.');
    await userEvent.click(within(asking).getByRole('button', { name: 'Stay' }));
    expect(router.state.location.pathname).toBe(page);

    await save();
    await screen.findByText('Saved and published as publication 4.');
    await act(() => router.navigate(away));
    await waitFor(() => expect(router.state.location.pathname).toBe(away));
    expect(screen.queryByRole('dialog', { name: 'Leave without saving?' })).toBeNull();
  });

  it('names each input’s type in words, as the workflow editor does', async () => {
    taskBackend({ form: CHECKED });
    const { inputs } = await openTask();
    const typeOf = (name: string) =>
      within(within(inputs).getByRole('group', { name })).getByText(
        /^(File|One of a list|Number|True or false|Text)$/,
      ).textContent;
    expect(typeOf('submission')).toBe('File');
    expect(typeOf('language')).toBe('One of a list');
    expect(typeOf('Time limit (seconds)')).toBe('Number');
    expect(typeOf('strict')).toBe('True or false');
    expect(typeOf('greeting')).toBe('Text');
    expect(within(inputs).queryByText(/^(enum|boolean)$/)).toBeNull();
  });

  it('keeps a choice or a number on the inputs card as wide as it needs, not the card', async () => {
    taskBackend({ form: CHECKED });
    const { inputs } = await openTask();
    for (const field of [
      fieldIn(inputs, 'language', 'Who gives it'),
      fieldIn(inputs, 'Time limit (seconds)', /^Time limit/),
      fieldIn(inputs, 'strict', 'strict'),
    ]) {
      expect(field.closest('[class*="narrow"]')).not.toBeNull();
    }
  });

  it('builds the inputs from the workflow, each by its title, and saves what changed in one save', async () => {
    const { sent } = taskBackend({ form: CHECKED });
    asManager();
    const { inputs, tests } = await openTask();

    expect(within(tests).getByLabelText('Most submissions')).toBeDisabled();
    expect(fieldIn(inputs, 'Time limit (seconds)', /^Time limit/)).toHaveValue('2');
    expect(
      within(inputs).getByRole('button', { name: 'About Time limit (seconds)' }),
    ).toBeVisible();
    expect(fieldIn(inputs, 'submission', 'Who gives it')).toHaveValue('entrant');
    expect(fieldIn(inputs, 'Time limit (seconds)', 'Who gives it')).toHaveValue(
      'setting',
    );

    fill(fieldIn(inputs, 'submission', 'Label shown to entrants'), 'Your program');
    fireEvent.click(
      within(within(inputs).getByRole('group', { name: 'language' })).getByRole(
        'checkbox',
        { name: 'java' },
      ),
    );
    fill(fieldIn(inputs, 'Time limit (seconds)', /^Time limit/), '3');
    fill(fieldIn(inputs, 'memory_limit', 'memory_limit'), '256');
    fill(fieldIn(inputs, 'strict', 'strict'), 'true');
    fill(fieldIn(inputs, 'greeting', 'greeting'), '42');
    expect(
      within(within(inputs).getByRole('group', { name: 'token' })).getByRole(
        'checkbox',
        { name: 'Use one of the org’s secrets' },
      ),
    ).toBeChecked();

    const bar = await screen.findByRole('region', { name: 'Save the task' });
    expect(within(bar).getByRole('list', { name: 'What changed' })).toHaveTextContent(
      'Inputs: Time limit (seconds)',
    );
    await save();

    expect(
      await screen.findByText('Saved and published as publication 4.'),
    ).toBeVisible();
    expect(sent).toHaveLength(1);
    expect(sent[0]?.changes.find((change) => change.path === 'task.yaml')?.token).toBe(
      'token-task',
    );
    expect(written(sent[0])['inputs']).toEqual({
      submission: { entrant: { label: 'Your program', max_size: '1MB' } },
      language: { entrant: { options: ['cpp', 'python', 'java'], default: 'cpp' } },
      checker: 'checker/checker.cpp',
      time_limit: 3,
      token: { secret: 'judge-token' },
      memory_limit: 256,
      strict: true,
      greeting: '42',
    });
    expect(written(sent[0])['name']).toBe('Shortest Path');
  });

  it('shows, as an empty label’s placeholder, what entrants then see', async () => {
    taskBackend({
      form: {
        ...CHECKED,
        inputs: [
          declared('submission', 'file', { title: 'Solution' }),
          ...CHECKED.inputs.slice(1),
        ],
      },
    });
    const { inputs } = await openTask();

    // An empty label shows entrants the workflow's title, and its key only
    // where it gives none.
    expect(fieldIn(inputs, 'Solution', 'Label shown to entrants')).toHaveAttribute(
      'placeholder',
      'Solution',
    );
    expect(fieldIn(inputs, 'language', 'Label shown to entrants')).toHaveAttribute(
      'placeholder',
      'language',
    );
  });

  it('shows an entrant input’s help behind an ⓘ, and no input’s key beside its title (M45)', async () => {
    taskBackend({
      form: {
        ...CHECKED,
        inputs: [
          declared('submission', 'file', {
            title: 'Solution',
            help: 'The source file the contestant submits.',
          }),
          ...CHECKED.inputs.slice(1),
        ],
      },
    });
    const user = userEvent.setup();
    const { inputs } = await openTask();

    const solution = within(inputs).getByRole('group', { name: 'Solution' });
    await user.click(within(solution).getByRole('button', { name: 'About Solution' }));
    expect(
      await screen.findByText('The source file the contestant submits.'),
    ).toBeVisible();
    expect(within(solution).queryByText('submission')).toBeNull();
    // An input the workflow gives no title keeps its key as its title, and no ⓘ.
    const language = within(inputs).getByRole('group', { name: 'language' });
    expect(within(language).getByRole('heading', { name: 'language' })).toBeVisible();
    expect(within(language).queryByRole('button', { name: /^About/ })).toBeNull();
    expect(within(inputs).queryByText('time_limit')).toBeNull();
    expect(fieldIn(inputs, 'Time limit (seconds)', /^Time limit/)).toBeVisible();
  });

  it('views and replaces a setting’s file in its box, saving the new one with the task and taking out the old (M51)', async () => {
    const { sent, checker } = await openWithChecker(CHECKED);
    const user = userEvent.setup();

    expect(await within(checker).findByText('checker.cpp, 21 B')).toBeVisible();
    expect(within(checker).queryByRole('textbox')).toBeNull();
    await user.click(within(checker).getByRole('button', { name: 'View checker' }));
    expect(
      await within(checker).findByLabelText('What checker.cpp holds'),
    ).toHaveTextContent('int main() { return 0; }');

    await user.click(within(checker).getByRole('button', { name: 'Replace checker' }));
    await user.upload(
      within(checker).getByLabelText('checker: a new file'),
      new File(['print(1)\n'], 'checker.py'),
    );
    expect(await within(checker).findByText('checker.py, 9 B')).toBeVisible();
    // Waiting for the save, marked as a replaced test's row is.
    expect(within(checker).getByText('Replaced')).toBeVisible();
    const bar = await screen.findByRole('region', { name: 'Save the task' });
    // One change, said once.
    expect(
      within(within(bar).getByRole('list', { name: 'What changed' }))
        .getAllByRole('listitem')
        .map((item) => item.textContent)
        .filter((line) => line?.startsWith('Inputs:')),
    ).toEqual(['Inputs: checker, a new file']);
    await save();

    const body = await waitForSave(sent);
    expect(written(body)['inputs']).toMatchObject({ checker: 'checker/checker.py' });
    expect(body.changes.filter((change) => change.path.startsWith('checker/'))).toEqual(
      [
        {
          path: 'checker/checker.py',
          token: null,
          content: btoa('print(1)\n'),
          encoding: 'base64',
          remove: false,
        },
        {
          path: 'checker/checker.cpp',
          token: 'token-checker',
          remove: true,
          encoding: 'utf-8',
        },
      ],
    );
  });

  it('puts a setting’s file back as it was on Undo', async () => {
    const { checker } = await openWithChecker(CHECKED);
    const user = userEvent.setup();

    await within(checker).findByText('checker.cpp, 21 B');
    await user.click(within(checker).getByRole('button', { name: 'Replace checker' }));
    await user.upload(
      within(checker).getByLabelText('checker: a new file'),
      new File(['x'], 'other.cpp'),
    );
    await user.click(
      await within(checker).findByRole('button', {
        name: 'Undo the new file of checker',
      }),
    );
    expect(await within(checker).findByText('checker.cpp, 21 B')).toBeVisible();
    await waitFor(() =>
      expect(screen.queryByRole('list', { name: 'What changed' })).toBeNull(),
    );
  });

  it('offers an upload the door holds for a setting in its box, staging it for the save rather than saving (#570)', async () => {
    const { sent, checker } = await openWithChecker(
      CHECKED,
      http.get(`${TASK_API}/organise/part-uploads`, () =>
        HttpResponse.json([
          {
            ...partTransfer('up-checker', 'stored'),
            path: 'checker/big.bin',
            size: 300 * 1024,
          },
          // Not one the checker's box would write, nor one that has arrived whole.
          { ...partTransfer('up-tests', 'stored'), path: 'tests/big.bin' },
          { ...partTransfer('up-open', 'open'), path: 'checker/open.bin' },
        ]),
      ),
    );
    const user = userEvent.setup();

    await within(checker).findByText('checker.cpp, 21 B');
    const offered = await within(checker).findByRole('button', {
      name: 'Use uploaded: big.bin, 300 KB, for checker',
    });
    expect(within(checker).getAllByRole('button', { name: /^Use uploaded/ })).toEqual([
      offered,
    ]);
    await user.click(offered);
    expect(await within(checker).findByText('big.bin, 300 KB')).toBeVisible();
    expect(within(checker).getByText('Replaced')).toBeVisible();
    expect(within(checker).queryByRole('button', { name: /^Use uploaded/ })).toBeNull();
    // Staged, not saved: the save bar holds it until Save.
    expect(sent).toHaveLength(0);

    // Undo clears it, and the upload is offered again.
    await user.click(
      within(checker).getByRole('button', { name: 'Undo the new file of checker' }),
    );
    expect(await within(checker).findByText('checker.cpp, 21 B')).toBeVisible();
    await user.click(
      await within(checker).findByRole('button', {
        name: 'Use uploaded: big.bin, 300 KB, for checker',
      }),
    );
    await within(checker).findByText('big.bin, 300 KB');
    expect(sent).toHaveLength(0);
    await save();

    const body = await waitForSave(sent);
    expect(written(body)['inputs']).toMatchObject({ checker: 'checker/big.bin' });
    // Written by the upload's id, so nothing is sent again.
    expect(body.changes.filter((change) => change.path.startsWith('checker/'))).toEqual(
      [
        {
          path: 'checker/big.bin',
          token: null,
          upload: 'up-checker',
          encoding: 'utf-8',
          remove: false,
        },
        {
          path: 'checker/checker.cpp',
          token: 'token-checker',
          remove: true,
          encoding: 'utf-8',
        },
      ],
    );
  });

  describe('a file chosen for a setting, through a change of workflow', () => {
    /** The checker replaced by checker.py, waiting for the save. */
    async function replaceChecker(form: WorkflowForm) {
      const opened = await openWithChecker(form);
      const { checker } = opened;
      const user = userEvent.setup();
      await within(checker).findByText('checker.cpp, 21 B');
      await user.click(
        within(checker).getByRole('button', { name: 'Replace checker' }),
      );
      await user.upload(
        within(checker).getByLabelText('checker: a new file'),
        new File(['print(1)\n'], 'checker.py'),
      );
      await within(checker).findByText('checker.py, 9 B');
      return opened;
    }

    it('stays, the setting naming it, when the new version still takes that input as a file', async () => {
      const { sent, workflow } = await replaceChecker({
        ...CHECKED,
        newer: 'v3',
      });

      await userEvent.click(
        within(
          within(workflow).getByRole('status', { name: 'A newer version' }),
        ).getByRole('button', { name: 'Use v3' }),
      );

      // The card is drawn again from the new version once it is read.
      const checker = () =>
        within(
          within(screen.getByRole('region', { name: 'Inputs' })).getByRole('group', {
            name: 'checker',
          }),
        );
      await waitFor(() =>
        expect(
          within(workflow).getByText('unicon/checked@v3', { exact: true }),
        ).toBeVisible(),
      );
      await waitFor(() => expect(checker().getByText('checker.py, 9 B')).toBeVisible());
      expect(checker().getByText('Replaced')).toBeVisible();
      await save();
      const body = await waitForSave(sent);
      expect(written(body)['workflow']).toBe('unicon/checked@v3');
      expect(written(body)['inputs']).toMatchObject({ checker: 'checker/checker.py' });
      expect(
        body.changes
          .filter((change) => change.path.startsWith('checker/'))
          .map((change) => change.path),
      ).toEqual(['checker/checker.py', 'checker/checker.cpp']);
    });

    it('goes with the input when the new version does not have it', async () => {
      const { sent, workflow } = await replaceChecker({ ...CHECKED, newer: 'v3' });
      server.use(
        http.get('/api/v1/workflows/:owner/:name/versions/:version', ({ params }) =>
          params['version'] === 'v3'
            ? HttpResponse.json(
                versionOf(CHECKED_YAML.replace('  checker: file\n', '')),
              )
            : undefined,
        ),
      );

      await userEvent.click(
        within(
          within(workflow).getByRole('status', { name: 'A newer version' }),
        ).getByRole('button', { name: 'Use v3' }),
      );

      const bar = await screen.findByRole('region', { name: 'Save the task' });
      await waitFor(() =>
        expect(
          within(bar).getByRole('list', { name: 'What changed' }),
        ).not.toHaveTextContent('a new file'),
      );
      await save();
      const body = await waitForSave(sent);
      expect(
        body.changes.filter((change) => change.path.startsWith('checker/')),
      ).toEqual([]);
    });
  });

  it('says a newer version of the workflow is out and takes it only when asked', async () => {
    const { sent } = taskBackend({ form: { ...CHECKED, newer: 'v3' } });
    asManager();
    const { workflow } = await openTask();

    const notice = within(workflow).getByRole('status', { name: 'A newer version' });
    expect(notice).toHaveTextContent('v3 available');
    expect(notice).toHaveTextContent(
      'The task grades with unicon/checked@v1 until unicon/checked@v3 is chosen and saved.',
    );
    expect(
      within(workflow).getByRole('link', { name: 'Open unicon/checked@v1' }),
    ).toBeVisible();
    await userEvent.click(within(notice).getByRole('button', { name: 'Use v3' }));

    expect(
      within(workflow).getByText('unicon/checked@v3', { exact: true }),
    ).toBeVisible();
    expect(sent).toEqual([]);
    await save();
    expect(written(await waitForSave(sent))['workflow']).toBe('unicon/checked@v3');
  });

  it('shows the inputs the workflow’s steps read behind the editor’s switch, hidden at first', async () => {
    taskBackend({ form: CHECKED });
    server.use(
      http.get('/api/v1/primitives', () => HttpResponse.json(PRIMITIVES)),
      http.get('/api/v1/workflows/:owner/:name/versions/:version', () =>
        HttpResponse.json(versionOf(CLASSIC)),
      ),
    );
    asManager();
    const { workflow } = await openTask();

    expect(
      await within(workflow).findByRole('group', { name: 'Step run' }),
    ).toBeVisible();
    expect(
      within(workflow).queryByRole('group', { name: 'Input submission' }),
    ).toBeNull();
    await userEvent.click(
      within(workflow).getByRole('checkbox', { name: 'Show inputs and files' }),
    );

    expect(
      within(workflow).getByRole('group', { name: 'Input submission' }),
    ).toBeVisible();
    expect(localStorage.getItem(INPUTS_SHOWN_KEY)).toBe('shown');
  });

  it('opens a box of the workflow in the drawer its own page opens, nothing to change', async () => {
    taskBackend({ form: CHECKED });
    server.use(
      http.get('/api/v1/primitives', () => HttpResponse.json(PRIMITIVES)),
      http.get('/api/v1/workflows/:owner/:name/versions/:version', () =>
        HttpResponse.json(versionOf(CLASSIC)),
      ),
    );
    asManager();
    const { workflow } = await openTask();

    const run = await within(workflow).findByRole('group', { name: 'Step run' });
    await userEvent.click(within(run).getByRole('button', { name: /^run/ }));
    const drawer = await screen.findByRole('complementary', { name: 'Step run' });
    expect(within(drawer).getByRole('textbox', { name: 'Name' })).toBeDisabled();
    expect(within(drawer).queryByRole('button', { name: /^Remove/ })).toBeNull();
  });

  it('lists another’s public workflow the list leaves out, with its versions', async () => {
    taskBackend({
      form: CHECKED,
      content: TASK.replace('unicon/checked@v1', 'judgekit/special@v1'),
    });
    server.use(
      http.get('/api/v1/workflows/judgekit/special', () =>
        HttpResponse.json({
          owner: 'judgekit',
          name: 'special',
          visibility: 'public',
          versions: ['v1', 'v2'],
          editable: false,
          draft: null,
          readers: [],
        }),
      ),
    );
    asManager();
    const { workflow } = await openTask();

    expect(
      await within(workflow).findByText('judgekit/special@v1', { exact: true }),
    ).toBeVisible();
    expect(
      await within(workflow).findByRole('button', { name: 'Choose a workflow' }),
    ).toBeEnabled();
  });

  it('says the organiser cannot see a workflow they may not read', async () => {
    taskBackend({
      form: CHECKED,
      content: TASK.replace('unicon/checked@v1', 'someone/hidden@v1'),
    });
    server.use(
      http.get('/api/v1/workflows/someone/hidden', () => problem(404, 'not_found')),
    );
    asManager();
    const { workflow } = await openTask();

    expect(
      await within(workflow).findByText('This workflow could not be read.'),
    ).toBeVisible();
    expect(
      within(workflow).getByText('someone/hidden@v1', { exact: true }),
    ).toBeVisible();
  });

  it('shows the inputs of another workflow as soon as it is chosen, and drops those it does not have', async () => {
    const { sent } = taskBackend({ form: CHECKED });
    asManager();
    const { inputs, workflow } = await openTask();

    expect(within(inputs).getByRole('group', { name: 'checker' })).toBeVisible();
    await userEvent.click(
      await within(workflow).findByRole('button', { name: 'Choose a workflow' }),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Choose my-org/tunable' }),
    );
    await waitFor(() =>
      expect(within(inputs).queryByRole('group', { name: 'checker' })).toBeNull(),
    );
    expect(within(inputs).queryByRole('group', { name: 'token' })).toBeNull();
    fill(fieldIn(inputs, 'Time limit (seconds)', /^Time limit/), '4');
    await save();

    const saved = written(await waitForSave(sent));
    expect(saved['workflow']).toBe('my-org/tunable@v1');
    expect(saved['inputs']).toEqual({
      submission: { entrant: { label: 'Your solution', max_size: '1MB' } },
      language: { entrant: { options: ['cpp', 'python'], default: 'cpp' } },
      time_limit: 4,
    });
  });

  it('drops a run column another workflow chosen does not have, keeping its rows', async () => {
    const { sent } = taskBackend({
      form: CHECKED,
      content: `name: Sum
workflow: unicon/checked@v1
inputs:
  submission: entrant
  time_limit: 2
repeat:
  - inputs: [checker, greeting]
    tuples:
      - {checker: checker/a.cpp, greeting: hi}
      - {checker: checker/b.cpp, greeting: yo}
`,
    });
    asManager();
    const { workflow } = await openTask();
    const runs = screen.getByRole('region', { name: 'Runs' });
    expect(within(runs).getByRole('columnheader', { name: /checker/i })).toBeVisible();

    await userEvent.click(
      await within(workflow).findByRole('button', { name: 'Choose a workflow' }),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Choose my-org/tunable' }),
    );
    await waitFor(() =>
      expect(within(runs).queryByRole('columnheader', { name: /checker/i })).toBeNull(),
    );
    await save();

    expect(written(await waitForSave(sent))['repeat']).toEqual([
      { inputs: ['greeting'], tuples: [{ greeting: 'hi' }, { greeting: 'yo' }] },
    ]);
  });

  it('offers to remove a run column the workflow does not have, and saves without it', async () => {
    const { sent } = taskBackend({
      form: CHECKED,
      content: `name: Sum
workflow: unicon/checked@v1
inputs:
  submission: entrant
  time_limit: 2
repeat:
  - inputs: [input, answer, greeting]
    tuples:
      - {input: tests/1.in, answer: tests/1.ans, greeting: hi}
`,
    });
    asManager();
    await openTask();
    const runs = screen.getByRole('region', { name: 'Runs' });
    expect(runs).toHaveTextContent('Not an input of the workflow');

    await userEvent.click(within(runs).getByRole('button', { name: 'Remove input' }));
    await userEvent.click(within(runs).getByRole('button', { name: 'Remove answer' }));
    expect(within(runs).queryByRole('button', { name: /^Remove (?!row )/ })).toBeNull();
    await save();

    expect(written(await waitForSave(sent))['repeat']).toEqual([
      { inputs: ['greeting'], tuples: [{ greeting: 'hi' }] },
    ]);
  });

  it('removes an input’s key when its value is cleared, and one the workflow does not have', async () => {
    const { sent } = taskBackend({
      form: {
        ...CHECKED,
        inputs: CHECKED.inputs.filter((input) => input.id !== 'token'),
      },
    });
    asManager();
    const { inputs } = await openTask();

    fill(fieldIn(inputs, 'Time limit (seconds)', /^Time limit/), '');
    const unused = within(inputs).getByRole('region', {
      name: 'Not used by this workflow',
    });
    await userEvent.click(within(unused).getByRole('button', { name: 'Remove token' }));
    fill(fieldIn(inputs, 'submission', 'Label shown to entrants'), '');
    fill(fieldIn(inputs, 'submission', 'Maximum size'), '');
    await save();

    const saved = written(await waitForSave(sent)) as {
      inputs: Record<string, unknown>;
    };
    // An entrant input with nothing set for entrants is the entrant's alone.
    expect(saved.inputs).toEqual({
      submission: 'entrant',
      language: { entrant: { options: ['cpp', 'python'], default: 'cpp' } },
      checker: 'checker/checker.cpp',
    });
  });

  it('asks for a workflow, with why, when the saved one cannot be read, and saves the inputs as they are', async () => {
    const { sent } = taskBackend();
    const { inputs, tests } = await openTask();

    expect(within(inputs).getByText('Choose a workflow.')).toBeVisible();
    expect(
      within(inputs).getByText('The workflow unicon/checked@v1 cannot be read.'),
    ).toBeVisible();
    expect(within(inputs).queryAllByRole('textbox')).toHaveLength(0);
    expect(within(inputs).queryAllByRole('group')).toHaveLength(0);

    fill(within(tests).getByLabelText('Most submissions'), '20');
    await save();
    expect(written(await waitForSave(sent))['inputs']).toEqual({
      submission: { entrant: { label: 'Your solution', max_size: '1MB' } },
      language: { entrant: { options: ['cpp', 'python'], default: 'cpp' } },
      checker: 'checker/checker.cpp',
      time_limit: 2,
      token: { secret: 'judge-token' },
    });
  });

  it('keeps the stored inputs and runs when the saved workflow that cannot be read is chosen again', async () => {
    const { sent } = taskBackend({
      content: `name: Sum
workflow: unicon/checked@v1
inputs:
  submission: entrant
  checker: checker/checker.cpp
  time_limit: 2
  token: {secret: judge-token}
repeat:
  - inputs: [answer, greeting]
    tuples:
      - {answer: tests/1.ans, greeting: hi}
`,
    });
    const { inputs, tests, workflow } = await openTask();
    const runs = screen.getByRole('region', { name: 'Runs' });

    await userEvent.click(
      await within(workflow).findByRole('button', { name: 'Choose a workflow' }),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Choose my-org/tunable' }),
    );
    expect(
      await within(inputs).findByRole('group', { name: 'Time limit (seconds)' }),
    ).toBeVisible();
    expect(within(inputs).queryByRole('group', { name: 'checker' })).toBeNull();
    await waitFor(() =>
      expect(within(runs).queryByRole('columnheader', { name: /answer/i })).toBeNull(),
    );

    await userEvent.click(
      within(workflow).getByRole('button', { name: 'Choose a workflow' }),
    );
    await userEvent.selectOptions(
      await screen.findByRole('combobox', { name: 'Version of unicon/checked' }),
      'v1',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Choose unicon/checked' }),
    );
    expect(await within(inputs).findByText('Choose a workflow.')).toBeVisible();

    fill(within(tests).getByLabelText('Most submissions'), '20');
    await save();
    const saved = written(await waitForSave(sent));
    expect(saved['workflow']).toBe('unicon/checked@v1');
    expect(saved['inputs']).toEqual({
      submission: 'entrant',
      checker: 'checker/checker.cpp',
      time_limit: 2,
      token: { secret: 'judge-token' },
    });
    expect(saved['repeat']).toEqual([
      {
        inputs: ['answer', 'greeting'],
        tuples: [{ answer: 'tests/1.ans', greeting: 'hi' }],
      },
    ]);
  });

  it('asks for a workflow, with why, when the task names none, and shows its inputs once one is chosen', async () => {
    taskBackend({
      content: 'name: Sum\n',
      form: {
        ...UNREAD,
        workflow: null,
        problem: 'The task does not name a workflow yet. Choose one.',
      },
    });
    asManager();
    const { inputs, workflow } = await openTask();

    expect(within(inputs).getByText('Choose a workflow.')).toBeVisible();
    expect(
      within(inputs).getByText('The task does not name a workflow yet. Choose one.'),
    ).toBeVisible();
    expect(within(inputs).queryAllByRole('textbox')).toHaveLength(0);

    await userEvent.click(
      await within(workflow).findByRole('button', { name: 'Choose a workflow' }),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Choose my-org/tunable' }),
    );
    expect(
      await within(inputs).findByRole('group', { name: 'Time limit (seconds)' }),
    ).toBeVisible();
    expect(within(inputs).queryByText('Choose a workflow.')).toBeNull();
  });

  it('says settings that do not read as settings, such as an upload, cannot be shown as cards', async () => {
    taskBackend();
    server.use(
      http.get(`${TASK_API}/settings`, () =>
        HttpResponse.json(settingsOf(null, 'token-task')),
      ),
    );
    renderApp('/orgs/acme/contests/spring/tasks/sum');

    const unread = await screen.findByText(
      /The task’s settings cannot be read: The file does not hold named settings\./,
    );
    expect(
      within(unread.closest('[role="alert"]') as HTMLElement).getByRole('link', {
        name: 'Settings',
      }),
    ).toHaveAttribute('href', '/orgs/acme/contests/spring/tasks/sum/settings');
    expect(screen.queryByRole('region', { name: 'Inputs' })).toBeNull();
  });

  it('keeps an observer’s fields readable, hides changes, and links the role chip to task organisers', async () => {
    taskBackend({ form: CHECKED });
    server.use(...signedInAs('observer', { task: publishedTask }));
    const { inputs } = await openTask();
    expect(fieldIn(inputs, 'Time limit (seconds)', /^Time limit/)).toBeDisabled();
    const scoring = screen.getByRole('region', { name: 'Scoring' });
    expect(within(scoring).getByText('Read only')).toBeVisible();
    expect(within(scoring).queryByRole('button', { name: 'Add a value' })).toBeNull();
    const checks = screen.getByRole('region', { name: 'Checks' });
    expect(within(checks).queryByRole('button', { name: 'Add a check' })).toBeNull();
    await userEvent.click(
      within(scoring).getByRole('button', { name: 'About Read only' }),
    );
    expect(
      within(screen.getByText(/Your role here/)).getByRole('link', {
        name: 'Task organisers',
      }),
    ).toHaveAttribute('href', '/orgs/acme/contests/spring/tasks/sum/organisers');
  });

  it('lets an admin change the submission rules, and names a draft’s problems where they are fixed', async () => {
    const { sent } = taskBackend({
      answer: () =>
        HttpResponse.json({ version: '5e6f', errors: draftTask.errors, held_back: [] }),
    });
    const { tests } = await openTask();

    fill(within(tests).getByLabelText('Most submissions'), '20');
    fill(within(tests).getByLabelText('Submissions in a window'), '2');
    fill(within(tests).getByLabelText('Length of the window (seconds)'), '60');
    await save();

    const outcome = (await screen.findByText(/Saved as a draft/))
      .parentElement as HTMLElement;
    expect(within(outcome).getByRole('list', { name: 'Errors' })).toHaveTextContent(
      'Inputs: setter: There is no file under data/hidden/ in the task.',
    );
    expect(written(sent[0])['submissions']).toEqual({
      max: 20,
      rate: { count: 2, per: 60 },
    });
  });

  it('refuses the save, rather than merging, when someone else saved the settings first', async () => {
    const theirs = TASK.replace('time_limit: 2', 'time_limit: 5');
    const { sent } = taskBackend({ conflictWith: theirs, form: CHECKED });
    const { inputs, tests } = await openTask();

    fill(fieldIn(inputs, 'Time limit (seconds)', /^Time limit/), '3');
    fill(within(tests).getByLabelText('Most submissions'), '20');
    await save();

    expect(
      await screen.findByRole('button', { name: 'Reload the file' }),
    ).toBeVisible();
    expect(screen.queryByRole('list', { name: 'Fields that differ' })).toBeNull();
    expect(sent).toHaveLength(1);
    expect(fieldIn(inputs, 'Time limit (seconds)', /^Time limit/)).toHaveValue('3');
  });
});

describe('the cards while the task is being changed', { timeout: 30_000 }, () => {
  beforeEach(fakeLiveStream);
  afterEach(realLiveStream);

  it('keep what was changed, and do not spin, when the tab comes back, and meet someone else’s save at the save', async () => {
    const { sent, elsewhere } = taskBackend({ form: CHECKED });
    const { inputs, tests } = await openTask();
    openStream();
    fill(fieldIn(inputs, 'Time limit (seconds)', /^Time limit/), '3');
    fill(within(tests).getByLabelText('Most submissions'), '20');

    // Someone else saves the task meanwhile, and a submission is graded.
    elsewhere({
      content: TASK.replace('time_limit: 2', 'time_limit: 5'),
      form: { ...CHECKED, graded: true },
    });
    await afterAnswers(comeBackToTab);

    const cards = screen.getByRole('region', { name: 'Inputs' });
    expect(fieldIn(cards, 'Time limit (seconds)', /^Time limit/)).toHaveValue('3');
    expect(
      within(screen.getByRole('region', { name: 'Submissions' })).getByLabelText(
        'Most submissions',
      ),
    ).toHaveValue('20');
    const bar = screen.getByRole('region', { name: 'Save the task' });
    const button = within(bar).getByRole('button', { name: 'Save' });
    expect(button).not.toHaveAttribute('data-loading');
    expect(button).toBeEnabled();

    await userEvent.click(button);

    expect(
      await screen.findByRole('button', { name: 'Reload the file' }),
    ).toBeVisible();
    const yaml = sent[0]?.changes.find((change) => change.path === 'task.yaml');
    expect(yaml?.token).toBe('token-task');
  });
});

describe('reloading at a conflict', { timeout: 30_000 }, () => {
  it('drops my changes and shows the settings as they are now', async () => {
    const theirs = TASK.replace('time_limit: 2', 'time_limit: 5');
    taskBackend({ conflictWith: theirs, form: CHECKED });
    const { tests } = await openTask();

    fill(within(tests).getByLabelText('Most submissions'), '20');
    await save();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Reload the file' }),
    );

    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Save the task' })).toBeNull(),
    );
    const inputs = await screen.findByRole('region', { name: 'Inputs' });
    expect(await within(inputs).findByDisplayValue('5')).toBeVisible();
    expect(
      within(screen.getByRole('region', { name: 'Submissions' })).getByLabelText(
        'Most submissions',
      ),
    ).toHaveValue('50');
  });
});

/** The first save sent, once it has been. */
async function waitForSave(sent: SaveRequest[]): Promise<SaveRequest> {
  await expect.poll(() => sent.length).toBeGreaterThan(0);
  return sent[0] as SaveRequest;
}

describe('the save’s answer (M66)', { timeout: 30_000 }, () => {
  it('stands in the page at the bar’s place once nothing is left to save, with Close', async () => {
    taskBackend({ form: CHECKED });
    const { inputs } = await openTask();

    fill(fieldIn(inputs, 'Time limit (seconds)', /^Time limit/), '3');
    const bar = await screen.findByRole('region', { name: 'Save the task' });
    // While there is something to save, the bar stays in view at the window's foot.
    expect(bar).not.toHaveClass(/saveSettled/);
    await save();

    expect(
      await screen.findByText('Saved and published as publication 4.'),
    ).toBeVisible();
    const answer = screen.getByRole('region', { name: 'Save the task' });
    await waitFor(() => expect(answer).toHaveClass(/saveSettled/));
    await userEvent.click(
      within(answer).getByRole('button', { name: 'Close the save’s answer' }),
    );
    expect(screen.queryByRole('region', { name: 'Save the task' })).toBeNull();
  });

  it('goes once something is changed again, rather than standing beside changes it does not cover', async () => {
    taskBackend({ form: CHECKED });
    const { inputs } = await openTask();

    fill(fieldIn(inputs, 'Time limit (seconds)', /^Time limit/), '3');
    await save();
    expect(
      await screen.findByText('Saved and published as publication 4.'),
    ).toBeVisible();
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Save the task' })).toHaveClass(
        /saveSettled/,
      ),
    );

    fill(
      fieldIn(
        screen.getByRole('region', { name: 'Inputs' }),
        'Time limit (seconds)',
        /^Time limit/,
      ),
      '4',
    );
    const bar = await screen.findByRole('region', { name: 'Save the task' });
    await waitFor(() =>
      expect(bar).not.toHaveTextContent('Saved and published as publication 4.'),
    );
    expect(bar).not.toHaveClass(/saveSettled/);
    expect(within(bar).getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('leaves nothing to save once a confirmed publish answered, while the task is read again (M66)', async () => {
    let release = () => {};
    const readAfterSave = new Promise<void>((resolve) => {
      release = resolve;
    });
    let asked = false;
    taskBackend({
      form: CHECKED,
      readAfterSave,
      answer: () => {
        if (asked) return HttpResponse.json(PUBLISHED);
        asked = true;
        return problem(409, 'confirmation_required', {
          detail: 'The contest is running and this changes how the task grades.',
          changes: ['limits.time changed'],
          regrades: 2,
        });
      },
    });
    const { inputs } = await openTask();

    fill(fieldIn(inputs, 'Time limit (seconds)', /^Time limit/), '3');
    await save();
    const bar = screen.getByRole('region', { name: 'Save the task' });
    await userEvent.click(
      await within(bar).findByRole('button', { name: 'Publish the change' }),
    );

    expect(
      await screen.findByText('Saved and published as publication 4.'),
    ).toBeVisible();
    // The task is still being read again, and nothing is left to save.
    expect(bar).not.toHaveTextContent(/to save/);
    expect(within(bar).queryByRole('button', { name: 'Save' })).toBeNull();
    expect(within(bar).queryByRole('button', { name: 'Discard changes' })).toBeNull();

    release();
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Save the task' })).toHaveClass(
        /saveSettled/,
      ),
    );
    expect(screen.getByRole('region', { name: 'Save the task' })).toHaveTextContent(
      'Saved and published as publication 4.',
    );
  });

  it('stays in view while it asks to publish or keep a draft, with no Close', async () => {
    taskBackend({
      form: CHECKED,
      answer: () =>
        problem(409, 'confirmation_required', {
          detail: 'The contest is running and this changes how the task grades.',
          changes: ['limits.time changed'],
          regrades: 2,
        }),
    });
    const { inputs } = await openTask();

    fill(fieldIn(inputs, 'Time limit (seconds)', /^Time limit/), '3');
    await save();
    const bar = screen.getByRole('region', { name: 'Save the task' });
    expect(
      await within(bar).findByRole('button', { name: 'Publish the change' }),
    ).toBeVisible();
    expect(bar).not.toHaveClass(/saveSettled/);
    expect(
      within(bar).queryByRole('button', { name: 'Close the save’s answer' }),
    ).toBeNull();
  });

  it('holds the cards as they were asked about while the question stands, its two answers the only way on', async () => {
    taskBackend({
      form: CHECKED,
      answer: () =>
        problem(409, 'confirmation_required', {
          detail: 'The contest is running, so this save asks before it publishes.',
          changes: [],
          regrades: 0,
          ...unchanged,
          asked: 'b1c2d3e:12',
        }),
    });
    const { inputs } = await openTask();

    fill(fieldIn(inputs, 'Time limit (seconds)', /^Time limit/), '3');
    await save();
    const bar = screen.getByRole('region', { name: 'Save the task' });
    expect(
      await within(bar).findByRole('button', { name: 'Publish the change' }),
    ).toBeVisible();
    expect(fieldIn(inputs, 'Time limit (seconds)', /^Time limit/)).toBeDisabled();
    expect(within(bar).queryByRole('button', { name: 'Save' })).toBeNull();
    expect(within(bar).getByRole('button', { name: 'Discard changes' })).toBeEnabled();
  });
});

function runForm(workflow: string, inputs: DeclaredInput[]): WorkflowForm {
  return {
    workflow,
    problem: null,
    graded: false,
    newer: null,
    inputs,
    yanked: null,
    text_values: null,
  };
}

async function who(inputs: HTMLElement, id: string, gives: string) {
  await userEvent.selectOptions(fieldIn(inputs, id, 'Who gives it'), gives);
}

describe('islands, cartpole and tour', { timeout: 60_000 }, () => {
  it('saves islands’ inputs and its runs, each file at the path the editor names', async () => {
    const { sent } = taskBackend({
      content: 'name: Islands\nworkflow: unicon/classic@v6\n',
      form: runForm('unicon/classic@v6', [
        declared('code', 'file'),
        declared('language', 'enum', { options: ['cpp', 'python'] }),
        declared('time_limit', 'number'),
        declared('memory_limit', 'number'),
        declared('input', 'file'),
        declared('answer', 'file'),
      ]),
    });
    const { inputs } = await openTask();

    await who(inputs, 'code', 'The entrant gives it');
    fill(fieldIn(inputs, 'code', 'Label shown to entrants'), 'Your solution');
    fill(fieldIn(inputs, 'code', 'Maximum size'), '1MB');
    await who(inputs, 'language', 'The entrant gives it');
    const language = within(inputs).getByRole('group', { name: 'language' });
    await userEvent.click(within(language).getByRole('checkbox', { name: 'cpp' }));
    await userEvent.click(within(language).getByRole('checkbox', { name: 'python' }));
    await userEvent.selectOptions(
      within(language).getByRole('combobox', { name: 'Chosen to start with' }),
      'cpp',
    );
    fill(fieldIn(inputs, 'time_limit', 'time_limit'), '2');
    fill(fieldIn(inputs, 'memory_limit', 'memory_limit'), '256');
    await who(inputs, 'input', 'You set one for each run');
    await who(inputs, 'answer', 'You set one for each run');

    const runs = screen.getByRole('region', { name: 'Runs' });
    fill(within(runs).getByRole('textbox', { name: 'Name of row 1' }), 'Sample 1');
    await userEvent.upload(
      within(runs).getByLabelText('File for row 1 input'),
      new File(['1'], '1.in'),
    );
    await userEvent.upload(
      within(runs).getByLabelText('File for row 1 answer'),
      new File(['2'], '1.ans'),
    );
    await userEvent.click(within(runs).getByRole('button', { name: 'Add a row' }));
    fill(within(runs).getByRole('textbox', { name: 'Name of row 2' }), 'Sample 2');
    await userEvent.upload(
      within(runs).getByLabelText('File for row 2 input'),
      new File(['3'], '2.in'),
    );
    await userEvent.upload(
      within(runs).getByLabelText('File for row 2 answer'),
      new File(['4'], '2.ans'),
    );
    expect(runs).toHaveTextContent('This makes 2 runs.');
    await save();

    expect(written(sent[0])).toMatchObject({
      name: 'Islands',
      workflow: 'unicon/classic@v6',
      inputs: {
        code: { entrant: { label: 'Your solution', max_size: '1MB' } },
        language: { entrant: { options: ['cpp', 'python'], default: 'cpp' } },
        time_limit: 2,
        memory_limit: 256,
      },
      repeat: [
        {
          inputs: ['input', 'answer'],
          tuples: [
            {
              input: 'runs/0/0/input',
              answer: 'runs/0/0/answer',
              title: 'Sample 1',
            },
            {
              input: 'runs/0/1/input',
              answer: 'runs/0/1/answer',
              title: 'Sample 2',
            },
          ],
        },
      ],
    });
    const planned = sent[0]?.changes.map((change) => change.path) ?? [];
    expect(planned).toEqual(
      expect.arrayContaining([
        'task.yaml',
        'runs/0/0/input',
        'runs/0/0/answer',
        'runs/0/1/input',
        'runs/0/1/answer',
      ]),
    );
  });

  it('keeps Save waiting until a chosen run file has been read', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { sent } = taskBackend({
      content: 'name: Islands\nworkflow: unicon/classic@v6\n',
      form: runForm('unicon/classic@v6', [
        declared('time_limit', 'number'),
        declared('input', 'file'),
      ]),
    });
    server.use(
      http.get(`${TASK_API}/files/:path`, async ({ params }) => {
        const path = decodeURIComponent(String(params['path']));
        if (!path.startsWith('runs/')) return undefined;
        await gate;
        return problem(404, 'not_found');
      }),
    );
    const { inputs } = await openTask();
    fill(fieldIn(inputs, 'time_limit', 'time_limit'), '2');
    await who(inputs, 'input', 'You set one for each run');
    const bar = await screen.findByRole('region', { name: 'Save the task' });
    const runs = screen.getByRole('region', { name: 'Runs' });
    await userEvent.upload(
      within(runs).getByLabelText('File for row 1 input'),
      new File(['1'], '1.in'),
    );
    expect(within(bar).getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(sent).toHaveLength(0);
    release();
    await waitFor(() =>
      expect(within(bar).getByRole('button', { name: 'Save' })).toBeEnabled(),
    );
    await save();
    expect(sent[0]?.changes.map((change) => change.path)).toEqual(
      expect.arrayContaining(['task.yaml', 'runs/0/0/input']),
    );
  });

  it('clears a discarded upload when a run cell returns from the entrant', async () => {
    taskBackend({
      content:
        'name: Tests\nworkflow: unicon/classic@v6\nrepeat:\n  - inputs: [input]\n    tuples: [{input: ""}]\n',
      form: runForm('unicon/classic@v6', [declared('input', 'file')]),
    });
    await openTask();
    const runs = screen.getByRole('region', { name: 'Runs' });
    await userEvent.upload(
      within(runs).getByLabelText('File for row 1 input'),
      new File(['1'], '1.in'),
    );
    await within(runs).findByText('New');
    await userEvent.click(
      within(runs).getByRole('button', { name: 'Actions for row 1 input' }),
    );
    await userEvent.click(
      screen.getByRole('menuitem', { name: 'The entrant gives this one' }),
    );
    await userEvent.click(
      within(runs).getByRole('button', { name: 'Actions for row 1 input' }),
    );
    await userEvent.click(screen.getByRole('menuitem', { name: 'You give this one' }));
    expect(within(runs).getByLabelText('File for row 1 input')).toBeVisible();
    expect(within(runs).queryByText('runs/0/0/input')).toBeNull();
  });

  it('pairs two test files in one row and stages both in the task’s save', async () => {
    const { sent } = taskBackend({
      content:
        'name: Tests\nworkflow: unicon/classic@v6\nrepeat:\n  - inputs: [input, answer]\n    tuples: []\n',
      form: runForm('unicon/classic@v6', [
        declared('input', 'file'),
        declared('answer', 'file'),
      ]),
    });
    await openTask();
    const runs = screen.getByRole('region', { name: 'Runs' });
    await userEvent.upload(within(runs).getByLabelText('Add files'), [
      new File(['1'], '1.in'),
      new File(['2'], '1.ans'),
    ]);
    expect(within(runs).getByText('Where these files go')).toBeVisible();
    await userEvent.click(within(runs).getByRole('button', { name: 'Add these' }));
    await waitFor(() => expect(within(runs).getAllByText('New')).toHaveLength(2));
    await save();
    expect(written(sent[0])).toMatchObject({
      repeat: [
        {
          inputs: ['input', 'answer'],
          tuples: [{ title: '1', input: 'runs/0/0/input', answer: 'runs/0/0/answer' }],
        },
      ],
    });
    expect(sent[0]?.changes.map((change) => change.path)).toEqual(
      expect.arrayContaining(['runs/0/0/input', 'runs/0/0/answer']),
    );
  });

  it('keeps a remaining row’s file when another row is removed and a new row uploaded', async () => {
    const { sent } = taskBackend({
      content:
        'name: Files\nworkflow: unicon/classic@v6\nrepeat:\n  - inputs: [input]\n    tuples: [{input: runs/0/0/input}, {input: runs/0/1/input}]\n',
      form: runForm('unicon/classic@v6', [declared('input', 'file')]),
    });
    await openTask();
    const runs = screen.getByRole('region', { name: 'Runs' });
    await userEvent.click(within(runs).getByRole('button', { name: 'Remove row 1' }));
    await userEvent.click(within(runs).getByRole('button', { name: 'Add a row' }));
    await userEvent.upload(
      within(runs).getByLabelText('File for row 2 input'),
      new File(['new'], 'new.in'),
    );
    await waitFor(() => expect(within(runs).getByText('New')).toBeVisible());
    await save();
    expect(written(sent[0])).toMatchObject({
      repeat: [
        {
          inputs: ['input'],
          tuples: [{ input: 'runs/0/1/input' }, { input: 'runs/0/1/input_2' }],
        },
      ],
    });
    expect(sent[0]?.changes.map((change) => change.path)).toContain('runs/0/1/input_2');
    expect(sent[0]?.changes.map((change) => change.path)).not.toContain(
      'runs/0/1/input',
    );
  });

  it('saves cartpole as two axes, 2 × 3 runs', async () => {
    const { sent } = taskBackend({
      content: 'name: Cartpole\nworkflow: cs2109s/cartpole@v1\n',
      form: runForm('cs2109s/cartpole@v1', [
        declared('weights', 'file'),
        declared('episodes', 'number'),
        declared('env', 'text'),
        declared('seed', 'number'),
      ]),
    });
    const { inputs } = await openTask();

    await who(inputs, 'weights', 'The entrant gives it');
    fill(fieldIn(inputs, 'episodes', 'episodes'), '100');
    await who(inputs, 'env', 'You set one for each run');
    await userEvent.click(
      screen.getByText('Run each row more than once, with different settings'),
    );
    await who(inputs, 'seed', 'You set one for each run');

    const runs = screen.getByRole('region', { name: 'Runs' });
    expect(runs).toHaveTextContent('1 row × 1 = 1 runRun each row');
    fill(within(runs).getByRole('textbox', { name: 'env of row 1' }), 'cartpole');
    await userEvent.click(
      within(runs).getAllByRole('button', { name: 'Add a row' })[0]!,
    );
    fill(within(runs).getByRole('textbox', { name: 'env of row 2' }), 'cartpole-wind');
    fill(within(runs).getByRole('textbox', { name: 'seed of row 1' }), '1');
    const seedRows = within(runs).getAllByRole('button', { name: 'Add a row' });
    await userEvent.click(seedRows[1]!);
    fill(within(runs).getByRole('textbox', { name: 'seed of row 2' }), '2');
    await userEvent.click(
      within(runs).getAllByRole('button', { name: 'Add a row' })[1]!,
    );
    fill(within(runs).getByRole('textbox', { name: 'seed of row 3' }), '3');
    expect(runs).toHaveTextContent('2 rows × 3 = 6 runs');
    await save();

    expect(written(sent[0])).toMatchObject({
      inputs: { weights: 'entrant', episodes: 100 },
      repeat: [
        {
          inputs: ['env'],
          tuples: [{ env: 'cartpole' }, { env: 'cartpole-wind' }],
        },
        { inputs: ['seed'], tuples: [{ seed: 1 }, { seed: 2 }, { seed: 3 }] },
      ],
    });
  });

  it('numbers a run’s field as the file will, when an empty axis would have sat first', async () => {
    const { sent } = taskBackend({
      content: 'name: Rooms\nworkflow: unicon/rooms@v1\n',
      form: runForm('unicon/rooms@v1', [declared('env', 'text')]),
    });
    const { inputs } = await openTask();
    await who(inputs, 'env', 'You set one for each run');
    await userEvent.click(
      screen.getByText('Run each row more than once, with different settings'),
    );
    await userEvent.selectOptions(
      within(inputs).getByRole('combobox', { name: 'Table' }),
      '1',
    );

    const runs = screen.getByRole('region', { name: 'Runs' });
    fill(within(runs).getByRole('textbox', { name: 'env of row 1' }), 'room');
    expect(document.querySelector('[data-field="axis-0-tuple-0-env"]')).not.toBeNull();
    expect(document.querySelector('[data-field="axis-1-tuple-0-env"]')).toBeNull();
    await save();

    expect(written(sent[0])).toMatchObject({
      repeat: [{ inputs: ['env'], tuples: [{ env: 'room' }] }],
    });
  });

  it('saves tour with a row the entrant gives, its title and its largest size', async () => {
    const { sent } = taskBackend({
      content: 'name: Tour\nworkflow: unicon/tour@v1\n',
      form: runForm('unicon/tour@v1', [
        declared('best', 'number'),
        declared('input', 'file'),
        declared('route', 'file'),
      ]),
    });
    const { inputs } = await openTask();

    fill(fieldIn(inputs, 'best', 'best'), '1200');
    await who(inputs, 'input', 'You set one for each run');
    await who(inputs, 'route', 'You set one for each run');

    const runs = screen.getByRole('region', { name: 'Runs' });
    fill(within(runs).getByRole('textbox', { name: 'Name of row 1' }), 'Small grid');
    await userEvent.upload(
      within(runs).getByLabelText('File for row 1 input'),
      new File(['a'], '1.in'),
    );
    await userEvent.click(
      await within(runs).findByRole('button', { name: 'Actions for row 1 route' }),
    );
    await userEvent.click(
      screen.getByRole('menuitem', { name: 'The entrant gives this one' }),
    );
    await userEvent.click(within(runs).getByRole('button', { name: 'Add a row' }));
    fill(within(runs).getByRole('textbox', { name: 'Name of row 2' }), 'Big grid');
    await userEvent.upload(
      within(runs).getByLabelText('File for row 2 input'),
      new File(['b'], '2.in'),
    );
    await userEvent.click(
      await within(runs).findByRole('button', { name: 'Actions for row 2 route' }),
    );
    await userEvent.click(
      screen.getByRole('menuitem', { name: 'The entrant gives this one' }),
    );
    await userEvent.click(
      within(runs).getByRole('button', { name: 'Actions for row 2 route' }),
    );
    await userEvent.click(
      screen.getByRole('menuitem', { name: 'Set the maximum size' }),
    );
    fill(screen.getByRole('textbox', { name: 'Maximum size of row 2' }), '50MB');
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    await save();

    expect(written(sent[0])).toMatchObject({
      inputs: { best: 1200 },
      repeat: [
        {
          inputs: ['input', 'route'],
          tuples: [
            { input: 'runs/0/0/input', route: 'entrant', title: 'Small grid' },
            {
              input: 'runs/0/1/input',
              route: 'entrant',
              title: 'Big grid',
              max_size: '50MB',
            },
          ],
        },
      ],
    });
  });

  it('shows a refused save’s errors at the input and the run they name', async () => {
    taskBackend({
      content: `name: Tour
workflow: unicon/tour@v1
inputs:
  best: 1200
repeat:
  - inputs: [input, route]
    tuples:
      - {input: parts/1.in, route: entrant, title: Small grid}
      - {input: parts/2.in, route: entrant, title: Big grid, max_size: 50MB}
`,
      form: runForm('unicon/tour@v1', [
        declared('best', 'number'),
        declared('input', 'file'),
        declared('route', 'file'),
      ]),
      answer: () =>
        HttpResponse.json({
          version: '5e6f',
          errors: [
            { path: ['inputs', 'best'], message: 'Not a number.' },
            {
              path: ['repeat', 0, 'tuples', 0, 'title'],
              message: 'Say what this row is.',
            },
            { path: ['repeat', 0, 'tuples', 1, 'max_size'], message: 'At most 2GB.' },
            {
              path: ['repeat', 0, 'tuples', 0, 'input'],
              message: 'There is no such file.',
            },
          ],
          held_back: [],
        }),
    });
    const { inputs } = await openTask();
    fill(fieldIn(inputs, 'best', 'best'), '1300');
    await save();

    const outcome = (await screen.findByText(/Saved as a draft/))
      .parentElement as HTMLElement;
    const errors = within(outcome).getByRole('list', { name: 'Errors' });
    expect(errors).toHaveTextContent('Inputs: best: Not a number.');
    expect(errors).toHaveTextContent(
      'Runs, table 1, row 1: title: Say what this row is.',
    );
    expect(errors).toHaveTextContent('Runs, table 1, row 2: max_size: At most 2GB.');
    expect(errors).toHaveTextContent(
      'Runs, table 1, row 1: input: There is no such file.',
    );
    expect(
      document.querySelector('[data-field="axis-0-tuple-0-title"]'),
    ).not.toBeNull();
    await userEvent.click(
      within(errors).getByRole('link', { name: /Runs, table 1, row 2: max_size/ }),
    );
    expect(
      await screen.findByRole('textbox', { name: 'Maximum size of row 2' }),
    ).toBeVisible();
    expect(
      document.querySelector('[data-field="axis-0-tuple-1-max_size"]'),
    ).not.toBeNull();
    expect(document.querySelector('[data-field="best"]')).not.toBeNull();
  });
});

const ISLANDS = `name: Islands
workflow: unicon/classic@v6
inputs:
  code: {entrant: {label: Solution}}
repeat:
  - inputs: [input]
    tuples:
      - {input: sample.in, title: Sample}
`;

/** A box like unicon/checked's: what a run reports, and a log written once. */
function checkedBox(
  more: { name: string; type: string; once: boolean; title?: string }[] = [],
) {
  return http.get('/api/v1/workflows/:owner/:name/versions/:version/box', () =>
    HttpResponse.json({
      run: true,
      inputs: [],
      newer_version: null,
      description: null,
      outputs: [
        { name: 'fraction', type: 'number', once: false },
        { name: 'time_ms', type: 'number', unit: 'ms', once: false },
        ...more,
      ].map((output) => ({
        title: null,
        unit: null,
        better: null,
        at_least: null,
        at_most: null,
        ...output,
      })),
    }),
  );
}

/** The box for a part of what entrants see, at a moment. */
function cell(part: string, moment: string): HTMLElement {
  return within(screen.getByRole('table', { name: 'What entrants see' })).getByRole(
    'checkbox',
    { name: `${part}, ${moment}` },
  );
}

async function typeLine(name: string, text: string) {
  const line = await screen.findByRole('textbox', { name });
  await userEvent.type(line, text);
}

describe('scoring, checks and what a save answers', { timeout: 60_000 }, () => {
  beforeEach(() => {
    // The formula line measures its text. jsdom's ranges have no client rects.
    Range.prototype.getClientRects = () => {
      const rects = [] as unknown as DOMRectList;
      Object.defineProperty(rects, 'length', { value: 0 });
      rects.item = () => null;
      return rects;
    };
  });

  it('shows an observer the saved value formula without editing or its tray', async () => {
    taskBackend({
      content: `${ISLANDS}scoring:\n  values: {total: 1}\n`,
      form: runForm('unicon/classic@v6', [
        declared('code', 'file'),
        declared('input', 'file'),
      ]),
    });
    server.use(...signedInAs('observer', { task: publishedTask }));
    await openTask();
    const scoring = screen.getByRole('region', { name: 'Scoring' });
    const line = await within(scoring).findByRole('textbox', { name: 'total' });
    expect(line).toHaveAttribute('contenteditable', 'false');
    expect(line).toHaveAttribute('aria-readonly', 'true');
    await userEvent.click(line);
    expect(within(scoring).queryByText(/Click a tile to put it in/)).toBeNull();
    expect(within(scoring).queryByRole('button', { name: 'Remove total' })).toBeNull();
    const runs = screen.getByRole('region', { name: 'Runs' });
    await userEvent.click(
      within(runs).getByText('Run each row more than once, with different settings'),
    );
    expect(screen.queryByRole('region', { name: 'Save the task' })).toBeNull();
  });

  it('adds a value with a name free among existing values and groups after a removal', async () => {
    taskBackend({
      content: `${ISLANDS}scoring:\n  groups: {value_2: {input: small/1.in}}\n  values: {value_1: 1, value_3: 3}\n`,
      form: runForm('unicon/classic@v6', [
        declared('code', 'file'),
        declared('input', 'file'),
      ]),
    });
    await openTask();
    const scoring = screen.getByRole('region', { name: 'Scoring' });
    await waitFor(() =>
      expect(
        within(scoring).getByRole('button', { name: 'Add a value' }),
      ).toBeEnabled(),
    );
    await userEvent.click(within(scoring).getByRole('button', { name: 'Add a value' }));
    expect(within(scoring).getByRole('group', { name: 'Value value_4' })).toBeVisible();
    expect(
      within(scoring)
        .getAllByRole('textbox', { name: 'Name' })
        .map((field) => field.getAttribute('value')),
    ).toEqual(['value_1', 'value_3', 'value_4']);
  });

  it('says a submission with no input repeated runs once, on every card that counts its runs', async () => {
    taskBackend({
      content: `name: Islands
workflow: unicon/classic@v6
inputs:
  code: {entrant: {label: Solution}}
  input: sample.in
`,
      form: runForm('unicon/classic@v6', [
        declared('code', 'file'),
        declared('input', 'file'),
      ]),
    });
    await openTask();
    expect(screen.getByRole('region', { name: 'Runs' })).toHaveTextContent(
      'A submission runs once, since nothing changes from run to run.',
    );
    const scoring = screen.getByRole('region', { name: 'Scoring' });
    const gives = await within(scoring).findByRole('table', {
      name: 'What one submission gives',
    });
    expect(scoring).not.toHaveTextContent('No runs yet');
    expect(scoring).not.toHaveTextContent('Every run also gives');
    expect(scoring).toHaveTextContent(
      'A value can also read seconds late, seconds taken and whether it compiled.',
    );
    expect(within(gives).getByRole('row', { name: /^The one run/ })).toBeVisible();
    const groups = within(scoring).getByRole('table', { name: 'Groups' });
    expect(within(groups).getByRole('row', { name: /^The one run/ })).toBeVisible();
    expect(within(groups).getByLabelText('The one run in all')).toHaveTextContent('✓');
    expect(groups.querySelector('tfoot')).toHaveTextContent('1 run');
    expect(groups.querySelector('tfoot')).not.toHaveTextContent('1 runs');
    expect(
      await within(scoring).findByRole('button', { name: 'Runs 1 run' }),
    ).toBeVisible();
  });

  it('says what a run gives beyond the table, by its title, and the facts in words', async () => {
    taskBackend({
      content: `name: Islands
workflow: unicon/classic@v6
inputs:
  code: {entrant: {label: Solution}}
  input: sample.in
repeat:
  - inputs: [seed]
    tuples:
      - {seed: 1}
      - {seed: 2}
`,
      form: runForm('unicon/classic@v6', [
        declared('code', 'file'),
        declared('input', 'file'),
        declared('seed', 'number', { title: 'Random seed' }),
      ]),
    });
    await openTask();
    const scoring = screen.getByRole('region', { name: 'Scoring' });
    const line = await within(scoring).findByText(/^Every run also gives/);
    expect(line).toHaveTextContent(
      'Every run also gives Random seed. A value can also read seconds late, seconds taken and whether it compiled.',
    );
  });

  it('lists the runs the server makes from the draft, and says when there are too many', async () => {
    let sent: unknown = null;
    server.use(
      http.post(`${TASK_API}/draft-runs`, async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({ runs: [], count: 2000, axes: [[]] });
      }),
    );
    taskBackend({
      content: `name: Islands
workflow: unicon/classic@v6
inputs:
  code: {entrant: {label: Solution}}
  input: sample.in
repeat:
  - inputs: [seed]
    tuples:
      - {seed: 1, title: One}
`,
      form: runForm('unicon/classic@v6', [
        declared('code', 'file'),
        declared('input', 'file'),
        declared('seed', 'number'),
      ]),
    });
    await openTask();
    const scoring = screen.getByRole('region', { name: 'Scoring' });
    expect(
      await within(scoring).findByText('The runs make 2000 runs, too many to list.'),
    ).toBeVisible();
    expect(sent).toEqual({
      repeat: [{ inputs: ['seed'], tuples: [{ seed: 1, title: 'One' }] }],
    });
  });

  it('uses the workflow box’s output types for the runs table', async () => {
    taskBackend({
      content: ISLANDS,
      form: runForm('unicon/classic@v6', [
        declared('code', 'file'),
        declared('input', 'file'),
      ]),
    });
    server.use(
      http.get('/api/v1/workflows/:owner/:name/versions/:version', () =>
        HttpResponse.json(
          versionOf(
            CHECKED_YAML +
              '  log: {from: "${{ steps.run.log }}", title: Compile log}\n',
          ),
        ),
      ),
      http.get('/api/v1/workflows/:owner/:name/versions/:version/box', () =>
        HttpResponse.json({
          run: true,
          inputs: [],
          newer_version: null,
          description: null,
          outputs: [
            {
              name: 'log',
              type: 'file',
              title: 'Compile log',
              unit: null,
              better: null,
              at_least: null,
              at_most: null,
            },
          ],
        }),
      ),
    );
    await openTask();
    const runs = await screen.findByRole('table', {
      name: 'What one submission gives',
    });
    await waitFor(() =>
      expect(
        within(runs).getByRole('columnheader', { name: /Compile log/ }),
      ).toHaveTextContent('text'),
    );
    expect(within(runs).getByRole('cell', { name: 'text' })).toBeVisible();
  });

  it('keeps Result open with its parts and gives each part the grid shows one row', async () => {
    taskBackend({
      content: `${ISLANDS}scoring:
  groups: {samples: {input: sample.in}}
  values: {total: 1, foot: 2}
  show:
    always:
      values: [total]
      runs: [{of: samples, fields: [verdict]}]
`,
      form: runForm('unicon/classic@v6', [
        declared('code', 'file'),
        declared('input', 'file'),
      ]),
    });
    server.use(
      checkedBox([{ name: 'log', type: 'file', once: true, title: 'Compile log' }]),
    );
    await openTask();
    const result = await screen.findByRole('list', { name: 'Result' });
    expect(result).toHaveTextContent('Values');
    expect(result).toHaveTextContent('total');
    expect(within(result).getByText('foot')).toBeVisible();
    expect(result).toHaveTextContent(
      'Organisers and leaderboards can still read parts marked Not shown.',
    );
    expect(result).toHaveTextContent('samples');
    const detail = result.querySelector('[class*="resultDetail"]');
    if (detail === null) throw new Error('A group has report details.');
    expect(fireEvent.keyDown(detail, { key: ' ' })).toBe(true);
    expect(result).toHaveTextContent('Once outputs');
    await waitFor(() => expect(result).toHaveTextContent('Compile log'));

    const grid = screen.getByRole('table', { name: 'What entrants see' });
    for (const part of ['total', 'foot', 'log', 'compiled', 'input', 'verdict']) {
      expect(grid.querySelectorAll(`[data-show-part="${part}"]`)).toHaveLength(1);
    }
    expect(cell('total', 'Always')).toBeChecked();
    expect(cell('total', 'After the deadline')).toBeChecked();
    expect(cell('total', 'After the deadline')).toBeDisabled();
    expect(cell('foot', 'Always')).not.toBeChecked();
    expect(cell('Verdict of samples', 'Always')).toBeChecked();
    expect(cell('Passed of samples', 'Always')).not.toBeChecked();
    expect(
      within(grid).getByRole('rowgroup', { name: 'Runs: samples' }),
    ).toHaveTextContent('time_ms (ms)');
  });

  it('saves islands with its text value first_failed and a check', async () => {
    const { sent } = taskBackend({
      content: ISLANDS,
      form: runForm('unicon/classic@v6', [
        declared('code', 'file'),
        declared('input', 'file'),
      ]),
    });
    await openTask();
    const scoring = await screen.findByRole('region', { name: 'Scoring' });
    await userEvent.click(within(scoring).getByRole('button', { name: 'Add a value' }));
    await typeLine('value_1', 'otherwise(first(all, all.passed == 0).verdict, "none")');
    fill(within(scoring).getByRole('textbox', { name: 'Name' }), 'first_failed');
    fireEvent.blur(within(scoring).getByRole('textbox', { name: 'Name' }));

    const checks = screen.getByRole('region', { name: 'Checks' });
    await userEvent.click(within(checks).getByRole('button', { name: 'Add a check' }));
    fill(within(checks).getByRole('textbox', { name: 'Solution' }), 'print(1)');
    expect(
      within(
        within(checks).getByRole('combobox', { name: 'Verdict every run gets' }),
      ).getByRole('option', { name: 'output_limit' }),
    ).toBeInTheDocument();
    await userEvent.selectOptions(
      within(checks).getByRole('combobox', { name: 'Verdict every run gets' }),
      'accepted',
    );
    await save();

    expect(written(sent[0])).toMatchObject({
      scoring: {
        values: {
          first_failed: {
            block: 'otherwise',
            of: [
              {
                run: [
                  {
                    block: 'first',
                    from: { runs: 'all' },
                    where: { block: 'eq', of: [{ run: ['all', 'passed'] }, 0] },
                  },
                  'verdict',
                ],
              },
              { text: 'none' },
            ],
          },
        },
      },
      checks: [{ submit: { code: 'print(1)' }, expect: { verdict: 'accepted' } }],
    });
  });

  it('drops a removed part from show, moves a renamed group, and turns off a name no part has', async () => {
    const { sent } = taskBackend({
      content: `${ISLANDS}scoring:
  groups:
    samples: {input: sample.in}
    big: {input: sample.in}
  values:
    total: {block: sum, over: {runs: all}, of: {run: [all, passed]}}
    extra: 1
  show:
    always:
      values: [total, extra, gone]
      runs: [{of: samples, fields: [verdict]}, {of: big, fields: [passed]}]
`,
      form: runForm('unicon/classic@v6', [
        declared('code', 'file'),
        declared('input', 'file'),
      ]),
    });
    await openTask();
    const scoring = await screen.findByRole('region', { name: 'Scoring' });
    expect(scoring.querySelector('[data-show-part="gone"]')).toHaveTextContent('gone');
    await userEvent.click(cell('gone', 'Always'));
    const samples = within(scoring).getByRole('textbox', { name: 'Name of samples' });
    fill(samples, 'tests');
    fireEvent.blur(samples);
    await userEvent.click(
      within(scoring).getByRole('button', { name: 'Remove group big' }),
    );
    await userEvent.click(
      within(scoring).getByRole('button', { name: 'Remove extra' }),
    );
    await save();

    const file = written(sent[0]);
    expect(file).toMatchObject({
      scoring: {
        groups: { tests: { input: 'sample.in' } },
        show: {
          always: { values: ['total'], runs: [{ of: 'tests', fields: ['verdict'] }] },
        },
      },
    });
    expect(JSON.stringify(file)).not.toMatch(/extra|big|gone|samples/);
  });

  it('lists a name shown in the wrong section where the file has it, to turn off', async () => {
    taskBackend({
      content: `${ISLANDS}scoring:
  groups: {samples: {input: sample.in}}
  values: {total: 1}
  show:
    always:
      outputs: [time_ms]
      inputs: [input]
      runs: [{of: samples, fields: [total, gone]}]
`,
      form: runForm('unicon/classic@v6', [
        declared('code', 'file'),
        declared('input', 'file'),
      ]),
    });
    server.use(checkedBox());
    await openTask();
    const grid = await screen.findByRole('table', { name: 'What entrants see' });
    const row = (section: string, name: string) =>
      within(grid)
        .getAllByRole('rowgroup')
        .find((group) => group.textContent?.startsWith(section))
        ?.querySelector(`[data-show-part="${name}"]`);
    await waitFor(() =>
      expect(row('Once outputs', 'time_ms')).toHaveTextContent('time_ms'),
    );
    expect(row('Shared inputs', 'input')).toHaveTextContent('input');
    const entry = within(grid).getByRole('rowgroup', { name: 'Runs: samples' });
    expect(entry.querySelector('[data-show-part="total"]')).toHaveTextContent('total');
    expect(entry.querySelector('[data-show-part="gone"]')).toHaveTextContent('gone');
  });

  it('greys the later moments under Always only, and writes a name on at both under both', async () => {
    const { sent } = taskBackend({
      content: `${ISLANDS}scoring:
  values: {total: 1, foot: 2}
`,
      form: runForm('unicon/classic@v6', [
        declared('code', 'file'),
        declared('input', 'file'),
      ]),
    });
    await openTask();
    await screen.findByRole('table', { name: 'What entrants see' });
    await userEvent.click(cell('total', 'After the deadline'));
    expect(cell('total', 'After release')).toBeEnabled();
    expect(cell('total', 'Always')).toBeEnabled();
    await userEvent.click(cell('total', 'After release'));
    expect(cell('total', 'After the deadline')).toBeEnabled();
    expect(cell('total', 'After the deadline')).toBeChecked();
    expect(cell('total', 'After release')).toBeChecked();

    await userEvent.click(cell('foot', 'Always'));
    for (const later of ['After the deadline', 'After release']) {
      expect(cell('foot', later)).toBeChecked();
      expect(cell('foot', later)).toBeDisabled();
    }
    await save();
    expect(written(sent[0])).toMatchObject({
      scoring: {
        show: {
          always: { values: ['foot'] },
          after_deadline: { values: ['total'] },
          after_release: { values: ['total'] },
        },
      },
    });
  });

  it('turns a part on and off again with nothing to save, and adds the runs of a group picked', async () => {
    const { sent } = taskBackend({
      content: `${ISLANDS}scoring:
  groups: {samples: {input: sample.in}}
  values: {total: 1}
  show:
    always:
      values: [total]
`,
      form: runForm('unicon/classic@v6', [
        declared('code', 'file'),
        declared('input', 'file'),
      ]),
    });
    await openTask();
    const scoring = await screen.findByRole('region', { name: 'Scoring' });
    await userEvent.click(cell('total', 'Always'));
    expect(screen.getByRole('region', { name: 'Save the task' })).toBeVisible();
    await userEvent.click(cell('total', 'Always'));
    expect(screen.queryByRole('region', { name: 'Save the task' })).toBeNull();

    expect(scoring).toHaveTextContent('No runs are shown.');
    await userEvent.click(within(scoring).getByRole('button', { name: 'Add runs' }));
    const entry = within(scoring).getByRole('rowgroup', {
      name: 'Runs: all, every run',
    });
    await userEvent.selectOptions(
      within(entry).getByRole('combobox', { name: 'Runs of' }),
      'samples',
    );
    await userEvent.click(cell('Passed of samples', 'After the deadline'));
    await userEvent.click(within(scoring).getByRole('button', { name: 'Add runs' }));
    await userEvent.click(cell('Label of all', 'After release'));
    await save();
    expect(written(sent[0])).toMatchObject({
      scoring: {
        show: {
          always: { values: ['total'] },
          after_deadline: { runs: [{ of: 'samples', fields: ['passed'] }] },
          after_release: { runs: [{ of: 'all', fields: ['label'] }] },
        },
      },
    });
  });

  it('drops runs added with nothing on once their group is removed, and keeps runs of a group the file names but lacks', async () => {
    taskBackend({
      content: `${ISLANDS}scoring:
  groups: {samples: {input: sample.in}}
  values: {total: 1}
  show:
    always:
      values: [total]
      runs: [{of: gone, fields: [verdict]}]
`,
      form: runForm('unicon/classic@v6', [
        declared('code', 'file'),
        declared('input', 'file'),
      ]),
    });
    await openTask();
    const scoring = await screen.findByRole('region', { name: 'Scoring' });
    expect(within(scoring).getByRole('rowgroup', { name: 'Runs: gone' })).toBeVisible();

    await userEvent.click(within(scoring).getByRole('button', { name: 'Add runs' }));
    await userEvent.selectOptions(
      within(
        within(scoring).getByRole('rowgroup', { name: 'Runs: all, every run' }),
      ).getByRole('combobox', { name: 'Runs of' }),
      'samples',
    );
    expect(
      within(scoring).getByRole('rowgroup', { name: 'Runs: samples' }),
    ).toBeVisible();
    await userEvent.click(
      within(scoring).getByRole('button', { name: 'Remove group samples' }),
    );
    expect(
      within(scoring).queryByRole('rowgroup', { name: 'Runs: samples' }),
    ).toBeNull();
  });

  it('moves a renamed group’s runs once its name is done, past a value’s name typed on the way', async () => {
    const { sent } = taskBackend({
      content: `${ISLANDS}scoring:
  groups:
    samples: {input: sample.in}
  values:
    total: {block: sum, over: {runs: all}, of: {run: [all, passed]}}
  show:
    always:
      values: [total]
    after_deadline:
      runs: [{of: samples, fields: [verdict]}]
`,
      form: runForm('unicon/classic@v6', [
        declared('code', 'file'),
        declared('input', 'file'),
      ]),
    });
    await openTask();
    const scoring = await screen.findByRole('region', { name: 'Scoring' });
    const name = within(scoring).getByRole('textbox', { name: 'Name of samples' });
    for (const typed of ['tot', 'total', 'totals']) fill(name, typed);
    fireEvent.blur(name);
    await save();

    expect(written(sent[0])).toMatchObject({
      scoring: {
        show: {
          always: { values: ['total'] },
          after_deadline: { runs: [{ of: 'totals', fields: ['verdict'] }] },
        },
      },
    });
  });

  it('reads each input an axis fills as a column of its run, a number or text as declared', async () => {
    const { sent } = taskBackend({
      content: `name: Seeds
workflow: unicon/classic@v6
inputs:
  code: {entrant: {label: Solution}}
repeat:
  - inputs: [seed, name]
    tuples:
      - {seed: 1, name: small}
      - {seed: 2, name: big}
scoring:
  values:
    top: {block: max, over: {runs: all}, of: {run: [all, seed]}}
`,
      form: runForm('unicon/classic@v6', [
        declared('code', 'file'),
        declared('seed', 'number'),
        declared('name', 'text'),
      ]),
    });
    await openTask();
    const scoring = await screen.findByRole('region', { name: 'Scoring' });
    await userEvent.click(within(scoring).getByRole('button', { name: 'Add a value' }));
    await typeLine(
      'value_2',
      'otherwise(first(all, all.verdict != "accepted").name, "none")',
    );
    const bar = await screen.findByRole('region', { name: 'Save the task' });
    await waitFor(() => {
      expect(within(bar).getByRole('button', { name: 'Save' })).toBeEnabled();
    });
    await save();
    expect(written(await waitForSave(sent))).toMatchObject({
      scoring: {
        values: {
          top: { block: 'max', of: { run: ['all', 'seed'] } },
          value_2: { block: 'otherwise' },
        },
      },
    });
  });

  it('leaves a stored value whose line does not read back to it to the forge, not blocking the save', async () => {
    const { sent } = taskBackend({
      content: `${ISLANDS}scoring:
  values:
    odd: {block: max, of: [1, 2], colour: red}
`,
      form: runForm('unicon/classic@v6', [
        declared('code', 'file'),
        declared('input', 'file'),
      ]),
    });
    await openTask();
    const scoring = await screen.findByRole('region', { name: 'Scoring' });
    await userEvent.click(within(scoring).getByRole('button', { name: 'Add a value' }));
    await typeLine('value_2', '1');
    const bar = await screen.findByRole('region', { name: 'Save the task' });
    await waitFor(() => {
      expect(within(bar).getByRole('button', { name: 'Save' })).toBeEnabled();
    });
    await save();
    expect(written(await waitForSave(sent))).toMatchObject({
      scoring: { values: { odd: { block: 'max', of: [1, 2], colour: 'red' } } },
    });
  });

  it('says Not shown for a part entrants never see, and when it compiled is shown the same way in the grid and the result', async () => {
    taskBackend({
      content: ISLANDS,
      form: runForm('unicon/classic@v6', [
        declared('code', 'file'),
        declared('input', 'file'),
      ]),
    });
    await openTask();
    await screen.findByRole('table', { name: 'What entrants see' });
    expect(cell('Whether it compiled', 'Always')).not.toBeChecked();
    const result = await screen.findByRole('list', { name: 'Result' });
    const fact = () =>
      within(result)
        .getAllByRole('listitem')
        .find((item) => item.textContent?.startsWith('Whether it compiled'));
    expect(fact()).toHaveTextContent('Whether it compiledNot shown');
    await userEvent.click(cell('Whether it compiled', 'After release'));
    expect(fact()).toHaveTextContent('Whether it compiledAfter release');
    await userEvent.click(cell('Whether it compiled', 'After the deadline'));
    expect(fact()).toHaveTextContent(
      'Whether it compiledAfter the deadline or release',
    );
    await userEvent.click(cell('Whether it compiled', 'Always'));
    expect(fact()).toHaveTextContent('Whether it compiledAlways');
  });

  it('heads the result’s groups Groups, and leaves out a heading with nothing under it', async () => {
    taskBackend({
      content: ISLANDS,
      form: runForm('unicon/classic@v6', [
        declared('code', 'file'),
        declared('input', 'file'),
      ]),
    });
    await openTask();
    const result = await screen.findByRole('list', { name: 'Result' });
    const lines = within(result)
      .getAllByRole('listitem')
      .map((item) => item.textContent);
    expect(lines).toContain('GroupsKindShown');
    expect(lines).toContain('Once outputs');
    expect(lines.some((line) => line?.startsWith('Values'))).toBe(false);
    expect(lines.some((line) => line?.startsWith('Runs'))).toBe(false);
    expect(lines.some((line) => line?.startsWith('Shared inputs'))).toBe(false);
  });

  it('offers the settings every run shares, what is given once and what each run gives', async () => {
    taskBackend({
      content: `${ISLANDS.replace(
        '  code: {entrant: {label: Solution}}\n',
        '  code: {entrant: {label: Solution}}\n  time_limit: 2\n  token: {secret: judge-token}\n',
      )}scoring:
  groups: {samples: {input: sample.in}}
  show:
    always:
      runs: [{of: samples, fields: [verdict]}]
`,
      form: runForm('unicon/classic@v6', [
        declared('code', 'file'),
        declared('input', 'file'),
        declared('time_limit', 'number', { title: 'Time limit' }),
        declared('token', 'text'),
      ]),
    });
    server.use(
      checkedBox([
        { name: 'log', type: 'file', once: true, title: 'Compile log' },
        { name: 'lines', type: 'number', once: true },
      ]),
    );
    await openTask();
    const grid = await screen.findByRole('table', { name: 'What entrants see' });
    await waitFor(() =>
      expect(grid.querySelector('[data-show-part="lines"]')).not.toBeNull(),
    );
    const rows = (section: string) =>
      [...within(grid).getAllByRole('rowgroup')]
        .find((group) => group.textContent?.startsWith(section))
        ?.querySelectorAll('[data-show-part]');
    const names = (section: string) =>
      [...(rows(section) ?? [])].map((row) => row.getAttribute('data-show-part'));
    expect(names('Shared inputs')).toEqual(['time_limit', 'token']);
    expect(names('Once outputs')).toEqual(['log', 'lines', 'compiled']);
    const entry = within(grid).getByRole('rowgroup', { name: 'Runs: samples' });
    expect(
      [...entry.querySelectorAll('[data-show-part]')].map((row) =>
        row.getAttribute('data-show-part'),
      ),
    ).toEqual([
      'input',
      'verdict',
      'passed',
      'label',
      'message',
      'fraction',
      'time_ms',
    ]);
    expect(cell('Time limit', 'Always')).toBeEnabled();
    expect(grid.querySelector('[data-show-part="code"]')).toBeNull();
  });

  it('sends a secret and a file to show, and shows the forge’s word on each row', async () => {
    const { sent } = taskBackend({
      content: `${ISLANDS.replace(
        '  code: {entrant: {label: Solution}}\n',
        '  code: {entrant: {label: Solution}}\n  token: {secret: judge-token}\n',
      )}scoring:
  groups: {samples: {input: sample.in}}
  show:
    always:
      runs: [{of: samples, fields: [verdict]}]
`,
      form: runForm('unicon/classic@v6', [
        declared('code', 'file'),
        declared('input', 'file'),
        declared('token', 'text'),
      ]),
      answer: () =>
        problem(422, 'invalid_definition', {
          errors: [
            {
              path: ['scoring', 'show', 'always', 'inputs', 0],
              message: 'A secret is never shown. Remove it.',
            },
            {
              path: ['scoring', 'show', 'always', 'outputs', 0],
              message: 'log is a file, and show shows numbers and text. Remove it.',
            },
            {
              path: ['scoring', 'show', 'always', 'runs', 0, 'fields', 0],
              message: 'The forge’s word on verdict.',
            },
          ],
        }),
    });
    server.use(
      checkedBox([{ name: 'log', type: 'file', once: true, title: 'Compile log' }]),
    );
    await openTask();
    const grid = await screen.findByRole('table', { name: 'What entrants see' });
    await waitFor(() => expect(cell('Compile log', 'Always')).toBeEnabled());
    await userEvent.click(cell('token', 'Always'));
    await userEvent.click(cell('Compile log', 'Always'));
    await save();

    await expect.poll(() => sent.length).toBe(1);
    expect(written(sent[0])['scoring']).toMatchObject({
      show: {
        always: {
          inputs: ['token'],
          outputs: ['log'],
          runs: [{ of: 'samples', fields: ['verdict'] }],
        },
      },
    });
    await waitFor(() =>
      expect(grid.querySelector('[data-show-part="token"]')).toHaveTextContent(
        'A secret is never shown. Remove it.',
      ),
    );
    expect(grid.querySelector('[data-show-part="log"]')).toHaveTextContent(
      'log is a file, and show shows numbers and text. Remove it.',
    );
    const entry = within(grid).getByRole('rowgroup', { name: 'Runs: samples' });
    expect(entry.querySelector('[data-show-part="verdict"]')).toHaveTextContent(
      'The forge’s word on verdict.',
    );
    expect(entry.querySelector('[data-show-part="passed"]')).not.toHaveTextContent(
      'The forge’s word',
    );
  });

  it('leaves a badly written value name, and a loop, to the save', async () => {
    const { sent } = taskBackend({
      content: ISLANDS,
      form: runForm('unicon/classic@v6', [
        declared('code', 'file'),
        declared('input', 'file'),
      ]),
    });
    await openTask();
    const scoring = await screen.findByRole('region', { name: 'Scoring' });
    await userEvent.click(within(scoring).getByRole('button', { name: 'Add a value' }));
    await userEvent.click(within(scoring).getByRole('button', { name: 'Add a value' }));
    const names = within(scoring).getAllByRole('textbox', { name: 'Name' });
    fill(names[0]!, 'Left');
    fill(names[1]!, 'right');
    await typeLine('Left', 'right');
    await typeLine('right', 'Left');
    await save();

    const { scoring: saved } = written(sent[0]) as { scoring: { values: object } };
    expect(saved.values).toEqual({
      Left: { value: 'right' },
      right: { value: 'Left' },
    });
  });

  it('sends a group that picks nothing and a value with no name, and shows the forge’s word on each', async () => {
    const { sent } = taskBackend({
      content: ISLANDS,
      form: runForm('unicon/classic@v6', [
        declared('code', 'file'),
        declared('input', 'file'),
      ]),
      answer: () =>
        HttpResponse.json({
          version: '5e6f',
          errors: [
            {
              path: ['scoring', 'groups', 'group_1'],
              message: 'Pick the group’s runs by at least one repeated input.',
            },
            { path: ['scoring', 'values', ''], message: 'Give the value a name.' },
          ],
          held_back: [],
        }),
    });
    await openTask();
    const scoring = await screen.findByRole('region', { name: 'Scoring' });
    await userEvent.click(within(scoring).getByRole('button', { name: 'Add a group' }));
    await waitFor(() =>
      expect(
        within(scoring).getByRole('button', { name: 'Add a value' }),
      ).toBeEnabled(),
    );
    await userEvent.click(within(scoring).getByRole('button', { name: 'Add a value' }));
    await typeLine('value_1', '1');
    fill(within(scoring).getByRole('textbox', { name: 'Name' }), '');
    await save();

    await expect.poll(() => sent.length).toBe(1);
    expect(written(sent[0])['scoring']).toEqual({
      groups: { group_1: {} },
      values: { '': 1 },
    });
    const now = await screen.findByRole('region', { name: 'Scoring' });
    expect(
      await within(now).findByText(
        'Pick the group’s runs by at least one repeated input.',
      ),
    ).toBeVisible();
    expect(
      within(within(now).getByRole('group', { name: 'Value' })).getByText(
        'Give the value a name.',
      ),
    ).toBeVisible();
  });

  it('warns on its row before what was shown always is hidden, once a submission is graded', async () => {
    taskBackend({
      content:
        'name: Islands\nworkflow: unicon/classic@v6\nscoring:\n  values: {total: 1}\n  show:\n    always:\n      values: [total]\n      outputs: [compiled]\n',
      form: {
        ...runForm('unicon/classic@v6', [declared('code', 'file')]),
        graded: true,
      },
    });
    await openTask();
    const grid = await screen.findByRole('table', { name: 'What entrants see' });
    const seen = 'Entrants may have seen this. The save asks before hiding it.';
    expect(grid).not.toHaveTextContent(seen);
    await userEvent.click(cell('Whether it compiled', 'Always'));
    await userEvent.click(cell('Whether it compiled', 'After release'));
    expect(grid.querySelector('[data-show-part="compiled"]')).toHaveTextContent(seen);
    expect(grid.querySelector('[data-show-part="total"]')).not.toHaveTextContent(seen);
    expect(within(grid).getAllByText(seen)).toHaveLength(1);
  });

  it('shows the summary and sends confirm and asked when a save asks first', async () => {
    const { sent } = taskBackend({
      content: ISLANDS,
      form: runForm('unicon/classic@v6', [
        declared('code', 'file'),
        declared('input', 'file'),
      ]),
      answer: () =>
        problem(409, 'confirmation_required', {
          detail: 'The contest is running. Publish this change now?',
          changes: [],
          regrades: 0,
          ...unchanged,
          asked: 'b1c2d3e:12',
        }),
    });
    const { inputs } = await openTask();
    fill(fieldIn(inputs, 'code', 'Label shown to entrants'), 'Your solution');
    await save();
    const bar = screen.getByRole('region', { name: 'Save the task' });
    expect(await within(bar).findByText("Nobody's result changes.")).toBeVisible();
    await userEvent.click(
      within(bar).getByRole('button', { name: 'Publish the change' }),
    );
    await waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[1]).toMatchObject({ confirm: true, asked: 'b1c2d3e:12' });
  });
});

describe('the preview of what entrants see', { timeout: 30_000 }, () => {
  /** The preview's answer for each body it is sent: what the show lists at the moment, as placeholders. */
  function echoPreview(bodies: unknown[]) {
    server.use(
      http.post(`${TASK_API}/show-preview`, async ({ request }) => {
        const body = (await request.json()) as {
          show: Record<string, { values?: string[] }>;
          moment: string;
          entrant?: string;
          number?: number;
        };
        bodies.push(body);
        const listed = [
          ...(body.show.always?.values ?? []),
          ...(body.moment === 'always' ? [] : (body.show[body.moment]?.values ?? [])),
        ];
        if (body.number !== undefined) {
          return HttpResponse.json({
            hidden: 2,
            moment: body.moment,
            placeholders: null,
            result: {
              id: '0199a2c1-6b7e-7c3a-9f10-5d2e4b8a6c40',
              attempt: 1,
              status: 'graded',
              compiled: null,
              limit: null,
              reason: null,
              reveal_at: null,
              inputs: {},
              once: { reports: {}, texts: {} },
              runs: [],
              run_values: listed.map((name) => ({
                name,
                number: '7',
                text: null,
                waiting: false,
                self_reported: false,
                show: 'always',
                facts: null,
                runs: null,
                values: null,
              })),
            },
          });
        }
        return HttpResponse.json({
          hidden: 0,
          moment: body.moment,
          placeholders: { values: listed, outputs: [], inputs: {}, runs: [] },
          result: null,
        });
      }),
    );
  }

  const islands = `${ISLANDS}scoring:
  values: {total: 1}
`;
  const form = runForm('unicon/classic@v6', [
    declared('code', 'file'),
    declared('input', 'file'),
  ]);

  it('changes as a cell is toggled, at the moment picked', async () => {
    const bodies: unknown[] = [];
    taskBackend({ content: islands, form });
    echoPreview(bodies);
    await openTask();
    const preview = await screen.findByRole('region', { name: "An entrant's page" });
    expect(
      await within(preview).findByText('Entrants see nothing at this moment.'),
    ).toBeVisible();
    await userEvent.click(cell('total', 'After release'));
    expect(within(preview).queryByText('total appears here')).toBeNull();
    const part = screen.getByRole('region', { name: 'Preview' });
    await userEvent.click(within(part).getByRole('radio', { name: 'After release' }));
    expect(await within(preview).findByText('total appears here')).toBeVisible();
    await userEvent.click(
      within(part).getByRole('radio', { name: 'After the deadline' }),
    );
    expect(
      await within(preview).findByText('Entrants see nothing at this moment.'),
    ).toBeVisible();
    expect(bodies.at(-1)).toEqual({
      show: { after_release: { values: ['total'] } },
      moment: 'after_deadline',
    });
    expect(screen.queryByText(/Publish to preview these changes/)).toBeNull();
  });

  it('previews with a graded submission picked by entrant and number, and counts the runs hidden', async () => {
    const bodies: unknown[] = [];
    taskBackend({
      content: `${islands}  show:\n    always:\n      values: [total]\n`,
      form,
    });
    echoPreview(bodies);
    const graded = {
      id: '0199a2c1-6b7e-7c3a-9f10-5d2e4b8a6c41',
      submission_number: 3,
      submitted_at: '2026-09-26T10:00:00Z',
      publication: 2,
      attempt: 1,
      latest: true,
      status: 'done' as const,
      error: null,
      result: null,
      queued_at: '2026-09-26T10:00:00Z',
      dispatched_at: null,
      started_at: null,
      finished_at: null,
      deadline_at: null,
      cancel_reason: null,
      automatic: false,
      limit: null,
      retry_limit: null,
      regrade: null,
      change: null,
      last_good: null,
      submitted_by: null,
    };
    const by = { entrant: 'e-ada', entrant_name: 'Ada', user_id: 11, username: 'ada' };
    server.use(
      http.get(`${TASK_API}/gradings`, () =>
        HttpResponse.json([
          { task: 'sum', label: 'A', by, grading: graded },
          {
            task: 'sum',
            label: 'A',
            by,
            grading: { ...graded, id: `${graded.id.slice(0, -1)}2`, status: 'running' },
          },
        ]),
      ),
    );
    await openTask();
    const preview = await screen.findByRole('region', { name: "An entrant's page" });
    expect(await within(preview).findByText('total appears here')).toBeVisible();
    const picker = await screen.findByRole('combobox', { name: 'Preview with' });
    expect(picker).toHaveDisplayValue('No submission');
    await waitFor(() =>
      expect(
        within(picker)
          .getAllByRole('option')
          .map((option) => option.textContent),
      ).toEqual(['No submission', 'Ada, #3']),
    );
    await userEvent.selectOptions(picker, 'Ada, #3');
    expect(await within(preview).findByText('2 runs hidden')).toBeVisible();
    expect(within(preview).getByLabelText('Values')).toHaveTextContent('total7');
    expect(bodies.at(-1)).toMatchObject({
      entrant: 'e-ada',
      number: 3,
      moment: 'always',
    });
  });

  it('says to publish first while the draft changes more than show, or the saved task is not the publication', async () => {
    taskBackend({ content: islands, form });
    await openTask();
    const scoring = await screen.findByRole('region', { name: 'Scoring' });
    await screen.findByRole('region', { name: "An entrant's page" });
    await userEvent.click(cell('total', 'Always'));
    expect(screen.queryByText(/Publish to preview these changes/)).toBeNull();
    await userEvent.click(within(scoring).getByRole('button', { name: 'Add a value' }));
    expect(screen.getByText(/Publish to preview these changes/)).toBeVisible();
  });

  it('says so of a saved task ahead of its publication', async () => {
    taskBackend({ content: islands, form });
    server.use(http.get(TASK_API, () => HttpResponse.json(draftTask)));
    await openTask();
    expect(await screen.findByText(/Publish to preview these changes/)).toBeVisible();
  });

  it('asks again once a save publishes, though the show it sends is the same', async () => {
    let published = publishedTask;
    let asked = 0;
    taskBackend({
      content: `${islands}  show:\n    always:\n      values: [total]\n`,
      form,
      answer: () => {
        const latest = { ...publications[1]!, number: 3, version: 'f'.repeat(20) };
        published = { ...publishedTask, head: latest.version, latest };
        return HttpResponse.json(PUBLISHED);
      },
    });
    server.use(
      http.get(TASK_API, () => HttpResponse.json(published)),
      http.post(`${TASK_API}/show-preview`, () => {
        asked += 1;
        return HttpResponse.json({
          hidden: 0,
          moment: 'always',
          placeholders: {
            values: [`answer ${String(asked)}`],
            outputs: [],
            inputs: {},
            runs: [],
          },
          result: null,
        });
      }),
    );
    const { inputs } = await openTask();
    expect(await screen.findByText('answer 1 appears here')).toBeVisible();
    fill(fieldIn(inputs, 'code', 'Label shown to entrants'), 'Your solution');
    expect(await screen.findByText(/Publish to preview these changes/)).toBeVisible();
    await save();
    expect(await screen.findByText('answer 2 appears here')).toBeVisible();
    expect(screen.queryByText(/Publish to preview these changes/)).toBeNull();
  });

  it('says why when the task could not be read, rather than waiting', async () => {
    taskBackend({ content: islands, form });
    server.use(http.get(TASK_API, () => problem(500, 'internal_error')));
    await openTask();
    const part = await screen.findByRole('region', { name: 'Preview' });
    expect(
      await within(part).findByRole('button', { name: /Try again/ }),
    ).toBeVisible();
  });

  it('asks a task never published to be published first', async () => {
    const bodies: unknown[] = [];
    taskBackend({ content: islands, form });
    echoPreview(bodies);
    server.use(
      http.get(TASK_API, () => HttpResponse.json({ ...publishedTask, latest: null })),
    );
    await openTask();
    expect(await screen.findByText('Publish the task to preview it.')).toBeVisible();
    expect(bodies).toEqual([]);
  });

  it('words a show the save would refuse as the save does', async () => {
    taskBackend({ content: islands, form });
    server.use(
      http.post(`${TASK_API}/show-preview`, () =>
        problem(422, 'invalid_definition', {
          errors: [
            {
              path: ['scoring', 'show', 'always', 'values', 0],
              message: 'There is no value nope.',
            },
          ],
        }),
      ),
    );
    await openTask();
    const preview = await screen.findByRole('region', { name: "An entrant's page" });
    expect(await within(preview).findByText('There is no value nope.')).toBeVisible();
  });
});

describe('a publication’s checks', { timeout: 30_000 }, () => {
  beforeEach(fakeLiveStream);
  afterEach(realLiveStream);

  it('reads never checked, and still saves', async () => {
    const { sent } = taskBackend({
      content: ISLANDS,
      form: runForm('unicon/classic@v6', [
        declared('code', 'file'),
        declared('input', 'file'),
      ]),
    });
    const latest = publications[1];
    server.use(
      http.get(TASK_API, () =>
        HttpResponse.json({
          ...publishedTask,
          latest: latest === undefined ? null : { ...latest, check: 'unchecked' },
        }),
      ),
    );
    const { inputs } = await openTask();
    expect(screen.getAllByText(/was never checked/).length).toBeGreaterThan(0);
    fill(fieldIn(inputs, 'code', 'Label shown to entrants'), 'Your solution');
    await save();
    expect(
      await screen.findByText('Saved and published as publication 4.'),
    ).toBeVisible();
    expect(sent).toHaveLength(1);
  });

  it('turns a checking publication refused on the checks nudge, and does not poll', async () => {
    taskBackend({
      content: ISLANDS,
      form: runForm('unicon/classic@v6', [
        declared('code', 'file'),
        declared('input', 'file'),
      ]),
    });
    const latest = publications[1];
    let refused = false;
    const reads: string[] = [];
    server.use(
      http.get(TASK_API, ({ request }) => {
        reads.push(new URL(request.url).pathname);
        return HttpResponse.json({
          ...publishedTask,
          latest:
            latest === undefined
              ? null
              : {
                  ...latest,
                  check: refused ? 'refused' : 'checking',
                  failed_checks: refused
                    ? [
                        {
                          index: 1,
                          failing: ['Run sample got wrong_answer, not accepted.'],
                          runs: [
                            {
                              id: 'run-1',
                              key: { input: 'sample.in' },
                              reports: { passed: '0' },
                              verdict: 'wrong_answer',
                            },
                          ],
                          outcomes: {},
                          values: {},
                          error: null,
                        },
                      ]
                    : [],
                },
        });
      }),
    );
    await openTask();
    openStream();
    expect(
      (await screen.findAllByText(/Its checks are still running/)).length,
    ).toBeGreaterThan(0);
    const settled = reads.length;
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(reads).toHaveLength(settled);
    refused = true;
    nudge('checks');
    expect(await screen.findByText('run-1: wrong_answer')).toBeVisible();
    expect(screen.getAllByText(/was refused/).length).toBeGreaterThan(0);
    expect(reads.length).toBeGreaterThan(settled);
  });
});

describe('scoring while what it reads is not in', { timeout: 60_000 }, () => {
  beforeEach(() => {
    Range.prototype.getClientRects = () => {
      const rects = [] as unknown as DOMRectList;
      Object.defineProperty(rects, 'length', { value: 0 });
      rects.item = () => null;
      return rects;
    };
  });

  /** Islands with a value that reads the workflow's time_ms output. */
  const SCORED = `${ISLANDS}scoring:
  values:
    total: {block: sum, over: {runs: all}, of: {run: [all, time_ms]}}
`;
  const islands = () =>
    runForm('unicon/classic@v6', [declared('code', 'file'), declared('input', 'file')]);

  it('reads an output as a number once the workflow is read', async () => {
    taskBackend({ content: SCORED, form: islands() });
    await openTask();
    const scoring = await screen.findByRole('region', { name: 'Scoring' });

    expect((await within(scoring).findAllByText('number'))[0]).toBeVisible();
    expect(within(scoring).queryByText('to fix')).toBeNull();
  });

  it('calls no output unknown while the workflow is still being read', async () => {
    taskBackend({ content: SCORED, form: islands() });
    server.use(
      http.get('/api/v1/workflows/:owner/:name/versions/:version', async () => {
        await delay('infinite');
        return HttpResponse.json({});
      }),
    );
    await openTask();
    const scoring = await screen.findByRole('region', { name: 'Scoring' });

    expect(within(scoring).queryByText('to fix')).toBeNull();
    expect(scoring).not.toHaveTextContent('could not be read');
    expect(screen.queryByText(/time_ms/)).toBeNull();
  });

  it('says the workflow could not be read, and calls no output unknown', async () => {
    taskBackend({ content: SCORED, form: islands() });
    server.use(
      http.get('/api/v1/workflows/:owner/:name/versions/:version', () =>
        problem(404, 'not_found'),
      ),
    );
    await openTask();
    const scoring = await screen.findByRole('region', { name: 'Scoring' });

    expect(
      await within(scoring).findByText(/The workflow could not be read/),
    ).toBeVisible();
    expect(within(scoring).queryByText('to fix')).toBeNull();
  });

  it('says the blocks could not be loaded, rather than hiding the formulas', async () => {
    taskBackend({ content: SCORED, form: islands() });
    server.use(http.get('/api/v1/blocks', () => problem(500, 'internal')));
    await openTask();
    const scoring = await screen.findByRole('region', { name: 'Scoring' });

    expect(
      await within(scoring).findByText(
        /The blocks formulas are made of could not be loaded/,
      ),
    ).toBeVisible();
    expect(within(scoring).getByRole('button', { name: 'Add a value' })).toBeDisabled();
  });

  it('has no Scoring or Checks card while the saved workflow cannot be read', async () => {
    taskBackend({ content: SCORED });
    await openTask();

    expect(screen.queryByRole('region', { name: 'Scoring' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Checks' })).toBeNull();
  });

  it('has no Scoring or Checks card when no workflow is saved', async () => {
    taskBackend({
      content: 'name: Islands\n',
      form: { ...islands(), workflow: null },
    });
    await openTask();

    expect(screen.queryByRole('region', { name: 'Scoring' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Checks' })).toBeNull();
  });
});
