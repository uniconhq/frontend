import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { renderApp } from '@/test/render';
import { problem, server, signedIn, someone } from '@/test/server';
import {
  CONTEST_API,
  provisioning,
  provisioningInTurn,
  repoFiles,
  taskList,
  tasks,
} from '@/test/organiser';
import { fakeTimerUser, passTime, withFakeTimers } from '@/test/timers';

describe('the contest page', () => {
  it('lists the tasks, each linking to its page, and the contest files', async () => {
    server.use(signedIn, taskList, ...repoFiles);
    renderApp('/orgs/acme/contests/spring');

    const list = await screen.findByRole('list', { name: 'Tasks' });
    expect(
      within(list)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual([
      '/orgs/acme/contests/spring/tasks/sort',
      '/orgs/acme/contests/spring/tasks/sum',
    ]);
    const tree = screen.getByRole('navigation', { name: 'Files' });
    expect(
      await within(tree).findByRole('link', { name: 'contest.yaml' }),
    ).toBeVisible();
  });

  it('shows a skeleton while the tasks load', async () => {
    server.use(
      signedIn,
      ...repoFiles,
      http.get(`${CONTEST_API}/tasks`, async () => {
        await delay('infinite');
        return HttpResponse.json([]);
      }),
    );
    renderApp('/orgs/acme/contests/spring');

    await screen.findByRole('heading', { name: 'spring', level: 1 });
    expect(screen.getAllByRole('status', { name: 'Loading' }).length).toBeGreaterThan(
      0,
    );
    expect(screen.queryByRole('list', { name: 'Tasks' })).not.toBeInTheDocument();
  });

  it('shows the refusal when the tasks may not be listed, and keeps the files', async () => {
    server.use(
      signedIn,
      ...repoFiles,
      http.get(`${CONTEST_API}/tasks`, () =>
        problem(403, 'forbidden', {
          detail: 'You need the observer role at acme/spring.',
        }),
      ),
    );
    renderApp('/orgs/acme/contests/spring');

    expect(
      await screen.findByText('You need the observer role at acme/spring.'),
    ).toBeVisible();
    expect(await screen.findByRole('link', { name: 'contest.yaml' })).toBeVisible();
  });

  it('shows someone refused the list the tasks their own roles reach', async () => {
    server.use(
      http.get('/api/v1/me', () =>
        HttpResponse.json({
          ...someone,
          roles: [
            {
              scope: { kind: 'task', org: 'acme', contest: 'spring', task: 'sum' },
              role: 'manager',
            },
            {
              scope: { kind: 'task', org: 'acme', contest: 'autumn', task: 'max' },
              role: 'manager',
            },
          ],
        }),
      ),
      ...repoFiles,
      http.get(`${CONTEST_API}/tasks`, () =>
        problem(403, 'forbidden', {
          detail: 'You need the observer role at acme/spring.',
        }),
      ),
    );
    renderApp('/orgs/acme/contests/spring');

    const own = await screen.findByRole('list', { name: 'Your tasks' });
    expect(
      within(own)
        .getAllByRole('link')
        .map((link) => [link.textContent, link.getAttribute('href')]),
    ).toEqual([['sum', '/orgs/acme/contests/spring/tasks/sum']]);
  });
});

describe('creating a task', () => {
  withFakeTimers();

  async function submitTask(name: string) {
    const user = fakeTimerUser();
    await user.click(await screen.findByRole('button', { name: 'New task' }));
    const form = screen.getByRole('form', { name: 'New task' });
    await user.type(within(form).getByRole('textbox', { name: /^Name/ }), name);
    await user.click(within(form).getByRole('button', { name: 'Create task' }));
  }

  it('follows it through pending and running to ready, and lists it', async () => {
    let made = false;
    server.use(
      signedIn,
      ...repoFiles,
      http.get(`${CONTEST_API}/tasks`, () =>
        HttpResponse.json(made ? [...tasks, { name: 'max' }] : tasks),
      ),
      http.post('/api/v1/orgs/acme/contests/spring/tasks', () =>
        HttpResponse.json(provisioning({ kind: 'task', target: 'acme/spring/max' }), {
          status: 202,
        }),
      ),
      provisioningInTurn('/api/v1/orgs/acme/contests/spring/tasks/max/provisioning', [
        provisioning({
          kind: 'task',
          status: 'running',
          last_step: 'repo',
          attempts: 1,
        }),
        provisioning({
          kind: 'task',
          status: 'ready',
          last_step: 'contest_entry',
          attempts: 1,
        }),
      ]),
    );
    renderApp('/orgs/acme/contests/spring');

    await submitTask('max');

    const progress = await screen.findByRole('region', { name: 'Making the task max' });
    expect(within(progress).getByText('Waiting to start.')).toBeVisible();
    expect(screen.queryByRole('form', { name: 'New task' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New task' })).not.toBeInTheDocument();
    await passTime(1_000);
    expect(await within(progress).findByText(/Working on it/)).toBeVisible();
    expect(
      within(progress).getByText("the task repo's teams and protection").closest('li'),
    ).toHaveAttribute('data-state', 'working');

    made = true;
    await passTime(1_000);
    expect(
      await within(progress).findByRole('link', { name: 'Open the task max' }),
    ).toHaveAttribute('href', '/orgs/acme/contests/spring/tasks/max');
    expect(
      within(progress).getByText("the task's entry in contest.yaml").closest('li'),
    ).toHaveAttribute('data-state', 'done');
    const list = screen.getByRole('list', { name: 'Tasks' });
    expect(await within(list).findByRole('link', { name: 'max' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'New task' })).toBeVisible();
  });

  it('names the step a failure stopped at', async () => {
    server.use(
      signedIn,
      ...repoFiles,
      taskList,
      http.post('/api/v1/orgs/acme/contests/spring/tasks', () =>
        HttpResponse.json(provisioning({ kind: 'task' }), { status: 202 }),
      ),
      http.get('/api/v1/orgs/acme/contests/spring/tasks/max/provisioning', () =>
        HttpResponse.json(
          provisioning({
            kind: 'task',
            status: 'failed',
            attempts: 3,
            failed_step: 'repo',
            error: 'the forge already holds something by this name',
            retry_at: '2026-09-29T10:00:08Z',
          }),
        ),
      ),
    );
    renderApp('/orgs/acme/contests/spring');

    await submitTask('max');
    await passTime(1_000);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'It stopped at the task repo with its starter files. The forge already holds something by this name.',
    );
    expect(screen.getByText(/Attempt 3/)).toBeVisible();
  });

  it('shows a taken name beside the form', async () => {
    server.use(
      signedIn,
      ...repoFiles,
      taskList,
      http.post('/api/v1/orgs/acme/contests/spring/tasks', () =>
        problem(409, 'conflict', {
          detail: 'The task acme/spring/sum already exists.',
        }),
      ),
    );
    renderApp('/orgs/acme/contests/spring');

    await submitTask('sum');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The task acme/spring/sum already exists.',
    );
  });
});
