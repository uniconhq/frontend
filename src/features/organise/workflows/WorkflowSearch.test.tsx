import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import userEvent from '@/test/user-event';
import { renderWithProviders } from '@/test/render';
import { server } from '@/test/server';
import { workflowItem } from '@/test/workflows';
import { WorkflowSearch } from './WorkflowSearch';

const item = (name: string) =>
  workflowItem({
    owner: 'ada',
    name,
    visibility: 'public',
    editable: false,
    description: 'A special checker.',
    versions: ['v1', 'v2'],
    yanked: {
      v2: { reason: 'Use v1 for now', by: 7, at: '2026-11-01T00:00:00Z' },
    },
  });

describe('workflow search', () => {
  it('searches scopes, follows a short page, and chooses an available version', async () => {
    const calls: URL[] = [];
    server.use(
      http.get('/api/v1/workflow-search', ({ request }) => {
        const url = new URL(request.url);
        calls.push(url);
        return HttpResponse.json(
          url.searchParams.get('page') === '2'
            ? { items: [item('second')], next: null }
            : { items: [item('first')], next: 2 },
        );
      }),
    );
    let chosen = '';
    const user = userEvent.setup();
    renderWithProviders(
      <WorkflowSearch
        onClose={() => undefined}
        onChoose={(ref) => {
          chosen = ref;
        }}
      />,
    );
    expect(await screen.findByText('ada/first')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'More' }));
    expect(await screen.findByText('ada/second')).toBeVisible();
    expect(screen.getByText('ada/first')).toBeVisible();
    const select = screen.getByRole('combobox', { name: 'Version of ada/second' });
    expect(
      within(select).getByRole('option', { name: 'v2 · Not for new tasks' }),
    ).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Choose ada/second' }));
    expect(chosen).toBe('ada/second@v1');
    await user.click(screen.getByRole('button', { name: 'Public' }));
    await waitFor(() => expect(calls.at(-1)?.searchParams.get('scope')).toBe('public'));
    expect(calls.at(-1)?.searchParams.get('page')).toBe('1');
    await user.type(
      screen.getByRole('textbox', { name: 'Search workflows' }),
      'checker',
    );
    await waitFor(() => expect(calls.at(-1)?.searchParams.get('q')).toBe('checker'));
  });
});

it('omits the workflow being edited and shows selection errors inside the dialog', async () => {
  server.use(
    http.get('/api/v1/workflow-search', () =>
      HttpResponse.json({ items: [item('self'), item('other')], next: null }),
    ),
  );
  renderWithProviders(
    <WorkflowSearch
      exclude="ada/self"
      problem="Choose a run workflow."
      onClose={() => undefined}
      onChoose={() => undefined}
    />,
  );
  expect(await screen.findByText('ada/other')).toBeVisible();
  expect(screen.queryByText('ada/self')).toBeNull();
  expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent(
    'Choose a run workflow.',
  );
});
