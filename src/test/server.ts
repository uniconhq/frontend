import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import type { ContestHome, Me, SessionInfo, WorkflowForm } from '@/api/types';

/**
 * A fake backend for the tests, so they exercise the real client, the real
 * error parsing and the real query cache. Mocking our own fetch wrapper would
 * only prove that the mock was called.
 */
export const someone: Me = {
  user: {
    id: 7,
    username: 'kenny',
    name: 'Kenny Lewi',
    avatar_url: 'http://localhost:3300/avatars/7',
    email: 'kenny@example.org',
  },
  roles: [
    { names: { org: 'acme', contest: null, task: null }, role: 'admin' },
    { names: { org: 'acme', contest: 'spring', task: null }, role: 'manager' },
  ],
  degraded: false,
};

export const sessions: SessionInfo[] = [
  {
    id: '0f3a9c2e-6b1d-4e7f-8a9b-0c1d2e3f4a5b',
    created_at: '2026-09-12T08:00:00Z',
    last_seen_at: '2026-09-12T09:30:00Z',
    user_agent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0 Safari/537.36',
    current: true,
  },
  {
    id: '7d2c1b0a-9f8e-4d3c-2b1a-0f9e8d7c6b5a',
    created_at: '2026-09-11T12:00:00Z',
    last_seen_at: '2026-09-11T13:00:00Z',
    user_agent: 'Mozilla/5.0 (X11; Linux x86_64) Firefox/144.0',
    current: false,
  },
];

/** An RFC 9457 body, the way the backend sends one. */
export function problem(
  status: number,
  code: string,
  extra: Record<string, unknown> = {},
) {
  return HttpResponse.json(
    {
      type: 'about:blank',
      title: code.replaceAll('_', ' '),
      status,
      detail: `${code} detail`,
      code,
      ...extra,
    },
    { status, headers: { 'content-type': 'application/problem+json' } },
  );
}

const signedOut = http.get('/api/v1/me', () => problem(401, 'unauthenticated'));
export const signedIn = http.get('/api/v1/me', () => HttpResponse.json(someone));
const noRegistration = http.get('/api/v1/auth/register-url', () =>
  HttpResponse.json({ url: null }),
);
/** Where the backend says Forgejo is. */
export const FORGE = 'http://forge.localhost:8080';
const forgeAddress = http.get('/api/v1/auth/forge-url', () =>
  HttpResponse.json({ url: FORGE }),
);
export const sessionList = http.get('/api/v1/me/sessions', () =>
  HttpResponse.json(sessions),
);

const serverTime = http.get('/api/v1/time', () =>
  HttpResponse.json({ now: '2026-09-12T10:00:00Z' }),
);

/** Nobody listed as holding a role anywhere, until a test says who does. */
const noHolders = [
  http.get('/api/v1/orgs/:org/roles', () => HttpResponse.json([])),
  http.get('/api/v1/orgs/:org/contests/:contest/roles', () => HttpResponse.json([])),
  http.get('/api/v1/orgs/:org/contests/:contest/tasks/:task/roles', () =>
    HttpResponse.json([]),
  ),
];

/** No invite made anywhere, nor waiting for anyone, until a test says there is one. */
const noInvites = [
  http.get('/api/v1/me/invites', () => HttpResponse.json([])),
  http.get('/api/v1/orgs/:org/invites', () => HttpResponse.json([])),
  http.get('/api/v1/orgs/:org/contests/:contest/invites', () => HttpResponse.json([])),
  http.get('/api/v1/orgs/:org/contests/:contest/tasks/:task/invites', () =>
    HttpResponse.json([]),
  ),
];

/** No contest to list yet, public or otherwise, until a test says there is. */
const noContests = [
  http.get('/api/v1/public/contests', () => HttpResponse.json([])),
  http.get('/api/v1/contests', () => HttpResponse.json([])),
];

/** No grading of any task yet, until a test says there is one. */
const noGradings = http.get(
  '/api/v1/orgs/:org/contests/:contest/tasks/:task/gradings',
  () => HttpResponse.json([]),
);

/** Contests with no gradings, nothing waiting and no tasks, until a test says otherwise. */
const emptyOrganising = [
  http.get('/api/v1/orgs/:org/contests/:contest/gradings', () => HttpResponse.json([])),
  http.get('/api/v1/orgs/:org/contests/:contest/gradings/queue', () =>
    HttpResponse.json({ queued: 0, dispatched: 0 }),
  ),
  /** No task standing in any contest, until a test lists some. */
  http.get('/api/v1/orgs/:org/contests/:contest/organise/tasks', () =>
    HttpResponse.json([]),
  ),
  /** An org with no display name of its own nor description, until a test gives one. */
  http.get('/api/v1/orgs/:org', () =>
    HttpResponse.json({ display_name: null, description: '' }),
  ),
  /** Nobody registered for any contest, until a test registers someone. */
  http.get('/api/v1/orgs/:org/contests/:contest/organise/entrants', () =>
    HttpResponse.json([]),
  ),
  /**
   * Every contest a draft its caller organises, from 1 to 15 October 2026,
   * with nothing released, until a test says otherwise.
   */
  http.get('/api/v1/orgs/:org/contests/:contest/home', ({ params }) =>
    HttpResponse.json({
      where: { org: String(params.org), contest: String(params.contest) },
      name: String(params.contest),
      description: '',
      start: '2026-10-01T09:00:00Z',
      end: '2026-10-15T09:00:00Z',
      state: 'draft',
      now: '2026-09-12T10:00:00Z',
      registration: {
        entrant: null,
        invitations: [],
        registration_open: false,
        can_register: false,
        asks_code: false,
        refused: null,
        most: 1,
        fewest: 1,
        locks: 'start',
      },
      organises: true,
      tasks: [],
    } satisfies ContestHome),
  ),
  /** No workflow to choose from and no primitive, until a test lists some. */
  http.get('/api/v1/workflows', () => HttpResponse.json([])),
  http.get('/api/v1/primitives', () => HttpResponse.json([])),
  http.get('/api/v1/workflows/:owner/:name/versions/:version', () =>
    problem(404, 'not_found'),
  ),
  /** No file in any contest or task, and no change to one, until a test gives some. */
  http.get('/api/v1/orgs/:org/contests/:contest/files/:path', () =>
    problem(404, 'not_found'),
  ),
  http.get('/api/v1/orgs/:org/contests/:contest/tasks/:task/files/:path', () =>
    problem(404, 'not_found'),
  ),
  http.get('/api/v1/orgs/:org/contests/:contest/tasks/:task/tree', () =>
    HttpResponse.json([]),
  ),
  http.get('/api/v1/orgs/:org/contests/:contest/tasks/:task/history', () =>
    HttpResponse.json([]),
  ),
  /** A task naming no workflow yet, until a test names one. */
  http.get('/api/v1/orgs/:org/contests/:contest/tasks/:task/workflow-form', () =>
    HttpResponse.json({
      workflow: null,
      newer: null,
      problem: null,
      inputs: [],
      test: [],
      graded: false,
    } satisfies WorkflowForm),
  ),
];

/** No announcement or question anywhere, until a test says there is one. */
const noThreads = [
  http.get('/api/v1/orgs/:org/contests/:contest/home/announcements', () =>
    HttpResponse.json([]),
  ),
  http.get('/api/v1/orgs/:org/contests/:contest/tasks/:task/page/announcements', () =>
    HttpResponse.json([]),
  ),
  http.get('/api/v1/orgs/:org/contests/:contest/announcements', () =>
    HttpResponse.json([]),
  ),
  http.get('/api/v1/orgs/:org/contests/:contest/tasks/:task/announcements', () =>
    HttpResponse.json([]),
  ),
  http.get('/api/v1/orgs/:org/contests/:contest/questions', () =>
    HttpResponse.json([]),
  ),
  http.get('/api/v1/orgs/:org/contests/:contest/clarifications', () =>
    HttpResponse.json([]),
  ),
  http.get('/api/v1/orgs/:org/clarifications', () => HttpResponse.json([])),
];

/** A contest with no boards, so no task takes marks, until a test gives some. */
const noBoards = [
  http.get('/api/v1/public/contests/:org/:contest/boards', () => HttpResponse.json([])),
  http.get('/api/v1/orgs/:org/contests/:contest/boards', () => HttpResponse.json([])),
  http.get('/api/v1/orgs/:org/contests/:contest/organise/boards', () =>
    HttpResponse.json([]),
  ),
  http.get('/api/v1/orgs/:org/contests/:contest/tasks/:task/marks', () =>
    problem(409, 'marks_off'),
  ),
];

/**
 * The default world every test starts in: nobody signed in, a backend that
 * answers. `server.resetHandlers()` returns to exactly this after each test.
 */
export const server = setupServer(
  signedOut,
  noRegistration,
  forgeAddress,
  serverTime,
  ...noContests,
  ...noHolders,
  ...noInvites,
  noGradings,
  ...emptyOrganising,
  ...noThreads,
  ...noBoards,
);
