import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { createMemoryRouter, RouterProvider } from 'react-router';
import userEvent from '@/test/user-event';
import { renderWithProviders } from '@/test/render';
import { server, someone } from '@/test/server';
import { SessionContext } from '@/session/session-context';
import type { WorkflowItem } from '@/api/types';
import { Combine } from './Combine';

/**
 * Combine is off both workflow pages for now (M36), and comes back once it has
 * a place among the ways to make a workflow; until then it is tested on its
 * own, so it still works when it returns.
 */
const LISTED: WorkflowItem[] = [
  {
    owner: 'acme',
    name: 'graders',
    visibility: 'private',
    versions: ['v1'],
    editable: true,
  },
  { owner: 'kenny', name: 'tuned', visibility: 'shared', versions: [], editable: true },
  {
    owner: 'unicon',
    name: 'classic',
    visibility: 'public',
    versions: ['v1', 'v2'],
    editable: false,
  },
];

function renderCombine() {
  const router = createMemoryRouter(
    [
      { path: '/', element: <Combine items={LISTED} /> },
      { path: '/workflows/:owner/:name', element: <p>Opened</p> },
    ],
    { initialEntries: ['/'] },
  );
  renderWithProviders(
    <SessionContext value={{ status: 'signed-in', me: someone }}>
      <RouterProvider router={router} />
    </SessionContext>,
  );
  return router;
}

describe('combining workflows', () => {
  it('combines two versions or more into a new workflow', async () => {
    let asked: unknown = null;
    server.use(
      http.post('/api/v1/workflow-combinations', async ({ request }) => {
        asked = await request.json();
        return HttpResponse.json({ owner: 'kenny', name: 'both' }, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    const router = renderCombine();

    const form = await screen.findByRole('form', { name: 'Combine workflows' });
    const combine = within(form).getByRole('button', { name: 'Combine' });
    await user.click(within(form).getByRole('checkbox', { name: 'acme/graders@v1' }));
    await user.type(within(form).getByRole('textbox', { name: /^Name/ }), 'both');
    expect(combine).toBeDisabled();
    await user.click(within(form).getByRole('checkbox', { name: 'unicon/classic@v2' }));
    await user.click(combine);

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/workflows/kenny/both'),
    );
    expect(asked).toEqual({
      sources: ['acme/graders@v1', 'unicon/classic@v2'],
      owner: 'kenny',
      name: 'both',
    });
  });
});
