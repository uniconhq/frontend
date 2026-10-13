import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@/test/user-event';
import { http, HttpResponse } from 'msw';
import { parse } from 'yaml';
import type {
  DeclaredInput,
  FileContent,
  SaveRequest,
  TreeEntry,
  WorkflowForm,
  WorkflowItem,
} from '@/api/types';
import { formatExact } from '@/lib/exact';
import { renderApp } from '@/test/render';
import { afterAnswers, problem, server, signedIn, someone } from '@/test/server';
import {
  TASK_API,
  CONTEST_API,
  draftTask,
  publicationList,
  repoFiles,
  taskState,
  unchanged,
} from '@/test/organiser';
import { makeZip } from '@/test/zip';
import { comeBackToTab, fakeLiveStream, openStream, realLiveStream } from '@/test/live';

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
  submission: {label: Your solution, max_size: 1MB}
  language: {options: [cpp, python], default: cpp}
  checker: checker/checker.cpp
  time_limit: 2
  token: {secret: judge-token}
credit: fraction
test_groups:
  samples: {}
  small: {pass: 30, show: verdict}
  old: {each: 5}
submissions:
  max: 50
  rate: {count: 1, per: 30}
`;

/** The folders under `tests/`: a group each, a test each under it. */
const FOLDERS: Record<string, string[]> = {
  samples: ['1', '2'],
  small: ['1', '2', '3'],
  large: ['1'],
};

function folder(path: string): TreeEntry {
  return {
    path,
    kind: 'directory',
    size: null,
    upload: null,
    start: null,
    token: null,
    version: null,
  };
}

/** The commit a listed file was last changed at, as the tree names it. */
const LISTED_AT = '9f8e7d6c5b4a39281706f5e4d3c2b1a098765432';

/**
 * How a test file begins, as the listing gives it of a small text file
 * (M67): an input "1 2", an answer "3", nothing past 1 KB.
 */
function startFor(path: string, size: number): string | null {
  if (size === 0) return '';
  if (size > 1024) return null;
  return path.endsWith('/input') ? '1 2\n' : '3\n';
}

function file(path: string, size = 4, version: string | null = LISTED_AT): TreeEntry {
  return {
    path,
    kind: 'file',
    size,
    upload: null,
    start: startFor(path, size),
    token: `token-${path}`,
    version,
  };
}

/** The tree of the task's tests as `GET <task>/tree?path=` answers it, folder by folder. */
function testsTree(groups: Record<string, string[]>): Record<string, TreeEntry[]> {
  const tree: Record<string, TreeEntry[]> = {
    tests: Object.keys(groups).map((group) => folder(`tests/${group}`)),
  };
  for (const [group, tests] of Object.entries(groups)) {
    tree[`tests/${group}`] = tests.map((test) => folder(`tests/${group}/${test}`));
    for (const test of tests) {
      tree[`tests/${group}/${test}`] = [
        file(`tests/${group}/${test}/input`),
        file(`tests/${group}/${test}/answer`, 2),
      ];
    }
  }
  return tree;
}

/** A workflow form whose workflow cannot be read, so the cards edit the entries there are. */
const UNREAD: WorkflowForm = {
  workflow: 'unicon/checked@v1',
  inputs: [],
  test: [],
  problem: 'The workflow unicon/checked@v1 cannot be read.',
  graded: false,
  newer: null,
};

function declared(
  id: string,
  type: string,
  more: Partial<DeclaredInput> = {},
): DeclaredInput {
  return {
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
  };
}

/** What unicon/checked@v1 declares, as the backend reads it. */
const CHECKED: WorkflowForm = {
  workflow: 'unicon/checked@v1',
  problem: null,
  graded: false,
  newer: null,
  inputs: [
    declared('submission', 'file', { contestant: true }),
    declared('language', 'enum', {
      contestant: true,
      options: ['cpp', 'python', 'java'],
    }),
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
  test: [
    { name: 'input', type: 'file', options: null },
    { name: 'answer', type: 'file', options: null },
  ],
};

/** unicon/checked's file, which reports a fraction a test may earn. */
const CHECKED_YAML = `inputs:
  submission: {type: file, contestant: true}
  language: {type: enum, options: [cpp, python, java], contestant: true}
  checker: file
  time_limit: {type: number, title: Time limit, unit: seconds}
  memory_limit: {type: number, optional: true}
  strict: boolean
  greeting: {type: text, optional: true}
  token: text
test:
  input: file
  answer: file
steps:
  - {id: run, use: unicon/sandbox-run@v2, per_test: true, with: {}}
  - {id: check, use: unicon/checker-run@v1, per_test: true, with: {}}
report:
  fraction: {from: "\${{ steps.check.fraction }}", better: higher, at_least: 0, at_most: 1}
  time_ms: {from: "\${{ steps.run.time_ms }}", better: lower, at_least: 0}
`;

/** A workflow that takes the time limit from the entrant. */
const TUNABLE_YAML = CHECKED_YAML.replace(
  'time_limit: {type: number, title: Time limit, unit: seconds}',
  'time_limit: {type: number, contestant: true, title: Time limit, unit: seconds}',
);

const WORKFLOWS: WorkflowItem[] = [
  {
    owner: 'unicon',
    name: 'checked',
    versions: ['v1', 'v3'],
    editable: false,
    visibility: 'public',
  },
  {
    owner: 'my-org',
    name: 'tunable',
    versions: ['v1'],
    editable: true,
    visibility: 'private',
  },
];

const PUBLISHED = {
  number: 4,
  grading_changed: true,
  changes: [],
  notes: [],
  regraded: 0,
  effect: unchanged,
};

/**
 * The sum task with its settings as above, its tests as `groups` says, and
 * its workflow declaring what `form` says. Each save is kept in `sent`; with
 * `conflictWith`, the first is refused as a conflict and the settings become
 * that text, as if someone else had saved them.
 */
function taskBackend(
  options: {
    answer?: () => Response;
    conflictWith?: string;
    form?: WorkflowForm;
    groups?: Record<string, string[]>;
    contest?: string;
    /** The settings as stored, in place of the ones above. */
    content?: string;
    /** What the settings' read waits for once a save went through. */
    readAfterSave?: Promise<void>;
  } = {},
) {
  const { answer = () => HttpResponse.json(PUBLISHED), form = UNREAD } = options;
  let tree = testsTree(options.groups ?? FOLDERS);
  let declaredNow = form;
  let settings: FileContent = {
    path: 'task.yaml',
    encoding: 'utf-8',
    content: options.content ?? TASK,
    token: 'token-task',
    upload: null,
    version: '3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d',
  };
  const sent: SaveRequest[] = [];
  server.use(
    signedIn,
    taskState,
    publicationList,
    http.get(`${TASK_API}/tree`, ({ request }) => {
      const at = new URL(request.url).searchParams.get('path') ?? '';
      return at.startsWith('tests') ? HttpResponse.json(tree[at] ?? []) : undefined;
    }),
    http.get(`${TASK_API}/files/:path`, async ({ params }) => {
      const path = decodeURIComponent(String(params['path']));
      if (path === 'task.yaml') {
        if (sent.length > 0) await options.readAfterSave;
        return HttpResponse.json(settings);
      }
      if (path.startsWith('tests/')) {
        return HttpResponse.json({
          path,
          encoding: 'utf-8',
          content: '1 2\n',
          token: `token-${path}`,
          upload: null,
          version: '3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d',
        });
      }
      return undefined;
    }),
    http.get(`${TASK_API}/workflow-form`, () => HttpResponse.json(declaredNow)),
    http.get('/api/v1/workflows', () => HttpResponse.json(WORKFLOWS)),
    http.get('/api/v1/workflows/:owner/:name/versions/:version', ({ params }) =>
      HttpResponse.json({
        content: params['name'] === 'tunable' ? TUNABLE_YAML : CHECKED_YAML,
      }),
    ),
    http.post(`${TASK_API}/save`, async ({ request }) => {
      const body = (await request.json()) as SaveRequest;
      sent.push(body);
      if (options.conflictWith !== undefined && sent.length === 1) {
        settings = {
          ...settings,
          content: options.conflictWith,
          token: 'token-theirs',
        };
        return problem(409, 'conflict');
      }
      const yaml = body.changes.find((change) => change.path === 'task.yaml');
      // A save made with the token of settings since saved over is refused.
      if (yaml !== undefined && yaml.token !== settings.token) {
        return problem(409, 'conflict');
      }
      const answered = answer();
      // A refused save, such as one asking to confirm, writes nothing.
      if (yaml?.content != null && answered.ok) {
        settings = {
          ...settings,
          content: yaml.content,
          token: `token-${String(sent.length)}`,
        };
      }
      return answered;
    }),
    ...repoFiles,
  );
  if (options.contest !== undefined) {
    server.use(
      http.get(`${CONTEST_API}/files/:path`, () =>
        HttpResponse.json({
          path: 'contest.yaml',
          encoding: 'utf-8',
          content: options.contest,
          token: 'token-contest',
          upload: null,
          version: '3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d',
        }),
      ),
    );
  }
  /** Someone else saving the task: its settings, its tests and what its workflow declares. */
  const elsewhere = (now: {
    content: string;
    groups: Record<string, string[]>;
    form: WorkflowForm;
  }) => {
    settings = { ...settings, content: now.content, token: 'token-theirs' };
    tree = testsTree(now.groups);
    declaredNow = now.form;
  };
  return { sent, elsewhere };
}

function asManager() {
  server.use(
    http.get('/api/v1/me', () =>
      HttpResponse.json({
        ...someone,
        roles: [
          { names: { org: 'acme', contest: 'spring', task: 'sum' }, role: 'manager' },
        ],
      }),
    ),
  );
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

/** The settings a save wrote, as values. */
function written(body: SaveRequest | undefined): Record<string, unknown> {
  const yaml = body?.changes.find((change) => change.path === 'task.yaml');
  return parse(yaml?.content ?? '') as Record<string, unknown>;
}

async function openTask() {
  renderApp('/orgs/acme/contests/spring/tasks/sum');
  const inputs = await screen.findByRole('region', { name: 'Inputs' });
  const tests = screen.getByRole('region', { name: 'Tests and scoring' });
  const workflow = screen.getByRole('region', { name: 'Workflow' });
  return { inputs, tests, workflow };
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
  it('builds the inputs from the workflow, each by its title, and saves what changed in one save', async () => {
    const { sent } = taskBackend({ form: CHECKED });
    asManager();
    const { inputs, tests } = await openTask();

    expect(within(tests).getByLabelText('Most submissions')).toBeDisabled();
    const entrants = within(inputs).getByRole('region', {
      name: 'What entrants submit',
    });
    const limits = within(inputs).getByRole('region', { name: 'Limits and settings' });
    expect(fieldIn(limits, 'Time limit (seconds)', /^Time limit/)).toHaveValue('2');
    expect(
      within(limits).getByRole('button', { name: 'About Time limit (seconds)' }),
    ).toBeVisible();
    expect(within(entrants).queryByLabelText(/Time limit/)).toBeNull();

    fill(fieldIn(entrants, 'submission', 'Label shown to entrants'), 'Your program');
    fireEvent.click(
      within(within(entrants).getByRole('group', { name: 'language' })).getByRole(
        'checkbox',
        {
          name: 'java',
        },
      ),
    );
    fill(fieldIn(limits, 'Time limit (seconds)', /^Time limit/), '3');
    fill(fieldIn(limits, 'memory_limit', 'memory_limit'), '256');
    fill(fieldIn(limits, 'strict', 'strict'), 'true');
    fill(fieldIn(limits, 'greeting', 'greeting'), '42');
    expect(
      within(within(limits).getByRole('group', { name: 'token' })).getByRole(
        'checkbox',
        {
          name: 'Use one of the org’s secrets',
        },
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
      submission: { label: 'Your program', max_size: '1MB' },
      language: { options: ['cpp', 'python', 'java'], default: 'cpp' },
      checker: 'checker/checker.cpp',
      time_limit: 3,
      token: { secret: 'judge-token' },
      memory_limit: 256,
      strict: true,
      greeting: '42',
    });
    const content = sent[0]?.changes.find(
      (change) => change.path === 'task.yaml',
    )?.content;
    expect(content).toContain('name: Shortest Path   # the title');
  });

  it('shows, as an empty label’s placeholder, what entrants then see', async () => {
    taskBackend({
      form: {
        ...CHECKED,
        inputs: [
          declared('submission', 'file', { contestant: true, title: 'Solution' }),
          ...CHECKED.inputs.slice(1),
        ],
      },
    });
    const { inputs } = await openTask();

    const entrants = within(inputs).getByRole('region', {
      name: 'What entrants submit',
    });
    // An empty label shows entrants the workflow's title, and its key only
    // where it gives none.
    expect(fieldIn(entrants, 'Solution', 'Label shown to entrants')).toHaveAttribute(
      'placeholder',
      'Solution',
    );
    expect(fieldIn(entrants, 'language', 'Label shown to entrants')).toHaveAttribute(
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
            contestant: true,
            title: 'Solution',
            help: 'The source file the contestant submits.',
          }),
          ...CHECKED.inputs.slice(1),
        ],
      },
    });
    const user = userEvent.setup();
    const { inputs } = await openTask();

    const entrants = within(inputs).getByRole('region', {
      name: 'What entrants submit',
    });
    const solution = within(entrants).getByRole('group', { name: 'Solution' });
    await user.click(within(solution).getByRole('button', { name: 'About Solution' }));
    expect(
      await screen.findByText('The source file the contestant submits.'),
    ).toBeVisible();
    expect(within(solution).queryByText('submission')).toBeNull();
    // An input the workflow gives no title keeps its key as its title, and no ⓘ.
    const language = within(entrants).getByRole('group', { name: 'language' });
    expect(within(language).getByRole('heading', { name: 'language' })).toBeVisible();
    expect(within(language).queryByRole('button', { name: /^About/ })).toBeNull();
    const limits = within(inputs).getByRole('region', { name: 'Limits and settings' });
    expect(within(limits).queryByText('time_limit')).toBeNull();
    expect(fieldIn(limits, 'Time limit (seconds)', /^Time limit/)).toBeVisible();
  });

  it('views and replaces a setting’s file in its box, saving the new one with the task and taking out the old (M51)', async () => {
    const { sent } = taskBackend({ form: CHECKED });
    asManager();
    server.use(
      http.get(`${TASK_API}/tree`, ({ request }) =>
        new URL(request.url).searchParams.get('path') === 'checker'
          ? HttpResponse.json([file('checker/checker.cpp', 21)])
          : undefined,
      ),
      http.get(`${TASK_API}/files/:path`, ({ params }) =>
        decodeURIComponent(String(params['path'])) === 'checker/checker.cpp'
          ? HttpResponse.json({
              path: 'checker/checker.cpp',
              encoding: 'utf-8',
              content: 'int main() { return 0; }\n',
              token: 'token-checker',
              upload: null,
              version: '3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d',
            })
          : undefined,
      ),
    );
    const user = userEvent.setup();
    const { inputs } = await openTask();

    const checker = within(inputs).getByRole('group', { name: 'checker' });
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
    taskBackend({ form: CHECKED });
    asManager();
    server.use(
      http.get(`${TASK_API}/tree`, ({ request }) =>
        new URL(request.url).searchParams.get('path') === 'checker'
          ? HttpResponse.json([file('checker/checker.cpp', 21)])
          : undefined,
      ),
    );
    const user = userEvent.setup();
    const { inputs } = await openTask();

    const checker = within(inputs).getByRole('group', { name: 'checker' });
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
    expect(
      await screen.findByRole('list', { name: 'What changed' }),
    ).not.toHaveTextContent('checker');
  });

  describe('a file chosen for a setting, through a change of workflow', () => {
    /** The checker replaced by checker.py, waiting for the save. */
    async function replaceChecker(form: WorkflowForm) {
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
            ? HttpResponse.json({
                path: 'checker/checker.cpp',
                encoding: 'utf-8',
                content: 'int main() { return 0; }\n',
                token: 'token-checker',
                upload: null,
                version: '3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d',
              })
            : undefined,
        ),
      );
      const user = userEvent.setup();
      const opened = await openTask();
      const checker = within(opened.inputs).getByRole('group', { name: 'checker' });
      await within(checker).findByText('checker.cpp, 21 B');
      await user.click(
        within(checker).getByRole('button', { name: 'Replace checker' }),
      );
      await user.upload(
        within(checker).getByLabelText('checker: a new file'),
        new File(['print(1)\n'], 'checker.py'),
      );
      await within(checker).findByText('checker.py, 9 B');
      return { ...backend, ...opened };
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
        expect(screen.getByRole('combobox', { name: 'Version' })).toHaveValue('v3'),
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
            ? HttpResponse.json({
                content: CHECKED_YAML.replace('  checker: file\n', ''),
              })
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

    expect(within(workflow).getByLabelText('Version')).toHaveValue('v3');
    expect(sent).toEqual([]);
    await save();
    expect(written(await waitForSave(sent))['workflow']).toBe('unicon/checked@v3');
  });

  it('shows the inputs of another workflow as soon as it is chosen, and drops those it does not have', async () => {
    const { sent } = taskBackend({ form: CHECKED });
    asManager();
    const { inputs, workflow } = await openTask();

    fill(await within(workflow).findByLabelText(/^Workflow/), 'my-org/tunable');
    const entrants = await within(inputs).findByRole('region', {
      name: 'What entrants submit',
    });
    expect(
      await within(entrants).findByRole('group', { name: 'Time limit (seconds)' }),
    ).toBeVisible();
    expect(
      within(
        within(entrants).getByRole('group', { name: 'Time limit (seconds)' }),
      ).getByText(
        /The task sets a value for this, but under this workflow entrants give it/,
      ),
    ).toBeVisible();
    fill(fieldIn(entrants, 'Time limit (seconds)', 'Largest allowed'), '10');
    await save();

    const saved = written(await waitForSave(sent));
    expect(saved['workflow']).toBe('my-org/tunable@v1');
    expect((saved['inputs'] as Record<string, unknown>)['time_limit']).toEqual({
      max: 10,
    });
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
    expect(Object.keys(saved.inputs)).toEqual(['language', 'checker']);
  });

  it('edits the inputs the settings hold when the workflow cannot be read', async () => {
    taskBackend();
    const { inputs } = await openTask();

    expect(
      within(inputs).getByText(/The workflow unicon\/checked@v1 cannot be read\./),
    ).toBeVisible();
    expect(
      within(inputs).getByLabelText('Another input, by its name in the workflow'),
    ).toBeVisible();
  });

  it('shows settings that are an upload by their size and digest, not as cards', async () => {
    taskBackend();
    server.use(
      http.get(`${TASK_API}/files/:path`, ({ params }) =>
        params['path'] === 'task.yaml'
          ? HttpResponse.json({
              path: 'task.yaml',
              encoding: 'utf-8',
              content: `version https://git-lfs.github.com/spec/v1\noid sha256:${'d'.repeat(64)}\nsize 120\n`,
              token: 'token-task',
              upload: { size: 120, digest: 'd'.repeat(64) },
              version: '3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d',
            })
          : undefined,
      ),
    );
    renderApp('/orgs/acme/contests/spring/tasks/sum');

    const [shown] = await screen.findAllByRole('region', {
      name: 'Uploaded task.yaml',
    });
    expect(within(shown!).getByText('d'.repeat(64))).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Inputs' })).toBeNull();
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

  it('asks when entrants see a group added once the task is graded, and of no other', async () => {
    const { sent } = taskBackend({ form: { ...CHECKED, inputs: [], graded: true } });
    const { tests } = await openTask();
    const show = (group: string) => fieldIn(tests, group, /^When entrants see results/);

    expect(show('large')).toHaveValue('');
    expect(show('large')).toHaveAccessibleDescription(
      'The task has graded submissions, so a test group added now must say when its results are shown.',
    );
    expect(show('small')).toHaveValue('verdict');
    // The chosen option's meaning reads under the box.
    expect(show('small')).toHaveAccessibleDescription(
      'Entrants see at once whether the group passed and its points, and each test’s result once the task closes.',
    );
    const bar = await screen.findByRole('region', { name: 'Save the task' });
    expect(within(bar).getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(bar).toHaveTextContent('Choose when entrants see large’s results.');
    fill(show('large'), 'verdict');
    expect(within(bar).getByRole('button', { name: 'Save' })).toBeEnabled();
    await save();

    expect(written(await waitForSave(sent))['test_groups']).toEqual({
      samples: {},
      small: { pass: 30, show: 'verdict' },
      old: { each: 5 },
      large: { show: 'verdict' },
    });
  });

  it('will not save a points box that holds no number', async () => {
    taskBackend();
    const { tests } = await openTask();

    fill(fieldIn(tests, 'small', 'Points'), 'thirty');

    expect(within(tests).getByText('Enter a number.')).toBeVisible();
    expect(
      within(screen.getByRole('region', { name: 'Save the task' })).getByRole(
        'button',
        {
          name: 'Save',
        },
      ),
    ).toBeDisabled();
  });

  it('merges field by field, in words, when someone else saved the settings first', async () => {
    const theirs = TASK.replace('time_limit: 2', 'time_limit: 5');
    const { sent } = taskBackend({ conflictWith: theirs });
    const { inputs, tests } = await openTask();

    fill(fieldIn(inputs, 'time_limit', 'Value'), '3');
    fill(fieldIn(tests, 'small', 'Points'), '40');
    await save();

    const merge = await screen.findByRole('list', { name: 'Fields that differ' });
    const limit = within(merge).getByRole('radiogroup', {
      name: 'Inputs: time_limit (both changed it)',
    });
    await userEvent.click(within(limit).getByRole('radio', { name: 'Now: 5' }));
    expect(
      within(merge).getByRole('radiogroup', {
        name: 'Tests and scoring, small: Points when enough tests pass',
      }),
    ).toBeVisible();
    await userEvent.click(
      screen.getByRole('button', { name: 'Save the merged version' }),
    );

    expect(
      await screen.findByText('Saved and published as publication 4.'),
    ).toBeVisible();
    const yaml = sent[1]?.changes.find((change) => change.path === 'task.yaml');
    expect(yaml?.token).toBe('token-theirs');
    const saved = written(sent[1]) as {
      inputs: Record<string, unknown>;
      test_groups: Record<string, unknown>;
    };
    expect(saved.inputs['time_limit']).toBe(5);
    expect(saved.test_groups['small']).toEqual({ pass: 40, show: 'verdict' });
  });
});

describe('the cards while the task is being changed', { timeout: 30_000 }, () => {
  beforeEach(fakeLiveStream);
  afterEach(realLiveStream);

  it('keep what was changed, and do not spin, when the tab comes back, and meet someone else’s save at the save', async () => {
    const { sent, elsewhere } = taskBackend();
    const { inputs, tests } = await openTask();
    openStream();
    fill(fieldIn(inputs, 'time_limit', 'Value'), '3');
    fill(fieldIn(tests, 'small', 'Points'), '40');

    // Someone else saves the task meanwhile, with a new group and a graded submission.
    elsewhere({
      content: TASK.replace('time_limit: 2', 'time_limit: 5'),
      groups: { ...FOLDERS, extra: ['1'] },
      form: { ...UNREAD, graded: true },
    });
    await afterAnswers(comeBackToTab);

    const cards = screen.getByRole('region', { name: 'Inputs' });
    expect(fieldIn(cards, 'time_limit', 'Value')).toHaveValue('3');
    expect(
      fieldIn(
        screen.getByRole('region', { name: 'Tests and scoring' }),
        'small',
        'Points',
      ),
    ).toHaveValue('40');
    const bar = screen.getByRole('region', { name: 'Save the task' });
    const button = within(bar).getByRole('button', { name: 'Save' });
    expect(button).not.toHaveAttribute('data-loading');
    expect(button).toBeEnabled();

    await userEvent.click(button);

    const merge = await screen.findByRole('list', { name: 'Fields that differ' });
    expect(
      within(merge).getByRole('radiogroup', {
        name: 'Inputs: time_limit (both changed it)',
      }),
    ).toBeVisible();
    const yaml = sent[0]?.changes.find((change) => change.path === 'task.yaml');
    expect(yaml?.token).toBe('token-task');
  });
});

describe('discarding at a conflict', { timeout: 30_000 }, () => {
  it('drops my changes and shows the settings as they are now', async () => {
    const theirs = TASK.replace('time_limit: 2', 'time_limit: 5');
    // A folder for each group the settings hold, so nothing else is to save.
    taskBackend({
      conflictWith: theirs,
      groups: { samples: ['1', '2'], small: ['1', '2', '3'], old: ['1'] },
    });
    const { tests } = await openTask();

    fill(fieldIn(tests, 'small', 'Points'), '40');
    await save();
    await screen.findByRole('list', { name: 'Fields that differ' });
    await userEvent.click(screen.getByRole('button', { name: 'Discard my changes' }));

    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Save the task' })).toBeNull(),
    );
    const inputs = await screen.findByRole('region', { name: 'Inputs' });
    expect(await within(inputs).findByDisplayValue('5')).toBeVisible();
    expect(
      fieldIn(
        screen.getByRole('region', { name: 'Tests and scoring' }),
        'small',
        'Points',
      ),
    ).toHaveValue('30');
  });
});

/** The first save sent, once it has been. */
async function waitForSave(sent: SaveRequest[]): Promise<SaveRequest> {
  await expect.poll(() => sent.length).toBeGreaterThan(0);
  return sent[0] as SaveRequest;
}

describe('scoring a task', { timeout: 30_000 }, () => {
  it('removes test weights set for tests a group does not have, which the save refuses', async () => {
    const { sent } = taskBackend({
      form: { ...CHECKED, inputs: [] },
      content: TASK.replace(
        'small: {pass: 30, show: verdict}',
        'small: {pass: 30, pass_at: 0.5, test_weights: {"2": 3, "9": 4}}',
      ),
    });
    const { tests } = await openTask();

    const small = fieldGroup(tests, 'small');
    expect(small).toHaveTextContent(
      'Weights are set for tests the group does not have: 9 (4).',
    );
    await userEvent.click(
      within(small).getByRole('button', {
        name: 'Remove the weights of tests small does not have',
      }),
    );
    await save();

    const groups = written(await waitForSave(sent))['test_groups'] as Record<
      string,
      unknown
    >;
    expect(groups['small']).toEqual({
      pass: 30,
      pass_at: 0.5,
      test_weights: { '2': 3 },
    });
  });

  it('says what each group does as an entrant is told, and the task’s total', async () => {
    taskBackend({ form: { ...CHECKED, inputs: [] } });
    const { tests } = await openTask();

    expect(
      within(fieldGroup(tests, 'small')).getByText(
        'An entrant earns 30 points when every test passes, and nothing otherwise. An entrant who passes 2 of 3 gets nothing.',
      ),
    ).toBeVisible();
    expect(within(tests).getByLabelText('The task’s points')).toHaveTextContent(
      `Total: ${formatExact('35')} points.`,
    );
    const rule = fieldIn(tests, 'old', 'How does this group earn points?');
    expect(
      within(rule).getByRole('option', { name: 'The lowest test score counts' }),
    ).toBeEnabled();
  });

  it('greys out a rule the save would refuse, with the reason', async () => {
    taskBackend({ form: { ...CHECKED, inputs: [] } });
    const { tests } = await openTask();

    await userEvent.click(
      within(tests).getByRole('radio', {
        name: 'All when it passes, nothing when it fails',
      }),
    );
    const rule = fieldIn(tests, 'small', 'How does this group earn points?');
    expect(
      within(rule).getByRole('option', {
        name: 'The lowest test score counts (needs tests that earn part of their points)',
      }),
    ).toBeDisabled();
    expect(rule).not.toHaveAccessibleDescription(/lowest/);

    // A group that earns by each test cannot show its pass or fail alone: the
    // choice is greyed with its reason in its own label.
    const shows = () => fieldIn(tests, 'old', /^When entrants see results/);
    expect(
      within(shows()).getByRole('option', {
        name: 'Pass or fail right away, the tests once the task closes (needs a group that earns all or nothing)',
      }),
    ).toBeDisabled();
    fill(fieldIn(tests, 'old', 'How does this group earn points?'), 'all');
    expect(
      within(shows()).getByRole('option', {
        name: 'Pass or fail right away, the tests once the task closes',
      }),
    ).toBeEnabled();
  });

  it('keeps the bonus rule chosen while its bonus is still empty', async () => {
    taskBackend({ form: { ...CHECKED, inputs: [] } });
    const { tests } = await openTask();

    const rule = fieldIn(tests, 'small', 'How does this group earn points?');
    fill(rule, 'bonus');

    expect(rule).toHaveValue('bonus');
    const bonus = fieldIn(tests, 'small', 'Bonus for passing every test');
    fill(bonus, '10');
    expect(
      within(fieldGroup(tests, 'small')).getByText(
        /Passing every test earns 10 points more\./,
      ),
    ).toBeVisible();
    expect(fieldIn(tests, 'small', 'How does this group earn points?')).toHaveValue(
      'bonus',
    );
  });

  it('keeps a share as it is typed, its point included, and saves the fraction it is', async () => {
    const { sent } = taskBackend({ form: { ...CHECKED, inputs: [] } });
    const { tests } = await openTask();

    fill(fieldIn(tests, 'small', 'How does this group earn points?'), 'share');
    const share = fieldIn(tests, 'small', 'Share of tests that must pass (%)');
    await userEvent.clear(share);
    await userEvent.type(share, '82.5');

    expect(share).toHaveValue('82.5');
    expect(
      within(fieldGroup(tests, 'small')).getByText(/at least 82\.5% of its tests pass/),
    ).toBeVisible();
    await save();
    expect(
      await screen.findByText('Saved and published as publication 4.'),
    ).toBeVisible();
    expect(written(sent[0])['test_groups']).toMatchObject({
      small: { pass: 30, pass_at: 0.825 },
    });
  });

  it('says the parts add up to the points here where the contest scales the task to its own worth', async () => {
    taskBackend({
      form: { ...CHECKED, inputs: [] },
      contest: 'name: Spring\ntasks:\n  - id: sort\n  - id: sum\n    worth: 70\n',
    });
    const { tests } = await openTask();

    fill(fieldIn(tests, 'small', 'How does this group earn points?'), 'advanced');
    const small = fieldGroup(tests, 'small');
    fill(within(small).getByLabelText('Points shared among the tests'), '100');
    fill(within(small).getByLabelText('Points times the lowest test score'), '10');

    expect(
      within(small).getByText('The parts add up: up to 140 points here.'),
    ).toBeVisible();
  });

  it('sets a hand-set mix one line per part, its bar inside its line, and says what the parts add up to (M59)', async () => {
    const { sent } = taskBackend({ form: { ...CHECKED, inputs: [] } });
    const { tests } = await openTask();

    const rule = fieldIn(tests, 'small', 'How does this group earn points?');
    fill(rule, 'advanced');
    expect(rule).toHaveDisplayValue('A mix of these, each part with its own points');
    const small = fieldGroup(tests, 'small');
    const lines = within(
      within(small).getByRole('list', { name: 'The parts of the mix' }),
    ).getAllByRole('listitem');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toHaveTextContent(
      'points shared among the tests, each times its score from 0 to 1',
    );
    expect(lines[1]).toHaveTextContent('points times the lowest test score');
    expect(lines[2]).toHaveTextContent('points when at least% of the tests pass');
    fill(within(lines[0]!).getByLabelText('Points shared among the tests'), '100');
    fill(within(lines[1]!).getByLabelText('Points times the lowest test score'), '10');
    const share = within(lines[2]!).getByLabelText('Share of tests that must pass (%)');
    await userEvent.type(share, '80');

    expect(
      within(small).getByText('The parts add up: up to 140 points.'),
    ).toBeVisible();
    expect(
      within(small).getByText(
        /An entrant whose tests all score 0\.5 gets 55 \(50 \+ 5 \+ 0\)\./,
      ),
    ).toBeVisible();
    await save();
    expect(
      await screen.findByText('Saved and published as publication 4.'),
    ).toBeVisible();
    expect(written(sent[0])['test_groups']).toMatchObject({
      small: { each: 100, worst: 10, pass: 30, pass_at: 0.8 },
    });
  });

  it('says one thing of a mix with no points yet: that its tests are for practice', async () => {
    taskBackend({ form: { ...CHECKED, inputs: [] } });
    const { tests } = await openTask();

    fill(fieldIn(tests, 'samples', 'How does this group earn points?'), 'advanced');
    const samples = fieldGroup(tests, 'samples');
    expect(
      within(samples).getByRole('list', { name: 'The parts of the mix' }),
    ).toBeVisible();
    expect(samples).not.toHaveTextContent(/add up/);
    expect(
      within(samples).getByText('Its tests are for entrants to practise on.'),
    ).toBeVisible();
  });

  it('leaves the lowest test score out of a mix while tests only pass or fail, and says why one set cannot stay (M59)', async () => {
    taskBackend({
      form: { ...CHECKED, inputs: [] },
      content: TASK.replace('credit: fraction\n', '').replace(
        'old: {each: 5}',
        'old: {each: 5, worst: 5}',
      ),
    });
    const { tests } = await openTask();

    fill(fieldIn(tests, 'small', 'How does this group earn points?'), 'advanced');
    const small = within(fieldGroup(tests, 'small')).getByRole('list', {
      name: 'The parts of the mix',
    });
    expect(within(small).getAllByRole('listitem')).toHaveLength(2);
    expect(
      within(small).queryByLabelText('Points times the lowest test score'),
    ).toBeNull();
    expect(within(small).getAllByRole('listitem')[0]).toHaveTextContent(
      'points shared among the tests passed',
    );

    const old = within(fieldGroup(tests, 'old')).getByRole('list', {
      name: 'The parts of the mix',
    });
    expect(
      within(old).getByLabelText('Points times the lowest test score'),
    ).toHaveValue('5');
    expect(old).toHaveTextContent(
      'Only available when a test can earn part of its points. Set how a test earns first.',
    );
  });

  it('offers how a test earns as options with an example each, and says in a value’s own name why it cannot be one', async () => {
    taskBackend({ form: { ...CHECKED, inputs: [] } });
    const { tests } = await openTask();

    const earns = within(tests).getByRole('radiogroup', { name: 'A test earns' });
    expect(
      within(earns)
        .getAllByRole('radio')
        .map((radio) => radio.getAttribute('value')),
    ).toEqual(['none', 'value', 'relative']);
    expect(
      within(earns).getByRole('radio', {
        name: 'A score the workflow gives it, from 0 to 1',
      }),
    ).toBeChecked();
    expect(
      within(earns).getByRole('radio', {
        name: 'All when it passes, nothing when it fails',
      }),
    ).toHaveAccessibleDescription(
      'Every test is worth the same; it passes when its answer is accepted, or it does not.',
    );

    const value = await within(tests).findByRole('combobox', { name: 'Which value' });
    expect(within(value).getByRole('option', { name: 'fraction' })).toBeEnabled();
    expect(
      within(value).getByRole('option', {
        name: 'time_ms (not promised to be 1 or less)',
      }),
    ).toBeDisabled();
    expect(value).not.toHaveAccessibleDescription(/time_ms/);

    await userEvent.click(
      within(earns).getByRole('radio', {
        name: 'Its result against the best any entrant reached',
      }),
    );
    // Against the best, each value says which way is better.
    expect(
      within(within(tests).getByRole('combobox', { name: 'Which value' })).getByRole(
        'option',
        { name: 'time_ms (lower is better)' },
      ),
    ).toBeEnabled();
  });

  it('gives the lower-is-better case against the best, and says in its own line that a workflow gives no score rather than greying every value (M58)', async () => {
    taskBackend({
      form: { ...CHECKED, inputs: [] },
      content: TASK.replace('credit: fraction\n', ''),
    });
    server.use(
      http.get('/api/v1/workflows/:owner/:name/versions/:version', () =>
        HttpResponse.json({
          content: CHECKED_YAML.replace(/ {2}fraction: .*\n/, '').replace(
            'better: lower, at_least: 0}',
            'better: lower, at_least: 0, title: Run time, unit: ms}',
          ),
        }),
      ),
    );
    const { tests } = await openTask();

    const earns = within(tests).getByRole('radiogroup', { name: 'A test earns' });
    expect(
      within(earns).getByRole('radio', {
        name: 'Its result against the best any entrant reached',
      }),
    ).toHaveAccessibleDescription(
      /where lower is better, as with run time, the fastest earns all of it and one twice as slow earns half\./,
    );
    const score = within(earns).getByRole('radio', {
      name: 'A score the workflow gives it, from 0 to 1',
    });
    await waitFor(() => expect(score).toBeDisabled());
    expect(score).toHaveAccessibleDescription(
      /This workflow’s checker only says right or wrong, so it gives no score from 0 to 1\.$/,
    );
    expect(
      within(tests).queryByRole('combobox', { name: 'Which value' }),
    ).not.toBeInTheDocument();

    // A value is named by its title where the workflow gives one.
    await userEvent.click(
      within(earns).getByRole('radio', {
        name: 'Its result against the best any entrant reached',
      }),
    );
    expect(
      within(within(tests).getByRole('combobox', { name: 'Which value' })).getByRole(
        'option',
        { name: 'Run time (lower is better)' },
      ),
    ).toBeEnabled();
  });

  it('will not save a score the workflow gives until its value is chosen', async () => {
    taskBackend({
      form: { ...CHECKED, inputs: [] },
      content: TASK.replace('credit: fraction\n', ''),
    });
    const { tests } = await openTask();

    await userEvent.click(
      within(tests).getByRole('radio', {
        name: 'A score the workflow gives it, from 0 to 1',
      }),
    );

    const bar = await screen.findByRole('region', { name: 'Save the task' });
    expect(bar).toHaveTextContent(
      'Choose which value a test earns, under How a test earns.',
    );
    expect(within(bar).getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('will not save a share above 100%', async () => {
    taskBackend({ form: { ...CHECKED, inputs: [] } });
    const { tests } = await openTask();

    fill(fieldIn(tests, 'small', 'How does this group earn points?'), 'share');
    fill(fieldIn(tests, 'small', 'Share of tests that must pass (%)'), '120');

    const bar = await screen.findByRole('region', { name: 'Save the task' });
    expect(bar).toHaveTextContent('Give a share above 0% and at most 100%.');
    expect(within(bar).getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('keeps the share rule chosen while its share is emptied or set to 100', async () => {
    taskBackend({ form: { ...CHECKED, inputs: [] } });
    const { tests } = await openTask();

    const rule = fieldIn(tests, 'small', 'How does this group earn points?');
    fill(rule, 'share');
    fill(fieldIn(tests, 'small', 'Share of tests that must pass (%)'), '');
    expect(rule).toHaveValue('share');
    const share = fieldIn(tests, 'small', 'Share of tests that must pass (%)');
    fill(share, '100');
    expect(rule).toHaveValue('share');
    fill(fieldIn(tests, 'small', 'Share of tests that must pass (%)'), '90');
    expect(
      within(fieldGroup(tests, 'small')).getByText(/at least 90% of its tests pass/),
    ).toBeVisible();
  });

  it('keeps a saved share group’s rule while its share is typed again', async () => {
    taskBackend({
      form: { ...CHECKED, inputs: [] },
      content: TASK.replace(
        'small: {pass: 30, show: verdict}',
        'small: {pass: 30, pass_at: 0.8}',
      ),
    });
    const { tests } = await openTask();

    const rule = fieldIn(tests, 'small', 'How does this group earn points?');
    expect(rule).toHaveValue('share');
    fill(fieldIn(tests, 'small', 'Share of tests that must pass (%)'), '');
    expect(rule).toHaveValue('share');
  });

  it('says before a save that a task with no worth of its own is worth its new total (#435)', async () => {
    taskBackend({ form: { ...CHECKED, inputs: [] } });
    const { tests } = await openTask();

    fill(fieldIn(tests, 'small', 'Points'), '40');

    const bar = await screen.findByRole('region', { name: 'Save the task' });
    expect(bar).toHaveTextContent(
      `This changes the task’s points: its contest gives it no worth of its own, so the task will be worth ${formatExact('45')} points, not ${formatExact('35')}.`,
    );
  });

  it('scales each group’s points to what the contest makes the task worth, exactly', async () => {
    taskBackend({
      form: { ...CHECKED, inputs: [] },
      contest: 'name: Spring\ntasks:\n  - id: sort\n  - id: sum\n    worth: 70\n',
    });
    const { tests } = await openTask();

    expect(
      await within(tests).findByText(
        /^An entrant earns 60 points when every test passes, and nothing otherwise\./,
      ),
    ).toBeVisible();
    expect(within(tests).getByLabelText('The task’s points')).toHaveTextContent(
      `Its contest makes the task worth ${formatExact('70')}`,
    );
  });
});

function fieldGroup(scope: HTMLElement, name: string): HTMLElement {
  return within(scope).getByRole('group', { name });
}

describe('the save’s answer (M66)', { timeout: 30_000 }, () => {
  it('stands in the page at the bar’s place once nothing is left to save, with Close', async () => {
    taskBackend({ form: { ...CHECKED, inputs: [] } });
    const { tests } = await openTask();

    fill(fieldIn(tests, 'small', 'Points'), '40');
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
    taskBackend({ form: { ...CHECKED, inputs: [] } });
    const { tests } = await openTask();

    fill(fieldIn(tests, 'small', 'Points'), '40');
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
        screen.getByRole('region', { name: 'Tests and scoring' }),
        'small',
        'Points',
      ),
      '50',
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
      form: { ...CHECKED, inputs: [] },
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
    const { tests } = await openTask();

    fill(fieldIn(tests, 'small', 'Points'), '40');
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
      form: { ...CHECKED, inputs: [] },
      answer: () =>
        problem(409, 'confirmation_required', {
          detail: 'The contest is running and this changes how the task grades.',
          changes: ['limits.time changed'],
          regrades: 2,
        }),
    });
    const { tests } = await openTask();

    fill(fieldIn(tests, 'small', 'Points'), '40');
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
      form: { ...CHECKED, inputs: [] },
      answer: () =>
        problem(409, 'confirmation_required', {
          detail: 'The contest is running, so this save asks before it publishes.',
          changes: [],
          regrades: 0,
          ...unchanged,
          asked: 'b1c2d3e:12',
        }),
    });
    const { tests } = await openTask();

    fill(fieldIn(tests, 'small', 'Points'), '40');
    await save();
    const bar = screen.getByRole('region', { name: 'Save the task' });
    expect(
      await within(bar).findByRole('button', { name: 'Publish the change' }),
    ).toBeVisible();
    expect(fieldIn(tests, 'small', 'Points')).toBeDisabled();
    expect(within(bar).queryByRole('button', { name: 'Save' })).toBeNull();
    expect(within(bar).getByRole('button', { name: 'Discard changes' })).toBeEnabled();
  });
});

describe('the tests of a task', { timeout: 30_000 }, () => {
  it('offers to add a test, not a count of none, before any file is chosen', async () => {
    taskBackend({ form: { ...CHECKED, inputs: [] } });
    const { tests } = await openTask();

    await userEvent.click(
      within(fieldGroup(tests, 'small')).getByRole('button', {
        name: 'Add tests to small',
      }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Add tests' });
    const how = within(dialog).getByRole('radiogroup', {
      name: 'How do you want to add tests?',
    });
    expect(
      within(how).getByRole('radio', { name: 'One test' }),
    ).toHaveAccessibleDescription('Pick its input and its answer.');
    expect(
      within(how).getByRole('radio', { name: 'Many files at once' }),
    ).toHaveAccessibleDescription(
      'Drop pairs like 1.in and 1.out. Each number becomes one test.',
    );
    expect(
      within(how).getByRole('radio', { name: 'A zip' }),
    ).toHaveAccessibleDescription(
      'The same pairs in a zip, or a folder per test (1/input, 1/answer).',
    );
    const one = within(dialog).getByRole('button', { name: 'Add the test' });
    expect(one).toBeDisabled();
    expect(one).toHaveAccessibleDescription('Pick its input and its answer first.');

    await userEvent.click(
      within(how).getByRole('radio', { name: 'Many files at once' }),
    );
    const many = within(dialog).getByRole('button', { name: 'Add tests' });
    expect(many).toBeDisabled();
    expect(many).toHaveAccessibleDescription('No files dropped yet.');
    expect(
      within(dialog).getByRole('region', { name: 'What the files make' }),
    ).toHaveTextContent('Drop files above to see the tests they make.');
    expect(within(dialog).queryByText(/Add 0/)).toBeNull();
    expect(within(dialog).getByLabelText('How to name the files')).toHaveTextContent(
      "Each test needs an input and an answer.Name them like 1.in (test 1's input) and 1.out (test 1's answer).Also taken: .inp, .input; .ans, .a, .expected, .answer.",
    );
  });

  it('shows a test a file is missing from as Missing in its column, and adds only the complete ones', async () => {
    const { sent } = taskBackend({ form: { ...CHECKED, inputs: [] } });
    const { tests } = await openTask();

    await userEvent.click(
      within(fieldGroup(tests, 'small')).getByRole('button', {
        name: 'Add tests to small',
      }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Add tests' });
    await userEvent.click(
      within(dialog).getByRole('radio', { name: 'Many files at once' }),
    );
    const drop = within(dialog).getByLabelText('Test files');
    await userEvent.upload(drop, [new File(['1 1\n'], '5.in')]);
    const table = within(dialog).getByRole('table', { name: 'Tests the files make' });
    const [, five] = within(table).getAllByRole('row');
    expect(
      within(five!)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual(['5.in, 4 B', 'Missing', 'A part is missing.']);
    const add = within(dialog).getByRole('button', { name: 'Add tests' });
    expect(add).toBeDisabled();
    expect(add).toHaveAccessibleDescription(
      'No test is complete yet: the table says what each one is missing.',
    );

    await userEvent.upload(drop, [
      new File(['2\n'], '6.in'),
      new File(['3\n'], '6.ans'),
    ]);
    expect(add).toBeEnabled();
    expect(add).toHaveAccessibleDescription(
      'Adds 1 test; 1 test that is not complete is left out.',
    );
    await userEvent.click(add);
    await save();
    const body = await waitForSave(sent);
    expect(
      body.changes
        .filter((change) => change.path.startsWith('tests/'))
        .map((change) => change.path),
    ).toEqual(['tests/small/6/input', 'tests/small/6/answer']);
  });

  it('adds tests from files named by test, shows what was matched first, and saves them with the settings', async () => {
    const { sent } = taskBackend({ form: { ...CHECKED, inputs: [] } });
    const { tests } = await openTask();

    await userEvent.click(
      within(fieldGroup(tests, 'small')).getByRole('button', {
        name: 'Add tests to small',
      }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Add tests' });
    await userEvent.click(
      within(dialog).getByRole('radio', { name: 'Many files at once' }),
    );
    await userEvent.upload(within(dialog).getByLabelText('Test files'), [
      new File(['1 1\n'], '4.in'),
      new File(['2\n'], '4.out'),
      new File(['x'], 'notes.txt'),
    ]);
    const matched = within(dialog).getByRole('region', { name: 'What the files make' });
    const table = within(matched).getByRole('table', { name: 'Tests the files make' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['Test', 'input', 'answer', 'Notes']);
    expect(within(table).getByRole('row', { name: /small, test 4/ })).toHaveTextContent(
      'small, test 44.in, 4 B4.out, 2 BComplete',
    );
    expect(
      within(matched).getByRole('list', { name: 'Not matched' }),
    ).toHaveTextContent(
      'notes.txt: Its ending “.txt” names no part of a test: a test has input, answer.',
    );
    const add = within(dialog).getByRole('button', { name: 'Add tests' });
    expect(add).toHaveAccessibleDescription('Adds 1 test.');
    await userEvent.click(add);

    const rows = within(fieldGroup(tests, 'small')).getByRole('list', {
      name: 'Tests of small',
    });
    expect(within(rows).getByText('New')).toBeVisible();
    await save();

    const body = await waitForSave(sent);
    expect(body.changes.filter((change) => change.path.startsWith('tests/'))).toEqual([
      {
        path: 'tests/small/4/input',
        token: null,
        content: btoa('1 1\n'),
        encoding: 'base64',
        remove: false,
      },
      {
        path: 'tests/small/4/answer',
        token: null,
        content: btoa('2\n'),
        encoding: 'base64',
        remove: false,
      },
    ]);
  });

  it('says a zip is being read while it is, never that it holds no files', async () => {
    taskBackend({ form: { ...CHECKED, inputs: [] } });
    const { tests } = await openTask();
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const zip = await makeZip([
      { name: '1.in', text: '1 1\n' },
      { name: '1.out', text: '2\n' },
    ]);
    // A zip whose bytes come only once the test lets them, as a big one's do.
    const slow = new File([zip], 'tests.zip', { type: 'application/zip' });
    const slice = slow.slice.bind(slow);
    slow.slice = (...args: Parameters<Blob['slice']>) => {
      const part = slice(...args);
      const read = part.arrayBuffer.bind(part);
      part.arrayBuffer = async () => {
        await held;
        return read();
      };
      return part;
    };

    await userEvent.click(within(tests).getByRole('button', { name: 'Add tests' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add tests' });
    await userEvent.click(within(dialog).getByRole('radio', { name: 'A zip' }));
    await userEvent.upload(within(dialog).getByLabelText('Zip of tests'), slow);

    const made = within(dialog).getByRole('region', { name: 'What the files make' });
    expect(made).toHaveTextContent('Reading the zip…');
    expect(made).not.toHaveTextContent('holds no files');
    const add = within(dialog).getByRole('button', { name: 'Add tests' });
    expect(add).toHaveAccessibleDescription('The zip is still being read.');

    release();
    expect(await within(dialog).findByRole('row', { name: /test 1/ })).toBeVisible();
    expect(made).not.toHaveTextContent('Reading the zip');
  });

  it('shows no empty table for files that make no test, and says so beside the button', async () => {
    taskBackend({ form: { ...CHECKED, inputs: [] } });
    const { tests } = await openTask();

    await userEvent.click(within(tests).getByRole('button', { name: 'Add tests' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add tests' });
    await userEvent.click(
      within(dialog).getByRole('radio', { name: 'Many files at once' }),
    );
    await userEvent.upload(within(dialog).getByLabelText('Test files'), [
      new File(['x'], 'readme.txt'),
    ]);

    const made = within(dialog).getByRole('region', { name: 'What the files make' });
    expect(within(made).queryByRole('table')).toBeNull();
    expect(within(made).getByRole('list', { name: 'Not matched' })).toHaveTextContent(
      'readme.txt',
    );
    expect(
      within(dialog).getByRole('button', { name: 'Add tests' }),
    ).toHaveAccessibleDescription(
      'None of the files dropped makes a test: the list says why for each.',
    );
  });

  it('adds a new group’s tests from a zip, and the group shows in scoring', async () => {
    const { sent } = taskBackend({ form: { ...CHECKED, inputs: [] } });
    const { tests } = await openTask();

    await userEvent.click(within(tests).getByRole('button', { name: 'Add tests' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add tests' });
    await userEvent.click(within(dialog).getByRole('radio', { name: 'A zip' }));
    await userEvent.upload(
      within(dialog).getByLabelText('Zip of tests'),
      await makeZip([
        { name: 'tests/huge/1/input', text: '9 9\n' },
        { name: 'tests/huge/1/answer', text: '18\n' },
      ]),
    );
    expect(
      await within(dialog).findByRole('row', { name: /huge, test 1/ }),
    ).toHaveTextContent('huge, test 1input, 4 Banswer, 3 BIn a new group.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add tests' }));

    const group = fieldGroup(tests, 'huge');
    fill(within(group).getByLabelText('How does this group earn points?'), 'all');
    fill(within(group).getByLabelText('Points'), '50');
    await save();

    const body = await waitForSave(sent);
    expect(body.changes.map((change) => change.path)).toEqual([
      'task.yaml',
      'tests/huge/1/input',
      'tests/huge/1/answer',
    ]);
    expect((written(body)['test_groups'] as Record<string, unknown>)['huge']).toEqual({
      pass: 50,
    });
  });

  it('says before the save that a new group gives no points until its rule is chosen', async () => {
    taskBackend({ form: { ...CHECKED, inputs: [] } });
    const { tests } = await openTask();

    await userEvent.click(within(tests).getByRole('button', { name: 'Add tests' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add tests' });
    await userEvent.click(within(dialog).getByRole('radio', { name: 'A zip' }));
    await userEvent.upload(
      within(dialog).getByLabelText('Zip of tests'),
      await makeZip([
        { name: 'tests/huge/1/input', text: '9 9\n' },
        { name: 'tests/huge/1/answer', text: '18\n' },
      ]),
    );
    await within(dialog).findByRole('row', { name: /huge, test 1/ });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add tests' }));

    const bar = await screen.findByRole('region', { name: 'Save the task' });
    expect(bar).toHaveTextContent(
      'huge gives no points: it is for practice until you choose how it earns.',
    );
    fill(
      within(fieldGroup(tests, 'huge')).getByLabelText(
        'How does this group earn points?',
      ),
      'all',
    );
    expect(bar).not.toHaveTextContent('huge gives no points');
  });

  it('takes a test out with the token each of its files was read with', async () => {
    const { sent } = taskBackend({ form: { ...CHECKED, inputs: [] } });
    const { tests } = await openTask();

    const rows = within(fieldGroup(tests, 'small')).getByRole('list', {
      name: 'Tests of small',
    });
    await userEvent.click(within(rows).getByRole('button', { name: 'Remove test 2' }));
    expect(await within(rows).findByText('To be removed')).toBeVisible();
    await save();

    const body = await waitForSave(sent);
    expect(body.changes.filter((change) => change.path !== 'task.yaml')).toEqual([
      {
        path: 'tests/small/2/input',
        token: 'token-tests/small/2/input',
        remove: true,
        encoding: 'utf-8',
      },
      {
        path: 'tests/small/2/answer',
        token: 'token-tests/small/2/answer',
        remove: true,
        encoding: 'utf-8',
      },
    ]);
  });

  it('drops a removed test’s weight with it, and undo brings the weight back', async () => {
    const { sent } = taskBackend({
      form: { ...CHECKED, inputs: [] },
      content: TASK.replace(
        'small: {pass: 30, show: verdict}',
        "small: {each: 30, test_weights: {'2': 3, '3': 2}}",
      ),
    });
    const { tests } = await openTask();

    const rows = within(fieldGroup(tests, 'small')).getByRole('list', {
      name: 'Tests of small',
    });
    await userEvent.click(within(rows).getByRole('button', { name: 'Remove test 2' }));
    expect(await within(rows).findByText('To be removed')).toBeVisible();
    await userEvent.click(
      within(rows).getByRole('button', { name: 'Undo the change to test 2' }),
    );
    expect(
      await within(
        within(rows).getByRole('listitem', { name: 'Test 2' }),
      ).findByLabelText('Weight'),
    ).toHaveValue('3');

    await userEvent.click(within(rows).getByRole('button', { name: 'Remove test 2' }));
    expect(await within(rows).findByText('To be removed')).toBeVisible();
    await save();

    const body = await waitForSave(sent);
    const groups = written(body)['test_groups'] as Record<string, unknown>;
    expect(groups['small']).toEqual({ each: 30, test_weights: { '3': 2 } });
  });

  it('opens a test’s weight from a link followed to the page, once the cards are there', async () => {
    taskBackend({
      form: { ...CHECKED, inputs: [] },
      content: TASK.replace(
        'small: {pass: 30, show: verdict}',
        "small: {each: 30, test_weights: {'2': 3}}",
      ),
    });
    renderApp(
      '/orgs/acme/contests/spring/tasks/sum?card=tests&item=small&field=test:2',
    );

    const rows = await screen.findByRole('list', { name: 'Tests of small' });
    const row = within(rows).getByRole('listitem', { name: 'Test 2' });
    const weight = await within(row).findByLabelText('Weight');
    await waitFor(() => expect(weight).toHaveFocus());
  });

  it('reads each test as its parts, hides the weights until asked for, and says what a weight does behind an ⓘ (M48, M67)', async () => {
    taskBackend({
      form: { ...CHECKED, inputs: [] },
      content: TASK.replace('small: {pass: 30, show: verdict}', 'small: {each: 30}'),
    });
    const user = userEvent.setup();
    const { tests } = await openTask();

    const small = fieldGroup(tests, 'small');
    const rows = within(small).getByRole('list', { name: 'Tests of small' });
    const row = within(rows).getByRole('listitem', { name: 'Test 1' });
    // Small files: what they hold, from what goes in to what comes out; a
    // size would say nothing.
    await waitFor(() => expect(row).toHaveTextContent('Test 1 · 1 2 → 3'));
    expect(row).not.toHaveTextContent(/\d B/);
    // Every test weighs 1, so no row has a weight box until asked.
    expect(within(rows).queryByLabelText('Weight')).toBeNull();
    await user.click(
      within(small).getByRole('button', {
        name: 'Weigh the tests of small differently',
      }),
    );
    expect(within(row).getByLabelText('Weight')).toHaveAttribute('placeholder', '1');
    expect(
      within(small).queryByRole('button', {
        name: 'Weigh the tests of small differently',
      }),
    ).toBeNull();
    await user.click(within(row).getByRole('button', { name: 'About Weight' }));
    expect(
      await screen.findByText(
        'How much this test counts against the others. 1 by default; a test of weight 2 counts twice.',
      ),
    ).toBeVisible();
  });

  it('gives a file’s size on its row only where it says something: a large file, and an empty one in the warning colour (M67)', async () => {
    taskBackend({ form: { ...CHECKED, inputs: [] } });
    server.use(
      http.get(`${TASK_API}/tree`, ({ request }) => {
        const at = new URL(request.url).searchParams.get('path');
        if (at === 'tests/small/2') {
          return HttpResponse.json([
            file('tests/small/2/input', 12_400_000),
            file('tests/small/2/answer', 5),
          ]);
        }
        if (at === 'tests/small/3') {
          return HttpResponse.json([
            file('tests/small/3/input', 1024),
            file('tests/small/3/answer', 0),
          ]);
        }
        return undefined;
      }),
    );
    const { tests } = await openTask();

    const rows = within(fieldGroup(tests, 'small')).getByRole('list', {
      name: 'Tests of small',
    });
    const large = within(rows).getByRole('listitem', { name: 'Test 2' });
    await waitFor(() => expect(large).toHaveTextContent('Test 2 · input 11.8 MB → 3'));
    const empty = within(rows).getByRole('listitem', { name: 'Test 3' });
    await waitFor(() =>
      expect(empty).toHaveTextContent('Test 3 · 1 2 → answer is empty'),
    );
    expect(within(empty).getByText('answer is empty')).toHaveClass(/emptyPart/);
  });

  it('puts the arrow only between what goes in and what is expected, naming every other part', async () => {
    taskBackend({
      form: {
        ...CHECKED,
        inputs: [],
        test: [...CHECKED.test, { name: 'expected', type: 'file', options: null }],
      },
    });
    server.use(
      http.get(`${TASK_API}/tree`, ({ request }) => {
        const at = new URL(request.url).searchParams.get('path');
        if (at === 'tests/small/2') {
          return HttpResponse.json([
            file('tests/small/2/expected', 10_485_760),
            file('tests/small/2/input'),
            file('tests/small/2/answer', 2),
          ]);
        }
        if (at === 'tests/small/3') {
          return HttpResponse.json([
            file('tests/small/3/answer', 2),
            file('tests/small/3/expected', 2),
          ]);
        }
        return undefined;
      }),
    );
    const { tests } = await openTask();

    const rows = within(fieldGroup(tests, 'small')).getByRole('list', {
      name: 'Tests of small',
    });
    const three = within(rows).getByRole('listitem', { name: 'Test 2' });
    await waitFor(() =>
      expect(three).toHaveTextContent('Test 2 · 1 2 → 3, expected 10 MB'),
    );
    // With nothing going in, no arrow: each part under its own name.
    const noInput = within(rows).getByRole('listitem', { name: 'Test 3' });
    await waitFor(() =>
      expect(noInput).toHaveTextContent('Test 3 · answer 3, expected 3'),
    );
  });

  it('shows whose a test file is when someone else changed it first, and saves over it only when chosen', async () => {
    const { sent } = taskBackend({ form: { ...CHECKED, inputs: [] } });
    let moved = false;
    server.use(
      http.post(`${TASK_API}/save`, async ({ request }) => {
        sent.push((await request.json()) as SaveRequest);
        if (sent.length === 1) {
          moved = true;
          return problem(409, 'conflict');
        }
        return HttpResponse.json(PUBLISHED);
      }),
      http.get(`${TASK_API}/files/:path`, ({ params }) => {
        const path = decodeURIComponent(String(params['path']));
        if (!path.startsWith('tests/')) return undefined;
        return HttpResponse.json({
          path,
          encoding: 'utf-8',
          content: moved && path === 'tests/small/2/answer' ? 'theirs\n' : '1 2\n',
          token:
            moved && path === 'tests/small/2/answer' ? 'token-theirs' : `token-${path}`,
          upload: null,
          version: '3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d',
        });
      }),
      http.get(`${TASK_API}/history`, () =>
        HttpResponse.json([
          {
            version: 'abc',
            at: '2026-10-11T14:02:00Z',
            author: 'alice',
            author_id: 3,
            message: 'Save',
          },
        ]),
      ),
    );
    const { tests } = await openTask();

    const rows = within(fieldGroup(tests, 'small')).getByRole('list', {
      name: 'Tests of small',
    });
    await userEvent.click(within(rows).getByRole('button', { name: 'Remove test 2' }));
    await within(rows).findByText('To be removed');
    await save();

    const files = await screen.findByRole('list', { name: 'Files that differ' });
    const answer = within(files).getByRole('radiogroup', {
      name: 'Tests, small, test 2: answer',
    });
    expect(answer).toHaveTextContent('Yours: Taken out');
    expect(await within(answer).findByText(/Now: 7 B, saved by alice/)).toBeVisible();
    await userEvent.click(within(answer).getByRole('radio', { name: /^Yours/ }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Save the merged version' }),
    );

    expect(
      await screen.findByText('Saved and published as publication 4.'),
    ).toBeVisible();
    expect(sent[1]?.changes).toContainEqual({
      path: 'tests/small/2/answer',
      token: 'token-theirs',
      remove: true,
      encoding: 'utf-8',
    });
  });
});

describe('a test opened in place (M50)', { timeout: 30_000 }, () => {
  const LONG = Array.from({ length: 30 }, (_, at) => `line ${String(at + 1)}`).join(
    '\n',
  );

  /** The version the uploaded part was last changed at, as its read says. */
  const UPLOADED_AT = 'a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6a7b8c9d0';

  /**
   * Test 1 of small with an input as long text, a binary answer, an uploaded
   * expected answer, a folder, a log too big to show, and values.
   */
  function richTest() {
    server.use(
      http.get(`${TASK_API}/tree`, ({ request }) => {
        const at = new URL(request.url).searchParams.get('path') ?? '';
        if (at === 'tests/small/1') {
          return HttpResponse.json([
            file('tests/small/1/answer', 130),
            {
              path: 'tests/small/1/input',
              kind: 'file',
              size: LONG.length,
              upload: null,
              version: LISTED_AT,
            },
            {
              path: 'tests/small/1/expected',
              kind: 'file',
              size: 130,
              upload: { size: 50_000_000, digest: 'ab'.repeat(32) },
              version: UPLOADED_AT,
            },
            folder('tests/small/1/data'),
            file('tests/small/1/test.yaml', 20),
            file('tests/small/1/run log.txt', 5_000_000),
          ]);
        }
        if (at === 'tests/small/1/data') {
          return HttpResponse.json([file('tests/small/1/data/a.csv', 6)]);
        }
        return undefined;
      }),
      http.get(`${TASK_API}/files/:path`, ({ params }) => {
        const path = decodeURIComponent(String(params['path']));
        const read = (content: string, encoding: 'utf-8' | 'base64' = 'utf-8') =>
          HttpResponse.json({
            path,
            encoding,
            content,
            token: `t-${path}`,
            upload: null,
            version: '3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d',
          });
        if (path === 'tests/small/1/input') return read(LONG);
        if (path === 'tests/small/1/answer')
          return read(btoa('\u0000\u0001'), 'base64');
        if (path === 'tests/small/1/data/a.csv') return read('x,y\n1,2\n');
        if (path === 'tests/small/1/test.yaml') return read('episodes: 12\nseed: 7\n');
        if (path === 'tests/small/1/expected') {
          // An upload reads as its pointer, at the version that last changed it.
          return HttpResponse.json({
            path,
            encoding: 'utf-8',
            content: 'version https://git-lfs.github.com/spec/v1\n',
            token: `t-${path}`,
            upload: { size: 50_000_000, digest: 'ab'.repeat(32) },
            version: UPLOADED_AT,
          });
        }
        if (path === 'tests/small/1/run log.txt') {
          throw new Error('A file too big to show is never read whole.');
        }
        return undefined;
      }),
    );
  }

  it('shows each part side by side, the first lines of a text, a binary and an upload by size, a folder as a tree, and the test’s values', async () => {
    taskBackend({
      form: {
        ...CHECKED,
        inputs: [],
        test: [
          { name: 'input', type: 'file', options: null },
          { name: 'answer', type: 'file', options: null },
          { name: 'expected', type: 'file', options: null },
          { name: 'data', type: 'folder', options: null },
          { name: 'episodes', type: 'number', options: null },
        ],
      },
    });
    richTest();
    saved.length = 0;
    {
      const user = userEvent.setup();
      const { tests } = await openTask();
      const rows = within(fieldGroup(tests, 'small')).getByRole('list', {
        name: 'Tests of small',
      });
      const row = within(rows).getByRole('listitem', { name: 'Test 1' });
      const name = within(row).getByRole('button', { name: /Test 1/ });
      expect(name).toHaveAttribute('aria-expanded', 'false');
      await user.click(name);
      expect(name).toHaveAttribute('aria-expanded', 'true');

      const view = await within(row).findByRole('region', {
        name: 'What test 1 holds',
      });
      const parts = await within(view).findAllByRole('region');
      expect(parts.map((part) => part.getAttribute('aria-label'))).toEqual([
        'input',
        'answer',
        'expected',
        'data',
        'run log',
        'Its values',
      ]);
      const input = within(view).getByRole('region', { name: 'input' });
      const text = await within(input).findByLabelText('What input holds');
      expect(text).toHaveTextContent('line 12');
      expect(text).not.toHaveTextContent('line 13');
      await user.click(within(input).getByRole('button', { name: 'Show all' }));
      expect(text).toHaveTextContent('line 30');
      await user.click(within(input).getByRole('button', { name: 'Download input' }));
      expect(saved).toEqual(['input']);

      const answer = within(view).getByRole('region', { name: 'answer' });
      expect(
        await within(answer).findByText('It is not text, so it is not shown here.'),
      ).toBeVisible();
      expect(
        within(answer).getByRole('button', { name: 'Download answer' }),
      ).toBeVisible();

      const expected = within(view).getByRole('region', { name: 'expected' });
      expect(expected).toHaveTextContent('47.7 MB');
      expect(expected).toHaveTextContent(
        'It was uploaded, so it is shown by its size rather than as text.',
      );
      // Downloaded whole through the door, at the version its read says (#444).
      expect(
        await within(expected).findByRole('link', { name: 'Download expected' }),
      ).toHaveAttribute(
        'href',
        `/-/downloads/acme/spring/sum/versions/${UPLOADED_AT}/tests/small/1/expected`,
      );

      // A file too big to show is downloaded at the version it was listed at, never read.
      const log = within(view).getByRole('region', { name: 'run log' });
      expect(log).toHaveTextContent('It is too big to show here.');
      expect(
        await within(log).findByRole('link', { name: 'Download run log.txt' }),
      ).toHaveAttribute(
        'href',
        `/-/downloads/acme/spring/sum/versions/${LISTED_AT}/tests/small/1/run%20log.txt`,
      );

      const data = within(view).getByRole('region', { name: 'data' });
      await user.click(await within(data).findByRole('button', { name: /a\.csv/ }));
      expect(await within(data).findByLabelText('What a.csv holds')).toHaveTextContent(
        'x,y 1,2',
      );

      const values = within(view).getByRole('region', { name: 'Its values' });
      await waitFor(() => expect(values).toHaveTextContent('episodes12'));
      expect(values).not.toHaveTextContent('seed');
    }
  });

  it('shows a test added and not saved yet from the files chosen for it', async () => {
    taskBackend({ form: { ...CHECKED, inputs: [] } });
    const user = userEvent.setup();
    const { tests } = await openTask();

    await user.click(
      within(fieldGroup(tests, 'small')).getByRole('button', {
        name: 'Add tests to small',
      }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Add tests' });
    await user.click(within(dialog).getByRole('radio', { name: 'Many files at once' }));
    await user.upload(within(dialog).getByLabelText('Test files'), [
      new File(['3 4\n'], '9.in'),
      new File(['7\n'], '9.out'),
    ]);
    await user.click(within(dialog).getByRole('button', { name: 'Add tests' }));

    const rows = within(fieldGroup(tests, 'small')).getByRole('list', {
      name: 'Tests of small',
    });
    const row = within(rows).getByRole('listitem', { name: 'Test 9' });
    // Read from the files chosen, as a saved test's row reads (M67).
    await waitFor(() => expect(row).toHaveTextContent('Test 9 · 3 4 → 7'));
    await user.click(within(row).getByRole('button', { name: /Test 9/ }));
    const answer = await within(row).findByRole('region', { name: 'answer' });
    expect(await within(answer).findByLabelText('What answer holds')).toHaveTextContent(
      '7',
    );
  });
});
