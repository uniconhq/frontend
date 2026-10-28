import { beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@/test/user-event';
import { renderApp } from '@/test/render';
import { delay, http, HttpResponse } from 'msw';
import { problem, server, signedIn } from '@/test/server';
import { CLASSIC, PRIMITIVES, WORKFLOW_API, workflowBackend } from '@/test/workflows';
import type { SaveChange, TreeEntry } from '@/api/types';
import {
  EDITOR_PAGE,
  findDialog,
  barButton,
  drawer,
  entryButton,
  fileText,
  noDrawer,
  findPart,
  openInput,
  openMenu,
  openFiles,
  openOutputs,
  part,
  openStep,
  stepPanel,
  outputButton,
  portButton,
  stepBox,
  toolButton,
  trayButton,
} from '@/test/workflow-editor';
import { INPUTS_SHOWN_KEY } from './inputs-shown';
import { DRAFT_FILE } from './words';

// Most tests read the inputs' and files' boxes, which a browser shows once it
// chooses to.
beforeEach(() => {
  localStorage.setItem(INPUTS_SHOWN_KEY, 'shown');
});

describe('the workflow editor', () => {
  it('opens an empty draft with its tray and the no-steps problem', async () => {
    const message = 'A workflow needs at least one step. Add one from the tray.';
    server.use(
      signedIn,
      ...workflowBackend('steps: []\n', {
        problems: () => [{ path: 'steps', message }],
      }).handlers,
    );
    renderApp(EDITOR_PAGE);
    expect(await screen.findByText(message, { exact: false })).toBeVisible();
    // The banner says it once, with nothing beside it to say it again.
    expect(screen.queryByText(/make a version/)).toBeNull();
    expect(screen.queryByRole('group', { name: /^Step / })).toBeNull();
    expect(trayButton('Primitives', 'Compile')).toBeVisible();
  });

  it('draws each step, the inputs and the outputs as boxes', async () => {
    server.use(signedIn, ...workflowBackend(CLASSIC).handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    expect(await stepBox('compile')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Step run' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Step check' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Input submission' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Outputs' })).toBeInTheDocument();
    // The file is out of the editing area, behind View YAML.
    expect(screen.queryByLabelText(DRAFT_FILE)).toBeNull();
    expect(await fileText(user)).toBe(CLASSIC);
  });

  it('opens the drawer below the bar, so Save and the bar stay in reach', async () => {
    server.use(signedIn, ...workflowBackend(CLASSIC).handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await stepBox('run');
    // jsdom lays nothing out: the bar's frame says where it ends.
    const frame = part('[role="toolbar"]', 'The workflow').parentElement;
    if (frame === null) throw new Error('the bar has a frame');
    frame.getBoundingClientRect = () => new DOMRect(0, 0, 1000, 120);
    await openInput(user, 'submission');

    expect(drawer('Inputs').style.top).toBe('120px');
  });

  it('opens a box in a drawer, which Escape and its × close', async () => {
    server.use(signedIn, ...workflowBackend(CLASSIC).handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await openStep(user, 'run');
    const open = screen.getByRole('complementary', { name: 'Step run' });
    expect(within(open).getByRole('heading', { name: 'Step run' })).toHaveFocus();
    expect(within(open).getByText('Run program')).toBeInTheDocument();
    expect(
      within(open).getByText('Seconds of CPU time the program may use.', {
        exact: false,
      }),
    ).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(noDrawer()).toBe(true);

    await openOutputs(user);
    await user.click(within(drawer('Outputs')).getByRole('button', { name: 'Close' }));
    expect(noDrawer()).toBe(true);
  });

  it('keeps under Details what the author never acts on', async () => {
    server.use(signedIn, ...workflowBackend(CLASSIC).handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    const panel = await openStep(user, 'run');
    const details = within(panel).getByText('Details').closest('details');
    expect(details).not.toBeNull();
    expect(details).toHaveTextContent(
      'When a grading has many runs of it, one start serves them all rather than one start each, and each run keeps its own limits.',
    );
    expect(details).not.toHaveTextContent(/container/);
    // Each result in the primitive's own words, one line each (M56).
    const results = within(details as HTMLElement).getByRole('list', {
      name: 'Verdicts it gives',
    });
    expect(
      within(results)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      'Accepted if the program finishes within its limits',
      'Time limit if it runs out of time',
      'Memory limit if it uses more memory than allowed',
      'Output limit if it prints more than allowed',
      'Runtime error if it crashes or exits with an error',
    ]);
    // What the step gets, in seconds and whole units, the limits the task raises
    // said so, and the entrant's program inside it (M56).
    expect(details).toHaveTextContent(
      'What this step gets each time it runs: up to 2 seconds, 256 MB of memory, 128 processes, 64 MB of output; its time grows with the time_limit input and its memory with the memory_limit input. The entrant’s program runs inside it, within the time_limit input and the memory_limit input.',
    );
    expect(details).not.toHaveTextContent(/GPU|ms of/);
    expect(
      within(panel).getByRole('list', { name: 'What it gives' }),
    ).not.toHaveTextContent('outcome');
  });

  it('says a step’s limits are its own where it does not run the entrant’s program (M56)', async () => {
    server.use(signedIn, ...workflowBackend(CLASSIC).handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    const compile = await openStep(user, 'compile');
    expect(within(compile).getByText('Details').closest('details')).toHaveTextContent(
      'What this step gets each time it runs: up to 60 seconds, 1 GB of memory, 128 processes, 64 MB of output. These are the step’s own limits, not the entrant’s program’s.',
    );
  });

  it('says the result a step of two outcomes reports as one sentence, from the primitive’s words (M56)', async () => {
    server.use(signedIn, ...workflowBackend(CLASSIC).handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    const compile = await openStep(user, 'compile');
    expect(within(compile).getByText('Details').closest('details')).toHaveTextContent(
      'Verdict it gives: Accepted if the source compiles, otherwise Compile error.',
    );
  });

  it('refuses a wire a version would refuse, saying why, in the port’s menu', async () => {
    server.use(signedIn, ...workflowBackend(CLASSIC).handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await user.click(await portButton(user, 'compile', 'entry'));
    const menu = await openMenu('The port entry of compile');
    const file = within(menu).getByRole('menuitem', { name: /^input from the inputs/ });
    expect(file).toBeDisabled();
    expect(file).toHaveTextContent('This takes text, not a file.');
    expect(
      within(menu).getByRole('menuitem', { name: /^submission from the inputs/ }),
    ).toBeDisabled();
  });

  it('wires a port from its menu, keeping the file’s comments', async () => {
    server.use(signedIn, ...workflowBackend(CLASSIC).handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await user.click(await portButton(user, 'run', 'args'));
    const menu = await openMenu('The port args of run');
    await user.click(
      within(menu).getByRole('menuitem', { name: /^time_limit from the inputs/ }),
    );

    const text = await fileText(user);
    expect(text).toContain('args: ${{ inputs.time_limit }}');
    expect(text).toContain('# unicon/classic@v3, one run of a task');
  });

  it('removes a step and undo brings it back with its wires', async () => {
    server.use(signedIn, ...workflowBackend(CLASSIC).handlers);
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

    expect(await fileText(user)).toBe(CLASSIC);
    await user.click(toolButton('Redo'));
    expect(await fileText(user)).not.toContain('id: check');
  });

  it('draws a box closed, saying what it needs and gives, and opens it when it is selected', async () => {
    server.use(signedIn, ...workflowBackend(CLASSIC).handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    const run = await stepBox('run');
    expect(run).not.toHaveAttribute('data-open');
    expect(run).toHaveTextContent(
      'needs program, stdin, args, time_limit, memory_limit · gives output, time_ms, memory_kb',
    );
    expect(within(run).queryByRole('button', { name: /^The port / })).toBeNull();

    await openStep(user, 'run');
    const open = await stepBox('run');
    expect(open).toHaveAttribute('data-open');
    expect(open).not.toHaveTextContent('needs program');
    expect(
      within(open).getByRole('button', { name: 'The port args of run' }),
    ).toBeVisible();
    expect(open).toHaveTextContent('args(optional)text · nothing yet');
    expect(await stepBox('compile')).not.toHaveAttribute('data-open');

    await user.click(within(drawer('Step run')).getByRole('button', { name: 'Close' }));
    expect(await stepBox('run')).not.toHaveAttribute('data-open');
  });

  it('keeps the problems and their marks in place while the next change is checked', async () => {
    const broken = CLASSIC.replace(
      'program: ${{ steps.compile.program }}',
      'program: ${{ steps.compiler.program }}',
    );
    server.use(
      signedIn,
      ...workflowBackend(broken, {
        problems: () => [
          {
            path: 'steps[1].with.program',
            message: 'There is no step called compiler before this one.',
          },
        ],
      }).handlers,
    );
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    const banner = await findPart('section', 'Problems');
    await within(banner).findByText(/One problem to fix/);
    // The next check does not answer while the test looks.
    server.use(http.post('/api/v1/workflows/check', () => delay('infinite')));
    await user.click(await outputButton(user, 'run', 'time_ms'));
    await user.click(
      within(await openMenu('The output time_ms of run')).getByRole('menuitem', {
        name: 'Name it as an output',
      }),
    );

    expect(
      await within(part('section', 'Problems')).findByText(
        'Checking the latest change…',
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
    const broken = CLASSIC.replace(
      'program: ${{ steps.compile.program }}',
      'program: ${{ steps.compiler.program }}',
    );
    server.use(
      signedIn,
      ...workflowBackend(broken, {
        problems: (content) =>
          content.includes('steps.compiler')
            ? [
                {
                  path: 'steps[1].with.program',
                  message: 'There is no step called compiler before this one.',
                },
                { path: 'outputs', message: 'A workflow names at least one output.' },
              ]
            : [],
      }).handlers,
    );
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    const step = await stepBox('run');
    expect(
      await within(step).findByRole('note', {
        name: 'There is no step called compiler before this one.',
      }),
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
    expect(banner).toHaveTextContent('Outputs: A workflow names at least one output.');
    await user.click(within(banner).getByRole('button', { name: 'Step run, program' }));
    expect(drawer('Step run')).toHaveTextContent(
      'There is no step called compiler before this one.',
    );
  });

  it('adds a step from the tray and opens its drawer', async () => {
    server.use(signedIn, ...workflowBackend(CLASSIC).handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await stepBox('run');
    // Each primitive once, by its title, what it does and its reference.
    const primitives = part('section', 'Primitives');
    expect(within(primitives).getAllByRole('button')).toHaveLength(3);
    const compile = trayButton('Primitives', 'Compile');
    expect(compile).toHaveTextContent('unicon/compile@v3');
    await user.click(compile);

    expect(await stepBox('compile-2')).toHaveAttribute('data-open', 'true');
    expect(drawer('Step compile-2')).toBeInTheDocument();
    expect(await fileText(user)).toContain(
      '- id: compile-2\n    use: unicon/compile@v3\n',
    );
  });

  it('adds a run workflow from the tray, found by its name, and never this one', async () => {
    const port = (name: string) => ({
      name,
      type: 'file',
      title: null,
      unit: null,
      at_least: null,
      at_most: null,
      better: null,
      optional: false,
      options: null,
    });
    const item = (owner: string, name: string, versions: string[]) => ({
      owner,
      name,
      visibility: owner === 'kenny' ? 'private' : 'public',
      versions,
      editable: owner === 'kenny',
    });
    server.use(
      http.get('/api/v1/workflows', () =>
        HttpResponse.json([
          item('kenny', 'tuned', ['v1']),
          item('kenny', 'inner', ['v1', 'v2']),
          item('alice', 'other', ['v1']),
        ]),
      ),
      http.get('/api/v1/workflows/:owner/:name/versions/:version/box', () =>
        HttpResponse.json({
          inputs: [port('source')],
          outputs: [port('program')],
          newer_version: null,
          run: true,
        }),
      ),
      signedIn,
      ...workflowBackend(CLASSIC).handlers,
    );
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    const workflows = await findPart('section', 'Workflows');
    const inner = await within(workflows).findByRole('button', {
      name: 'kenny/inner@v2',
    });
    expect(inner).toHaveTextContent('needs source · gives program');
    expect(inner).toHaveTextContent('Private · v2');
    expect(within(workflows).getAllByRole('button')).toHaveLength(3);
    expect(
      within(workflows).queryByRole('button', { name: /kenny\/tuned/ }),
    ).toBeNull();
    await user.type(
      within(workflows).getByRole('textbox', { name: 'Find a workflow' }),
      'alice',
    );
    expect(within(workflows).getAllByRole('button')).toHaveLength(1);
    await user.type(
      within(workflows).getByRole('textbox', { name: 'Find a workflow' }),
      'zzz',
    );
    expect(workflows).toHaveTextContent('No workflow matches.');
    await user.clear(
      within(workflows).getByRole('textbox', { name: 'Find a workflow' }),
    );
    await user.type(
      within(workflows).getByRole('textbox', { name: 'Find a workflow' }),
      'alice',
    );
    await user.click(within(workflows).getByRole('button', { name: 'alice/other@v1' }));

    expect(await stepBox('other')).toHaveAttribute('data-open', 'true');
    expect(drawer('Step other')).toBeInTheDocument();
    expect(await fileText(user)).toContain('use: alice/other@v1');
  });

  it('says while the tray’s workflows are read, and when they cannot be', async () => {
    let answer = () => undefined as void;
    const answered = new Promise<void>((resolve) => {
      answer = resolve;
    });
    server.use(
      http.get('/api/v1/workflows/:owner/:name/versions/:version/box', async () => {
        await answered;
        return HttpResponse.json({
          inputs: [],
          outputs: [],
          newer_version: null,
          run: true,
        });
      }),
      signedIn,
      ...workflowBackend(CLASSIC).handlers,
    );
    renderApp(EDITOR_PAGE);

    const workflows = await findPart('section', 'Workflows');
    expect(
      await within(workflows).findByText('Finding workflows…'),
    ).toBeInTheDocument();
    answer();
    expect(
      await within(workflows).findByRole('button', { name: 'unicon/classic@v3' }),
    ).toBeInTheDocument();
    expect(workflows).not.toHaveTextContent('Finding workflows…');
  });

  it('says when the tray’s workflows cannot be read', async () => {
    server.use(
      http.get('/api/v1/workflows', () => HttpResponse.json({}, { status: 500 })),
      signedIn,
      ...workflowBackend(CLASSIC).handlers,
    );
    renderApp(EDITOR_PAGE);

    const workflows = await findPart('section', 'Workflows');
    expect(
      await within(workflows).findByText('The workflows could not be read.'),
    ).toBeInTheDocument();
  });

  it('adds an input of each type from the tray, named after its type', async () => {
    server.use(signedIn, ...workflowBackend(CLASSIC).handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await stepBox('run');
    await user.click(trayButton('Inputs', 'Number'));
    expect(await findPart('[role="group"]', 'Input number')).toHaveAttribute(
      'data-open',
      'true',
    );
    expect(
      within(drawer('Inputs')).getByLabelText('The input number', { selector: 'li' }),
    ).toBeInTheDocument();
    for (const type of ['Text', 'True or false', 'One of a list', 'File', 'Folder'])
      await user.click(trayButton('Inputs', type));
    // A second of a type is numbered, with an underscore, as the forge names.
    await user.click(trayButton('Inputs', 'Number'));

    const text = await fileText(user);
    for (const line of [
      '  number: number\n',
      '  text: text\n',
      '  switch: boolean\n',
      '  choice: {type: enum, options: [a, b]}\n',
      '  file: file\n',
      '  folder: folder\n',
      '  number_2: number\n',
    ])
      expect(text).toContain(line);
  });

  it('keeps an input’s drawer on it when it is renamed', async () => {
    server.use(signedIn, ...workflowBackend(CLASSIC).handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await openInput(user, 'time_limit');
    const row = within(drawer('Inputs')).getByLabelText('The input time_limit', {
      selector: 'li',
    });
    const name = within(row).getByRole('textbox', { name: 'Name' });
    await user.clear(name);
    await user.type(name, 'seconds{Enter}');

    expect(
      await within(drawer('Inputs')).findByLabelText('The input seconds', {
        selector: 'li',
      }),
    ).toBeInTheDocument();
    expect(part('[role="group"]', 'Input seconds')).toHaveAttribute(
      'data-open',
      'true',
    );
    expect(await fileText(user)).toContain('time_limit: ${{ inputs.seconds }}');
  });

  it('closes an input’s drawer when the input is removed', async () => {
    server.use(signedIn, ...workflowBackend(CLASSIC).handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await openInput(user, 'answer');
    await user.click(
      within(drawer('Inputs')).getByRole('button', { name: 'Remove the input answer' }),
    );

    await waitFor(() =>
      expect(screen.queryByRole('complementary', { name: 'Inputs' })).toBeNull(),
    );
    expect(screen.queryByRole('group', { name: 'Input answer' })).toBeNull();
    expect(await fileText(user)).not.toContain('  answer: file');
  });

  it('refuses an input named as an output, as the forge would', async () => {
    server.use(signedIn, ...workflowBackend(CLASSIC).handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await openInput(user, 'answer');
    const row = within(drawer('Inputs')).getByLabelText('The input answer', {
      selector: 'li',
    });
    const name = within(row).getByRole('textbox', { name: 'Name' });
    await user.clear(name);
    await user.type(name, 'log{Enter}');

    expect(
      await within(row).findByText(
        'Another one already has that name. Choose another.',
      ),
    ).toBeInTheDocument();
    expect(await fileText(user)).toContain('  answer: file');
  });

  it('declares an output in place', async () => {
    server.use(signedIn, ...workflowBackend(CLASSIC).handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await user.click(await outputButton(user, 'run', 'time_ms'));
    await user.click(
      within(await openMenu('The output time_ms of run')).getByRole('menuitem', {
        name: 'Name it as an output',
      }),
    );

    expect(await fileText(user)).toContain('time_ms_2: ${{ steps.run.time_ms }}');
  });

  it('names an input for the task’s form: its title, unit and help', async () => {
    server.use(signedIn, ...workflowBackend(CLASSIC).handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await openInput(user, 'memory_limit');
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
      'The memory the program may use.{Enter}',
    );

    expect(await fileText(user)).toContain(
      'memory_limit: {type: number, title: Memory limit, unit: MB, help: The memory the program may use.}',
    );
  });

  it('offers a unit only for a number, and drops it when the type changes away (M54)', async () => {
    server.use(
      signedIn,
      ...workflowBackend(
        CLASSIC.replace(
          '  memory_limit: number\n',
          '  memory_limit: number\n  episodes: {type: number, unit: runs}\n',
        ),
      ).handlers,
    );
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    const row = (id: string) =>
      within(drawer('Inputs')).getByLabelText(`The input ${id}`, { selector: 'li' });
    await openInput(user, 'submission');
    expect(
      within(row('submission')).queryByRole('textbox', { name: 'Unit' }),
    ).toBeNull();
    await openInput(user, 'language');
    expect(within(row('language')).queryByRole('textbox', { name: 'Unit' })).toBeNull();
    await openInput(user, 'episodes');
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
        CLASSIC.replace(
          '  memory_limit: number\n',
          '  memory_limit: number\n  data: {type: file, unit: MB}\n',
        ),
      ).handlers,
    );
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await openInput(user, 'data');
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

  it('gives a port text with an input’s value written in', async () => {
    server.use(
      signedIn,
      ...workflowBackend(
        CLASSIC.replace(
          '  time_limit: number\n',
          '  time_limit: number\n  episodes: number\n',
        ),
      ).handlers,
    );
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    const panel = await openStep(user, 'run');
    await user.selectOptions(
      within(panel).getByRole('combobox', { name: 'args (optional)' }),
      'A fixed value',
    );
    await user.type(
      within(panel).getByRole('textbox', { name: 'Value of args' }),
      '--episodes ',
    );
    await user.click(
      within(panel).getByRole('button', { name: 'Write a value into args' }),
    );
    await user.click(
      within(await openMenu('Write a value into args')).getByRole('menuitem', {
        name: 'episodes from the inputs',
      }),
    );

    expect(await fileText(user)).toMatch(
      /args: "?--episodes \$\{\{ inputs\.episodes \}\}"?\n/,
    );
  });

  it('wires a port given a whole reference in its field', async () => {
    server.use(signedIn, ...workflowBackend(CLASSIC).handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    const panel = await openStep(user, 'compile');
    await user.selectOptions(
      within(panel).getByRole('combobox', { name: 'entry (optional)' }),
      'A fixed value',
    );
    const entry = within(panel).getByRole('textbox', { name: 'Value of entry' });
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
        'Unicon cannot read ${{ inputs }}. Write ${{ inputs.<id> }}, ${{ workflow.<path> }} or ${{ steps.<id>.<output> }}.',
      ),
    ).toBeInTheDocument();
    await user.clear(entry);
    await user.paste('${{ inputs.language }}');
    await user.keyboard('{Enter}');
    expect(await fileText(user)).toContain('entry: ${{ inputs.language }}');
  });

  it('names a reported value for the pages that show it: its title, and a number’s unit (M58)', async () => {
    server.use(
      signedIn,
      ...workflowBackend(
        CLASSIC.replace(
          'time_ms: {from: "${{ steps.run.time_ms }}", unit: ms}',
          'time_ms: ${{ steps.run.time_ms }}',
        ),
      ).handlers,
    );
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await openOutputs(user);
    const row = (name: string) =>
      within(drawer('Outputs')).getByLabelText(`The output ${name}`, {
        selector: 'li',
      });
    expect(within(row('log')).queryByRole('textbox', { name: 'Unit' })).toBeNull();
    await user.type(
      within(row('time_ms')).getByRole('textbox', { name: 'Title' }),
      'Run time{Enter}',
    );
    await user.type(
      within(row('time_ms')).getByRole('textbox', { name: 'Unit' }),
      'ms{Enter}',
    );
    await user.type(
      within(row('log')).getByRole('textbox', { name: 'Title' }),
      'Compile log{Enter}',
    );

    const named = await fileText(user);
    expect(named).toContain(
      'time_ms: {from: "${{ steps.run.time_ms }}", title: Run time, unit: ms}',
    );
    expect(named).toContain(
      'log: {from: "${{ steps.compile.log }}", title: Compile log}',
    );
    // The outputs' box writes each out on its row: its title, type, unit and source.
    const outputs = part('[role="group"]', 'Outputs');
    expect(within(outputs).getByText('Run time')).toBeInTheDocument();
    expect(
      within(outputs).getByText('number · ms · time_ms from run'),
    ).toBeInTheDocument();

    const title = within(row('log')).getByRole('textbox', { name: 'Title' });
    await user.clear(title);
    await user.type(title, '{Enter}');
    expect(await fileText(user)).toContain('log: ${{ steps.compile.log }}\n');
  });

  it('drops a reported value’s unit when it comes to read text, and shows one a file left on text, to clear it (M58)', async () => {
    server.use(
      signedIn,
      ...workflowBackend(
        CLASSIC.replace(
          '  log: ${{ steps.compile.log }}\n',
          '  log: {from: "${{ steps.compile.log }}", title: Compile log, unit: lines}\n  total_ms: {from: "${{ steps.run.time_ms }}", title: Run time, unit: ms}\n',
        ),
      ).handlers,
    );
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await openOutputs(user);
    const row = (name: string) =>
      within(drawer('Outputs')).getByLabelText(`The output ${name}`, {
        selector: 'li',
      });
    const stray = within(row('log')).getByRole('textbox', { name: 'Unit' });
    expect(stray).toHaveValue('lines');
    expect(stray).toHaveAccessibleDescription(
      'Only a number takes a unit, so clear this one.',
    );
    await user.clear(stray);
    await user.type(stray, '{Enter}');
    expect(await fileText(user)).toContain(
      'log: {from: "${{ steps.compile.log }}", title: Compile log}',
    );

    expect(within(row('total_ms')).getByRole('textbox', { name: 'Unit' })).toHaveValue(
      'ms',
    );
    await user.selectOptions(
      within(row('total_ms')).getByRole('combobox', { name: 'From' }),
      'compile.log',
    );
    await waitFor(() =>
      expect(
        within(row('total_ms')).queryByRole('textbox', { name: 'Unit' }),
      ).toBeNull(),
    );
    expect(await fileText(user)).toContain(
      'total_ms: {from: "${{ steps.compile.log }}", title: Run time}',
    );
  });

  it('keeps a reported value’s title, and its unit while it reads a number, when it is wired to read another output', async () => {
    server.use(
      signedIn,
      ...workflowBackend(
        CLASSIC.replace(
          '  log: ${{ steps.compile.log }}\n',
          '  log: ${{ steps.compile.log }}\n  peak: {from: "${{ steps.run.time_ms }}", title: Peak, unit: ms}\n',
        ),
      ).handlers,
    );
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);
    const readFrom = async (output: string) => {
      await user.click(await entryButton(user, 'peak'));
      await user.click(
        within(await openMenu('The output peak')).getByRole('menuitem', {
          name: output,
        }),
      );
    };

    await readFrom('memory_kb from run');
    expect(await fileText(user)).toContain(
      'peak: {from: "${{ steps.run.memory_kb }}", title: Peak, unit: ms}',
    );
    await readFrom('log from compile');
    expect(await fileText(user)).toContain(
      'peak: {from: "${{ steps.compile.log }}", title: Peak}',
    );
  });

  it('keeps a step’s drawer open when the step is renamed', async () => {
    const two = [
      'steps:',
      '  - {id: first, use: unicon/compile@v3}',
      '  - {id: second, use: unicon/compile@v3}',
      '',
    ].join('\n');
    server.use(signedIn, ...workflowBackend(two).handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    const panel = await openStep(user, 'first');
    const name = within(panel).getByRole('textbox', { name: 'Name' });
    await user.clear(name);
    await user.type(name, 'opened{Enter}');

    expect(stepPanel('opened')).toBeInTheDocument();
    expect(await fileText(user)).toContain('id: opened');
  });

  it('says the check did not run rather than that it passed', async () => {
    server.use(
      http.post('/api/v1/workflows/check', () => problem(503, 'forge_unavailable')),
      signedIn,
      ...workflowBackend(CLASSIC).handlers,
    );
    renderApp(EDITOR_PAGE);

    expect(await screen.findByText(/The check did not run/)).toBeInTheDocument();
    expect(screen.queryByText(/Nothing to fix/)).not.toBeInTheDocument();
  });

  it('refuses in the drawer a declaration a wire would refuse, saying why', async () => {
    server.use(signedIn, ...workflowBackend(CLASSIC).handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await openInput(user, 'time_limit');
    const row = within(drawer('Inputs')).getByLabelText('The input time_limit', {
      selector: 'li',
    });
    await user.selectOptions(
      within(row).getByRole('combobox', { name: 'Type' }),
      'text',
    );

    expect(within(row).getByRole('alert')).toHaveTextContent(
      'run.time_limit: This takes a number, not text.',
    );
    expect(await fileText(user)).toBe(CLASSIC);
  });

  it('shows a wire the layout cannot draw on its port', async () => {
    const backwards = CLASSIC.replace(
      'language: ${{ inputs.language }}',
      ['language: ${{ inputs.language }}', '      entry: ${{ steps.run.output }}'].join(
        '\n',
      ),
    );
    server.use(signedIn, ...workflowBackend(backwards).handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await openStep(user, 'compile');
    const step = await stepBox('compile');
    expect(within(step).getByText(/output from run, not drawn/)).toBeInTheDocument();
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
    await waitFor(() => expect(backend.state.checks).toBeGreaterThan(0));
    expect(screen.queryByText(/Nothing to fix/)).toBeNull();
    expect(
      document.querySelector('section[aria-label="Add to the workflow"]'),
    ).toBeNull();
    const back = within(mend).getByRole('button', { name: 'Back to the graph' });
    expect(back).toBeDisabled();
    const field = within(mend).getByRole('textbox', { name: DRAFT_FILE });
    await user.clear(field);
    await user.paste('inputs: {input: file}\nsteps: []\n');
    expect(back).toBeEnabled();
    expect(mend).toHaveTextContent('The file can be read again');

    await user.click(barButton('Save'));
    await waitFor(() =>
      expect(backend.state.draft).toBe('inputs: {input: file}\nsteps: []\n'),
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
    expect(part('section', 'Add to the workflow')).toBeInTheDocument();
  });

  it('asks before leaving a draft with changes not saved', async () => {
    server.use(signedIn, ...workflowBackend(CLASSIC).handlers);
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

  it('opens a box two levels in, and a problem opens the step inside', async () => {
    const draft = ['steps:', '  - {id: build, use: kenny/inner@v1}', ''].join('\n');
    const inner = ['steps:', '  - {id: compile, use: kenny/deep@v1}', ''].join('\n');
    const deep = ['steps:', '  - {id: link, use: unicon/compile@v3}', ''].join('\n');
    const port = (name: string) => ({
      name,
      type: 'file',
      title: null,
      unit: null,
      at_least: null,
      at_most: null,
      better: null,
      optional: false,
      options: null,
    });
    server.use(
      http.get('/api/v1/workflows', () =>
        HttpResponse.json([
          {
            owner: 'kenny',
            name: 'inner',
            visibility: 'private',
            versions: ['v1'],
            editable: true,
          },
          {
            owner: 'kenny',
            name: 'deep',
            visibility: 'private',
            versions: ['v1'],
            editable: true,
          },
        ]),
      ),
      http.get('/api/v1/workflows/:owner/:name/versions/:version/box', ({ params }) =>
        HttpResponse.json({
          inputs: [port('source')],
          outputs: [port('program')],
          newer_version: params.name === 'inner' ? 'v2' : null,
          run: true,
        }),
      ),
      http.get('/api/v1/workflows/:owner/:name/versions/:version', ({ params }) =>
        HttpResponse.json({ content: params.name === 'inner' ? inner : deep }),
      ),
      signedIn,
      ...workflowBackend(draft, {
        problems: () => [
          { path: 'steps[0]', message: 'The link failed.', step: 'build/compile/link' },
        ],
      }).handlers,
    );
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    const build = await stepBox('build');
    // Its problem stands on the line under its head, before that v2 is out.
    expect(
      await within(build).findByRole('note', { name: 'The link failed.' }),
    ).toBeInTheDocument();
    const banner = await screen.findByLabelText('Problems', { selector: 'section' });
    await user.click(within(banner).getByRole('button', { name: 'Step build' }));

    expect(await screen.findByRole('group', { name: 'Step link' })).toBeInTheDocument();
    const crumbs = screen.getByRole('navigation', { name: 'Inside the workflow' });
    expect(within(crumbs).getByRole('button', { name: 'build' })).toBeInTheDocument();
    expect(within(crumbs).getByText('compile')).toHaveAttribute('aria-current', 'page');
    await user.click(within(crumbs).getByRole('button', { name: 'tuned' }));

    expect(await stepBox('build')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open build' }));
    expect(
      await screen.findByRole('group', { name: 'Step compile' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open compile' }));
    expect(await screen.findByRole('group', { name: 'Step link' })).toBeInTheDocument();
    // Deeper than the draft, Details shows the step it opened from, read only.
    await user.click(screen.getByRole('button', { name: 'Details' }));
    const details = await screen.findByRole('complementary', { name: 'Step compile' });
    expect(within(details).getByText(/^Read only\./)).toBeInTheDocument();
    expect(within(details).queryByRole('textbox')).toBeNull();
    await user.click(
      within(screen.getByRole('navigation', { name: 'Inside the workflow' })).getByRole(
        'button',
        { name: 'build' },
      ),
    );
    expect(
      await screen.findByRole('group', { name: 'Step compile' }),
    ).toBeInTheDocument();
    // Going back up closes Details, and it stays closed on the way back in.
    expect(screen.queryByRole('complementary', { name: 'Step compile' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Open compile' }));
    expect(await screen.findByRole('group', { name: 'Step link' })).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Step compile' })).toBeNull();
  });
});

function savedEntry(path: string, kind: 'file' | 'directory' = 'file'): TreeEntry {
  return {
    path,
    kind,
    token: kind === 'file' ? 'file-token' : null,
    size: kind === 'file' ? 12 : null,
    upload: null,
    version: 'files-v1',
    start: null,
  };
}

describe('the drawer', () => {
  it('wires a step’s port from its Select, which offers only what fits', async () => {
    server.use(signedIn, ...workflowBackend(CLASSIC).handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    const compile = await openStep(user, 'compile');
    const entry = within(compile).getByRole('combobox', { name: 'entry (optional)' });
    const offered = within(entry)
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(offered).toContain('language from the inputs');
    // A file is refused by a text port, so it is not offered at all.
    expect(offered).not.toContain('input from the inputs');
    expect(offered).not.toContain('submission from the inputs');
    await user.selectOptions(entry, 'language from the inputs');
    expect(await fileText(user)).toContain('entry: ${{ inputs.language }}');

    const run = await openStep(user, 'run');
    const limit = within(run).getByRole('combobox', { name: 'time_limit' });
    expect(limit).toHaveDisplayValue('time_limit from the inputs');
    await user.selectOptions(limit, 'Nothing yet');
    expect(
      within(run).queryByRole('textbox', { name: 'Value of time_limit' }),
    ).toBeNull();
    expect(await fileText(user)).not.toContain('time_limit: ${{ inputs.time_limit }}');
  });

  it('shows a port’s value field once a fixed value is chosen, and clears the value on Nothing yet', async () => {
    server.use(signedIn, ...workflowBackend(CLASSIC).handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    const run = await openStep(user, 'run');
    const limit = within(run).getByRole('combobox', { name: 'time_limit' });
    expect(
      within(limit)
        .getAllByRole('option')
        .map((option) => option.textContent)
        .slice(0, 2),
    ).toEqual(['Nothing yet', 'A fixed value']);
    expect(within(run).queryByText('Its value, below')).toBeNull();
    await user.selectOptions(limit, 'A fixed value');
    await user.type(
      within(run).getByRole('textbox', { name: 'Value of time_limit' }),
      '2{Enter}',
    );
    expect(await fileText(user)).toContain('time_limit: 2');
    expect(limit).toHaveDisplayValue('A fixed value');

    await user.selectOptions(limit, 'Nothing yet');
    expect(
      within(run).queryByRole('textbox', { name: 'Value of time_limit' }),
    ).toBeNull();
    expect(await fileText(user)).not.toContain('time_limit: 2');
  });

  it('offers no fixed value on a port that takes a file', async () => {
    server.use(signedIn, ...workflowBackend(CLASSIC).handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    const compile = await openStep(user, 'compile');
    const source = within(compile).getByRole('combobox', { name: 'source' });
    expect(
      within(source)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).not.toContain('A fixed value');
  });

  /**
   * A draft whose steps run kenny/inner@v1, of which v2 is out. `listed`
   * false fails the list of workflows, and `newer` false fails v2's box.
   */
  const serveInner = (
    steps: string[],
    { listed = true, newer = true }: { listed?: boolean; newer?: boolean } = {},
  ) => {
    const draft = ['inputs:', '  code: file', 'steps:', ...steps, ''].join('\n');
    const inner = ['steps:', '  - {id: compile, use: unicon/compile@v3}', ''].join(
      '\n',
    );
    const port = (name: string) => ({
      name,
      type: 'file',
      title: null,
      unit: null,
      at_least: null,
      at_most: null,
      better: null,
      optional: false,
      options: null,
    });
    server.use(
      http.get('/api/v1/workflows', () =>
        listed
          ? HttpResponse.json([
              {
                owner: 'kenny',
                name: 'inner',
                visibility: 'private',
                versions: ['v1', 'v2'],
                editable: true,
              },
            ])
          : problem(500, 'internal'),
      ),
      http.get('/api/v1/workflows/:owner/:name/versions/:version/box', ({ params }) =>
        params.version === 'v2' && !newer
          ? problem(500, 'internal')
          : HttpResponse.json({
              inputs: [port('source')],
              outputs: [port('program')],
              newer_version: params.version === 'v1' ? 'v2' : null,
              run: true,
            }),
      ),
      http.get('/api/v1/workflows/:owner/:name/versions/:version', () =>
        HttpResponse.json({ content: inner }),
      ),
      signedIn,
      ...workflowBackend(draft).handlers,
    );
  };

  it('moves a workflow box to the newer version, wires its ports and zooms in', async () => {
    serveInner(['  - {id: build, use: kenny/inner@v1}']);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    const panel = await openStep(user, 'build');
    expect(
      await within(panel).findByText(
        'A workflow run as one step: it needs source · gives program.',
      ),
    ).toBeInTheDocument();
    await user.selectOptions(
      within(panel).getByRole('combobox', { name: 'source' }),
      'code from the inputs',
    );
    expect(await fileText(user)).toMatch(/source: "?\$\{\{ inputs\.code \}\}"?/);

    expect(within(stepPanel('build')).getByText('v2 is out.')).toBeInTheDocument();
    await user.click(
      within(stepPanel('build')).getByRole('button', { name: 'Move to it' }),
    );
    expect(await fileText(user)).toContain('use: kenny/inner@v2');
    await waitFor(() =>
      expect(within(stepPanel('build')).queryByText('v2 is out.')).toBeNull(),
    );

    await user.click(
      within(stepPanel('build')).getByRole('button', { name: 'Open build' }),
    );
    expect(
      await screen.findByRole('navigation', { name: 'Inside the workflow' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('group', { name: 'Step compile' }),
    ).toBeInTheDocument();
  });

  it('reads the newer version itself when the list of workflows fails', async () => {
    serveInner(['  - {id: build, use: kenny/inner@v1}'], { listed: false });
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await openStep(user, 'build');
    const move = await within(stepPanel('build')).findByRole('button', {
      name: 'Move to it',
    });
    await waitFor(() => expect(move).toBeEnabled());
    await user.click(move);
    expect(await fileText(user)).toContain('use: kenny/inner@v2');
  });

  it('cannot move to a newer version whose box cannot be read, and says so', async () => {
    serveInner(['  - {id: build, use: kenny/inner@v1}'], { newer: false });
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await openStep(user, 'build');
    expect(
      await within(stepPanel('build')).findByText(
        'v2 could not be read, so the step cannot move to it yet.',
      ),
    ).toBeInTheDocument();
    expect(
      within(stepPanel('build')).getByRole('button', { name: 'Move to it' }),
    ).toBeDisabled();
  });

  it('opens a box into the well, between what feeds it and what it feeds', async () => {
    serveInner([
      '  - {id: build, use: kenny/inner@v1, with: {source: "${{ inputs.code }}"}}',
      '  - {id: after, use: unicon/exec@v1, with: {program: "${{ steps.build.program }}"}}',
    ]);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await stepBox('build');
    await user.click(await screen.findByRole('button', { name: 'Open build' }));
    const crumbs = await screen.findByRole('navigation', {
      name: 'Inside the workflow',
    });
    expect(within(crumbs).getByText('build')).toHaveAttribute('aria-current', 'page');
    expect(await screen.findByText('kenny/inner@v1')).toBeInTheDocument();
    expect(screen.getByText(/v2 is out/)).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Editing' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Add to the workflow' })).toBeNull();
    const feeds = await screen.findByRole('region', { name: 'What feeds it' });
    expect(within(feeds).getByRole('button', { name: /^code/ })).toBeInTheDocument();
    const fed = screen.getByRole('region', { name: 'What it feeds' });
    expect(within(fed).getByRole('button', { name: /^after/ })).toBeInTheDocument();

    // At the draft, Details opens the step's own drawer, to change it.
    await user.click(screen.getByRole('button', { name: 'Details' }));
    expect(
      within(stepPanel('build')).getByRole('textbox', { name: 'Name' }),
    ).toBeInTheDocument();
    await user.keyboard('{Escape}');

    // A neighbour that is not a workflow goes back up, selected.
    await user.click(within(feeds).getByRole('button', { name: /^code/ }));
    expect(
      await screen.findByRole('complementary', { name: 'Inputs' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('navigation', { name: 'Inside the workflow' }),
    ).toBeNull();
  });

  it('follows a rename and a new version made through Details while inside', async () => {
    serveInner(['  - {id: build, use: kenny/inner@v1}']);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await stepBox('build');
    await user.click(await screen.findByRole('button', { name: 'Open build' }));
    await user.click(await screen.findByRole('button', { name: 'Details' }));
    const name = within(stepPanel('build')).getByRole('textbox', { name: 'Name' });
    await user.clear(name);
    await user.type(name, 'built{Enter}');
    const crumbs = screen.getByRole('navigation', { name: 'Inside the workflow' });
    expect(await within(crumbs).findByText('built')).toHaveAttribute(
      'aria-current',
      'page',
    );

    await user.click(
      await within(stepPanel('built')).findByRole('button', { name: 'Move to it' }),
    );
    // The well and the drawer both show the version it runs now.
    await waitFor(() => expect(screen.queryByText('kenny/inner@v1')).toBeNull());
    expect(screen.getAllByText('kenny/inner@v2')).toHaveLength(2);
    expect(screen.queryByText(/v2 is out/)).toBeNull();

    await user.click(
      within(stepPanel('built')).getByRole('button', { name: 'Remove the step built' }),
    );
    expect(
      screen.queryByRole('navigation', { name: 'Inside the workflow' }),
    ).toBeNull();
  });

  it('opens a neighbour that is a workflow box in this one’s place', async () => {
    serveInner([
      '  - {id: build, use: kenny/inner@v1}',
      '  - {id: again, use: kenny/inner@v1, with: {source: "a ${{ steps.build.program }}"}}',
    ]);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await stepBox('build');
    await user.click(await screen.findByRole('button', { name: 'Open build' }));
    // A value written into text reads the step as a wire does.
    const fed = await screen.findByRole('region', { name: 'What it feeds' });
    await user.click(within(fed).getByRole('button', { name: /^again/ }));
    const crumbs = screen.getByRole('navigation', { name: 'Inside the workflow' });
    expect(within(crumbs).getByText('again')).toHaveAttribute('aria-current', 'page');
    expect(within(crumbs).queryByText('build')).toBeNull();
    const feeds = await screen.findByRole('region', { name: 'What feeds it' });
    expect(within(feeds).getByRole('button', { name: /^build/ })).toBeInTheDocument();
  });

  it('offers a workflow box’s ports in the port menu', async () => {
    serveInner(['  - {id: build, use: kenny/inner@v1}']);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await user.click(await portButton(user, 'build', 'source'));
    const menu = await openMenu('The port source of build');
    expect(
      within(menu).getByRole('menuitem', {
        name: 'A new input, of type file, wired here',
      }),
    ).toBeInTheDocument();
    await user.click(
      within(menu).getByRole('menuitem', { name: /^code from the inputs/ }),
    );
    expect(await fileText(user)).toMatch(/source: "?\$\{\{ inputs\.code \}\}"?/);
  });

  it('says which ports read an input', async () => {
    server.use(signedIn, ...workflowBackend(CLASSIC).handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await openInput(user, 'language');
    const row = within(drawer('Inputs')).getByLabelText('The input language', {
      selector: 'li',
    });
    expect(within(row).getByRole('heading', { name: 'Read by' })).toBeInTheDocument();
    expect(within(row).getByText('compile.language')).toBeInTheDocument();
  });
});

describe('a file the workflow gives, not the task', () => {
  /** The draft's saved files, as the Files card's tree lists them. */
  const tree = (paths: string[]) =>
    http.get(`${WORKFLOW_API}/tree`, () =>
      HttpResponse.json(paths.map((path) => savedEntry(path))),
    );
  const uploads = () => {
    let next = 0;
    return [
      http.get(`${WORKFLOW_API}/files/*`, () => problem(404, 'not_found')),
      http.post(`${WORKFLOW_API}/uploads`, () =>
        HttpResponse.json({
          id: `upload-${String(++next)}`,
          url: `/-/uploads/${String(next)}`,
          ready: false,
          expires_at: '2026-10-27T12:00:00Z',
        }),
      ),
      http.put('/-/uploads/:id', () => new HttpResponse(null)),
      http.post(`${WORKFLOW_API}/uploads/:id/complete`, () =>
        HttpResponse.json({ status: 'verified' }),
      ),
    ];
  };
  const openFile = async (user: ReturnType<typeof userEvent.setup>, path: string) => {
    const box = await findPart('[role="group"]', `Workflow file ${path}`);
    await user.click(within(box).getByRole('button', { name: new RegExp(`^${path}`) }));
    return drawer('Workflow file');
  };

  it('makes an input one of the workflow’s files, which moves to its own box', async () => {
    server.use(
      tree(['data/answer.txt']),
      signedIn,
      ...workflowBackend(CLASSIC).handlers,
    );
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await openInput(user, 'answer');
    const inputs = drawer('Inputs');
    const from = within(inputs).getByRole('combobox', { name: 'Comes from' });
    expect(from).toHaveDisplayValue('The task, on every run');
    await user.selectOptions(from, 'A file of this workflow');
    await user.selectOptions(
      await within(inputs).findByRole('combobox', { name: 'The file' }),
      'data/answer.txt',
    );

    const given = await findPart('[role="group"]', 'Workflow file data/answer.txt');
    expect(given).toHaveTextContent('workflow file');
    expect(given).toHaveTextContent('Read by check');
    expect(screen.queryByRole('group', { name: 'Input answer' })).toBeNull();
    expect(
      within(drawer('Workflow file')).getByRole('combobox', { name: 'The file' }),
    ).toHaveDisplayValue('data/answer.txt');
    const text = await fileText(user);
    expect(text).toContain('expected: ${{ workflow.data/answer.txt }}');
    expect(text).not.toContain('answer: file');
  });

  it('offers no workflow file for an input that is not a file', async () => {
    server.use(signedIn, ...workflowBackend(CLASSIC).handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await openInput(user, 'time_limit');
    expect(
      within(drawer('Inputs')).queryByRole('combobox', { name: 'Comes from' }),
    ).toBeNull();
  });

  it('uploads the file an input becomes from its drawer, staged for Save', async () => {
    server.use(tree([]), ...uploads(), signedIn, ...workflowBackend(CLASSIC).handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await openInput(user, 'answer');
    const inputs = drawer('Inputs');
    await user.selectOptions(
      within(inputs).getByRole('combobox', { name: 'Comes from' }),
      'A file of this workflow',
    );
    expect(
      within(inputs).getByRole('combobox', { name: 'The file' }),
    ).toHaveDisplayValue('No file yet');
    await user.upload(within(inputs).getByLabelText('Or upload one'), [
      new File(['42\n'], 'answer.txt'),
    ]);

    expect(
      await findPart('[role="group"]', 'Workflow file answer.txt'),
    ).toHaveTextContent('Read by check');
    expect(
      within(drawer('Workflow file')).getByText(
        'answer.txt: uploaded, waiting for Save',
      ),
    ).toBeInTheDocument();
    expect(await fileText(user)).toContain('expected: ${{ workflow.answer.txt }}');
  });

  it('refuses to make an input a file a port it feeds would refuse, and saying why', async () => {
    server.use(tree(['main.c']), signedIn, ...workflowBackend(CLASSIC).handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    // A file input may feed a folder port; a file of the workflow may not.
    await openInput(user, 'submission');
    const inputs = drawer('Inputs');
    await user.selectOptions(
      within(inputs).getByRole('combobox', { name: 'Comes from' }),
      'A file of this workflow',
    );
    await user.selectOptions(
      await within(inputs).findByRole('combobox', { name: 'The file' }),
      'main.c',
    );

    expect(await within(inputs).findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Input submission' })).toBeInTheDocument();
    expect(await fileText(user)).toContain('source: ${{ inputs.submission }}');
  });

  it('offers a workflow file only to an input a step reads', async () => {
    server.use(
      signedIn,
      ...workflowBackend(
        CLASSIC.replace('  answer: file\n', '  answer: file\n  spare: file\n'),
      ).handlers,
    );
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await openInput(user, 'spare');
    const from = within(drawer('Inputs')).getByRole('combobox', { name: 'Comes from' });
    expect(
      within(from).getByRole('option', {
        name: 'A file of this workflow, once a step reads it',
      }),
    ).toBeDisabled();
  });

  it('keeps a file uploaded from a drawer closed before it ended staged, and the draft as it is', async () => {
    let finish: () => void = () => undefined;
    const done = new Promise<void>((resolve) => {
      finish = resolve;
    });
    server.use(
      tree([]),
      http.post(`${WORKFLOW_API}/uploads/:id/complete`, async () => {
        await done;
        return HttpResponse.json({ status: 'verified' });
      }),
      ...uploads(),
      signedIn,
      ...workflowBackend(CLASSIC).handlers,
    );
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await openInput(user, 'answer');
    const inputs = drawer('Inputs');
    const from = within(inputs).getByRole('combobox', { name: 'Comes from' });
    await user.selectOptions(from, 'A file of this workflow');
    await user.upload(within(inputs).getByLabelText('Or upload one'), [
      new File(['42\n'], 'answer.txt'),
    ]);
    // One upload at a time on the page, and no Save while it runs.
    await waitFor(() => expect(barButton('Save')).toBeDisabled());
    await user.selectOptions(from, 'The task, on every run');
    finish();

    await waitFor(() => expect(barButton('Save')).toBeEnabled());
    expect(screen.getByRole('group', { name: 'Input answer' })).toBeInTheDocument();
    expect(
      within(await openFiles(user)).getByText('answer.txt: uploaded, waiting for Save'),
    ).toBeInTheDocument();
    expect(await fileText(user)).toContain('expected: ${{ inputs.answer }}');
  });

  it('uploads no file of a name the workflow has, and says where to replace it', async () => {
    server.use(
      tree(['answer.txt']),
      ...uploads(),
      signedIn,
      ...workflowBackend(CLASSIC).handlers,
    );
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await openInput(user, 'answer');
    const inputs = drawer('Inputs');
    await user.selectOptions(
      within(inputs).getByRole('combobox', { name: 'Comes from' }),
      'A file of this workflow',
    );
    await within(inputs).findByRole('option', { name: 'answer.txt' });
    await user.upload(within(inputs).getByLabelText('Or upload one'), [
      new File(['42\n'], 'answer.txt'),
    ]);

    expect(await within(inputs).findByRole('alert')).toHaveTextContent(
      'The workflow already has a file answer.txt. Choose it above, or replace it in Files.',
    );
    expect(
      within(await openFiles(user)).queryByRole('list', { name: 'File changes' }),
    ).toBeNull();
  });

  it('moves a file’s readers to another file, and lets the task supply it again', async () => {
    const text = CLASSIC.replace(
      'stdin: ${{ inputs.input }}',
      'stdin: ${{ workflow.data.in }}',
    );
    server.use(
      tree(['data.in', 'other.in']),
      signedIn,
      ...workflowBackend(text).handlers,
    );
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    const panel = await openFile(user, 'data.in');
    expect(panel).toHaveTextContent('Read by');
    expect(panel).toHaveTextContent('run.stdin');
    await user.selectOptions(
      within(panel).getByRole('combobox', { name: 'The file' }),
      'other.in',
    );
    expect(
      await findPart('[role="group"]', 'Workflow file other.in'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Workflow file data.in' })).toBeNull();

    await user.click(
      within(drawer('Workflow file')).getByRole('button', {
        name: 'Let the task supply it instead',
      }),
    );
    expect(await findPart('[role="group"]', 'Input other')).toHaveTextContent(
      'Read by run',
    );
    expect(within(drawer('Inputs')).getByRole('textbox', { name: 'Name' })).toHaveValue(
      'other',
    );
    const after = await fileText(user);
    expect(after).toContain('stdin: ${{ inputs.other }}');
    expect(after).toMatch(/\n {2}other: file\n/);
    expect(after).not.toContain('workflow.');
  });

  it('says when a file the steps read is not among the workflow’s files', async () => {
    const text = CLASSIC.replace(
      'stdin: ${{ inputs.input }}',
      'stdin: ${{ workflow.gone.in }}',
    );
    server.use(tree([]), signedIn, ...workflowBackend(text).handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    expect(
      await within(await openFile(user, 'gone.in')).findByText(
        'gone.in is not among this workflow’s files yet. Upload it below, or choose another.',
      ),
    ).toBeInTheDocument();
  });

  it('says nothing of a missing file while the workflow’s files are still being read', async () => {
    const text = CLASSIC.replace(
      'stdin: ${{ inputs.input }}',
      'stdin: ${{ workflow.data.in }}',
    );
    server.use(
      http.get(`${WORKFLOW_API}/tree`, async () => {
        await delay('infinite');
        return HttpResponse.json([]);
      }),
      signedIn,
      ...workflowBackend(text).handlers,
    );
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    const panel = await openFile(user, 'data.in');
    expect(
      within(panel).getByRole('combobox', { name: 'The file' }),
    ).toHaveDisplayValue('data.in');
    expect(panel).not.toHaveTextContent('is not among');
  });
});

describe('wiring workflow files', () => {
  it('offers saved folders and files from the Files card tree, fetched once', async () => {
    const backend = workflowBackend(CLASSIC);
    const reads: string[] = [];
    server.use(signedIn, ...backend.handlers);
    server.use(
      http.get(`${WORKFLOW_API}/tree`, ({ request }) => {
        const path = new URL(request.url).searchParams.get('path') ?? '';
        reads.push(path);
        return HttpResponse.json(
          path === ''
            ? [savedEntry('workflow.yaml'), savedEntry('checker', 'directory')]
            : [savedEntry('checker/checker.cpp'), savedEntry('checker/program.yaml')],
        );
      }),
    );
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);
    await waitFor(() => expect(reads).toContain('checker'));
    await user.click(await portButton(user, 'compile', 'source'));
    const menu = await openMenu('The port source of compile');
    const folder = within(menu).getByRole('menuitem', {
      name: 'the workflow’s checker/',
    });
    expect(folder).not.toBeDisabled();
    expect(
      within(menu).getByRole('menuitem', {
        name: /^the workflow’s checker\/program.yaml/,
      }),
    ).toHaveAttribute('data-disabled', 'true');
    expect(within(menu).queryByRole('menuitem', { name: /workflow.yaml/ })).toBeNull();
    await user.click(folder);
    expect(await fileText(user)).toContain('source: ${{ workflow.checker/ }}');
    expect(
      await screen.findByRole('group', { name: 'Workflow file checker/' }),
    ).toHaveTextContent('Read by compile');
    expect(reads.filter((path) => path === '')).toHaveLength(1);
    expect(reads.filter((path) => path === 'checker')).toHaveLength(1);
  });

  it('builds the islands checker with staged uploads and wires, then saves and publishes it', async () => {
    const draft = `inputs:
  input: file
  output: file
  answer: file
steps:
  - id: build
    use: unicon/compile@v3
    with: {language: cpp}
  - id: check
    use: unicon/exec@v1
    with:
      program: \${{ steps.build.program }}
      files:
        input: \${{ inputs.input }}
        output: \${{ inputs.output }}
        answer: \${{ inputs.answer }}
      time_limit: 5
      memory_limit: 256
outputs:
  score: \${{ steps.check.score }}
  message: \${{ steps.check.message }}
`;
    const backend = workflowBackend(draft);
    let nextUpload = 0;
    let changes: SaveChange[] = [];
    server.use(signedIn, ...backend.handlers);
    server.use(
      http.get('/api/v1/primitives', () =>
        HttpResponse.json(
          PRIMITIVES.map((primitive) =>
            primitive.ref === 'unicon/exec@v1'
              ? {
                  ...primitive,
                  inputs: {
                    ...primitive.inputs,
                    manifest: {
                      ...primitive.inputs.program,
                      runs: false,
                      optional: true,
                    },
                  },
                }
              : primitive,
          ),
        ),
      ),
      http.get(`${WORKFLOW_API}/files/*`, () => problem(404, 'not_found')),
      http.post(`${WORKFLOW_API}/uploads`, () =>
        HttpResponse.json({
          id: `upload-${String(++nextUpload)}`,
          url: `/-/uploads/${String(nextUpload)}`,
          ready: false,
          expires_at: '2026-10-27T12:00:00Z',
        }),
      ),
      http.put('/-/uploads/:id', () => new HttpResponse(null)),
      http.post(`${WORKFLOW_API}/uploads/:id/complete`, () =>
        HttpResponse.json({ status: 'verified' }),
      ),
      http.put(`${WORKFLOW_API}/draft`, async ({ request }) => {
        const body = (await request.json()) as {
          content: string;
          token: string;
          changes: SaveChange[];
        };
        backend.state.saves.push(body);
        backend.state.draft = body.content;
        backend.state.token = 'saved';
        changes = body.changes;
        return HttpResponse.json({
          content: body.content,
          token: 'saved',
          revision: 'checker-files',
        });
      }),
    );
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);
    const files = await openFiles(user);
    await user.type(
      within(files).getByRole('textbox', { name: 'Into folder (optional)' }),
      'checker',
    );
    await user.upload(within(files).getByLabelText('Add files'), [
      new File(['int main() { return 0; }'], 'checker.cpp'),
      new File(
        [
          'reports:\n  score: {better: higher, at_least: 0, at_most: 1}\n  message: {type: text}\n',
        ],
        'program.yaml',
      ),
    ]);
    await within(files).findByText('checker/program.yaml: uploaded, waiting for Save');
    await user.click(await portButton(user, 'build', 'source'));
    await user.click(
      within(await openMenu('The port source of build')).getByRole('menuitem', {
        name: 'the workflow’s checker/',
      }),
    );
    await user.click(await portButton(user, 'check', 'manifest'));
    await user.click(
      within(await openMenu('The port manifest of check')).getByRole('menuitem', {
        name: 'the workflow’s checker/program.yaml',
      }),
    );
    expect(
      await screen.findByRole('group', { name: 'Workflow file checker/program.yaml' }),
    ).toHaveTextContent('Read by check');
    await user.click(barButton('Save'));
    await waitFor(() => expect(barButton('Save')).toBeDisabled());
    expect(backend.state.draft).toContain('${{ workflow.checker/ }}');
    expect(backend.state.draft).toContain('${{ workflow.checker/program.yaml }}');
    expect(changes.map((change) => change.path)).toEqual([
      'checker/checker.cpp',
      'checker/program.yaml',
    ]);
    await waitFor(() =>
      expect(part('section', 'Problems')).toHaveTextContent('Nothing to fix'),
    );
    await user.click(barButton('Publish version'));
    const publish = within(await findDialog('Publish v1')).getByRole('button', {
      name: 'Publish v1',
    });
    await waitFor(() => expect(publish).toBeEnabled());
    await user.click(publish);
    await waitFor(() => expect(backend.state.versions).toEqual(['v1']));
  });

  it('keeps a removed file wired and shows its refusal at Publish version', async () => {
    const text = CLASSIC.replace(
      'stdin: ${{ inputs.input }}',
      'stdin: ${{ workflow.data.in }}',
    );
    const backend = workflowBackend(text);
    let removed = false;
    server.use(signedIn, ...backend.handlers);
    server.use(
      http.get(`${WORKFLOW_API}/tree`, () =>
        HttpResponse.json(removed ? [] : [savedEntry('data.in')]),
      ),
      http.get(`${WORKFLOW_API}/files/data.in`, () =>
        HttpResponse.json({
          path: 'data.in',
          content: '1',
          encoding: 'utf-8',
          token: 'file-token',
          upload: null,
          version: 'files-v1',
        }),
      ),
      http.put(`${WORKFLOW_API}/draft`, async ({ request }) => {
        const body = (await request.json()) as {
          content: string;
          changes: SaveChange[];
        };
        expect(body.changes).toEqual([
          { path: 'data.in', token: 'file-token', encoding: 'utf-8', remove: true },
        ]);
        removed = true;
        return HttpResponse.json({
          content: body.content,
          token: 'saved',
          revision: 'removed-file',
        });
      }),
      http.post(`${WORKFLOW_API}/versions`, () =>
        problem(422, 'invalid_definition', {
          errors: [
            {
              path: 'steps[1].with.stdin',
              message: 'The workflow has no file data.in.',
            },
          ],
        }),
      ),
    );
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);
    const files = await openFiles(user);
    await user.click(await within(files).findByRole('button', { name: /^data.in/ }));
    await user.click(within(files).getByRole('button', { name: 'Remove data.in' }));
    await user.click(barButton('Save'));
    await waitFor(() => expect(barButton('Save')).toBeDisabled());
    expect(await fileText(user)).toContain('stdin: ${{ workflow.data.in }}');
    expect(part('section', 'Problems')).toHaveTextContent('Nothing to fix');
    await user.click(barButton('Publish version'));
    const dialog = await findDialog('Publish v1');
    await user.click(within(dialog).getByRole('button', { name: 'Publish v1' }));
    expect(
      await within(dialog).findByText('The workflow has no file data.in.', {
        exact: false,
      }),
    ).toBeVisible();
  });
});

describe('the inputs shown', () => {
  it('hides the inputs and the files the steps read until the browser chooses otherwise', async () => {
    localStorage.removeItem(INPUTS_SHOWN_KEY);
    server.use(
      signedIn,
      ...workflowBackend(
        CLASSIC.replace('${{ inputs.answer }}', '${{ workflow.answers/1.out }}'),
      ).handlers,
    );
    renderApp(EDITOR_PAGE);

    await stepBox('compile');
    expect(screen.queryByRole('group', { name: 'Input submission' })).toBeNull();
    expect(
      screen.queryByRole('group', { name: 'Workflow file answers/1.out' }),
    ).toBeNull();
    expect(
      within(part('[role="group"]', 'Editing')).getByRole('checkbox', {
        name: 'Show inputs and files',
      }),
    ).not.toBeChecked();
  });
});

describe('the inputs hidden', () => {
  const showInputs = () =>
    within(part('[role="group"]', 'Editing')).getByRole('checkbox', {
      name: 'Show inputs and files',
    });

  beforeEach(() => {
    localStorage.setItem(INPUTS_SHOWN_KEY, 'hidden');
  });

  it('hides the inputs the steps read, each step saying on a tab how many it reads', async () => {
    server.use(signedIn, ...workflowBackend(CLASSIC).handlers);
    renderApp(EDITOR_PAGE);

    const compile = await stepBox('compile');
    expect(screen.queryByRole('group', { name: /^Input / })).toBeNull();
    expect(
      within(compile).getByRole('button', { name: '2 inputs of Step compile' }),
    ).toBeVisible();
    expect(
      within(await stepBox('run')).getByRole('button', {
        name: '3 inputs of Step run',
      }),
    ).toBeVisible();
    expect(
      within(await stepBox('check')).getByRole('button', {
        name: '1 input of Step check',
      }),
    ).toBeVisible();
    expect(showInputs()).not.toBeChecked();
  });

  it('pops out on its tab the boxes of the inputs a step reads, each opening its drawer', async () => {
    server.use(signedIn, ...workflowBackend(CLASSIC).handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    const tab = within(await stepBox('compile')).getByRole('button', {
      name: '2 inputs of Step compile',
    });
    await user.hover(tab);
    const language = await findPart('[role="group"]', 'Input language');
    expect(part('[role="group"]', 'Input submission')).toBeVisible();
    // Each box's wire says the port it feeds.
    expect(screen.getByText('source', { selector: 'text' })).toBeInTheDocument();
    await user.click(within(language).getByRole('button'));

    expect(
      within(drawer('Inputs')).getByLabelText('The input language', { selector: 'li' }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('group', { name: 'Input submission' })).toBeNull(),
    );
  });

  it('draws an input no step reads, so it can be found', async () => {
    server.use(signedIn, ...workflowBackend(CLASSIC).handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await stepBox('run');
    await user.click(trayButton('Inputs', 'Number'));
    expect(await findPart('[role="group"]', 'Input number')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Input submission' })).toBeNull();
  });

  it('draws the inputs again on Show inputs and files, which the browser remembers', async () => {
    server.use(signedIn, ...workflowBackend(CLASSIC).handlers);
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await stepBox('run');
    await user.click(showInputs());
    expect(
      await screen.findByRole('group', { name: 'Input submission' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /inputs? of Step/ })).toBeNull();
    expect(localStorage.getItem(INPUTS_SHOWN_KEY)).toBe('shown');
  });

  it('pops out a file of the workflow a step reads as its box', async () => {
    server.use(
      signedIn,
      ...workflowBackend(
        CLASSIC.replace('${{ inputs.answer }}', '${{ workflow.answers/1.out }}'),
      ).handlers,
    );
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);

    await user.hover(
      within(await stepBox('check')).getByRole('button', {
        name: '1 input of Step check',
      }),
    );
    const given = await findPart('[role="group"]', 'Workflow file answers/1.out');
    expect(screen.getByText('expected', { selector: 'text' })).toBeInTheDocument();
    await user.click(within(given).getByRole('button'));
    expect(drawer('Workflow file')).toBeInTheDocument();
  });
});
