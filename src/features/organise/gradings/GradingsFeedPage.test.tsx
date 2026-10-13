import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@/test/user-event';
import { http, HttpResponse } from 'msw';
import type { FeedEntry, Grading, RegradeSummary } from '@/api/types';
import { formatExact } from '@/lib/exact';
import { renderApp } from '@/test/render';
import { problem, server, signedIn, someone } from '@/test/server';
import { organisedEntrant } from '@/test/contestant';
import { CONTEST_API, standingList, taskList } from '@/test/organiser';
import { passTime, withFakeTimers } from '@/test/timers';

const FEED = '/orgs/acme/contests/spring/gradings';

const grading: Grading = {
  id: '0199a2c1-6b7e-7c3a-9f10-5d2e4b8a6c31',
  submission_number: 3,
  submitted_at: '2026-10-05T10:00:00Z',
  publication: 2,
  attempt: 1,
  latest: true,
  status: 'done',
  error: null,
  result: {
    stopped: null,
    tests: [
      {
        test: 'main/1',
        outcome: 'wrong_answer',
        values: { numbers: {}, texts: {} },
        credit: null,
        best: null,
      },
    ],
    values: { numbers: {}, texts: {} },
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
  automatic: false,
  limit: null,
  retry_limit: null,
  regrade: null,
  change: null,
  last_good: null,
  submitted_by: null,
};

const ada = { entrant: 'e-ada', entrant_name: 'ada', user_id: 11, username: 'ada' };
const lovelaces = {
  entrant: 'team-1',
  entrant_name: 'Lovelaces',
  user_id: 12,
  username: 'grace',
};

/** A first attempt that hit a system error, then its retry, still queued. */
const stuckFirst: FeedEntry = {
  task: 'sum',
  label: 'B',
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
  label: 'B',
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
  label: 'A',
  by: lovelaces,
  grading: { ...grading, id: 'g-sort-1', submission_number: 1 },
};
const cancelled: FeedEntry = {
  task: 'sort',
  label: 'A',
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

/** The first attempt once its retry is the latest. */
const superseded: FeedEntry = {
  ...stuckFirst,
  grading: { ...stuckFirst.grading, latest: false },
};

const feed = [retried, sortByTeam, superseded, cancelled];

/** A rejudge of sum that took 120 submissions: 4 went down, 2 now fail to compile, 1 went up. */
const REGRADE: RegradeSummary = {
  id: '0199a2c1-0000-7000-8000-0000000000aa',
  task: 'sum',
  label: 'B',
  cause: 'rejudge',
  publication: 3,
  started_at: '2026-10-12T14:00:00Z',
  started_by: 7,
  started_by_name: 'alice',
  total: 120,
  graded: 120,
  running: false,
  counts: {
    up: 1,
    down: 4,
    stopped: 2,
    unchanged: 113,
    new: 0,
    running: 0,
    failed: 0,
    over_limit: 0,
  },
};

/** ada's submission 3 to sum, which passed five tests before the regrade and now fails to compile. */
const nowStopped: FeedEntry = {
  task: 'sum',
  label: 'B',
  by: ada,
  grading: {
    ...grading,
    id: 'g-sum-regraded',
    attempt: 2,
    regrade: REGRADE.id,
    change: {
      change: 'stopped',
      earlier: {
        attempt: 1,
        points: '62.5',
        accepted: 5,
        tests: 8,
        stopped: null,
        values: {},
      },
      now: {
        attempt: 2,
        points: '0',
        accepted: 0,
        tests: 8,
        stopped: 'compile_error',
        values: {},
      },
    },
  },
};

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
    let standingsRead = false;
    server.use(
      signedIn,
      taskList,
      http.get(`${CONTEST_API}/organise/tasks`, () => {
        standingsRead = true;
        return HttpResponse.json([]);
      }),
      http.get(`${CONTEST_API}/gradings/queue`, () =>
        HttpResponse.json({ queued: 4, dispatched: 2, failed: 0 }),
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

    expect(team).toHaveTextContent('Lovelaces (grace)');
    expect(team).toHaveTextContent('WRONG ANSWER');
    expect(team).not.toHaveTextContent('wrong_answer');
    expect(
      within(team).getByRole('link', {
        name: 'Log of A submission 1 by Lovelaces (grace), attempt 1',
      }),
    ).toHaveAttribute(
      'href',
      '/api/v1/orgs/acme/contests/spring/tasks/sort/gradings/g-sort-1/log',
    );

    expect(standingsRead).toBe(false);
    expect(sortAda).toHaveTextContent('Cancelled');
    expect(sortAda).toHaveTextContent('The run did not report by its deadline.');
    expect(sortAda).toHaveTextContent(
      'Told the entrant: “Our grader broke; this one does not count against you.”',
    );
  });

  it("opens a submission's earlier attempts below its latest", async () => {
    server.use(signedIn, taskList);
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

  it('narrows the feed by task, status, entrant and who submitted, keeping each in the address', async () => {
    server.use(
      signedIn,
      taskList,
      http.get(`${CONTEST_API}/organise/entrants`, () =>
        HttpResponse.json([
          organisedEntrant({
            id: 'team-1',
            name: 'Lovelaces',
            display_name: 'Lovelaces',
            members: [
              { ...organisedEntrant().members[0]!, user_id: 12 },
              organisedEntrant().members[0]!,
            ],
          }),
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

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Entrant' }),
      'team-1',
    );
    await waitFor(() =>
      expect(asked.at(-1)).toBe('task=sort&entrant=team-1&status=cancelled'),
    );

    const username = screen.getByRole('textbox', { name: 'Submitted by' });
    expect(username).toHaveAccessibleDescription(
      'Finds the submissions one member of a team made.',
    );
    await user.type(username, 'ada');
    expect(asked.at(-1)).toBe('task=sort&entrant=team-1&status=cancelled');
    await user.click(screen.getByRole('button', { name: 'Filter' }));
    await waitFor(() =>
      expect(asked.at(-1)).toBe('task=sort&entrant=team-1&user=ada&status=cancelled'),
    );

    await user.click(screen.getByRole('link', { name: 'Clear filters' }));
    await waitFor(() => expect(router.state.location.search).toBe(''));
    expect(
      await screen.findByRole('rowgroup', { name: 'B submission 3 by ada' }),
    ).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Submitted by' })).toHaveValue('');
  });

  it('reads the filters from the address it was opened at', async () => {
    server.use(signedIn, taskList);
    const asked = feedAnswering(() => []);
    renderApp(`${FEED}?user=ada&status=system_error&status=bogus`);

    expect(await screen.findByText('No grading matches these filters.')).toBeVisible();
    expect(
      screen.getByRole('textbox', { name: 'Submitted by' }),
    ).not.toHaveAccessibleDescription();
    expect(asked).toEqual(['user=ada&status=system_error']);
    expect(screen.getByRole('textbox', { name: 'Submitted by' })).toHaveValue('ada');
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveValue(
      'system_error',
    );
  });

  it('keeps to the latest attempts once asked, and reads it from the address the contest page links to', async () => {
    server.use(signedIn, taskList);
    const asked = feedAnswering((query) =>
      query.get('latest') === 'true'
        ? feed.filter((entry) => entry.grading.latest)
        : feed,
    );
    const user = userEvent.setup();
    const { router } = renderApp(`${FEED}?status=system_error&latest=true`);

    await waitFor(() => expect(asked).toEqual(['status=system_error&latest=true']));
    const latest = screen.getByRole('checkbox', { name: 'Latest attempts only' });
    expect(latest).toBeChecked();
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveValue(
      'system_error',
    );

    await user.click(latest);
    await waitFor(() =>
      expect(router.state.location.search).toBe('?status=system_error'),
    );
    expect(asked.at(-1)).toBe('status=system_error');
    await user.click(screen.getByRole('checkbox', { name: 'Latest attempts only' }));
    await waitFor(() =>
      expect(router.state.location.search).toBe('?status=system_error&latest=true'),
    );
    await user.click(screen.getByRole('link', { name: 'Clear filters' }));
    await waitFor(() => expect(router.state.location.search).toBe(''));
    expect(
      screen.getByRole('checkbox', { name: 'Latest attempts only' }),
    ).not.toBeChecked();
  });

  it('counts the failed gradings beside the queue, and shows them on asking', async () => {
    server.use(
      signedIn,
      taskList,
      http.get(`${CONTEST_API}/gradings/queue`, () =>
        HttpResponse.json({ queued: 0, dispatched: 0, failed: 2 }),
      ),
    );
    const asked = feedAnswering(() => []);
    const user = userEvent.setup();
    renderApp(FEED);

    const depth = await screen.findByLabelText('Queue');
    await waitFor(() => expect(depth).toHaveTextContent('Failed2'));
    expect(depth).not.toHaveTextContent('waiting for you');
    expect(
      screen.getByText(/again once by itself\. If that fails too, it waits for you/),
    ).toBeVisible();
    await user.click(screen.getByRole('link', { name: 'Show the failed gradings' }));
    await waitFor(() => expect(asked.at(-1)).toBe('status=system_error&latest=true'));
    expect(screen.queryByRole('link', { name: 'Show the failed gradings' })).toBeNull();
    expect(
      screen.getByText(/again once by itself\. If that fails too, it waits for you/),
    ).toBeVisible();
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
    let queueReads = 0;
    server.use(
      signedIn,
      taskList,
      http.get(`${CONTEST_API}/gradings/queue`, () => {
        queueReads += 1;
        return HttpResponse.json({ queued: 0, dispatched: 0, failed: 0 });
      }),
      http.post(`${CONTEST_API}/tasks/:task/gradings/:grading/retry`, ({ params }) => {
        retriedAt.push(`${String(params.task)}/${String(params.grading)}`);
        const again = {
          ...sortByTeam.grading,
          id: 'g-sort-2',
          attempt: 2,
          status: 'queued' as const,
        };
        now = [
          { ...sortByTeam, grading: again },
          { ...sortByTeam, grading: { ...sortByTeam.grading, latest: false } },
        ];
        return HttpResponse.json(again);
      }),
    );
    feedAnswering(() => now);
    renderApp(FEED);

    const name = 'A submission 1 by Lovelaces (grace), attempt 1';
    expect(await screen.findByRole('button', { name: `Retry ${name}` })).toBeVisible();
    expect(screen.queryByRole('button', { name: `Cancel ${name}` })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: `Retry ${name}` }));
    const dialog = await screen.findByRole('dialog', {
      name: 'Grade submission 1 again?',
    });
    expect(dialog).toHaveTextContent(
      "Lovelaces (grace)'s submission 1 to sort runs again on the same version of the task it was graded on (publication 2). For when the grading itself went wrong, such as a system error. To grade it against the task as it is now, rejudge the task.",
    );
    expect(dialog).toHaveTextContent(
      'The new result replaces this one. This one stays in the list, marked as replaced.',
    );
    expect(dialog).toHaveTextContent(
      'Until the new run finishes, Lovelaces and the leaderboards keep seeing the current result.',
    );
    expect(retriedAt).toEqual([]);
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Grade it again' }),
    );

    const group = await screen.findByRole('rowgroup', {
      name: 'A submission 1 by Lovelaces (grace)',
    });
    await waitFor(() => expect(group).toHaveTextContent('Queued'));
    expect(retriedAt).toEqual(['sort/g-sort-1']);
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(queueReads).toBe(2));
    expect(
      within(group).getByRole('button', { name: 'Show earlier attempts (1)' }),
    ).toBeVisible();
  });

  it('cancels a system error with the sentence the entrant reads, once given', async () => {
    const sent: unknown[] = [];
    server.use(
      signedIn,
      taskList,
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
      name: 'Cancel submission 3?',
    });
    expect(dialog).toHaveTextContent(
      "ada's submission 3 to sum is not graded. ada reads the sentence below in place of a result",
    );
    const confirm = within(dialog).getByRole('button', {
      name: 'Cancel the submission',
    });
    expect(confirm).toBeDisabled();
    const field = within(dialog).getByRole('textbox', {
      name: /^What the entrant reads/,
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
      taskList,
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
      name: 'Cancel submission 3?',
    });
    await user.type(
      within(dialog).getByRole('textbox', { name: /^What the entrant reads/ }),
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

  it('offers Rejudge without a filter, asking which task first and saying what it does', async () => {
    const rejudgedAt: string[] = [];
    server.use(
      signedIn,
      taskList,
      http.post(`${CONTEST_API}/tasks/:task/rejudge`, ({ params }) => {
        rejudgedAt.push(String(params.task));
        return HttpResponse.json({
          publication: 2,
          queued: 3,
          cancelled: 1,
          left_running: 0,
          over_limit: 2,
          regrade: REGRADE.id,
        });
      }),
    );
    feedAnswering(() => [stuckFirst]);
    const user = userEvent.setup();
    renderApp(FEED);

    await screen.findByRole('table', { name: 'Gradings' });
    await user.click(screen.getByRole('button', { name: 'Rejudge a task' }));
    const dialog = await screen.findByRole('dialog', {
      name: 'Grade every submission to a task again?',
    });
    const confirm = within(dialog).getByRole('button', { name: 'Rejudge' });
    expect(confirm).toBeDisabled();
    expect(dialog).toHaveTextContent('Choose the task to rejudge.');
    await user.selectOptions(
      within(dialog).getByRole('combobox', { name: 'Task' }),
      'sum',
    );
    expect(dialog).toHaveTextContent(
      'Every submission to B · sum runs again on the task as it is now, its latest publication.',
    );
    await user.click(confirm);

    const outcome = await screen.findByText(/rejudged against publication 2/);
    expect(outcome).toHaveTextContent(
      'B · sum rejudged against publication 2: 3 attempts queued.',
    );
    expect(
      screen.getByText('1 attempt against an older publication cancelled first.'),
    ).toBeVisible();
    expect(
      screen.getByText(
        '2 submissions ended not graded, since their entrants had reached the task’s limit on submissions.',
      ),
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'See what the rejudge changes' }),
    ).toHaveAttribute('href', `${FEED}?regrade=${REGRADE.id}`);
    expect(rejudgedAt).toEqual(['sum']);
  });

  it('says so when the task has nothing published to rejudge against', async () => {
    server.use(
      signedIn,
      taskList,
      http.post(`${CONTEST_API}/tasks/:task/rejudge`, () => problem(404, 'not_found')),
    );
    feedAnswering(() => []);
    const user = userEvent.setup();
    renderApp(`${FEED}?task=sort`);

    await user.click(await screen.findByRole('button', { name: 'Rejudge a task' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('combobox', { name: 'Task' })).toHaveValue('sort');
    await user.click(within(dialog).getByRole('button', { name: 'Rejudge' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Nothing to rejudge against',
    );
  });

  it('offers nothing on an earlier attempt a status filter shows alone, and marks it earlier', async () => {
    server.use(signedIn, taskList);
    const asked = feedAnswering((query) =>
      feed.filter((entry) => entry.grading.status === query.get('status')),
    );
    renderApp(`${FEED}?status=system_error`);

    const sum = await screen.findByRole('rowgroup', { name: 'B submission 3 by ada' });
    expect(asked).toEqual(['status=system_error']);
    expect(sum).toHaveTextContent('An earlier attempt; the latest is not among these.');
    expect(within(sum).queryByRole('button', { name: /^(Retry|Cancel)/ })).toBeNull();
  });

  it('offers no Retry on a submission staff cancelled, since a cancel is final', async () => {
    server.use(signedIn, taskList);
    feedAnswering(() => [cancelled, sortByTeam]);
    renderApp(FEED);

    expect(
      await screen.findByRole('button', {
        name: 'Retry A submission 1 by Lovelaces (grace), attempt 1',
      }),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Retry A submission 1 by ada, attempt 1' }),
    ).toBeNull();
  });

  it('says which result stands while a broken latest attempt has none, and offers nothing to change it', async () => {
    server.use(signedIn, taskList);
    feedAnswering(() => [
      {
        ...retried,
        grading: { ...stuckFirst.grading, id: 'g-sum-2', attempt: 2, last_good: 1 },
      },
      {
        ...cancelled,
        grading: { ...cancelled.grading, attempt: 2, last_good: 1 },
      },
    ]);
    renderApp(FEED);

    const broken = await screen.findByRole('rowgroup', {
      name: 'B submission 3 by ada',
    });
    expect(broken).toHaveTextContent(
      "The entrant and the leaderboards see attempt 1's result until a newer attempt finishes with one.",
    );
    const ended = screen.getByRole('rowgroup', { name: 'A submission 1 by ada' });
    expect(ended).toHaveTextContent(
      "The entrant and the leaderboards keep attempt 1's result.",
    );
    expect(screen.queryByRole('button', { name: /last good result/ })).toBeNull();
    expect(screen.queryByText(/last good result/)).toBeNull();
  });

  it('says nothing of an earlier result where no attempt has one', async () => {
    server.use(signedIn, taskList);
    feedAnswering(() => [stuckFirst]);
    renderApp(FEED);

    const broken = await screen.findByRole('rowgroup', {
      name: 'B submission 3 by ada',
    });
    expect(broken).toHaveTextContent('System error');
    expect(broken).not.toHaveTextContent('The entrant and the leaderboards');
  });

  it('marks an attempt Unicon made by itself after the one before failed', async () => {
    server.use(signedIn, taskList);
    feedAnswering(() => [
      { ...retried, grading: { ...retried.grading, automatic: true } },
      superseded,
    ]);
    const user = userEvent.setup();
    renderApp(FEED);

    const group = await screen.findByRole('rowgroup', {
      name: 'B submission 3 by ada',
    });
    expect(group).toHaveTextContent('Retried by Unicon after attempt 1 failed');
    await user.click(within(group).getByRole('button', { name: /earlier attempts/ }));
    const [, first] = within(group).getAllByRole('row');
    expect(first).not.toHaveTextContent('Retried by Unicon');
  });

  it('says a cancel keeps the earlier result, and that its sentence stays with the organisers', async () => {
    server.use(signedIn, taskList);
    feedAnswering(() => [
      { ...retried, grading: { ...stuckFirst.grading, attempt: 2, last_good: 1 } },
    ]);
    const user = userEvent.setup();
    renderApp(FEED);

    await user.click(
      await screen.findByRole('button', {
        name: 'Cancel B submission 3 by ada, attempt 2',
      }),
    );
    const asked = await screen.findByRole('dialog', {
      name: 'Keep submission 3’s earlier result?',
    });
    expect(asked).toHaveTextContent(
      "The grading of ada's submission 3 to sum that failed is stopped, and the submission keeps the result it had, which ada and the leaderboards go on seeing.",
    );
    expect(
      within(asked).getByRole('button', { name: 'Keep the earlier result' }),
    ).toBeVisible();
    expect(
      within(asked).queryByRole('button', { name: 'Cancel the submission' }),
    ).toBeNull();
    expect(within(asked).getByLabelText(/^Why it was cancelled/)).toBeVisible();
    expect(within(asked).queryByLabelText(/^What the entrant reads/)).toBeNull();
  });

  it('says a retry leaves the earlier result standing until it finishes with one', async () => {
    server.use(signedIn, taskList);
    feedAnswering(() => [
      { ...retried, grading: { ...stuckFirst.grading, attempt: 2, last_good: 1 } },
    ]);
    const user = userEvent.setup();
    renderApp(FEED);

    await user.click(
      await screen.findByRole('button', {
        name: 'Retry B submission 3 by ada, attempt 2',
      }),
    );
    const asked = await screen.findByRole('dialog', {
      name: 'Grade submission 3 again?',
    });

    expect(asked).toHaveTextContent(
      'The new result counts in place of this grading, which has none. This one stays in the list, marked as replaced.',
    );
    expect(asked).toHaveTextContent(
      'Until the new run finishes, ada and the leaderboards keep seeing the current result.',
    );
  });

  it('names an attempt over the limit, and says before a retry that it would end so and why', async () => {
    server.use(signedIn, taskList);
    const over: FeedEntry = {
      ...retried,
      grading: {
        ...stuckFirst.grading,
        attempt: 2,
        status: 'over_limit',
        error: null,
        limit: 10,
        retry_limit: 10,
      },
    };
    feedAnswering(() => [over]);
    const user = userEvent.setup();
    renderApp(FEED);

    const table = await screen.findByRole('table', { name: 'Gradings' });
    const row = await within(table).findByRole('rowgroup', {
      name: 'B submission 3 by ada',
    });
    expect(row).toHaveTextContent('Over the limit');
    expect(row).toHaveTextContent(
      'Not graded: the entrant had reached the limit of 10 submissions for this task.',
    );

    await user.click(
      within(row).getByRole('button', {
        name: 'Retry B submission 3 by ada, attempt 2',
      }),
    );
    const asked = await screen.findByRole('dialog', {
      name: 'Grade submission 3 again?',
    });
    expect(asked).toHaveTextContent(
      'A retry now ends not graded: ada has reached the limit of 10 submissions for sum, counting the submissions with a result and those waiting.',
    );
    expect(asked).not.toHaveTextContent('runs again on the same version');
  });

  it('keeps a refused retry in the dialog with its sentence', async () => {
    server.use(
      signedIn,
      taskList,
      http.post(`${CONTEST_API}/tasks/:task/gradings/:grading/retry`, () =>
        problem(409, 'conflict', { detail: 'A later attempt of it is there.' }),
      ),
    );
    feedAnswering(() => [sortByTeam]);
    const user = userEvent.setup();
    renderApp(FEED);

    await user.click(
      await screen.findByRole('button', {
        name: 'Retry A submission 1 by Lovelaces (grace), attempt 1',
      }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Grade submission 1 again?',
    });
    await user.click(within(dialog).getByRole('button', { name: 'Grade it again' }));

    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('Not the attempt to retry');
    expect(alert).toHaveTextContent('A later attempt of it is there.');
  });

  it('offers an observer nothing to do', async () => {
    server.use(
      signedInAs([
        { names: { org: 'acme', contest: null, task: null }, role: 'observer' },
      ]),
      taskList,
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
      taskList,
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
        name: 'Retry A submission 1 by Lovelaces (grace), attempt 1',
      }),
    ).toBeNull();
  });
});

describe('what a regrade changed', () => {
  function regrades(list: RegradeSummary[]) {
    let shown = list;
    const dismissed: string[] = [];
    server.use(
      http.get(`${CONTEST_API}/gradings/regrades`, () => HttpResponse.json(shown)),
      http.post(
        `${CONTEST_API}/tasks/:task/regrades/:regrade/dismiss`,
        ({ params }) => {
          dismissed.push(`${String(params['task'])} ${String(params['regrade'])}`);
          shown = shown.filter((found) => found.id !== params['regrade']);
          return new HttpResponse(null, { status: 204 });
        },
      ),
    );
    return dismissed;
  }

  it('sums up each task’s latest regrade, each count a link to those submissions', async () => {
    server.use(signedIn, taskList);
    regrades([REGRADE]);
    const asked = feedAnswering((query) =>
      query.get('change') === 'stopped' ? [nowStopped, nowStopped] : feed,
    );
    renderApp(FEED);

    const summary = await screen.findByRole('listitem', { name: 'Regrade of B' });
    await waitFor(() =>
      expect(summary).toHaveTextContent(
        'Regrade of B: 120 graded · 4 went down · 2 now fail to compile · 1 went up',
      ),
    );
    expect(summary).toHaveTextContent(
      /After a rejudge by alice, .*, against publication 3\./,
    );
    const link = (name: string) => within(summary).getByRole('link', { name });
    expect(link('120 graded')).toHaveAttribute('href', `${FEED}?regrade=${REGRADE.id}`);
    expect(link('4 went down')).toHaveAttribute(
      'href',
      `${FEED}?regrade=${REGRADE.id}&change=down`,
    );
    expect(link('2 now fail to compile')).toHaveAttribute(
      'href',
      `${FEED}?regrade=${REGRADE.id}&change=stopped`,
    );
    expect(asked).toContain(`regrade=${REGRADE.id}&change=stopped`);
  });

  it('lists a regrade’s submissions with their results before and after it', async () => {
    server.use(signedIn, taskList);
    regrades([REGRADE]);
    const asked = feedAnswering((query) =>
      query.get('regrade') === null ? feed : [nowStopped],
    );
    renderApp(`${FEED}?regrade=${REGRADE.id}&change=stopped`);

    expect(
      await screen.findByRole('heading', { name: 'What the regrade of B changed' }),
    ).toBeVisible();
    const table = await screen.findByRole('table', { name: 'Gradings' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(expect.arrayContaining(['Before the regrade', 'After the regrade']));
    const row = within(table).getByRole('rowgroup', { name: 'B submission 3 by ada' });
    expect(row).toHaveTextContent(`${formatExact('62.5', 2)} points`);
    expect(row).toHaveTextContent('COMPILE ERROR, 0 points');
    expect(row).toHaveTextContent('Now fails to compile');
    expect(asked).toContain(`regrade=${REGRADE.id}&change=stopped`);
    expect(screen.queryByRole('combobox', { name: 'Status' })).toBeNull();
    expect(screen.getByRole('combobox', { name: 'What the regrade did' })).toHaveValue(
      'stopped',
    );
    expect(screen.getByRole('link', { name: 'Show every grading' })).toBeVisible();
  });

  it('says what went down on a task with no points, by the values that decided it (#448)', async () => {
    const side = { points: null, accepted: 5, tests: 5, stopped: null };
    const slower: FeedEntry = {
      ...nowStopped,
      grading: {
        ...nowStopped.grading,
        change: {
          change: 'down',
          earlier: { ...side, attempt: 1, values: { time_ms: '28', memory_kb: '900' } },
          now: { ...side, attempt: 2, values: { time_ms: '40', memory_kb: '900' } },
        },
      },
    };
    server.use(
      signedIn,
      taskList,
      http.get(`${CONTEST_API}/tasks/sum/publications`, () =>
        HttpResponse.json([
          {
            number: slower.grading.publication,
            version: 'abc1234',
            at: '2026-10-12T13:00:00Z',
            grading_changed: true,
            changes: [],
            meanings: [
              {
                name: 'time_ms',
                title: 'Run time',
                unit: 'ms',
                fold: 'max',
                better: 'lower',
              },
            ],
          },
        ]),
      ),
    );
    regrades([REGRADE]);
    feedAnswering((query) => (query.get('regrade') === null ? feed : [slower]));
    renderApp(`${FEED}?regrade=${REGRADE.id}&change=down`);

    const table = await screen.findByRole('table', { name: 'Gradings' });
    const row = within(table).getByRole('rowgroup', { name: 'B submission 3 by ada' });
    await waitFor(() =>
      expect(row).toHaveTextContent('5 of 5 tests passed, run time 28 ms'),
    );
    expect(row).toHaveTextContent('5 of 5 tests passed, run time 40 msWent down');
    expect(row).not.toHaveTextContent(/memory/);
  });

  it('takes a summary off for everyone once a manager dismisses it', async () => {
    server.use(signedIn, taskList);
    const dismissed = regrades([REGRADE]);
    feedAnswering(() => feed);
    const user = userEvent.setup();
    renderApp(FEED);

    const summary = await screen.findByRole('listitem', { name: 'Regrade of B' });
    await user.click(
      within(summary).getByRole('button', { name: 'Dismiss the regrade of B' }),
    );

    await waitFor(() =>
      expect(screen.queryByRole('listitem', { name: 'Regrade of B' })).toBeNull(),
    );
    expect(dismissed).toEqual([`sum ${REGRADE.id}`]);
  });

  it('offers an observer the summary without Dismiss, and says while it still runs', async () => {
    server.use(
      signedInAs([
        { names: { org: 'acme', contest: null, task: null }, role: 'observer' },
      ]),
      taskList,
    );
    regrades([
      {
        ...REGRADE,
        cause: 'save',
        running: true,
        graded: 100,
        counts: { ...REGRADE.counts, unchanged: 93, running: 20 },
      },
    ]);
    feedAnswering(() => feed);
    renderApp(FEED);

    const summary = await screen.findByRole('listitem', { name: 'Regrade of B' });
    expect(summary).toHaveTextContent(
      /After a save that changed how the task grades, .*, against publication 3\. Still running: 20 submissions are being graded\./,
    );
    expect(within(summary).queryByRole('button', { name: /Dismiss/ })).toBeNull();
  });

  it('shows on the contest page too', async () => {
    server.use(signedIn, standingList, taskList);
    regrades([REGRADE]);
    feedAnswering(() => []);
    renderApp('/orgs/acme/contests/spring');

    expect(
      await screen.findByRole('listitem', { name: 'Regrade of B' }),
    ).toHaveTextContent(/120 graded · 4 went down/);
  });
});

describe('the feed without the stream', () => {
  withFakeTimers();

  it('reads the feed and the queue again every ten seconds while one is to finish', async () => {
    let now: FeedEntry[] = [retried];
    let depth = { queued: 1, dispatched: 0, failed: 0 };
    server.use(
      signedIn,
      taskList,
      http.get(`${CONTEST_API}/gradings/queue`, () => HttpResponse.json(depth)),
    );
    feedAnswering(() => now);
    renderApp(FEED);

    const sum = await screen.findByRole('rowgroup', { name: 'B submission 3 by ada' });
    now = [{ ...retried, grading: { ...retried.grading, status: 'done' } }];
    depth = { queued: 0, dispatched: 0, failed: 0 };
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
    let depth = { queued: 1, dispatched: 0, failed: 0 };
    server.use(
      signedIn,
      taskList,
      http.get(`${CONTEST_API}/gradings/queue`, () => HttpResponse.json(depth)),
    );
    feedAnswering(() => now);
    renderApp(FEED);

    const sum = await screen.findByRole('rowgroup', { name: 'B submission 3 by ada' });
    expect(sum).toHaveTextContent('Queued');
    expect(screen.getByLabelText('Queue')).toHaveTextContent('Queued1');
    FakeSource.last?.onopen?.();

    now = [{ ...retried, grading: { ...retried.grading, status: 'running' } }];
    depth = { queued: 0, dispatched: 0, failed: 0 };
    FakeSource.last?.emit('grading');

    await waitFor(() => expect(sum).toHaveTextContent('Running'));
    await waitFor(() =>
      expect(screen.getByLabelText('Queue')).toHaveTextContent('Queued0'),
    );
  });
});
