import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from '@/test/render';
import { server } from '@/test/server';
import { CLASSIC, PRIMITIVES } from '@/test/workflows';
import { DrawnGraph } from './DrawnGraph';
import { layoutWorkflow } from './layout';
import { workflowOf } from './edit';
import { byRef } from './primitives';

describe('a workflow drawn', () => {
  it('stands at its actual size, never scaled, with no logo in its corner', async () => {
    const { container } = renderWithProviders(
      <DrawnGraph text={CLASSIC} primitives={PRIMITIVES} />,
    );
    await screen.findByRole('group', { name: 'Step run' });
    const layout = layoutWorkflow(workflowOf(CLASSIC), byRef(PRIMITIVES), new Map(), {
      open: new Set(),
    });

    const viewport = container.querySelector<HTMLElement>('.react-flow__viewport');
    expect(viewport?.style.transform.replaceAll(' ', '')).toBe(
      'translate(32px,32px)scale(1)',
    );
    const canvas = viewport?.closest('.react-flow')?.parentElement;
    expect(canvas?.style.width).toBe(`${String(layout.width + 64)}px`);
    expect(canvas?.style.height).toBe(`${String(layout.height + 64)}px`);
    expect(container.querySelector('.react-flow__attribution')).toBeNull();
  });

  it('says what each step does: its primitive’s title and what it does', async () => {
    renderWithProviders(<DrawnGraph text={CLASSIC} primitives={PRIMITIVES} />);

    const run = await screen.findByRole('group', { name: 'Step run' });
    expect(within(run).getByText('Run program')).toBeInTheDocument();
    expect(within(run).getByText('unicon/exec@v1')).toBeInTheDocument();
    expect(
      within(run).getByText(
        'Runs a program once under limits and records its output, time and memory.',
      ),
    ).toBeInTheDocument();
    const compile = screen.getByRole('group', { name: 'Step compile' });
    expect(within(compile).getByText('Compile')).toBeInTheDocument();
    expect(compile).not.toHaveTextContent(/once|each test/i);
  });

  it('shows a primitive without a title by its name and reference', async () => {
    const plain = PRIMITIVES.map((primitive) => ({
      ...primitive,
      title: null,
      description: null,
    }));
    renderWithProviders(<DrawnGraph text={CLASSIC} primitives={plain} />);

    const run = await screen.findByRole('group', { name: 'Step run' });
    expect(within(run).getByText('exec')).toBeInTheDocument();
    expect(within(run).getByText('unicon/exec@v1')).toBeInTheDocument();
  });

  it('marks ports in plain words, and leaves out what the author never acts on', async () => {
    renderWithProviders(
      <DrawnGraph text={CLASSIC} primitives={PRIMITIVES} selected="step:1" />,
    );

    const run = await screen.findByRole('group', { name: 'Step run' });
    const row = (port: string) => {
      const name = within(run).getAllByText(port)[0];
      const found = name?.closest<HTMLElement>('[data-side]');
      if (found === null || found === undefined) throw new Error(`no row ${port}`);
      return found;
    };
    expect(row('program')).toHaveTextContent('runs this as a program');
    expect(row('time_limit')).toHaveTextContent('sets the time limit');
    expect(row('memory_limit')).toHaveTextContent('sets the memory limit');
    expect(row('args')).toHaveTextContent('(optional)');
    expect(run).not.toHaveTextContent(/outcome|secret|batch|raises a limit/);
    const inputs = screen.getByRole('group', { name: 'Input submission' });
    expect(inputs).not.toHaveTextContent('the entrant gives it');
    expect(inputs).toHaveTextContent('Read by compile');
    const report = screen.getByRole('group', { name: 'Outputs' });
    expect(report).not.toHaveTextContent('largest over the tests');
  });

  it('says an input no step reads is used by nothing yet', async () => {
    renderWithProviders(
      <DrawnGraph
        text={'inputs:\n  seed: {type: number}\nsteps: []\n'}
        primitives={PRIMITIVES}
      />,
    );

    expect(await screen.findByRole('group', { name: 'Input seed' })).toHaveTextContent(
      'Read by nothing yet',
    );
  });

  it('draws a file of the workflow a step reads as its own box, wired to the step', async () => {
    renderWithProviders(
      <DrawnGraph
        text={
          'steps:\n  - {id: diff, use: unicon/compile@v3, with: {source: "${{ workflow.diff/ }}"}}\n'
        }
        primitives={PRIMITIVES}
      />,
    );

    const file = await screen.findByRole('group', { name: 'Workflow file diff/' });
    expect(file).toHaveTextContent('workflow file');
    expect(file).toHaveTextContent('Folder · the same on every run');
    expect(file).toHaveTextContent('Read by diff');
  });

  it('names each output by its title, by its key only where it has none (M58)', async () => {
    const titled = CLASSIC.replace(
      'time_ms: {from:',
      'time_ms: {title: Run time, from:',
    );
    renderWithProviders(
      <DrawnGraph text={titled} primitives={PRIMITIVES} selected="outputs" />,
    );

    const report = await screen.findByRole('group', { name: 'Outputs' });
    const rows = [...report.querySelectorAll<HTMLElement>('[data-side="left"]')];
    const names = rows.map(
      (row) => row.firstElementChild?.nextElementSibling?.textContent,
    );
    expect(names).toContain('Run time');
    expect(names).toContain('memory_kb');
    expect(names).toContain('log');
    expect(names).not.toContain('time_ms');
  });

  it('labels a long wire by where its value comes from, in words', async () => {
    renderWithProviders(<DrawnGraph text={CLASSIC} primitives={PRIMITIVES} />);

    await screen.findByRole('group', { name: 'Step run' });
    expect(screen.getByText('log from compile')).toBeInTheDocument();
  });

  it('opens a box when its head is clicked, with nobody else keeping the pick', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DrawnGraph text={CLASSIC} primitives={PRIMITIVES} />);

    const run = await screen.findByRole('group', { name: 'Step run' });
    const head = within(run).getByRole('button', { expanded: false });
    expect(within(run).queryByText('time_limit')).toBeNull();
    await user.click(head);

    expect(head).toHaveAttribute('aria-expanded', 'true');
    expect(within(run).getAllByText('time_limit')[0]).toBeInTheDocument();
  });

  it('says a newer version of a workflow a step uses is out', async () => {
    const text = [
      'inputs: {}',
      'steps:',
      '  - id: build',
      '    use: kenny/inner@v1',
      '    with: {}',
      'outputs: {}',
    ].join('\n');
    const boxes = new Map([
      [
        'kenny/inner@v1',
        { run: true, newer: 'v2', description: null, inputs: [], outputs: [] },
      ],
    ]);
    renderWithProviders(
      <DrawnGraph text={text} primitives={PRIMITIVES} boxes={boxes} />,
    );

    const build = await screen.findByRole('group', { name: 'Step build' });
    expect(within(build).getByText('v2 is out')).toBeInTheDocument();
  });

  it('reads the boxes of the workflows its steps use, as a version page draws them', async () => {
    server.use(
      http.get('/api/v1/workflows/kenny/inner/versions/v1/box', () =>
        HttpResponse.json({
          inputs: [
            {
              name: 'source',
              type: 'folder',
              optional: false,
              options: null,
              title: null,
              unit: null,
            },
          ],
          outputs: [],
          newer_version: null,
          description: null,
          run: true,
        }),
      ),
    );
    renderWithProviders(
      <DrawnGraph
        text={'steps:\n  - {id: build, use: kenny/inner@v1}\n'}
        primitives={PRIMITIVES}
      />,
    );

    const build = await screen.findByRole('group', { name: 'Step build' });
    expect(await within(build).findByText('workflow')).toBeInTheDocument();
    expect(within(build).getByText('needs source')).toBeInTheDocument();
    expect(
      within(build).getByRole('button', { name: 'Open build' }),
    ).toBeInTheDocument();
  });
});
