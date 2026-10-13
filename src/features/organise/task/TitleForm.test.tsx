import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@/test/user-event';
import { http } from 'msw';
import { renderApp } from '@/test/render';
import { problem, server, signedIn } from '@/test/server';
import { TASK_API, repoFiles, taskState, unchanged } from '@/test/organiser';

describe("the task's title", () => {
  it('holds the title as it was asked about while a save asks before it publishes', async () => {
    server.use(
      signedIn,
      taskState,
      ...repoFiles,
      http.put(`${TASK_API}/files/task.yaml`, () =>
        problem(409, 'confirmation_required', {
          changes: [],
          regrades: 0,
          ...unchanged,
          asked: 'b1c2d3e:12',
        }),
      ),
    );
    renderApp('/orgs/acme/contests/spring/tasks/sum/settings');

    const form = await screen.findByRole('form', { name: 'Title' });
    await userEvent.type(within(form).getByRole('textbox', { name: 'Title' }), ' too');
    await userEvent.click(within(form).getByRole('button', { name: 'Save title' }));

    expect(
      await screen.findByRole('button', { name: 'Publish the change' }),
    ).toBeVisible();
    expect(within(form).getByRole('textbox', { name: 'Title' })).toBeDisabled();
    expect(within(form).getByRole('button', { name: 'Save title' })).toBeDisabled();
  });
});
