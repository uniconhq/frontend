import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderApp } from '@/test/render';
import { server, sessionList, someone } from '@/test/server';

/**
 * A backend that is broken until the test says otherwise, so "Try again" has
 * something to succeed at. `broken` answers every attempt the retry policy
 * makes.
 */
function meIsBrokenUntilFixed(broken: () => Response) {
  const state = { healthy: false };
  server.use(
    http.get('/api/v1/me', () =>
      state.healthy ? HttpResponse.json(someone) : broken(),
    ),
    sessionList,
  );
  return state;
}

/** Long enough for retry, retry, give up (300ms + 900ms in query-client.ts). */
const RETRIES_DONE = 3_000;

const badGateway = () =>
  new HttpResponse('<html>503 Service Unavailable</html>', {
    status: 503,
    headers: { 'content-type': 'text/html' },
  });

describe('when /me will not answer', () => {
  it.each([
    ['a 503 from the proxy', badGateway, 'Unexpected response from the server (503)'],
    ['no network at all', () => HttpResponse.error(), 'Cannot reach Unicon'],
  ])('offers a retry rather than a sign-in for %s', async (_case, broken, title) => {
    const backend = meIsBrokenUntilFixed(broken);
    const { router } = renderApp('/account');

    expect(
      await screen.findByText(title, {}, { timeout: RETRIES_DONE }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/account');

    backend.healthy = true;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(
      await screen.findByRole('heading', { name: 'Account', level: 1 }),
    ).toBeInTheDocument();
  });

  it('keeps the header out of it instead of offering to sign in', async () => {
    meIsBrokenUntilFixed(badGateway);
    renderApp('/account');

    await screen.findByText('Account unavailable', {}, { timeout: RETRIES_DONE });
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
  });

  it('still reads a 401 as signed out, not as unavailable', async () => {
    const { router } = renderApp('/account');

    await screen.findByRole('link', { name: 'Sign in with Forgejo' });
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.search).toBe('?next=%2Faccount');
  });
});
