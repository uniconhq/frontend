import { describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen } from '@testing-library/react';
import type { components } from '@/api/schema';
import { renderApp } from '@/test/render';
import { server, someone } from '@/test/server';
import type * as live from '@/live';
import { CONTEST_API, home, registration } from '@/test/contestant';
import { passTime, withFakeTimers } from '@/test/timers';

// The live stream is open: it tells this entrant of their own gradings and
// of releases, and of no other entrant's grading.
vi.mock('@/live', async (importOriginal) => ({
  ...(await importOriginal<typeof live>()),
  useLiveConnected: () => true,
  useFallbackPoll: () => false,
}));

const GRADEBOOK: components['schemas']['Leaderboard'] = {
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

const entrantOnly = http.get('/api/v1/me', () =>
  HttpResponse.json({ ...someone, roles: [] }),
);

describe('a standing while the live stream is open', () => {
  withFakeTimers();

  it('reads the leaderboards again every thirty seconds', async () => {
    let reads = 0;
    server.use(
      entrantOnly,
      http.get('/api/v1/orgs/:org/contests/:contest/leaderboards', () => {
        reads += 1;
        return HttpResponse.json([GRADEBOOK]);
      }),
    );
    renderApp('/contests/acme/spring/leaderboards');
    expect(await screen.findByRole('table', { name: 'Gradebook' })).toBeVisible();
    expect(reads).toBe(1);
    await passTime(30_000);
    expect(reads).toBe(2);
  });

  it('reads the contest home again every thirty seconds while it shows a standing', async () => {
    let reads = 0;
    server.use(
      entrantOnly,
      http.get(`${CONTEST_API}/home`, () => {
        reads += 1;
        return HttpResponse.json(
          home({
            registration: registration({ status: 'approved' }),
            standing: [GRADEBOOK],
          }),
        );
      }),
    );
    renderApp('/contests/acme/spring');
    expect(await screen.findByRole('table', { name: 'Gradebook' })).toBeVisible();
    const first = reads;
    await passTime(30_000);
    expect(reads).toBe(first + 1);
  });
});
