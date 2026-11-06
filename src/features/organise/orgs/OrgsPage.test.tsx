import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { renderApp } from '@/test/render';
import { server, signedIn, signedInAs, someone } from '@/test/server';
import { TASK_API } from '@/test/organiser';

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

  it.each(['/orgs', '/orgs/new', '/orgs/acme', '/orgs/acme/contests/spring/tasks/sum'])(
    'sends a signed-out visitor at %s to sign in, remembering where',
    async (path) => {
      const { router } = renderApp(path);

      await screen.findByRole('link', { name: 'Sign in with Forgejo' });
      expect(router.state.location.pathname).toBe('/login');
      expect(router.state.location.search).toBe(`?next=${encodeURIComponent(path)}`);
    },
  );
});

describe('the shell for an organiser', () => {
  it('walks the breadcrumb from Home through the org, the contest and the task', async () => {
    server.use(
      signedIn,
      http.get(TASK_API, () =>
        HttpResponse.json({ head: 'abc', latest: null, draft: true, errors: [] }),
      ),
      http.get(`${TASK_API}/publications`, () => HttpResponse.json([])),
      http.get(`${TASK_API}/tree`, () => HttpResponse.json([])),
    );
    renderApp('/orgs/acme/contests/spring/tasks/sum');

    const trail = await screen.findByRole('navigation', { name: 'Breadcrumb' });
    const links = within(trail).getAllByRole('link');
    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Home', '/'],
      ['acme', '/orgs/acme'],
      ['spring', '/orgs/acme/contests/spring'],
      ['sum', '/orgs/acme/contests/spring/tasks/sum'],
    ]);
    expect(links[3]).toHaveAttribute('aria-current', 'page');
  });

  it('gives the new org form a crumb of its own, under Home', async () => {
    server.use(signedIn);
    renderApp('/orgs/new');

    await screen.findByRole('heading', { name: 'New org', level: 1 });
    const trail = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(
      within(trail)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Home', 'New org']);
    expect(within(trail).getByRole('link', { name: 'New org' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});
