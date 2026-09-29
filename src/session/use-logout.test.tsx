import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderApp } from '@/test/render';
import { problem, server, sessionList, someone } from '@/test/server';

/**
 * A backend that remembers whether this person's session is still alive. With
 * `held`, the sign-out is answered only once that promise settles, so a test
 * can act while the answer is on its way.
 */
function statefulBackend(options: { logout: () => Response; held?: Promise<void> }) {
  let live = true;
  server.use(
    http.get('/api/v1/me', () =>
      live ? HttpResponse.json(someone) : problem(401, 'unauthenticated'),
    ),
    sessionList,
    http.post('/api/v1/auth/logout', async () => {
      await options.held;
      const answer = options.logout();
      if (answer.status === 204) live = false;
      return answer;
    }),
  );
}

async function signOutFromTheHeader() {
  await screen.findByRole('heading', { name: 'Account', level: 1 });
  await userEvent.click(screen.getByRole('button', { name: 'Account menu' }));
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Sign out' }));
}

describe('signing out', () => {
  it('leaves the guarded page before forgetting who you are', async () => {
    statefulBackend({ logout: () => new HttpResponse(null, { status: 204 }) });
    const { router } = renderApp('/account');

    await signOutFromTheHeader();

    await screen.findAllByRole('link', { name: 'Sign in' });
    expect(router.state.location.pathname).toBe('/');
  });

  it('treats an already-dead session as signed out', async () => {
    statefulBackend({ logout: () => problem(401, 'unauthenticated') });
    const { router } = renderApp('/account');

    await signOutFromTheHeader();

    expect(router.state.location.pathname).toBe('/');
  });

  it('keeps you signed in when the sign-out is refused, and keeps the reason up', async () => {
    statefulBackend({ logout: () => problem(503, 'forge_unavailable') });
    const { router } = renderApp('/account');

    await signOutFromTheHeader();

    const menu = await screen.findByRole('menu');
    expect(within(menu).getByText('Forgejo did not answer')).toBeInTheDocument();
    expect(
      within(menu).getByRole('menuitem', { name: 'Sign out' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/account');
    expect(screen.getByRole('button', { name: 'Account menu' })).toHaveTextContent(
      'kenny',
    );
  });

  it('brings the reason back if the menu was dismissed while the answer was on its way', async () => {
    let answer = () => {};
    const held = new Promise<void>((resolve) => {
      answer = resolve;
    });
    statefulBackend({ logout: () => problem(503, 'forge_unavailable'), held });
    renderApp('/account');

    await signOutFromTheHeader();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    answer();

    const menu = await screen.findByRole('menu');
    expect(within(menu).getByText('Forgejo did not answer')).toBeInTheDocument();
  });
});
