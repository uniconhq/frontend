import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@/test/user-event';
import { http, HttpResponse } from 'msw';
import type { SaveRequest, Upload } from '@/api/types';
import { renderApp } from '@/test/render';
import { problem, server, signedIn, someone } from '@/test/server';
import { TASK_API, publicationList, repoFiles, taskState } from '@/test/organiser';

/** The task's page, opened at its Statement card. */
const STATEMENT = '/orgs/acme/contests/spring/tasks/sum?card=statement';
const SETTINGS = '/orgs/acme/contests/spring/tasks/sum/settings';
const UPLOAD = '0199a2c1-6b7e-7c3a-9f10-5d2e4b8a6c99';
const DOOR = `/-/uploads/${UPLOAD}`;
/** The SHA-256 of `1 2\n`, the file the tests upload. */
const SHA256 = 'f251ddc12234e0da8d3b778bd0f7463fb477f16f47757f5617dc8b4ff4d4f14a';

const statement = () => new File(['1 2\n'], 'statement.md', { type: 'text/markdown' });

/**
 * The organiser's upload routes: a slot for any path, the door, and a
 * completion that answers verified once the forge holds the file and
 * `upload_not_ready` before. `door` answers each PUT in turn, the last one for
 * any after it; `ready` is a slot for a file the forge holds already.
 */
function uploadRoutes({
  door = [() => new HttpResponse(null, { status: 200 })],
  ready = false,
}: {
  door?: (() => Response)[];
  ready?: boolean;
} = {}) {
  let held = ready;
  const seen = {
    slots: [] as unknown[],
    puts: 0,
    completes: 0,
    saves: [] as SaveRequest[],
  };
  const verified: Upload = {
    id: UPLOAD,
    input: '',
    filename: 'statement.md',
    content_type: 'text/markdown',
    size: 4,
    sha256: SHA256,
    status: 'verified',
  };
  const handlers = [
    http.post(`${TASK_API}/organise/uploads`, async ({ request }) => {
      seen.slots.push(await request.json());
      return HttpResponse.json(
        {
          id: UPLOAD,
          url: ready ? null : DOOR,
          ready,
          expires_at: '2026-10-07T12:00:00Z',
        },
        { status: 201 },
      );
    }),
    http.put(DOOR, () => {
      const answer = door[Math.min(seen.puts, door.length - 1)];
      seen.puts += 1;
      const response = answer?.() ?? new HttpResponse(null, { status: 200 });
      if (response.ok) held = true;
      return response;
    }),
    http.post(`${TASK_API}/uploads/:upload/complete`, () => {
      seen.completes += 1;
      return held ? HttpResponse.json(verified) : problem(409, 'upload_not_ready');
    }),
    http.post(`${TASK_API}/save`, async ({ request }) => {
      seen.saves.push((await request.json()) as SaveRequest);
      return HttpResponse.json({
        number: 3,
        version: 'abc1234def',
        grading_changed: false,
        changes: [],
        notes: [],
        regraded: 0,
      });
    }),
  ];
  return { seen, handlers };
}

/** A statement that is an upload of 300 MB, as the forge serves it. */
const DIGEST = 'b'.repeat(64);
const uploadedStatement = http.get(`${TASK_API}/files/:path`, ({ params }) =>
  params['path'] === 'statement.md'
    ? HttpResponse.json({
        path: 'statement.md',
        encoding: 'utf-8',
        content: `version https://git-lfs.github.com/spec/v1\noid sha256:${DIGEST}\nsize 314572800\n`,
        token: 'token-statement',
        upload: { size: 314_572_800, digest: DIGEST },
      })
    : undefined,
);

/** The uploaded statement on its card, its Upload again opened. */
async function openUpload() {
  const shown = await screen.findByRole(
    'region',
    { name: 'Uploaded statement.md' },
    { timeout: 5000 },
  );
  await userEvent.click(within(shown).getByRole('button', { name: 'Upload again' }));
  return within(shown).getByRole('region', { name: 'Upload statement.md again' });
}

async function uploadAndSave() {
  renderApp(STATEMENT);
  const panel = await openUpload();
  await userEvent.upload(within(panel).getByLabelText('New statement.md'), statement());
  await userEvent.click(within(panel).getByRole('button', { name: 'Upload and save' }));
  return panel;
}

describe('uploading a file of a task again', { timeout: 20_000 }, () => {
  it('shows an uploaded file as its size and digest, never in an editor', async () => {
    server.use(signedIn, taskState, publicationList, uploadedStatement, ...repoFiles);
    renderApp(STATEMENT);

    const shown = await screen.findByRole(
      'region',
      { name: 'Uploaded statement.md' },
      { timeout: 5000 },
    );
    expect(shown).toHaveTextContent('300 MB');
    expect(shown).toHaveTextContent(DIGEST);
    expect(within(shown).queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Statement source' })).toBeNull();
  });

  it('uploads it again and saves it over the old one in one step, by its upload and the token it was read with', async () => {
    const routes = uploadRoutes();
    server.use(
      signedIn,
      taskState,
      publicationList,
      uploadedStatement,
      ...repoFiles,
      ...routes.handlers,
    );
    const panel = await uploadAndSave();

    expect(
      await within(panel).findByText('Saved and published as publication 3.'),
    ).toBeVisible();
    expect(panel).not.toHaveTextContent(/SHA-256|hash/i);
    expect(within(panel).queryByText(/Leaving this page loses it/)).toBeNull();
    expect(within(panel).queryByRole('textbox')).toBeNull();
    expect(routes.seen.slots).toEqual([
      {
        path: 'statement.md',
        size: 4,
        sha256: SHA256,
        content_type: 'text/markdown',
      },
    ]);
    expect(routes.seen.puts).toBe(1);
    expect(routes.seen.saves).toEqual([
      {
        changes: [
          {
            path: 'statement.md',
            upload: UPLOAD,
            token: 'token-statement',
            encoding: 'utf-8',
            remove: false,
          },
        ],
        confirm: false,
        keep_as_draft: false,
      },
    ]);
  });

  it('sends nothing for a file the forge already holds', async () => {
    const routes = uploadRoutes({ ready: true });
    server.use(
      signedIn,
      taskState,
      publicationList,
      uploadedStatement,
      ...repoFiles,
      ...routes.handlers,
    );
    const panel = await uploadAndSave();

    expect(
      await within(panel).findByText('Saved and published as publication 3.'),
    ).toBeVisible();
    expect(routes.seen.puts).toBe(0);
    expect(routes.seen.completes).toBe(1);
  });

  it('sends the file again from the start when the connection is cut', async () => {
    const routes = uploadRoutes({
      door: [() => HttpResponse.error(), () => new HttpResponse(null, { status: 200 })],
    });
    server.use(
      signedIn,
      taskState,
      publicationList,
      uploadedStatement,
      ...repoFiles,
      ...routes.handlers,
    );
    const panel = await uploadAndSave();

    expect(
      await within(panel).findByText('Saved and published as publication 3.'),
    ).toBeVisible();
    expect(routes.seen.puts).toBe(2);
    expect(routes.seen.slots).toHaveLength(1);
  });

  it('gives up after three cut sends and says nothing was saved', async () => {
    const routes = uploadRoutes({
      door: [() => HttpResponse.error(), () => HttpResponse.error()],
    });
    server.use(
      signedIn,
      taskState,
      publicationList,
      uploadedStatement,
      ...repoFiles,
      ...routes.handlers,
    );
    const panel = await uploadAndSave();

    const alert = await within(panel).findByRole('alert');
    expect(alert).toHaveTextContent('The upload did not go through');
    expect(routes.seen.puts).toBe(3);
    expect(routes.seen.saves).toEqual([]);
  });

  /**
   * The upload door and a save refused the first time as a conflict, someone
   * else, alice, having saved a statement of their own meanwhile.
   */
  function theirsSavedFirst() {
    const routes = uploadRoutes();
    const saves: SaveRequest[] = [];
    server.use(signedIn, taskState, publicationList, ...repoFiles, ...routes.handlers);
    server.use(
      http.post(`${TASK_API}/save`, async ({ request }) => {
        saves.push((await request.json()) as SaveRequest);
        if (saves.length === 1) return problem(409, 'conflict');
        return HttpResponse.json({
          number: 4,
          version: 'def5678abc',
          grading_changed: false,
          changes: [],
          notes: [],
          regraded: 0,
        });
      }),
      http.get(`${TASK_API}/files/:path`, ({ params }) =>
        params['path'] === 'statement.md' && saves.length > 0
          ? HttpResponse.json({
              path: 'statement.md',
              encoding: 'utf-8',
              content: 'pointer',
              token: 'token-theirs',
              upload: { size: 2048, digest: 'c'.repeat(64) },
            })
          : undefined,
      ),
      uploadedStatement,
      http.get(`${TASK_API}/history`, () =>
        HttpResponse.json([
          {
            version: 'theirs1',
            at: '2026-10-11T14:02:00Z',
            author: 'alice',
            author_id: 3,
            message: 'Upload statement.md',
          },
        ]),
      ),
    );
    return saves;
  }

  it('shows whose the file is when someone saved it meanwhile, and saves over it after a warning', async () => {
    const saves = theirsSavedFirst();
    const panel = await uploadAndSave();

    const files = await within(panel).findByRole('list', { name: 'Files that differ' });
    const row = within(files).getByRole('radiogroup', { name: 'statement.md' });
    expect(row).toHaveTextContent('Yours: Your upload, 4 bytes');
    expect(
      await within(row).findByText(/^Now: 2 KB, saved by alice on /),
    ).toBeVisible();
    await userEvent.click(
      within(panel).getByRole('button', { name: 'Save mine over theirs' }),
    );
    const warning = await screen.findByRole('dialog', {
      name: 'Save yours over theirs?',
    });
    expect(warning).toHaveTextContent(
      'This throws away what the other person saved in statement.md.',
    );
    await userEvent.click(
      within(warning).getByRole('button', { name: 'Save mine over theirs' }),
    );

    expect(
      await within(panel).findByText('Saved and published as publication 4.'),
    ).toBeVisible();
    expect(saves[1]?.changes).toMatchObject([
      { path: 'statement.md', upload: UPLOAD, token: 'token-theirs' },
    ]);
  });

  it('keeps their file when theirs is chosen, saying the upload is lost on leaving until discarded', async () => {
    const saves = theirsSavedFirst();
    const panel = await uploadAndSave();

    await within(panel).findByRole('list', { name: 'Files that differ' });
    expect(within(panel).getByText(/Leaving this page loses it/)).toBeVisible();
    await userEvent.click(
      within(panel).getByRole('button', { name: 'Save the merged version' }),
    );

    await waitFor(() =>
      expect(
        within(panel).queryByRole('list', { name: 'Files that differ' }),
      ).toBeNull(),
    );
    expect(saves).toHaveLength(1);
    await userEvent.click(within(panel).getByRole('button', { name: 'Discard it' }));
    expect(within(panel).queryByText(/Leaving this page loses it/)).toBeNull();
  });

  it('holds an upload a running contest asks to confirm, saying leaving loses it, and saves it once confirmed', async () => {
    const routes = uploadRoutes();
    server.use(
      signedIn,
      taskState,
      publicationList,
      uploadedStatement,
      ...repoFiles,
      ...routes.handlers,
    );
    server.use(
      http.post(`${TASK_API}/save`, async ({ request }) => {
        const body = (await request.json()) as SaveRequest;
        routes.seen.saves.push(body);
        if (!body.confirm)
          return problem(409, 'confirmation_required', { changes: ['the statement'] });
        return HttpResponse.json({
          number: 5,
          version: 'abc1234def',
          grading_changed: true,
          changes: ['the statement'],
          notes: [],
          regraded: 0,
        });
      }),
    );
    const panel = await uploadAndSave();

    const unsaved = await within(panel).findByText(
      /has been uploaded but is not saved into the task\. Leaving this page loses it\./,
      {},
      // Reading a file to send it takes a while beside a full run of the suite.
      { timeout: 5000 },
    );
    expect(unsaved).toHaveTextContent('statement.md, 4 bytes,');
    expect(
      within(panel).getByRole('button', { name: 'Upload and save' }),
    ).toBeDisabled();
    await userEvent.click(
      await within(panel).findByRole('button', { name: 'Publish the change' }),
    );

    expect(
      await within(panel).findByText('Saved and published as publication 5.'),
    ).toBeVisible();
    expect(within(panel).queryByText(/Leaving this page loses it/)).toBeNull();
    expect(routes.seen.saves).toHaveLength(2);
    expect(routes.seen.saves[1]).toEqual({
      changes: [
        {
          path: 'statement.md',
          upload: UPLOAD,
          token: 'token-statement',
          encoding: 'utf-8',
          remove: false,
        },
      ],
      confirm: true,
      keep_as_draft: false,
    });
  });

  it('shows a refused slot in words for the organiser', async () => {
    server.use(
      signedIn,
      taskState,
      publicationList,
      uploadedStatement,
      ...repoFiles,
      http.post(`${TASK_API}/organise/uploads`, () => problem(422, 'invalid_path')),
    );
    const panel = await uploadAndSave();

    expect(await within(panel).findByRole('alert')).toHaveTextContent(
      'That path cannot be used',
    );
  });

  it('tells an uploaded file from a typed one among every file of the task', async () => {
    server.use(
      signedIn,
      taskState,
      publicationList,
      http.get(`${TASK_API}/tree`, ({ request }) =>
        new URL(request.url).searchParams.get('path') === ''
          ? HttpResponse.json([
              { path: 'task.yaml', kind: 'file', size: 120, upload: null },
              { path: 'notes.md', kind: 'file', size: 12, upload: null },
              {
                path: 'train.csv',
                kind: 'file',
                size: 130,
                upload: { size: 314_572_800, digest: DIGEST },
              },
            ])
          : undefined,
      ),
      ...repoFiles,
    );
    const user = userEvent.setup();
    renderApp(SETTINGS);

    await user.click(await screen.findByRole('button', { name: 'View all files' }));
    const all = await screen.findByRole('region', { name: "The task's files" });
    const train = await within(all).findByRole('button', { name: /^train\.csv/ });
    expect(train).toHaveTextContent('train.csv 300 MB');
    expect(within(all).getByRole('button', { name: /^notes\.md/ })).toHaveTextContent(
      'notes.md 12 bytes',
    );
    await user.click(train);
    expect(
      await within(all).findByText(
        'It was uploaded, so it is kept by its size and not shown here.',
      ),
    ).toBeVisible();
  });

  it('offers an observer no upload', async () => {
    server.use(
      http.get('/api/v1/me', () =>
        HttpResponse.json({
          ...someone,
          roles: [
            {
              names: { org: 'acme', contest: 'spring', task: 'sum' },
              role: 'observer',
            },
          ],
        }),
      ),
      taskState,
      publicationList,
      uploadedStatement,
      ...repoFiles,
    );
    renderApp(STATEMENT);

    const shown = await screen.findByRole(
      'region',
      { name: 'Uploaded statement.md' },
      { timeout: 5000 },
    );
    expect(within(shown).queryByRole('button', { name: 'Upload again' })).toBeNull();
  });
});
