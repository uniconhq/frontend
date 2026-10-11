import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { ORG_SECTIONS } from '@/lib/sections';
import { renderApp } from '@/test/render';
import { server, signedIn } from '@/test/server';
import { home } from '@/test/contestant';

/** Each entry of one of the sidebar's groups: its words and where it goes. */
async function entries(group: string) {
  const nav = await screen.findByRole('navigation', { name: 'Sections' });
  const found = await within(nav).findByRole('group', { name: group });
  return within(found)
    .getAllByRole('link')
    .map((link) => [link.textContent, link.getAttribute('href')]);
}

describe('the sidebar', () => {
  it('lists only the top places outside any org or contest', async () => {
    server.use(signedIn);
    renderApp('/account');

    const nav = await screen.findByRole('navigation', { name: 'Sections' });
    expect(await entries('Unicon')).toEqual([
      ['Browse contests', '/'],
      ['Orgs', '/orgs'],
      ['Workflows', '/workflows'],
      ['Account', '/account'],
    ]);
    expect(within(nav).getAllByRole('group')).toHaveLength(1);
  });

  it('lists only the contests to a visitor, who has no account to see the rest', async () => {
    renderApp('/');

    await screen.findAllByRole('link', { name: 'Sign in' });
    expect(await entries('Unicon')).toEqual([['Browse contests', '/']]);
  });

  it("lists an org's own page and its sections inside it, as its cards do", async () => {
    server.use(signedIn);
    renderApp('/orgs/acme/organisers');

    expect(await entries('Org')).toEqual([
      ['acme', '/orgs/acme'],
      ...ORG_SECTIONS.map((section) => [
        section.label,
        `/orgs/acme/${section.segment}`,
      ]),
    ]);
    const nav = screen.getByRole('navigation', { name: 'Sections' });
    expect(within(nav).getByRole('link', { name: 'Org organisers' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it("lists a contest's tasks and leaderboards to its contestants, the tasks marked on a task's page", async () => {
    server.use(
      signedIn,
      http.get('/api/v1/orgs/:org/contests/:contest/home', () =>
        HttpResponse.json(home()),
      ),
    );
    renderApp('/contests/acme/spring/tasks/sum');

    expect(await entries('Contest')).toEqual([
      ['Tasks', '/contests/acme/spring'],
      ['Leaderboards', '/contests/acme/spring/boards'],
    ]);
    const nav = screen.getByRole('navigation', { name: 'Sections' });
    expect(within(nav).getByRole('link', { name: 'Tasks' }).className).toMatch(
      /active/,
    );
  });
});
