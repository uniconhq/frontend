import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { formatDateTime } from '@/lib/time';
import { icpc } from '@/test/boards';
import { renderApp } from '@/test/render';
import { problem, server, signedIn } from '@/test/server';
import {
  CONTEST_API,
  PUBLIC_API,
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
    expect(
      await screen.findByRole('timer', { name: 'Contest countdown' }),
    ).toHaveTextContent(/Contest ends in (29m 5\ds|30m 00s)/);
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
                worth: '100',
                release: { released: true, visible: true, open: true, closed: null },
                due: '2026-09-12T10:45:00Z',
                closes: '2026-09-12T11:00:00Z',
              },
              {
                name: 'max',
                label: 'B',
                title: 'Maximum',
                worth: null,
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
    expect(sum).toHaveTextContent(
      `Due ${formatDateTime(new Date('2026-09-12T10:45:00Z'))}`,
    );
    expect(sum).toHaveTextContent(
      `Closes ${formatDateTime(new Date('2026-09-12T11:00:00Z'))}`,
    );
    expect(max).not.toHaveTextContent('Due');
    expect(max).toHaveTextContent('Closes');
  });

  it('registers and then shows the registration waiting', async () => {
    let body: unknown = null;
    server.use(
      signedIn,
      homesInTurn([home(), home({ registration: registration() })]),
      http.post(`${CONTEST_API}/registration`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(registration(), { status: 201 });
      }),
    );
    renderApp(PAGE);

    await userEvent.click(await screen.findByRole('button', { name: 'Register' }));

    expect(await screen.findByText('Your registration is waiting')).toBeVisible();
    expect(body).toEqual({ invite_code: null });
  });

  it('asks for the contest’s code when it takes one, and sends it', async () => {
    let body: unknown = null;
    server.use(
      signedIn,
      http.get(`${CONTEST_API}/home`, () =>
        HttpResponse.json(home({ asks_code: true })),
      ),
      http.post(`${CONTEST_API}/registration`, async ({ request }) => {
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
    expect(body).toEqual({ invite_code: 'sesame' });
  });

  it.each([
    ['registration_closed', 403, 'Registration is closed'],
    ['is_staff', 403, 'You organise this contest'],
    ['invite_required', 403, 'This contest is by invitation'],
    ['domain_not_allowed', 403, 'Your email address is not accepted'],
    ['already_registered', 409, 'You have registered already'],
    ['contest_full', 409, 'The contest is full'],
  ])('says a %s refusal in words', async (code, status, sentence) => {
    server.use(
      signedIn,
      http.get(`${CONTEST_API}/home`, () => HttpResponse.json(home())),
      http.post(`${CONTEST_API}/registration`, () => problem(status, code)),
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
        HttpResponse.json(home({ registration_open: false })),
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
    expect(screen.queryByRole('button', { name: 'Register' })).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('shows the boards shown to everyone, read without a session', async () => {
    server.use(
      http.get(`${PUBLIC_API}/:org/:contest`, () => HttpResponse.json(publicContest)),
      http.get(`${PUBLIC_API}/:org/:contest/boards`, () =>
        HttpResponse.json([icpc({ who: 'everyone' })]),
      ),
    );
    renderApp(PAGE);

    expect(await screen.findByRole('table', { name: 'Standings' })).toBeVisible();
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

    expect(await screen.findByText('No task is released yet.')).toBeVisible();
    expect(
      await screen.findByRole('timer', { name: 'Contest countdown' }),
    ).toHaveTextContent(/^Contest starts in /);
    expect(
      await screen.findByRole('link', { name: 'Sum of Two' }, { timeout: 5_000 }),
    ).toBeVisible();
    expect(screen.getByRole('timer', { name: 'Contest countdown' })).toHaveTextContent(
      /^Contest ends in /,
    );
  });
});
