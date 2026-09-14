import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderApp } from '@/test/render';
import { server, sessionList, signedIn } from '@/test/server';

describe('RequireSession', () => {
  it('sends a signed-out person to the login page, remembering where they were', async () => {
    const { router } = renderApp('/account');

    await screen.findByRole('link', { name: 'Sign in with Forgejo' });
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.search).toBe('?next=%2Faccount');
  });

  it('renders the page when there is a session', async () => {
    server.use(signedIn, sessionList);
    renderApp('/account');

    expect(
      await screen.findByRole('heading', { name: 'Account', level: 1 }),
    ).toBeInTheDocument();
  });
});
