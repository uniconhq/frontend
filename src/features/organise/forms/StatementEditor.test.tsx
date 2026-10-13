import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@/test/user-event';
import { http, HttpResponse } from 'msw';
import { renderApp } from '@/test/render';
import { problem, server, signedIn, someone } from '@/test/server';
import {
  TASK_API,
  publicationList,
  publishedTask,
  repoFiles,
  taskState,
  unchanged,
} from '@/test/organiser';
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
            version: '3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d',
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
    const shown = await screen.findByRole('region', { name: 'Uploaded statement.md' });
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
        effect: unchanged,
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

  describe('its pictures (M51)', () => {
    type Change = {
      path: string;
      token: string | null;
      content?: string | null;
      encoding: string;
      remove: boolean;
    };
    type Save = { changes: Change[]; confirm: boolean; keep_as_draft: boolean };

    // jsdom makes no address for a file's bytes; each picture gets one of its own.
    const made = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
    const revoked = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
    beforeEach(() => {
      let made = 0;
      URL.createObjectURL = () => {
        made += 1;
        return `blob:picture-${String(made)}`;
      };
      URL.revokeObjectURL = () => undefined;
    });
    afterEach(() => {
      for (const [name, was] of [
        ['createObjectURL', made],
        ['revokeObjectURL', revoked],
      ] as const) {
        if (was === undefined) Reflect.deleteProperty(URL, name);
        else Object.defineProperty(URL, name, was);
      }
    });

    /**
     * The statement, its pictures under `public/` (`my-diagram.png` and
     * `old.png`, each read with its token, beside a `.gitkeep`) and the task's save, kept in
     * `saves`, answered by `answer` in turn.
     */
    function picturesBackend(answers: (() => Response)[] = []) {
      const { sent } = statementBackend(() => HttpResponse.json({}));
      const saves: Save[] = [];
      const pictures = ['public/my-diagram.png', 'public/old.png'];
      server.use(
        http.get(`${TASK_API}/tree`, ({ request }) =>
          new URL(request.url).searchParams.get('path') === 'public'
            ? HttpResponse.json(
                // The empty file a task made before kept the folder with (M60).
                [...pictures, 'public/.gitkeep'].map((path) => ({
                  path,
                  kind: 'file',
                  size: path.endsWith('.gitkeep') ? 0 : 9,
                  upload: null,
                })),
              )
            : undefined,
        ),
        http.get(`${TASK_API}/files/:path`, ({ params }) => {
          const path = decodeURIComponent(String(params['path']));
          return pictures.includes(path)
            ? HttpResponse.json({
                path,
                encoding: 'utf-8',
                content: 'x',
                token: `token-${path}`,
                upload: null,
                version: null,
              })
            : undefined;
        }),
        http.post(`${TASK_API}/save`, async ({ request }) => {
          saves.push((await request.json()) as Save);
          const answer = answers[saves.length - 1];
          return answer !== undefined
            ? answer()
            : HttpResponse.json({
                publication: 'p',
                number: 4,
                grading_changed: false,
                changes: [],
                notes: [],
                regraded: 0,
                effect: unchanged,
              });
        }),
      );
      return { sent, saves };
    }

    async function addPicture(user: ReturnType<typeof userEvent.setup>, file: File) {
      await user.click(screen.getByRole('button', { name: 'Add a picture' }));
      await user.upload(screen.getByLabelText('Picture'), file);
    }

    it('stages a picture under a name of its own, draws it from its own bytes, and saves it with the statement in one save', async () => {
      const { sent, saves } = picturesBackend();
      const user = userEvent.setup();
      renderApp('/orgs/acme/contests/spring/tasks/sum/statement');
      const source = await screen.findByRole('textbox', { name: 'Statement source' });
      await screen.findByRole('list', { name: 'Pictures' });

      await addPicture(
        user,
        new File(['PNGBYTES'], 'my diagram.png', { type: 'image/png' }),
      );

      // Nothing is saved until the statement is.
      expect(saves).toEqual([]);
      expect(source).toHaveValue(
        '# Sum\n\nWrite the sum of two numbers.\n\n![my diagram](public/my-diagram-2.png)\n',
      );
      expect(
        within(screen.getByRole('region', { name: 'What entrants see' })).getByRole(
          'img',
          { name: 'my diagram' },
        ),
      ).toHaveAttribute('src', 'blob:picture-1');
      const listed = screen.getByRole('list', { name: 'Pictures' });
      const added = within(listed).getByRole('listitem', { name: 'my-diagram-2.png' });
      expect(within(added).getByText('New')).toBeVisible();

      await user.click(screen.getByRole('button', { name: 'Save statement' }));

      expect(
        await screen.findByText('Saved and published as publication 4.'),
      ).toBeVisible();
      expect(sent).toEqual([]);
      expect(saves).toEqual([
        {
          changes: [
            {
              path: 'statement.md',
              token: 'token-statement',
              content:
                '# Sum\n\nWrite the sum of two numbers.\n\n![my diagram](public/my-diagram-2.png)\n',
              encoding: 'utf-8',
              remove: false,
            },
            {
              path: 'public/my-diagram-2.png',
              token: null,
              content: btoa('PNGBYTES'),
              encoding: 'base64',
              remove: false,
            },
          ],
          confirm: false,
          keep_as_draft: false,
        },
      ]);
    });

    it('answers a save with pictures as any save of the task, a confirmation it asks for included', async () => {
      const { saves } = picturesBackend([
        () =>
          problem(409, 'confirmation_required', {
            changes: [],
            regrades: 0,
            ...unchanged,
            reading: [
              'The statement changes.',
              'The pictures and files beside the statement change.',
            ],
          }),
      ]);
      const user = userEvent.setup();
      renderApp('/orgs/acme/contests/spring/tasks/sum/statement');
      await screen.findByRole('textbox', { name: 'Statement source' });
      await screen.findByRole('list', { name: 'Pictures' });

      await addPicture(user, new File(['GIF89a'], 'tree.gif', { type: 'image/gif' }));
      await user.click(screen.getByRole('button', { name: 'Save statement' }));

      const asked = await screen.findByRole('alert');
      expect(asked).toHaveTextContent(
        'What entrants readThe statement changes.The pictures and files beside the statement change.',
      );
      await user.click(within(asked).getByRole('button', { name: /Publish/ }));

      expect(
        await screen.findByText('Saved and published as publication 4.'),
      ).toBeVisible();
      expect(saves.map((save) => save.confirm)).toEqual([false, true]);
      expect(saves[1]?.changes.map((change) => change.path)).toEqual([
        'statement.md',
        'public/tree.gif',
      ]);
    });

    it('refuses in words a file that is not a picture the page can show, or is larger than 10 MB', async () => {
      const { saves } = picturesBackend();
      // A file dropped on the box is not held to what its picker offers.
      const user = userEvent.setup({ applyAccept: false });
      renderApp('/orgs/acme/contests/spring/tasks/sum/statement');
      const source = await screen.findByRole('textbox', { name: 'Statement source' });
      await screen.findByRole('list', { name: 'Pictures' });

      await addPicture(
        user,
        new File(['%PDF'], 'notes.pdf', { type: 'application/pdf' }),
      );
      expect(
        await screen.findByText(
          'notes.pdf is not a picture this page can show. Choose a PNG, JPEG, GIF, WebP, AVIF, APNG, BMP, ICO or SVG file.',
        ),
      ).toBeVisible();

      const big = new File(['x'], 'huge.png', { type: 'image/png' });
      Object.defineProperty(big, 'size', { value: 10 * 1024 * 1024 + 1 });
      await user.upload(screen.getByLabelText('Picture'), big);
      expect(
        await screen.findByText(
          'huge.png is larger than 10 MB, the most a picture may be. Make it smaller first.',
        ),
      ).toBeVisible();

      expect(source).toHaveValue(STATEMENT);
      expect(screen.getByRole('button', { name: 'Save statement' })).toBeDisabled();
      expect(saves).toEqual([]);
    });

    it('lists the pictures, says which the statement does not show, and takes one out with the statement’s save', async () => {
      const { saves } = picturesBackend();
      const user = userEvent.setup();
      renderApp('/orgs/acme/contests/spring/tasks/sum/statement');
      const source = await screen.findByRole('textbox', { name: 'Statement source' });
      fireEvent.change(source, {
        target: { value: `${STATEMENT}\n![diagram](public/my-diagram.png)\n` },
      });

      const listed = await screen.findByRole('list', { name: 'Pictures' });
      const shown = within(listed).getByRole('listitem', { name: 'my-diagram.png' });
      const old = within(listed).getByRole('listitem', { name: 'old.png' });
      expect(shown).not.toHaveTextContent('Not shown');
      expect(old).toHaveTextContent('Not shown in the statement.');
      // A file whose name starts with a dot is no picture (M60).
      expect(within(listed).getAllByRole('listitem')).toHaveLength(2);
      expect(listed).not.toHaveTextContent('.gitkeep');

      await user.click(within(old).getByRole('button', { name: 'Remove old.png' }));
      expect(within(old).getByText('To be removed')).toBeVisible();
      await user.click(screen.getByRole('button', { name: 'Save statement' }));

      expect(
        await screen.findByText('Saved and published as publication 4.'),
      ).toBeVisible();
      expect(saves[0]?.changes).toEqual([
        {
          path: 'statement.md',
          token: 'token-statement',
          content: `${STATEMENT}\n![diagram](public/my-diagram.png)\n`,
          encoding: 'utf-8',
          remove: false,
        },
        {
          path: 'public/old.png',
          token: 'token-public/old.png',
          remove: true,
          encoding: 'utf-8',
        },
      ]);
    });

    it('takes a staged picture back out, with its line, on Undo', async () => {
      const { saves } = picturesBackend();
      const user = userEvent.setup();
      renderApp('/orgs/acme/contests/spring/tasks/sum/statement');
      const source = await screen.findByRole('textbox', { name: 'Statement source' });
      await screen.findByRole('list', { name: 'Pictures' });

      await addPicture(user, new File(['PNG'], 'tree.png', { type: 'image/png' }));
      const listed = screen.getByRole('list', { name: 'Pictures' });
      await user.click(
        within(within(listed).getByRole('listitem', { name: 'tree.png' })).getByRole(
          'button',
          { name: 'Undo tree.png' },
        ),
      );

      expect(within(listed).queryByRole('listitem', { name: 'tree.png' })).toBeNull();
      expect(source).toHaveValue(STATEMENT);
      expect(screen.getByRole('button', { name: 'Save statement' })).toBeDisabled();
      expect(saves).toEqual([]);
    });
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
    const asked = { reads: 0, states: 0 };
    const sent: { content: string; token: string }[] = [];
    server.use(
      signedIn,
      http.get(TASK_API, () => {
        asked.states += 1;
        return HttpResponse.json(publishedTask);
      }),
      publicationList,
      http.get(`${TASK_API}/files/:path`, ({ params }) => {
        if (params['path'] !== 'statement.md') return undefined;
        asked.reads += 1;
        return HttpResponse.json({
          path: 'statement.md',
          encoding: 'utf-8',
          ...stored,
          upload: null,
          version: '3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d',
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
              effect: unchanged,
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
    const before = { ...asked };
    comeBackToTab();
    // The page reads again what it shows of the task, such as whether its
    // statement is written (M57), in the same refetch that would read the
    // file again; the editor keeps what it is editing, the file unread.
    await waitFor(() => expect(asked.states).toBeGreaterThan(before.states));

    expect(asked.reads).toBe(before.reads);
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
    // The statement is named as the statement, never as a file (M13).
    expect(conflict).toHaveTextContent(
      'Someone else changed the statement since you opened it.',
    );
    expect(conflict).not.toHaveTextContent(/file|statement\.md/);
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
    expect(warning).toHaveTextContent(
      'Their change to the statement is thrown away, and yours is saved in its place.',
    );
    expect(warning).not.toHaveTextContent(/file|statement\.md/);
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

  it('asks again about a confirmed save someone else’s beat, once it goes over theirs (#449)', async () => {
    const { stored } = sharedStatement();
    const sends: { token: string; confirm: boolean; asked?: string | null }[] = [];
    server.use(
      http.put(`${TASK_API}/files/:path`, async ({ request }) => {
        const body = (await request.clone().json()) as (typeof sends)[number];
        sends.push(body);
        if (body.token !== stored.token) return problem(409, 'conflict');
        if (body.confirm) return undefined;
        const asked = `${stored.token}:2`;
        // Someone else saves while the question is shown.
        stored.content = THEIRS;
        stored.token = 'token-theirs';
        return problem(409, 'confirmation_required', {
          changes: [],
          regrades: 0,
          ...unchanged,
          reading: ['The statement changes.'],
          asked,
        });
      }),
    );
    const user = userEvent.setup();
    renderApp('/orgs/acme/contests/spring/tasks/sum/statement');
    const source = await screen.findByRole('textbox', { name: 'Statement source' });
    fireEvent.change(source, { target: { value: MINE } });

    await user.click(screen.getByRole('button', { name: 'Save statement' }));
    await user.click(
      await within(await screen.findByRole('alert')).findByRole('button', {
        name: 'Publish the change',
      }),
    );
    const conflict = await screen.findByRole('alert');
    await within(conflict).findByRole('textbox', {
      name: 'Their version, as it is now',
    });
    await user.click(
      within(conflict).getByRole('button', { name: 'Save yours over theirs' }),
    );
    await user.click(
      within(
        await screen.findByRole('dialog', { name: 'Save yours over theirs?' }),
      ).getByRole('button', { name: 'Save yours over theirs' }),
    );

    expect(
      await within(await screen.findByRole('alert')).findByRole('button', {
        name: 'Publish the change',
      }),
    ).toBeVisible();
    expect(sends).toMatchObject([
      { token: 'token-statement', confirm: false },
      { token: 'token-statement', confirm: true, asked: 'token-statement:2' },
      { token: 'token-theirs', confirm: false },
    ]);
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
