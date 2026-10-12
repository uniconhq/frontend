import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@/test/user-event';
import { renderApp } from '@/test/render';
import { server, signedIn } from '@/test/server';
import { workflowBackend } from '@/test/workflows';
import { EDITOR_PAGE, fileText } from '@/test/workflow-editor';

describe('the workflow editor', () => {
  // Tabbing to each control walks the whole page, so this takes a while.
  it(
    'builds three wired steps from Add step by keyboard alone',
    { timeout: 60_000 },
    async () => {
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
      renderApp(EDITOR_PAGE);

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
      const choose = async (menuName: string, item: RegExp) => {
        const menu = await screen.findByRole('menu', { name: menuName });
        const found = within(menu).getByRole('menuitem', { name: item });
        for (let move = 0; move < 40 && document.activeElement !== found; move += 1)
          await user.keyboard('{ArrowDown}');
        expect(found).toHaveFocus();
        await user.keyboard('{Enter}');
      };
      const add = async (item: RegExp, id: string) => {
        await press(await screen.findByRole('button', { name: 'Add step' }));
        await choose('Add step', item);
        // The new step's drawer takes the focus, and Escape closes it.
        const drawer = await screen.findByRole('complementary', { name: `Step ${id}` });
        expect(
          within(drawer).getByRole('heading', { name: `Step ${id}` }),
        ).toHaveFocus();
        await user.keyboard('{Escape}');
      };
      const wireFrom = async (port: string, step: string, source: RegExp) => {
        await press(
          await screen.findByRole('button', { name: `The port ${port} of ${step}` }),
        );
        await choose(`The port ${port} of ${step}`, source);
      };
      await add(/^Compile/, 'compile');
      await add(/^Run program/, 'sandbox-run');
      await add(/^Compare with the answer/, 'diff-check');
      await wireFrom('source', 'compile', /^submission from the inputs/);
      await wireFrom('binary', 'sandbox-run', /^binary from compile/);
      await wireFrom('input', 'sandbox-run', /^input from each test/);
      await wireFrom('time_limit', 'sandbox-run', /^time_limit from the inputs/);
      await wireFrom('memory_limit', 'sandbox-run', /^memory_limit from the inputs/);
      await wireFrom('actual', 'diff-check', /^output from sandbox-run/);
      await wireFrom('expected', 'diff-check', /^answer from each test/);

      const text = await fileText(user);
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
    },
  );
});
