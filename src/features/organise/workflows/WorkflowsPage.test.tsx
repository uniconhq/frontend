import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderApp } from '@/test/render';
import { server, signedIn } from '@/test/server';
import {
  CLASSIC_V1,
  CLASSIC_V2,
  PRIMITIVES,
  WORKFLOW_API,
  workflowBackend,
} from '@/test/workflows';

const LISTED = [
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

const listed = http.get('/api/v1/workflows', () => HttpResponse.json(LISTED));

describe('the workflows page', () => {
  it('lists those one may edit apart from those one may only read', async () => {
    server.use(signedIn, listed);
    renderApp('/workflows');

    const mine = await screen.findByRole('list', { name: 'Yours to edit' });
    expect(
      within(mine)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual(['/workflows/acme/graders', '/workflows/kenny/tuned']);
    const others = screen.getByRole('list', { name: 'You may read' });
    expect(
      within(others).getByRole('link', { name: 'unicon/classic' }),
    ).toBeInTheDocument();
  });

  it('makes a workflow under the person or an org they manage and opens it', async () => {
    let made: unknown = null;
    server.use(
      signedIn,
      listed,
      http.post('/api/v1/workflows', async ({ request }) => {
        made = await request.json();
        return HttpResponse.json({ owner: 'acme', name: 'fresh' }, { status: 201 });
      }),
      ...workflowBackend(CLASSIC_V2).handlers,
    );
    const user = userEvent.setup();
    const { router } = renderApp('/workflows');

    const form = await screen.findByRole('form', { name: 'New workflow' });
    const owner = within(form).getByRole('combobox', { name: /Owner/ });
    expect(
      within(owner)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['kenny', 'acme']);
    await user.selectOptions(owner, 'acme');
    await user.type(within(form).getByRole('textbox', { name: /^Name/ }), 'fresh');
    await user.click(within(form).getByRole('button', { name: 'Make it' }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/workflows/acme/fresh'),
    );
    expect(made).toEqual({ owner: 'acme', name: 'fresh' });
  });

  it('combines two versions or more into a new workflow', async () => {
    let asked: unknown = null;
    server.use(
      signedIn,
      listed,
      http.post('/api/v1/workflow-combinations', async ({ request }) => {
        asked = await request.json();
        return HttpResponse.json({ owner: 'kenny', name: 'both' }, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    const { router } = renderApp('/workflows');

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

describe('a workflow one may only read', () => {
  const page = (versions: string[]) =>
    http.get('/api/v1/workflows/unicon/classic', () =>
      HttpResponse.json({
        owner: 'unicon',
        name: 'classic',
        visibility: 'public',
        versions,
        editable: false,
        draft: null,
        readers: [],
      }),
    );
  const primitives = http.get('/api/v1/primitives', () =>
    HttpResponse.json(PRIMITIVES),
  );
  const version = (text: string) =>
    http.get('/api/v1/workflows/unicon/classic/versions/:version', () =>
      HttpResponse.json({ content: text }),
    );

  it('draws its latest version, read-only, with its file', async () => {
    server.use(signedIn, page(['v1', 'v2']), primitives, version(CLASSIC_V2));
    renderApp('/workflows/unicon/classic');

    expect(
      await screen.findByRole('heading', { name: 'unicon/classic@v2' }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('group', { name: 'Step run' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /The port/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText<HTMLTextAreaElement>('workflow.yaml').value).toBe(
      CLASSIC_V2,
    );
  });

  it('draws a version in the format before 2026-10-07 from its old keys', async () => {
    server.use(signedIn, page(['v1', 'v2']), primitives, version(CLASSIC_V1));
    renderApp('/workflows/unicon/classic?version=v1');

    expect(
      await screen.findByRole('heading', { name: 'unicon/classic@v1' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('group', { name: 'Step compile' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Step check' })).toBeInTheDocument();
  });

  it('copies the version into a private workflow of one’s own', async () => {
    let asked: unknown = null;
    server.use(
      signedIn,
      page(['v2']),
      primitives,
      version(CLASSIC_V2),
      http.post('/api/v1/workflow-copies', async ({ request }) => {
        asked = await request.json();
        return HttpResponse.json({ owner: 'kenny', name: 'tuned' }, { status: 201 });
      }),
      ...workflowBackend(CLASSIC_V2).handlers,
    );
    const user = userEvent.setup();
    const { router } = renderApp('/workflows/unicon/classic');

    const form = await screen.findByRole('form', { name: 'Copy it' });
    await user.type(within(form).getByRole('textbox', { name: /^Name/ }), 'tuned');
    await user.click(within(form).getByRole('button', { name: 'Copy' }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/workflows/kenny/tuned'),
    );
    expect(asked).toEqual({
      source: 'unicon/classic@v2',
      owner: 'kenny',
      name: 'tuned',
    });
  });
});

describe('who reads a workflow', () => {
  it('shares it with a person and takes it away again', async () => {
    const backend = workflowBackend(CLASSIC_V2);
    server.use(signedIn, ...backend.handlers);
    const user = userEvent.setup();
    renderApp('/workflows/kenny/tuned');

    const panel = await screen.findByRole('region', { name: 'Who reads it' });
    await user.click(
      within(panel).getByRole('radio', { name: 'Shared with the people listed' }),
    );
    await user.click(within(panel).getByRole('button', { name: 'Make it shared' }));
    await waitFor(() => expect(backend.state.visibility).toBe('shared'));
    expect(
      within(panel).getByText('Shared with nobody yet, so only its owner reads it.'),
    ).toBeInTheDocument();
    await user.type(within(panel).getByRole('textbox', { name: 'Username' }), 'ada');
    await user.click(within(panel).getByRole('button', { name: 'Share' }));

    const readers = await within(panel).findByRole('list', { name: 'Shared with' });
    expect(within(readers).getByText('ada')).toBeInTheDocument();
    await user.click(
      within(readers).getByRole('button', { name: 'Stop sharing with ada' }),
    );
    await waitFor(() => expect(backend.state.readers).toEqual([]));

    await user.click(within(panel).getByRole('radio', { name: 'Public: everyone' }));
    await user.click(within(panel).getByRole('button', { name: 'Make it public' }));
    await waitFor(() => expect(backend.state.visibility).toBe('public'));
    expect(WORKFLOW_API).toBe('/api/v1/workflows/kenny/tuned');
  });
});
