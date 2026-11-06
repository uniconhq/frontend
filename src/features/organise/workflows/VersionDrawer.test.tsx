import { describe, expect, it } from 'vitest';
import { useQuery } from '@tanstack/react-query';
import { $api } from '@/api/query';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import userEvent from '@/test/user-event';
import { renderWithProviders } from '@/test/render';
import { server } from '@/test/server';
import type { WorkflowPage } from '@/api/types';
import { StopNewUse } from './VersionDrawer';

const page: WorkflowPage = {
  owner: 'judgekit',
  name: 'special',
  description: 'A checker.',
  editable: true,
  visibility: 'public',
  versions: ['v1'],
  yanked: {},
  readers: [],
};

describe('stopping new use', () => {
  it('requires a reason and sends it without changing the version', async () => {
    const sent: unknown[] = [];
    server.use(
      http.post(
        '/api/v1/workflows/judgekit/special/versions/v1/yank',
        async ({ request }) => {
          sent.push(await request.json());
          return new HttpResponse(null, { status: 204 });
        },
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<StopNewUse page={page} version="v1" />);
    await user.click(screen.getByRole('button', { name: 'Stop new use' }));
    const dialog = screen.getByRole('dialog', { name: 'Stop new use' });
    const apply = within(dialog).getByRole('button', { name: 'Stop new use' });
    expect(apply).toBeDisabled();
    expect(dialog).toHaveTextContent(
      'Tasks already pinned to v1 keep grading with it.',
    );
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Reason' }),
      'Fixing its checker',
    );
    await user.click(apply);
    await waitFor(() => expect(sent).toEqual([{ reason: 'Fixing its checker' }]));
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
  });
  it('allows an editor to undo a withdrawal', async () => {
    let undone = false;
    server.use(
      http.delete('/api/v1/workflows/judgekit/special/versions/v1/yank', () => {
        undone = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(
      <StopNewUse
        page={{
          ...page,
          yanked: { v1: { reason: 'Fixed now', at: '2026-11-01T00:00:00Z', by: 7 } },
        }}
        version="v1"
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Allow new use' }));
    const dialog = screen.getByRole('dialog', { name: 'Allow new use' });
    expect(dialog).toHaveTextContent('Fixed now');
    await user.click(within(dialog).getByRole('button', { name: 'Allow new use' }));
    await waitFor(() => expect(undone).toBe(true));
  });
  it('reads again only what shows which versions are withdrawn', async () => {
    const reads = { page: 0, list: 0, search: 0, me: 0 };
    server.use(
      http.post(
        '/api/v1/workflows/judgekit/special/versions/v1/yank',
        () => new HttpResponse(null, { status: 204 }),
      ),
      http.get('/api/v1/workflows/judgekit/special', () => {
        reads.page += 1;
        return HttpResponse.json(page);
      }),
      http.get('/api/v1/workflows', () => {
        reads.list += 1;
        return HttpResponse.json([]);
      }),
      http.get('/api/v1/me', () => {
        reads.me += 1;
        return HttpResponse.json([]);
      }),
    );
    function Reading() {
      $api.useQuery('get', '/api/v1/workflows/{owner}/{name}', {
        params: { path: { owner: 'judgekit', name: 'special' } },
      });
      $api.useQuery('get', '/api/v1/workflows');
      $api.useQuery('get', '/api/v1/me');
      useQuery({
        queryKey: ['workflow-search', '', undefined],
        queryFn: () => {
          reads.search += 1;
          return [];
        },
      });
      return <StopNewUse page={page} version="v1" />;
    }
    const user = userEvent.setup();
    renderWithProviders(<Reading />);
    await waitFor(() => expect(reads).toEqual({ page: 1, list: 1, search: 1, me: 1 }));
    await user.click(screen.getByRole('button', { name: 'Stop new use' }));
    const dialog = screen.getByRole('dialog', { name: 'Stop new use' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Reason' }), 'Broken');
    await user.click(within(dialog).getByRole('button', { name: 'Stop new use' }));
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(reads).toEqual({ page: 2, list: 2, search: 2, me: 1 });
  });
});
