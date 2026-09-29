import { http, HttpResponse } from 'msw';
import type { Contestant, ContestHome, MyRegistration, TaskRelease } from '@/api/types';
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

export const taskPage: components['schemas']['TaskPage'] = {
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
