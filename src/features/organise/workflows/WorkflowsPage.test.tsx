import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@/test/user-event';
import { http, HttpResponse } from 'msw';
import { renderApp } from '@/test/render';
import { problem, server, signedIn } from '@/test/server';
import {
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
  it('lists those one may change apart from those one may only use', async () => {
    server.use(signedIn, listed);
    renderApp('/workflows');

    const mine = await screen.findByRole('list', { name: 'Workflows you can change' });
    expect(
      within(mine)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual(['/workflows/acme/graders', '/workflows/kenny/tuned']);
    expect(mine).toHaveTextContent('Private · Latest version v1');
    expect(mine).toHaveTextContent('Shared · No version yet');
    const others = screen.getByRole('list', { name: 'Workflows you can use' });
    expect(
      within(others).getByRole('link', { name: 'unicon/classic' }),
    ).toBeInTheDocument();
    expect(others).toHaveTextContent('Public · Latest version v2');
  });

  it('makes a workflow from the starter under the person or an org they manage', async () => {
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

    await user.click(await screen.findByRole('button', { name: 'New workflow' }));
    const form = await screen.findByRole('form', { name: 'New workflow' });
    expect(within(form).getByRole('radio', { name: 'The starter' })).toBeChecked();
    const owner = within(form).getByRole('combobox', { name: /Owner/ });
    expect(
      within(owner)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['kenny', 'acme']);
    await user.selectOptions(owner, 'acme');
    await user.type(within(form).getByRole('textbox', { name: /^Name/ }), 'fresh');
    await user.click(within(form).getByRole('button', { name: 'Create workflow' }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/workflows/acme/fresh'),
    );
    expect(made).toEqual({ owner: 'acme', name: 'fresh' });
  });

  it('makes a workflow as a copy of a version, from the same form', async () => {
    let asked: unknown = null;
    server.use(
      signedIn,
      listed,
      http.post('/api/v1/workflow-copies', async ({ request }) => {
        asked = await request.json();
        return HttpResponse.json({ owner: 'kenny', name: 'tuned' }, { status: 201 });
      }),
      ...workflowBackend(CLASSIC_V2).handlers,
    );
    const user = userEvent.setup();
    const { router } = renderApp('/workflows');

    await user.click(await screen.findByRole('button', { name: 'New workflow' }));
    const form = await screen.findByRole('form', { name: 'New workflow' });
    await user.click(within(form).getByRole('radio', { name: 'A copy of a version' }));
    const version = within(form).getByRole('combobox', { name: 'Version to copy' });
    expect(
      within(version)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual([
      'Choose a version',
      'acme/graders@v1',
      'unicon/classic@v1',
      'unicon/classic@v2',
    ]);
    const create = within(form).getByRole('button', { name: 'Create workflow' });
    await user.type(within(form).getByRole('textbox', { name: /^Name/ }), 'tuned');
    expect(create).toBeDisabled();
    await user.selectOptions(version, 'unicon/classic@v2');
    await user.click(create);

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/workflows/kenny/tuned'),
    );
    expect(asked).toEqual({
      source: 'unicon/classic@v2',
      owner: 'kenny',
      name: 'tuned',
    });
  });

  it('offers no way to combine workflows for now', async () => {
    server.use(signedIn, listed);
    renderApp('/workflows');

    await screen.findByRole('list', { name: 'Workflows you can change' });
    expect(screen.queryByRole('form', { name: 'Combine workflows' })).toBeNull();
    expect(screen.queryByText(/Combine/)).toBeNull();
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
  const check = (problems: { path: string; message: string }[] = []) =>
    http.post('/api/v1/workflows/check', () => HttpResponse.json({ problems }));
  /** unicon/classic@v1 as the format before 2026-10-07 wrote it, cut short. */
  const OLD_FORMAT = [
    'inputs:',
    '  - {id: submission, type: code}',
    'steps:',
    '  - id: run',
    '    use: unicon/sandbox-run@v1',
    '    foreach: ${{ inputs.tests }}',
    'outputs:',
    '  outcome: ${{ steps.run.outcome }}',
    '',
  ].join('\n');

  it('draws its latest version, read-only, with its file behind View file', async () => {
    server.use(signedIn, page(['v1', 'v2']), primitives, version(CLASSIC_V2), check());
    const user = userEvent.setup();
    renderApp('/workflows/unicon/classic');

    expect(
      await screen.findByRole('heading', { name: 'unicon/classic@v2' }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('group', { name: 'Step run' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /The port/ })).not.toBeInTheDocument();
    const showing = screen.getByRole('combobox', { name: 'Showing' });
    expect(showing).toHaveValue('v2');
    expect(
      within(showing)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['v2, the latest version', 'Version v1']);
    expect(screen.getByText(/You are looking at v2, a version/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'View file' }));
    const dialog = await screen.findByRole('dialog', { name: 'The file of v2' });
    expect(
      within(dialog).getByLabelText<HTMLTextAreaElement>('The file of v2').value,
    ).toBe(CLASSIC_V2);
  });

  it('opens a version in the old format in the state of one that cannot be opened, with the forge’s reason', async () => {
    const reason = '`outputs` is now `report`: a mapping of name to a reference.';
    server.use(
      signedIn,
      page(['v1', 'v2']),
      primitives,
      version(OLD_FORMAT),
      check([{ path: 'outputs', message: reason }]),
    );
    renderApp('/workflows/unicon/classic?version=v1');

    const state = await screen.findByRole('alert');
    expect(
      within(state).getByRole('heading', { name: 'unicon/classic@v1' }),
    ).toBeVisible();
    expect(state).toHaveTextContent('This version cannot be opened, because:');
    expect(state).toHaveTextContent(`outputs: ${reason}`);
    expect(screen.queryByRole('group', { name: /^Step/ })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Copy into a new workflow' }),
    ).not.toBeInTheDocument();
  });

  it('opens a version the forge refuses to serve in the same state, with its reason', async () => {
    server.use(
      signedIn,
      page(['v1', 'v2']),
      primitives,
      http.get('/api/v1/workflows/unicon/classic/versions/:version', () =>
        problem(404, 'not_found', { detail: 'unicon/classic has no version v1.' }),
      ),
      check(),
    );
    renderApp('/workflows/unicon/classic?version=v1');

    const state = await screen.findByRole('alert');
    expect(state).toHaveTextContent('This version cannot be opened, because:');
    expect(state).toHaveTextContent('unicon/classic has no version v1.');
  });

  it('opens a version whose file does not parse in the same state', async () => {
    const reason = 'workflow.yaml is not valid YAML: a sequence is not closed.';
    server.use(
      signedIn,
      page(['v1', 'v2']),
      primitives,
      version('steps: [\n'),
      check([{ path: '', message: reason }]),
    );
    renderApp('/workflows/unicon/classic?version=v1');

    const state = await screen.findByRole('alert');
    expect(state).toHaveTextContent('This version cannot be opened, because:');
    expect(state).toHaveTextContent(`Overall: ${reason}`);
  });

  it('copies the version into a private workflow of one’s own', async () => {
    let asked: unknown = null;
    server.use(
      signedIn,
      page(['v2']),
      primitives,
      version(CLASSIC_V2),
      check(),
      http.post('/api/v1/workflow-copies', async ({ request }) => {
        asked = await request.json();
        return HttpResponse.json({ owner: 'kenny', name: 'tuned' }, { status: 201 });
      }),
      ...workflowBackend(CLASSIC_V2).handlers,
    );
    const user = userEvent.setup();
    const { router } = renderApp('/workflows/unicon/classic');

    await user.click(
      await screen.findByRole('button', { name: 'Copy into a new workflow' }),
    );
    const form = await screen.findByRole('form', { name: 'New workflow' });
    expect(
      within(form).getByRole('radio', { name: 'A copy of a version' }),
    ).toBeChecked();
    expect(within(form).getByRole('combobox', { name: 'Version to copy' })).toHaveValue(
      'unicon/classic@v2',
    );
    await user.type(within(form).getByRole('textbox', { name: /^Name/ }), 'tuned');
    await user.click(within(form).getByRole('button', { name: 'Create workflow' }));

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

describe('a workflow one may edit', () => {
  it('offers no way to combine it with others for now', async () => {
    server.use(signedIn, ...workflowBackend(CLASSIC_V2).handlers);
    renderApp('/workflows/kenny/tuned');

    await screen.findByRole('group', { name: 'Step run' });
    expect(screen.queryByRole('form', { name: 'Combine workflows' })).toBeNull();
  });
});

describe('who reads a workflow', () => {
  it('applies who reads it as it is chosen, asking before it takes it from people', async () => {
    const backend = workflowBackend(CLASSIC_V2);
    server.use(signedIn, ...backend.handlers);
    const user = userEvent.setup();
    renderApp('/workflows/kenny/tuned');

    await user.click(await screen.findByRole('button', { name: 'Share' }));
    const panel = await screen.findByRole('region', { name: 'Who can see it' });
    await user.click(within(panel).getByRole('radio', { name: /^Shared/ }));
    await waitFor(() => expect(backend.state.visibility).toBe('shared'));
    expect(
      await within(panel).findByText(
        'Shared with nobody yet, so only its owner can see it.',
      ),
    ).toBeInTheDocument();
    await user.type(within(panel).getByRole('textbox', { name: 'Username' }), 'ada');
    await user.click(within(panel).getByRole('button', { name: 'Share' }));
    const readers = await within(panel).findByRole('list', { name: 'Shared with' });
    expect(within(readers).getByText('ada')).toBeInTheDocument();
    expect(await screen.findByText('Shared with 1 person')).toBeInTheDocument();

    // Making it public would take it from ada, so it asks first.
    await user.click(within(panel).getByRole('radio', { name: /^Public/ }));
    expect(within(panel).getByRole('alert')).toHaveTextContent(
      'Making it public stops sharing it with the 1 person it is shared with.',
    );
    expect(backend.state.visibility).toBe('shared');
    await user.click(within(panel).getByRole('button', { name: 'Keep it shared' }));
    await user.click(
      within(panel).getByRole('button', { name: 'Stop sharing with ada' }),
    );
    await waitFor(() => expect(backend.state.readers).toEqual([]));

    await user.click(within(panel).getByRole('radio', { name: /^Public/ }));
    await waitFor(() => expect(backend.state.visibility).toBe('public'));
    expect(WORKFLOW_API).toBe('/api/v1/workflows/kenny/tuned');
  });
});
