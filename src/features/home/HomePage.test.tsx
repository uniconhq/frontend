import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { renderApp } from '@/test/render';
import { server, sessionList, signedIn } from '@/test/server';
import { publicContest } from '@/test/contestant';

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

  it('lists the public contests for a visitor, each a link to its page', async () => {
    server.use(
      http.get('/api/v1/public/contests', () =>
        HttpResponse.json([{ ...publicContest, tasks: [] }]),
      ),
    );
    renderApp('/');

    const list = await screen.findByRole('list', { name: 'Public contests' });
    expect(within(list).getByRole('link', { name: 'Spring 2026' })).toHaveAttribute(
      'href',
      '/contests/acme/spring',
    );
  });

  it('lists a signed-in person’s contests with where they stand in each', async () => {
    server.use(
      signedIn,
      sessionList,
      http.get('/api/v1/contests', () =>
        HttpResponse.json([
          {
            where: { org: 'acme', contest: 'spring' },
            name: 'Spring 2026',
            start: '2026-09-12T09:00:00Z',
            end: '2026-09-12T10:30:00Z',
            visibility: 'signed-in',
            status: 'pending',
          },
          {
            where: { org: 'acme', contest: 'autumn' },
            name: 'Autumn 2026',
            start: '2026-10-12T09:00:00Z',
            end: '2026-10-12T10:30:00Z',
            visibility: 'everyone',
            status: null,
          },
        ]),
      ),
    );
    renderApp('/');

    const list = await screen.findByRole('list', { name: 'Contests' });
    const [spring, autumn] = within(list).getAllByRole('listitem');
    expect(spring).toHaveTextContent('Registration waiting');
    expect(autumn).not.toHaveTextContent('Registration');
    expect(screen.queryByRole('list', { name: 'Public contests' })).toBeNull();
  });

  it('greets a signed-in person instead', async () => {
    server.use(signedIn, sessionList);
    renderApp('/');

    expect(await screen.findByText(/Signed in as/)).toHaveTextContent('kenny');
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
  });
});
