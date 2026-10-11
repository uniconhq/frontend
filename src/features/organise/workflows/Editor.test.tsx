import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@/test/user-event';
import { renderApp } from '@/test/render';
import { http } from 'msw';
import { problem, server, signedIn } from '@/test/server';
import { CLASSIC_V2, workflowBackend } from '@/test/workflows';
import { EDITOR_PAGE, preview, previewNow } from '@/test/workflow-editor';

/** The forge's check runs 400 ms after the text settles, then answers. */
const CHECKED = { timeout: 3_000 };

describe('the workflow editor', () => {
  it('draws each step, the inputs, the test fields and the report as boxes', async () => {
    server.use(signedIn, ...workflowBackend(CLASSIC_V2).handlers);
    renderApp(EDITOR_PAGE);

    expect(
      await screen.findByRole('group', { name: 'Step compile' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Step run' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Step check' })).toBeInTheDocument();
    expect(screen.getAllByRole('group', { name: 'Inputs' }).length).toBeGreaterThan(0);
    expect(
      screen.getAllByRole('group', { name: "Each test's files" }).length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole('group', { name: 'Report' })).toBeInTheDocument();
    expect(await preview()).toBe(CLASSIC_V2);
  });

  it('refuses a wire a version would refuse, saying why, in the port’s menu', async () => {
    server.use(signedIn, ...workflowBackend(CLASSIC_V2).handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await user.click(
      await screen.findByRole('button', { name: 'The port entry of compile' }),
    );
    const menu = await screen.findByRole('menu', { name: 'The port entry of compile' });
    const field = within(menu).getByRole('menuitem', { name: /^test\.input/ });
    expect(field).toBeDisabled();
    expect(field).toHaveTextContent(
      "Only a step that runs for each test can read a test's fields.",
    );
    expect(
      within(menu).getByRole('menuitem', { name: /^inputs\.submission/ }),
    ).toBeDisabled();
  });

  it('wires a port from its menu and the preview shows it at once', async () => {
    server.use(signedIn, ...workflowBackend(CLASSIC_V2).handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

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
    renderApp(EDITOR_PAGE);

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
    renderApp(EDITOR_PAGE);

    const step = await screen.findByRole('group', { name: 'Step run' });
    expect(
      await within(step).findByRole(
        'note',
        { name: 'compiler is not a step before this one.' },
        CHECKED,
      ),
    ).toBeInTheDocument();
    // The message stands beside its mark, not only behind it.
    expect(
      within(step).getByText('compiler is not a step before this one.', {
        selector: 'span[aria-hidden]',
      }),
    ).toBeVisible();
    expect(
      screen.getByText(/One problem a version would be refused for/),
    ).toBeInTheDocument();
  });

  it('adds a step from the palette, named for its primitive', async () => {
    server.use(signedIn, ...workflowBackend(CLASSIC_V2).handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

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
    renderApp(EDITOR_PAGE);

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
    renderApp(EDITOR_PAGE);

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
    renderApp(EDITOR_PAGE);

    const step = await screen.findByRole('group', { name: 'Step compile' });
    await user.click(within(step).getByRole('button', { name: /^compile/ }));
    const panel = await screen.findByRole('region', { name: 'The step compile' });
    const entry = within(panel).getByRole('textbox', { name: /^entry/ });
    await user.click(entry);
    await user.paste('${{ inputs.submission }}');
    await user.keyboard('{Enter}');

    expect(
      await within(panel).findByText(/This takes text, not a file\./),
    ).toBeInTheDocument();
    await user.clear(entry);
    await user.paste('main ${{ inputs }}');
    await user.keyboard('{Enter}');
    expect(
      await within(panel).findByText(
        'Unicon cannot read ${{ inputs }}. Write ${{ inputs.<id> }}, ${{ test.<field> }} or ${{ steps.<id>.<output> }}.',
      ),
    ).toBeInTheDocument();
    await user.clear(entry);
    await user.paste('${{ inputs.language }}');
    await user.keyboard('{Enter}');
    await waitFor(() =>
      expect(previewNow()).toContain('entry: ${{ inputs.language }}'),
    );
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
    renderApp(EDITOR_PAGE);

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

  it('keeps a step chosen when an edit moves it in the list', async () => {
    const two = [
      'steps:',
      '  - {id: first, use: unicon/compile@v2}',
      '  - {id: second, use: unicon/compile@v2}',
      '',
    ].join('\n');
    server.use(signedIn, ...workflowBackend(two).handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    const step = await screen.findByRole('group', { name: 'Step first' });
    await user.click(within(step).getByRole('button', { name: /^first/ }));
    const panel = await screen.findByRole('region', { name: 'The step first' });
    await user.click(
      within(panel).getByRole('checkbox', { name: 'Runs once per test' }),
    );

    await waitFor(() => expect(previewNow()).toMatch(/id: second[\s\S]*id: first/));
    expect(screen.getByRole('region', { name: 'The step first' })).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'The step first' })).getByRole(
        'checkbox',
        {
          name: 'Runs once per test',
        },
      ),
    ).toBeChecked();
  });

  it('says the check did not run rather than that it passed', async () => {
    server.use(
      http.post('/api/v1/workflows/check', () => problem(503, 'forge_unavailable')),
      signedIn,
      ...workflowBackend(CLASSIC_V2).handlers,
    );
    renderApp(EDITOR_PAGE);

    expect(
      await screen.findByText(/The check did not run/, {}, CHECKED),
    ).toBeInTheDocument();
    expect(screen.queryByText(/passes every check/)).not.toBeInTheDocument();
  });

  it('refuses on a panel a declaration a wire would refuse, saying why', async () => {
    server.use(signedIn, ...workflowBackend(CLASSIC_V2).handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await user.click(await screen.findByRole('button', { name: 'Inputs' }));
    const row = await screen.findByRole('listitem', { name: 'The input time_limit' });
    await user.click(
      within(row).getByRole('checkbox', { name: 'The contestant gives it' }),
    );

    expect(within(row).getByRole('alert')).toHaveTextContent(
      'run.time_limit: This value raises a limit, so the task must give it, not the entrant.',
    );
    expect(previewNow()).toBe(CLASSIC_V2);
  });

  it('shows a wire the layout cannot draw on its port', async () => {
    const backwards = CLASSIC_V2.replace(
      'language: ${{ inputs.language }}',
      ['language: ${{ inputs.language }}', '      entry: ${{ test.input }}'].join('\n'),
    );
    server.use(signedIn, ...workflowBackend(backwards).handlers);
    renderApp(EDITOR_PAGE);

    const step = await screen.findByRole('group', { name: 'Step compile' });
    expect(
      within(step).getByText(/input from each test, not drawn/),
    ).toBeInTheDocument();
  });
});
