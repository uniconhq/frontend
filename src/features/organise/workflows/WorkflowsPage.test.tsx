import { beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@/test/user-event';
import { http, HttpResponse } from 'msw';
import type { TreeEntry } from '@/api/types';
import { renderApp } from '@/test/render';
import { problem, server, signedIn } from '@/test/server';
import { CLASSIC, PRIMITIVES, WORKFLOW_API, workflowBackend } from '@/test/workflows';
import { INPUTS_SHOWN_KEY } from './inputs-shown';

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

  it('makes an empty workflow under the person or an org they manage', async () => {
    let made: unknown = null;
    server.use(
      signedIn,
      listed,
      http.post('/api/v1/workflows', async ({ request }) => {
        made = await request.json();
        return HttpResponse.json({ owner: 'acme', name: 'fresh' }, { status: 201 });
      }),
      ...workflowBackend(CLASSIC).handlers,
    );
    const user = userEvent.setup();
    const { router } = renderApp('/workflows');

    await user.click(await screen.findByRole('button', { name: 'New workflow' }));
    const form = await screen.findByRole('form', { name: 'New workflow' });
    expect(within(form).queryByRole('radio')).toBeNull();
    expect(within(form).getAllByRole('textbox')).toHaveLength(1);
    expect(form).toHaveTextContent(
      'It starts empty. Add its steps from the tray: primitives, or other workflows as boxes.',
    );
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

  it('offers no way to combine workflows for now', async () => {
    server.use(signedIn, listed);
    renderApp('/workflows');

    await screen.findByRole('list', { name: 'Workflows you can change' });
    expect(screen.queryByRole('form', { name: 'Combine workflows' })).toBeNull();
    expect(screen.queryByText(/Combine/)).toBeNull();
  });
});

describe('a workflow one may only read', () => {
  // The file boxes' tests read boxes a browser shows once it chooses to.
  beforeEach(() => {
    localStorage.setItem(INPUTS_SHOWN_KEY, 'shown');
  });

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

  it('draws its latest version, read-only, with its file behind View YAML', async () => {
    server.use(signedIn, page(['v1', 'v2']), primitives, version(CLASSIC), check());
    const user = userEvent.setup();
    renderApp('/workflows/unicon/classic');

    expect(
      await screen.findByRole('heading', { name: 'unicon/classic@v2' }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('group', { name: 'Step run' })).toBeInTheDocument();
    // A public workflow's chip stands out, as anyone can use it.
    expect(screen.getByText('Public', { selector: 'span' })).toHaveClass(/_live_/);
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
    await user.click(screen.getByRole('button', { name: 'View YAML' }));
    const dialog = await screen.findByRole('dialog', { name: 'The YAML of v2' });
    expect(
      within(dialog).getByLabelText<HTMLTextAreaElement>('The YAML of v2').value,
    ).toBe(CLASSIC);
  });

  it('hides a version’s inputs as the editor does, popping them out from a step’s tab', async () => {
    localStorage.setItem(INPUTS_SHOWN_KEY, 'hidden');
    server.use(signedIn, page(['v1', 'v2']), primitives, version(CLASSIC), check());
    const user = userEvent.setup();
    renderApp('/workflows/unicon/classic');

    const run = await screen.findByRole('group', { name: 'Step run' });
    expect(screen.queryByRole('group', { name: /^Input / })).toBeNull();
    await user.hover(within(run).getByRole('button', { name: '3 inputs of Step run' }));
    const input = await screen.findByRole('group', { name: 'Input input' });
    await user.click(within(input).getByRole('button'));
    await waitFor(() =>
      expect(screen.queryByRole('group', { name: 'Input input' })).toBeNull(),
    );

    await user.click(screen.getByRole('checkbox', { name: 'Show inputs and files' }));
    expect(
      await screen.findByRole('group', { name: 'Input input' }),
    ).toBeInTheDocument();
  });

  it('says a step’s folder port takes a file or a folder', async () => {
    server.use(signedIn, page(['v1', 'v2']), primitives, version(CLASSIC), check());
    const user = userEvent.setup();
    renderApp('/workflows/unicon/classic');

    const compile = await screen.findByRole('group', { name: 'Step compile' });
    await user.click(within(compile).getByRole('button', { name: /^compile/ }));
    expect(await within(compile).findByText(/^file or folder · /)).toBeInTheDocument();
  });

  it('opens a box of a version in the editor’s drawer, every field locked and nothing to remove', async () => {
    server.use(signedIn, page(['v1', 'v2']), primitives, version(CLASSIC), check());
    const user = userEvent.setup();
    renderApp('/workflows/unicon/classic');

    const run = await screen.findByRole('group', { name: 'Step run' });
    await user.click(within(run).getByRole('button', { name: /^run/ }));
    const drawer = await screen.findByRole('complementary', { name: 'Step run' });
    const name = within(drawer).getByRole('textbox', { name: 'Name' });
    expect(name).toHaveValue('run');
    expect(name).toBeDisabled();
    const stdin = within(drawer).getByRole('combobox', { name: /^stdin/ });
    expect(stdin).toHaveDisplayValue('input from the inputs');
    expect(stdin).toBeDisabled();
    expect(within(drawer).queryByRole('button', { name: /^Remove/ })).toBeNull();
    expect(within(drawer).getByText('What it gives')).toBeInTheDocument();

    await user.click(within(drawer).getByRole('button', { name: /Close/ }));
    expect(screen.queryByRole('complementary', { name: 'Step run' })).toBeNull();
  });

  /** What a version was frozen with, folder by folder, as its tree answers. */
  const frozen = (folders: Record<string, TreeEntry[]>) =>
    http.get('/api/v1/workflows/unicon/classic/versions/:version/tree', ({ request }) =>
      HttpResponse.json(
        folders[new URL(request.url).searchParams.get('path') ?? ''] ?? [],
      ),
    );
  const entry = (
    path: string,
    kind: TreeEntry['kind'],
    size: number | null = null,
  ) => ({
    path,
    kind,
    size,
    upload: null,
    start: null,
    token: null,
    version: null,
  });

  it('lists the files of a workflow folder’s box in its drawer, each downloading through the door', async () => {
    const upload = { size: 5_000_000, digest: 'a'.repeat(64) };
    server.use(
      signedIn,
      page(['v1']),
      primitives,
      version(
        CLASSIC.replace('stdin: ${{ inputs.input }}', 'stdin: ${{ workflow.data/ }}'),
      ),
      check(),
      frozen({ data: [{ ...entry('data/big input.bin', 'file', 130), upload }] }),
    );
    const user = userEvent.setup();
    renderApp('/workflows/unicon/classic');

    const box = await screen.findByRole('group', { name: 'Workflow file data/' });
    await user.click(within(box).getByRole('button', { name: /^data\// }));
    const files = await screen.findByRole('complementary', { name: 'Workflow file' });
    await user.click(
      await within(files).findByRole('button', { name: /^big input\.bin/ }),
    );
    expect(
      within(files).getByRole('link', { name: 'Download big input.bin' }),
    ).toHaveAttribute(
      'href',
      '/-/downloads/workflows/unicon/classic/versions/v1/data/big%20input.bin',
    );
    // An upload by the size of what it holds, not of its pointer.
    expect(
      within(within(files).getByRole('region', { name: 'big input.bin' })).getByText(
        '4.8 MB',
      ),
    ).toBeInTheDocument();
  });

  it('lists the version’s files from Files on the bar, all but its workflow.yaml, which View YAML shows', async () => {
    server.use(
      signedIn,
      page(['v1']),
      primitives,
      version(CLASSIC),
      check(),
      frozen({
        '': [entry('workflow.yaml', 'file', 900), entry('score.py', 'file', 30)],
      }),
    );
    const user = userEvent.setup();
    renderApp('/workflows/unicon/classic');

    await screen.findByRole('group', { name: 'Step run' });
    await user.click(screen.getByRole('button', { name: 'Files' }));
    const files = await screen.findByRole('complementary', { name: 'Files' });
    expect(
      await within(files).findByRole('button', { name: /^score\.py/ }),
    ).toBeInTheDocument();
    expect(within(files).queryByRole('button', { name: /^workflow\.yaml/ })).toBeNull();
  });

  it('downloads the file a workflow file’s box stands for from its drawer', async () => {
    server.use(
      signedIn,
      page(['v1']),
      primitives,
      version(
        CLASSIC.replace(
          'stdin: ${{ inputs.input }}',
          'stdin: ${{ workflow.data/input.txt }}',
        ),
      ),
      check(),
      frozen({}),
    );
    const user = userEvent.setup();
    renderApp('/workflows/unicon/classic');

    const box = await screen.findByRole('group', {
      name: 'Workflow file data/input.txt',
    });
    await user.click(within(box).getByRole('button', { name: /^data\/input\.txt/ }));
    const drawer = await screen.findByRole('complementary', { name: 'Workflow file' });
    expect(
      within(drawer).getByRole('link', { name: 'Download input.txt' }),
    ).toHaveAttribute(
      'href',
      '/-/downloads/workflows/unicon/classic/versions/v1/data/input.txt',
    );
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
    // Asking again cannot find it; the switcher offers the versions there are.
    expect(within(state).queryByRole('button', { name: 'Try again' })).toBeNull();
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

  it('offers no copy action on a version', async () => {
    server.use(signedIn, page(['v2']), primitives, version(CLASSIC), check());
    renderApp('/workflows/unicon/classic');
    await screen.findByText('unicon/classic@v2', { selector: 'h2' });
    expect(
      screen.queryByRole('button', { name: 'Copy into a new workflow' }),
    ).toBeNull();
  });
});

describe('a workflow one may edit', () => {
  it('offers no way to combine it with others for now', async () => {
    server.use(signedIn, ...workflowBackend(CLASSIC).handlers);
    renderApp('/workflows/kenny/tuned');

    await screen.findByRole('group', { name: 'Step run' });
    expect(screen.queryByRole('form', { name: 'Combine workflows' })).toBeNull();
  });
});

describe('who reads a workflow', () => {
  it('applies who reads it as it is chosen, asking before it takes it from people', async () => {
    const backend = workflowBackend(CLASSIC);
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
    expect(await screen.findByText('Shared with 1 person')).toHaveClass(/_quiet_/);

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
    // The header's chip, not the panel's radio of the same name, stands out now.
    await waitFor(() =>
      expect(
        screen.getAllByText('Public').find((found) => !panel.contains(found)),
      ).toHaveClass(/_live_/),
    );
    expect(WORKFLOW_API).toBe('/api/v1/workflows/kenny/tuned');
  });
});
