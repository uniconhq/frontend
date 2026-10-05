import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderApp } from '@/test/render';
import { problem, server, signedIn } from '@/test/server';
import { CONTEST_API, home, registration } from '@/test/contestant';
import { BLUE, RED, listed, member, myTeams, team } from '@/test/teams';
import type { MyTeams } from '@/api/types';

const PAGE = '/contests/acme/spring';
const MY_TEAM = `${CONTEST_API}/my-team`;
const TEAMS = `${CONTEST_API}/teams`;

const approved = http.get(`${CONTEST_API}/home`, () =>
  HttpResponse.json(home({ registration: registration({ status: 'approved' }) })),
);

/** The caller's teams answering each record in turn, then the last one for good. */
function mineInTurn(records: MyTeams[]) {
  let asked = 0;
  return http.get(MY_TEAM, () => {
    const record = records[Math.min(asked, records.length - 1)];
    asked += 1;
    return HttpResponse.json(record);
  });
}

function teamList(teams = [listed()]) {
  return http.get(TEAMS, () => HttpResponse.json(teams));
}

async function section(): Promise<HTMLElement> {
  return screen.findByRole('region', { name: 'Team' });
}

/** The list item that names `text`. */
function item(list: HTMLElement, text: string): HTMLElement {
  const found = within(list).getByText(text).closest('li');
  if (found === null) throw new Error(`${text} is not in a list item`);
  return found;
}

/** kenny leading Red with carol, dee asking to join and eve invited. */
const leading = team({
  leader: 7,
  members: [member('kenny'), member('carol', { since: '2026-09-12T09:05:00Z' })],
  pending: [
    member('dee', { status: 'requested' }),
    member('eve', { status: 'invited' }),
  ],
});

describe('the team section on the contest page', () => {
  it('is not there when the contest has no teams', async () => {
    let asked = false;
    server.use(
      signedIn,
      approved,
      http.get(MY_TEAM, () => {
        asked = true;
        return problem(409, 'teams_off');
      }),
    );
    renderApp(PAGE);

    await screen.findByRole('heading', { name: 'Spring 2026', level: 1 });
    await waitFor(() => expect(asked).toBe(true));
    expect(screen.queryByRole('region', { name: 'Team' })).toBeNull();
  });

  it('is not there before the registration is approved', async () => {
    let asked = false;
    server.use(
      signedIn,
      http.get(`${CONTEST_API}/home`, () =>
        HttpResponse.json(home({ registration: registration() })),
      ),
      http.get(MY_TEAM, () => {
        asked = true;
        return HttpResponse.json(myTeams());
      }),
    );
    renderApp(PAGE);

    expect(await screen.findByText('Your registration is waiting')).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Team' })).toBeNull();
    expect(asked).toBe(false);
  });

  it('lists the teams with their places and asks to join one', async () => {
    let asked: unknown = null;
    server.use(
      signedIn,
      approved,
      mineInTurn([myTeams(), myTeams({ requested: [listed()] })]),
      teamList([listed(), listed({ id: BLUE, name: 'Blue', size: 3 })]),
      http.post(`${TEAMS}/:team/request`, ({ params }) => {
        asked = params.team;
        return HttpResponse.json(
          team({ pending: [member('kenny', { status: 'requested' })] }),
        );
      }),
    );
    renderApp(PAGE);

    const found = await section();
    expect(found).toHaveTextContent('This contest is entered in teams of up to 3.');
    const teams = await within(found).findByRole('list', { name: 'Teams' });
    expect(item(teams, 'Red')).toHaveTextContent('Led by carol · 1 of 3 places taken');
    expect(item(teams, 'Blue')).toHaveTextContent('This team is full.');
    expect(
      within(item(teams, 'Blue')).queryByRole('button', { name: /Ask to join/ }),
    ).toBeNull();

    await userEvent.click(
      within(teams).getByRole('button', { name: 'Ask to join Red' }),
    );

    const requests = await within(found).findByRole('list', { name: 'Your requests' });
    expect(within(requests).getByText('Red')).toBeVisible();
    expect(item(teams, 'Red')).toHaveTextContent('You have asked to join.');
    expect(asked).toBe(RED);
  });

  it('makes a team, which the caller then leads', async () => {
    let body: unknown = null;
    const made = team({ name: 'Green', leader: 7, members: [member('kenny')] });
    server.use(
      signedIn,
      approved,
      mineInTurn([myTeams(), myTeams({ team: made })]),
      teamList([]),
      http.post(TEAMS, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(made, { status: 201 });
      }),
    );
    renderApp(PAGE);

    const found = await section();
    expect(await within(found).findByText('Nobody has made a team yet.')).toBeVisible();
    await userEvent.type(within(found).getByLabelText(/Team name/), 'Green');
    await userEvent.click(within(found).getByRole('button', { name: 'Make the team' }));

    expect(
      await within(found).findByRole('heading', { name: 'Your team' }),
    ).toBeVisible();
    const members = within(found).getByRole('list', { name: 'Members' });
    expect(item(members, 'kenny')).toHaveTextContent('Leader · You');
    expect(body).toEqual({ name: 'Green' });
    await waitFor(() => expect(found).toHaveFocus());
  });

  it('says a refused team in words', async () => {
    server.use(
      signedIn,
      approved,
      mineInTurn([myTeams()]),
      teamList([]),
      http.post(TEAMS, () => problem(409, 'team_name_taken')),
    );
    renderApp(PAGE);

    const found = await section();
    await userEvent.type(within(found).getByLabelText(/Team name/), 'Red');
    await userEvent.click(within(found).getByRole('button', { name: 'Make the team' }));

    expect(await within(found).findByRole('alert')).toHaveTextContent(
      'That team name is taken',
    );
  });

  it('accepts an invitation, which puts the caller in the team', async () => {
    let accepted: unknown = null;
    const joined = team({ members: [member('carol'), member('kenny')] });
    server.use(
      signedIn,
      approved,
      mineInTurn([myTeams({ invited_to: [listed()] }), myTeams({ team: joined })]),
      teamList(),
      http.post(`${TEAMS}/:team/request`, ({ params }) => {
        accepted = params.team;
        return HttpResponse.json(joined);
      }),
    );
    renderApp(PAGE);

    const found = await section();
    const invitations = within(found).getByRole('list', {
      name: 'Invitations for you',
    });
    expect(item(invitations, 'Red')).toHaveTextContent('Led by carol');
    await userEvent.click(
      within(invitations).getByRole('button', { name: 'Accept the invitation to Red' }),
    );

    expect(
      await within(found).findByRole('heading', { name: 'Your team' }),
    ).toBeVisible();
    expect(accepted).toBe(RED);
  });

  it('declines an invitation, and keeps Accept off for a full team', async () => {
    let declined: unknown = null;
    server.use(
      signedIn,
      approved,
      mineInTurn([
        myTeams({
          invited_to: [listed(), listed({ id: BLUE, name: 'Blue', size: 3 })],
        }),
        myTeams({ invited_to: [listed({ id: BLUE, name: 'Blue', size: 3 })] }),
      ]),
      teamList(),
      http.post(`${TEAMS}/:team/cancel`, ({ params }) => {
        declined = params.team;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderApp(PAGE);

    const found = await section();
    const invitations = within(found).getByRole('list', {
      name: 'Invitations for you',
    });
    expect(item(invitations, 'Blue')).toHaveTextContent('This team is full.');
    expect(
      within(invitations).getByRole('button', {
        name: 'Accept the invitation to Blue',
      }),
    ).toBeDisabled();

    await userEvent.click(
      within(invitations).getByRole('button', {
        name: 'Decline the invitation to Red',
      }),
    );

    await waitFor(() => expect(within(invitations).queryByText('Red')).toBeNull());
    expect(declined).toBe(RED);
  });

  it('withdraws a request to join', async () => {
    let withdrawn: unknown = null;
    server.use(
      signedIn,
      approved,
      mineInTurn([myTeams({ requested: [listed()] }), myTeams()]),
      teamList(),
      http.post(`${TEAMS}/:team/cancel`, ({ params }) => {
        withdrawn = params.team;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderApp(PAGE);

    const found = await section();
    await userEvent.click(
      within(found).getByRole('button', { name: 'Withdraw the request to join Red' }),
    );

    await waitFor(() =>
      expect(within(found).queryByRole('list', { name: 'Your requests' })).toBeNull(),
    );
    expect(withdrawn).toBe(RED);
  });
});

describe('the team section for a member', () => {
  it('shows the team to a member without the leader’s actions', async () => {
    server.use(
      signedIn,
      approved,
      mineInTurn([
        myTeams({
          team: team({
            members: [member('carol'), member('kenny')],
            pending: [member('dee', { status: 'requested' })],
          }),
        }),
      ]),
    );
    renderApp(PAGE);

    const found = await section();
    expect(within(found).getByText('Red')).toBeVisible();
    expect(found).toHaveTextContent('2 of 3 places taken.');
    const members = within(found).getByRole('list', { name: 'Members' });
    expect(item(members, 'carol')).toHaveTextContent('Leader');
    expect(item(members, 'kenny')).toHaveTextContent('You');
    const waiting = within(found).getByRole('list', { name: 'Waiting to join' });
    expect(item(waiting, 'dee')).toHaveTextContent('Asked to join');
    expect(within(found).queryByRole('button', { name: /Approve|Remove/ })).toBeNull();
    expect(within(found).queryByRole('form', { name: /Invite/ })).toBeNull();
  });

  it('leaves the team after saying who leads next', async () => {
    let left = false;
    server.use(
      signedIn,
      approved,
      mineInTurn([myTeams({ team: leading }), myTeams()]),
      teamList(),
      http.post(`${MY_TEAM}/leave`, () => {
        left = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderApp(PAGE);

    const found = await section();
    await userEvent.click(
      within(found).getByRole('button', { name: 'Leave the team' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Leave Red?' });
    expect(dialog).toHaveTextContent('carol becomes the leader');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Leave' }));

    expect(
      await within(found).findByRole('form', { name: 'Make a team' }),
    ).toBeVisible();
    expect(left).toBe(true);
  });

  it('says a team left with nobody is deleted', async () => {
    server.use(
      signedIn,
      approved,
      mineInTurn([myTeams({ team: team({ leader: 7, members: [member('kenny')] }) })]),
    );
    renderApp(PAGE);

    const found = await section();
    await userEvent.click(
      within(found).getByRole('button', { name: 'Leave the team' }),
    );
    expect(await screen.findByRole('dialog', { name: 'Leave Red?' })).toHaveTextContent(
      'Nobody is left in it, so the team is deleted.',
    );
  });
});

describe('the team section for its leader', () => {
  it('approves a request, refuses one and withdraws an invitation', async () => {
    const calls: string[] = [];
    server.use(
      signedIn,
      approved,
      mineInTurn([myTeams({ team: leading })]),
      http.post(`${TEAMS}/:team/members/:user/approve`, ({ params }) => {
        calls.push(`approve ${String(params.user)}`);
        return HttpResponse.json(leading);
      }),
      http.delete(`${TEAMS}/:team/members/:user`, ({ params }) => {
        calls.push(`delete ${String(params.user)}`);
        return HttpResponse.json(leading);
      }),
    );
    renderApp(PAGE);

    const found = await section();
    await userEvent.click(within(found).getByRole('button', { name: 'Approve dee' }));
    await waitFor(() => expect(calls).toEqual(['approve 21']));
    await userEvent.click(within(found).getByRole('button', { name: 'Refuse dee' }));
    await waitFor(() => expect(calls).toEqual(['approve 21', 'delete 21']));
    await userEvent.click(
      within(found).getByRole('button', { name: 'Withdraw the invitation for eve' }),
    );
    await waitFor(() =>
      expect(calls).toEqual(['approve 21', 'delete 21', 'delete 22']),
    );
  });

  it('removes a member after a confirmation naming the team', async () => {
    let removed: unknown = null;
    server.use(
      signedIn,
      approved,
      mineInTurn([myTeams({ team: leading })]),
      http.delete(`${TEAMS}/:team/members/:user`, ({ params }) => {
        removed = params.user;
        return HttpResponse.json(leading);
      }),
    );
    renderApp(PAGE);

    const found = await section();
    expect(within(found).queryByRole('button', { name: 'Remove kenny' })).toBeNull();
    await userEvent.click(within(found).getByRole('button', { name: 'Remove carol' }));
    const dialog = await screen.findByRole('dialog', {
      name: 'Remove carol from Red?',
    });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(removed).toBe('20'));
  });

  it('keeps Approve and Invite off while the team is full, and says why', async () => {
    server.use(
      signedIn,
      approved,
      mineInTurn([
        myTeams({
          team: team({
            leader: 7,
            members: [member('kenny'), member('carol'), member('eve')],
            pending: [member('dee', { status: 'requested' })],
          }),
        }),
      ]),
    );
    renderApp(PAGE);

    const found = await section();
    expect(within(found).getByRole('button', { name: 'Approve dee' })).toBeDisabled();
    expect(within(found).getByRole('button', { name: 'Invite' })).toBeDisabled();
    expect(within(found).getByLabelText(/Username/)).toBeDisabled();
    expect(found).toHaveTextContent(
      'Your team is full, since a team in this contest holds at most 3. Nobody else can join until someone leaves.',
    );
  });

  it('invites someone by their username', async () => {
    let body: unknown = null;
    server.use(
      signedIn,
      approved,
      mineInTurn([myTeams({ team: leading })]),
      http.post(`${TEAMS}/:team/invite`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(leading);
      }),
    );
    renderApp(PAGE);

    const found = await section();
    await userEvent.type(within(found).getByLabelText(/Username/), ' finn ');
    await userEvent.click(within(found).getByRole('button', { name: 'Invite' }));

    expect(await within(found).findByRole('status')).toHaveTextContent(
      'Invited finn. They join once they accept.',
    );
    expect(body).toEqual({ username: 'finn' });
  });

  it.each([
    ['not_found', 404, 'Nobody has the username zed.'],
    [
      'not_approved',
      403,
      'zed is not an approved contestant of this contest, so they cannot join a team yet.',
    ],
    ['submitted_alone', 409, 'Someone who has submitted on their own cannot join'],
  ])('says a %s refusal of an invite in words', async (code, status, sentence) => {
    server.use(
      signedIn,
      approved,
      mineInTurn([myTeams({ team: leading })]),
      http.post(`${TEAMS}/:team/invite`, () => problem(status, code)),
    );
    renderApp(PAGE);

    const found = await section();
    await userEvent.type(within(found).getByLabelText(/Username/), 'zed');
    await userEvent.click(within(found).getByRole('button', { name: 'Invite' }));

    expect(await within(found).findByRole('alert')).toHaveTextContent(sentence);
  });
});
