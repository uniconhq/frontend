import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { CLASSIC_V2, PRIMITIVES } from '@/test/workflows';
import { DrawnGraph } from './DrawnGraph';
import { layoutWorkflow } from './layout';
import { workflowOf } from './edit';
import { byRef } from './primitives';

describe('a workflow drawn', () => {
  it('stands at its actual size, never scaled, with no logo in its corner', async () => {
    const { container } = renderWithProviders(
      <DrawnGraph text={CLASSIC_V2} primitives={PRIMITIVES} />,
    );
    await screen.findByRole('group', { name: 'Step run' });
    const layout = layoutWorkflow(workflowOf(CLASSIC_V2), byRef(PRIMITIVES));

    const viewport = container.querySelector<HTMLElement>('.react-flow__viewport');
    expect(viewport?.style.transform.replaceAll(' ', '')).toBe(
      'translate(32px,32px)scale(1)',
    );
    const canvas = viewport?.closest('.react-flow')?.parentElement;
    expect(canvas?.style.width).toBe(`${String(layout.width + 64)}px`);
    expect(canvas?.style.height).toBe(`${String(layout.height + 64)}px`);
    expect(container.querySelector('.react-flow__attribution')).toBeNull();
  });

  it('says what each step does: its primitive’s title, what it does and how often it runs', async () => {
    renderWithProviders(<DrawnGraph text={CLASSIC_V2} primitives={PRIMITIVES} />);

    const run = await screen.findByRole('group', { name: 'Step run' });
    expect(within(run).getByText('Run program')).toBeInTheDocument();
    expect(within(run).getByText('unicon/sandbox-run@v2')).toBeInTheDocument();
    expect(within(run).queryByText('For each test')).not.toBeInTheDocument();
    expect(
      within(run).getByText(
        "Runs a program on each test's input and records its output, time and memory.",
      ),
    ).toBeInTheDocument();
    const compile = screen.getByRole('group', { name: 'Step compile' });
    expect(within(compile).getByText('Compile')).toBeInTheDocument();
    expect(within(compile).getByText('Once')).toBeInTheDocument();
    // The band behind what runs for each test says what it is (M55).
    expect(screen.getByText('Runs once for each test')).toBeInTheDocument();
  });

  it('shows a primitive without a title by its name and reference', async () => {
    const plain = PRIMITIVES.map((primitive) => ({
      ...primitive,
      title: null,
      description: null,
    }));
    renderWithProviders(<DrawnGraph text={CLASSIC_V2} primitives={plain} />);

    const run = await screen.findByRole('group', { name: 'Step run' });
    expect(within(run).getByText('sandbox-run')).toBeInTheDocument();
    expect(within(run).getByText('unicon/sandbox-run@v2')).toBeInTheDocument();
  });

  it('marks ports in plain words, and leaves out what the author never acts on', async () => {
    renderWithProviders(<DrawnGraph text={CLASSIC_V2} primitives={PRIMITIVES} />);

    const run = await screen.findByRole('group', { name: 'Step run' });
    const row = (port: string) => {
      const name = within(run).getAllByText(port)[0];
      const found = name?.closest<HTMLElement>('[data-side]');
      if (found === null || found === undefined) throw new Error(`no row ${port}`);
      return found;
    };
    expect(row('binary')).toHaveTextContent('runs this as a program');
    expect(row('time_limit')).toHaveTextContent('sets the time limit');
    expect(row('memory_limit')).toHaveTextContent('sets the memory limit');
    expect(row('args')).toHaveTextContent('(optional)');
    expect(run).not.toHaveTextContent(/outcome|secret|batch|raises a limit/);
    const inputs = screen
      .getAllByRole('group', { name: 'Inputs' })
      .find((box) => within(box).queryByText('submission') !== null);
    expect(inputs).not.toHaveTextContent('the entrant gives it');
    expect(inputs).toHaveTextContent('Used by compile');
    const report = screen.getByRole('group', { name: 'Outputs' });
    expect(report).not.toHaveTextContent('largest over the tests');
    expect(screen.getAllByRole('group', { name: 'Each test’s files' }).length).toBe(2);
  });

  it('names each report entry by its title, by its key only where it has none (M58)', async () => {
    const titled = CLASSIC_V2.replace(
      'time_ms: {from:',
      'time_ms: {title: Run time, unit: ms, from:',
    );
    renderWithProviders(<DrawnGraph text={titled} primitives={PRIMITIVES} />);

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
    renderWithProviders(<DrawnGraph text={CLASSIC_V2} primitives={PRIMITIVES} />);

    await screen.findByRole('group', { name: 'Step run' });
    expect(screen.getByText('compile_log from compile')).toBeInTheDocument();
  });
});
