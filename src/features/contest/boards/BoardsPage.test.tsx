import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen } from '@testing-library/react';
import { renderApp } from '@/test/render';
import { server, signedIn } from '@/test/server';

const PAGE = '/contests/acme/spring/boards';

const GRADEBOOK = {
  key: 'gradebook',
  title: 'Gradebook',
  audience: { who: 'entrants', rows: 'own' },
  headers: [
    { name: 'points', places: null, at_least: null, at_most: '100', self_reported: [] },
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
  it('reads the signed-in list and opens a counted submission', async () => {
    server.use(
      signedIn,
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
