import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '@/test/render';
import { http } from 'msw';
import { problem, server, signedIn } from '@/test/server';
import { CLASSIC_V2, workflowBackend } from '@/test/workflows';

const PAGE = '/workflows/kenny/tuned';
const PREVIEW = 'workflow.yaml as a save writes it';

async function preview(): Promise<string> {
  return (await screen.findByLabelText<HTMLTextAreaElement>(PREVIEW)).value;
}

function previewNow(): string {
  return screen.getByLabelText<HTMLTextAreaElement>(PREVIEW).value;
}

describe('the workflow editor', () => {
  it('draws each step, the inputs, the test fields and the report as boxes', async () => {
    server.use(signedIn, ...workflowBackend(CLASSIC_V2).handlers);
    renderApp(PAGE);

    expect(
      await screen.findByRole('group', { name: 'Step compile' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Step run' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Step check' })).toBeInTheDocument();
    expect(screen.getAllByRole('group', { name: 'Inputs' }).length).toBeGreaterThan(0);
    expect(
      screen.getAllByRole('group', { name: 'Test fields' }).length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole('group', { name: 'Report' })).toBeInTheDocument();
    expect(await preview()).toBe(CLASSIC_V2);
  });

  it('refuses a wire a version would refuse, saying why, in the port’s menu', async () => {
    server.use(signedIn, ...workflowBackend(CLASSIC_V2).handlers);
    const user = userEvent.setup();
    renderApp(PAGE);

    await user.click(
      await screen.findByRole('button', { name: 'The port entry of compile' }),
    );
    const menu = await screen.findByRole('menu', { name: 'The port entry of compile' });
    const field = within(menu).getByRole('menuitem', { name: /^test\.input/ });
    expect(field).toBeDisabled();
    expect(field).toHaveTextContent(
      'test.<field> is there only in a step that runs per test.',
    );
    expect(
      within(menu).getByRole('menuitem', { name: /^inputs\.submission/ }),
    ).toBeDisabled();
  });

  it('wires a port from its menu and the preview shows it at once', async () => {
    server.use(signedIn, ...workflowBackend(CLASSIC_V2).handlers);
    const user = userEvent.setup();
    renderApp(PAGE);

    await user.click(
      await screen.findByRole('button', { name: 'The port args of run' }),
    );
    const menu = await screen.findByRole('menu', { name: 'The port args of run' });
    await user.click(
      within(menu).getByRole('menuitem', { name: /^inputs\.time_limit/ }),
    );

    await waitFor(() =>
      expect(previewNow()).toContain('args: ${{ inputs.time_limit }}'),
    );
    expect(previewNow()).toContain('# unicon/classic@v2, the built-in workflow');
  });

  it('removes a step and undo brings it back with its wires', async () => {
    server.use(signedIn, ...workflowBackend(CLASSIC_V2).handlers);
    const user = userEvent.setup();
    renderApp(PAGE);

    const step = await screen.findByRole('group', { name: 'Step check' });
    await user.click(within(step).getByRole('button', { name: /^check/ }));
    await user.click(
      await screen.findByRole('button', { name: 'Remove the step check' }),
    );
    await waitFor(() => expect(previewNow()).not.toContain('id: check'));
    await user.click(screen.getByRole('button', { name: 'Undo' }));

    expect(previewNow()).toBe(CLASSIC_V2);
    await user.click(screen.getByRole('button', { name: 'Redo' }));
    expect(previewNow()).not.toContain('id: check');
  });

  it('pins a problem to the port its path names', async () => {
    const broken = CLASSIC_V2.replace(
      'binary: ${{ steps.compile.binary }}',
      'binary: ${{ steps.compiler.binary }}',
    );
    server.use(
      signedIn,
      ...workflowBackend(broken, {
        problems: (content) =>
          content.includes('steps.compiler')
            ? [
                {
                  path: 'steps[1].with.binary',
                  message: 'compiler is not a step before this one.',
                },
              ]
            : [],
      }).handlers,
    );
    renderApp(PAGE);

    const step = await screen.findByRole('group', { name: 'Step run' });
    expect(
      await within(step).findByRole('note', {
        name: 'compiler is not a step before this one.',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/One problem a version would be refused for/),
    ).toBeInTheDocument();
  });

  it('saves a draft with a problem and refuses a version of it', async () => {
    const backend = workflowBackend(CLASSIC_V2, {
      problems: (content) =>
        content.includes('memory_limit: 9')
          ? [{ path: 'steps[1].with.memory_limit', message: 'Takes number, not text.' }]
          : [],
    });
    server.use(signedIn, ...backend.handlers);
    const user = userEvent.setup();
    renderApp(PAGE);

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
    renderApp(PAGE);

    await user.click(await screen.findByRole('button', { name: 'Make the version' }));

    expect(await screen.findByRole('status', { name: '' })).toHaveTextContent(
      'kenny/tuned@v1 is made.',
    );
    expect(backend.state.versions).toEqual(['v1']);
  });

  it('opens the merge view on a save over someone else’s, matching steps by id', async () => {
    const backend = workflowBackend(CLASSIC_V2);
    server.use(signedIn, ...backend.handlers);
    const user = userEvent.setup();
    renderApp(PAGE);

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

  it('adds a step from the palette, named for its primitive', async () => {
    server.use(signedIn, ...workflowBackend(CLASSIC_V2).handlers);
    const user = userEvent.setup();
    renderApp(PAGE);

    await user.click(
      await screen.findByRole('button', {
        name: 'Add unicon/diff-check@v2, run per test',
      }),
    );

    expect(
      await screen.findByRole('group', { name: 'Step diff-check' }),
    ).toBeInTheDocument();
    expect(previewNow()).toContain(
      '- id: diff-check\n    use: unicon/diff-check@v2\n    per_test: true',
    );
  });

  it('declares an input, a test field and a report entry in place', async () => {
    server.use(signedIn, ...workflowBackend(CLASSIC_V2).handlers);
    const user = userEvent.setup();
    renderApp(PAGE);

    await user.click(await screen.findByRole('button', { name: 'Inputs' }));
    const inputs = await screen.findByRole('form', { name: 'Add an input' });
    await user.type(
      within(inputs).getByRole('textbox', { name: 'New input' }),
      'episodes',
    );
    await user.selectOptions(
      within(inputs).getByRole('combobox', { name: 'Of type' }),
      'number',
    );
    await user.click(within(inputs).getByRole('button', { name: 'Add an input' }));
    await waitFor(() => expect(previewNow()).toContain('episodes: number'));

    await user.click(screen.getByRole('button', { name: 'Test fields' }));
    const fields = await screen.findByRole('form', { name: 'Add a test field' });
    await user.type(
      within(fields).getByRole('textbox', { name: 'New test field' }),
      'seed',
    );
    await user.selectOptions(
      within(fields).getByRole('combobox', { name: 'Of type' }),
      'text',
    );
    await user.click(within(fields).getByRole('button', { name: 'Add a test field' }));
    await waitFor(() => expect(previewNow()).toContain('seed: text'));

    await user.click(screen.getByRole('button', { name: 'The output run.time_ms' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Report it' }));
    await waitFor(() =>
      expect(previewNow()).toContain('time_ms_2: ${{ steps.run.time_ms }}'),
    );
  });

  it('gives a port text with a test field written in', async () => {
    server.use(
      signedIn,
      ...workflowBackend(
        CLASSIC_V2.replace('  answer: file\n', '  answer: file\n  episodes: number\n'),
      ).handlers,
    );
    const user = userEvent.setup();
    renderApp(PAGE);

    const step = await screen.findByRole('group', { name: 'Step run' });
    await user.click(within(step).getByRole('button', { name: /^run/ }));
    const panel = await screen.findByRole('region', { name: 'The step run' });
    await user.type(
      within(panel).getByRole('textbox', { name: /^args/ }),
      '--episodes ',
    );
    await user.click(
      within(panel).getByRole('button', { name: 'Write a value into args' }),
    );
    await user.click(await screen.findByRole('menuitem', { name: 'test.episodes' }));

    await waitFor(() =>
      expect(previewNow()).toMatch(/args: "?--episodes \$\{\{ test\.episodes \}\}"?\n/),
    );
  });

  it('wires a port given a whole reference in its field', async () => {
    server.use(signedIn, ...workflowBackend(CLASSIC_V2).handlers);
    const user = userEvent.setup();
    renderApp(PAGE);

    const step = await screen.findByRole('group', { name: 'Step compile' });
    await user.click(within(step).getByRole('button', { name: /^compile/ }));
    const panel = await screen.findByRole('region', { name: 'The step compile' });
    const entry = within(panel).getByRole('textbox', { name: /^entry/ });
    await user.click(entry);
    await user.paste('${{ inputs.submission }}');
    await user.keyboard('{Enter}');

    expect(
      await within(panel).findByText(/Takes text, not file\./),
    ).toBeInTheDocument();
    await user.clear(entry);
    await user.paste('main ${{ inputs }}');
    await user.keyboard('{Enter}');
    expect(
      await within(panel).findByText(
        '${{ inputs }} is not a reference a workflow makes: inputs.<id>, test.<field> or steps.<id>.<output>.',
      ),
    ).toBeInTheDocument();
    await user.clear(entry);
    await user.paste('${{ inputs.language }}');
    await user.keyboard('{Enter}');
    await waitFor(() =>
      expect(previewNow()).toContain('entry: ${{ inputs.language }}'),
    );
  });

  it('takes the current file in the merge view as one step undo goes back over', async () => {
    const backend = workflowBackend(CLASSIC_V2);
    server.use(signedIn, ...backend.handlers);
    const user = userEvent.setup();
    renderApp(PAGE);

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

  it('builds three wired steps from the palette by keyboard alone', async () => {
    const empty = [
      'inputs:',
      '  submission: {type: folder, contestant: true}',
      '  time_limit: number',
      '  memory_limit: number',
      'test:',
      '  input: file',
      '  answer: file',
      'steps: []',
      '',
    ].join('\n');
    server.use(signedIn, ...workflowBackend(empty).handlers);
    const user = userEvent.setup();
    renderApp(PAGE);

    // Every control is reached by Tab and every menu item by the arrow keys.
    const tabTo = async (target: HTMLElement) => {
      for (let step = 0; step < 400 && document.activeElement !== target; step += 1)
        await user.tab();
      expect(target).toHaveFocus();
    };
    const press = async (target: HTMLElement) => {
      await tabTo(target);
      await user.keyboard('{Enter}');
    };
    const wireFrom = async (port: string, step: string, source: RegExp) => {
      await press(
        await screen.findByRole('button', { name: `The port ${port} of ${step}` }),
      );
      const menu = await screen.findByRole('menu', {
        name: `The port ${port} of ${step}`,
      });
      const item = within(menu).getByRole('menuitem', { name: source });
      for (let move = 0; move < 40 && document.activeElement !== item; move += 1)
        await user.keyboard('{ArrowDown}');
      expect(item).toHaveFocus();
      await user.keyboard('{Enter}');
    };
    await press(
      await screen.findByRole('button', { name: 'Add unicon/compile@v2, run once' }),
    );
    await press(screen.getByRole('button', { name: 'Primitives' }));
    await press(
      await screen.findByRole('button', {
        name: 'Add unicon/sandbox-run@v2, run per test',
      }),
    );
    await press(screen.getByRole('button', { name: 'Primitives' }));
    await press(
      await screen.findByRole('button', {
        name: 'Add unicon/diff-check@v2, run per test',
      }),
    );
    await wireFrom('source', 'compile', /^inputs\.submission/);
    await wireFrom('binary', 'sandbox-run', /^compile\.binary/);
    await wireFrom('input', 'sandbox-run', /^test\.input/);
    await wireFrom('time_limit', 'sandbox-run', /^inputs\.time_limit/);
    await wireFrom('memory_limit', 'sandbox-run', /^inputs\.memory_limit/);
    await wireFrom('actual', 'diff-check', /^sandbox-run\.output/);
    await wireFrom('expected', 'diff-check', /^test\.answer/);

    const text = previewNow();
    for (const wire of [
      'source: ${{ inputs.submission }}',
      'binary: ${{ steps.compile.binary }}',
      'input: ${{ test.input }}',
      'time_limit: ${{ inputs.time_limit }}',
      'memory_limit: ${{ inputs.memory_limit }}',
      'actual: ${{ steps.sandbox-run.output }}',
      'expected: ${{ test.answer }}',
    ])
      expect(text).toContain(wire);
    expect(text.match(/per_test: true/g)).toHaveLength(2);
  });

  it('offers for which way is better only an enum input the task gives whole', async () => {
    server.use(
      signedIn,
      ...workflowBackend(
        CLASSIC_V2.replace(
          '  time_limit: number\n',
          '  time_limit: number\n  goal: {type: enum, options: [higher, lower]}\n  maybe: {type: enum, options: [higher, lower], optional: true}\n',
        ),
      ).handlers,
    );
    const user = userEvent.setup();
    renderApp(PAGE);

    await user.click(await screen.findByRole('button', { name: 'Report' }));
    const entry = await screen.findByRole('listitem', {
      name: 'The report entry time_ms',
    });
    const better = within(entry).getByRole('combobox', { name: 'Better is' });

    expect(
      within(better).getByRole('option', { name: "as the task's goal says" }),
    ).toBeInTheDocument();
    expect(
      within(better).queryByRole('option', { name: "as the task's maybe says" }),
    ).not.toBeInTheDocument();
  });

  it('says the check did not run rather than that it passed', async () => {
    server.use(
      http.post('/api/v1/workflows/check', () => problem(503, 'forge_unavailable')),
      signedIn,
      ...workflowBackend(CLASSIC_V2).handlers,
    );
    renderApp(PAGE);

    expect(await screen.findByText(/The check did not run/)).toBeInTheDocument();
    expect(screen.queryByText(/passes every check/)).not.toBeInTheDocument();
  });

  it('refuses on a panel a declaration a wire would refuse, saying why', async () => {
    server.use(signedIn, ...workflowBackend(CLASSIC_V2).handlers);
    const user = userEvent.setup();
    renderApp(PAGE);

    await user.click(await screen.findByRole('button', { name: 'Inputs' }));
    const row = await screen.findByRole('listitem', { name: 'The input time_limit' });
    await user.click(
      within(row).getByRole('checkbox', { name: 'The contestant gives it' }),
    );

    expect(within(row).getByRole('alert')).toHaveTextContent(
      'run.time_limit: This port raises a limit, so the task must give it, not the contestant.',
    );
    expect(previewNow()).toBe(CLASSIC_V2);
  });

  it('shows a wire the layout cannot draw on its port', async () => {
    const backwards = CLASSIC_V2.replace(
      'language: ${{ inputs.language }}',
      ['language: ${{ inputs.language }}', '      entry: ${{ test.input }}'].join('\n'),
    );
    server.use(signedIn, ...workflowBackend(backwards).handlers);
    renderApp(PAGE);

    const step = await screen.findByRole('group', { name: 'Step compile' });
    expect(within(step).getByText('= from test.input, not drawn')).toBeInTheDocument();
  });
});
