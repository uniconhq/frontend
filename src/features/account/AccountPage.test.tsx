import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { renderApp } from '@/test/render';
import { FORGE, server, sessionList, signedIn, someone } from '@/test/server';

describe('AccountPage', () => {
  it('shows the Forgejo-owned profile read-only, with a way to change it', async () => {
    server.use(signedIn, sessionList);
    renderApp('/account');

    expect(await screen.findByText('Kenny Lewi')).toBeInTheDocument();
    expect(screen.getByText('kenny@example.org')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText('Change in Forgejo').closest('a')).toHaveAttribute(
        'href',
        `${FORGE}/user/settings`,
      ),
    );
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('links out to the Forgejo page for each setting it does not own', async () => {
    server.use(signedIn, sessionList);
    renderApp('/account');
    await screen.findByText('Kenny Lewi');
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Password' })).toHaveAttribute('href'),
    );

    for (const [name, path] of [
      ['Password', '/user/settings/account'],
      ['Email addresses', '/user/settings/account'],
      ['Avatar', '/user/settings'],
      ['Two-factor', '/user/settings/security'],
    ]) {
      expect(screen.getByRole('link', { name })).toHaveAttribute(
        'href',
        `${FORGE}${path}`,
      );
    }
    expect(screen.queryByRole('link', { name: 'SSH keys' })).not.toBeInTheDocument();
  });

  it('lists the roles by scope name', async () => {
    server.use(signedIn, sessionList);
    renderApp('/account');

    const heading = await screen.findByRole('heading', { name: 'Roles' });
    const list = within(heading.parentElement as HTMLElement).getByRole('list');
    const rows = within(list).getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      'acmeadmin',
      'acme/springmanager',
    ]);
  });

  it('leaves the roles section out when there are none', async () => {
    server.use(
      http.get('/api/v1/me', () => HttpResponse.json({ ...someone, roles: [] })),
      sessionList,
    );
    renderApp('/account');

    await screen.findByText('Kenny Lewi');
    expect(screen.queryByRole('heading', { name: 'Roles' })).not.toBeInTheDocument();
  });

  it('lists the sessions with device and last seen, and marks the one in use', async () => {
    server.use(signedIn, sessionList);
    renderApp('/account');

    expect(await screen.findByText('Chrome on Windows')).toBeInTheDocument();
    expect(screen.getByText('Firefox on Linux')).toBeInTheDocument();

    const current = screen.getByText('Chrome on Windows').closest('li');
    const other = screen.getByText('Firefox on Linux').closest('li');
    expect(current).toHaveTextContent('This device');
    expect(current).toHaveTextContent('last seen');
    expect(other).not.toHaveTextContent('This device');
    expect(screen.getAllByRole('button', { name: 'Revoke' })).toHaveLength(1);
    expect(
      within(other as HTMLElement).getByRole('button', { name: 'Revoke' }),
    ).toBeVisible();
    expect(
      within(current as HTMLElement).getByRole('button', { name: 'Sign out' }),
    ).toBeVisible();
  });
});
