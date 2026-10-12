import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import userEvent from '@/test/user-event';
import { renderApp } from '@/test/render';
import { server, signedIn, someone } from '@/test/server';
import { publicationList, repoFiles, taskState } from '@/test/organiser';

const SETTINGS = '/orgs/acme/contests/spring/tasks/sum/settings';

describe('every file of a task, to read (M51)', { timeout: 20_000 }, () => {
  it('lets an admin view every file the task holds, read-only', async () => {
    server.use(signedIn, taskState, publicationList, ...repoFiles);
    const user = userEvent.setup();
    renderApp(SETTINGS);

    const view = await screen.findByRole('button', { name: 'View all files' });
    await user.click(view);
    const all = await screen.findByRole('region', { name: "The task's files" });
    expect(
      await within(all).findByRole('button', { name: /statement\.md/ }),
    ).toBeVisible();
    await user.click(within(all).getByRole('button', { name: 'data/' }));
    await user.click(await within(all).findByRole('button', { name: 'testcases/' }));
    await user.click(await within(all).findByRole('button', { name: /1\.in/ }));
    expect(
      await within(all).findByLabelText('What data/testcases/1.in holds'),
    ).toHaveTextContent('1 2');
    await user.click(within(all).getByRole('button', { name: /logo\.png/ }));
    expect(
      await within(all).findByText('It is not text, so it is not shown here.'),
    ).toBeVisible();
    expect(within(all).queryByRole('textbox')).toBeNull();
    expect(
      within(all).queryByRole('button', { name: /^(Save|Upload|Remove)/ }),
    ).toBeNull();
  });

  it('offers a manager no view of every file', async () => {
    server.use(
      taskState,
      publicationList,
      ...repoFiles,
      http.get('/api/v1/me', () =>
        HttpResponse.json({
          ...someone,
          roles: [
            { names: { org: 'acme', contest: 'spring', task: 'sum' }, role: 'manager' },
          ],
        }),
      ),
    );
    renderApp(SETTINGS);

    expect(
      await screen.findByRole('region', { name: 'The settings as stored' }),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'View all files' })).toBeNull();
  });
});
