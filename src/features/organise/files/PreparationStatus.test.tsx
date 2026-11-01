import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from '@/test/render';
import { server } from '@/test/server';
import { PreparationStatus } from './PreparationStatus';

const BASE = '/api/v1/orgs/acme/contests/spring/tasks/sum/preparation';
function show() {
  renderWithProviders(
    <MemoryRouter initialEntries={['/orgs/acme/contests/spring/tasks/sum']}>
      <Routes>
        <Route
          path="/orgs/:org/contests/:contest/tasks/:task"
          element={<PreparationStatus id="one" />}
        />
      </Routes>
    </MemoryRouter>,
  );
}
const preparing = {
  id: 'one',
  status: 'preparing',
  reason: null,
  result: null,
  deadline_at: '2026-11-01T12:00:00Z',
};
describe('a save preparing its packages', () => {
  it('polls until the prepared publication is ready', async () => {
    let reads = 0;
    server.use(
      http.get(BASE, () =>
        HttpResponse.json(
          ++reads === 1
            ? preparing
            : { ...preparing, status: 'ready', result: { number: 4 } },
        ),
      ),
    );
    show();
    expect(await screen.findByText('Preparing packages…')).toBeVisible();
    expect(
      await screen.findByText(
        'Saved and published as publication 4.',
        {},
        { timeout: 3000 },
      ),
    ).toBeVisible();
    expect(reads).toBe(2);
  });
  it('shows the refusal and keeps the previous publication in words', async () => {
    server.use(
      http.get(BASE, () =>
        HttpResponse.json({
          ...preparing,
          status: 'refused',
          reason: 'No Python 3.14 wheel for old-package',
        }),
      ),
    );
    show();
    expect(
      await screen.findByText(/No Python 3.14 wheel for old-package/),
    ).toHaveTextContent('the previous publication still grades');
  });
  it('says when a later save replaced this preparation', async () => {
    server.use(http.get(BASE, () => HttpResponse.json({ ...preparing, id: 'later' })));
    show();
    expect(
      await screen.findByText('A later save replaced this preparation.'),
    ).toBeVisible();
  });
});
