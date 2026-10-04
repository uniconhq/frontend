import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { renderApp } from '@/test/render';
import { problem, server, signedIn, someone } from '@/test/server';
import {
  CONTEST_API,
  listAndCreate,
  repoFiles,
  taskList,
  tasks,
} from '@/test/organiser';

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
              names: { org: 'acme', contest: 'spring', task: 'sum' },
              role: 'manager',
            },
            {
              names: { org: 'acme', contest: 'autumn', task: 'max' },
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
  async function submitTask(name: string, title = '') {
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'New task' }));
    const form = screen.getByRole('form', { name: 'New task' });
    await user.type(within(form).getByRole('textbox', { name: /^Name/ }), name);
    if (title !== '') {
      await user.type(within(form).getByRole('textbox', { name: /^Title/ }), title);
    }
    await user.click(within(form).getByRole('button', { name: 'Create task' }));
    return form;
  }

  it('sends the name and title, closes the form and lists the new task', async () => {
    const { handlers, sent } = listAndCreate(
      '/api/v1/orgs/acme/contests/spring/tasks',
      tasks,
    );
    server.use(signedIn, ...repoFiles, ...handlers);
    renderApp('/orgs/acme/contests/spring');

    const form = await submitTask('max', 'Maximum');

    const list = screen.getByRole('list', { name: 'Tasks' });
    expect(await within(list).findByRole('link', { name: 'max' })).toHaveAttribute(
      'href',
      '/orgs/acme/contests/spring/tasks/max',
    );
    expect(sent).toEqual([{ name: 'max', title: 'Maximum' }]);
    expect(form).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New task' })).toHaveFocus();
  });

  it('sends no title when none was given', async () => {
    const { handlers, sent } = listAndCreate(
      '/api/v1/orgs/acme/contests/spring/tasks',
      tasks,
    );
    server.use(signedIn, ...repoFiles, ...handlers);
    renderApp('/orgs/acme/contests/spring');

    await submitTask('max');

    expect(await screen.findByRole('button', { name: 'New task' })).toBeVisible();
    expect(sent).toEqual([{ name: 'max', title: null }]);
  });

  it('shows a taken name beside the form, keeping what was typed', async () => {
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

    const form = await submitTask('sum');

    expect(await within(form).findByRole('alert')).toHaveTextContent(
      'The task acme/spring/sum already exists.',
    );
    expect(within(form).getByRole('textbox', { name: /^Name/ })).toHaveValue('sum');
  });
});
