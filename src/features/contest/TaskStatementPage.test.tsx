import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { formatDateTime } from '@/lib/time';
import { renderApp } from '@/test/render';
import { problem, server, signedIn } from '@/test/server';
import { noSubmissions, PUBLIC_API, TASK_API, taskPage } from '@/test/contestant';
import { passTime, withFakeTimers } from '@/test/timers';

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

  it.each([
    ['not_released', 'This task is not released yet.'],
    ['archived', 'The contest is archived, so its tasks take no submissions.'],
    [
      'closed',
      'This task has closed for you, so it takes no more submissions from you.',
    ],
    ['not_approved', 'Only approved contestants submit to this task.'],
  ] as const)(
    'says in the panel’s place why it takes nothing, %s',
    async (closed, said) => {
      server.use(
        signedIn,
        noSubmissions,
        http.get(`${TASK_API}/page`, () =>
          HttpResponse.json({
            ...taskPage,
            release: {
              released: closed !== 'not_released',
              visible: true,
              open: false,
              closed,
            },
          }),
        ),
      );
      renderApp(PAGE);

      expect(
        await screen.findByRole('status', { name: 'Why you cannot submit' }),
      ).toHaveTextContent(said);
      expect(screen.queryByRole('form', { name: 'Submit' })).not.toBeInTheDocument();
    },
  );

  it("counts down to the row's due and close, extension included, by the server's clock", async () => {
    server.use(
      signedIn,
      noSubmissions,
      http.get(`${TASK_API}/page`, () =>
        HttpResponse.json({
          ...taskPage,
          due: '2026-09-12T10:15:00Z',
          closes: '2026-09-12T10:45:00Z',
        }),
      ),
    );
    renderApp(PAGE);

    const timer = await screen.findByRole('timer', { name: 'Task countdown' });
    expect(timer).toHaveTextContent(/Due in (14m 5\ds|15m 00s)/);
    expect(timer).toHaveTextContent(/Closes in (44m 5\ds|45m 00s)/);
    expect(timer).not.toHaveTextContent("this device's clock");
  });

  it("says it counts by the device's clock when the server's time did not come in", async () => {
    server.use(
      signedIn,
      noSubmissions,
      http.get('/api/v1/time', () => problem(404, 'not_found')),
      http.get(`${TASK_API}/page`, () => HttpResponse.json(taskPage)),
    );
    renderApp(PAGE);

    const timer = await screen.findByRole('timer', { name: 'Task countdown' });
    expect(timer).toHaveTextContent(
      "Counted by this device's clock: the server's time did not come in.",
    );
  });

  it('says a submission past the due is late, and still takes it', async () => {
    server.use(
      signedIn,
      noSubmissions,
      http.get(`${TASK_API}/page`, () =>
        HttpResponse.json({ ...taskPage, due: '2026-09-12T09:50:00Z' }),
      ),
    );
    renderApp(PAGE);

    const timer = await screen.findByRole('timer', { name: 'Task countdown' });
    expect(timer).toHaveTextContent('Past due: a submission now is late.');
    expect(timer).toHaveTextContent(/Closes in (29m 5\ds|30m 00s)/);
    expect(screen.getByRole('form', { name: 'Submit' })).toBeVisible();
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

describe('a task page as the task opens', () => {
  withFakeTimers();

  it('brings the panel back once the task is open', async () => {
    let asked = 0;
    server.use(
      signedIn,
      noSubmissions,
      http.get(`${TASK_API}/page`, () => {
        asked += 1;
        return HttpResponse.json(
          asked === 1
            ? {
                ...taskPage,
                release: {
                  released: false,
                  visible: true,
                  open: false,
                  closed: 'not_released',
                },
              }
            : taskPage,
        );
      }),
    );
    renderApp(PAGE);

    expect(
      await screen.findByRole('status', { name: 'Why you cannot submit' }),
    ).toHaveTextContent('This task is not released yet.');

    await passTime(60_000);

    expect(await screen.findByRole('form', { name: 'Submit' })).toBeVisible();
    expect(screen.queryByRole('status', { name: 'Why you cannot submit' })).toBeNull();
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
