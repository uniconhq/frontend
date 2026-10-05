import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { Invite, Me } from '@/api/types';
import { renderApp } from '@/test/render';
import { problem, server, signedIn, someone } from '@/test/server';
import { contestList, taskList } from '@/test/organiser';
import { invite } from '@/test/invites';

const ORG_INVITES = '/api/v1/orgs/:org/invites';
const CONTEST_INVITES = '/api/v1/orgs/:org/contests/:contest/invites';

function signedInAs(roles: Me['roles']) {
  return http.get('/api/v1/me', () => HttpResponse.json({ ...someone, roles }));
}

/** The invites at the org as the routes change them, and each body sent. */
function orgInvites(start: Invite[]) {
  let invites = start;
  const sent: { path: string; body?: unknown }[] = [];
  const replace = (id: string, changes: Partial<Invite>) => {
    const changed = { ...invites.find((found) => found.id === id)!, ...changes };
    invites = invites.map((found) => (found.id === id ? changed : found));
    return changed;
  };
  server.use(
    signedIn,
    contestList,
    http.get(ORG_INVITES, () => HttpResponse.json(invites)),
    http.post(ORG_INVITES, async ({ request }) => {
      const body = (await request.json()) as Partial<Invite> & {
        grants: Invite['grants'];
      };
      sent.push({ path: new URL(request.url).pathname, body });
      const made = invite({
        id: `new-${invites.length}`,
        grants: body.grants,
        username: body.username ?? null,
        email: body.email ?? null,
        mail_status: 'waiting',
        mailed_at: null,
      });
      invites = [made, ...invites];
      return HttpResponse.json(made, { status: 201 });
    }),
    http.post(`${ORG_INVITES}/:id/send-again`, ({ request, params }) => {
      sent.push({ path: new URL(request.url).pathname });
      return HttpResponse.json(
        replace(String(params.id), { mail_status: 'waiting', mailed_at: null }),
      );
    }),
    http.post(`${ORG_INVITES}/:id/withdraw`, ({ request, params }) => {
      sent.push({ path: new URL(request.url).pathname });
      return HttpResponse.json(
        replace(String(params.id), {
          status: 'withdrawn',
          decided_at: '2026-09-12T09:00:00Z',
        }),
      );
    }),
  );
  return sent;
}

/** The row of the invites table that names `who`. */
async function row(who: string): Promise<HTMLElement> {
  const table = await screen.findByRole('table', { name: 'Invites' });
  const header = within(table).getByRole('rowheader', { name: new RegExp(who) });
  const found = header.closest('tr');
  if (found === null) throw new Error(`${who} is not in a row`);
  return found;
}

describe('the organisers’ invites', () => {
  it('lists each invite with what it grants, where it stands and its mail', async () => {
    orgInvites([
      invite(),
      invite({
        id: 'b',
        username: null,
        email: 'zed@example.org',
        grants: 'observer',
        expired: true,
        mail_status: 'failed',
        mailed_at: null,
      }),
      invite({
        id: 'c',
        username: 'fay',
        status: 'accepted',
        decided_at: '2026-09-11T10:00:00Z',
        mail_status: 'off',
        mailed_at: null,
      }),
    ]);
    renderApp('/orgs/acme');

    const eve = await row('eve');
    expect(eve).toHaveTextContent('Manager');
    expect(eve).toHaveTextContent('Pending');
    expect(eve).toHaveTextContent('Lapses');
    expect(eve).toHaveTextContent('Sent');
    expect(eve).toHaveTextContent('By kenny');
    const zed = await row('zed@example.org');
    expect(zed).toHaveTextContent('Observer');
    expect(zed).toHaveTextContent('Lapsed');
    expect(zed).toHaveTextContent('Failed to send');
    const fay = await row('fay');
    expect(fay).toHaveTextContent('Accepted');
    expect(fay).toHaveTextContent('No mail server');
  });

  it('offers Send again and Withdraw only on an invite still pending', async () => {
    orgInvites([
      invite(),
      invite({ id: 'b', username: 'zed', expired: true }),
      invite({ id: 'c', username: 'fay', mail_status: 'off', mailed_at: null }),
      invite({ id: 'd', username: 'gus', status: 'declined' }),
    ]);
    renderApp('/orgs/acme');

    const eve = await row('eve');
    expect(
      within(eve).getByRole('button', { name: 'Send again to eve' }),
    ).toBeVisible();
    expect(
      within(eve).getByRole('button', { name: 'Withdraw the invite for eve' }),
    ).toBeVisible();
    const zed = await row('zed');
    expect(within(zed).queryByRole('button', { name: /Send again/ })).toBeNull();
    expect(within(zed).getByRole('button', { name: /Withdraw/ })).toBeVisible();
    const fay = await row('fay');
    expect(within(fay).queryByRole('button', { name: /Send again/ })).toBeNull();
    expect(within(await row('gus')).queryByRole('button')).toBeNull();
  });

  it('invites a username to the role chosen', async () => {
    const sent = orgInvites([]);
    const user = userEvent.setup();
    renderApp('/orgs/acme');

    const form = await screen.findByRole('form', { name: 'Invite someone' });
    expect(await screen.findByText('No invites yet.')).toBeVisible();
    await user.type(
      within(form).getByLabelText('Username or email address', { exact: false }),
      ' dee ',
    );
    await user.selectOptions(within(form).getByLabelText('Role'), 'observer');
    await user.click(within(form).getByRole('button', { name: 'Invite' }));

    const dee = await row('dee');
    expect(dee).toHaveTextContent('Observer');
    expect(dee).toHaveTextContent('Waiting to send');
    expect(within(form).getByRole('status')).toHaveTextContent('Invited dee.');
    expect(
      within(form).getByLabelText('Username or email address', { exact: false }),
    ).toHaveValue('');
    expect(sent).toEqual([
      {
        path: '/api/v1/orgs/acme/invites',
        body: { grants: 'observer', username: 'dee' },
      },
    ]);
  });

  it('invites an email address when what is typed has an @', async () => {
    const sent = orgInvites([]);
    const user = userEvent.setup();
    renderApp('/orgs/acme');

    const form = await screen.findByRole('form', { name: 'Invite someone' });
    await user.type(
      within(form).getByLabelText('Username or email address', { exact: false }),
      'dee@example.org',
    );
    await user.click(within(form).getByRole('button', { name: 'Invite' }));

    expect(await row('dee@example.org')).toHaveTextContent('Manager');
    expect(sent[0]?.body).toEqual({ grants: 'manager', email: 'dee@example.org' });
  });

  it('says so when nobody has the username, and suggests the address', async () => {
    orgInvites([]);
    server.use(http.post(ORG_INVITES, () => problem(404, 'not_found')));
    const user = userEvent.setup();
    renderApp('/orgs/acme');

    const form = await screen.findByRole('form', { name: 'Invite someone' });
    await user.type(
      within(form).getByLabelText('Username or email address', { exact: false }),
      'nobody',
    );
    await user.click(within(form).getByRole('button', { name: 'Invite' }));

    expect(await within(form).findByRole('alert')).toHaveTextContent(
      'Nobody has the username nobody. Invite their email address instead',
    );
  });

  it('says in words that the person has the invite already', async () => {
    orgInvites([]);
    server.use(
      http.post(ORG_INVITES, () => problem(409, 'already_invited', { invite: 'a' })),
    );
    const user = userEvent.setup();
    renderApp('/orgs/acme');

    const form = await screen.findByRole('form', { name: 'Invite someone' });
    await user.type(
      within(form).getByLabelText('Username or email address', { exact: false }),
      'eve',
    );
    await user.click(within(form).getByRole('button', { name: 'Invite' }));

    const alert = await within(form).findByRole('alert');
    expect(alert).toHaveTextContent('They have this invite already');
    expect(alert).toHaveTextContent('where it can be sent again');
  });

  it('sends an invite again and withdraws one, each row as it comes back', async () => {
    const sent = orgInvites([invite()]);
    const user = userEvent.setup();
    renderApp('/orgs/acme');

    await user.click(
      within(await row('eve')).getByRole('button', { name: 'Send again to eve' }),
    );
    expect(await within(await row('eve')).findByText('Waiting to send')).toBeVisible();

    await user.click(
      within(await row('eve')).getByRole('button', {
        name: 'Withdraw the invite for eve',
      }),
    );
    expect(await within(await row('eve')).findByText('Withdrawn')).toBeVisible();
    expect(within(await row('eve')).queryByRole('button')).toBeNull();
    expect(sent.map((one) => one.path)).toEqual([
      `/api/v1/orgs/acme/invites/${invite().id}/send-again`,
      `/api/v1/orgs/acme/invites/${invite().id}/withdraw`,
    ]);
  });

  it('shows a refusal on the row it happened on', async () => {
    orgInvites([invite()]);
    server.use(
      http.post(`${ORG_INVITES}/:id/withdraw`, () =>
        problem(409, 'wrong_status', {
          detail: 'An invite that is accepted cannot be withdrawn.',
        }),
      ),
    );
    const user = userEvent.setup();
    renderApp('/orgs/acme');

    await user.click(
      within(await row('eve')).getByRole('button', { name: /Withdraw/ }),
    );
    expect(await within(await row('eve')).findByRole('alert')).toHaveTextContent(
      'An invite that is accepted cannot be withdrawn.',
    );
  });

  it('shows an observer the invites and nothing to change', async () => {
    server.use(
      signedInAs([
        { names: { org: 'acme', contest: null, task: null }, role: 'observer' },
      ]),
      contestList,
      http.get(ORG_INVITES, () => HttpResponse.json([invite()])),
    );
    renderApp('/orgs/acme');

    const eve = await row('eve');
    expect(within(eve).queryByRole('button')).toBeNull();
    expect(screen.queryByRole('form', { name: 'Invite someone' })).toBeNull();
  });

  it('offers a manager no admin invite and no change to one', async () => {
    server.use(
      signedInAs([
        { names: { org: 'acme', contest: 'spring', task: null }, role: 'manager' },
      ]),
      taskList,
      http.get(CONTEST_INVITES, () =>
        HttpResponse.json([
          invite({
            grants: 'admin',
            where: { org: 'acme', contest: 'spring', task: null },
          }),
        ]),
      ),
    );
    renderApp('/orgs/acme/contests/spring');

    expect(within(await row('eve')).queryByRole('button')).toBeNull();
    const form = screen.getByRole('form', { name: 'Invite someone' });
    const options = within(within(form).getByLabelText('Role')).getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual([
      'Manager',
      'Observer',
    ]);
  });
});

describe('the contestants’ invites', () => {
  it('invites someone to a place in the contest, and lists only those invites', async () => {
    let body: unknown = null;
    const spring = { org: 'acme', contest: 'spring', task: null };
    server.use(
      signedIn,
      http.get('/api/v1/orgs/:org/contests/:contest/contestants', () =>
        HttpResponse.json([]),
      ),
      http.get(CONTEST_INVITES, () =>
        HttpResponse.json([
          invite({ id: 'a', username: 'cal', grants: 'contestant', where: spring }),
          invite({ id: 'b', username: 'org', grants: 'observer', where: spring }),
        ]),
      ),
      http.post(CONTEST_INVITES, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(invite({ grants: 'contestant' }), { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderApp('/orgs/acme/contests/spring/contestants');

    const cal = await row('cal');
    expect(cal).toHaveTextContent('Pending');
    const table = screen.getByRole('table', { name: 'Invites' });
    expect(within(table).queryByText('org')).toBeNull();
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['Invited', 'Status', 'Mail', 'Actions']);

    const form = screen.getByRole('form', { name: 'Invite someone' });
    expect(within(form).queryByLabelText('Role')).toBeNull();
    await user.type(
      within(form).getByLabelText('Username or email address', { exact: false }),
      'dan@example.org',
    );
    await user.click(within(form).getByRole('button', { name: 'Invite' }));

    expect(await within(form).findByRole('status')).toHaveTextContent(
      'Invited dan@example.org.',
    );
    expect(body).toEqual({ grants: 'contestant', email: 'dan@example.org' });
  });
});
