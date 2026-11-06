import { useState } from 'react';
import { expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import userEvent from '@/test/user-event';
import { renderWithProviders } from '@/test/render';
import { afterAnswers, server } from '@/test/server';
import { workflowBox, workflowItem } from '@/test/workflows';
import { Tray } from './Tray';

it('ignores a pending choice after closing search and editing the draft', async () => {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started = false;
  server.use(
    http.get('/api/v1/workflow-search', () =>
      HttpResponse.json({
        items: [
          workflowItem({
            owner: 'ada',
            name: 'inner',
            visibility: 'public',
            editable: false,
          }),
        ],
        next: null,
      }),
    ),
    http.get('/api/v1/workflows/ada/inner/versions/v1/box', async () => {
      started = true;
      await gate;
      return HttpResponse.json(workflowBox());
    }),
  );
  function Draft() {
    const [text, setText] = useState('before');
    return (
      <>
        <input
          aria-label="Draft"
          value={text}
          onChange={(event) => setText(event.currentTarget.value)}
        />
        <Tray
          exclude="bob/self"
          primitives={[]}
          workflows={[]}
          finding="done"
          onInput={() => undefined}
          onPrimitive={() => undefined}
          onWorkflow={() => setText('chosen')}
        />
      </>
    );
  }
  const user = userEvent.setup();
  renderWithProviders(<Draft />);
  await user.click(screen.getByRole('button', { name: 'Find a workflow' }));
  const dialog = screen.getByRole('dialog', { name: 'Find a workflow' });
  await afterAnswers(async () => {
    await user.click(
      await within(dialog).findByRole('button', { name: 'Choose ada/inner' }),
    );
    await user.click(within(dialog).getByRole('button', { name: /^Close$/ }));
    await user.clear(screen.getByRole('textbox', { name: 'Draft' }));
    await user.type(screen.getByRole('textbox', { name: 'Draft' }), 'after');
    expect(started).toBe(true);
    release();
  });
  expect(screen.getByRole('textbox', { name: 'Draft' })).toHaveValue('after');
  expect(screen.queryByRole('dialog')).toBeNull();
});
