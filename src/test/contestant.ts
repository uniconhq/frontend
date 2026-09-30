import { http, HttpResponse } from 'msw';
import type {
  Contestant,
  ContestantInput,
  ContestHome,
  GradingResult,
  MyRegistration,
  Submission,
  TaskPage,
  TaskRelease,
  Upload,
} from '@/api/types';
import type { components } from '@/api/schema';

/**
 * The contestant's world for the tests: acme/spring running around the fake
 * server clock's 10:00, its one released task, and the registrations an
 * organiser decides. Each handler answers for any org and contest name, so a
 * test only overrides what it is about, at the addresses below.
 */
export const CONTEST_API = '/api/v1/orgs/:org/contests/:contest';
export const TASK_API = `${CONTEST_API}/tasks/:task`;
export const PUBLIC_API = '/api/v1/public/contests';

const OPEN: TaskRelease = { released: true, visible: true, open: true, closed: null };

export function registration(overrides: Partial<MyRegistration> = {}): MyRegistration {
  return {
    status: 'pending',
    reason: null,
    registered_at: '2026-09-12T09:00:00Z',
    decided_at: null,
    time_extension_seconds: 0,
    workspace: null,
    ...overrides,
  };
}

export function home(overrides: Partial<ContestHome> = {}): ContestHome {
  return {
    org: 'acme',
    name: 'spring',
    title: 'Spring 2026',
    description: 'Four tasks, five hours.',
    start: '2026-09-12T09:00:00Z',
    end: '2026-09-12T10:30:00Z',
    state: 'published',
    submissions_closed: false,
    registration: null,
    organises: false,
    registration_open: true,
    invite_only: false,
    asks_code: false,
    deadline: '2026-09-12T10:30:00Z',
    now: '2026-09-12T10:00:00Z',
    tasks: [
      { name: 'sum', label: 'A', title: 'Sum of Two', points: 100, release: OPEN },
    ],
    ...overrides,
  };
}

/** A contestant input, a code input in Python unless told otherwise. */
export function contestantInput(
  overrides: Partial<ContestantInput> = {},
): ContestantInput {
  return {
    id: 'submission',
    type: 'code',
    label: 'Your solution',
    language: ['python'],
    min: null,
    max: null,
    accept: null,
    max_size: null,
    default: null,
    ...overrides,
  };
}

export const taskPage: TaskPage = {
  name: 'sum',
  label: 'A',
  title: 'Sum of Two',
  points: 100,
  statement: '# Sum\n\nRead two numbers and print their **sum**.\n',
  limits: {
    submissions: 50,
    rate_count: 1,
    rate_seconds: 30,
    max_size: 10 * 1024 * 1024,
  },
  inputs: [contestantInput()],
  release: OPEN,
};

export const publicContest: components['schemas']['PublicContest'] = {
  org: 'acme',
  name: 'spring',
  title: 'Spring 2026',
  description: 'Four tasks, five hours.',
  start: '2026-09-12T09:00:00Z',
  end: '2026-09-12T10:30:00Z',
  tasks: [{ name: 'sum', label: 'A', title: 'Sum of Two' }],
};

export function contestant(overrides: Partial<Contestant> = {}): Contestant {
  return {
    user_id: 20,
    username: 'carol',
    name: 'Carol',
    email: 'carol@example.org',
    avatar_url: null,
    status: 'pending',
    reason: null,
    registered_at: '2026-09-12T09:00:00Z',
    decided_at: null,
    time_extension_seconds: 0,
    workspace: null,
    workspace_error: null,
    ...overrides,
  };
}

/** The home answering each record in turn, then the last one for good. */
export function homesInTurn(records: ContestHome[]) {
  let asked = 0;
  return http.get(`${CONTEST_API}/home`, () => {
    const record = records[Math.min(asked, records.length - 1)];
    asked += 1;
    return HttpResponse.json(record);
  });
}

// Submitting

export const UPLOADS_URL = '/unicon-uploads/';

/** A contestant who has not submitted to the task yet. */
export const noSubmissions = http.get(`${TASK_API}/submissions`, () =>
  HttpResponse.json([]),
);

/** One stage's grading as the contestant sees it: queued, nothing shown yet. */
export function grading(overrides: Partial<GradingResult> = {}): GradingResult {
  return {
    id: '5d2f0c1e-0000-4000-8000-000000000001',
    stage: 'default',
    attempt: 1,
    status: 'queued',
    show: 'full',
    outcome: null,
    metrics: null,
    summary: null,
    tests: null,
    log: false,
    ...overrides,
  };
}

/** A graded one: accepted with its points, two tests and a log. */
export const accepted = grading({
  status: 'done',
  outcome: 'accepted',
  metrics: { points: 100 },
  summary: 'Compiled cleanly.',
  tests: [
    {
      id: '1',
      outcome: 'accepted',
      time_ms: 12,
      memory_kb: 2048,
      metrics: { points: 1 },
      message: null,
    },
    {
      id: '2',
      outcome: 'accepted',
      time_ms: null,
      memory_kb: null,
      metrics: { points: 1 },
      message: null,
    },
  ],
  log: true,
});

export function submission(number: number, gradings: GradingResult[]): Submission {
  return {
    number,
    submitted_at: `2026-09-12T09:${String(number).padStart(2, '0')}:00Z`,
    gradings,
  };
}

/**
 * The upload routes and the object store, answering every slot with a form
 * posted to the store and every completion as verified, and keeping each
 * request so a test can check what went where.
 */
export function uploadStore() {
  const seen = {
    slots: [] as unknown[],
    forms: [] as FormData[],
    completed: [] as string[],
    submits: [] as unknown[],
  };
  let made = 0;
  const handlers = [
    http.post(`${TASK_API}/uploads`, async ({ request }) => {
      const body = (await request.json()) as {
        input: string;
        filename: string;
        size: number;
      };
      seen.slots.push(body);
      made += 1;
      return HttpResponse.json(
        {
          id: `00000000-0000-4000-8000-00000000000${made}`,
          method: 'post',
          url: `http://localhost:8080${UPLOADS_URL}`,
          fields: { bucket: 'unicon-uploads', key: `uploads/${made}`, policy: 'p' },
          expires_at: '2026-09-12T10:15:00Z',
        },
        { status: 201 },
      );
    }),
    http.post(UPLOADS_URL, async ({ request }) => {
      seen.forms.push(await request.formData());
      return new HttpResponse(null, { status: 204 });
    }),
    http.post(`${TASK_API}/uploads/:upload/complete`, ({ params }) => {
      const id = String(params['upload']);
      seen.completed.push(id);
      const upload: Upload = {
        id,
        input: 'submission',
        filename: 'main.py',
        content_type: null,
        declared_size: 1,
        size: 1,
        sha256: 'ab',
        status: 'verified',
      };
      return HttpResponse.json(upload);
    }),
  ];
  return { seen, handlers };
}
