import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { Upload } from '@/api/types';
import { renderApp } from '@/test/render';
import { problem, server, signedIn, someone } from '@/test/server';
import { TASK_API, publicationList, repoFiles, taskState } from '@/test/organiser';

const TASK = '/orgs/acme/contests/spring/tasks/sum';
const UPLOAD = '0199a2c1-6b7e-7c3a-9f10-5d2e4b8a6c99';
const DOOR = `/-/uploads/${UPLOAD}`;
/** The SHA-256 of `1 2\n`, the file the tests upload. */
const SHA256 = 'f251ddc12234e0da8d3b778bd0f7463fb477f16f47757f5617dc8b4ff4d4f14a';

const dataset = () => new File(['1 2\n'], 'train.csv', { type: 'text/csv' });

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
    writes: [] as { path: string; body: unknown }[],
  };
  const verified: Upload = {
    id: UPLOAD,
    input: '',
    filename: 'data/train.csv',
    content_type: 'text/csv',
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
    http.put(`${TASK_API}/files/:path`, async ({ params, request }) => {
      seen.writes.push({
        path: decodeURIComponent(String(params['path'])),
        body: await request.json(),
      });
      return HttpResponse.json({
        number: 3,
        version: 'abc1234def',
        grading_changed: false,
        changes: [],
      });
    }),
  ];
  return { seen, handlers };
}

async function openUpload() {
  await userEvent.click(await screen.findByRole('button', { name: 'Upload a file' }));
  return screen.getByRole('region', { name: 'Upload a file' });
}

describe("uploading a file into a task's tree", () => {
  it('sends the file through the door into the folder picked, and saves it into the task by its upload', async () => {
    const routes = uploadRoutes();
    server.use(signedIn, taskState, publicationList, ...repoFiles, ...routes.handlers);
    renderApp(TASK);

    const tree = await screen.findByRole('navigation', { name: 'Files' });
    await userEvent.click(await within(tree).findByRole('button', { name: /data\// }));
    const panel = await openUpload();
    await userEvent.upload(within(panel).getByLabelText('File to upload'), dataset());
    expect(
      within(panel).getByRole('textbox', { name: /Path in the task/ }),
    ).toHaveValue('data/train.csv');
    await userEvent.click(within(panel).getByRole('button', { name: 'Upload' }));

    const arrived = await within(panel).findByText(/has arrived/);
    expect(arrived).toHaveTextContent('data/train.csv has arrived, 4 bytes.');
    expect(within(panel).getByText(/It is not in the task yet/)).toBeVisible();
    expect(routes.seen.slots).toEqual([
      {
        path: 'data/train.csv',
        size: 4,
        sha256: SHA256,
        content_type: 'text/csv',
      },
    ]);
    expect(routes.seen.puts).toBe(1);
    expect(routes.seen.writes).toEqual([]);

    await userEvent.click(
      within(panel).getByRole('button', { name: 'Save into the task' }),
    );

    expect(await within(panel).findByText('Published as publication 3.')).toBeVisible();
    expect(routes.seen.writes).toEqual([
      {
        path: 'data/train.csv',
        body: {
          upload: UPLOAD,
          token: null,
          encoding: 'utf-8',
          confirm: false,
          keep_as_draft: false,
        },
      },
    ]);
  });

  it('sends nothing for a file the forge already holds', async () => {
    const routes = uploadRoutes({ ready: true });
    server.use(signedIn, taskState, publicationList, ...repoFiles, ...routes.handlers);
    renderApp(TASK);

    const panel = await openUpload();
    await userEvent.upload(within(panel).getByLabelText('File to upload'), dataset());
    await userEvent.click(within(panel).getByRole('button', { name: 'Upload' }));

    expect(await within(panel).findByText(/has arrived/)).toHaveTextContent(
      'train.csv has arrived',
    );
    expect(routes.seen.puts).toBe(0);
    expect(routes.seen.completes).toBe(1);
  });

  it('sends the file again from the start when the connection is cut', async () => {
    const routes = uploadRoutes({
      door: [() => HttpResponse.error(), () => new HttpResponse(null, { status: 200 })],
    });
    server.use(signedIn, taskState, publicationList, ...repoFiles, ...routes.handlers);
    renderApp(TASK);

    const panel = await openUpload();
    await userEvent.upload(within(panel).getByLabelText('File to upload'), dataset());
    await userEvent.click(within(panel).getByRole('button', { name: 'Upload' }));

    expect(await within(panel).findByText(/has arrived/)).toBeVisible();
    expect(routes.seen.puts).toBe(2);
    expect(routes.seen.slots).toHaveLength(1);
  });

  it('gives up after three cut sends and says nothing was saved', async () => {
    const routes = uploadRoutes({
      door: [() => HttpResponse.error(), () => HttpResponse.error()],
    });
    server.use(signedIn, taskState, publicationList, ...repoFiles, ...routes.handlers);
    renderApp(TASK);

    const panel = await openUpload();
    await userEvent.upload(within(panel).getByLabelText('File to upload'), dataset());
    await userEvent.click(within(panel).getByRole('button', { name: 'Upload' }));

    const alert = await within(panel).findByRole('alert');
    expect(alert).toHaveTextContent('The upload did not go through');
    expect(routes.seen.puts).toBe(3);
    expect(routes.seen.writes).toEqual([]);
  });

  it('saves over a file at the path with the token it had as the upload began', async () => {
    const routes = uploadRoutes();
    server.use(signedIn, taskState, publicationList, ...repoFiles, ...routes.handlers);
    renderApp(TASK);

    const panel = await openUpload();
    await userEvent.upload(within(panel).getByLabelText('File to upload'), dataset());
    const path = within(panel).getByRole('textbox', { name: /Path in the task/ });
    await userEvent.clear(path);
    await userEvent.type(path, 'data/testcases/1.in');
    await userEvent.click(within(panel).getByRole('button', { name: 'Upload' }));

    expect(await within(panel).findByText(/replaces the file there now/)).toBeVisible();
    await userEvent.click(
      within(panel).getByRole('button', { name: 'Save into the task' }),
    );

    await within(panel).findByText('Published as publication 3.');
    expect(routes.seen.writes).toMatchObject([
      { path: 'data/testcases/1.in', body: { upload: UPLOAD, token: 'token-1-in' } },
    ]);
  });

  it('says when someone changed the file meanwhile, and saves over it once asked', async () => {
    const routes = uploadRoutes();
    let writes = 0;
    server.use(signedIn, taskState, publicationList, ...repoFiles, ...routes.handlers);
    server.use(
      http.put(`${TASK_API}/files/:path`, async ({ request }) => {
        writes += 1;
        const body = (await request.json()) as { token: string | null };
        if (writes === 1) return problem(409, 'conflict');
        return HttpResponse.json({
          number: 4,
          version: 'def5678abc',
          grading_changed: false,
          changes: [body.token ?? 'none'],
        });
      }),
    );
    renderApp(TASK);

    const panel = await openUpload();
    await userEvent.upload(within(panel).getByLabelText('File to upload'), dataset());
    await userEvent.click(within(panel).getByRole('button', { name: 'Upload' }));
    await userEvent.click(
      await within(panel).findByRole('button', { name: 'Save into the task' }),
    );

    const alert = await within(panel).findByRole('alert');
    expect(alert).toHaveTextContent(
      'Someone else changed train.csv since the upload began.',
    );
    await userEvent.click(
      within(alert).getByRole('button', { name: 'Save over their version' }),
    );

    expect(await within(panel).findByText('Published as publication 4.')).toBeVisible();
    expect(writes).toBe(2);
  });

  it('shows a refused slot in words for the organiser', async () => {
    server.use(
      signedIn,
      taskState,
      publicationList,
      ...repoFiles,
      http.post(`${TASK_API}/organise/uploads`, () => problem(422, 'invalid_path')),
    );
    renderApp(TASK);

    const panel = await openUpload();
    await userEvent.upload(within(panel).getByLabelText('File to upload'), dataset());
    await userEvent.click(within(panel).getByRole('button', { name: 'Upload' }));

    expect(await within(panel).findByRole('alert')).toHaveTextContent(
      'That path cannot be used',
    );
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
      ...repoFiles,
    );
    renderApp(TASK);

    await screen.findByRole('navigation', { name: 'Files' });
    expect(screen.queryByRole('button', { name: 'Upload a file' })).toBeNull();
  });
});
