import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { renderApp } from '@/test/render';
import { server, signedIn, someone } from '@/test/server';
import { TASK_API } from '@/test/organiser';

describe('the org list', () => {
  it('lists each org the roles reach, once, each linking to its page', async () => {
    server.use(
      http.get('/api/v1/me', () =>
        HttpResponse.json({
          ...someone,
          roles: [
            ...someone.roles,
            {
              names: { org: 'beta', contest: 'cup', task: 'sum' },
              role: 'observer',
            },
          ],
        }),
      ),
    );
    renderApp('/orgs');

    const list = await screen.findByRole('list', { name: 'Your orgs' });
    const links = within(list).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual(['acme', 'beta']);
    expect(links[0]).toHaveAttribute('href', '/orgs/acme');
    expect(links[1]).toHaveAttribute('href', '/orgs/beta');
  });

  it('offers a new org, and says so when there are none yet', async () => {
    server.use(
      http.get('/api/v1/me', () => HttpResponse.json({ ...someone, roles: [] })),
    );
    renderApp('/orgs');

    expect(
      await screen.findByText('You do not hold a role at any org yet.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'New org' })).toHaveAttribute(
      'href',
      '/orgs/new',
    );
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
  it('links to the orgs from the sidebar once signed in', async () => {
    server.use(signedIn);
    renderApp('/');

    const sections = await screen.findByRole('navigation', { name: 'Sections' });
    expect(await within(sections).findByRole('link', { name: 'Orgs' })).toHaveAttribute(
      'href',
      '/orgs',
    );
  });

  it('leaves the link out for a visitor', async () => {
    renderApp('/');

    await screen.findAllByRole('link', { name: 'Sign in' });
    const sections = screen.getByRole('navigation', { name: 'Sections' });
    expect(
      within(sections).queryByRole('link', { name: 'Orgs' }),
    ).not.toBeInTheDocument();
  });

  it('walks the breadcrumb through the org, the contest and the task', async () => {
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
      ['orgs', '/orgs'],
      ['acme', '/orgs/acme'],
      ['spring', '/orgs/acme/contests/spring'],
      ['sum', '/orgs/acme/contests/spring/tasks/sum'],
    ]);
    expect(links[3]).toHaveAttribute('aria-current', 'page');
  });

  it('marks no crumb as the page on the new org form, which has none of its own', async () => {
    server.use(signedIn);
    renderApp('/orgs/new');

    await screen.findByRole('heading', { name: 'New org', level: 1 });
    const trail = screen.getByRole('navigation', { name: 'Breadcrumb' });
    const orgs = within(trail).getByRole('link', { name: 'orgs' });
    expect(orgs).toHaveAttribute('href', '/orgs');
    expect(orgs).not.toHaveAttribute('aria-current');
  });
});
