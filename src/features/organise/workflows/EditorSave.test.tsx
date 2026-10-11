import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@/test/user-event';
import { renderApp } from '@/test/render';
import { server, signedIn } from '@/test/server';
import { CLASSIC_V2, workflowBackend } from '@/test/workflows';
import { EDITOR_PAGE, previewNow } from '@/test/workflow-editor';

describe('the workflow editor', () => {
  it('saves a draft with a problem and refuses a version of it', async () => {
    const backend = workflowBackend(CLASSIC_V2, {
      problems: (content) =>
        content.includes('memory_limit: 9')
          ? [{ path: 'steps[1].with.memory_limit', message: 'Takes number, not text.' }]
          : [],
    });
    server.use(signedIn, ...backend.handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await user.click(
      await screen.findByRole('button', { name: 'The port memory_limit of run' }),
    );
    await user.click(
      await screen.findByRole('menuitem', {
        name: 'Give it a value in the step’s panel',
      }),
    );
    const panel = await screen.findByRole('region', { name: 'The step run' });
    await user.click(
      within(panel).getByRole('button', { name: 'Remove the wire to memory_limit' }),
    );
    const field = within(panel).getByRole('textbox', { name: /^memory_limit/ });
    await user.type(field, '9{Enter}');
    await waitFor(() => expect(previewNow()).toContain('memory_limit: 9'));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(backend.state.draft).toContain('memory_limit: 9'));
    await user.click(screen.getByRole('button', { name: 'Make the version' }));

    const refused = await screen.findByRole('alert');
    expect(refused).toHaveTextContent('No version was made');
    expect(refused).toHaveTextContent(
      'steps[1].with.memory_limit: Takes number, not text.',
    );
    expect(backend.state.versions).toEqual([]);
  });

  it('makes a version of a saved draft that checks', async () => {
    const backend = workflowBackend(CLASSIC_V2);
    server.use(signedIn, ...backend.handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await user.click(await screen.findByRole('button', { name: 'Make the version' }));

    expect(await screen.findByRole('status', { name: '' })).toHaveTextContent(
      'kenny/tuned@v1 is made.',
    );
    expect(backend.state.versions).toEqual(['v1']);
  });

  it('offers the number after the highest version, whatever else is tagged', async () => {
    const backend = workflowBackend(CLASSIC_V2, { versions: ['v1', 'beta', 'v9'] });
    server.use(signedIn, ...backend.handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    const field = await screen.findByRole('textbox', { name: /New version/ });
    expect(field).toHaveValue('v10');
    await user.click(screen.getByRole('button', { name: 'Make the version' }));

    expect(await screen.findByRole('status', { name: '' })).toHaveTextContent(
      'kenny/tuned@v10 is made.',
    );
    expect(backend.state.versions).toEqual(['v1', 'beta', 'v9', 'v10']);
    expect(screen.getByRole('textbox', { name: /New version/ })).toHaveValue('v11');
  });

  it('says in the forge’s words why a name cannot be a version', async () => {
    const backend = workflowBackend(CLASSIC_V2);
    server.use(signedIn, ...backend.handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    const field = await screen.findByRole('textbox', { name: /New version/ });
    expect(field).toHaveValue('v1');
    await user.clear(field);
    await user.type(field, 'beta');
    await user.click(screen.getByRole('button', { name: 'Make the version' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "No version was made: 'beta' cannot name a version: a version is v and a whole number from 1",
    );
    expect(backend.state.versions).toEqual([]);
  });

  it('opens the merge view on a save over someone else’s, matching steps by id', async () => {
    const backend = workflowBackend(CLASSIC_V2);
    server.use(signedIn, ...backend.handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await user.click(
      await screen.findByRole('button', { name: 'The port args of run' }),
    );
    await user.click(
      await screen.findByRole('menuitem', { name: /^inputs\.time_limit/ }),
    );
    backend.state.draft = CLASSIC_V2.replace(
      'fold: max, better: lower',
      'fold: sum, better: lower',
    );
    backend.state.token = 'someone-else';
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('Someone else saved this file since you opened it.'),
    ).toBeInTheDocument();
    const fields = screen.getByRole('list', { name: 'Fields that differ' });
    expect(within(fields).getByText(/steps\[run\]\.with\.args/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save the merged version' }));
    await waitFor(() =>
      expect(backend.state.draft).toContain('args: ${{ inputs.time_limit }}'),
    );
    expect(backend.state.draft).toContain('fold: sum');
  });

  it(
    'merges again over a second save by someone else, from the file merged over',
    { timeout: 20_000 },
    async () => {
      const backend = workflowBackend(CLASSIC_V2);
      server.use(signedIn, ...backend.handlers);
      const user = userEvent.setup();
      renderApp(EDITOR_PAGE);

      await user.click(
        await screen.findByRole('button', { name: 'The port args of run' }),
      );
      await user.click(
        await screen.findByRole('menuitem', { name: /^inputs\.time_limit/ }),
      );
      backend.state.draft = CLASSIC_V2.replace(
        'fold: max, better: lower',
        'fold: sum, better: lower',
      );
      backend.state.token = 'someone-else';
      await user.click(screen.getByRole('button', { name: 'Save' }));
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
    },
  );

  it('takes the current file in the merge view as one step undo goes back over', async () => {
    const backend = workflowBackend(CLASSIC_V2);
    server.use(signedIn, ...backend.handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await user.click(
      await screen.findByRole('button', { name: 'The port args of run' }),
    );
    await user.click(
      await screen.findByRole('menuitem', { name: /^inputs\.time_limit/ }),
    );
    backend.state.draft = CLASSIC_V2.replace(
      'fold: max, better: lower',
      'fold: sum, better: lower',
    );
    backend.state.token = 'someone-else';
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await user.click(await screen.findByRole('button', { name: 'Drop my changes' }));

    await waitFor(() => expect(previewNow()).toContain('fold: sum'));
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(previewNow()).toContain('args: ${{ inputs.time_limit }}');
  });
});
