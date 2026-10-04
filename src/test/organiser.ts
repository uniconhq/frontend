import { http, HttpResponse } from 'msw';
import type {
  FileContent,
  Named,
  Publication,
  TaskState,
  TreeEntry,
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

export const contests: Named[] = [{ name: 'autumn' }, { name: 'spring' }];
export const tasks: Named[] = [{ name: 'sort' }, { name: 'sum' }];

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
      listed.push({ name: body.name });
      return HttpResponse.json({ name: body.name }, { status: 201 });
    }),
  ];
  return { handlers, sent };
}

// A task's state and publications

export const publications: Publication[] = [
  {
    number: 1,
    version: '1a2b3c4d5e6f7a8b9c0d',
    grading_changed: true,
    changes: ['plans/default.json added'],
    at: '2026-09-20T10:00:00Z',
  },
  {
    number: 2,
    version: '2b3c4d5e6f7a8b9c0d1e',
    grading_changed: false,
    changes: [],
    at: '2026-09-21T10:00:00Z',
  },
];

export const publishedTask: TaskState = {
  head: '2b3c4d5e6f7a8b9c0d1e',
  latest: publications[1] ?? null,
  draft: false,
  errors: [],
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
};

export const taskState = http.get(TASK_API, () => HttpResponse.json(publishedTask));
export const publicationList = http.get(`${TASK_API}/publications`, () =>
  HttpResponse.json(publications),
);

// Repo files

/** Folder by folder, as `GET <place>/tree?path=` answers. */
const taskTree: Record<string, TreeEntry[]> = {
  '': [
    { path: 'task.yaml', kind: 'file', size: 120 },
    { path: 'data', kind: 'directory', size: null },
    { path: 'statement.md', kind: 'file', size: 40 },
  ],
  data: [{ path: 'data/testcases', kind: 'directory', size: null }],
  'data/testcases': [
    { path: 'data/testcases/1.in', kind: 'file', size: 4 },
    { path: 'data/testcases/logo.png', kind: 'file', size: 11 },
  ],
};

const contestTree: Record<string, TreeEntry[]> = {
  '': [{ path: 'contest.yaml', kind: 'file', size: 80 }],
};

export const files: Record<string, FileContent> = {
  'task.yaml': {
    path: 'task.yaml',
    encoding: 'utf-8',
    content: 'name: sum\nworkflow: unicon/classic@v1\n',
    token: 'token-task-yaml',
  },
  'statement.md': {
    path: 'statement.md',
    encoding: 'utf-8',
    content: 'Write the sum of two numbers.\n',
    token: 'token-statement',
  },
  'data/testcases/1.in': {
    path: 'data/testcases/1.in',
    encoding: 'utf-8',
    content: '1 2\n',
    token: 'token-1-in',
  },
  'data/testcases/logo.png': {
    path: 'data/testcases/logo.png',
    encoding: 'base64',
    content: 'iVBORw0KGgoA//4=',
    token: 'token-logo',
  },
  'contest.yaml': {
    path: 'contest.yaml',
    encoding: 'utf-8',
    content: 'name: Spring\nvisibility: signed-in\n',
    token: 'token-contest-yaml',
  },
};

function treeAnswer(tree: Record<string, TreeEntry[]>) {
  return ({ request }: { request: Request }) =>
    HttpResponse.json(tree[new URL(request.url).searchParams.get('path') ?? ''] ?? []);
}

/** The client sends a file's path as one segment, its slashes encoded. */
function fileAnswer({ params }: { params: Record<string, unknown> }) {
  const file = files[decodeURIComponent(String(params['path']))];
  return file === undefined ? problem(404, 'not_found') : HttpResponse.json(file);
}

/** Both repos' trees and files, read-only; a test adds the writes it needs. */
export const repoFiles = [
  http.get(`${CONTEST_API}/tree`, treeAnswer(contestTree)),
  http.get(`${TASK_API}/tree`, treeAnswer(taskTree)),
  http.get(`${CONTEST_API}/files/:path`, fileAnswer),
  http.get(`${TASK_API}/files/:path`, fileAnswer),
];
