import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@/test/user-event';
import { renderApp } from '@/test/render';
import { server, signedIn } from '@/test/server';
import { workflowBackend } from '@/test/workflows';
import { EDITOR_PAGE, previewNow } from '@/test/workflow-editor';

describe('the workflow editor', () => {
  // Tabbing to each control walks the whole page, so this takes a while.
  it(
    'builds three wired steps from the palette by keyboard alone',
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
    },
  );
});
