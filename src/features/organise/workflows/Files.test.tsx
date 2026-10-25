import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import userEvent from '@/test/user-event';
import { renderApp } from '@/test/render';
import { problem, server, signedIn } from '@/test/server';
import { CLASSIC, WORKFLOW_API, workflowBackend } from '@/test/workflows';
import { EDITOR_PAGE, barButton, findDialog } from '@/test/workflow-editor';

describe('the workflow files', () => {
  it('uploads a file, saves it with the draft and publishes that repository revision', async () => {
    const backend = workflowBackend(CLASSIC);
    const sent: unknown[] = [];
    let published: unknown;
    server.use(signedIn, ...backend.handlers);
    server.use(
      http.get(`${WORKFLOW_API}/tree`, () => HttpResponse.json([])),
      http.get(`${WORKFLOW_API}/files/*`, () => problem(404, 'not_found')),
      http.post(`${WORKFLOW_API}/uploads`, async ({ request }) => {
        sent.push(await request.json());
        return HttpResponse.json({
          id: 'upload-1',
          url: '/-/uploads/upload-1',
          ready: false,
          expires_at: '2026-10-27T12:00:00Z',
        });
      }),
      http.put('/-/uploads/upload-1', () => new HttpResponse(null)),
      http.post(`${WORKFLOW_API}/uploads/upload-1/complete`, () =>
        HttpResponse.json({ status: 'verified' }),
      ),
      http.put(`${WORKFLOW_API}/draft`, async ({ request }) => {
        sent.push(await request.json());
        return HttpResponse.json({
          content: CLASSIC,
          token: 'saved',
          revision: 'files-commit',
        });
      }),
      http.post(`${WORKFLOW_API}/versions`, async ({ request }) => {
        published = await request.json();
        return HttpResponse.json({ version: 'v1' });
      }),
    );
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);
    const files = await screen.findByRole('region', { name: 'Files' });
    await user.type(within(files).getByRole('textbox', { name: 'Folder' }), 'scorer');
    await user.upload(
      within(files).getByLabelText('Add files'),
      new File(['print(42)\n'], 'main.py'),
    );
    await user.click(within(files).getByRole('button', { name: 'Upload files' }));
    await within(files).findByText('scorer/main.py: uploaded, waiting for Save');
    await user.click(barButton('Publish version'));
    expect(
      within(await findDialog('Publish v1')).getByRole('button', {
        name: 'Publish v1',
      }),
    ).toBeDisabled();
    await user.click(
      within(await findDialog('Publish v1')).getByRole('button', { name: 'Cancel' }),
    );
    await user.click(barButton('Save'));
    await waitFor(() => expect(barButton('Save')).toBeDisabled());
    expect(sent).toEqual([
      expect.objectContaining({
        path: 'scorer/main.py',
        size: 10,
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/) as string,
      }),
      {
        content: CLASSIC,
        token: 'token-1',
        changes: [
          {
            path: 'scorer/main.py',
            token: null,
            upload: 'upload-1',
            encoding: 'utf-8',
            remove: false,
          },
        ],
      },
    ]);
    await user.click(barButton('Publish version'));
    await user.click(
      within(await findDialog('Publish v1')).getByRole('button', {
        name: 'Publish v1',
      }),
    );
    await waitFor(() =>
      expect(published).toEqual({
        version: 'v1',
        token: 'saved',
        revision: 'files-commit',
      }),
    );
  });
  it('removes a saved file with its token, and lets the removal be undone', async () => {
    const backend = workflowBackend(CLASSIC);
    server.use(signedIn, ...backend.handlers);
    server.use(
      http.get(`${WORKFLOW_API}/tree`, () =>
        HttpResponse.json([
          {
            path: 'score.py',
            kind: 'file',
            token: 'old-file',
            size: 3,
            upload: null,
            version: 'old',
            start: null,
          },
        ]),
      ),
      http.get(`${WORKFLOW_API}/files/score.py`, () =>
        HttpResponse.json({
          path: 'score.py',
          content: 'old',
          encoding: 'utf-8',
          token: 'old-file',
          upload: null,
          version: 'old',
        }),
      ),
    );
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);
    const files = await screen.findByRole('region', { name: 'Files' });
    await user.click(await within(files).findByRole('button', { name: /^score.py/ }));
    await user.click(within(files).getByRole('button', { name: 'Remove score.py' }));
    expect(within(files).getByText('score.py: removed on Save')).toBeInTheDocument();
    await user.click(within(files).getByRole('button', { name: 'Undo score.py' }));
    expect(barButton('Save')).toBeDisabled();
    await user.click(within(files).getByRole('button', { name: 'Remove score.py' }));
    await user.click(barButton('Save'));
    await waitFor(() => expect(backend.state.saves).toHaveLength(1));
    expect(backend.state.saves[0]).toEqual({
      content: CLASSIC,
      token: 'token-1',
      changes: [
        { path: 'score.py', token: 'old-file', encoding: 'utf-8', remove: true },
      ],
    });
  });

  it('replaces a saved file with its read token and keeps the upload after a conflict', async () => {
    const backend = workflowBackend(CLASSIC);
    let sent: unknown;
    server.use(signedIn, ...backend.handlers);
    server.use(
      http.get(`${WORKFLOW_API}/tree`, () =>
        HttpResponse.json([
          {
            path: 'score.py',
            kind: 'file',
            token: 'old-file',
            size: 3,
            upload: null,
            version: 'old',
            start: null,
          },
        ]),
      ),
      http.get(`${WORKFLOW_API}/files/score.py`, () =>
        HttpResponse.json({
          path: 'score.py',
          content: 'old',
          encoding: 'utf-8',
          token: 'old-file',
          upload: null,
          version: 'old',
        }),
      ),
      http.post(`${WORKFLOW_API}/uploads`, () =>
        HttpResponse.json({
          id: 'replacement',
          url: null,
          ready: true,
          expires_at: '2026-10-27T12:00:00Z',
        }),
      ),
      http.post(`${WORKFLOW_API}/uploads/replacement/complete`, () =>
        HttpResponse.json({ status: 'verified' }),
      ),
      http.put(`${WORKFLOW_API}/draft`, async ({ request }) => {
        sent = await request.json();
        return problem(409, 'conflict', {
          detail: 'The workflow has changed. Reload it.',
        });
      }),
    );
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);
    const files = await screen.findByRole('region', { name: 'Files' });
    await user.click(await within(files).findByRole('button', { name: /^score.py/ }));
    await user.upload(
      within(files).getByLabelText('Replace score.py'),
      new File(['new'], 'new.py'),
    );
    await within(files).findByText('score.py: uploaded, waiting for Save');
    await user.click(barButton('Save'));
    await screen.findByText('The workflow has changed. Reload it.');
    expect(sent).toEqual({
      content: CLASSIC,
      token: 'token-1',
      changes: [
        {
          path: 'score.py',
          token: 'old-file',
          encoding: 'utf-8',
          remove: false,
          upload: 'replacement',
        },
      ],
    });
    expect(
      within(files).getByText('score.py: uploaded, waiting for Save'),
    ).toBeInTheDocument();
    expect(barButton('Save')).toBeEnabled();
  });
});
