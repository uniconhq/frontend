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
import { renderApp } from '@/test/render';
import { afterAnswers, problem, server, signedIn, someone } from '@/test/server';
import {
  TASK_API,
  CONTEST_API,
  draftTask,
  publicationList,
  publications,
  publishedTask,
  repoFiles,
  taskState,
  unchanged,
} from '@/test/organiser';
import {
  comeBackToTab,
  fakeLiveStream,
  nudge,
  openStream,
  realLiveStream,
} from '@/test/live';
import { specCatalogue } from '../formula/catalogue';

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
  runs: false,
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
  runs: false,
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
steps: []
report:
  fraction: {from: "\${{ steps.check.fraction }}", fold: mean, better: higher, at_least: 0, at_most: 1}
  time_ms: {from: "\${{ steps.run.time_ms }}", fold: max, better: lower, at_least: 0}
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
      return HttpResponse.json(at.startsWith('tests') ? (tree[at] ?? []) : []);
    }),
    http.get('/api/v1/blocks', () => HttpResponse.json(specCatalogue())),
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
  const tests = screen.getByRole('region', { name: 'Submissions' });
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

  it('merges field by field, in words, when someone else saved the settings first', async () => {
    const theirs = TASK.replace('time_limit: 2', 'time_limit: 5');
    const { sent } = taskBackend({ conflictWith: theirs });
    const { inputs, tests } = await openTask();

    fill(fieldIn(inputs, 'time_limit', 'Value'), '3');
    fill(within(tests).getByLabelText('Most submissions'), '20');
    await save();

    const merge = await screen.findByRole('list', { name: 'Fields that differ' });
    const limit = within(merge).getByRole('radiogroup', {
      name: 'Inputs: time_limit (both changed it)',
    });
    await userEvent.click(within(limit).getByRole('radio', { name: 'Now: 5' }));
    expect(
      within(merge).getByRole('radiogroup', {
        name: 'Submissions: Most submissions',
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
      submissions: { max: number; rate: { count: number; per: number } };
    };
    expect(saved.inputs['time_limit']).toBe(5);
    expect(saved.submissions).toEqual({ max: 20, rate: { count: 1, per: 30 } });
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
    fill(within(tests).getByLabelText('Most submissions'), '20');

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
      within(screen.getByRole('region', { name: 'Submissions' })).getByLabelText(
        'Most submissions',
      ),
    ).toHaveValue('20');
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

    fill(within(tests).getByLabelText('Most submissions'), '20');
    await save();
    await screen.findByRole('list', { name: 'Fields that differ' });
    await userEvent.click(screen.getByRole('button', { name: 'Discard my changes' }));

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

/** A run workflow's inputs, each contestant flag left false: the task says who gives it. */
function runInput(
  id: string,
  type: string,
  more: Partial<DeclaredInput> = {},
): DeclaredInput {
  return declared(id, type, more);
}

function runForm(workflow: string, inputs: DeclaredInput[]): WorkflowForm {
  return {
    workflow,
    problem: null,
    graded: false,
    newer: null,
    runs: true,
    inputs,
    test: [],
  };
}

async function who(inputs: HTMLElement, id: string, gives: string) {
  await userEvent.selectOptions(fieldIn(inputs, id, 'Who gives it'), gives);
}

describe('islands, cartpole and tour', { timeout: 60_000 }, () => {
  it('saves islands’ inputs and its runs, each file at the path the editor names', async () => {
    const { sent } = taskBackend({
      content: 'name: Islands\nworkflow: unicon/classic@v3\n',
      form: runForm('unicon/classic@v3', [
        runInput('code', 'file'),
        runInput('language', 'enum', { options: ['cpp', 'python'] }),
        runInput('time_limit', 'number'),
        runInput('memory_limit', 'number'),
        runInput('input', 'file'),
        runInput('answer', 'file'),
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
    await who(inputs, 'input', 'One for each run');
    await who(inputs, 'answer', 'One for each run');

    const runs = screen.getByRole('region', { name: 'Runs' });
    fill(within(runs).getByRole('textbox', { name: 'Title of row 1' }), 'Sample 1');
    await userEvent.upload(
      within(runs).getByLabelText('File for row 1 input'),
      new File(['1'], '1.in'),
    );
    await userEvent.upload(
      within(runs).getByLabelText('File for row 1 answer'),
      new File(['2'], '1.ans'),
    );
    await userEvent.click(within(runs).getByRole('button', { name: 'Add a row' }));
    fill(within(runs).getByRole('textbox', { name: 'Title of row 2' }), 'Sample 2');
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
      workflow: 'unicon/classic@v3',
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

  it('saves cartpole as two axes, 2 × 3 runs', async () => {
    const { sent } = taskBackend({
      content: 'name: Cartpole\nworkflow: cs2109s/cartpole@v1\n',
      form: runForm('cs2109s/cartpole@v1', [
        runInput('weights', 'file'),
        runInput('episodes', 'number'),
        runInput('env', 'text'),
        runInput('seed', 'number'),
      ]),
    });
    const { inputs } = await openTask();

    await who(inputs, 'weights', 'The entrant gives it');
    fill(fieldIn(inputs, 'episodes', 'episodes'), '100');
    await who(inputs, 'env', 'One for each run');
    await userEvent.click(screen.getByRole('button', { name: 'Add an axis' }));
    await who(inputs, 'seed', 'One for each run');

    const runs = screen.getByRole('region', { name: 'Runs' });
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
    expect(runs).toHaveTextContent('2 × 3 = 6 runs.');
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
      form: runForm('unicon/rooms@v1', [runInput('env', 'text')]),
    });
    const { inputs } = await openTask();
    await who(inputs, 'env', 'One for each run');
    await userEvent.click(screen.getByRole('button', { name: 'Add an axis' }));
    await userEvent.selectOptions(
      within(inputs).getByRole('combobox', { name: 'Axis' }),
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
        runInput('best', 'number'),
        runInput('input', 'file'),
        runInput('route', 'file'),
      ]),
    });
    const { inputs } = await openTask();

    fill(fieldIn(inputs, 'best', 'best'), '1200');
    await who(inputs, 'input', 'One for each run');
    await who(inputs, 'route', 'One for each run');

    const runs = screen.getByRole('region', { name: 'Runs' });
    fill(within(runs).getByRole('textbox', { name: 'Title of row 1' }), 'Small grid');
    await userEvent.upload(
      within(runs).getByLabelText('File for row 1 input'),
      new File(['a'], '1.in'),
    );
    const boxes = within(runs).getAllByRole('checkbox', {
      name: 'The entrant gives it',
    });
    await userEvent.click(boxes[1]!);
    await userEvent.click(within(runs).getByRole('button', { name: 'Add a row' }));
    fill(within(runs).getByRole('textbox', { name: 'Title of row 2' }), 'Big grid');
    await userEvent.upload(
      within(runs).getByLabelText('File for row 2 input'),
      new File(['b'], '2.in'),
    );
    const later = within(runs).getAllByRole('checkbox', {
      name: 'The entrant gives it',
    });
    await userEvent.click(later[3]!);
    fill(within(runs).getByRole('textbox', { name: 'Largest size of row 2' }), '50MB');
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
        runInput('best', 'number'),
        runInput('input', 'file'),
        runInput('route', 'file'),
      ]),
      answer: () =>
        HttpResponse.json({
          version: '5e6f',
          errors: [
            { path: 'inputs.best', message: 'Not a number.' },
            { path: 'repeat[0].tuples[0].title', message: 'Say what this row is.' },
            { path: 'repeat[0].tuples[1].max_size', message: 'At most 2GB.' },
            { path: 'repeat[0].tuples[0].input', message: 'There is no such file.' },
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
      'Runs, axis 1, row 1: title: Say what this row is.',
    );
    expect(errors).toHaveTextContent('Runs, axis 1, row 2: max_size: At most 2GB.');
    expect(errors).toHaveTextContent(
      'Runs, axis 1, row 1: input: There is no such file.',
    );
    expect(
      document.querySelector('[data-field="axis-0-tuple-0-title"]'),
    ).not.toBeNull();
    expect(
      document.querySelector('[data-field="axis-0-tuple-1-max_size"]'),
    ).not.toBeNull();
    expect(document.querySelector('[data-field="best"]')).not.toBeNull();
  });
});

const ISLANDS = `name: Islands
workflow: unicon/classic@v3
inputs:
  code: {entrant: {label: Solution}}
repeat:
  - inputs: [input]
    tuples:
      - {input: sample.in, title: Sample}
`;

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

  it('saves islands with its text value first_failed and a check', async () => {
    const { sent } = taskBackend({
      content: ISLANDS,
      form: runForm('unicon/classic@v3', [
        runInput('code', 'file'),
        runInput('input', 'file'),
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

  it('refuses a value named like a group, and a loop, before the save', async () => {
    const { sent } = taskBackend({
      content: ISLANDS,
      form: runForm('unicon/classic@v3', [
        runInput('code', 'file'),
        runInput('input', 'file'),
      ]),
    });
    await openTask();
    const scoring = await screen.findByRole('region', { name: 'Scoring' });
    await userEvent.click(within(scoring).getByRole('button', { name: 'Add a group' }));
    await userEvent.click(within(scoring).getByRole('button', { name: 'Add a value' }));
    fill(within(scoring).getByRole('textbox', { name: 'Name' }), 'group_1');
    expect(scoring).toHaveTextContent('a group is called group_1 too: rename one');
    const bar = screen.getByRole('region', { name: 'Save the task' });
    expect(within(bar).getByRole('button', { name: 'Save' })).toBeDisabled();

    fill(within(scoring).getByRole('textbox', { name: 'Name' }), 'left');
    await userEvent.click(within(scoring).getByRole('button', { name: 'Add a value' }));
    const names = within(scoring).getAllByRole('textbox', { name: 'Name' });
    fill(names[1]!, 'right');
    await typeLine('left', 'right');
    await typeLine('right', 'left');
    expect(scoring).toHaveTextContent(
      'reads itself, round left → right → left: break the loop',
    );
    expect(within(bar).getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(sent).toEqual([]);
  });

  it('keeps a part shown now from being hidden later, once a submission is graded', async () => {
    taskBackend({
      content:
        'name: Islands\nworkflow: unicon/classic@v3\nscoring:\n  show:\n    now: [log]\n',
      form: {
        ...runForm('unicon/classic@v3', [runInput('code', 'file')]),
        graded: true,
      },
    });
    await openTask();
    const scoring = await screen.findByRole('region', { name: 'Scoring' });
    const when = within(scoring).getByRole('combobox', { name: 'When log is shown' });
    expect(within(when).getByRole('option', { name: 'Now' })).toBeEnabled();
    expect(
      within(when).getByRole('option', {
        name: 'After the close: no, entrants have seen it',
      }),
    ).toBeDisabled();
  });

  it('shows the summary and sends confirm and asked when a save asks first', async () => {
    const { sent } = taskBackend({
      content: ISLANDS,
      form: runForm('unicon/classic@v3', [
        runInput('code', 'file'),
        runInput('input', 'file'),
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

describe('a publication’s checks', { timeout: 30_000 }, () => {
  beforeEach(fakeLiveStream);
  afterEach(realLiveStream);

  it('reads never checked, and still saves', async () => {
    const { sent } = taskBackend({
      content: ISLANDS,
      form: runForm('unicon/classic@v3', [
        runInput('code', 'file'),
        runInput('input', 'file'),
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
      form: runForm('unicon/classic@v3', [
        runInput('code', 'file'),
        runInput('input', 'file'),
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
