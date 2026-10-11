import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { formatDateTime, formatWhen } from '@/lib/time';
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
    expect(within(list).getByText('Worth')).toBeVisible();
    expect(within(list).getByText('100 points')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Back to the contest' })).toHaveAttribute(
      'href',
      '/contests/acme/spring',
    );
  });

  it('says no worth on a task that gives no points', async () => {
    server.use(
      signedIn,
      noSubmissions,
      http.get(`${TASK_API}/page`, () =>
        HttpResponse.json({ ...taskPage, worth: null }),
      ),
    );
    renderApp(PAGE);

    const list = await screen.findByLabelText('Limits');
    expect(within(list).queryByText('Worth')).toBeNull();
  });

  it.each([
    ['not_released', 'This task is not released yet.'],
    ['archived', 'The contest is archived, so its tasks take no submissions.'],
    [
      'closed',
      'This task has closed for you, so it takes no more submissions from you.',
    ],
    ['not_approved', 'You can submit once your registration is approved.'],
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
    await waitFor(() => expect(timer).toHaveTextContent(/Due in (14m 5\ds|15m 00s)/));
    expect(timer).toHaveTextContent(/Closes in (44m 5\ds|45m 00s)/);
    expect(timer).not.toHaveTextContent("this device's clock");
  });

  it('puts the time left at the top, saying when each falls before the server’s time is in', async () => {
    let answer = () => undefined as void;
    const asked = new Promise<void>((resolve) => {
      answer = resolve;
    });
    server.use(
      signedIn,
      noSubmissions,
      http.get('/api/v1/time', async () => {
        await asked;
        return HttpResponse.json({ now: '2026-09-12T10:00:00Z' });
      }),
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
    const title = screen.getByRole('heading', { name: 'A. Sum of Two', level: 1 });
    const statement = screen.getByRole('heading', { name: 'Sum', level: 2 });
    expect(title.compareDocumentPosition(timer)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(timer.compareDocumentPosition(statement)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(timer).toHaveTextContent(
      `Due at ${formatWhen(new Date('2026-09-12T10:15:00Z'))}`,
    );
    expect(timer).toHaveTextContent(
      `Closes at ${formatWhen(new Date('2026-09-12T10:45:00Z'))}`,
    );
    answer();
    await waitFor(() => expect(timer).toHaveTextContent(/Due in (14m 5\ds|15m 00s)/));
  });

  it('links to asking the organisers about the task', async () => {
    server.use(
      signedIn,
      noSubmissions,
      http.get(`${TASK_API}/page`, () => HttpResponse.json(taskPage)),
    );
    renderApp(PAGE);

    expect(
      await screen.findByRole('link', { name: 'Ask a question about this task' }),
    ).toHaveAttribute('href', '/contests/acme/spring/questions?task=sum');
  });

  it('offers no question to someone not approved yet', async () => {
    server.use(
      signedIn,
      noSubmissions,
      http.get(`${TASK_API}/page`, () =>
        HttpResponse.json({
          ...taskPage,
          release: {
            released: true,
            visible: true,
            open: false,
            closed: 'not_approved',
          },
        }),
      ),
    );
    renderApp(PAGE);

    await screen.findByRole('heading', { name: 'A. Sum of Two', level: 1 });
    expect(
      screen.queryByRole('link', { name: 'Ask a question about this task' }),
    ).toBeNull();
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
    await waitFor(() =>
      expect(timer).toHaveTextContent(
        "Counted by this device's clock: the server's time did not come in.",
      ),
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
    await waitFor(() =>
      expect(timer).toHaveTextContent('Past due: a submission now is late.'),
    );
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

  it('draws the task’s own pictures from its route, and keeps any other image a link', async () => {
    server.use(
      signedIn,
      noSubmissions,
      http.get(`${TASK_API}/page`, () =>
        HttpResponse.json({
          ...taskPage,
          statement: [
            '![the tree](public/tree.png)',
            '![the graph](./public/figures/graph%201.svg)',
            '![outside](public/../task.yaml)',
            '![from afar](https://elsewhere.test/public/d.png)',
          ].join('\n\n'),
        }),
      ),
    );
    const { container } = renderApp(PAGE);

    const tree = await screen.findByRole('img', { name: 'the tree' });
    expect(tree).toHaveAttribute(
      'src',
      '/api/v1/orgs/acme/contests/spring/tasks/sum/public/tree.png',
    );
    expect(screen.getByRole('img', { name: 'the graph' })).toHaveAttribute(
      'src',
      '/api/v1/orgs/acme/contests/spring/tasks/sum/public/figures/graph%201.svg',
    );
    expect(screen.getByRole('link', { name: 'outside' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'from afar' })).toHaveAttribute(
      'href',
      'https://elsewhere.test/public/d.png',
    );
    expect(container.querySelectorAll('main img')).toHaveLength(2);
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

  it('draws the task’s own pictures for a visitor too', async () => {
    server.use(
      http.get(`${PUBLIC_API}/:org/:contest/tasks/:task`, () =>
        HttpResponse.json({
          task: { name: 'sum', label: 'A', title: 'Sum of Two' },
          statement: '![the tree](public/tree.png)\n',
        }),
      ),
    );
    renderApp(PAGE);

    expect(await screen.findByRole('img', { name: 'the tree' })).toHaveAttribute(
      'src',
      '/api/v1/orgs/acme/contests/spring/tasks/sum/public/tree.png',
    );
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
