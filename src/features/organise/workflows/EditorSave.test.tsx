import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { afterAnswers, server } from '@/test/server';
import { CLASSIC, valuesOf, versionOf } from '@/test/workflows';
import { comeBackToTab, fakeLiveStream, openStream, realLiveStream } from '@/test/live';
import {
  openEditor,
  part,
  barButton,
  openMenu,
  outputButton,
  stepPanel,
  portButton,
  toolButton,
  findDialog,
  findProblems,
  savedValues,
} from '@/test/workflow-editor';

type Values = Record<string, unknown>;

/** The `with` of the run step in a draft's values. */
const runOf = (values: Values | null): Values =>
  ((values?.steps as Values[] | undefined)?.[0]?.with ?? {}) as Values;

/** The draft's named outputs. */
const outputsOf = (values: Values | null): Values => (values?.outputs ?? {}) as Values;

/** The draft as someone else saved it: run's time in seconds. */
const theirs = (): Values =>
  valuesOf(
    CLASSIC.replace(
      'time_ms: {from: "${{ steps.run.time_ms }}", unit: ms}',
      'time_ms: {from: "${{ steps.run.time_ms }}", unit: s}',
    ),
  );

/** The forge's check of a draft whose run step is given a fixed memory. */
const memoryAsText = (values: Values) =>
  runOf(values).memory_limit === 9
    ? [
        {
          path: ['steps', 0, 'with', 'memory_limit'],
          message: 'This takes a number, not text.',
        },
      ]
    : [];

describe('saving and publishing a workflow', () => {
  it('saves a draft with a problem', async () => {
    const { user, backend } = openEditor({ problems: memoryAsText });

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
    expect(runOf(backend.state.values).memory_limit).toBe(9);
    await findProblems(/One problem to fix/);
  });

  it('will not publish a version of a saved draft with a problem', async () => {
    const { user, backend } = openEditor({
      draft: CLASSIC.replace(
        'memory_limit: ${{ inputs.memory_limit }}',
        'memory_limit: 9',
      ),
      problems: memoryAsText,
    });

    await findProblems(/One problem to fix/);
    await user.click(barButton('Publish version'));
    const dialog = await findDialog('Publish v1');
    expect(dialog).toHaveTextContent('One problem stops it');
    expect(within(dialog).getByRole('button', { name: 'Publish v1' })).toBeDisabled();
    expect(backend.state.versions).toEqual([]);
  });

  it('will not publish a saved draft until its check has answered', async () => {
    const { user, backend } = openEditor();

    await findProblems(/Nothing to fix/);
    server.use(http.post('/api/v1/workflows/check', () => delay('infinite')));
    await user.click(await outputButton(user, 'run', 'time_ms'));
    await user.click(
      within(await openMenu('The output time_ms of run')).getByRole('menuitem', {
        name: 'Name it as an output',
      }),
    );
    await user.click(barButton('Save'));
    await waitFor(() =>
      expect(outputsOf(backend.state.values)).toHaveProperty('time_ms_2'),
    );

    await user.click(barButton('Publish version'));
    const dialog = await findDialog('Publish v1');
    expect(dialog).toHaveTextContent('The draft is still being checked.');
    expect(within(dialog).getByRole('button', { name: 'Publish v1' })).toBeDisabled();
  });

  it('says in the forge’s words why it made no version', async () => {
    const { user, backend } = openEditor({
      problems: () => [
        {
          path: ['steps', 1, 'use'],
          message: 'unicon/diff-check@v2 is not a primitive Unicon knows.',
        },
      ],
      handlers: [
        // The check passed when it ran; the forge refuses when the version is made.
        http.post('/api/v1/workflows/check', () => HttpResponse.json({ problems: [] })),
      ],
    });

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
    const { user, backend } = openEditor();

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
    const { user, backend } = openEditor({ versions: ['v1', 'beta', 'v9'] });

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
    const { user, backend } = openEditor({ versions: ['v1'] });

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
    const { user, backend } = openEditor();

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
    expect(outputsOf(backend.state.values)).toHaveProperty('time_ms_2');
    expect(backend.state.versions).toEqual(['v1']);
    expect(barButton('Save')).toBeDisabled();
  });

  it('publishes nothing when the save before it meets someone else’s, and says so', async () => {
    const { user, backend } = openEditor();

    await findProblems(/Nothing to fix/);
    await user.click(await outputButton(user, 'run', 'time_ms'));
    await user.click(
      within(await openMenu('The output time_ms of run')).getByRole('menuitem', {
        name: 'Name it as an output',
      }),
    );
    await findProblems(/Nothing to fix/);
    // Someone else saves the draft after the page was read.
    backend.state.token = 'theirs';
    await user.click(barButton('Publish version'));
    const dialog = await findDialog('Publish v1');
    const both = within(dialog).getByRole('button', { name: 'Save and publish v1' });
    // Once the change has been checked.
    await waitFor(() => expect(both).toBeEnabled());
    await user.click(both);

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'The draft was not saved, so nothing was published. The workflow kenny/tuned has changed since you opened it.',
    );
    expect(backend.state.versions).toEqual([]);
  });

  it('shows the draft or a version from the bar’s switcher', async () => {
    const { user, router } = openEditor({
      versions: ['v1', 'v2'],
      handlers: [
        http.get('/api/v1/workflows/kenny/tuned/versions/:version', () =>
          HttpResponse.json(versionOf(CLASSIC)),
        ),
      ],
    });

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

  it('saves nothing over someone else’s save, and reloads the draft they saved', async () => {
    const { user, backend } = openEditor();

    await user.click(await portButton(user, 'run', 'args'));
    await user.click(
      within(await openMenu('The port args of run')).getByRole('menuitem', {
        name: /^time_limit from the inputs/,
      }),
    );
    backend.state.values = theirs();
    backend.state.token = 'someone-else';
    await user.click(barButton('Save'));

    const refused = await screen.findByRole('alert');
    expect(refused).toHaveTextContent(
      'The workflow kenny/tuned has changed since you opened it.',
    );
    expect(refused).toHaveTextContent('Nothing was saved.');
    expect(barButton('Save')).toBeEnabled();
    await user.click(within(refused).getByRole('button', { name: 'Reload the draft' }));

    // Their draft, with nothing of the change left to save or undo.
    await waitFor(() => expect(barButton('Save')).toBeDisabled());
    expect(screen.queryByRole('alert')).toBeNull();
    expect(toolButton('Undo')).toBeDisabled();
    await user.click(await portButton(user, 'run', 'args'));
    await user.click(
      within(await openMenu('The port args of run')).getByRole('menuitem', {
        name: /^time_limit from the inputs/,
      }),
    );
    const saved = await savedValues(user);
    expect(outputsOf(saved).time_ms).toEqual({
      from: '${{ steps.run.time_ms }}',
      unit: 's',
    });
    expect(backend.state.saves.at(-1)?.token).toBe('someone-else');
  });

  it('keeps the unsaved draft when the tab comes back after someone else saved, and meets theirs at the save', async () => {
    fakeLiveStream();
    try {
      const { user, backend } = openEditor();

      await user.click(await portButton(user, 'run', 'args'));
      openStream();
      await user.click(
        within(await openMenu('The port args of run')).getByRole('menuitem', {
          name: /^time_limit from the inputs/,
        }),
      );
      backend.state.values = theirs();
      backend.state.token = 'someone-else';
      await afterAnswers(comeBackToTab);

      const bar = part('[role="toolbar"]', 'The workflow');
      expect(
        within(bar).getByText('Not saved yet: leaving this page loses these changes.'),
      ).toBeInTheDocument();
      expect(barButton('Save')).not.toHaveAttribute('data-loading');

      await user.click(barButton('Save'));
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'The workflow kenny/tuned has changed since you opened it.',
      );
      expect(runOf(backend.state.saves[0]?.values ?? null).args).toBe(
        '${{ inputs.time_limit }}',
      );
      expect(backend.state.saves).toEqual([
        expect.objectContaining({ token: 'token-1' }),
      ]);
    } finally {
      realLiveStream();
    }
  });
});
