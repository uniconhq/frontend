import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@/test/user-event';
import { holding } from '@/test/may';
import { renderApp } from '@/test/render';
import { server, signedIn } from '@/test/server';
import { publicationList, publishedTask, repoFiles, taskState } from '@/test/organiser';

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

  it('offers an observer the view of every file too, as the forge lets them read it', async () => {
    server.use(
      signedIn,
      ...holding('observer', publishedTask),
      taskState,
      publicationList,
      ...repoFiles,
    );
    renderApp(SETTINGS);

    expect(await screen.findByRole('button', { name: 'View all files' })).toBeVisible();
  });
});
