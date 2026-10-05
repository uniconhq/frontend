import { afterEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { Invite } from '@/api/types';
import { renderApp } from '@/test/render';
import { problem, server, sessionList, signedIn, someone } from '@/test/server';
import { invite } from '@/test/invites';
import { forgetInviteToken, readInviteToken } from './invite-token';

const MINE = '/api/v1/me/invites';
const OPEN = '/api/v1/me/invites/open';

const spring = { org: 'acme', contest: 'spring', task: null };

afterEach(() => {
  forgetInviteToken();
});

/** The person's invites as accepting and declining change them, and what was sent. */
function myInvites(start: Invite[]) {
  let invites = start;
  const sent: string[] = [];
  const decide = (request: Request, id: string, status: Invite['status']) => {
    sent.push(new URL(request.url).pathname);
    const decided = {
      ...invites.find((found) => found.id === id)!,
      status,
      decided_at: '2026-09-12T10:00:00Z',
    };
    invites = invites.filter((found) => found.id !== id);
    return HttpResponse.json(decided);
  };
  server.use(
    sessionList,
    http.get(MINE, () => HttpResponse.json(invites)),
    http.post(`${MINE}/:id/accept`, ({ request, params }) =>
      decide(request, String(params.id), 'accepted'),
    ),
    http.post(`${MINE}/:id/decline`, ({ request, params }) =>
      decide(request, String(params.id), 'declined'),
    ),
  );
  return sent;
}

/** Counts each read of who is signed in, answering as `signedIn` does. */
function countedMe() {
  const reads = { count: 0 };
  server.use(
    http.get('/api/v1/me', () => {
      reads.count += 1;
      return HttpResponse.json(someone);
    }),
  );
  return reads;
}

describe('invites on the home page', () => {
  it('are not shown when none is waiting', async () => {
    server.use(signedIn);
    myInvites([]);
    renderApp('/');

    await screen.findByText(/Signed in as/);
    await screen.findByRole('heading', { name: 'Contests' });
    expect(screen.queryByRole('heading', { name: 'Invites for you' })).toBeNull();
  });

  it('shows each waiting invite with what it offers, who sent it and when it lapses', async () => {
    server.use(signedIn);
    myInvites([invite(), invite({ id: 'b', grants: 'contestant', where: spring })]);
    renderApp('/');

    const list = await screen.findByRole('list', { name: 'Invites for you' });
    const [role, place] = within(list).getAllByRole('listitem');
    expect(role).toHaveTextContent('The manager role at acme');
    expect(role).toHaveTextContent('Sent by kenny.');
    expect(role).toHaveTextContent('It lapses on');
    expect(place).toHaveTextContent('A place in the contest acme/spring');
  });

  it('accepts a role and reads the session again, so the role shows', async () => {
    const reads = countedMe();
    const sent = myInvites([invite()]);
    const user = userEvent.setup();
    renderApp('/');

    const card = await screen.findByRole('listitem', {
      name: 'The manager role at acme',
    });
    const before = reads.count;
    await user.click(within(card).getByRole('button', { name: /^Accept/ }));

    expect(
      await within(card).findByText('You are now a manager at acme.'),
    ).toBeVisible();
    expect(within(card).getByRole('link', { name: 'Open acme' })).toHaveAttribute(
      'href',
      '/orgs/acme',
    );
    expect(within(card).queryByRole('button')).toBeNull();
    expect(reads.count).toBeGreaterThan(before);
    expect(sent).toEqual([`${MINE}/${invite().id}/accept`]);
  });

  it('accepts a place and links to the contest to register', async () => {
    server.use(signedIn);
    myInvites([invite({ grants: 'contestant', where: spring })]);
    const user = userEvent.setup();
    renderApp('/');

    const card = await screen.findByRole('listitem', {
      name: 'A place in the contest acme/spring',
    });
    await user.click(within(card).getByRole('button', { name: /^Accept/ }));

    expect(
      await within(card).findByText(/You have a place in acme\/spring/),
    ).toBeVisible();
    expect(
      within(card).getByRole('link', { name: 'Go to the contest' }),
    ).toHaveAttribute('href', '/contests/acme/spring');
  });

  it('declines an invite', async () => {
    server.use(signedIn);
    const sent = myInvites([invite()]);
    const user = userEvent.setup();
    renderApp('/');

    const card = await screen.findByRole('listitem', {
      name: 'The manager role at acme',
    });
    await user.click(within(card).getByRole('button', { name: /^Decline/ }));

    expect(await within(card).findByText('You declined this invite.')).toBeVisible();
    expect(sent).toEqual([`${MINE}/${invite().id}/decline`]);
  });

  it('offers nothing on a lapsed invite but to ask for a new one', async () => {
    server.use(signedIn);
    myInvites([invite({ expired: true })]);
    renderApp('/');

    const card = await screen.findByRole('listitem', {
      name: 'The manager role at acme',
    });
    expect(card).toHaveTextContent('It lapsed on');
    expect(card).toHaveTextContent('Ask the organisers for a new one.');
    expect(within(card).queryByRole('button')).toBeNull();
  });

  it('shows a refusal on the invite it is about', async () => {
    server.use(
      signedIn,
      http.post(`${MINE}/:id/accept`, () =>
        problem(409, 'wrong_status', {
          detail: 'An invite that is withdrawn cannot be accepted.',
        }),
      ),
    );
    server.use(http.get(MINE, () => HttpResponse.json([invite()])));
    const user = userEvent.setup();
    renderApp('/');

    const card = await screen.findByRole('listitem', {
      name: 'The manager role at acme',
    });
    await user.click(within(card).getByRole('button', { name: /^Accept/ }));

    expect(await within(card).findByRole('alert')).toHaveTextContent(
      'An invite that is withdrawn cannot be accepted.',
    );
  });
});

describe('the invites page', () => {
  it('lists the invites waiting, or says none is', async () => {
    server.use(signedIn);
    myInvites([]);
    renderApp('/invites');

    expect(
      await screen.findByRole('heading', { name: 'Invites', level: 1 }),
    ).toBeVisible();
    expect(await screen.findByText('No invites are waiting for you.')).toBeVisible();
  });

  it('opens the invite a mail’s link carries, first, and takes the token out of the address', async () => {
    let body: unknown = null;
    server.use(
      signedIn,
      http.post(OPEN, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(invite({ grants: 'contestant', where: spring }));
      }),
    );
    myInvites([
      invite({ grants: 'contestant', where: spring }),
      invite({ id: 'b', grants: 'observer' }),
    ]);
    const { router } = renderApp('/invites#s3cr3t-token');

    const opened = await screen.findByRole('list', {
      name: 'The invite from your link',
    });
    expect(
      within(opened).getByRole('listitem', {
        name: 'A place in the contest acme/spring',
      }),
    ).toBeVisible();
    const others = await screen.findByRole('list', { name: 'Your other invites' });
    expect(within(others).getAllByRole('listitem')).toHaveLength(1);
    expect(within(others).getByRole('listitem')).toHaveTextContent(
      'The observer role at acme',
    );
    expect(body).toEqual({ token: 's3cr3t-token' });
    expect(router.state.location.hash).toBe('');
    expect(readInviteToken()).toBeNull();
  });

  it('says plainly when the link is not for the account signed in', async () => {
    server.use(
      signedIn,
      http.post(OPEN, () => problem(404, 'not_found')),
    );
    myInvites([]);
    renderApp('/invites#someone-elses');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This link does not open an invite for kenny. It may have been sent to another account',
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Sign in with the account the invite was sent to',
    );
  });

  it('keeps the token in the tab across a sign-in, never in the address it signs in by', async () => {
    const { router, unmount } = renderApp('/invites#s3cr3t-token');

    await screen.findByRole('link', { name: 'Sign in with Forgejo' });
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.search).toBe('?next=%2Finvites');
    expect(screen.getByRole('link', { name: 'Sign in with Forgejo' })).toHaveAttribute(
      'href',
      '/api/v1/auth/login?next=%2Finvites',
    );
    unmount();

    let body: unknown = null;
    server.use(
      signedIn,
      http.post(OPEN, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(invite());
      }),
    );
    myInvites([]);
    renderApp('/invites');

    expect(
      await screen.findByRole('listitem', { name: 'The manager role at acme' }),
    ).toBeVisible();
    expect(body).toEqual({ token: 's3cr3t-token' });
  });
});
