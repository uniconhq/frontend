import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { renderApp } from '@/test/render';
import { server, sessionList, signedIn } from '@/test/server';

describe('LoginPage', () => {
  it('offers one button that leaves the app, carrying next', async () => {
    renderApp('/login?next=%2Faccount');

    const button = await screen.findByRole('link', { name: 'Sign in with Forgejo' });
    expect(button).toHaveAttribute('href', '/api/v1/auth/login?next=%2Faccount');
    expect(screen.getByText(/You will sign in through/)).toBeInTheDocument();
    expect(screen.getByText(/localhost:3300/)).toBeInTheDocument();
  });

  it.each([
    ['login_denied', 'You did not approve the sign in.'],
    ['login_state_invalid', 'The sign in took too long or was started in another tab.'],
    ['forge_unreachable', 'Forgejo did not answer'],
    ['something_new', 'Something went wrong on the way back from Forgejo.'],
  ])('explains ?error=%s in words', async (code, message) => {
    renderApp(`/login?error=${code}`);

    expect(await screen.findByText(new RegExp(message))).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Try again' })).toBeInTheDocument();
  });

  it('offers Create account only when the instance is open', async () => {
    renderApp('/login');
    await screen.findByRole('link', { name: 'Sign in with Forgejo' });
    expect(screen.queryByText('Create account')).not.toBeInTheDocument();

    server.use(
      http.get('/api/v1/auth/register-url', () =>
        HttpResponse.json({ url: 'http://localhost:3300/user/sign_up' }),
      ),
    );
    renderApp('/login');

    const link = await screen.findByText('Create account');
    expect(link.closest('a')).toHaveAttribute(
      'href',
      'http://localhost:3300/user/sign_up',
    );
  });

  it('carries an unsafe next as the safe one it collapses to', async () => {
    renderApp('/login?next=%2F%2Fevil.example');

    expect(
      await screen.findByRole('link', { name: 'Sign in with Forgejo' }),
    ).toHaveAttribute('href', '/api/v1/auth/login?next=%2F');
  });

  it('sends a signed-in person on to next instead of asking again', async () => {
    server.use(signedIn, sessionList);
    const { router } = renderApp('/login?next=%2Faccount');

    await screen.findByRole('heading', { name: 'Account', level: 1 });
    expect(router.state.location.pathname).toBe('/account');
  });

  it('will not let next walk a signed-in person off the site', async () => {
    server.use(signedIn);
    const { router } = renderApp('/login?next=%2F%2Fevil.example');

    await screen.findByRole('heading', { name: 'Unicon', level: 1 });
    expect(router.state.location.pathname).toBe('/');
  });
});
