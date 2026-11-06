import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderApp } from '@/test/render';
import { server, signedIn, signedInAs, someone } from '@/test/server';

describe('the org list', () => {
  it('lists each org the session names, each linking to its page', async () => {
    server.use(
      ...signedInAs('admin', {
        roles: [
          ...someone.roles,
          { names: { org: 'beta', contest: 'cup', task: 'sum' }, role: 'observer' },
        ],
        orgs: ['acme', 'beta'],
      }),
    );
    renderApp('/orgs');

    const list = await screen.findByRole('list', { name: 'Your orgs' });
    const links = within(list).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual(['acme', 'beta']);
    expect(links[0]).toHaveAttribute('href', '/orgs/acme');
    expect(links[1]).toHaveAttribute('href', '/orgs/beta');
    const rows = within(list).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Admin of the org');
    expect(rows[1]).toHaveTextContent('Observer of sum, in cup');
  });

  it('offers a new org, and says so when there are none yet', async () => {
    server.use(...signedInAs(null, { roles: [], orgs: [] }));
    renderApp('/orgs');

    expect(
      await screen.findByText('You do not have a role at any org yet.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New org' })).toBeVisible();
  });

  it('waits on the session rather than rendering a blank', async () => {
    server.use(signedIn);
    renderApp('/orgs');

    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { name: 'Orgs', level: 1 }),
    ).toBeVisible();
  });
});
