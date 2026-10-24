import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@/test/user-event';
import { http, HttpResponse } from 'msw';
import type { TaskRelease } from '@/api/types';

import { formatWhen } from '@/lib/time';
import { renderApp } from '@/test/render';
import { problem, server, signedIn } from '@/test/server';
import {
  CONTEST_API,
  PUBLIC_API,
  entrant,
  entry,
  home,
  homesInTurn,
  publicContest,
  registration,
} from '@/test/contestant';
import { passTime, withFakeTimers } from '@/test/timers';

const PAGE = '/contests/acme/spring';

describe('the contest page for a signed-in person', () => {
  it('shows the contest, a countdown to its end and its released tasks', async () => {
    server.use(
      signedIn,
      http.get(`${CONTEST_API}/home`, () => HttpResponse.json(home())),
    );
    renderApp(PAGE);

    expect(
      await screen.findByRole('heading', { name: 'Spring 2026', level: 1 }),
    ).toBeVisible();
    const timer = await screen.findByRole('timer', { name: 'Contest countdown' });
    await waitFor(() =>
      expect(timer).toHaveTextContent(/Contest ends in (29m 5\ds|30m 00s)/),
    );
    const tasks = screen.getByRole('list', { name: 'Tasks' });
    expect(within(tasks).getByRole('link', { name: 'Sum of Two' })).toHaveAttribute(
      'href',
      '/contests/acme/spring/tasks/sum',
    );
    const trail = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(trail).getByRole('link', { name: 'spring' })).toHaveAttribute(
      'href',
      PAGE,
    );
  });

  it('runs in race order once the person is in: time, tasks, leaderboard, announcements, questions, then the entry', async () => {
    server.use(
      signedIn,
      http.get(`${CONTEST_API}/home`, () =>
        HttpResponse.json(home({ registration: registration({ status: 'approved' }) })),
      ),
    );
    renderApp(PAGE);

    const timer = await screen.findByRole('timer', { name: 'Contest countdown' });
    const tasks = screen.getByRole('heading', { name: 'Tasks' });
    const board = await screen.findByRole('heading', { name: 'Leaderboards' });
    const announcements = screen.getByRole('heading', { name: 'Announcements' });
    const questions = screen.getByRole('region', {
      name: 'Questions to the organisers',
    });
    const entry = screen.getByRole('status', { name: 'Registration' });
    const order = [timer, tasks, board, announcements, questions, entry];
    for (const [index, element] of order.slice(1).entries()) {
      expect(
        order[index]?.compareDocumentPosition(element),
        `${String(index)} before ${String(index + 1)}`,
      ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    }
    expect(
      within(questions).getByRole('link', { name: 'Ask a question' }),
    ).toHaveAttribute('href', '/contests/acme/spring/questions');
  });

  it('puts an entry still to settle before the tasks', async () => {
    server.use(
      signedIn,
      http.get(`${CONTEST_API}/home`, () => HttpResponse.json(home())),
    );
    renderApp(PAGE);

    const register = await screen.findByRole('button', { name: 'Register' });
    const tasks = screen.getByRole('heading', { name: 'Tasks' });
    expect(register.compareDocumentPosition(tasks)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(
      screen.queryByRole('region', { name: 'Questions to the organisers' }),
    ).toBeNull();
  });

  it('says when nothing is on a leaderboard yet', async () => {
    server.use(
      signedIn,
      http.get(`${CONTEST_API}/home`, () =>
        HttpResponse.json(home({ registration: registration({ status: 'approved' }) })),
      ),
    );
    renderApp(PAGE);

    expect(await screen.findByText('Nothing is on a leaderboard yet.')).toBeVisible();
  });

  it('shows the leaderboard note when the person is in', async () => {
    server.use(
      signedIn,
      http.get(`${CONTEST_API}/home`, () =>
        HttpResponse.json(home({ registration: registration({ status: 'approved' }) })),
      ),
    );
    renderApp(PAGE);

    await screen.findByRole('heading', { name: 'Tasks' });
    expect(await screen.findByText('Nothing is on a leaderboard yet.')).toBeVisible();
  });

  it('leads an organiser of the contest back to organising it, and nobody else', async () => {
    server.use(
      signedIn,
      http.get(`${CONTEST_API}/home`, () =>
        HttpResponse.json({ ...home(), organises: true }),
      ),
    );
    renderApp(PAGE);

    expect(
      await screen.findByRole('link', { name: 'Back to organising' }),
    ).toHaveAttribute('href', '/orgs/acme/contests/spring');
  });

  it('offers a contestant no way to the organisers’ pages', async () => {
    server.use(
      signedIn,
      http.get(`${CONTEST_API}/home`, () => HttpResponse.json(home())),
    );
    renderApp(PAGE);

    await screen.findByRole('heading', { name: 'Spring 2026', level: 1 });
    expect(screen.queryByRole('link', { name: 'Back to organising' })).toBeNull();
  });

  it('says an archived contest is still read and takes no submissions', async () => {
    server.use(
      signedIn,
      http.get(`${CONTEST_API}/home`, () =>
        HttpResponse.json({ ...home(), state: 'archived' }),
      ),
    );
    renderApp(PAGE);

    expect(
      await screen.findByText(
        'This contest is archived: its tasks can still be read, and they take no submissions.',
      ),
    ).toBeVisible();
  });

  it('says when each task falls due and closes for the person', async () => {
    server.use(
      signedIn,
      http.get(`${CONTEST_API}/home`, () =>
        HttpResponse.json(
          home({
            registration: registration({ status: 'approved', time_extension: 1800 }),
            tasks: [
              {
                name: 'sum',
                label: 'A',
                title: 'Sum of Two',
                release: { released: true, visible: true, open: true, closed: null },
                due: '2026-09-12T10:45:00Z',
                closes: '2026-09-12T11:00:00Z',
              },
              {
                name: 'max',
                label: 'B',
                title: 'Maximum',
                release: { released: true, visible: true, open: true, closed: null },
                due: null,
                closes: '2026-09-12T11:00:00Z',
              },
            ],
          }),
        ),
      ),
    );
    renderApp(PAGE);

    const tasks = await screen.findByRole('list', { name: 'Tasks' });
    const [sum, max] = within(tasks).getAllByRole('listitem');
    await waitFor(() => expect(sum).toHaveTextContent(/Due in (44m 5\ds|45m 00s)/));
    expect(sum).toHaveTextContent(/Closes in (59m 5\ds|1h 00m 00s)/);
    expect(max).not.toHaveTextContent('Due');
    expect(max).toHaveTextContent(/Closes in /);
  });

  it('keeps the task list when nothing is on a leaderboard yet', async () => {
    const task = (name: string) => ({
      name,
      label: name.toUpperCase(),
      title: `Task ${name}`,
      release: { released: true, visible: true, open: true, closed: null },
      due: null,
      closes: '2026-09-12T11:00:00Z',
    });
    server.use(
      signedIn,
      http.get(`${CONTEST_API}/home`, () =>
        HttpResponse.json(
          home({
            registration: registration({ status: 'approved' }),
            tasks: [task('a'), task('b')],
          }),
        ),
      ),
    );
    renderApp(PAGE);

    const tasks = await screen.findByRole('list', { name: 'Tasks' });
    expect(within(tasks).getByRole('link', { name: 'Task a' })).toHaveAttribute(
      'href',
      '/contests/acme/spring/tasks/a',
    );
    expect(screen.getByText('Nothing is on a leaderboard yet.')).toBeVisible();
    expect(screen.queryByRole('columnheader')).toBeNull();
  });

  it('says when each task falls due and closes before the server’s time is in', async () => {
    let answer = () => undefined as void;
    const asked = new Promise<void>((resolve) => {
      answer = resolve;
    });
    server.use(
      signedIn,
      http.get('/api/v1/time', async () => {
        await asked;
        return HttpResponse.json({ now: '2026-09-12T10:00:00Z' });
      }),
      http.get(`${CONTEST_API}/home`, () =>
        HttpResponse.json(
          home({
            registration: registration({ status: 'approved' }),
            tasks: [
              {
                name: 'sum',
                label: 'A',
                title: 'Sum of Two',
                release: { released: true, visible: true, open: true, closed: null },
                due: '2026-09-12T10:45:00Z',
                closes: '2026-09-12T11:00:00Z',
              },
            ],
          }),
        ),
      ),
    );
    renderApp(PAGE);

    const timer = await screen.findByRole('timer', { name: 'Contest countdown' });
    expect(timer).toHaveTextContent(
      `Contest ends at ${formatWhen(new Date('2026-09-12T10:30:00Z'))}`,
    );
    const [sum] = within(screen.getByRole('list', { name: 'Tasks' })).getAllByRole(
      'listitem',
    );
    expect(sum).toHaveTextContent(
      `Due at ${formatWhen(new Date('2026-09-12T10:45:00Z'))}`,
    );
    expect(sum).toHaveTextContent(
      `Closes at ${formatWhen(new Date('2026-09-12T11:00:00Z'))}`,
    );
    answer();
    await waitFor(() => expect(timer).toHaveTextContent(/Contest ends in /));
    expect(sum).toHaveTextContent(/Due in /);
  });

  it('says why a task takes nothing from the person now', async () => {
    const task = (name: string, closed: TaskRelease['closed']) => ({
      name,
      label: name.toUpperCase(),
      title: name,
      release: { released: true, visible: true, open: false, closed },
      due: null,
      closes: '2026-09-12T11:00:00Z',
    });
    server.use(
      signedIn,
      http.get(`${CONTEST_API}/home`, () =>
        HttpResponse.json(
          home({
            registration: registration(),
            tasks: [
              task('a', 'not_approved'),
              { ...task('b', 'closed'), closes: '2026-09-12T09:30:00Z' },
              task('c', 'archived'),
            ],
          }),
        ),
      ),
    );
    renderApp(PAGE);

    const tasks = await screen.findByRole('list', { name: 'Tasks' });
    const [a, b, c] = within(tasks).getAllByRole('listitem');
    expect(a).toHaveTextContent('Open once your registration is approved');
    await waitFor(() => expect(a).toHaveTextContent(/Closes in /));
    await waitFor(() =>
      expect(b).toHaveTextContent('Closed: it takes no more submissions from you'),
    );
    expect(c).toHaveTextContent('No longer takes submissions');
  });

  it.each([
    ['who may register', { registration: entry() }, 'Register to submit'],
    [
      'whom the contest’s email rule refuses',
      {
        registration: entry({
          can_register: false,
          refused: {
            code: 'domain_not_allowed' as const,
            detail: 'This contest takes only some email addresses, and not yours.',
          },
        }),
      },
      'Open to the contest’s entrants only',
    ],
    ['who organises the contest', { organises: true }, 'Open to entrants'],
  ])(
    'says what is true of a task not open yet for someone %s',
    async (_, who, said) => {
      server.use(
        signedIn,
        http.get(`${CONTEST_API}/home`, () =>
          HttpResponse.json(
            home({
              ...who,
              tasks: [
                {
                  ...home().tasks[0]!,
                  release: {
                    released: true,
                    visible: true,
                    open: false,
                    closed: 'not_approved',
                  },
                },
              ],
            }),
          ),
        ),
      );
      renderApp(PAGE);

      const tasks = await screen.findByRole('list', { name: 'Tasks' });
      const [a] = within(tasks).getAllByRole('listitem');
      expect(a).toHaveTextContent(said);
      expect(a).not.toHaveTextContent('registration is approved');
    },
  );

  it('registers and then shows the registration waiting', async () => {
    let body: unknown = null;
    server.use(
      signedIn,
      homesInTurn([home(), home({ registration: registration() })]),
      http.post(`${CONTEST_API}/entrants`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(entrant(), { status: 201 });
      }),
    );
    renderApp(PAGE);

    await userEvent.click(await screen.findByRole('button', { name: 'Register' }));

    expect(await screen.findByText('Your registration is waiting')).toBeVisible();
    expect(body).toEqual({ name: null, code: null });
  });

  it('asks for the contest’s code when it takes one, and sends it', async () => {
    let body: unknown = null;
    server.use(
      signedIn,
      http.get(`${CONTEST_API}/home`, () =>
        HttpResponse.json(home({ registration: entry({ asks_code: true }) })),
      ),
      http.post(`${CONTEST_API}/entrants`, async ({ request }) => {
        body = await request.json();
        return problem(403, 'wrong_invite_code');
      }),
    );
    renderApp(PAGE);

    await userEvent.type(await screen.findByLabelText(/Contest code/), 'sesame');
    await userEvent.click(screen.getByRole('button', { name: 'Register' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That code is not right',
    );
    expect(body).toEqual({ name: null, code: 'sesame' });
  });

  it.each([
    ['registration_closed', 403, 'Registration is closed'],
    ['is_staff', 403, 'You organise this contest'],
    ['invite_required', 403, 'This contest is by invite only'],
    ['domain_not_allowed', 403, 'Your email address is not accepted'],
    ['already_registered', 409, 'You have registered already'],
    ['contest_full', 409, 'The contest is full'],
  ])('says a %s refusal in words', async (code, status, sentence) => {
    server.use(
      signedIn,
      http.get(`${CONTEST_API}/home`, () => HttpResponse.json(home())),
      http.post(`${CONTEST_API}/entrants`, () => problem(status, code)),
    );
    renderApp(PAGE);

    await userEvent.click(await screen.findByRole('button', { name: 'Register' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(sentence);
  });

  it('shows the organisers’ reason for a rejection', async () => {
    server.use(
      signedIn,
      http.get(`${CONTEST_API}/home`, () =>
        HttpResponse.json(
          home({
            registration: registration({
              status: 'rejected',
              reason: 'Not a student.',
            }),
          }),
        ),
      ),
    );
    renderApp(PAGE);

    const status = await screen.findByRole('status', { name: 'Registration' });
    expect(status).toHaveTextContent('Your registration was not accepted');
    expect(status).toHaveTextContent('Not a student.');
    expect(screen.queryByRole('button', { name: 'Register' })).not.toBeInTheDocument();
  });

  it('says registration is closed when the window is shut', async () => {
    server.use(
      signedIn,
      http.get(`${CONTEST_API}/home`, () =>
        HttpResponse.json(
          home({
            registration: entry({ registration_open: false, can_register: false }),
          }),
        ),
      ),
    );
    renderApp(PAGE);

    expect(
      await screen.findByRole('status', { name: 'Registration' }),
    ).toHaveTextContent('Registration is closed');
  });

  it('shows no such contest when the caller may not see it', async () => {
    server.use(
      signedIn,
      http.get(`${CONTEST_API}/home`, () => problem(404, 'not_found')),
    );
    renderApp(PAGE);

    expect(await screen.findByRole('heading', { name: 'Not found' })).toBeVisible();
  });
});

describe('the contest page while the person waits', () => {
  withFakeTimers();

  it('moves from pending to the contest once an organiser approves', async () => {
    server.use(
      signedIn,
      homesInTurn([
        home({ registration: registration() }),
        home({ registration: registration({ status: 'approved' }) }),
      ]),
    );
    renderApp(PAGE);

    expect(await screen.findByText('Your registration is waiting')).toBeVisible();
    await passTime(10_000);
    const status = await screen.findByRole('status', { name: 'Registration' });
    expect(await within(status).findByText('You are in')).toBeVisible();
    expect(status).toHaveTextContent('Submit to any task that is open.');
  });

  it('reads the home only now and then once the person is in', async () => {
    server.use(
      signedIn,
      homesInTurn([
        home({ registration: registration({ status: 'approved' }) }),
        home({ registration: registration({ status: 'removed' }) }),
      ]),
    );
    renderApp(PAGE);

    expect(await screen.findByText('You are in')).toBeVisible();
    await passTime(10_000);
    expect(screen.getByText('You are in')).toBeVisible();
    await passTime(50_000);
    expect(await screen.findByText('You were removed from this contest')).toBeVisible();
  });
});

describe('the contest page for a visitor', () => {
  it('shows a public contest with its tasks and a way to sign in', async () => {
    server.use(
      http.get(`${PUBLIC_API}/:org/:contest`, () => HttpResponse.json(publicContest)),
    );
    renderApp(PAGE);

    expect(
      await screen.findByRole('heading', { name: 'Spring 2026', level: 1 }),
    ).toBeVisible();
    expect(screen.getByText('Sign in to register for this contest.')).toBeVisible();
    const main = screen.getByRole('main');
    expect(within(main).getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      `/api/v1/auth/login?next=${encodeURIComponent(PAGE)}`,
    );
    expect(screen.getByRole('link', { name: 'Sum of Two' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'See the leaderboards' })).toHaveAttribute(
      'href',
      '/contests/acme/spring/leaderboards',
    );
    expect(screen.queryByRole('button', { name: 'Register' })).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('links a visitor to the public leaderboards', async () => {
    server.use(
      http.get(`${PUBLIC_API}/:org/:contest`, () => HttpResponse.json(publicContest)),
    );
    renderApp(PAGE);

    expect(await screen.findByRole('link', { name: 'See the leaderboards' })).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Spring 2026', level: 1 }),
    ).toBeVisible();
  });

  it('asks a visitor to sign in for a contest that is not public', async () => {
    server.use(
      http.get(`${PUBLIC_API}/:org/:contest`, () => problem(404, 'not_found')),
    );
    renderApp(PAGE);

    expect(
      await screen.findByRole('heading', { name: 'Sign in to see this contest' }),
    ).toBeVisible();
  });
});

describe('the contest page for its own organiser', () => {
  it('says they organise it instead of offering Register', async () => {
    server.use(
      signedIn,
      http.get(`${CONTEST_API}/home`, () =>
        HttpResponse.json(home({ organises: true })),
      ),
    );
    renderApp(PAGE);

    expect(
      await screen.findByRole('status', { name: 'Registration' }),
    ).toHaveTextContent('You organise this contest');
    expect(screen.queryByRole('button', { name: 'Register' })).not.toBeInTheDocument();
  });
});

describe('the contest page at its start', () => {
  it('counts to the start, then to the end, reading the home again as the contest starts', async () => {
    const starting = new Date(Date.parse('2026-09-12T10:00:00Z') + 1_500).toISOString();
    server.use(
      signedIn,
      homesInTurn([home({ start: starting, tasks: [] }), home({ start: starting })]),
    );
    renderApp(PAGE);

    expect(await screen.findByText('No tasks are released yet.')).toBeVisible();
    const timer = await screen.findByRole('timer', { name: 'Contest countdown' });
    await waitFor(() => expect(timer).toHaveTextContent(/^Contest starts in /));
    expect(await screen.findByRole('link', { name: 'Sum of Two' })).toBeVisible();
    expect(screen.getByRole('timer', { name: 'Contest countdown' })).toHaveTextContent(
      /^Contest ends in /,
    );
  });
});
