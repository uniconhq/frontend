import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { renderApp } from '@/test/render';
import { problem, server, signedIn, someone } from '@/test/server';
import { CONTEST_API, contestant } from '@/test/contestant';
import { BLUE, RED, member, team } from '@/test/teams';

const PAGE = '/orgs/acme/contests/spring/teams';
const TEAMS = `${CONTEST_API}/organise/teams`;

const red = team({
  leader: 20,
  members: [member('carol'), member('dee', { since: '2026-09-12T09:05:00Z' })],
  pending: [member('eve', { status: 'requested' })],
});
const blue = team({ id: BLUE, name: 'Blue', leader: null, members: [] });

function teamsAre(teams = [red, blue]) {
  return http.get(TEAMS, () => HttpResponse.json(teams));
}

async function card(name: string): Promise<HTMLElement> {
  return screen.findByRole('region', { name });
}

describe('the teams page', () => {
  it('lists every team with its leader, members and the people waiting', async () => {
    server.use(signedIn, teamsAre());
    renderApp(PAGE);

    const found = await card('Red');
    expect(found).toHaveTextContent('Led by carol. 2 in it. It has not submitted yet.');
    const members = within(found).getByRole('table', { name: 'Members of Red' });
    expect(within(members).getByText('carol').closest('tr')).toHaveTextContent(
      'Leader',
    );
    const waiting = within(found).getByRole('table', { name: 'Waiting to join Red' });
    expect(within(waiting).getByText('eve').closest('tr')).toHaveTextContent(
      'Asked to join',
    );
    expect(await card('Blue')).toHaveTextContent('Nobody is in this team.');
    const trail = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(trail).getByRole('link', { name: 'teams' })).toHaveAttribute(
      'href',
      PAGE,
    );
  });

  it('shows an observer the teams without the actions', async () => {
    server.use(
      http.get('/api/v1/me', () =>
        HttpResponse.json({
          ...someone,
          roles: [
            { names: { org: 'acme', contest: 'spring', task: null }, role: 'observer' },
          ],
        }),
      ),
      teamsAre(),
    );
    renderApp(PAGE);

    const found = await card('Red');
    expect(within(found).queryByRole('button')).toBeNull();
    expect(screen.queryByRole('form', { name: 'Make a team' })).toBeNull();
  });

  it('is reached from the contest page', async () => {
    server.use(
      signedIn,
      http.get(`${CONTEST_API}/tasks`, () => HttpResponse.json([])),
      http.get(`${CONTEST_API}/tree`, () => HttpResponse.json([])),
    );
    renderApp('/orgs/acme/contests/spring');

    expect(await screen.findByRole('link', { name: 'Teams' })).toHaveAttribute(
      'href',
      PAGE,
    );
  });

  it('makes a team with a leader', async () => {
    let body: unknown = null;
    let teams = [red];
    server.use(
      signedIn,
      http.get(TEAMS, () => HttpResponse.json(teams)),
      http.post(TEAMS, async ({ request }) => {
        body = await request.json();
        const made = team({
          id: BLUE,
          name: 'Blue',
          leader: 22,
          members: [member('eve')],
        });
        teams = [made, red];
        return HttpResponse.json(made, { status: 201 });
      }),
    );
    renderApp(PAGE);

    const form = await screen.findByRole('form', { name: 'Make a team' });
    await userEvent.type(within(form).getByLabelText(/Team name/), 'Blue');
    await userEvent.type(within(form).getByLabelText(/Leader/), 'eve');
    await userEvent.click(within(form).getByRole('button', { name: 'Make the team' }));

    expect(await within(form).findByRole('status')).toHaveTextContent(
      'Made the team Blue.',
    );
    expect(await card('Blue')).toHaveTextContent('Led by eve.');
    expect(body).toEqual({ name: 'Blue', leader: 'eve' });
  });

  it('makes an empty team when no leader is named, and says a refusal in words', async () => {
    let body: unknown = null;
    server.use(
      signedIn,
      teamsAre([red]),
      http.post(TEAMS, async ({ request }) => {
        body = await request.json();
        return problem(409, 'teams_off');
      }),
    );
    renderApp(PAGE);

    const form = await screen.findByRole('form', { name: 'Make a team' });
    await userEvent.type(within(form).getByLabelText(/Team name/), 'Blue');
    await userEvent.click(within(form).getByRole('button', { name: 'Make the team' }));

    expect(await within(form).findByRole('alert')).toHaveTextContent(
      'This contest has no teams',
    );
    expect(body).toEqual({ name: 'Blue', leader: null });
  });

  it('moves a member to the team picked, after naming it', async () => {
    let moved: unknown = null;
    server.use(
      signedIn,
      teamsAre(),
      http.post(`${TEAMS}/:team/members`, async ({ params, request }) => {
        moved = { team: params.team, body: await request.json() };
        return HttpResponse.json(blue);
      }),
    );
    renderApp(PAGE);

    const found = await card('Red');
    await userEvent.click(within(found).getByRole('button', { name: 'Move dee' }));
    const dialog = await screen.findByRole('dialog', { name: 'Move dee out of Red?' });
    expect(within(dialog).getByRole('button', { name: 'Move' })).toBeDisabled();
    await userEvent.selectOptions(within(dialog).getByLabelText('Move to'), 'Blue');
    expect(dialog).toHaveTextContent(
      'dee stops reaching the submissions and questions of Red and reaches those of Blue instead.',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Move to Blue' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Move dee out of Red?' })).toBeNull(),
    );
    expect(moved).toEqual({ team: BLUE, body: { user_id: 21 } });
  });

  it('keeps the move open with the refusal when the team picked is full', async () => {
    server.use(
      signedIn,
      teamsAre(),
      http.post(`${TEAMS}/:team/members`, () =>
        problem(409, 'team_full', { limit: 3 }),
      ),
    );
    renderApp(PAGE);

    const found = await card('Red');
    await userEvent.click(within(found).getByRole('button', { name: 'Move dee' }));
    const dialog = await screen.findByRole('dialog', { name: 'Move dee out of Red?' });
    await userEvent.selectOptions(within(dialog).getByLabelText('Move to'), 'Blue');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Move to Blue' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'A team in this contest holds at most 3.',
    );
  });

  it('removes a member after a confirmation naming the team', async () => {
    let removed: unknown = null;
    server.use(
      signedIn,
      teamsAre(),
      http.delete(`${TEAMS}/:team/members/:user`, ({ params }) => {
        removed = `${String(params.team)} ${String(params.user)}`;
        return HttpResponse.json(red);
      }),
    );
    renderApp(PAGE);

    const found = await card('Red');
    await userEvent.click(within(found).getByRole('button', { name: 'Remove carol' }));
    const dialog = await screen.findByRole('dialog', {
      name: 'Remove carol from Red?',
    });
    expect(dialog).toHaveTextContent(
      'The lead passes to the member who joined earliest.',
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Remove from Red' }),
    );

    await waitFor(() => expect(removed).toBe(`${RED} 20`));
  });

  it('turns down a request without asking', async () => {
    let removed: unknown = null;
    server.use(
      signedIn,
      teamsAre(),
      http.delete(`${TEAMS}/:team/members/:user`, ({ params }) => {
        removed = params.user;
        return HttpResponse.json(red);
      }),
    );
    renderApp(PAGE);

    const found = await card('Red');
    await userEvent.click(
      within(found).getByRole('button', { name: 'Turn down the request of eve' }),
    );

    await waitFor(() => expect(removed).toBe('22'));
  });

  it('makes a member the leader', async () => {
    let body: unknown = null;
    server.use(
      signedIn,
      teamsAre(),
      http.put(`${TEAMS}/:team/leader`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(red);
      }),
    );
    renderApp(PAGE);

    const found = await card('Red');
    expect(
      within(found).queryByRole('button', { name: 'Make carol the leader' }),
    ).toBeNull();
    await userEvent.click(
      within(found).getByRole('button', { name: 'Make dee the leader' }),
    );

    await waitFor(() => expect(body).toEqual({ user_id: 21 }));
  });

  it('adds an approved contestant, saying the team they leave', async () => {
    let moved: unknown = null;
    server.use(
      signedIn,
      teamsAre(),
      http.get(`${CONTEST_API}/contestants`, () =>
        HttpResponse.json([
          contestant({ status: 'approved' }),
          contestant({
            user_id: 23,
            user: {
              id: 23,
              username: 'finn',
              name: null,
              email: null,
              avatar_url: null,
            },
            status: 'approved',
          }),
          contestant({
            user_id: 24,
            user: {
              id: 24,
              username: 'gus',
              name: null,
              email: null,
              avatar_url: null,
            },
          }),
        ]),
      ),
      http.post(`${TEAMS}/:team/members`, async ({ params, request }) => {
        moved = { team: params.team, body: await request.json() };
        return HttpResponse.json(blue);
      }),
    );
    renderApp(PAGE);

    const found = await card('Blue');
    await userEvent.click(
      within(found).getByRole('button', { name: 'Add a contestant to Blue' }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Add a contestant to Blue?',
    });
    const choice = within(dialog).getByLabelText('Contestant');
    expect(
      within(choice)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Choose an approved contestant', 'carol (in Red)', 'finn']);
    await userEvent.selectOptions(choice, 'carol (in Red)');
    expect(dialog).toHaveTextContent(
      'carol reaches the submissions and questions of Blue and stops reaching those of Red.',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add to Blue' }));

    await waitFor(() => expect(moved).toEqual({ team: BLUE, body: { user_id: 20 } }));
  });

  it('deletes a team after asking, and keeps one that has submitted', async () => {
    let deleted: unknown = null;
    let teams = [team({ submitted: true }), blue];
    server.use(
      signedIn,
      http.get(TEAMS, () => HttpResponse.json(teams)),
      http.delete(`${TEAMS}/:team`, ({ params }) => {
        deleted = params.team;
        teams = teams.filter((found) => found.id !== BLUE);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderApp(PAGE);

    const kept = await card('Red');
    expect(within(kept).getByRole('button', { name: 'Delete Red' })).toBeDisabled();
    expect(kept).toHaveTextContent(
      'A team that has submitted stays with its results, so it is not deleted.',
    );

    await userEvent.click(
      within(await card('Blue')).getByRole('button', { name: 'Delete Blue' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Delete Blue?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete Blue' }));

    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Blue' })).toBeNull(),
    );
    expect(deleted).toBe(BLUE);
  });
});

describe('the teams page’s forms', () => {
  it.each([
    ['not_found', 404, 'Nobody has the username zed.'],
    [
      'not_approved',
      403,
      'zed is not an approved contestant of this contest, so they cannot lead a team yet.',
    ],
  ])('says a %s refusal of the leader in words', async (code, status, sentence) => {
    server.use(
      signedIn,
      teamsAre([red]),
      http.post(TEAMS, () => problem(status, code)),
    );
    renderApp(PAGE);

    const form = await screen.findByRole('form', { name: 'Make a team' });
    await userEvent.type(within(form).getByLabelText(/Team name/), 'Blue');
    await userEvent.type(within(form).getByLabelText(/Leader/), 'zed');
    await userEvent.click(within(form).getByRole('button', { name: 'Make the team' }));

    expect(await within(form).findByRole('alert')).toHaveTextContent(sentence);
  });

  it('shows the contestants loading in the add dialog', async () => {
    server.use(
      signedIn,
      teamsAre(),
      http.get(`${CONTEST_API}/contestants`, async () => {
        await delay('infinite');
        return HttpResponse.json([]);
      }),
    );
    renderApp(PAGE);

    await userEvent.click(
      within(await card('Blue')).getByRole('button', {
        name: 'Add a contestant to Blue',
      }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Add a contestant to Blue?',
    });
    expect(within(dialog).getByRole('status', { name: 'Loading' })).toBeVisible();
    expect(dialog).not.toHaveTextContent('Every approved contestant');
  });

  it('shows why the contestants would not load in the add dialog, with a retry', async () => {
    let failing = true;
    server.use(
      signedIn,
      teamsAre(),
      http.get(`${CONTEST_API}/contestants`, () =>
        failing
          ? problem(403, 'forbidden')
          : HttpResponse.json([contestant({ status: 'approved' })]),
      ),
    );
    renderApp(PAGE);

    await userEvent.click(
      within(await card('Blue')).getByRole('button', {
        name: 'Add a contestant to Blue',
      }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Add a contestant to Blue?',
    });
    expect(await within(dialog).findByText('You cannot do that')).toBeVisible();
    expect(dialog).not.toHaveTextContent('Every approved contestant');

    failing = false;
    await userEvent.click(within(dialog).getByRole('button', { name: 'Try again' }));
    expect(await within(dialog).findByLabelText('Contestant')).toBeVisible();
  });

  it('reads the list again when a confirmation opens', async () => {
    let reads = 0;
    server.use(
      signedIn,
      http.get(TEAMS, () => {
        reads += 1;
        return HttpResponse.json([red, blue]);
      }),
    );
    renderApp(PAGE);

    const found = await card('Red');
    await waitFor(() => expect(reads).toBe(1));
    await userEvent.click(within(found).getByRole('button', { name: 'Remove carol' }));

    await screen.findByRole('dialog', { name: 'Remove carol from Red?' });
    await waitFor(() => expect(reads).toBe(2));
  });
});
