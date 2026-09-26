import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { renderApp } from '@/test/render';
import { server, sessionList, signedIn } from '@/test/server';

describe('HomePage', () => {
  it('offers Sign in as a link that comes back here, never a form', async () => {
    renderApp('/');

    const links = await screen.findAllByRole('link', { name: 'Sign in' });
    for (const link of links) {
      expect(link).toHaveAttribute('href', '/api/v1/auth/login?next=%2F');
    }
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    expect(screen.queryByText('Create account')).not.toBeInTheDocument();
  });

  it('offers Create account as well when the instance is open', async () => {
    server.use(
      http.get('/api/v1/auth/register-url', () =>
        HttpResponse.json({ url: 'http://localhost:3300/user/sign_up' }),
      ),
    );
    renderApp('/');

    const link = await screen.findByText('Create account');
    expect(link.closest('a')).toHaveAttribute(
      'href',
      'http://localhost:3300/user/sign_up',
    );
  });

  it('greets a signed-in person instead', async () => {
    server.use(signedIn, sessionList);
    renderApp('/');

    expect(await screen.findByText(/Signed in as/)).toHaveTextContent('kenny');
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
  });
});
