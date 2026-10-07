import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { formatDateTime } from '@/lib/time';
import { renderApp } from '@/test/render';
import { problem, server, signedIn } from '@/test/server';
import { noSubmissions, PUBLIC_API, TASK_API, taskPage } from '@/test/contestant';

const PAGE = '/contests/acme/spring/tasks/sum';

describe('a task page for a signed-in person', () => {
  it('renders the statement as Markdown and lists its times and limits', async () => {
    server.use(
      signedIn,
      noSubmissions,
      http.get(`${TASK_API}/page`, () =>
        HttpResponse.json({ ...taskPage, due: '2026-09-12T10:15:00Z' }),
      ),
    );
    renderApp(PAGE);

    expect(
      await screen.findByRole('heading', { name: 'A. Sum of Two', level: 1 }),
    ).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Sum', level: 2 })).toBeVisible();
    expect(screen.getByText('sum', { selector: 'strong' })).toBeVisible();
    const list = screen.getByLabelText('Limits');
    expect(within(list).getByText('50 in all')).toBeVisible();
    expect(within(list).getByText('1 in any 30 seconds')).toBeVisible();
    expect(
      within(list).getByText(formatDateTime(new Date('2026-09-12T10:15:00Z'))),
    ).toBeVisible();
    expect(
      within(list).getByText(formatDateTime(new Date('2026-09-12T10:30:00Z'))),
    ).toBeVisible();
    expect(within(list).getByText('Due')).toBeVisible();
    expect(within(list).getByText('Closes')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Back to the contest' })).toHaveAttribute(
      'href',
      '/contests/acme/spring',
    );
  });

  it('says why the task takes no submission now', async () => {
    server.use(
      signedIn,
      noSubmissions,
      http.get(`${TASK_API}/page`, () =>
        HttpResponse.json({
          ...taskPage,
          release: { released: true, visible: true, open: false, closed: 'closed' },
        }),
      ),
    );
    renderApp(PAGE);

    expect(await screen.findByText('This task has closed for you.')).toBeVisible();
  });

  it('leaves out raw HTML an organiser wrote into the statement', async () => {
    server.use(
      signedIn,
      noSubmissions,
      http.get(`${TASK_API}/page`, () =>
        HttpResponse.json({
          ...taskPage,
          statement: 'Before <img src=x onerror="alert(1)"> after\n',
        }),
      ),
    );
    const { container } = renderApp(PAGE);

    expect(await screen.findByText(/Before/)).toBeVisible();
    expect(container.querySelector('img[src="x"]')).toBeNull();
  });

  it('shows an image as a link to it and opens links out of the site apart', async () => {
    server.use(
      signedIn,
      noSubmissions,
      http.get(`${TASK_API}/page`, () =>
        HttpResponse.json({
          ...taskPage,
          statement:
            '![a diagram](http://elsewhere.test/d.png) and [a guide](https://guide.test)\n',
        }),
      ),
    );
    const { container } = renderApp(PAGE);

    const picture = await screen.findByRole('link', { name: 'a diagram' });
    expect(picture).toHaveAttribute('href', 'http://elsewhere.test/d.png');
    expect(container.querySelector('main img')).toBeNull();
    const guide = screen.getByRole('link', { name: 'a guide' });
    expect(guide).toHaveAttribute('target', '_blank');
    expect(guide).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('answers not found for a task that is not released', async () => {
    server.use(
      signedIn,
      noSubmissions,
      http.get(`${TASK_API}/page`, () => problem(404, 'not_found')),
    );
    renderApp(PAGE);

    expect(await screen.findByRole('heading', { name: 'Not found' })).toBeVisible();
  });
});

describe('a task page for a visitor', () => {
  it('shows a released statement of a public contest', async () => {
    server.use(
      http.get(`${PUBLIC_API}/:org/:contest/tasks/:task`, () =>
        HttpResponse.json({
          task: { name: 'sum', label: 'A', title: 'Sum of Two' },
          statement: 'Add two numbers.\n',
        }),
      ),
    );
    renderApp(PAGE);

    expect(
      await screen.findByRole('heading', { name: 'A. Sum of Two', level: 1 }),
    ).toBeVisible();
    expect(screen.getByText('Add two numbers.')).toBeVisible();
    expect(screen.queryByLabelText('Limits')).not.toBeInTheDocument();
  });

  it('asks a visitor to sign in for any other task', async () => {
    server.use(
      http.get(`${PUBLIC_API}/:org/:contest/tasks/:task`, () =>
        problem(404, 'not_found'),
      ),
    );
    renderApp(PAGE);

    expect(
      await screen.findByRole('heading', { name: 'Sign in to see this task' }),
    ).toBeVisible();
  });
});
