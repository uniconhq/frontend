import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import userEvent from '@/test/user-event';
import { renderApp } from '@/test/render';
import { afterAnswers, server, signedIn } from '@/test/server';
import { CLASSIC, workflowBackend } from '@/test/workflows';
import { comeBackToTab, fakeLiveStream, openStream, realLiveStream } from '@/test/live';
import {
  EDITOR_PAGE,
  part,
  barButton,
  fileText,
  openMenu,
  outputButton,
  stepPanel,
  portButton,
  toolButton,
  findDialog,
  findMerge,
  findProblems,
} from '@/test/workflow-editor';

/** The forge's check of a draft whose run step is given its memory as text. */
const memoryAsText = (content: string) =>
  content.includes('memory_limit: 9')
    ? [
        {
          path: 'steps[0].with.memory_limit',
          message: 'This takes a number, not text.',
        },
      ]
    : [];

describe('saving and publishing a workflow', () => {
  it('saves a draft with a problem', async () => {
    const backend = workflowBackend(CLASSIC, { problems: memoryAsText });
    server.use(signedIn, ...backend.handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await user.click(await portButton(user, 'run', 'memory_limit'));
    await user.click(
      within(await openMenu('The port memory_limit of run')).getByRole('menuitem', {
        name: 'Give it a value in the step’s drawer',
      }),
    );
    const panel = stepPanel('run');
    await user.selectOptions(
      within(panel).getByRole('combobox', { name: 'memory_limit' }),
      'A fixed value',
    );
    await user.type(
      within(panel).getByRole('textbox', { name: 'Value of memory_limit' }),
      '9{Enter}',
    );
    expect(
      within(part('[role="toolbar"]', 'The workflow')).getByText(
        'Not saved yet: leaving this page loses these changes.',
      ),
    ).toBeInTheDocument();
    await user.click(barButton('Save'));
    expect(
      await within(part('[role="toolbar"]', 'The workflow')).findByText(
        'All changes saved.',
      ),
    ).toBeInTheDocument();
    expect(backend.state.draft).toContain('memory_limit: 9');
    await findProblems(/One problem to fix/);
  });

  it('will not publish a version of a saved draft with a problem', async () => {
    const backend = workflowBackend(
      CLASSIC.replace('memory_limit: ${{ inputs.memory_limit }}', 'memory_limit: 9'),
      { problems: memoryAsText },
    );
    server.use(signedIn, ...backend.handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await findProblems(/One problem to fix/);
    await user.click(barButton('Publish version'));
    const dialog = await findDialog('Publish v1');
    expect(dialog).toHaveTextContent('One problem stops it');
    expect(within(dialog).getByRole('button', { name: 'Publish v1' })).toBeDisabled();
    expect(backend.state.versions).toEqual([]);
  });

  it('will not publish a saved draft until its check has answered', async () => {
    const backend = workflowBackend(CLASSIC);
    server.use(signedIn, ...backend.handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await findProblems(/Nothing to fix/);
    server.use(http.post('/api/v1/workflows/check', () => delay('infinite')));
    await user.click(await outputButton(user, 'run', 'time_ms'));
    await user.click(
      within(await openMenu('The output time_ms of run')).getByRole('menuitem', {
        name: 'Name it as an output',
      }),
    );
    await user.click(barButton('Save'));
    await waitFor(() => expect(backend.state.draft).toContain('time_ms_2'));

    await user.click(barButton('Publish version'));
    const dialog = await findDialog('Publish v1');
    expect(dialog).toHaveTextContent('The draft is still being checked.');
    expect(within(dialog).getByRole('button', { name: 'Publish v1' })).toBeDisabled();
  });

  it('says in the forge’s words why it made no version', async () => {
    const backend = workflowBackend(CLASSIC, {
      problems: () => [
        {
          path: 'steps[1].use',
          message: 'unicon/diff-check@v2 is not a primitive Unicon knows.',
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

    await findProblems(/Nothing to fix/);
    await user.click(barButton('Publish version'));
    const dialog = await findDialog('Publish v1');
    await user.click(within(dialog).getByRole('button', { name: 'Publish v1' }));

    const refused = await within(dialog).findByRole('alert');
    expect(refused).toHaveTextContent('No version was made');
    expect(refused).toHaveTextContent(
      'unicon/diff-check@v2 is not a primitive Unicon knows.',
    );
    expect(backend.state.versions).toEqual([]);
  });

  it('publishes a saved draft that checks as the next version', async () => {
    const backend = workflowBackend(CLASSIC);
    server.use(signedIn, ...backend.handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await findProblems(/Nothing to fix/);
    await user.click(barButton('Publish version'));
    const dialog = await findDialog('Publish v1');
    expect(dialog).toHaveTextContent('v1 will hold the draft as it was last saved');
    await user.click(within(dialog).getByRole('button', { name: 'Publish v1' }));

    expect(await screen.findByRole('status', { name: '' })).toHaveTextContent(
      'v1 is published. Tasks can choose it now.',
    );
    expect(backend.state.versions).toEqual(['v1']);
  });

  it('publishes the number after the highest version, whatever else is tagged', async () => {
    const backend = workflowBackend(CLASSIC, { versions: ['v1', 'beta', 'v9'] });
    server.use(signedIn, ...backend.handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await findProblems(/Nothing to fix/);
    await user.click(barButton('Publish version'));
    const dialog = await findDialog('Publish v10');
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
    expect(await findDialog('Publish v11')).toBeInTheDocument();
  });

  it('offers the next version once someone else has published the one it offered', async () => {
    const backend = workflowBackend(CLASSIC, { versions: ['v1'] });
    server.use(signedIn, ...backend.handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await findProblems(/Nothing to fix/);
    // Someone else publishes v2 after the page was read.
    backend.state.versions.push('v2');
    await user.click(barButton('Publish version'));
    const dialog = await findDialog('Publish v2');
    await user.click(within(dialog).getByRole('button', { name: 'Publish v2' }));

    expect(
      await within(dialog).findByText(
        'Someone else published v2 meanwhile, so this will be v3.',
      ),
    ).toBeInTheDocument();
    await user.click(await within(dialog).findByRole('button', { name: 'Publish v3' }));
    await waitFor(() => expect(backend.state.versions).toEqual(['v1', 'v2', 'v3']));
  });

  it('saves changes and then publishes what was saved, from Save and publish', async () => {
    const backend = workflowBackend(CLASSIC);
    server.use(signedIn, ...backend.handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await findProblems(/Nothing to fix/);
    await user.click(await outputButton(user, 'run', 'time_ms'));
    await user.click(
      within(await openMenu('The output time_ms of run')).getByRole('menuitem', {
        name: 'Name it as an output',
      }),
    );
    await findProblems(/Nothing to fix/);
    await user.click(barButton('Publish version'));
    const dialog = await findDialog('Publish v1');

    expect(dialog).toHaveTextContent(
      'You have changes that are not saved. Save and publish saves them, then publishes v1.',
    );
    expect(within(dialog).queryByRole('button', { name: 'Publish v1' })).toBeNull();
    const both = within(dialog).getByRole('button', { name: 'Save and publish v1' });
    // Once the change has been checked.
    await waitFor(() => expect(both).toBeEnabled());
    await user.click(both);

    expect(await screen.findByRole('status', { name: '' })).toHaveTextContent(
      'v1 is published.',
    );
    expect(backend.state.draft).toContain('time_ms_2');
    expect(backend.state.versions).toEqual(['v1']);
    expect(barButton('Save')).toBeDisabled();
  });

  it('publishes nothing when the save before it meets someone else’s, and says so', async () => {
    const backend = workflowBackend(CLASSIC);
    server.use(signedIn, ...backend.handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await findProblems(/Nothing to fix/);
    await user.click(await outputButton(user, 'run', 'time_ms'));
    await user.click(
      within(await openMenu('The output time_ms of run')).getByRole('menuitem', {
        name: 'Name it as an output',
      }),
    );
    await findProblems(/Nothing to fix/);
    // Someone else saves the draft after the page was read.
    backend.state.draft = `${CLASSIC}# theirs\n`;
    backend.state.token = 'theirs';
    await user.click(barButton('Publish version'));
    const dialog = await findDialog('Publish v1');
    const both = within(dialog).getByRole('button', { name: 'Save and publish v1' });
    // Once the change has been checked.
    await waitFor(() => expect(both).toBeEnabled());
    await user.click(both);

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'The draft was not saved, so nothing was published. Someone else saved the draft meanwhile.',
    );
    expect(backend.state.versions).toEqual([]);
  });

  it('shows the draft or a version from the bar’s switcher', async () => {
    const backend = workflowBackend(CLASSIC, { versions: ['v1', 'v2'] });
    server.use(
      signedIn,
      ...backend.handlers,
      http.get('/api/v1/workflows/kenny/tuned/versions/:version', () =>
        HttpResponse.json({ content: CLASSIC }),
      ),
    );
    const user = userEvent.setup();
    const { router } = renderApp(EDITOR_PAGE);

    const showing = await screen.findByRole('combobox', { name: 'Showing' });
    expect(showing).toHaveValue('');
    expect(screen.getByText(/You are editing the draft/)).toBeInTheDocument();
    // The sentence is under the bar, not in the part that stays in view.
    expect(
      screen.getByText(/You are editing the draft/).closest('[data-workflow-bar]'),
    ).toBeNull();
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
      screen.queryByRole('button', { name: 'Copy into a new workflow' }),
    ).toBeNull();
  });

  it('opens the merge view on a save over someone else’s, matching steps by id', async () => {
    const backend = workflowBackend(CLASSIC);
    server.use(signedIn, ...backend.handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await user.click(await portButton(user, 'run', 'args'));
    await user.click(
      within(await openMenu('The port args of run')).getByRole('menuitem', {
        name: /^time_limit from the inputs/,
      }),
    );
    backend.state.draft = CLASSIC.replace(
      'time_ms: {from: "${{ steps.run.time_ms }}", unit: ms}',
      'time_ms: {from: "${{ steps.run.time_ms }}", unit: s}',
    );
    backend.state.token = 'someone-else';
    await user.click(barButton('Save'));

    expect(
      await screen.findByText('Someone else saved a change since you opened this.'),
    ).toBeInTheDocument();
    const fields = part('ul', 'Fields that differ');
    expect(within(fields).getByText(/steps\[run\]\.with\.args/)).toBeInTheDocument();
    await user.click(
      within(await findMerge()).getByRole('button', {
        name: 'Save the merged version',
      }),
    );
    await waitFor(() =>
      expect(backend.state.draft).toContain('args: ${{ inputs.time_limit }}'),
    );
    expect(backend.state.draft).toContain(
      'time_ms: {from: "${{ steps.run.time_ms }}", unit: s}',
    );
  });

  it('keeps the unsaved draft when the tab comes back after someone else saved, and meets theirs at the save', async () => {
    fakeLiveStream();
    try {
      const backend = workflowBackend(CLASSIC);
      server.use(signedIn, ...backend.handlers);
      const user = userEvent.setup();
      renderApp(EDITOR_PAGE);

      await user.click(await portButton(user, 'run', 'args'));
      openStream();
      await user.click(
        within(await openMenu('The port args of run')).getByRole('menuitem', {
          name: /^time_limit from the inputs/,
        }),
      );
      backend.state.draft = CLASSIC.replace(
        'time_ms: {from: "${{ steps.run.time_ms }}", unit: ms}',
        'time_ms: {from: "${{ steps.run.time_ms }}", unit: s}',
      );
      backend.state.token = 'someone-else';
      await afterAnswers(comeBackToTab);

      const bar = part('[role="toolbar"]', 'The workflow');
      expect(
        within(bar).getByText('Not saved yet: leaving this page loses these changes.'),
      ).toBeInTheDocument();
      expect(await fileText(user)).toContain('args: ${{ inputs.time_limit }}');
      expect(barButton('Save')).not.toHaveAttribute('data-loading');

      await user.click(barButton('Save'));
      expect(
        await screen.findByText('Someone else saved a change since you opened this.'),
      ).toBeInTheDocument();
      expect(backend.state.saves).toEqual([
        expect.objectContaining({ token: 'token-1' }),
      ]);
    } finally {
      realLiveStream();
    }
  });

  it('merges again over a second save by someone else, from the file merged over', async () => {
    const backend = workflowBackend(CLASSIC);
    server.use(signedIn, ...backend.handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await user.click(await portButton(user, 'run', 'args'));
    await user.click(
      within(await openMenu('The port args of run')).getByRole('menuitem', {
        name: /^time_limit from the inputs/,
      }),
    );
    backend.state.draft = CLASSIC.replace(
      'time_ms: {from: "${{ steps.run.time_ms }}", unit: ms}',
      'time_ms: {from: "${{ steps.run.time_ms }}", unit: s}',
    );
    backend.state.token = 'someone-else';
    await user.click(barButton('Save'));
    await findMerge();
    backend.state.draft = backend.state.draft.replace(
      'time_ms: {from: "${{ steps.run.time_ms }}", unit: s}',
      'time_ms: {from: "${{ steps.run.time_ms }}", unit: min}',
    );
    backend.state.token = 'a-third';
    await user.click(
      within(await findMerge()).getByRole('button', {
        name: 'Save the merged version',
      }),
    );

    await waitFor(() =>
      expect(
        within(part('ul', 'Fields that differ')).getByText(/time_ms\.unit/),
      ).toBeInTheDocument(),
    );
    const fields = part('ul', 'Fields that differ');
    expect(within(fields).queryByText(/both changed it/)).not.toBeInTheDocument();
    await user.click(
      within(await findMerge()).getByRole('button', {
        name: 'Save the merged version',
      }),
    );
    await waitFor(() => expect(backend.state.token).not.toBe('a-third'));
    expect(backend.state.draft).toContain('args: ${{ inputs.time_limit }}');
    expect(backend.state.draft).toContain(
      'time_ms: {from: "${{ steps.run.time_ms }}", unit: min}',
    );
  });

  it('takes the current file in the merge view as one step undo goes back over', async () => {
    const backend = workflowBackend(CLASSIC);
    server.use(signedIn, ...backend.handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await user.click(await portButton(user, 'run', 'args'));
    await user.click(
      within(await openMenu('The port args of run')).getByRole('menuitem', {
        name: /^time_limit from the inputs/,
      }),
    );
    backend.state.draft = CLASSIC.replace(
      'time_ms: {from: "${{ steps.run.time_ms }}", unit: ms}',
      'time_ms: {from: "${{ steps.run.time_ms }}", unit: s}',
    );
    backend.state.token = 'someone-else';
    await user.click(barButton('Save'));
    await user.click(
      within(await findMerge()).getByRole('button', { name: 'Discard my changes' }),
    );

    expect(await fileText(user)).toContain(
      'time_ms: {from: "${{ steps.run.time_ms }}", unit: s}',
    );
    await user.click(toolButton('Undo'));
    expect(await fileText(user)).toContain('args: ${{ inputs.time_limit }}');
  });
});
