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

async function confirm(action: 'Deactivate account' | 'Delete account') {
  await userEvent.click(screen.getByRole('button', { name: action }));
  const dialog = await screen.findByRole('dialog');
  await userEvent.click(within(dialog).getByRole('button', { name: action }));
  return dialog;
}

describe('deactivate and delete', () => {
  it('says what each does and whether it can be undone before it asks', async () => {
    await openAccount();
    await userEvent.click(screen.getByRole('button', { name: 'Delete account' }));

    expect(await screen.findByText(/Deleted user/)).toBeInTheDocument();
    expect(screen.getByText(/This cannot be undone/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await userEvent.click(screen.getByRole('button', { name: 'Deactivate account' }));
    expect(
      await screen.findByText(/A platform admin can undo this/),
    ).toBeInTheDocument();
  });

  it('asks for a fresh sign in when the backend says the session is too old', async () => {
    await openAccount();
    server.use(
      http.post('/api/v1/me/deactivate', () => problem(403, 'fresh_sign_in_required')),
    );

    await confirm('Deactivate account');

    expect(await screen.findByText('Sign in again to confirm')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in again' })).toHaveAttribute(
      'href',
      '/api/v1/auth/login?next=%2Faccount',
    );
  });

  it('passes on the reason Forgejo gave when Forgejo refuses', async () => {
    await openAccount();
    server.use(
      http.post('/api/v1/me/deactivate', () =>
        HttpResponse.json(
          {
            type: 'about:blank',
            title: 'Forgejo refused',
            status: 422,
            detail: 'user still owns repository icpc/finals-2026',
            code: 'rejected',
          },
          { status: 422, headers: { 'content-type': 'application/problem+json' } },
        ),
      ),
    );

    await confirm('Deactivate account');

    expect(await screen.findByText('Forgejo refused the change')).toBeInTheDocument();
    expect(
      screen.getByText('user still owns repository icpc/finals-2026'),
    ).toBeInTheDocument();
  });

  it('names the scopes that are blocking when you are the only admin', async () => {
    await openAccount();
    server.use(
      http.delete('/api/v1/me', () =>
        problem(409, 'sole_admin', {
          scopes: [
            { kind: 'org', name: 'acme' },
            { kind: 'contest', name: 'acme/spring' },
          ],
        }),
      ),
    );

    const dialog = await confirm('Delete account');

    expect(await screen.findByText('You are the only admin somewhere')).toBeVisible();
    expect(within(dialog).getByText('acme (org)')).toBeInTheDocument();
    expect(within(dialog).getByText('acme/spring (contest)')).toBeInTheDocument();
  });

  it('names the workflows other people still use', async () => {
    await openAccount();
    server.use(
      http.delete('/api/v1/me', () =>
        problem(409, 'shared_workflow_owner', {
          workflows: ['acme/judge', 'acme/lint'],
        }),
      ),
    );

    const dialog = await confirm('Delete account');

    expect(await screen.findByText('You own workflows other people use')).toBeVisible();
    expect(within(dialog).getByText('acme/judge')).toBeInTheDocument();
    expect(within(dialog).getByText('acme/lint')).toBeInTheDocument();
  });

  it('ignores a malformed refusal body rather than blanking the dialog', async () => {
    await openAccount();
    server.use(
      http.delete('/api/v1/me', () =>
        problem(409, 'sole_admin', { scopes: [{ kind: 'org' }, 'acme', null] }),
      ),
    );

    const dialog = await confirm('Delete account');

    expect(await screen.findByText('You are the only admin somewhere')).toBeVisible();
    expect(within(dialog).queryByRole('list')).not.toBeInTheDocument();
  });
});
