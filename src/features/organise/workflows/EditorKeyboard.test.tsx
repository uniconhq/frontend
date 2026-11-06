import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { openEditor, savedValues } from '@/test/workflow-editor';
import { workflowBox, filePort, workflowItem } from '@/test/workflows';

describe('the workflow editor', () => {
  // Tabbing to each control walks the whole page, so this takes a while.
  it(
    'builds two wired steps, an input and a workflow from the tray by keyboard alone',
    { timeout: 60_000 },
    async () => {
      const empty = [
        'inputs:',
        '  submission: folder',
        '  time_limit: number',
        '  memory_limit: number',
        '  input: file',
        '  answer: file',
        'steps: []',
        '',
      ].join('\n');
      const { user } = openEditor({
        draft: empty,
        handlers: [
          http.get('/api/v1/workflows', () =>
            HttpResponse.json([workflowItem({ name: 'inner' })]),
          ),
          http.get('/api/v1/workflows/:owner/:name/versions/:version/box', () =>
            HttpResponse.json(
              workflowBox({
                inputs: [filePort('source')],
                outputs: [filePort('program')],
              }),
            ),
          ),
        ],
      });

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
      const add = async (group: string, item: string, drawerName: string) => {
        await screen.findByRole('region', { name: group });
        await press(
          await within(screen.getByRole('region', { name: group })).findByRole(
            'button',
            { name: item },
          ),
        );
        // The new box's drawer takes the focus, and Escape closes it.
        const drawer = await screen.findByRole('complementary', { name: drawerName });
        expect(within(drawer).getByRole('heading', { name: drawerName })).toHaveFocus();
        await user.keyboard('{Escape}');
      };
      const wireFrom = async (port: string, step: string, source: RegExp) => {
        // A closed box opens by Enter on its head, and shows its ports.
        const box = await screen.findByRole('group', { name: `Step ${step}` });
        if (!box.hasAttribute('data-open'))
          await press(
            within(box).getByRole('button', { name: new RegExp(`^${step}`) }),
          );
        await press(
          await screen.findByRole('button', { name: `The port ${port} of ${step}` }),
        );
        await choose(`The port ${port} of ${step}`, source);
      };
      await add('Primitives', 'Run programs', 'Step exec');
      await add('Primitives', 'Compare with the answer', 'Step diff-check');
      await add('Inputs', 'Text', 'Inputs');
      await add('Workflows', 'kenny/inner@v1', 'Step inner');
      await wireFrom('source', 'exec', /^submission from the inputs/);
      await wireFrom('stdin', 'exec', /^input from the inputs/);
      await wireFrom('time_limit', 'exec', /^time_limit from the inputs/);
      await wireFrom('memory_limit', 'exec', /^memory_limit from the inputs/);
      await wireFrom('actual', 'diff-check', /^output from exec/);
      await wireFrom('expected', 'diff-check', /^answer from the inputs/);

      const saved = await savedValues(user);
      expect(saved.inputs).toMatchObject({ text: 'text' });
      expect(saved.steps).toEqual([
        {
          id: 'exec',
          use: 'unicon/exec@v4',
          with: {
            source: '${{ inputs.submission }}',
            stdin: '${{ inputs.input }}',
            time_limit: '${{ inputs.time_limit }}',
            memory_limit: '${{ inputs.memory_limit }}',
          },
        },
        {
          id: 'diff-check',
          use: 'unicon/diff-check@v2',
          with: {
            actual: '${{ steps.exec.output }}',
            expected: '${{ inputs.answer }}',
          },
        },
        { id: 'inner', use: 'kenny/inner@v1', with: {} },
      ]);
    },
  );
});
