import { http, HttpResponse } from 'msw';
import type { components } from '@/api/schema';
import type {
  FileContent,
  ListedContest,
  ListedTask,
  Outcome,
  Publication,
  RunsResult,
  SaveEffect,
  Settings,
  WriteSettings,
  TaskStanding,
  TaskState,
  TreeEntry,
} from '@/api/types';
import { PICTURES, listedContests, taskMay } from './may';
import { problem } from './server';

type Published = components['schemas']['Published'];

/**
 * The organiser's world for the tests: the acme org, its contests, the spring
 * contest's tasks, and the files of the spring contest and its sum task. Each
 * handler answers for any org, contest or task name, so a test only overrides
 * what it is about, at the addresses below.
 */
export const ORG_API = '/api/v1/orgs/:org';
export const CONTEST_API = `${ORG_API}/contests/:contest`;
export const TASK_API = `${CONTEST_API}/tasks/:task`;

// Lists

/** The org's contests as the list gives them, both drafts in October 2026. */
export const contests: ListedContest[] = [
  {
    ...listedContests()[0]!,
    start: '2026-10-20T09:00:00Z',
    end: '2026-10-20T14:00:00Z',
  },
  {
    ...listedContests()[1]!,
    start: '2026-10-01T09:00:00Z',
    end: '2026-10-01T14:00:00Z',
  },
];
const tasks: ListedTask[] = [
  { name: 'sort', may_manage: true },
  { name: 'sum', may_manage: true },
];

export const contestList = http.get(`${ORG_API}/contests`, () =>
  HttpResponse.json(contests),
);
export const taskList = http.get(`${CONTEST_API}/tasks`, () =>
  HttpResponse.json(tasks),
);

// Making one

/**
 * A list and the create beside it, as the backend keeps them: the create
 * makes the thing before it answers, 201 with its name, and the list carries
 * the new name from then on. `sent` holds each create's body, in turn.
 */
export function listAndCreate(path: string, existing: { name: string }[]) {
  const listed = [...existing];
  const sent: unknown[] = [];
  const handlers = [
    http.get(path, () => HttpResponse.json(listed)),
    http.post(path, async ({ request }) => {
      const body = (await request.json()) as { name: string };
      sent.push(body);
      listed.push({ ...existing[0], name: body.name });
      return HttpResponse.json({ name: body.name }, { status: 201 });
    }),
  ];
  return { handlers, sent };
}

// A task's state and publications

/** What a published save does when it moves nobody's result, in the forge's words. */
export const unchanged: SaveEffect = {
  results_change: false,
  summary: "Nobody's result changes.",
  runs_again: ['No submission runs again: the tests and how they run are the same.'],
  scores: ['No score changes.'],
  reading: ['Nothing entrants read changes.'],
};

/** A task save's answer once it publishes: publication 3, moving nobody's result. */
export function published(overrides: Partial<Published> = {}): Published {
  return {
    number: 3,
    grading_changed: false,
    changes: [],
    notes: [],
    regraded: 0,
    effect: unchanged,
    check: null,
    regrade: null,
    ...overrides,
  };
}

/**
 * A finished grading's result: a run for each verdict, in order, and the
 * outcome of each step done once, by its id.
 */
export function runsResult(
  verdicts: Outcome[],
  once: Record<string, Outcome> = {},
): RunsResult {
  return {
    schema_version: 6,
    error: null,
    once: { outcomes: once, reports: {}, texts: {} },
    runs: verdicts.map((verdict, at) => ({
      id: `run-${String(at + 1)}`,
      key: {},
      label: null,
      message: null,
      passed: verdict === 'accepted' ? 1 : 0,
      reports: {},
      texts: {},
      verdict,
    })),
    staff: [],
  };
}

export const publications: Publication[] = [
  {
    number: 1,
    version: '1a2b3c4d5e6f7a8b9c0d',
    grading_changed: true,
    changes: ['plans/default.json added'],
    at: '2026-09-20T10:00:00Z',
    check: null,
    failed_checks: [],
  },
  {
    number: 2,
    version: '2b3c4d5e6f7a8b9c0d1e',
    grading_changed: false,
    changes: [],
    at: '2026-09-21T10:00:00Z',
    check: null,
    failed_checks: [],
  },
];

export const publishedTask: TaskState = {
  head: '2b3c4d5e6f7a8b9c0d1e',
  latest: publications[1] ?? null,
  draft: false,
  errors: [],
  statement_written: true,
  head_statement_written: true,
  toolchains: {},
  results: { history: [], released: false },
  may: taskMay('admin'),
};

export const draftTask: TaskState = {
  head: '3c4d5e6f7a8b9c0d1e2f',
  latest: publications[1] ?? null,
  draft: true,
  errors: [
    {
      path: ['inputs', 'setter', 0, 'value'],
      message: 'There is no file under data/hidden/ in the task.',
    },
  ],
  statement_written: true,
  head_statement_written: true,
  toolchains: {},
  results: { history: [], released: false },
  may: taskMay('admin'),
};

export const taskState = http.get(TASK_API, () =>
  HttpResponse.json({ ...publishedTask, pictures: PICTURES }),
);
export const publicationList = http.get(`${TASK_API}/publications`, () =>
  HttpResponse.json(publications),
);

// Where each of the spring contest's tasks stands

/**
 * The spring contest's tasks in its order: sort, on its first publication,
 * due a week after its release, and sum, with no due, whose last save left a draft with errors on its
 * second publication.
 */
export const standings: TaskStanding[] = [
  {
    task: { name: 'sort' },
    label: 'A',
    withdrawn: false,
    submissions: 0,
    take_out: 'remove',
    state: { ...publishedTask, latest: publications[0] ?? null },
    timeline: {
      release_at: '2026-10-01T09:00:00Z',
      due: '2026-10-08T09:00:00Z',
      closes: '2026-10-15T09:00:00Z',
    },
  },
  {
    task: { name: 'sum' },
    label: 'B',
    withdrawn: false,
    submissions: 0,
    take_out: 'remove',
    state: draftTask,
    timeline: {
      release_at: '2026-10-01T09:00:00Z',
      due: null,
      closes: '2026-10-15T09:00:00Z',
    },
  },
];

export const standingList = http.get(`${CONTEST_API}/organise/tasks`, () =>
  HttpResponse.json(standings),
);

// Repo files

/** Where the download door serves the sum task's files. */
const DOWNLOADS = '/-/downloads/acme/spring/sum';

/** The commit every listed file was last changed at. */
const LISTED_AT = '9f8e7d6c5b4a39281706f5e4d3c2b1a098765432';

/** The commit every file read was last changed at. */
const SAVED_AT = '3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d';

/** One entry of a folder as `GET <place>/tree?path=` lists it: a file, nothing else said. */
export function treeEntry(
  overrides: Pick<TreeEntry, 'path'> & Partial<TreeEntry>,
): TreeEntry {
  return {
    kind: 'file',
    size: null,
    upload: null,
    start: null,
    token: null,
    version: null,
    href: null,
    ...overrides,
  };
}

/** A file as `GET <place>/files/<path>` answers it: text, read at `SAVED_AT`. */
export function fileContent(
  overrides: Pick<FileContent, 'path' | 'content' | 'token'> & Partial<FileContent>,
): FileContent {
  return {
    encoding: 'utf-8',
    upload: null,
    version: SAVED_AT,
    href: null,
    ...overrides,
  };
}

/** A file of the sum task as listed, with its link at the download door. */
const listed = (path: string, size: number) =>
  treeEntry({
    path,
    size,
    version: LISTED_AT,
    href: `${DOWNLOADS}/versions/${LISTED_AT}/${path}`,
  });

/** Folder by folder, as `GET <place>/tree?path=` answers. */
const taskTree: Record<string, TreeEntry[]> = {
  '': [
    listed('task.yaml', 120),
    treeEntry({ path: 'data', kind: 'directory' }),
    listed('statement.md', 40),
  ],
  data: [treeEntry({ path: 'data/testcases', kind: 'directory' })],
  'data/testcases': [
    listed('data/testcases/1.in', 4),
    listed('data/testcases/logo.png', 11),
  ],
};

const contestTree: Record<string, TreeEntry[]> = {
  '': [treeEntry({ path: 'contest.yaml', size: 80, version: LISTED_AT })],
};

/** A file of the sum task as read, with its link at the download door. */
const saved = (
  path: string,
  content: string,
  token: string,
  more: Partial<FileContent> = {},
) =>
  fileContent({
    path,
    content,
    token,
    href: `${DOWNLOADS}/versions/${SAVED_AT}/${path}`,
    ...more,
  });

export const files: Record<string, FileContent> = {
  'task.yaml': saved(
    'task.yaml',
    'name: sum\nworkflow: unicon/classic@v6\n',
    'token-task-yaml',
  ),
  'statement.md': saved(
    'statement.md',
    'Write the sum of two numbers.\n',
    'token-statement',
  ),
  'data/testcases/1.in': saved('data/testcases/1.in', '1 2\n', 'token-1-in'),
  'data/testcases/logo.png': saved(
    'data/testcases/logo.png',
    'iVBORw0KGgoA//4=',
    'token-logo',
    {
      encoding: 'base64',
    },
  ),
  'contest.yaml': fileContent({
    path: 'contest.yaml',
    content: [
      'name: Spring',
      'start: 2026-10-01T09:00:00Z',
      'end: 2026-10-15T09:00:00Z',
      'state: draft',
      'visibility: signed-in',
      'tasks:',
      '  - id: sort',
      '  - id: sum',
      '',
    ].join('\n'),
    token: 'token-contest-yaml',
  }),
};

function treeAnswer(tree: Record<string, TreeEntry[]>) {
  return ({ request }: { request: Request }) =>
    HttpResponse.json(tree[new URL(request.url).searchParams.get('path') ?? ''] ?? []);
}

/** The client sends a file's path as one segment, its slashes encoded. */
function fileAnswer({ params }: { params: Record<string, unknown> }) {
  const path = decodeURIComponent(String(params['path']));
  const file = files[path];
  if (file === undefined) return problem(404, 'not_found');
  // Each task's settings give it its own name as its title.
  const task = params['task'];
  return path === 'task.yaml' && typeof task === 'string'
    ? HttpResponse.json({
        ...file,
        content: file.content.replace(/^name: .*$/m, `name: ${task}`),
      })
    : HttpResponse.json(file);
}

/** Settings as the server answers them for a form, read at `token`. */
export function settingsOf(
  values: Record<string, unknown> | null,
  token: string | null = 'token-contest-yaml',
): Settings {
  return {
    values,
    unreadable: values === null ? 'The file does not hold named settings.' : null,
    token,
    version: SAVED_AT,
  };
}

/** The contest's settings as values: `contest.yaml` above. */
export const contestValues = {
  name: 'Spring',
  start: '2026-10-01T09:00:00Z',
  end: '2026-10-15T09:00:00Z',
  state: 'draft',
  visibility: 'signed-in',
  tasks: [{ id: 'sort' }, { id: 'sum' }],
};

/**
 * The contest's settings, read and saved as values, holding `current`. Each
 * save is taken and the settings become its values, except that with
 * `conflictWith` the first is refused as a conflict and the settings become
 * those instead, as if someone else had saved them; a save with a token since
 * saved over is refused so too. Each save taken answers `notes`. `sent` holds
 * each save's body, and `elsewhere` is someone else saving `values`. Its
 * handlers go before `repoFiles`.
 */
export function contestSettings({
  current = contestValues,
  conflictWith,
  notes = [],
}: {
  current?: Record<string, unknown> | null;
  conflictWith?: Record<string, unknown>;
  notes?: string[];
} = {}) {
  let settings = settingsOf(current, 'token-1');
  let conflicted = conflictWith === undefined;
  const sent: WriteSettings[] = [];
  const handlers = [
    http.get(`${CONTEST_API}/settings`, () => HttpResponse.json(settings)),
    http.put(`${CONTEST_API}/settings`, async ({ request }) => {
      const body = (await request.json()) as WriteSettings;
      sent.push(body);
      if (!conflicted && conflictWith !== undefined) {
        conflicted = true;
        settings = settingsOf(conflictWith, 'token-2');
        return problem(409, 'conflict');
      }
      if (body.token !== settings.token) return problem(409, 'conflict');
      const token = `token-${String(sent.length + 2)}`;
      settings = settingsOf(body.values, token);
      return HttpResponse.json({ version: `version-${token}`, notes });
    }),
  ];
  const elsewhere = (values: Record<string, unknown>) => {
    settings = settingsOf(values, 'token-elsewhere');
  };
  return { handlers, sent, elsewhere };
}

/** Both repos' trees, files and settings, read-only; a test adds the writes it needs. */
export const repoFiles = [
  http.get(`${CONTEST_API}/tree`, treeAnswer(contestTree)),
  http.get(`${TASK_API}/tree`, treeAnswer(taskTree)),
  http.get(`${CONTEST_API}/files/:path`, fileAnswer),
  http.get(`${TASK_API}/files/:path`, fileAnswer),
  http.get(`${CONTEST_API}/settings`, () =>
    HttpResponse.json(settingsOf(contestValues)),
  ),
  // Each task's settings give it its own name as its title.
  http.get(`${TASK_API}/settings`, ({ params }) =>
    HttpResponse.json(
      settingsOf(
        { name: String(params['task']), workflow: 'unicon/classic@v6' },
        'token-task-yaml',
      ),
    ),
  ),
];
