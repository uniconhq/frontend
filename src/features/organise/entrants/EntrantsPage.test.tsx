import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@/test/user-event';
import { http, HttpResponse } from 'msw';
import type { OrganisedEntrant } from '@/api/types';
import { renderApp } from '@/test/render';
import { problem, server, signedIn, someone } from '@/test/server';
import { CONTEST_API, organisedEntrant } from '@/test/contestant';

const PAGE = '/orgs/acme/contests/spring/entrants';
const ROWS = `${CONTEST_API}/organise/entrants`;

const dee = {
  user_id: 21,
  user: {
    id: 21,
    username: 'dee',
    name: null,
    email: 'dee@u.nus.edu',
    avatar_url: null,
  },
  way_kind: 'signup' as const,
  way_name: 'NUS students',
  joined_at: '2026-09-12T09:10:00Z',
};

/** Red, carol and dee, approved, with 30 minutes on sum. */
const red = organisedEntrant({
  id: 'e-red',
  name: 'Red',
  display_name: 'Red',
  status: 'approved',
  time_extension: 1800,
  extension_tasks: ['sum'],
  members: [...organisedEntrant().members, dee],
});

/** Blue, eve alone so far, waiting and short of people. */
const blue = organisedEntrant({
  id: 'e-blue',
  name: 'Blue',
  display_name: 'Blue',
  complete: false,
  members: [
    {
      ...dee,
      user_id: 22,
      user: { ...dee.user, id: 22, username: 'eve', email: null },
      way_kind: 'invite',
      way_name: null,
    },
  ],
});

function row(name: string): HTMLElement {
  const table = screen.getByRole('table', { name: 'Entrants' });
  const found = within(table)
    .getAllByRole('row')
    .find((each) => within(each).queryByText(name) !== null);
  if (found === undefined) throw new Error(`${name} is not in a row`);
  return found;
}

/** The list as the actions change it, answering each with the entrant as it now stands. */
function entrantsWith(start: OrganisedEntrant[]) {
  let rows = start;
  const sent: { path: string; body: unknown }[] = [];
  const answer = (id: string, change: Partial<OrganisedEntrant>) => {
    rows = rows.map((found) => (found.id === id ? { ...found, ...change } : found));
    return HttpResponse.json(rows.find((found) => found.id === id));
  };
  const note = async (request: Request) => {
    const text = await request.text();
    sent.push({
      path: new URL(request.url).pathname,
      body: text === '' ? null : (JSON.parse(text) as unknown),
    });
  };
  server.use(
    http.get(ROWS, () => HttpResponse.json(rows)),
    http.post(`${ROWS}/:id/approve`, async ({ request, params }) => {
      await note(request);
      return answer(String(params.id), { status: 'approved' });
    }),
    http.post(`${ROWS}/:id/reject`, async ({ request, params }) => {
      await note(request);
      return answer(String(params.id), { status: 'rejected', reason: 'No.' });
    }),
    http.post(`${ROWS}/:id/remove`, async ({ request, params }) => {
      await note(request);
      return answer(String(params.id), { status: 'removed' });
    }),
    http.put(`${ROWS}/:id/extension`, async ({ request, params }) => {
      await note(request);
      return answer(String(params.id), { time_extension: 600, extension_tasks: null });
    }),
    http.post(`${ROWS}/:id/members/:user/move`, async ({ request, params }) => {
      await note(request);
      return answer(String(params.id), {});
    }),
  );
  return sent;
}

describe('the entrants page', () => {
  it('lists each entrant with its members, how each came in, its status and extra time', async () => {
    server.use(signedIn);
    entrantsWith([red, blue]);
    renderApp(PAGE);

    await screen.findByRole('table', { name: 'Entrants' });
    expect(screen.getByText('2 entrants, 1 waiting for approval.')).toBeVisible();
    expect(
      screen.getAllByRole('columnheader').map((header) => header.textContent),
    ).toEqual(['Entrant', 'Registration', 'Extra time', 'Actions']);
    expect(row('Red')).toHaveTextContent('carol');
    expect(row('Red')).toHaveTextContent('carol@example.org');
    expect(row('Red')).toHaveTextContent('Signed up: NUS students');
    expect(row('Red')).toHaveTextContent('Approved');
    expect(row('Red')).toHaveTextContent('30 min on sum');
    expect(row('Blue')).toHaveTextContent('Invited');
    expect(row('Blue')).toHaveTextContent('Waiting for approval');
    expect(row('Blue')).toHaveTextContent('Too few members to be approved yet.');
    expect(
      within(row('Blue')).getByRole('button', { name: 'Approve Blue' }),
    ).toBeDisabled();
  });

  it('filters by status, kept in the address', async () => {
    server.use(signedIn);
    entrantsWith([red, blue]);
    const user = userEvent.setup();
    const { router } = renderApp(PAGE);

    await user.selectOptions(
      await screen.findByRole('combobox', { name: 'Show' }),
      'approved',
    );

    expect(router.state.location.search).toBe('?status=approved');
    const table = screen.getByRole('table', { name: 'Entrants' });
    expect(within(table).getAllByRole('row')).toHaveLength(2);
    expect(table).not.toHaveTextContent('Blue');
  });

  it('approves, rejects with a reason and removes, asked first', async () => {
    server.use(signedIn);
    const waiting = organisedEntrant();
    const other = organisedEntrant({
      id: 'e-dee',
      display_name: 'dee',
      members: [dee],
    });
    const sent = entrantsWith([
      waiting,
      other,
      {
        ...red,
        name: null,
        display_name: 'finn',
        members: [
          { ...dee, user_id: 23, user: { ...dee.user, id: 23, username: 'finn' } },
        ],
      },
    ]);
    const user = userEvent.setup();
    renderApp(PAGE);

    await user.click(await screen.findByRole('button', { name: 'Approve carol' }));
    await waitFor(() => expect(row('carol')).toHaveTextContent('Approved'));

    await user.click(screen.getByRole('button', { name: 'Reject dee' }));
    await user.type(screen.getByRole('textbox', { name: /Reason/ }), 'No.');
    await user.click(
      within(screen.getByRole('form', { name: 'Reject dee' })).getByRole('button', {
        name: 'Reject',
      }),
    );
    await waitFor(() => expect(row('dee')).toHaveTextContent('Rejected'));

    await user.click(screen.getByRole('button', { name: 'Remove finn' }));
    const dialog = await screen.findByRole('dialog', { name: 'Remove finn?' });
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(row('finn')).toHaveTextContent('Removed'));

    expect(sent).toEqual([
      {
        path: '/api/v1/orgs/acme/contests/spring/organise/entrants/0e000000-0000-4000-8000-000000000020/approve',
        body: null,
      },
      {
        path: '/api/v1/orgs/acme/contests/spring/organise/entrants/e-dee/reject',
        body: { reason: 'No.' },
      },
      {
        path: '/api/v1/orgs/acme/contests/spring/organise/entrants/e-red/remove',
        body: null,
      },
    ]);
  });

  it('gives extra time and moves a member to another team from Manage', async () => {
    server.use(
      signedIn,
      http.get(`${CONTEST_API}/tasks`, () => HttpResponse.json([{ name: 'sum' }])),
    );
    const sent = entrantsWith([red, blue]);
    const user = userEvent.setup();
    renderApp(PAGE);

    await user.click(await screen.findByRole('button', { name: 'Manage Red' }));
    const dialog = await screen.findByRole('dialog', { name: 'Manage Red' });
    const minutes = within(dialog).getByRole('textbox', { name: /Extra minutes/ });
    await user.clear(minutes);
    await user.type(minutes, '10');
    await user.click(within(dialog).getByRole('checkbox', { name: 'On every task' }));
    await user.click(
      within(dialog).getByRole('button', { name: 'Save the extra time' }),
    );
    expect(await within(dialog).findByText('The extra time is saved.')).toBeVisible();

    await user.click(within(dialog).getByRole('button', { name: 'Move dee' }));
    await user.selectOptions(
      within(dialog).getByRole('combobox', { name: 'Move dee to' }),
      'e-blue',
    );
    expect(dialog).toHaveTextContent('and gain access to those of Blue instead.');
    await user.click(within(dialog).getByRole('button', { name: 'Move' }));

    await waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[0]).toEqual({
      path: '/api/v1/orgs/acme/contests/spring/organise/entrants/e-red/extension',
      body: { seconds: 600, tasks: null },
    });
    expect(sent[1]).toEqual({
      path: '/api/v1/orgs/acme/contests/spring/organise/entrants/e-red/members/21/move',
      body: { to: 'e-blue' },
    });
  });

  it('invites someone straight into a team', async () => {
    let body: unknown = null;
    server.use(
      signedIn,
      http.post(`${CONTEST_API}/invites`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({}, { status: 201 });
      }),
    );
    entrantsWith([red, blue]);
    const user = userEvent.setup();
    renderApp(PAGE);

    await user.click(await screen.findByRole('button', { name: 'Manage Blue' }));
    const dialog = await screen.findByRole('dialog', { name: 'Manage Blue' });
    await user.type(
      within(dialog).getByRole('textbox', { name: /Invite someone into it/ }),
      'finn',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Invite' }));

    expect(
      await within(dialog).findByText('Invited finn. They join Blue once they accept.'),
    ).toBeVisible();
    expect(body).toEqual({ grants: 'contestant', username: 'finn', entrant: 'e-blue' });
  });

  it('keeps a team that has submitted from being deleted, saying why', async () => {
    server.use(signedIn);
    entrantsWith([{ ...red, submitted: true }]);
    const user = userEvent.setup();
    renderApp(PAGE);

    await user.click(await screen.findByRole('button', { name: 'Manage Red' }));
    const dialog = await screen.findByRole('dialog', { name: 'Manage Red' });
    expect(
      within(dialog).queryByRole('button', { name: 'Delete this entrant' }),
    ).toBeNull();
    expect(dialog).toHaveTextContent('It has submitted, so it stays with its results.');
  });

  it('says a refusal where the action was taken', async () => {
    server.use(
      signedIn,
      http.post(`${ROWS}/:id/approve`, () =>
        problem(409, 'entrant_incomplete', { fewest: 2 }),
      ),
    );
    server.use(http.get(ROWS, () => HttpResponse.json([organisedEntrant()])));
    const user = userEvent.setup();
    renderApp(PAGE);

    await user.click(await screen.findByRole('button', { name: 'Approve carol' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A team in this contest needs at least 2 people',
    );
  });

  it('shows an observer the list without actions', async () => {
    server.use(
      http.get('/api/v1/me', () =>
        HttpResponse.json({
          ...someone,
          roles: [
            { names: { org: 'acme', contest: 'spring', task: null }, role: 'observer' },
          ],
        }),
      ),
    );
    entrantsWith([red]);
    renderApp(PAGE);

    await screen.findByRole('table', { name: 'Entrants' });
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Manage Red' })).toBeNull();
  });

  it('says when nobody has registered', async () => {
    server.use(signedIn);
    renderApp(PAGE);

    expect(await screen.findByText('Nobody has registered yet.')).toBeVisible();
  });

  it('is where the old contestants and teams pages lead', async () => {
    server.use(signedIn);
    const { router } = renderApp('/orgs/acme/contests/spring/teams?status=pending');

    await screen.findByText('Nobody has registered yet.');
    expect(router.state.location.pathname).toBe(PAGE);
    expect(router.state.location.search).toBe('?status=pending');
  });
});
