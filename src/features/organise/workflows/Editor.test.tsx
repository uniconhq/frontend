import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@/test/user-event';
import { renderApp } from '@/test/render';
import { delay, http } from 'msw';
import { problem, server, signedIn } from '@/test/server';
import { CLASSIC_V2, workflowBackend } from '@/test/workflows';
import {
  EDITOR_PAGE,
  barButton,
  drawer,
  fileText,
  noDrawer,
  findPart,
  openMenu,
  part,
  openStep,
  stepPanel,
  outputButton,
  portButton,
  stepBox,
  toolButton,
} from '@/test/workflow-editor';

/** The forge's check runs 400 ms after the text settles, then answers. */
const CHECKED = { timeout: 3_000 };

describe('the workflow editor', () => {
  it('draws each step, the inputs, each test’s files and the report as boxes', async () => {
    server.use(signedIn, ...workflowBackend(CLASSIC_V2).handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    expect(await stepBox('compile')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Step run' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Step check' })).toBeInTheDocument();
    expect(screen.getAllByRole('group', { name: 'Inputs' }).length).toBeGreaterThan(0);
    expect(
      screen.getAllByRole('group', { name: 'Each test’s files' }).length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole('group', { name: 'Report' })).toBeInTheDocument();
    // The file is out of the editing area, behind View file.
    expect(screen.queryByLabelText('The draft’s file')).toBeNull();
    expect(await fileText(user)).toBe(CLASSIC_V2);
  });

  it('opens the drawer below the bar, so Save and the bar stay in reach', async () => {
    server.use(signedIn, ...workflowBackend(CLASSIC_V2).handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await stepBox('run');
    // jsdom lays nothing out: the bar's frame says where it ends.
    const frame = part('[role="toolbar"]', 'The workflow').parentElement;
    if (frame === null) throw new Error('the bar has a frame');
    frame.getBoundingClientRect = () => new DOMRect(0, 0, 1000, 120);
    await user.click(toolButton('Inputs'));

    expect(drawer('Inputs').style.top).toBe('120px');
  });

  it('opens a box in a drawer, which Escape and its × close', async () => {
    server.use(signedIn, ...workflowBackend(CLASSIC_V2).handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await openStep(user, 'run');
    const open = screen.getByRole('complementary', { name: 'Step run' });
    expect(within(open).getByRole('heading', { name: 'Step run' })).toHaveFocus();
    expect(within(open).getByText('Run program')).toBeInTheDocument();
    expect(
      within(open).getByText('Seconds of CPU time the program may use on each test.', {
        exact: false,
      }),
    ).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(noDrawer()).toBe(true);

    await user.click(toolButton('Report'));
    await user.click(within(drawer('Report')).getByRole('button', { name: 'Close' }));
    expect(noDrawer()).toBe(true);
  });

  it('keeps under Details what the author never acts on', async () => {
    server.use(signedIn, ...workflowBackend(CLASSIC_V2).handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    const panel = await openStep(user, 'run');
    const details = within(panel).getByText('Details').closest('details');
    expect(details).not.toBeNull();
    expect(details).toHaveTextContent('it runs every test in one container');
    expect(details).toHaveTextContent(
      'How it went: Accepted, or the limit the program went over, or a runtime error.',
    );
    expect(
      within(panel).getByRole('list', { name: 'What it gives' }),
    ).not.toHaveTextContent('outcome');
  });

  it('refuses a wire a version would refuse, saying why, in the port’s menu', async () => {
    server.use(signedIn, ...workflowBackend(CLASSIC_V2).handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await user.click(await portButton('compile', 'entry'));
    const menu = await openMenu('The port entry of compile');
    const field = within(menu).getByRole('menuitem', { name: /^input from each test/ });
    expect(field).toBeDisabled();
    expect(field).toHaveTextContent(
      "Only a step that runs for each test can read a test's fields.",
    );
    expect(
      within(menu).getByRole('menuitem', { name: /^submission from the inputs/ }),
    ).toBeDisabled();
  });

  it('wires a port from its menu, keeping the file’s comments', async () => {
    server.use(signedIn, ...workflowBackend(CLASSIC_V2).handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await user.click(await portButton('run', 'args'));
    const menu = await openMenu('The port args of run');
    await user.click(
      within(menu).getByRole('menuitem', { name: /^time_limit from the inputs/ }),
    );

    const text = await fileText(user);
    expect(text).toContain('args: ${{ inputs.time_limit }}');
    expect(text).toContain('# unicon/classic@v2, the built-in workflow');
  });

  it('removes a step and undo brings it back with its wires', async () => {
    server.use(signedIn, ...workflowBackend(CLASSIC_V2).handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    const panel = await openStep(user, 'check');
    await user.click(
      within(panel).getByRole('button', { name: 'Remove the step check' }),
    );
    expect(
      screen.queryByLabelText('Step check', { selector: '[role="group"]' }),
    ).toBeNull();
    expect(noDrawer()).toBe(true);
    await user.click(toolButton('Undo'));

    expect(await fileText(user)).toBe(CLASSIC_V2);
    await user.click(toolButton('Redo'));
    expect(await fileText(user)).not.toContain('id: check');
  });

  it('keeps the problems and their marks in place while the next change is checked', async () => {
    const broken = CLASSIC_V2.replace(
      'binary: ${{ steps.compile.binary }}',
      'binary: ${{ steps.compiler.binary }}',
    );
    server.use(
      signedIn,
      ...workflowBackend(broken, {
        problems: () => [
          {
            path: 'steps[1].with.binary',
            message: 'There is no step called compiler before this one.',
          },
        ],
      }).handlers,
    );
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    const banner = await findPart('section', 'Problems', CHECKED);
    await within(banner).findByText(/One problem to fix/, {}, CHECKED);
    // The next check does not answer while the test looks.
    server.use(http.post('/api/v1/workflows/check', () => delay('infinite')));
    await user.click(await outputButton('run', 'time_ms'));
    await user.click(
      within(await openMenu('The output time_ms of run')).getByRole('menuitem', {
        name: 'Report it',
      }),
    );

    expect(
      await within(part('section', 'Problems')).findByText(
        'Checking the latest change…',
        {},
        CHECKED,
      ),
    ).toBeInTheDocument();
    expect(part('section', 'Problems')).toHaveTextContent(/One problem to fix/);
    expect(
      within(await stepBox('run')).getByRole('note', {
        name: 'There is no step called compiler before this one.',
      }),
    ).toBeInTheDocument();
  });

  it('says each problem beside its mark and in the banner, which opens its box', async () => {
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
                  message: 'There is no step called compiler before this one.',
                },
                { path: 'test', message: 'A workflow has at least one test field.' },
              ]
            : [],
      }).handlers,
    );
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    const step = await stepBox('run');
    expect(
      await within(step).findByRole(
        'note',
        { name: 'There is no step called compiler before this one.' },
        CHECKED,
      ),
    ).toBeInTheDocument();
    // The message stands beside its mark, not only behind it.
    expect(
      within(step).getByText('There is no step called compiler before this one.', {
        selector: 'span[aria-hidden]',
      }),
    ).toBeVisible();
    const banner = screen.getByLabelText('Problems', { selector: 'section' });
    expect(banner).toHaveTextContent(
      '2 problems to fix before publishing a version. You can still save the draft with them.',
    );
    expect(banner).toHaveTextContent(
      'Each test’s files: A workflow has at least one test field.',
    );
    await user.click(within(banner).getByRole('button', { name: 'Step run, binary' }));
    expect(drawer('Step run')).toHaveTextContent(
      'There is no step called compiler before this one.',
    );
  });

  it('adds a step from Add step, asking in its drawer how often it runs', async () => {
    server.use(signedIn, ...workflowBackend(CLASSIC_V2).handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await stepBox('run');
    await user.click(toolButton('Add step'));
    const menu = await openMenu('Add step');
    // Each primitive once, by its title, what it does and its reference.
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(3);
    await user.click(within(menu).getByRole('menuitem', { name: /^Compile/ }));

    expect(await stepBox('compile-2')).toBeInTheDocument();
    const added = drawer('Step compile-2');
    expect(
      within(added).getByRole('radio', { name: 'Once per submission' }),
    ).toBeChecked();
    expect(
      within(added).getByText(/before the tests, such as compiling/),
    ).toBeVisible();
    // The drawer says how the step runs, and that one for each test stands in the band (M55).
    expect(
      within(added).getByRole('radiogroup', { name: 'Run it' }),
    ).toHaveAccessibleDescription('Runs once, for the whole submission.');
    expect(
      within(added).getByRole('radio', { name: 'Once for each test' }),
    ).toHaveAccessibleDescription(
      /It stands in the shaded band on the graph, “Runs once for each test”\.$/,
    );
    await user.click(within(added).getByRole('radio', { name: 'Once for each test' }));

    expect(
      within(drawer('Step compile-2')).getByRole('radio', {
        name: 'Once for each test',
      }),
    ).toBeChecked();
    expect(
      within(drawer('Step compile-2')).getByRole('radiogroup', { name: 'Run it' }),
    ).toHaveAccessibleDescription(
      'Runs once for each test, so it stands in the shaded band on the graph.',
    );
    expect(await fileText(user)).toContain(
      '- id: compile-2\n    use: unicon/compile@v2\n    per_test: true',
    );
  });

  it('adds a step of a primitive that takes a batch to run for each test', async () => {
    server.use(signedIn, ...workflowBackend(CLASSIC_V2).handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await stepBox('run');
    await user.click(toolButton('Add step'));
    await user.click(
      within(await openMenu('Add step')).getByRole('menuitem', {
        name: /^Compare with the answer/,
      }),
    );

    expect(await stepBox('diff-check')).toBeInTheDocument();
    expect(await fileText(user)).toContain(
      '- id: diff-check\n    use: unicon/diff-check@v2\n    per_test: true',
    );
  });

  it('declares an input in place', async () => {
    server.use(signedIn, ...workflowBackend(CLASSIC_V2).handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await stepBox('run');
    await user.click(toolButton('Inputs'));
    const inputs = within(drawer('Inputs')).getByRole('form', { name: 'Add an input' });
    await user.type(
      within(inputs).getByRole('textbox', { name: 'New input' }),
      'episodes',
    );
    await user.selectOptions(
      within(inputs).getByRole('combobox', { name: 'Of type' }),
      'number',
    );
    await user.click(within(inputs).getByRole('button', { name: 'Add an input' }));

    expect(await fileText(user)).toContain('episodes: number');
  });

  it('declares a value of each test in place', async () => {
    server.use(signedIn, ...workflowBackend(CLASSIC_V2).handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await stepBox('run');
    await user.click(toolButton('Each test’s files'));
    const fields = within(drawer('Each test’s files')).getByRole('form', {
      name: 'Add to each test',
    });
    await user.type(
      within(fields).getByRole('textbox', { name: 'New file or value' }),
      'seed',
    );
    await user.selectOptions(
      within(fields).getByRole('combobox', { name: 'Of type' }),
      'text',
    );
    await user.click(within(fields).getByRole('button', { name: 'Add to each test' }));

    expect(await fileText(user)).toContain('seed: text');
  });

  it('declares a report entry in place', async () => {
    server.use(signedIn, ...workflowBackend(CLASSIC_V2).handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await user.click(await outputButton('run', 'time_ms'));
    await user.click(
      within(await openMenu('The output time_ms of run')).getByRole('menuitem', {
        name: 'Report it',
      }),
    );

    expect(await fileText(user)).toContain('time_ms_2: ${{ steps.run.time_ms }}');
  });

  it('names an input for the task’s form: its title, unit and help', async () => {
    server.use(signedIn, ...workflowBackend(CLASSIC_V2).handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await stepBox('run');
    await user.click(toolButton('Inputs'));
    const row = within(drawer('Inputs')).getByLabelText('The input memory_limit', {
      selector: 'li',
    });
    await user.type(
      within(row).getByRole('textbox', { name: 'Title on the task’s form' }),
      'Memory limit{Enter}',
    );
    await user.type(within(row).getByRole('textbox', { name: 'Unit' }), 'MB{Enter}');
    await user.type(
      within(row).getByRole('textbox', { name: 'Help on the task’s form' }),
      'The memory the program may use on each test.{Enter}',
    );

    expect(await fileText(user)).toContain(
      'memory_limit: {type: number, title: Memory limit, unit: MB, help: The memory the program may use on each test.}',
    );
  });

  it('offers a unit only for a number, and drops it when the type changes away (M54)', async () => {
    server.use(
      signedIn,
      ...workflowBackend(
        CLASSIC_V2.replace(
          '  memory_limit: number\n',
          '  memory_limit: number\n  episodes: {type: number, unit: runs}\n',
        ),
      ).handlers,
    );
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await stepBox('run');
    await user.click(toolButton('Inputs'));
    const row = (id: string) =>
      within(drawer('Inputs')).getByLabelText(`The input ${id}`, { selector: 'li' });
    expect(
      within(row('submission')).queryByRole('textbox', { name: 'Unit' }),
    ).toBeNull();
    expect(within(row('language')).queryByRole('textbox', { name: 'Unit' })).toBeNull();
    expect(within(row('episodes')).getByRole('textbox', { name: 'Unit' })).toHaveValue(
      'runs',
    );

    await user.selectOptions(
      within(row('episodes')).getByRole('combobox', { name: 'Type' }),
      'file',
    );
    await waitFor(() =>
      expect(
        within(row('episodes')).queryByRole('textbox', { name: 'Unit' }),
      ).toBeNull(),
    );
    const text = await fileText(user);
    expect(text).toContain('episodes: file');
    expect(text).not.toContain('unit: runs');
  });

  it('shows a unit a file left on another type, to clear it', async () => {
    server.use(
      signedIn,
      ...workflowBackend(
        CLASSIC_V2.replace(
          '  memory_limit: number\n',
          '  memory_limit: number\n  data: {type: file, unit: MB}\n',
        ),
      ).handlers,
    );
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await stepBox('run');
    await user.click(toolButton('Inputs'));
    const row = within(drawer('Inputs')).getByLabelText('The input data', {
      selector: 'li',
    });
    const unit = within(row).getByRole('textbox', { name: 'Unit' });
    expect(unit).toHaveAccessibleDescription(
      'Only a number takes a unit, so clear this one.',
    );
    await user.clear(unit);
    await user.type(unit, '{Enter}');
    expect(await fileText(user)).toContain('data: file');
  });

  it('gives a port text with a test’s value written in', async () => {
    server.use(
      signedIn,
      ...workflowBackend(
        CLASSIC_V2.replace('  answer: file\n', '  answer: file\n  episodes: number\n'),
      ).handlers,
    );
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    const panel = await openStep(user, 'run');
    await user.type(
      within(panel).getByRole('textbox', { name: /^args/ }),
      '--episodes ',
    );
    await user.click(
      within(panel).getByRole('button', { name: 'Write a value into args' }),
    );
    await user.click(
      within(await openMenu('Write a value into args')).getByRole('menuitem', {
        name: 'episodes from each test',
      }),
    );

    expect(await fileText(user)).toMatch(
      /args: "?--episodes \$\{\{ test\.episodes \}\}"?\n/,
    );
  });

  it('wires a port given a whole reference in its field', async () => {
    server.use(signedIn, ...workflowBackend(CLASSIC_V2).handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    const panel = await openStep(user, 'compile');
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
    expect(await fileText(user)).toContain('entry: ${{ inputs.language }}');
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

    await stepBox('run');
    await user.click(toolButton('Report'));
    const entry = within(drawer('Report')).getByLabelText('The report entry time_ms', {
      selector: 'li',
    });
    const better = within(entry).getByRole('combobox', { name: 'Better is' });

    expect(
      within(better).getByRole('option', { name: 'As the task’s goal says' }),
    ).toBeInTheDocument();
    expect(
      within(better).queryByRole('option', { name: 'As the task’s maybe says' }),
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

    const panel = await openStep(user, 'first');
    await user.click(within(panel).getByRole('radio', { name: 'Once for each test' }));

    const kept = stepPanel('first');
    expect(
      within(kept).getByRole('radio', { name: 'Once for each test' }),
    ).toBeChecked();
    expect(await fileText(user)).toMatch(/id: second[\s\S]*id: first/);
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
    expect(screen.queryByText(/Nothing to fix/)).not.toBeInTheDocument();
  });

  it('refuses in the drawer a declaration a wire would refuse, saying why', async () => {
    server.use(signedIn, ...workflowBackend(CLASSIC_V2).handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await stepBox('run');
    await user.click(toolButton('Inputs'));
    const row = within(drawer('Inputs')).getByLabelText('The input time_limit', {
      selector: 'li',
    });
    await user.click(
      within(row).getByRole('checkbox', { name: 'The entrant gives it' }),
    );

    expect(within(row).getByRole('alert')).toHaveTextContent(
      'run.time_limit: This value raises a limit, so the task must give it, not the entrant.',
    );
    expect(await fileText(user)).toBe(CLASSIC_V2);
  });

  it('shows a wire the layout cannot draw on its port', async () => {
    const backwards = CLASSIC_V2.replace(
      'language: ${{ inputs.language }}',
      ['language: ${{ inputs.language }}', '      entry: ${{ test.input }}'].join('\n'),
    );
    server.use(signedIn, ...workflowBackend(backwards).handlers);
    renderApp(EDITOR_PAGE);

    const step = await stepBox('compile');
    expect(
      within(step).getByText(/input from each test, not drawn/),
    ).toBeInTheDocument();
  });

  it('fixes a draft that cannot be read as text, with Save and Undo', async () => {
    const backend = workflowBackend('steps: [\n');
    server.use(signedIn, ...backend.handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    const mend = await screen.findByLabelText('Fix the draft', {
      selector: 'section',
    });
    expect(mend).toHaveTextContent(
      'This draft cannot be drawn, because its file cannot be read',
    );
    // Not "nothing to fix", whatever the check says of a file that cannot be read.
    await waitFor(() => expect(backend.state.checks).toBeGreaterThan(0), CHECKED);
    expect(screen.queryByText(/Nothing to fix/)).toBeNull();
    expect(toolButton('Add step')).toBeDisabled();
    const back = within(mend).getByRole('button', { name: 'Back to the graph' });
    expect(back).toBeDisabled();
    const field = within(mend).getByRole('textbox', { name: 'The draft’s file' });
    await user.clear(field);
    await user.paste('test: {input: file}\nsteps: []\n');
    expect(back).toBeEnabled();
    expect(mend).toHaveTextContent('The file can be read again');

    await user.click(barButton('Save'));
    await waitFor(() =>
      expect(backend.state.draft).toBe('test: {input: file}\nsteps: []\n'),
    );
    // A run of typing is one step back.
    await user.click(toolButton('Undo'));
    expect(field).toHaveValue('steps: [\n');
    expect(back).toBeDisabled();
    await user.click(toolButton('Redo'));
    await user.click(back);
    expect(
      screen.queryByLabelText('Fix the draft', { selector: 'section' }),
    ).toBeNull();
    expect(toolButton('Add step')).toBeEnabled();
  });

  it('asks before leaving a draft with changes not saved', async () => {
    server.use(signedIn, ...workflowBackend(CLASSIC_V2).handlers);
    const user = userEvent.setup();
    const { router } = renderApp(EDITOR_PAGE);

    const panel = await openStep(user, 'check');
    await user.click(
      within(panel).getByRole('button', { name: 'Remove the step check' }),
    );
    await user.click(screen.getByRole('link', { name: 'All workflows' }));
    const asking = await screen.findByRole('dialog', { name: 'Leave without saving?' });
    await user.click(within(asking).getByRole('button', { name: 'Stay' }));
    expect(router.state.location.pathname).toBe(EDITOR_PAGE);

    await user.click(screen.getByRole('link', { name: 'All workflows' }));
    await user.click(
      await screen.findByRole('button', { name: 'Leave without saving' }),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe('/workflows'));
  });
});
