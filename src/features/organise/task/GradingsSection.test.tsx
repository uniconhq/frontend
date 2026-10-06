import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { Grading } from '@/api/types';
import { renderApp } from '@/test/render';
import { problem, server, signedIn, someone } from '@/test/server';
import { TASK_API, publicationList, repoFiles, taskState } from '@/test/organiser';

const TASK = '/orgs/acme/contests/spring/tasks/sum';

const stuck: Grading = {
  id: '0199a2c1-6b7e-7c3a-9f10-5d2e4b8a6c31',
  submission_number: 3,
  submitted_at: '2026-09-26T10:00:00Z',
  publication: 2,
  attempt: 1,
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
      http.get(`${TASK_API}/gradings`, () => HttpResponse.json([waiting, stuck])),
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
    const result = (overrides: Partial<NonNullable<Grading['result']>>) => ({
      stopped: null,
      tests: [
        { test: 'main/1', outcome: 'accepted' as const, values: { time_ms: 12 } },
        { test: 'main/2', outcome: 'accepted' as const, values: { time_ms: 30 } },
      ],
      values: {},
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
        HttpResponse.json([
          done(7, result({ stopped: 'compile_error', tests: [] })),
          done(6, result({})),
          done(
            5,
            result({
              tests: [
                { test: 'main/1', outcome: 'accepted', values: {} },
                { test: 'main/2', outcome: 'time_limit', values: {} },
                { test: 'main/3', outcome: 'wrong_answer', values: {} },
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

  it('retries a stuck grading in one click and reads the list again', async () => {
    let listed = [stuck];
    const retried: string[] = [];
    server.use(
      signedIn,
      taskState,
      publicationList,
      ...repoFiles,
      http.get(`${TASK_API}/gradings`, () => HttpResponse.json(listed)),
      http.post(`${TASK_API}/gradings/:grading/retry`, ({ params }) => {
        retried.push(String(params.grading));
        const again = {
          ...stuck,
          id: 'new',
          attempt: 2,
          status: 'queued' as const,
          error: null,
        };
        listed = [again, { ...stuck, finished_at: '2026-09-26T10:05:00Z' }];
        return HttpResponse.json(again);
      }),
    );
    renderApp(TASK);

    await userEvent.click(
      await screen.findByRole('button', {
        name: 'Retry submission 3, attempt 1',
      }),
    );

    expect(retried).toEqual([stuck.id]);
    expect(await screen.findByText('Queued')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Cancel submission 3, attempt 2' }),
    ).toBeVisible();
  });

  it('shows a refusal on the row', async () => {
    server.use(
      signedIn,
      taskState,
      publicationList,
      ...repoFiles,
      http.get(`${TASK_API}/gradings`, () => HttpResponse.json([waiting])),
      http.post(`${TASK_API}/gradings/:grading/cancel`, () =>
        problem(409, 'wrong_status', { current: 'done' }),
      ),
    );
    renderApp(TASK);

    await userEvent.click(
      await screen.findByRole('button', {
        name: 'Cancel submission 4, attempt 1',
      }),
    );

    expect(await screen.findByText('That has moved on')).toBeVisible();
    expect(screen.getByText('wrong_status detail')).toBeVisible();
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
      http.get(`${TASK_API}/gradings`, () => HttpResponse.json([stuck])),
    );
    renderApp(TASK);

    expect(await screen.findByText('System error')).toBeVisible();
    expect(screen.queryByRole('button', { name: /Retry/ })).toBeNull();
  });
});
