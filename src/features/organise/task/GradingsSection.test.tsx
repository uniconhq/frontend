import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { FeedEntry, Grading, Submitter } from '@/api/types';
import { renderApp } from '@/test/render';
import { problem, server, signedIn, someone } from '@/test/server';
import { graded, reported } from '@/test/contestant';
import { TASK_API, publicationList, repoFiles, taskState } from '@/test/organiser';

const TASK = '/orgs/acme/contests/spring/tasks/sum';

const ada: Submitter = { user_id: 11, name: 'ada', team: null };

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
  falls_back: false,
  last_good: null,
  fallback: null,
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
    const result = (
      overrides: Partial<NonNullable<Grading['result']>>,
    ): NonNullable<Grading['result']> => ({
      stopped: null,
      tests: [
        graded('main/1', 'accepted', reported({ time_ms: '12' })),
        graded('main/2', 'accepted', reported({ time_ms: '30' })),
      ],
      values: reported(),
      error: null,
      ...overrides,
    });
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
          done(7, result({ stopped: 'compile_error', tests: [] })),
          done(6, result({})),
          done(
            5,
            result({
              tests: [
                graded('main/1', 'accepted'),
                graded('main/2', 'time_limit'),
                graded('main/3', 'wrong_answer'),
              ],
            }),
          ),
        ]),
      ),
    );
    renderApp(TASK);

    const table = await screen.findByRole('table', { name: 'Gradings' });
    const [, stopped, passed, failed] = within(table).getAllByRole('row');
    expect(stopped).toHaveTextContent('compile_error');
    expect(passed).toHaveTextContent('accepted');
    expect(failed).toHaveTextContent('time_limit');
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
    const dialog = await screen.findByRole('dialog', { name: 'Retry this grading?' });
    expect(dialog).toHaveTextContent(
      "ada's submission 3 to sum is graded again as a new attempt, against publication 2, as attempt 1 was.",
    );
    expect(retried).toEqual([]);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Retry' }));

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

  it('cancels only once asked, with the sentence the contestant reads', async () => {
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
      name: 'Cancel this submission?',
    });
    await userEvent.click(within(first).getByRole('button', { name: 'Not now' }));
    expect(cancelled).toEqual([]);

    await userEvent.click(cancel);
    const dialog = await screen.findByRole('dialog', {
      name: 'Cancel this submission?',
    });
    expect(dialog).toHaveTextContent("ada's submission 3 to sum ends as cancelled.");
    const confirm = within(dialog).getByRole('button', {
      name: 'Cancel the submission',
    });
    expect(confirm).toBeDisabled();
    const field = within(dialog).getByRole('textbox', {
      name: /What the contestant reads/,
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
    expect(table).toHaveTextContent('Told the contestant: “The checker crashed.”');
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
        within(dialog).getByRole('textbox', { name: /What the contestant reads/ }),
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
      result: { stopped: 'compile_error', tests: [], values: reported(), error: null },
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
    expect(third).toHaveTextContent('compile_error');
    expect(third).toHaveTextContent('publication 3');

    const toggle = within(third).getByRole('button', {
      name: 'Show earlier attempts (1)',
    });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toggle);

    const earlier = within(third).getAllByRole('row')[1];
    if (earlier === undefined) throw new Error('no earlier attempt shown');
    expect(earlier).toHaveTextContent('Submission 3, earlier');
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
    const grace: Submitter = { user_id: 12, name: 'grace', team: null };
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
      name: 'Rejudge every submission of this task?',
    });
    expect(dialog).toHaveTextContent(
      "Every submission of B · sum has its latest attempt graded again against the task's current publication, as a new attempt.",
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
