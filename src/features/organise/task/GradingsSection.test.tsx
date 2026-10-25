import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@/test/user-event';
import { http, HttpResponse } from 'msw';
import type { FeedEntry, Grading, OrganisedSubmission, Submitter } from '@/api/types';
import { renderApp } from '@/test/render';
import { problem, server, signedIn, someone } from '@/test/server';
import {
  TASK_API,
  publicationList,
  repoFiles,
  runsResult,
  taskState,
} from '@/test/organiser';

const TASK = '/orgs/acme/contests/spring/tasks/sum/gradings';

const ada: Submitter = {
  entrant: 'e-ada',
  entrant_name: 'ada',
  user_id: 11,
  username: 'ada',
};

/** A grading of sum, the contest's task B, as the route answers it. */
function entry(grading: Grading, by: Submitter = ada): FeedEntry {
  return { task: 'sum', label: 'B', by, grading };
}

/** The task's gradings as the route answers them, each by ada. */
function asEntries(gradings: Grading[]) {
  return HttpResponse.json(gradings.map((grading) => entry(grading)));
}

const stuck: Grading = {
  id: '0199a2c1-6b7e-7c3a-9f10-5d2e4b8a6c31',
  submission_number: 3,
  submitted_at: '2026-09-26T10:00:00Z',
  publication: 2,
  attempt: 1,
  latest: true,
  status: 'system_error',
  error: 'The grading machine lost its run before it began.',
  result: null,
  log: false,
  progress: null,
  queued_at: '2026-09-26T10:00:00Z',
  dispatched_at: '2026-09-26T10:00:01Z',
  started_at: null,
  finished_at: null,
  deadline_at: null,
  cancel_reason: null,
  automatic: false,
  early: null,
  pipeline: 'early',
  limit: null,
  retry_limit: null,
  regrade: null,
  change: null,
  last_good: null,
  submitted_by: null,
};

const waiting: Grading = {
  ...stuck,
  id: '0199a2c1-6b7e-7c3a-9f10-5d2e4b8a6c32',
  submission_number: 4,
  status: 'dispatched',
  error: null,
};

describe("the task's gradings", () => {
  it('shows each grading with where it stands and why it failed', async () => {
    server.use(
      signedIn,
      taskState,
      publicationList,
      ...repoFiles,
      http.get(`${TASK_API}/gradings`, () => asEntries([waiting, stuck])),
    );
    renderApp(TASK);

    const table = await screen.findByRole('table', { name: 'Gradings' });
    const [, newest, oldest] = within(table).getAllByRole('row');
    expect(newest).toHaveTextContent('Submission 4');
    expect(newest).toHaveTextContent('Waiting for a machine');
    expect(oldest).toHaveTextContent('System error');
    expect(oldest).toHaveTextContent(
      'The grading machine lost its run before it began.',
    );
  });

  it('shows what a finished grading came to', async () => {
    const done = (number: number, made: NonNullable<Grading['result']>): Grading => ({
      ...stuck,
      id: `0199a2c1-6b7e-7c3a-9f10-5d2e4b8a6c4${String(number)}`,
      submission_number: number,
      status: 'done',
      error: null,
      result: made,
    });
    server.use(
      signedIn,
      taskState,
      publicationList,
      ...repoFiles,
      http.get(`${TASK_API}/gradings`, () =>
        asEntries([
          done(7, runsResult(['skipped', 'skipped'], { compile: 'compile_error' })),
          done(6, runsResult(['accepted', 'accepted'], { compile: 'accepted' })),
          done(5, runsResult(['accepted', 'time_limit', 'wrong_answer'])),
        ]),
      ),
    );
    renderApp(TASK);

    const table = await screen.findByRole('table', { name: 'Gradings' });
    const [, stopped, passed, failed] = within(table).getAllByRole('row');
    expect(stopped).toHaveTextContent('COMPILE ERROR');
    expect(passed).toHaveTextContent('ACCEPTED');
    expect(failed).toHaveTextContent('TIME LIMIT');
    expect(within(table).queryByRole('columnheader', { name: 'Stage' })).toBeNull();
  });

  it('links each grading whose run wrote a log to it, in a tab of its own', async () => {
    const logged: Grading = {
      ...stuck,
      id: '0199a2c1-6b7e-7c3a-9f10-5d2e4b8a6c33',
      submission_number: 5,
      status: 'done',
      error: null,
      log: true,
    };
    server.use(
      signedIn,
      taskState,
      publicationList,
      ...repoFiles,
      http.get(`${TASK_API}/gradings`, () => asEntries([logged, waiting])),
    );
    renderApp(TASK);

    const link = await screen.findByRole('link', {
      name: 'Log of B submission 5 by ada, attempt 1',
    });
    expect(link).toHaveAttribute(
      'href',
      `/api/v1/orgs/acme/contests/spring/tasks/sum/gradings/${logged.id}/log`,
    );
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(
      screen.queryByRole('link', { name: 'Log of B submission 4 by ada, attempt 1' }),
    ).toBeNull();
  });

  it('retries a stuck grading after asking, and reads the list again', async () => {
    let listed = [stuck];
    const retried: string[] = [];
    server.use(
      signedIn,
      taskState,
      publicationList,
      ...repoFiles,
      http.get(`${TASK_API}/gradings`, () => asEntries(listed)),
      http.post(`${TASK_API}/gradings/:grading/retry`, ({ params }) => {
        retried.push(String(params.grading));
        const again = {
          ...stuck,
          id: 'new',
          attempt: 2,
          status: 'queued' as const,
          error: null,
        };
        listed = [
          again,
          { ...stuck, latest: false, finished_at: '2026-09-26T10:05:00Z' },
        ];
        return HttpResponse.json(again);
      }),
    );
    renderApp(TASK);

    await userEvent.click(
      await screen.findByRole('button', {
        name: 'Retry B submission 3 by ada, attempt 1',
      }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Grade submission 3 again?',
    });
    expect(dialog).toHaveTextContent(
      "ada's submission 3 to sum runs again on the same version of the task it was graded on (publication 2).",
    );
    expect(retried).toEqual([]);
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Grade it again' }),
    );

    expect(
      await screen.findByRole('button', { name: 'Show earlier attempts (1)' }),
    ).toBeVisible();
    expect(retried).toEqual([stuck.id]);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Cancel B submission 3 by ada, attempt 2' }),
    ).toBeNull();
  });

  it('offers Cancel on a system error alone', async () => {
    const finished: Grading = {
      ...stuck,
      id: '0199a2c1-6b7e-7c3a-9f10-5d2e4b8a6c35',
      submission_number: 5,
      status: 'done',
      error: null,
    };
    server.use(
      signedIn,
      taskState,
      publicationList,
      ...repoFiles,
      http.get(`${TASK_API}/gradings`, () => asEntries([finished, waiting, stuck])),
    );
    renderApp(TASK);

    expect(
      await screen.findByRole('button', {
        name: 'Cancel B submission 3 by ada, attempt 1',
      }),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Cancel B submission 4 by ada, attempt 1' }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Cancel B submission 5 by ada, attempt 1' }),
    ).toBeNull();
  });

  it('cancels only once asked, with the sentence the entrant reads', async () => {
    const cancelled: { grading: string; body: unknown }[] = [];
    server.use(
      signedIn,
      taskState,
      publicationList,
      ...repoFiles,
      http.get(`${TASK_API}/gradings`, () => asEntries([stuck])),
      http.post(`${TASK_API}/gradings/:grading/cancel`, async ({ params, request }) => {
        cancelled.push({ grading: String(params.grading), body: await request.json() });
        return HttpResponse.json({
          ...stuck,
          status: 'cancelled',
          cancel_reason: 'The checker crashed.',
        });
      }),
    );
    renderApp(TASK);

    const cancel = await screen.findByRole('button', {
      name: 'Cancel B submission 3 by ada, attempt 1',
    });
    await userEvent.click(cancel);
    const first = await screen.findByRole('dialog', {
      name: 'Cancel submission 3?',
    });
    await userEvent.click(within(first).getByRole('button', { name: 'Not now' }));
    expect(cancelled).toEqual([]);

    await userEvent.click(cancel);
    const dialog = await screen.findByRole('dialog', {
      name: 'Cancel submission 3?',
    });
    expect(dialog).toHaveTextContent("ada's submission 3 to sum is not graded.");
    const confirm = within(dialog).getByRole('button', {
      name: 'Cancel the submission',
    });
    expect(confirm).toBeDisabled();
    const field = within(dialog).getByRole('textbox', {
      name: /What the entrant reads/,
    });
    expect(field).toBeRequired();
    expect(field).toHaveAttribute('maxlength', '500');
    await userEvent.type(field, '   ');
    expect(confirm).toBeDisabled();
    await userEvent.type(field, 'The checker crashed. ');
    await userEvent.click(confirm);

    await expect
      .poll(() => cancelled)
      .toEqual([{ grading: stuck.id, body: { reason: 'The checker crashed.' } }]);
  });

  it("shows a cancelled grading's sentence", async () => {
    server.use(
      signedIn,
      taskState,
      publicationList,
      ...repoFiles,
      http.get(`${TASK_API}/gradings`, () =>
        asEntries([
          { ...stuck, status: 'cancelled', cancel_reason: 'The checker crashed.' },
        ]),
      ),
    );
    renderApp(TASK);

    const table = await screen.findByRole('table', { name: 'Gradings' });
    expect(table).toHaveTextContent('Cancelled');
    expect(table).toHaveTextContent('Told the entrant: “The checker crashed.”');
  });

  it.each([
    ['invalid_reason', 422, {}, 'That sentence will not do'],
    ['wrong_status', 409, { current: 'done' }, 'It is no longer a system error'],
    ['conflict', 409, {}, 'A later attempt is there'],
  ])(
    'shows a refused cancel, %s, with its sentence',
    async (code, status, extra, title) => {
      server.use(
        signedIn,
        taskState,
        publicationList,
        ...repoFiles,
        http.get(`${TASK_API}/gradings`, () => asEntries([stuck])),
        http.post(`${TASK_API}/gradings/:grading/cancel`, () =>
          problem(status, code, extra),
        ),
      );
      renderApp(TASK);

      await userEvent.click(
        await screen.findByRole('button', {
          name: 'Cancel B submission 3 by ada, attempt 1',
        }),
      );
      const dialog = await screen.findByRole('dialog');
      await userEvent.type(
        within(dialog).getByRole('textbox', { name: /What the entrant reads/ }),
        'The checker crashed.',
      );
      await userEvent.click(
        within(dialog).getByRole('button', { name: 'Cancel the submission' }),
      );

      const alert = await within(dialog).findByRole('alert');
      expect(alert).toHaveTextContent(title);
      expect(alert).toHaveTextContent(`${code} detail`);
      if (code === 'wrong_status') expect(alert).toHaveTextContent('It is done now.');
    },
  );

  it("lists a submission's attempts together, the earlier ones to read", async () => {
    const second: Grading = {
      ...stuck,
      id: '0199a2c1-6b7e-7c3a-9f10-5d2e4b8a6c50',
      attempt: 2,
      publication: 3,
      status: 'done',
      error: null,
      result: runsResult([], { compile: 'compile_error' }),
    };
    server.use(
      signedIn,
      taskState,
      publicationList,
      ...repoFiles,
      http.get(`${TASK_API}/gradings`, () =>
        asEntries([second, waiting, { ...stuck, latest: false }]),
      ),
    );
    renderApp(TASK);

    const table = await screen.findByRole('table', { name: 'Gradings' });
    const groups = within(table).getAllByRole('rowgroup').slice(1);
    expect(groups.map((group) => group.getAttribute('aria-label'))).toEqual([
      'B submission 3 by ada',
      'B submission 4 by ada',
    ]);
    const third = within(table).getByRole('rowgroup', {
      name: 'B submission 3 by ada',
    });
    expect(within(third).getAllByRole('row')).toHaveLength(1);
    expect(third).toHaveTextContent('COMPILE ERROR');
    expect(third).toHaveTextContent('publication 3');

    const toggle = within(third).getByRole('button', {
      name: 'Show earlier attempts (1)',
    });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toggle);

    const earlier = within(third).getAllByRole('row')[1];
    if (earlier === undefined) throw new Error('no earlier attempt shown');
    expect(earlier).toHaveTextContent('Submission 3, replaced');
    expect(earlier).toHaveTextContent('System error');
    expect(earlier).toHaveTextContent(
      'The grading machine lost its run before it began.',
    );
    expect(within(earlier).queryByRole('button')).toBeNull();
    expect(
      within(third).getByRole('button', { name: 'Hide earlier attempts (1)' }),
    ).toHaveAttribute('aria-expanded', 'true');
  });

  it("keeps two submitters' submission 1 apart, made in the same second", async () => {
    const theirs: Grading = {
      ...stuck,
      id: '0199a2c1-6b7e-7c3a-9f10-5d2e4b8a6c60',
      submission_number: 1,
      status: 'done',
      error: null,
    };
    const ours: Grading = {
      ...theirs,
      id: '0199a2c1-6b7e-7c3a-9f10-5d2e4b8a6c61',
      latest: false,
      status: 'system_error',
      error: 'The grading machine lost its run before it began.',
    };
    const oursAgain: Grading = {
      ...ours,
      id: '0199a2c1-6b7e-7c3a-9f10-5d2e4b8a6c62',
      attempt: 2,
      latest: true,
      status: 'queued',
      error: null,
    };
    const grace: Submitter = {
      entrant: 'e-grace',
      entrant_name: 'grace',
      user_id: 12,
      username: 'grace',
    };
    server.use(
      signedIn,
      taskState,
      publicationList,
      ...repoFiles,
      http.get(`${TASK_API}/gradings`, () =>
        HttpResponse.json([entry(theirs, grace), entry(oursAgain), entry(ours)]),
      ),
    );
    renderApp(TASK);

    const table = await screen.findByRole('table', { name: 'Gradings' });
    const first = within(table).getByRole('rowgroup', {
      name: 'B submission 1 by grace',
    });
    const second = within(table).getByRole('rowgroup', {
      name: 'B submission 1 by ada',
    });
    expect(within(first).getAllByRole('row')).toHaveLength(1);
    expect(
      within(first).queryByRole('button', { name: /earlier attempts/ }),
    ).toBeNull();
    expect(
      within(second).getByRole('button', { name: 'Show earlier attempts (1)' }),
    ).toBeVisible();
    expect(second).toHaveTextContent('Queued');
  });

  it('rejudges the whole task after saying what that does', async () => {
    let reads = 0;
    let rejudged = 0;
    server.use(
      signedIn,
      taskState,
      publicationList,
      ...repoFiles,
      http.get(`${TASK_API}/gradings`, () => {
        reads += 1;
        return asEntries([stuck]);
      }),
      http.post(`${TASK_API}/rejudge`, () => {
        rejudged += 1;
        return HttpResponse.json({
          publication: 2,
          queued: 3,
          cancelled: 1,
          left_running: 0,
        });
      }),
    );
    renderApp(TASK);

    await screen.findByRole('table', { name: 'Gradings' });
    await userEvent.click(screen.getByRole('button', { name: 'Rejudge' }));
    const dialog = await screen.findByRole('dialog', {
      name: 'Grade every submission to B · sum again?',
    });
    expect(dialog).toHaveTextContent(
      'Every submission to B · sum runs again on the task as it is now, its latest publication.',
    );
    expect(rejudged).toBe(0);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Rejudge' }));

    const status = await screen.findByText(/rejudged against publication 2/);
    expect(status).toHaveTextContent(
      'B · sum rejudged against publication 2: 3 attempts queued.',
    );
    expect(
      screen.getByText('1 attempt against an older publication cancelled first.'),
    ).toBeVisible();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(rejudged).toBe(1);
    await expect.poll(() => reads).toBe(2);
  });

  it('says why a task with nothing published cannot be rejudged', async () => {
    server.use(
      signedIn,
      taskState,
      publicationList,
      ...repoFiles,
      http.post(`${TASK_API}/rejudge`, () => problem(404, 'not_found')),
    );
    renderApp(TASK);

    await userEvent.click(await screen.findByRole('button', { name: 'Rejudge' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Rejudge' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Nothing to rejudge against',
    );
  });

  it('offers an observer no controls', async () => {
    server.use(
      http.get('/api/v1/me', () =>
        HttpResponse.json({
          ...someone,
          roles: [
            {
              names: { org: 'acme', contest: 'spring', task: 'sum' },
              role: 'observer',
            },
          ],
        }),
      ),
      taskState,
      publicationList,
      ...repoFiles,
      http.get(`${TASK_API}/gradings`, () => asEntries([stuck])),
    );
    renderApp(TASK);

    expect(await screen.findByText('System error')).toBeVisible();
    expect(screen.queryByRole('button', { name: /Retry/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Rejudge' })).toBeNull();
  });
});

describe("the organisers' scored view of a submission", () => {
  const done: Grading = {
    ...stuck,
    status: 'done',
    error: null,
    result: runsResult(['accepted']),
    finished_at: '2026-09-26T10:01:00Z',
  };
  const filledIn: OrganisedSubmission = {
    number: 3,
    submitted_at: '2026-09-26T10:00:00Z',
    grading: {
      id: done.id,
      attempt: 1,
      status: 'done',
      stopped: null,
      outcome: 'accepted',
      values: { numbers: {}, texts: {} },
      reason: null,
      limit: null,
      compiled: null,
      facts: {},
      once: { reports: {}, texts: {} },
      run_values: [
        {
          name: 'score',
          number: '100',
          text: null,
          waiting: false,
          self_reported: false,
          show: 'after_close',
          runs: ['run-1'],
          values: [],
          facts: [],
        },
      ],
      runs: [
        {
          group: 'main',
          place: 1,
          id: 'run-1',
          dropped: false,
          key: {},
          titles: ['Small grid'],
          verdict: 'accepted',
          passed: 1,
          reports: { time_ms: '12' },
          texts: {},
          label: null,
          message: null,
        },
      ],
      meanings: [],
      groups: [],
    },
  };

  it('opens beside a grading, as its row reads it with everything filled in', async () => {
    const asked: URLSearchParams[] = [];
    server.use(
      signedIn,
      taskState,
      publicationList,
      ...repoFiles,
      http.get(`${TASK_API}/gradings`, () => asEntries([done])),
      http.get(`${TASK_API}/organise/submissions/:number`, ({ request, params }) => {
        asked.push(new URL(request.url).searchParams);
        return params['number'] === '3'
          ? HttpResponse.json(filledIn)
          : problem(404, 'not_found');
      }),
    );
    const user = userEvent.setup();
    renderApp(TASK);

    await user.click(
      await screen.findByRole('button', { name: 'Scored view of submission 3' }),
    );

    const view = await screen.findByRole('region', { name: 'Submission 3, scored' });
    expect(asked[0]?.get('entrant')).toBe('e-ada');
    const main = within(view).getByRole('region', { name: 'Group main' });
    expect(main).toHaveTextContent('Test 1');
    expect(main).toHaveTextContent('time_ms 12');
    expect(within(view).getByLabelText('Values')).toHaveTextContent(
      'score100 After the close',
    );
    expect(view).not.toHaveTextContent(/points/);
    expect(view).toHaveTextContent('Done');
  });

  it('says which attempt it shows when an earlier result stands under a later attempt', async () => {
    const failedAgain: Grading = {
      ...stuck,
      attempt: 3,
      automatic: true,
      last_good: 2,
    };
    const standing: OrganisedSubmission = {
      ...filledIn,
      grading: filledIn.grading && { ...filledIn.grading, attempt: 2 },
    };
    server.use(
      signedIn,
      taskState,
      publicationList,
      ...repoFiles,
      http.get(`${TASK_API}/gradings`, () => asEntries([failedAgain])),
      http.get(`${TASK_API}/organise/submissions/:number`, () =>
        HttpResponse.json(standing),
      ),
    );
    const user = userEvent.setup();
    renderApp(TASK);

    await user.click(
      await screen.findByRole('button', { name: 'Scored view of submission 3' }),
    );

    const view = await screen.findByRole('region', { name: 'Submission 3, scored' });
    expect(view).toHaveTextContent('Done');
    expect(view).toHaveTextContent(
      "Attempt 2's result, the one that stands while attempt 3 has none.",
    );
  });

  it('names no attempt when it shows the latest one', async () => {
    server.use(
      signedIn,
      taskState,
      publicationList,
      ...repoFiles,
      http.get(`${TASK_API}/gradings`, () => asEntries([done])),
      http.get(`${TASK_API}/organise/submissions/:number`, () =>
        HttpResponse.json(filledIn),
      ),
    );
    const user = userEvent.setup();
    renderApp(TASK);

    await user.click(
      await screen.findByRole('button', { name: 'Scored view of submission 3' }),
    );

    const view = await screen.findByRole('region', { name: 'Submission 3, scored' });
    expect(view).toHaveTextContent('Done');
    expect(view).not.toHaveTextContent(/Attempt \d/);
  });

  it("asks for a team's submission by its entrant", async () => {
    const asked: URLSearchParams[] = [];
    const team = '0192f4a4-7b7e-7000-8000-000000000001';
    server.use(
      signedIn,
      taskState,
      publicationList,
      ...repoFiles,
      http.get(`${TASK_API}/gradings`, () =>
        HttpResponse.json([
          entry(done, {
            entrant: team,
            entrant_name: 'Byte Me',
            user_id: 12,
            username: 'grace',
          }),
        ]),
      ),
      http.get(`${TASK_API}/organise/submissions/:number`, ({ request }) => {
        asked.push(new URL(request.url).searchParams);
        return HttpResponse.json(filledIn);
      }),
    );
    const user = userEvent.setup();
    renderApp(TASK);

    await user.click(
      await screen.findByRole('button', { name: 'Scored view of submission 3' }),
    );

    await screen.findByRole('region', { name: 'Submission 3, scored' });
    expect(asked[0]?.get('entrant')).toBe(team);
  });
});
