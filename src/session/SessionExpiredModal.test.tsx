import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http } from 'msw';
import { renderApp } from '@/test/render';
import { problem, server, signedIn, sessionList } from '@/test/server';

describe('the session-expired modal', () => {
  it('keeps the page it interrupts, and comes back to it', async () => {
    server.use(
      signedIn,
      http.get('/api/v1/me/sessions', async () => {
        await delay(20);
        return problem(401, 'session_expired');
      }),
    );

    const { router } = renderApp('/account');

    const modal = await screen.findByRole('dialog');
    expect(within(modal).getByText('Your session ended')).toBeInTheDocument();
    expect(within(modal).getByRole('link', { name: 'Sign in again' })).toHaveAttribute(
      'href',
      '/api/v1/auth/login?next=%2Faccount',
    );

    expect(router.state.location.pathname).toBe('/account');
    expect(
      screen.getByRole('heading', { name: 'Account', level: 1 }),
    ).toBeInTheDocument();
  });

  it('opens for a 401 on a write, not only on a read', async () => {
    server.use(
      signedIn,
      sessionList,
      http.delete('/api/v1/me/sessions', async () => {
        await delay(20);
        return problem(401, 'session_expired');
      }),
    );

    const { router } = renderApp('/account');
    await screen.findByRole('heading', { name: 'Account', level: 1 });
    await userEvent.click(
      await screen.findByRole('button', { name: 'Sign out everywhere' }),
    );

    const modal = await screen.findByRole('dialog');
    expect(within(modal).getByText('Your session ended')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/account');
  });

  it('stays shut for a signed-out visitor, whose boot 401 is normal', async () => {
    renderApp('/');

    await screen.findAllByRole('link', { name: 'Sign in' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
