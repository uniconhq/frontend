import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import userEvent from '@/test/user-event';
import { renderApp } from '@/test/render';
import { server, signedIn } from '@/test/server';
import { CLASSIC_V2, workflowBackend } from '@/test/workflows';
import {
  EDITOR_PAGE,
  part,
  barButton,
  fileText,
  openMenu,
  outputButton,
  openStep,
  stepPanel,
  portButton,
  toolButton,
} from '@/test/workflow-editor';

/** The forge's check runs 400 ms after the text settles, then answers. */
const CHECKED = { timeout: 3_000 };

describe('saving and publishing a workflow', () => {
  it('saves a draft with a problem, and will not publish a version of it', async () => {
    const backend = workflowBackend(CLASSIC_V2, {
      problems: (content) =>
        content.includes('memory_limit: 9')
          ? [
              {
                path: 'steps[1].with.memory_limit',
                message: 'This takes a number, not text.',
              },
            ]
          : [],
    });
    server.use(signedIn, ...backend.handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await user.click(await portButton('run', 'memory_limit'));
    await user.click(
      within(await openMenu('The port memory_limit of run')).getByRole('menuitem', {
        name: 'Give it a value in the step’s drawer',
      }),
    );
    const panel = stepPanel('run');
    await user.click(
      within(panel).getByRole('button', { name: 'Remove the wire to memory_limit' }),
    );
    await user.type(
      within(panel).getByRole('textbox', { name: /^memory_limit/ }),
      '9{Enter}',
    );
    expect(
      within(part('[role="toolbar"]', 'The workflow')).getByText(
        'Not saved yet: leaving this page loses these changes.',
      ),
    ).toBeInTheDocument();
    await user.click(barButton('Save'));
    await waitFor(() => expect(backend.state.draft).toContain('memory_limit: 9'));
    expect(
      within(part('[role="toolbar"]', 'The workflow')).getByText('All changes saved.'),
    ).toBeInTheDocument();
    await screen.findByText(/One problem to fix/, {}, CHECKED);

    await user.click(barButton('Publish version'));
    const dialog = await screen.findByLabelText('Publish v1', {
      selector: '[role="dialog"]',
    });
    expect(dialog).toHaveTextContent('One problem stops it');
    expect(within(dialog).getByRole('button', { name: 'Publish v1' })).toBeDisabled();
    expect(backend.state.versions).toEqual([]);
  });

  it('will not publish a saved draft until its check has answered', async () => {
    const backend = workflowBackend(CLASSIC_V2);
    server.use(signedIn, ...backend.handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await screen.findByText(/Nothing to fix/, {}, CHECKED);
    server.use(http.post('/api/v1/workflows/check', () => delay('infinite')));
    await user.click(await outputButton('run', 'time_ms'));
    await user.click(
      within(await openMenu('The output time_ms of run')).getByRole('menuitem', {
        name: 'Report it',
      }),
    );
    await user.click(barButton('Save'));
    await waitFor(() => expect(backend.state.draft).toContain('time_ms_2'));

    await user.click(barButton('Publish version'));
    const dialog = await screen.findByLabelText('Publish v1', {
      selector: '[role="dialog"]',
    });
    expect(dialog).toHaveTextContent('The draft is still being checked.');
    expect(within(dialog).getByRole('button', { name: 'Publish v1' })).toBeDisabled();
  });

  it('says in the forge’s words why it made no version', async () => {
    const backend = workflowBackend(CLASSIC_V2, {
      problems: () => [
        {
          path: 'steps[0].use',
          message: 'unicon/compile@v2 is not a primitive Unicon knows.',
        },
      ],
    });
    server.use(
      // The check passed when it ran; the forge refuses when the version is made.
      http.post('/api/v1/workflows/check', () => HttpResponse.json({ problems: [] })),
      signedIn,
      ...backend.handlers,
    );
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await screen.findByText(/Nothing to fix/, {}, CHECKED);
    await user.click(barButton('Publish version'));
    const dialog = await screen.findByLabelText('Publish v1', {
      selector: '[role="dialog"]',
    });
    await user.click(within(dialog).getByRole('button', { name: 'Publish v1' }));

    const refused = await within(dialog).findByRole('alert');
    expect(refused).toHaveTextContent('No version was made');
    expect(refused).toHaveTextContent(
      'unicon/compile@v2 is not a primitive Unicon knows.',
    );
    expect(backend.state.versions).toEqual([]);
  });

  it('publishes a saved draft that checks as the next version', async () => {
    const backend = workflowBackend(CLASSIC_V2);
    server.use(signedIn, ...backend.handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await screen.findByText(/Nothing to fix/, {}, CHECKED);
    await user.click(barButton('Publish version'));
    const dialog = await screen.findByLabelText('Publish v1', {
      selector: '[role="dialog"]',
    });
    expect(dialog).toHaveTextContent('v1 will hold the draft as it was last saved');
    await user.click(within(dialog).getByRole('button', { name: 'Publish v1' }));

    expect(await screen.findByRole('status', { name: '' })).toHaveTextContent(
      'v1 is published. Tasks can choose it now.',
    );
    expect(backend.state.versions).toEqual(['v1']);
  });

  it('publishes the number after the highest version, whatever else is tagged', async () => {
    const backend = workflowBackend(CLASSIC_V2, { versions: ['v1', 'beta', 'v9'] });
    server.use(signedIn, ...backend.handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await screen.findByText(/Nothing to fix/, {}, CHECKED);
    await user.click(barButton('Publish version'));
    const dialog = await screen.findByLabelText('Publish v10', {
      selector: '[role="dialog"]',
    });
    await user.click(within(dialog).getByRole('button', { name: 'Publish v10' }));

    expect(await screen.findByRole('status', { name: '' })).toHaveTextContent(
      'v10 is published.',
    );
    expect(backend.state.versions).toEqual(['v1', 'beta', 'v9', 'v10']);
    await waitFor(() =>
      expect(
        screen.getByRole('option', { name: 'v10, the latest version' }),
      ).toBeInTheDocument(),
    );
    await user.click(barButton('Publish version'));
    expect(
      await screen.findByLabelText('Publish v11', { selector: '[role="dialog"]' }),
    ).toBeInTheDocument();
  });

  it('offers the next version once someone else has published the one it offered', async () => {
    const backend = workflowBackend(CLASSIC_V2, { versions: ['v1'] });
    server.use(signedIn, ...backend.handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await screen.findByText(/Nothing to fix/, {}, CHECKED);
    // Someone else publishes v2 after the page was read.
    backend.state.versions.push('v2');
    await user.click(barButton('Publish version'));
    const dialog = await screen.findByLabelText('Publish v2', {
      selector: '[role="dialog"]',
    });
    await user.click(within(dialog).getByRole('button', { name: 'Publish v2' }));

    expect(
      await within(dialog).findByText(
        'Someone else published v2 meanwhile, so this will be v3.',
      ),
    ).toBeInTheDocument();
    await user.click(await within(dialog).findByRole('button', { name: 'Publish v3' }));
    await waitFor(() => expect(backend.state.versions).toEqual(['v1', 'v2', 'v3']));
  });

  it('asks for a save before publishing changes', async () => {
    const backend = workflowBackend(CLASSIC_V2);
    server.use(signedIn, ...backend.handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    const panel = await openStep(user, 'check');
    await user.click(
      within(panel).getByRole('button', { name: 'Remove the step check' }),
    );
    await user.click(barButton('Publish version'));
    const dialog = await screen.findByLabelText('Publish v1', {
      selector: '[role="dialog"]',
    });

    expect(dialog).toHaveTextContent('You have changes that are not saved.');
    expect(within(dialog).getByRole('button', { name: 'Publish v1' })).toBeDisabled();
  });

  it('shows the draft or a version from the bar’s switcher', async () => {
    const backend = workflowBackend(CLASSIC_V2, { versions: ['v1', 'v2'] });
    server.use(
      signedIn,
      ...backend.handlers,
      http.get('/api/v1/workflows/kenny/tuned/versions/:version', () =>
        HttpResponse.json({ content: CLASSIC_V2 }),
      ),
    );
    const user = userEvent.setup();
    const { router } = renderApp(EDITOR_PAGE);

    const showing = await screen.findByRole('combobox', { name: 'Showing' });
    expect(showing).toHaveValue('');
    expect(screen.getByText(/You are editing the draft/)).toBeInTheDocument();
    expect(
      within(showing)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['The draft', 'v2, the latest version', 'Version v1']);
    await user.selectOptions(showing, 'v1');

    await waitFor(() => expect(router.state.location.search).toBe('?version=v1'));
    expect(
      await screen.findByText(/You are looking at v1, a version/),
    ).toBeInTheDocument();
    expect(
      within(
        screen.getByLabelText('The workflow', { selector: '[role="toolbar"]' }),
      ).queryByRole('button', { name: 'Save' }),
    ).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Copy into a new workflow' }),
    ).toBeInTheDocument();
  });

  it('opens the merge view on a save over someone else’s, matching steps by id', async () => {
    const backend = workflowBackend(CLASSIC_V2);
    server.use(signedIn, ...backend.handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await user.click(await portButton('run', 'args'));
    await user.click(
      within(await openMenu('The port args of run')).getByRole('menuitem', {
        name: /^time_limit from the inputs/,
      }),
    );
    backend.state.draft = CLASSIC_V2.replace(
      'fold: max, better: lower',
      'fold: sum, better: lower',
    );
    backend.state.token = 'someone-else';
    await user.click(barButton('Save'));

    expect(
      await screen.findByText('Someone else saved a change since you opened this.'),
    ).toBeInTheDocument();
    const fields = screen.getByRole('list', { name: 'Fields that differ' });
    expect(within(fields).getByText(/steps\[run\]\.with\.args/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save the merged version' }));
    await waitFor(() =>
      expect(backend.state.draft).toContain('args: ${{ inputs.time_limit }}'),
    );
    expect(backend.state.draft).toContain('fold: sum');
  });

  it('merges again over a second save by someone else, from the file merged over', async () => {
    const backend = workflowBackend(CLASSIC_V2);
    server.use(signedIn, ...backend.handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await user.click(await portButton('run', 'args'));
    await user.click(
      within(await openMenu('The port args of run')).getByRole('menuitem', {
        name: /^time_limit from the inputs/,
      }),
    );
    backend.state.draft = CLASSIC_V2.replace(
      'fold: max, better: lower',
      'fold: sum, better: lower',
    );
    backend.state.token = 'someone-else';
    await user.click(barButton('Save'));
    await screen.findByRole('list', { name: 'Fields that differ' });
    backend.state.draft = backend.state.draft.replace(
      'fold: sum, better: lower',
      'fold: min, better: lower',
    );
    backend.state.token = 'a-third';
    await user.click(screen.getByRole('button', { name: 'Save the merged version' }));

    await waitFor(() =>
      expect(
        within(screen.getByRole('list', { name: 'Fields that differ' })).getByText(
          /time_ms\.fold/,
        ),
      ).toBeInTheDocument(),
    );
    const fields = screen.getByRole('list', { name: 'Fields that differ' });
    expect(within(fields).queryByText(/both changed it/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save the merged version' }));
    await waitFor(() => expect(backend.state.token).not.toBe('a-third'));
    expect(backend.state.draft).toContain('args: ${{ inputs.time_limit }}');
    expect(backend.state.draft).toContain('fold: min');
  });

  it('takes the current file in the merge view as one step undo goes back over', async () => {
    const backend = workflowBackend(CLASSIC_V2);
    server.use(signedIn, ...backend.handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await user.click(await portButton('run', 'args'));
    await user.click(
      within(await openMenu('The port args of run')).getByRole('menuitem', {
        name: /^time_limit from the inputs/,
      }),
    );
    backend.state.draft = CLASSIC_V2.replace(
      'fold: max, better: lower',
      'fold: sum, better: lower',
    );
    backend.state.token = 'someone-else';
    await user.click(barButton('Save'));
    await user.click(await screen.findByRole('button', { name: 'Discard my changes' }));

    expect(await fileText(user)).toContain('fold: sum');
    await user.click(toolButton('Undo'));
    expect(await fileText(user)).toContain('args: ${{ inputs.time_limit }}');
  });
});
