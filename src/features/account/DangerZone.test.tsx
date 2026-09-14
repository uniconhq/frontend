import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderApp } from '@/test/render';
import { problem, server, sessionList, signedIn } from '@/test/server';

async function openAccount() {
  server.use(signedIn, sessionList);
  renderApp('/account');
  await screen.findByRole('heading', { name: 'Account', level: 1 });
}

describe('deactivate and delete', () => {
  it('says what survives before it asks', async () => {
    await openAccount();
    await userEvent.click(screen.getByRole('button', { name: 'Delete account' }));

    expect(await screen.findByText(/Deleted user/)).toBeInTheDocument();
    expect(screen.getByText(/commits keep the name/)).toBeInTheDocument();
  });

  it('asks for a fresh sign in when the backend says the session is too old', async () => {
    await openAccount();
    server.use(
      http.post('/api/v1/me/deactivate', () => problem(403, 'reauth_required')),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Deactivate account' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Deactivate account' }),
    );

    expect(await screen.findByText('Sign in again to confirm')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in again' })).toHaveAttribute(
      'href',
      '/api/v1/auth/login?next=%2Faccount',
    );
  });

  it("passes on Forgejo's own reason when Forgejo refuses", async () => {
    await openAccount();
    server.use(
      http.post('/api/v1/me/deactivate', () =>
        HttpResponse.json(
          {
            type: 'about:blank',
            title: 'Forgejo refused',
            status: 409,
            detail: 'user still owns repository icpc/finals-2026',
            code: 'forge_rejected',
          },
          { status: 409, headers: { 'content-type': 'application/problem+json' } },
        ),
      ),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Deactivate account' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Deactivate account' }),
    );

    expect(await screen.findByText('Forgejo refused the change')).toBeInTheDocument();
    expect(
      screen.getByText('user still owns repository icpc/finals-2026'),
    ).toBeInTheDocument();
  });

  it('names the places that are blocking when you are the last admin', async () => {
    await openAccount();
    server.use(
      http.delete('/api/v1/me', () =>
        problem(409, 'last_admin', {
          scopes: [
            { org: 'icpc', team: 'owners' },
            { org: 'ioai', team: 'admins' },
          ],
        }),
      ),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Delete account' }),
    );

    expect(await screen.findByText('icpc · owners')).toBeInTheDocument();
    expect(screen.getByText('ioai · admins')).toBeInTheDocument();
  });
});
