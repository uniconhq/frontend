import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { FeedEntry, Grading } from '@/api/types';
import { renderApp } from '@/test/render';
import { problem, server, signedIn, someone } from '@/test/server';
import { CONTEST_API, standingList } from '@/test/organiser';
import { passTime, withFakeTimers } from '@/test/timers';

const FEED = '/orgs/acme/contests/spring/gradings';

const grading: Grading = {
  id: '0199a2c1-6b7e-7c3a-9f10-5d2e4b8a6c31',
  submission_number: 3,
  submitted_at: '2026-10-05T10:00:00Z',
  publication: 2,
  attempt: 1,
  status: 'done',
  error: null,
  result: {
    stopped: null,
    tests: [{ test: 'main/1', outcome: 'wrong_answer', values: {} }],
    values: {},
    error: null,
  },
  log: true,
  progress: null,
  queued_at: '2026-10-05T10:00:00Z',
  dispatched_at: '2026-10-05T10:00:01Z',
  started_at: '2026-10-05T10:00:05Z',
  finished_at: '2026-10-05T10:01:00Z',
  deadline_at: null,
  cancel_reason: null,
};

const ada = { user_id: 11, name: 'ada', team: null };
const lovelaces = { user_id: null, name: 'Lovelaces', team: 'team-1' };

/** A first attempt that hit a system error, then its retry, still queued. */
const stuckFirst: FeedEntry = {
  task: 'sum',
  by: ada,
  grading: {
    ...grading,
    id: 'g-sum-1',
    status: 'system_error',
    error: 'The grading machine lost its run before it began.',
    result: null,
    log: false,
    started_at: null,
    finished_at: '2026-10-05T10:05:00Z',
  },
};
const retried: FeedEntry = {
  task: 'sum',
  by: ada,
  grading: {
    ...stuckFirst.grading,
    id: 'g-sum-2',
    attempt: 2,
    status: 'queued',
    error: null,
    queued_at: '2026-10-05T10:06:00Z',
    finished_at: null,
  },
};
const sortByTeam: FeedEntry = {
  task: 'sort',
  by: lovelaces,
  grading: { ...grading, id: 'g-sort-1', submission_number: 1 },
};
const cancelled: FeedEntry = {
  task: 'sort',
  by: ada,
  grading: {
    ...grading,
    id: 'g-sort-ada-1',
    submission_number: 1,
    status: 'cancelled',
    error: 'The run did not report by its deadline.',
    cancel_reason: 'Our grader broke; this one does not count against you.',
    result: null,
    log: false,
  },
};

const feed = [retried, sortByTeam, stuckFirst, cancelled];

/** The feed's requests, each by its query, and the answer it gives. */
function feedAnswering(answer: (query: URLSearchParams) => FeedEntry[]) {
  const asked: string[] = [];
  server.use(
    http.get(`${CONTEST_API}/gradings`, ({ request }) => {
      const query = new URL(request.url).searchParams;
      asked.push(query.toString());
      return HttpResponse.json(answer(query));
    }),
  );
  return asked;
}

describe("the contest's gradings feed", () => {
  it('lists every submission with its task, who made it, where it stands and when', async () => {
    server.use(
      signedIn,
      standingList,
      http.get(`${CONTEST_API}/gradings/queue`, () =>
        HttpResponse.json({ queued: 4, dispatched: 2 }),
      ),
    );
    feedAnswering(() => feed);
    renderApp(FEED);

    const table = await screen.findByRole('table', { name: 'Gradings' });
    const depth = screen.getByLabelText('Queue');
    expect(depth).toHaveTextContent('Queued4');
    expect(depth).toHaveTextContent('Waiting for a machine2');

    const groups = within(table).getAllByRole('rowgroup').slice(1);
    expect(groups).toHaveLength(3);
    const [sum, team, sortAda] = groups as [HTMLElement, HTMLElement, HTMLElement];
    expect(sum).toHaveAccessibleName('B submission 3 by ada');
    expect(within(sum).getByRole('link', { name: 'sum' })).toHaveAttribute(
      'href',
      '/orgs/acme/contests/spring/tasks/sum',
    );
    expect(sum).toHaveTextContent('Queued');
    expect(within(sum).getAllByRole('row')).toHaveLength(1);

    expect(team).toHaveTextContent('Lovelaces (team)');
    expect(team).toHaveTextContent('wrong_answer');
    expect(
      within(team).getByRole('link', {
        name: 'Log of A submission 1 by Lovelaces (team), attempt 1',
      }),
    ).toHaveAttribute(
      'href',
      '/api/v1/orgs/acme/contests/spring/tasks/sort/gradings/g-sort-1/log',
    );

    expect(sortAda).toHaveTextContent('Cancelled');
    expect(sortAda).toHaveTextContent('The run did not report by its deadline.');
    expect(sortAda).toHaveTextContent(
      'Told the contestant: “Our grader broke; this one does not count against you.”',
    );
  });

  it("opens a submission's earlier attempts below its latest", async () => {
    server.use(signedIn, standingList);
    feedAnswering(() => feed);
    renderApp(FEED);

    const sum = await screen.findByRole('rowgroup', { name: 'B submission 3 by ada' });
    const toggle = within(sum).getByRole('button', {
      name: 'Show earlier attempts (1)',
    });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(toggle);

    const rows = within(sum).getAllByRole('row');
    expect(rows).toHaveLength(2);
    expect(rows[1]).toHaveTextContent('System error');
    expect(rows[1]).toHaveTextContent(
      'The grading machine lost its run before it began.',
    );
  });

  it('narrows the feed by task, status, team and username, keeping each in the address', async () => {
    server.use(
      signedIn,
      standingList,
      http.get(`${CONTEST_API}/organise/teams`, () =>
        HttpResponse.json([
          {
            id: 'team-1',
            name: 'Lovelaces',
            leader: null,
            members: [],
            pending: [],
            submitted: true,
            time_extension: 0,
            extension_tasks: null,
          },
        ]),
      ),
    );
    const asked = feedAnswering((query) =>
      feed.filter(
        (entry) =>
          (query.get('task') === null || entry.task === query.get('task')) &&
          (query.get('status') === null ||
            entry.grading.status === query.get('status')),
      ),
    );
    const user = userEvent.setup();
    const { router } = renderApp(FEED);
    await screen.findByRole('table', { name: 'Gradings' });

    await user.selectOptions(screen.getByRole('combobox', { name: 'Task' }), 'sort');
    await waitFor(() => expect(asked.at(-1)).toBe('task=sort'));
    expect(router.state.location.search).toBe('?task=sort');
    await waitFor(() =>
      expect(
        screen.queryByRole('rowgroup', { name: 'B submission 3 by ada' }),
      ).toBeNull(),
    );

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Status' }),
      'cancelled',
    );
    await waitFor(() => expect(asked.at(-1)).toBe('task=sort&status=cancelled'));
    expect(
      await screen.findByRole('rowgroup', { name: 'A submission 1 by ada' }),
    ).toBeVisible();
    expect(screen.getAllByRole('rowgroup')).toHaveLength(2);

    await user.selectOptions(screen.getByRole('combobox', { name: 'Team' }), 'team-1');
    await waitFor(() =>
      expect(asked.at(-1)).toBe('task=sort&team=team-1&status=cancelled'),
    );

    await user.type(
      screen.getByRole('textbox', { name: "Contestant's username" }),
      'ada',
    );
    expect(asked.at(-1)).toBe('task=sort&team=team-1&status=cancelled');
    await user.click(screen.getByRole('button', { name: 'Filter' }));
    await waitFor(() =>
      expect(asked.at(-1)).toBe('task=sort&user=ada&team=team-1&status=cancelled'),
    );

    await user.click(screen.getByRole('link', { name: 'Clear filters' }));
    await waitFor(() => expect(router.state.location.search).toBe(''));
    expect(
      await screen.findByRole('rowgroup', { name: 'B submission 3 by ada' }),
    ).toBeVisible();
    expect(screen.getByRole('textbox', { name: "Contestant's username" })).toHaveValue(
      '',
    );
  });

  it('reads the filters from the address it was opened at', async () => {
    server.use(signedIn, standingList);
    const asked = feedAnswering(() => []);
    renderApp(`${FEED}?user=ada&status=system_error&status=bogus`);

    expect(await screen.findByText('No grading matches these filters.')).toBeVisible();
    expect(asked).toEqual(['user=ada&status=system_error']);
    expect(screen.getByRole('textbox', { name: "Contestant's username" })).toHaveValue(
      'ada',
    );
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveValue(
      'system_error',
    );
  });

  it('is linked from the contest page', async () => {
    server.use(signedIn, standingList);
    renderApp('/orgs/acme/contests/spring');

    expect(await screen.findByRole('link', { name: 'Gradings' })).toHaveAttribute(
      'href',
      FEED,
    );
  });
});

/** Signed in with these roles alone. */
function signedInAs(roles: typeof someone.roles) {
  return http.get('/api/v1/me', () => HttpResponse.json({ ...someone, roles }));
}

describe('acting on the feed', () => {
  it('retries a finished latest attempt through its task, after asking', async () => {
    let now: FeedEntry[] = [sortByTeam];
    const retriedAt: string[] = [];
    server.use(
      signedIn,
      standingList,
      http.post(`${CONTEST_API}/tasks/:task/gradings/:grading/retry`, ({ params }) => {
        retriedAt.push(`${String(params.task)}/${String(params.grading)}`);
        const again = {
          ...sortByTeam.grading,
          id: 'g-sort-2',
          attempt: 2,
          status: 'queued' as const,
        };
        now = [{ ...sortByTeam, grading: again }, sortByTeam];
        return HttpResponse.json(again);
      }),
    );
    feedAnswering(() => now);
    renderApp(FEED);

    const name = 'A submission 1 by Lovelaces (team), attempt 1';
    expect(await screen.findByRole('button', { name: `Retry ${name}` })).toBeVisible();
    expect(screen.queryByRole('button', { name: `Cancel ${name}` })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: `Retry ${name}` }));
    const dialog = await screen.findByRole('dialog', { name: 'Retry this grading?' });
    expect(dialog).toHaveTextContent(
      "Lovelaces (team)'s submission 1 to sort is graded again as a new attempt, against publication 2, as attempt 1 was.",
    );
    expect(retriedAt).toEqual([]);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Retry' }));

    const group = await screen.findByRole('rowgroup', {
      name: 'A submission 1 by Lovelaces (team)',
    });
    await waitFor(() => expect(group).toHaveTextContent('Queued'));
    expect(retriedAt).toEqual(['sort/g-sort-1']);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(
      within(group).getByRole('button', { name: 'Show earlier attempts (1)' }),
    ).toBeVisible();
  });

  it('cancels a system error with the sentence the contestant reads, once given', async () => {
    const sent: unknown[] = [];
    server.use(
      signedIn,
      standingList,
      http.post(
        `${CONTEST_API}/tasks/:task/gradings/:grading/cancel`,
        async ({ request, params }) => {
          sent.push([params.task, params.grading, await request.json()]);
          return HttpResponse.json({ ...stuckFirst.grading, status: 'cancelled' });
        },
      ),
    );
    feedAnswering(() => [stuckFirst, sortByTeam]);
    const user = userEvent.setup();
    renderApp(FEED);

    await user.click(
      await screen.findByRole('button', {
        name: 'Cancel B submission 3 by ada, attempt 1',
      }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Cancel this submission?',
    });
    expect(dialog).toHaveTextContent("ada's submission 3 to sum ends as cancelled.");
    const confirm = within(dialog).getByRole('button', {
      name: 'Cancel the submission',
    });
    expect(confirm).toBeDisabled();
    const field = within(dialog).getByRole('textbox', {
      name: /^What the contestant reads/,
    });
    expect(field).toHaveAttribute('maxlength', '500');
    await user.type(field, '  Our grader broke.  ');
    await user.click(confirm);

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(sent).toEqual([
      ['sum', stuckFirst.grading.id, { reason: 'Our grader broke.' }],
    ]);
  });

  it('keeps a refused cancel in the dialog with its sentence', async () => {
    server.use(
      signedIn,
      standingList,
      http.post(`${CONTEST_API}/tasks/:task/gradings/:grading/cancel`, () =>
        problem(409, 'wrong_status', {
          detail: 'The grading is no longer a system error.',
          current: 'queued',
        }),
      ),
    );
    feedAnswering(() => [stuckFirst]);
    const user = userEvent.setup();
    renderApp(FEED);

    await user.click(
      await screen.findByRole('button', {
        name: 'Cancel B submission 3 by ada, attempt 1',
      }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Cancel this submission?',
    });
    await user.type(
      within(dialog).getByRole('textbox', { name: /^What the contestant reads/ }),
      'Sorry.',
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Cancel the submission' }),
    );

    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('It is no longer a system error');
    expect(alert).toHaveTextContent('The grading is no longer a system error.');
    expect(alert).toHaveTextContent('It is queued now.');
  });

  it('rejudges the task the feed is filtered to, after saying what it does', async () => {
    const rejudgedAt: string[] = [];
    server.use(
      signedIn,
      standingList,
      http.post(`${CONTEST_API}/tasks/:task/rejudge`, ({ params }) => {
        rejudgedAt.push(String(params.task));
        return HttpResponse.json({
          publication: 2,
          queued: 3,
          cancelled: 1,
          left_running: 0,
        });
      }),
    );
    feedAnswering(() => [stuckFirst]);
    const user = userEvent.setup();
    renderApp(FEED);

    await screen.findByRole('table', { name: 'Gradings' });
    expect(screen.queryByRole('button', { name: /^Rejudge/ })).toBeNull();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Task' }), 'sum');
    await user.click(await screen.findByRole('button', { name: 'Rejudge B · sum' }));
    const dialog = await screen.findByRole('dialog', {
      name: 'Rejudge every submission of this task?',
    });
    expect(dialog).toHaveTextContent(
      "Every submission of B · sum has its latest attempt graded again against the task's current publication, as a new attempt.",
    );
    await user.click(within(dialog).getByRole('button', { name: 'Rejudge' }));

    const outcome = await screen.findByText(/rejudged against publication 2/);
    expect(outcome).toHaveTextContent(
      'B · sum rejudged against publication 2: 3 attempts queued.',
    );
    expect(
      screen.getByText('1 attempt against an older publication cancelled first.'),
    ).toBeVisible();
    expect(rejudgedAt).toEqual(['sum']);
  });

  it('says so when the task has nothing published to rejudge against', async () => {
    server.use(
      signedIn,
      standingList,
      http.post(`${CONTEST_API}/tasks/:task/rejudge`, () => problem(404, 'not_found')),
    );
    feedAnswering(() => []);
    const user = userEvent.setup();
    renderApp(`${FEED}?task=sort`);

    await user.click(await screen.findByRole('button', { name: 'Rejudge A · sort' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Rejudge' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Nothing to rejudge against',
    );
  });

  it('offers an observer nothing to do', async () => {
    server.use(
      signedInAs([
        { names: { org: 'acme', contest: null, task: null }, role: 'observer' },
      ]),
      standingList,
    );
    feedAnswering(() => [stuckFirst, sortByTeam]);
    renderApp(`${FEED}?task=sum`);

    const table = await screen.findByRole('table', { name: 'Gradings' });
    expect(within(table).queryByRole('columnheader', { name: 'Actions' })).toBeNull();
    expect(
      screen.queryByRole('button', { name: /^(Retry|Cancel|Rejudge)/ }),
    ).toBeNull();
  });

  it("offers a task's manager the actions on that task's rows alone", async () => {
    server.use(
      signedInAs([
        { names: { org: 'acme', contest: 'spring', task: null }, role: 'observer' },
        { names: { org: 'acme', contest: 'spring', task: 'sum' }, role: 'manager' },
      ]),
      standingList,
    );
    feedAnswering(() => [stuckFirst, sortByTeam]);
    renderApp(FEED);

    expect(
      await screen.findByRole('button', {
        name: 'Retry B submission 3 by ada, attempt 1',
      }),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', {
        name: 'Retry A submission 1 by Lovelaces (team), attempt 1',
      }),
    ).toBeNull();
  });
});

describe('the feed without the stream', () => {
  withFakeTimers();

  it('reads the feed and the queue again every ten seconds while one is to finish', async () => {
    let now: FeedEntry[] = [retried];
    let depth = { queued: 1, dispatched: 0 };
    server.use(
      signedIn,
      standingList,
      http.get(`${CONTEST_API}/gradings/queue`, () => HttpResponse.json(depth)),
    );
    feedAnswering(() => now);
    renderApp(FEED);

    const sum = await screen.findByRole('rowgroup', { name: 'B submission 3 by ada' });
    now = [{ ...retried, grading: { ...retried.grading, status: 'done' } }];
    depth = { queued: 0, dispatched: 0 };
    await passTime(10_000);

    await waitFor(() => expect(sum).toHaveTextContent('Done'));
    await waitFor(() =>
      expect(screen.getByLabelText('Queue')).toHaveTextContent('Queued0'),
    );
  });
});

class FakeSource {
  static readonly CLOSED = 2;
  static last: FakeSource | null = null;
  readyState = 0;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  listeners = new Map<string, () => void>();

  constructor() {
    FakeSource.last = this;
  }

  addEventListener(kind: string, listener: () => void) {
    this.listeners.set(kind, listener);
  }

  close() {
    this.readyState = FakeSource.CLOSED;
  }

  emit(kind: string) {
    this.listeners.get(kind)?.();
  }
}

describe('the feed kept up to date', () => {
  beforeEach(() => {
    vi.stubGlobal('EventSource', FakeSource);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    FakeSource.last = null;
  });

  it('shows a grading that changed, and the queue, once the stream says one did', async () => {
    let now: FeedEntry[] = [retried];
    let depth = { queued: 1, dispatched: 0 };
    server.use(
      signedIn,
      standingList,
      http.get(`${CONTEST_API}/gradings/queue`, () => HttpResponse.json(depth)),
    );
    feedAnswering(() => now);
    renderApp(FEED);

    const sum = await screen.findByRole('rowgroup', { name: 'B submission 3 by ada' });
    expect(sum).toHaveTextContent('Queued');
    expect(screen.getByLabelText('Queue')).toHaveTextContent('Queued1');
    FakeSource.last?.onopen?.();

    now = [{ ...retried, grading: { ...retried.grading, status: 'running' } }];
    depth = { queued: 0, dispatched: 0 };
    FakeSource.last?.emit('grading');

    await waitFor(() => expect(sum).toHaveTextContent('Running'));
    await waitFor(() =>
      expect(screen.getByLabelText('Queue')).toHaveTextContent('Queued0'),
    );
  });
});
