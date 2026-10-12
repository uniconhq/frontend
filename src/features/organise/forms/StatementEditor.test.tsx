import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@/test/user-event';
import { http, HttpResponse } from 'msw';
import { renderApp } from '@/test/render';
import { problem, server, signedIn, someone } from '@/test/server';
import { TASK_API, publicationList, repoFiles, taskState } from '@/test/organiser';
import { comeBackToTab, fakeLiveStream, openStream, realLiveStream } from '@/test/live';

const STATEMENT = '# Sum\n\nWrite the sum of two numbers.\n';

function statementBackend(
  answer: () => Response,
  upload: { size: number; digest: string } | null = null,
) {
  const sent: { content: string; token: string }[] = [];
  server.use(
    signedIn,
    taskState,
    publicationList,
    http.get(`${TASK_API}/files/:path`, ({ params }) =>
      params['path'] === 'statement.md'
        ? HttpResponse.json({
            path: 'statement.md',
            encoding: 'utf-8',
            content: STATEMENT,
            token: 'token-statement',
            upload,
          })
        : undefined,
    ),
    http.put(`${TASK_API}/files/:path`, async ({ request }) => {
      sent.push((await request.json()) as { content: string; token: string });
      return answer();
    }),
    ...repoFiles,
  );
  return { sent };
}

describe('the statement beside its preview', { timeout: 20_000 }, () => {
  it('shows a statement that is an upload by its size and digest, never as text', async () => {
    statementBackend(() => HttpResponse.json({}), { size: 40, digest: 'c'.repeat(64) });
    renderApp('/orgs/acme/contests/spring/tasks/sum/statement');

    // The statement is a card of the task's whole page, which takes its reads first.
    const shown = await screen.findByRole(
      'region',
      { name: 'Uploaded statement.md' },
      { timeout: 5000 },
    );
    expect(within(shown).getByText('c'.repeat(64))).toBeVisible();
    expect(screen.queryByRole('textbox', { name: 'Statement source' })).toBeNull();
  });

  it('lets an admin edit the statement and shows it as contestants will', async () => {
    const { sent } = statementBackend(() =>
      HttpResponse.json({
        number: 3,
        grading_changed: false,
        changes: [],
        notes: [],
        regraded: 0,
      }),
    );
    renderApp('/orgs/acme/contests/spring/tasks/sum/statement');

    const source = await screen.findByRole('textbox', { name: 'Statement source' });
    const preview = screen.getByRole('region', { name: 'What entrants see' });
    expect(within(preview).getByRole('heading', { name: 'Sum' })).toBeVisible();

    fireEvent.change(source, { target: { value: '# Sum of two\n\nAdd **both**.\n' } });
    expect(within(preview).getByRole('heading', { name: 'Sum of two' })).toBeVisible();
    expect(within(preview).getByText('both').tagName).toBe('STRONG');
    await userEvent.click(screen.getByRole('button', { name: 'Save statement' }));

    expect(
      await screen.findByText('Saved and published as publication 3.'),
    ).toBeVisible();
    expect(sent).toEqual([
      {
        content: '# Sum of two\n\nAdd **both**.\n',
        encoding: 'utf-8',
        token: 'token-statement',
        confirm: false,
        keep_as_draft: false,
      },
    ]);
  });

  it('draws the task’s own pictures in the preview and says how to show one', async () => {
    statementBackend(() => HttpResponse.json({}));
    renderApp('/orgs/acme/contests/spring/tasks/sum/statement');

    const source = await screen.findByRole('textbox', { name: 'Statement source' });
    const preview = screen.getByRole('region', { name: 'What entrants see' });
    fireEvent.change(source, {
      target: { value: '![the tree](public/tree.png) ![afar](https://a.test/x.png)\n' },
    });
    expect(within(preview).getByRole('img', { name: 'the tree' })).toHaveAttribute(
      'src',
      '/api/v1/orgs/acme/contests/spring/tasks/sum/public/tree.png',
    );
    expect(within(preview).getByRole('link', { name: 'afar' })).toBeVisible();
    expect(
      screen.getByText(/A picture shows where the statement has a line/),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Add a picture' })).toBeVisible();
  });

  it('adds a picture into the task under a name of its own, and writes the line that shows it (M51)', async () => {
    statementBackend(() => HttpResponse.json({}));
    const saves: { path: string; content?: string | null; encoding: string }[][] = [];
    server.use(
      http.get(`${TASK_API}/tree`, ({ request }) =>
        new URL(request.url).searchParams.get('path') === 'public'
          ? HttpResponse.json([
              { path: 'public/my-diagram.png', kind: 'file', size: 9, upload: null },
            ])
          : undefined,
      ),
      http.post(`${TASK_API}/save`, async ({ request }) => {
        const body = (await request.json()) as {
          changes: { path: string; content?: string | null; encoding: string }[];
        };
        saves.push(body.changes);
        return HttpResponse.json({
          publication: 'p',
          number: 4,
          grading_changed: false,
          changes: [],
          notes: [],
          regraded: 0,
        });
      }),
    );
    const user = userEvent.setup();
    renderApp('/orgs/acme/contests/spring/tasks/sum/statement');

    const source = await screen.findByRole('textbox', { name: 'Statement source' });
    await user.click(screen.getByRole('button', { name: 'Add a picture' }));
    await user.upload(
      screen.getByLabelText('Picture'),
      new File(['PNGBYTES'], 'my diagram.png', { type: 'image/png' }),
    );

    expect(await screen.findByText(/my-diagram-2\.png is in the task/)).toBeVisible();
    expect(saves).toEqual([
      [
        {
          path: 'public/my-diagram-2.png',
          token: null,
          content: btoa('PNGBYTES'),
          encoding: 'base64',
          remove: false,
        },
      ],
    ]);
    expect(source).toHaveValue(
      '# Sum\n\nWrite the sum of two numbers.\n\n![my diagram](public/my-diagram-2.png)\n',
    );
    expect(
      within(screen.getByRole('region', { name: 'What entrants see' })).getByRole(
        'img',
        { name: 'my diagram' },
      ),
    ).toHaveAttribute(
      'src',
      '/api/v1/orgs/acme/contests/spring/tasks/sum/public/my-diagram-2.png',
    );
    expect(screen.getByRole('button', { name: 'Save statement' })).toBeEnabled();
  });

  it('shows a manager the statement read-only, with no way to save it', async () => {
    statementBackend(() => problem(403, 'admin_only', { keys: ['statement.md'] }));
    server.use(
      http.get('/api/v1/me', () =>
        HttpResponse.json({
          ...someone,
          roles: [
            { names: { org: 'acme', contest: 'spring', task: 'sum' }, role: 'manager' },
          ],
        }),
      ),
    );
    renderApp('/orgs/acme/contests/spring/tasks/sum/statement');

    expect(
      await screen.findByRole('textbox', { name: 'Statement source' }),
    ).toHaveAttribute('readonly');
    expect(
      screen.getByText('Only an admin of the task can change the statement.'),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Save statement' }),
    ).not.toBeInTheDocument();
  });
});

describe('the statement while it is being edited', { timeout: 20_000 }, () => {
  beforeEach(fakeLiveStream);
  afterEach(realLiveStream);

  const MINE = '# Sum\n\nAdd the two numbers.\n';
  const THEIRS = '# Sum\n\nWrite the sum of two numbers, each up to 10^9.\n';

  /** The statement as stored, which someone else may save over, and the reads and saves of it. */
  function sharedStatement() {
    const stored = { content: STATEMENT, token: 'token-statement' };
    const asked = { reads: 0 };
    const sent: { content: string; token: string }[] = [];
    server.use(
      signedIn,
      taskState,
      publicationList,
      http.get(`${TASK_API}/files/:path`, ({ params }) => {
        if (params['path'] !== 'statement.md') return undefined;
        asked.reads += 1;
        return HttpResponse.json({
          path: 'statement.md',
          encoding: 'utf-8',
          ...stored,
          upload: null,
        });
      }),
      http.put(`${TASK_API}/files/:path`, async ({ request }) => {
        const body = (await request.json()) as { content: string; token: string };
        sent.push(body);
        return body.token === stored.token
          ? HttpResponse.json({
              number: 3,
              grading_changed: false,
              changes: [],
              notes: [],
              regraded: 0,
            })
          : problem(409, 'conflict');
      }),
      ...repoFiles,
    );
    return { stored, asked, sent };
  }

  it('keeps the unsaved text, and does not spin, when the tab comes back', async () => {
    const { stored, asked } = sharedStatement();
    renderApp('/orgs/acme/contests/spring/tasks/sum/statement');
    const source = await screen.findByRole('textbox', { name: 'Statement source' });
    openStream();
    fireEvent.change(source, { target: { value: MINE } });

    // Someone else saves the statement while this tab is in the background.
    stored.content = THEIRS;
    stored.token = 'token-theirs';
    const before = asked.reads;
    comeBackToTab();
    // The page reads again what it shows of the statement, such as whether
    // the task has one; the editor keeps what it is editing.
    await waitFor(() => expect(asked.reads).toBeGreaterThan(before));
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(screen.getByRole('textbox', { name: 'Statement source' })).toHaveValue(MINE);
    expect(
      screen.getByRole('textbox', { name: 'Statement source' }),
    ).not.toHaveAttribute('readonly');
    const save = screen.getByRole('button', { name: 'Save statement' });
    expect(save).not.toHaveAttribute('data-loading');
    expect(save).toBeEnabled();
  });

  it('meets someone else’s save at the save, showing both versions', async () => {
    const { stored, sent } = sharedStatement();
    renderApp('/orgs/acme/contests/spring/tasks/sum/statement');
    const source = await screen.findByRole('textbox', { name: 'Statement source' });
    openStream();
    fireEvent.change(source, { target: { value: MINE } });
    stored.content = THEIRS;
    stored.token = 'token-theirs';
    comeBackToTab();

    await userEvent.click(screen.getByRole('button', { name: 'Save statement' }));

    const conflict = await screen.findByRole('alert');
    expect(conflict).toHaveTextContent(
      'Someone else changed this file since you opened it.',
    );
    expect(
      await within(conflict).findByRole('textbox', {
        name: 'Their version, as it is now',
      }),
    ).toHaveValue(THEIRS);
    expect(within(conflict).getByRole('textbox', { name: 'Your version' })).toHaveValue(
      MINE,
    );
    expect(sent).toEqual([expect.objectContaining({ token: 'token-statement' })]);
    expect(screen.getByRole('textbox', { name: 'Statement source' })).toHaveValue(MINE);

    // Saving theirs over, after the warning, sends mine with their version's token.
    await userEvent.click(
      within(conflict).getByRole('button', { name: 'Save yours over theirs' }),
    );
    const warning = await screen.findByRole('dialog', {
      name: 'Save yours over theirs?',
    });
    await userEvent.click(
      within(warning).getByRole('button', { name: 'Save yours over theirs' }),
    );
    expect(
      await screen.findByText('Saved and published as publication 3.'),
    ).toBeVisible();
    await waitFor(() =>
      expect(sent.at(-1)).toMatchObject({ content: MINE, token: 'token-theirs' }),
    );
  });

  it('goes on from their version, keeping my text beside it to copy from', async () => {
    const { stored } = sharedStatement();
    renderApp('/orgs/acme/contests/spring/tasks/sum/statement');
    const source = await screen.findByRole('textbox', { name: 'Statement source' });
    fireEvent.change(source, { target: { value: MINE } });
    stored.content = THEIRS;
    stored.token = 'token-theirs';

    await userEvent.click(screen.getByRole('button', { name: 'Save statement' }));
    const conflict = await screen.findByRole('alert');
    await within(conflict).findByRole('textbox', {
      name: 'Their version, as it is now',
    });
    await userEvent.click(
      within(conflict).getByRole('button', { name: 'Continue from theirs' }),
    );

    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Statement source' })).toHaveValue(
        THEIRS,
      ),
    );
    expect(
      screen.getByRole('textbox', { name: 'Your text from before, to copy from' }),
    ).toHaveValue(MINE);
  });
});
