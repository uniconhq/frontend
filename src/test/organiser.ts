import { http, HttpResponse } from 'msw';
import type {
  FileContent,
  ListedContest,
  Named,
  Outcome,
  Publication,
  RunsResult,
  SaveEffect,
  TaskStanding,
  TaskState,
  TreeEntry,
  ValueMeaning,
} from '@/api/types';
import { problem } from './server';

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
    name: 'autumn',
    state: 'draft',
    start: '2026-10-20T09:00:00Z',
    end: '2026-10-20T14:00:00Z',
  },
  {
    name: 'spring',
    state: 'draft',
    start: '2026-10-01T09:00:00Z',
    end: '2026-10-01T14:00:00Z',
  },
];
const tasks: Named[] = [{ name: 'sort' }, { name: 'sum' }];

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

/** What classic reports, as a publication names its values (M58), in its report order. */
export const classicMeanings: ValueMeaning[] = [
  { name: 'time_ms', title: 'Run time', unit: 'ms', fold: null, better: 'lower' },
  { name: 'memory_kb', title: 'Memory used', unit: 'KB', fold: null, better: 'lower' },
  { name: 'log', title: 'Compile log', unit: null, fold: null, better: null },
];

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
    meanings: classicMeanings,
  },
  {
    number: 2,
    version: '2b3c4d5e6f7a8b9c0d1e',
    grading_changed: false,
    changes: [],
    at: '2026-09-21T10:00:00Z',
    check: null,
    failed_checks: [],
    meanings: classicMeanings,
  },
];

export const publishedTask: TaskState = {
  head: '2b3c4d5e6f7a8b9c0d1e',
  latest: publications[1] ?? null,
  draft: false,
  errors: [],
  statement_written: true,
  head_statement_written: true,
  results: { history: [], released: false },
};

export const draftTask: TaskState = {
  head: '3c4d5e6f7a8b9c0d1e2f',
  latest: publications[1] ?? null,
  draft: true,
  errors: [
    {
      path: 'inputs.setter[0].value',
      message: 'There is no file under data/hidden/ in the task.',
    },
  ],
  statement_written: true,
  head_statement_written: true,
  results: { history: [], released: false },
};

export const taskState = http.get(TASK_API, () => HttpResponse.json(publishedTask));
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

/** The commit every listed file was last changed at. */
const LISTED_AT = '9f8e7d6c5b4a39281706f5e4d3c2b1a098765432';

/** Folder by folder, as `GET <place>/tree?path=` answers. */
const taskTree: Record<string, TreeEntry[]> = {
  '': [
    {
      path: 'task.yaml',
      kind: 'file',
      size: 120,
      upload: null,
      start: null,
      token: null,
      version: LISTED_AT,
    },
    {
      path: 'data',
      kind: 'directory',
      size: null,
      upload: null,
      start: null,
      token: null,
      version: null,
    },
    {
      path: 'statement.md',
      kind: 'file',
      size: 40,
      upload: null,
      start: null,
      token: null,
      version: LISTED_AT,
    },
  ],
  data: [
    {
      path: 'data/testcases',
      kind: 'directory',
      size: null,
      upload: null,
      start: null,
      token: null,
      version: null,
    },
  ],
  'data/testcases': [
    {
      path: 'data/testcases/1.in',
      kind: 'file',
      size: 4,
      upload: null,
      start: null,
      token: null,
      version: LISTED_AT,
    },
    {
      path: 'data/testcases/logo.png',
      kind: 'file',
      size: 11,
      upload: null,
      start: null,
      token: null,
      version: LISTED_AT,
    },
  ],
};

const contestTree: Record<string, TreeEntry[]> = {
  '': [
    {
      path: 'contest.yaml',
      kind: 'file',
      size: 80,
      upload: null,
      start: null,
      token: null,
      version: LISTED_AT,
    },
  ],
};

export const files: Record<string, FileContent> = {
  'task.yaml': {
    path: 'task.yaml',
    encoding: 'utf-8',
    content: 'name: sum\nworkflow: unicon/classic@v2\n',
    token: 'token-task-yaml',
    upload: null,
    version: '3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d',
  },
  'statement.md': {
    path: 'statement.md',
    encoding: 'utf-8',
    content: 'Write the sum of two numbers.\n',
    token: 'token-statement',
    upload: null,
    version: '3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d',
  },
  'data/testcases/1.in': {
    path: 'data/testcases/1.in',
    encoding: 'utf-8',
    content: '1 2\n',
    token: 'token-1-in',
    upload: null,
    version: '3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d',
  },
  'data/testcases/logo.png': {
    path: 'data/testcases/logo.png',
    encoding: 'base64',
    content: 'iVBORw0KGgoA//4=',
    token: 'token-logo',
    upload: null,
    version: '3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d',
  },
  'contest.yaml': {
    path: 'contest.yaml',
    encoding: 'utf-8',
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
    upload: null,
    version: '3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d',
  },
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

/** Both repos' trees and files, read-only; a test adds the writes it needs. */
export const repoFiles = [
  http.get(`${CONTEST_API}/tree`, treeAnswer(contestTree)),
  http.get(`${TASK_API}/tree`, treeAnswer(taskTree)),
  http.get(`${CONTEST_API}/files/:path`, fileAnswer),
  http.get(`${TASK_API}/files/:path`, fileAnswer),
];
