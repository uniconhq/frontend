import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderApp } from '@/test/render';
import { server, sessionList, signedIn } from '@/test/server';

describe('AccountPage', () => {
  it('shows the Forgejo-owned profile read-only, with a way to change it', async () => {
    server.use(signedIn, sessionList);
    renderApp('/account');

    expect(await screen.findByText('Kenny Lewi')).toBeInTheDocument();
    expect(screen.getByText('kenny@example.org')).toBeInTheDocument();
    expect(screen.getByText('Change in Forgejo').closest('a')).toHaveAttribute(
      'href',
      'http://localhost:3300/user/settings',
    );
    expect(screen.getByRole('link', { name: 'SSH keys' })).toHaveAttribute(
      'href',
      'http://localhost:3300/user/settings/keys',
    );
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('lists the sessions and marks the one being used', async () => {
    server.use(signedIn, sessionList);
    renderApp('/account');

    expect(await screen.findByText('Chrome on Windows')).toBeInTheDocument();
    expect(screen.getByText('Firefox on Linux')).toBeInTheDocument();

    const current = screen.getByText('Chrome on Windows').closest('li');
    const other = screen.getByText('Firefox on Linux').closest('li');
    expect(current).toHaveTextContent('This device');
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
