import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen, waitFor } from '@testing-library/react';
import { renderApp } from '@/test/render';
import { server, signedIn, someone } from '@/test/server';
import { passTime, withFakeTimers } from '@/test/timers';

const PAGE = '/contests/acme/spring/leaderboards';

const GRADEBOOK = {
  key: 'gradebook',
  title: 'Gradebook',
  audience: { who: 'entrants', rows: 'own' },
  headers: [
    { name: 'points', decimals: null, at_least: null, at_most: '100', self_reported: [] },
  ],
  sort: [{ column: 'points', way: 'desc' }],
  dropped: [],
  held_from: null,
  rows: [
    {
      place: null,
      grading: null,
      held: 0,
      row: { entrant: 'ada', name: 'ada' },
      cells: [
        {
          column: 'points',
          number: '62',
          text: null,
          hidden: false,
          counted: [{ task: 'sum', number: 4 }],
          waiting: null,
        },
      ],
    },
  ],
};

describe("a contest's leaderboards", () => {
  it('reads the signed-in list and opens a counted submission of the entrant’s own', async () => {
    server.use(
      http.get('/api/v1/me', () => HttpResponse.json({ ...someone, roles: [] })),
      http.get('/api/v1/orgs/:org/contests/:contest/leaderboards', () =>
        HttpResponse.json([GRADEBOOK]),
      ),
    );
    renderApp(PAGE);
    expect(await screen.findByRole('table', { name: 'Gradebook' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Submission 4' })).toHaveAttribute(
      'href',
      '/contests/acme/spring/tasks/sum?submission=4',
    );
  });

  it('opens, for staff, the row’s entrant’s submissions to the task', async () => {
    server.use(
      signedIn,
      http.get('/api/v1/orgs/:org/contests/:contest/leaderboards', () =>
        HttpResponse.json([GRADEBOOK]),
      ),
    );
    renderApp(PAGE);
    expect(await screen.findByRole('link', { name: 'Submission 4' })).toHaveAttribute(
      'href',
      expect.stringMatching(/\/gradings\?task=sum&entrant=ada$/),
    );
  });

  it('reads the public list when nobody is signed in', async () => {
    server.use(
      http.get('/api/v1/public/contests/:org/:contest/leaderboards', () =>
        HttpResponse.json([GRADEBOOK]),
      ),
    );
    renderApp(PAGE);
    expect(await screen.findByRole('table', { name: 'Gradebook' })).toBeVisible();
  });

  it('says when there is nothing to show', async () => {
    server.use(signedIn);
    renderApp(PAGE);
    expect(await screen.findByText('Nothing is on a leaderboard yet.')).toBeVisible();
  });
});

describe('the leaderboards with no stream', () => {
  withFakeTimers();

  it('reads the public list again every thirty seconds', async () => {
    let reads = 0;
    server.use(
      http.get('/api/v1/public/contests/:org/:contest/leaderboards', () => {
        reads += 1;
        return HttpResponse.json([GRADEBOOK]);
      }),
    );
    renderApp(PAGE);
    expect(await screen.findByRole('table', { name: 'Gradebook' })).toBeVisible();
    expect(reads).toBe(1);
    await passTime(30_000);
    expect(reads).toBe(2);
  });
});

describe('an old leaderboards address', () => {
  it('lands on the leaderboards, the contest’s and the organiser’s', async () => {
    server.use(signedIn);
    const { router } = renderApp('/contests/acme/spring/boards');
    expect(await screen.findByText('Nothing is on a leaderboard yet.')).toBeVisible();
    expect(router.state.location.pathname).toBe('/contests/acme/spring/leaderboards');

    const organiser = renderApp('/orgs/acme/contests/spring/boards?board=gradebook');
    await waitFor(() => {
      expect(organiser.router.state.location.pathname).toBe(
        '/orgs/acme/contests/spring/leaderboards',
      );
    });
    expect(organiser.router.state.location.search).toBe('?board=gradebook');
  });
});
