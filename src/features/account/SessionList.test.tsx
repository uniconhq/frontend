import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderApp } from '@/test/render';
import { problem, server, sessions, someone } from '@/test/server';

/** A backend that actually forgets the sessions it is told to forget. */
function backendWithSessions() {
  let live = [...sessions];
  let signedIn = true;

  server.use(
    http.get('/api/v1/me', () =>
      signedIn ? HttpResponse.json(someone) : problem(401, 'unauthenticated'),
    ),
    http.get('/api/v1/me/sessions', () => HttpResponse.json(live)),
    http.delete('/api/v1/me/sessions/:id', ({ params }) => {
      const id = params['id'] as string;
      if (live.find((session) => session.id === id)?.current === true) signedIn = false;
      live = live.filter((session) => session.id !== id);
      return new HttpResponse(null, { status: 204 });
    }),
    http.delete('/api/v1/me/sessions', () => {
      live = [];
      signedIn = false;
      return new HttpResponse(null, { status: 204 });
    }),
  );
}

describe('the session list', () => {
  it('drops a revoked session from the list and leaves you signed in', async () => {
    backendWithSessions();
    const { router } = renderApp('/account');

    await screen.findByText('Firefox on Linux');
    await userEvent.click(screen.getByRole('button', { name: 'Revoke' }));

    await waitForGone('Firefox on Linux');
    expect(screen.getByText('Chrome on Windows')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/account');
  });

  it('signs you out when the session revoked is the one you are on', async () => {
    backendWithSessions();
    const { router } = renderApp('/account');

    await screen.findByText('Chrome on Windows');
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    await screen.findAllByRole('link', { name: 'Sign in' });
    expect(router.state.location.pathname).toBe('/');
  });

  it('signs you out everywhere', async () => {
    backendWithSessions();
    const { router } = renderApp('/account');

    await screen.findByText('Chrome on Windows');
    await userEvent.click(screen.getByRole('button', { name: 'Sign out everywhere' }));

    await screen.findAllByRole('link', { name: 'Sign in' });
    expect(router.state.location.pathname).toBe('/');
  });
});

async function waitForGone(text: string) {
  await expect.poll(() => screen.queryByText(text), { timeout: 2000 }).toBe(null);
}
