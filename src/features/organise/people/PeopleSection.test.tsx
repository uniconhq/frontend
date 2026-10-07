import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { Holder, Me } from '@/api/types';
import { renderApp } from '@/test/render';
import { problem, server, signedIn, someone } from '@/test/server';
import { contestList, taskList } from '@/test/organiser';

const ORG_ROLES = '/api/v1/orgs/:org/roles';
const CONTEST_ROLES = '/api/v1/orgs/:org/contests/:contest/roles';

function holder(
  person: Partial<Holder['user']> = {},
  overrides: Partial<Omit<Holder, 'user'>> = {},
): Holder {
  return {
    user: { id: 21, username: 'dee', name: 'Dee Tan', avatar_url: null, ...person },
    role: 'manager',
    at_names: { org: 'acme', contest: null, task: null },
    ...overrides,
  };
}

const kennyAdmin = holder(
  { id: someone.user.id, username: someone.user.username, name: someone.user.name },
  { role: 'admin' },
);

function signedInAs(roles: Me['roles']) {
  return http.get('/api/v1/me', () => HttpResponse.json({ ...someone, roles }));
}

/** An org whose holders change as the routes are called, and what was sent. */
function orgWith(start: Holder[]) {
  let holders = start;
  const sent: { method: string; body?: unknown; path: string }[] = [];
  server.use(
    signedIn,
    contestList,
    http.get(ORG_ROLES, () => HttpResponse.json(holders)),
    http.post(ORG_ROLES, async ({ request }) => {
      const body = (await request.json()) as { username: string; role: Holder['role'] };
      sent.push({ method: 'POST', body, path: new URL(request.url).pathname });
      const others = holders.filter((found) => found.user.username !== body.username);
      holders = [
        ...others,
        holder({ id: 30, username: body.username }, { role: body.role }),
      ];
      return new HttpResponse(null, { status: 204 });
    }),
    http.delete(`${ORG_ROLES}/:user_id`, ({ request, params }) => {
      sent.push({ method: 'DELETE', path: new URL(request.url).pathname });
      holders = holders.filter((found) => String(found.user.id) !== params.user_id);
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return sent;
}

/** The row a person's username heads, with or without "(you)". */
function row(name: string): HTMLElement {
  const table = screen.getByRole('table', { name: 'Organisers' });
  const found = within(table)
    .getAllByRole('rowheader')
    .find((header) => {
      const first = header.querySelector('span')?.textContent;
      return first === name || first === `${name} (you)`;
    })
    ?.closest('tr');
  if (found === undefined || found === null) throw new Error(`${name} is not in a row`);
  return found;
}

describe('the organisers section', () => {
  it('lists who holds a role at the org, with the role and where it is held', async () => {
    orgWith([kennyAdmin, holder()]);
    renderApp('/orgs/acme');

    await screen.findByRole('table', { name: 'Organisers' });
    expect(within(row('kenny')).getByText('kenny (you)')).toBeVisible();
    expect(within(row('kenny')).getByText('Admin')).toBeVisible();
    expect(within(row('dee')).getByText('Manager')).toBeVisible();
    expect(within(row('dee')).getByText('Here')).toBeVisible();
  });

  it('adds someone by username with the role chosen', async () => {
    const sent = orgWith([kennyAdmin]);
    const user = userEvent.setup();
    renderApp('/orgs/acme');

    const form = await screen.findByRole('form', { name: 'Add someone' });
    await user.type(within(form).getByLabelText('Username', { exact: false }), ' eve ');
    await user.selectOptions(within(form).getByLabelText('Role'), 'observer');
    await user.click(within(form).getByRole('button', { name: 'Add' }));

    expect(await screen.findByText('eve')).toBeVisible();
    expect(sent).toEqual([
      {
        method: 'POST',
        body: { username: 'eve', role: 'observer' },
        path: '/api/v1/orgs/acme/roles',
      },
    ]);
    expect(within(form).getByLabelText('Username', { exact: false })).toHaveValue('');
  });

  it('says so when nobody has the username', async () => {
    orgWith([kennyAdmin]);
    server.use(http.post(ORG_ROLES, () => problem(404, 'not_found')));
    const user = userEvent.setup();
    renderApp('/orgs/acme');

    const form = await screen.findByRole('form', { name: 'Add someone' });
    await user.type(
      within(form).getByLabelText('Username', { exact: false }),
      'nobody',
    );
    await user.click(within(form).getByRole('button', { name: 'Add' }));

    expect(await within(form).findByRole('alert')).toHaveTextContent(
      'Nobody has the username nobody.',
    );
  });

  it('explains why a contestant cannot be given a role', async () => {
    orgWith([kennyAdmin]);
    server.use(
      http.post(ORG_ROLES, () =>
        problem(409, 'contestant_conflict', { contests: ['acme/spring'] }),
      ),
    );
    const user = userEvent.setup();
    renderApp('/orgs/acme');

    const form = await screen.findByRole('form', { name: 'Add someone' });
    await user.type(within(form).getByLabelText('Username', { exact: false }), 'carol');
    await user.click(within(form).getByRole('button', { name: 'Add' }));

    expect(await within(form).findByRole('alert')).toHaveTextContent(
      'They are a contestant here',
    );
  });

  it('moves someone to another role', async () => {
    const sent = orgWith([kennyAdmin, holder()]);
    const user = userEvent.setup();
    renderApp('/orgs/acme');

    await screen.findByRole('table', { name: 'Organisers' });
    await user.click(screen.getByRole('button', { name: 'Change role of dee' }));
    const form = screen.getByRole('form', { name: 'Change role of dee' });
    await user.selectOptions(within(form).getByLabelText('Role'), 'observer');
    await user.click(within(form).getByRole('button', { name: 'Save' }));

    expect(await within(row('dee')).findByText('Observer')).toBeVisible();
    expect(sent[0]).toEqual({
      method: 'POST',
      body: { username: 'dee', role: 'observer' },
      path: '/api/v1/orgs/acme/roles',
    });
  });

  it('removes a role after asking', async () => {
    const sent = orgWith([kennyAdmin, holder()]);
    const user = userEvent.setup();
    renderApp('/orgs/acme');

    await screen.findByRole('table', { name: 'Organisers' });
    await user.click(screen.getByRole('button', { name: 'Remove dee' }));
    const dialog = await screen.findByRole('dialog', { name: 'Remove this role?' });
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }));

    await screen.findByRole('table', { name: 'Organisers' });
    expect(
      within(screen.getByRole('table', { name: 'Organisers' })).queryByText('dee'),
    ).not.toBeInTheDocument();
    expect(sent).toEqual([{ method: 'DELETE', path: '/api/v1/orgs/acme/roles/21' }]);
  });

  it('keeps the last admin and says why', async () => {
    orgWith([kennyAdmin]);
    server.use(
      http.delete(`${ORG_ROLES}/:user_id`, () =>
        problem(409, 'sole_admin', {
          detail: 'Someone else has to be an admin of acme first.',
          scopes: [{ kind: 'org', name: 'acme' }],
        }),
      ),
    );
    const user = userEvent.setup();
    renderApp('/orgs/acme');

    await screen.findByRole('table', { name: 'Organisers' });
    await user.click(screen.getByRole('button', { name: 'Remove kenny' }));
    const dialog = await screen.findByRole('dialog', {
      name: 'Give up your role here?',
    });
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }));

    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('That would leave no admin');
    expect(alert).toHaveTextContent('Someone else has to be an admin of acme first.');
  });

  it('keeps the last admin from stepping down to another role, and says why', async () => {
    orgWith([kennyAdmin, holder()]);
    server.use(
      http.post(ORG_ROLES, () =>
        problem(409, 'sole_admin', {
          detail: 'Someone else has to be an admin of acme first.',
          scopes: [{ kind: 'org', name: 'acme' }],
        }),
      ),
    );
    const user = userEvent.setup();
    renderApp('/orgs/acme');

    await screen.findByRole('table', { name: 'Organisers' });
    await user.click(screen.getByRole('button', { name: 'Change role of kenny' }));
    const form = screen.getByRole('form', { name: 'Change role of kenny' });
    await user.selectOptions(within(form).getByLabelText('Role'), 'manager');
    await user.click(within(form).getByRole('button', { name: 'Save' }));

    const alert = await within(row('kenny')).findByRole('alert');
    expect(alert).toHaveTextContent('That would leave no admin');
    expect(alert).toHaveTextContent('Someone else has to be an admin of acme first.');
    expect(within(row('kenny')).getByRole('cell', { name: 'Admin' })).toBeVisible();
  });

  it('offers a manager the admin role, and shows why the forge refuses it', async () => {
    const sent: unknown[] = [];
    server.use(
      signedInAs([
        { names: { org: 'acme', contest: 'spring', task: null }, role: 'manager' },
      ]),
      taskList,
      http.get(CONTEST_ROLES, () =>
        HttpResponse.json([
          holder({ id: 40, username: 'lee' }, { role: 'admin' }),
          holder(
            { id: someone.user.id, username: someone.user.username },
            {
              role: 'manager',
              at_names: { org: 'acme', contest: 'spring', task: null },
            },
          ),
        ]),
      ),
      http.post(CONTEST_ROLES, async ({ request }) => {
        sent.push(await request.json());
        return problem(403, 'forbidden', {
          detail: 'Only an admin of acme/spring may grant admin there.',
        });
      }),
    );
    const user = userEvent.setup();
    renderApp('/orgs/acme/contests/spring');

    await screen.findByRole('table', { name: 'Organisers' });
    expect(within(row('lee')).getByText('acme')).toBeVisible();
    expect(within(row('lee')).queryByRole('button')).not.toBeInTheDocument();
    const form = screen.getByRole('form', { name: 'Add someone' });
    const roles = within(form).getByLabelText('Role');
    expect(
      within(roles)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Admin', 'Manager', 'Observer']);

    await user.type(within(form).getByLabelText(/Username/), 'dee');
    await user.selectOptions(roles, 'admin');
    await user.click(within(form).getByRole('button', { name: 'Add' }));

    const alert = await within(form).findByRole('alert');
    expect(alert).toHaveTextContent('Only an admin gives the admin role');
    expect(alert).toHaveTextContent(
      'Only an admin of acme/spring may grant admin there.',
    );
    expect(sent).toEqual([{ username: 'dee', role: 'admin' }]);
  });

  it('shows an observer the list and nothing to change', async () => {
    server.use(
      signedInAs([
        { names: { org: 'acme', contest: null, task: null }, role: 'observer' },
      ]),
      contestList,
      http.get(ORG_ROLES, () => HttpResponse.json([holder()])),
    );
    renderApp('/orgs/acme');

    await screen.findByRole('table', { name: 'Organisers' });
    expect(
      screen.queryByRole('button', { name: /Change role/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Add someone' })).not.toBeInTheDocument();
  });

  it('is not shown to someone whose role is only at one of the tasks', async () => {
    server.use(
      signedInAs([
        { names: { org: 'acme', contest: 'spring', task: 'sum' }, role: 'manager' },
      ]),
      http.get('/api/v1/orgs/:org/contests/:contest/tasks', () =>
        problem(403, 'forbidden'),
      ),
    );
    renderApp('/orgs/acme/contests/spring');

    await screen.findByRole('heading', { name: 'spring', level: 1 });
    expect(
      screen.queryByRole('heading', { name: 'Organisers' }),
    ).not.toBeInTheDocument();
  });
});
