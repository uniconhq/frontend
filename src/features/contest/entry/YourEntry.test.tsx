import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@/test/user-event';
import { http, HttpResponse } from 'msw';
import type { ContestHome, MyEntry } from '@/api/types';
import { renderApp } from '@/test/render';
import { problem, server, signedIn } from '@/test/server';
import { CONTEST_API, entrant, entry, home } from '@/test/contestant';

const PAGE = '/contests/acme/spring';
const MINE = `${CONTEST_API}/entrants/mine`;

/** A contest entered in teams of two or three, fixed at its start. */
const teams = { most: 3, fewest: 2, locks: 'start' } satisfies Partial<MyEntry>;

/** kenny's team Red with carol in it, approved, until a test says otherwise. */
const red = entrant({
  name: 'Red',
  display_name: 'Red',
  status: 'approved',
  members: [
    ...entrant().members,
    {
      user_id: 20,
      user: { id: 20, username: 'carol', name: null, avatar_url: null },
      way_kind: 'signup',
      way_name: 'NUS students',
      joined_at: '2026-09-12T09:10:00Z',
    },
  ],
});

/** The home answering with the entry `entry` gives, read afresh each time. */
function homeWith(make: () => MyEntry, more: Partial<ContestHome> = {}) {
  return http.get(`${CONTEST_API}/home`, () =>
    HttpResponse.json(home({ registration: make(), ...more })),
  );
}

async function yourEntry(): Promise<HTMLElement> {
  return screen.findByRole('region', { name: 'Your entry' });
}

describe('your entry in a contest entered in teams', () => {
  it('registers a team by its name', async () => {
    let body: unknown = null;
    server.use(
      signedIn,
      homeWith(() => entry(teams)),
      http.post(`${CONTEST_API}/entrants`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(red, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderApp(PAGE);

    const part = await yourEntry();
    expect(part).toHaveTextContent('A team has 2 to 3 people.');
    await user.type(within(part).getByRole('textbox', { name: /Team name/ }), ' Red ');
    await user.click(within(part).getByRole('button', { name: 'Register the team' }));

    await screen.findByRole('region', { name: 'Your entry' });
    expect(body).toEqual({ name: 'Red', code: null });
  });

  it('shows the team’s members, how each came in, and the rules plainly', async () => {
    server.use(
      signedIn,
      homeWith(() => entry({ ...teams, entrant: red })),
    );
    renderApp(PAGE);

    const part = await yourEntry();
    expect(
      within(part).getByRole('status', { name: 'Registration' }),
    ).toHaveTextContent('Your team is in');
    const members = within(part).getByRole('list', { name: 'Members' });
    const [kenny, carol] = within(members).getAllByRole('listitem');
    expect(kenny).toHaveTextContent('You · Signed up');
    expect(carol).toHaveTextContent('Signed up: NUS students');
    expect(part).toHaveTextContent(
      'Until the contest starts, any member may invite others, rename the team or leave it.',
    );
  });

  it('invites by username or email address, and withdraws an invite', async () => {
    const bodies: unknown[] = [];
    const withdrawn: string[] = [];
    const waiting = entrant({
      ...red,
      invites: [
        {
          invite: 'i-dee',
          username: 'dee',
          email: null,
          invited_by: 20,
          by_organiser: false,
          expires_at: '2026-09-20T09:00:00Z',
        },
      ],
    });
    server.use(
      signedIn,
      homeWith(() => entry({ ...teams, most: 4, entrant: waiting })),
      http.post(`${MINE}/invites`, async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({}, { status: 201 });
      }),
      http.delete(`${MINE}/invites/:invite`, ({ params }) => {
        withdrawn.push(String(params.invite));
        return HttpResponse.json({});
      }),
    );
    const user = userEvent.setup();
    renderApp(PAGE);

    const part = await yourEntry();
    const invited = within(part).getByRole('list', { name: 'Invited, not joined yet' });
    expect(invited).toHaveTextContent('Invited by carol');
    const field = within(part).getByRole('textbox', { name: /Username or email/ });
    await user.type(field, 'eve@example.org');
    await user.click(within(part).getByRole('button', { name: 'Invite' }));
    expect(
      await within(part).findByText(
        'Invited eve@example.org. They join once they accept.',
      ),
    ).toBeVisible();
    await user.click(
      within(part).getByRole('button', { name: 'Withdraw the invite for dee' }),
    );

    expect(bodies).toEqual([{ email: 'eve@example.org' }]);
    expect(withdrawn).toEqual(['i-dee']);
  });

  it('says the team is full, counting the invites waiting', async () => {
    const full = entrant({
      ...red,
      invites: [
        {
          invite: 'i-dee',
          username: 'dee',
          email: null,
          invited_by: 7,
          by_organiser: false,
          expires_at: '2026-09-20T09:00:00Z',
        },
      ],
    });
    server.use(
      signedIn,
      homeWith(() => entry({ ...teams, entrant: full })),
    );
    renderApp(PAGE);

    const part = await yourEntry();
    const field = within(part).getByRole('textbox', { name: /Username or email/ });
    expect(field).toBeDisabled();
    expect(field).toHaveAccessibleDescription(
      'Your team is full: a team holds at most 3, counting the people invited.',
    );
  });

  it('renames the team and leaves it, asked first', async () => {
    const sent: unknown[] = [];
    let left = false;
    server.use(
      signedIn,
      homeWith(() => entry({ ...teams, entrant: red })),
      http.put(`${MINE}/name`, async ({ request }) => {
        sent.push(await request.json());
        return HttpResponse.json(red);
      }),
      http.post(`${MINE}/leave`, () => {
        left = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    renderApp(PAGE);

    const part = await yourEntry();
    const name = within(part).getByRole('textbox', { name: 'Team name' });
    await user.clear(name);
    await user.type(name, 'Crimson');
    await user.click(within(part).getByRole('button', { name: 'Rename' }));
    await user.click(within(part).getByRole('button', { name: 'Leave the team' }));
    const dialog = await screen.findByRole('dialog', { name: 'Leave Red?' });
    expect(dialog).toHaveTextContent(
      'You stop reaching the team’s submissions and questions.',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Leave' }));

    await screen.findByRole('region', { name: 'Your entry' });
    expect(sent).toEqual([{ name: 'Crimson' }]);
    await expect.poll(() => left).toBe(true);
  });

  it('offers nothing to change once the team is fixed', async () => {
    server.use(
      signedIn,
      homeWith(() => entry({ ...teams, entrant: { ...red, locked: true } })),
    );
    renderApp(PAGE);

    const part = await yourEntry();
    expect(part).toHaveTextContent(
      'Your team is fixed now: only the organisers change who is in it.',
    );
    expect(
      within(part).queryByRole('form', { name: 'Invite someone to your team' }),
    ).toBeNull();
    expect(within(part).queryByRole('button', { name: 'Leave the team' })).toBeNull();
  });

  it('says a team short of people is not complete yet', async () => {
    server.use(
      signedIn,
      homeWith(() =>
        entry({ ...teams, entrant: entrant({ name: 'Red', complete: false }) }),
      ),
    );
    renderApp(PAGE);

    expect(
      within(await yourEntry()).getByRole('status', { name: 'Registration' }),
    ).toHaveTextContent(
      'Your team is not complete yetA team needs at least 2 people before it can be approved. Invite the others below.',
    );
  });

  it('joins a team that invited the person, saying it moves them', async () => {
    const accepted: string[] = [];
    const own = entrant({ name: 'Solo', display_name: 'Solo' });
    server.use(
      signedIn,
      homeWith(() =>
        entry({
          ...teams,
          entrant: own,
          invitations: [
            {
              invite: 'i-blue',
              entrant: { id: 'e-blue', name: 'Blue' },
              by_organiser: false,
              expires_at: '2026-09-20T09:00:00Z',
            },
          ],
        }),
      ),
      http.post('/api/v1/me/invites/:invite/accept', ({ params }) => {
        accepted.push(String(params.invite));
        return HttpResponse.json({ invite: {}, entered: null });
      }),
    );
    const user = userEvent.setup();
    renderApp(PAGE);

    const part = await yourEntry();
    expect(part).toHaveTextContent(
      'Accepting one moves you out of Solo and into the team that invited you.',
    );
    await user.click(within(part).getByRole('button', { name: 'Join Blue' }));
    await expect.poll(() => accepted).toEqual(['i-blue']);
  });

  it('cannot join another team once its own has submitted', async () => {
    server.use(
      signedIn,
      homeWith(() =>
        entry({
          ...teams,
          entrant: { ...red, submitted: true },
          invitations: [
            {
              invite: 'i-blue',
              entrant: { id: 'e-blue', name: 'Blue' },
              by_organiser: true,
              expires_at: '2026-09-20T09:00:00Z',
            },
          ],
        }),
      ),
    );
    renderApp(PAGE);

    const part = await yourEntry();
    expect(part).toHaveTextContent(
      'You cannot move to another team, since yours has submitted.',
    );
    expect(within(part).getByRole('button', { name: 'Join Blue' })).toBeDisabled();
  });

  it('says a refusal in words until it is dismissed', async () => {
    server.use(
      signedIn,
      homeWith(() => entry({ ...teams, entrant: red })),
      http.post(`${MINE}/invites`, () => problem(403, 'roster_locked')),
    );
    const user = userEvent.setup();
    renderApp(PAGE);

    const part = await yourEntry();
    await user.type(
      within(part).getByRole('textbox', { name: /Username or email/ }),
      'dee',
    );
    await user.click(within(part).getByRole('button', { name: 'Invite' }));

    const alert = await within(part).findByRole('alert');
    expect(alert).toHaveTextContent('The team is fixed now');
    await user.click(within(alert).getByRole('button', { name: 'Dismiss' }));
    expect(within(part).queryByRole('alert')).toBeNull();
  });
});

describe('your entry in a contest everyone enters alone', () => {
  it('shows no team, and withdraws the registration, asked first', async () => {
    let left = false;
    server.use(
      signedIn,
      homeWith(() => entry({ entrant: entrant() })),
      http.post(`${MINE}/leave`, () => {
        left = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    renderApp(PAGE);

    const part = await yourEntry();
    expect(within(part).queryByRole('list', { name: 'Members' })).toBeNull();
    await user.click(
      within(part).getByRole('button', { name: 'Withdraw my registration' }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Withdraw your registration?',
    });
    await user.click(within(dialog).getByRole('button', { name: 'Withdraw' }));
    await expect.poll(() => left).toBe(true);
  });

  it('says why the person cannot register, from the refusal', async () => {
    server.use(
      signedIn,
      homeWith(() =>
        entry({
          can_register: false,
          refused: {
            code: 'domain_not_allowed',
            detail: 'This contest takes only some email addresses, and not yours.',
          },
        }),
      ),
    );
    renderApp(PAGE);

    expect(
      within(await yourEntry()).getByRole('status', { name: 'Registration' }),
    ).toHaveTextContent('Your email address is not accepted');
    expect(screen.queryByRole('button', { name: 'Register' })).toBeNull();
  });

  it('says the extra time the organisers gave', async () => {
    server.use(
      signedIn,
      homeWith(() =>
        entry({ entrant: entrant({ status: 'approved', time_extension: 1800 }) }),
      ),
    );
    renderApp(PAGE);

    expect(await yourEntry()).toHaveTextContent(
      'The organisers gave you 30 more minutes on every task.',
    );
  });
});
