import { http, HttpResponse } from 'msw';
import type {
  ContestHome,
  Contestant,
  GradingResult,
  InputField,
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
    time_extension: 0,
    extension_tasks: null,
    ...overrides,
  };
}

export function home(overrides: Partial<ContestHome> = {}): ContestHome {
  return {
    where: { org: 'acme', contest: 'spring' },
    name: 'Spring 2026',
    description: 'Four tasks, five hours.',
    start: '2026-09-12T09:00:00Z',
    end: '2026-09-12T10:30:00Z',
    state: 'published',
    registration: null,
    organises: false,
    registration_open: true,
    invite_only: false,
    asks_code: false,
    now: '2026-09-12T10:00:00Z',
    tasks: [
      {
        name: 'sum',
        label: 'A',
        title: 'Sum of Two',
        worth: 100,
        release: OPEN,
        due: null,
        closes: '2026-09-12T10:30:00Z',
      },
    ],
    ...overrides,
  };
}

/** A contestant input, a file input for the solution unless told otherwise. */
export function inputField(overrides: Partial<InputField> = {}): InputField {
  return {
    id: 'submission',
    type: 'file',
    label: 'Your solution',
    options: null,
    per_test: false,
    default: null,
    min: null,
    max: null,
    max_size: 10 * 1024 * 1024,
    ...overrides,
  };
}

/** The language of the solution, as an enum input with Python alone. */
export const languageField = inputField({
  id: 'language',
  type: 'enum',
  label: 'language',
  options: ['python'],
});

export const taskPage: TaskPage = {
  name: 'sum',
  label: 'A',
  title: 'Sum of Two',
  worth: 100,
  statement: '# Sum\n\nRead two numbers and print their **sum**.\n',
  submissions: { max: 50, rate: { count: 1, per: 30 } },
  inputs: [inputField(), languageField],
  release: OPEN,
  due: null,
  closes: '2026-09-12T10:30:00Z',
};

export const publicContest: components['schemas']['PublicContest'] = {
  where: { org: 'acme', contest: 'spring' },
  name: 'Spring 2026',
  description: 'Four tasks, five hours.',
  start: '2026-09-12T09:00:00Z',
  end: '2026-09-12T10:30:00Z',
  tasks: [{ name: 'sum', label: 'A', title: 'Sum of Two' }],
};

export function contestant(overrides: Partial<Contestant> = {}): Contestant {
  return {
    ...registration(),
    user_id: 20,
    user: {
      id: 20,
      username: 'carol',
      name: 'Carol',
      email: 'carol@example.org',
      avatar_url: null,
    },
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

export const DOOR_URL = '/-/uploads/';

/** A contestant who has not submitted to the task yet. */
export const noSubmissions = http.get(`${TASK_API}/submissions`, () =>
  HttpResponse.json([]),
);

/** A submission's grading as the contestant sees it: queued, nothing shown yet. */
export function grading(overrides: Partial<GradingResult> = {}): GradingResult {
  return {
    id: '5d2f0c1e-0000-4000-8000-000000000001',
    attempt: 1,
    status: 'queued',
    stopped: null,
    outcome: null,
    groups: [],
    values: {},
    ...overrides,
  };
}

/**
 * A graded one: accepted, with its compile log, the samples shown with their
 * tests, and a group whose tests are shown at the reveal.
 */
export const accepted = grading({
  status: 'done',
  outcome: 'accepted',
  values: { log: 'Compiled cleanly.' },
  groups: [
    {
      group: 'samples',
      show: 'always',
      outcome: 'accepted',
      tests: [
        {
          test: 'samples/1',
          outcome: 'accepted',
          values: { time_ms: 12, memory_kb: 2048 },
        },
        { test: 'samples/2', outcome: 'accepted', values: {} },
      ],
      shown_at: null,
      ran: true,
    },
    {
      group: 'main',
      show: 'verdict',
      outcome: 'accepted',
      tests: null,
      shown_at: '2026-09-12T11:00:00Z',
      ran: true,
    },
  ],
});

export function submission(
  number: number,
  graded: GradingResult | null,
  overrides: Partial<Submission> = {},
): Submission {
  return {
    number,
    submitted_at: `2026-09-12T09:${String(number).padStart(2, '0')}:00Z`,
    late_days: 0,
    grading: graded,
    ...overrides,
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
    sent: [] as { id: string; bytes: number }[],
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
      const id = `00000000-0000-4000-8000-00000000000${made}`;
      return HttpResponse.json(
        {
          id,
          url: `${DOOR_URL}${id}`,
          ready: false,
          expires_at: '2026-09-12T10:15:00Z',
        },
        { status: 201 },
      );
    }),
    http.put(`${DOOR_URL}:upload`, async ({ request, params }) => {
      const body = await request.arrayBuffer();
      seen.sent.push({ id: String(params['upload']), bytes: body.byteLength });
      return new HttpResponse(null, { status: 200 });
    }),
    http.post(`${TASK_API}/uploads/:upload/complete`, ({ params }) => {
      const id = String(params['upload']);
      seen.completed.push(id);
      const upload: Upload = {
        id,
        input: 'submission',
        filename: 'main.py',
        content_type: null,
        size: 1,
        sha256: 'a'.repeat(64),
        status: 'verified',
      };
      return HttpResponse.json(upload);
    }),
  ];
  return { seen, handlers };
}
