import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import userEvent from '@/test/user-event';
import { renderApp } from '@/test/render';
import { problem, server, signedIn } from '@/test/server';
import { CLASSIC, WORKFLOW_API, workflowBackend } from '@/test/workflows';
import { EDITOR_PAGE, barButton, findDialog, openFiles } from '@/test/workflow-editor';

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
    const files = await openFiles(user);
    // The folder is beside the drop, and the drop uploads at once.
    await user.type(
      within(files).getByRole('textbox', { name: 'Into folder (optional)' }),
      'scorer',
    );
    await user.upload(
      within(files).getByLabelText('Add files'),
      new File(['print(42)\n'], 'main.py'),
    );
    await within(files).findByText('scorer/main.py: uploaded, waiting for Save');
    // An upload waiting for Save is not in a version until it is saved.
    await user.click(barButton('Publish version'));
    expect(
      within(await findDialog('Publish v1')).getByRole('button', {
        name: 'Save and publish v1',
      }),
    ).toBeInTheDocument();
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
  it('lists the saved files but workflow.yaml, which View YAML shows', async () => {
    server.use(signedIn, ...workflowBackend(CLASSIC).handlers);
    server.use(
      http.get(`${WORKFLOW_API}/tree`, () =>
        HttpResponse.json(
          ['workflow.yaml', 'score.py'].map((path) => ({
            path,
            kind: 'file',
            token: `${path}-token`,
            size: 3,
            upload: null,
            version: 'old',
            start: null,
          })),
        ),
      ),
    );
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);
    const files = await openFiles(user);
    expect(
      await within(files).findByRole('button', { name: /^score\.py/ }),
    ).toBeInTheDocument();
    expect(within(files).queryByRole('button', { name: /^workflow\.yaml/ })).toBeNull();
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
    const files = await openFiles(user);
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

  it('downloads a saved file of the draft through the door, an upload as well as text', async () => {
    server.use(signedIn, ...workflowBackend(CLASSIC).handlers);
    server.use(
      http.get(`${WORKFLOW_API}/tree`, () =>
        HttpResponse.json([
          {
            path: 'score.py',
            kind: 'file',
            token: 'score-token',
            size: 9,
            upload: null,
            version: 'old',
            start: null,
          },
          {
            path: 'big input.bin',
            kind: 'file',
            token: 'big-token',
            size: 130,
            upload: { size: 5_000_000, digest: 'a'.repeat(64) },
            version: 'old',
            start: null,
          },
        ]),
      ),
      http.get(`${WORKFLOW_API}/files/*`, ({ request }) =>
        new URL(request.url).pathname.endsWith('score.py')
          ? HttpResponse.json({
              path: 'score.py',
              content: 'print(1)\n',
              encoding: 'utf-8',
              token: 'score-token',
              upload: null,
              version: 'old',
            })
          : HttpResponse.json({
              path: 'big input.bin',
              content: 'pointer',
              encoding: 'utf-8',
              token: 'big-token',
              upload: { size: 5_000_000, digest: 'a'.repeat(64) },
              version: 'old',
            }),
      ),
    );
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);
    const files = await openFiles(user);
    await user.click(await within(files).findByRole('button', { name: /^big input/ }));
    expect(
      await within(files).findByRole('link', { name: 'Download big input.bin' }),
    ).toHaveAttribute(
      'href',
      '/-/downloads/workflows/kenny/tuned/draft/big%20input.bin',
    );
    await user.click(within(files).getByRole('button', { name: /^score\.py/ }));
    expect(
      await within(files).findByRole('link', { name: 'Download score.py' }),
    ).toHaveAttribute('href', '/-/downloads/workflows/kenny/tuned/draft/score.py');
  });

  it('asks before removing a file a step reads, naming the steps', async () => {
    const backend = workflowBackend(
      CLASSIC.replace('${{ inputs.answer }}', '${{ workflow.expected.out }}'),
    );
    server.use(signedIn, ...backend.handlers);
    server.use(
      http.get(`${WORKFLOW_API}/tree`, () =>
        HttpResponse.json([
          {
            path: 'expected.out',
            kind: 'file',
            token: 'expected-token',
            size: 3,
            upload: null,
            version: 'old',
            start: null,
          },
        ]),
      ),
      http.get(`${WORKFLOW_API}/files/expected.out`, () =>
        HttpResponse.json({
          path: 'expected.out',
          content: '42\n',
          encoding: 'utf-8',
          token: 'expected-token',
          upload: null,
          version: 'old',
        }),
      ),
    );
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);
    const files = await openFiles(user);
    await user.click(
      await within(files).findByRole('button', { name: /^expected\.out/ }),
    );
    await user.click(
      within(files).getByRole('button', { name: 'Remove expected.out' }),
    );
    expect(within(files).getByRole('alert')).toHaveTextContent(
      'check reads expected.out, and would read nothing once it is removed.',
    );
    await user.click(within(files).getByRole('button', { name: 'Keep it' }));
    expect(within(files).queryByRole('list', { name: 'File changes' })).toBeNull();

    await user.click(
      within(files).getByRole('button', { name: 'Remove expected.out' }),
    );
    await user.click(within(files).getByRole('button', { name: 'Remove it anyway' }));
    expect(
      within(files).getByText('expected.out: removed on Save'),
    ).toBeInTheDocument();
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
    const files = await openFiles(user);
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
  it('keeps a new file token when replacing its pending upload', async () => {
    const backend = workflowBackend(CLASSIC);
    let reads = 0;
    let completed = 0;
    server.use(signedIn, ...backend.handlers);
    server.use(
      http.get(`${WORKFLOW_API}/files/new.py`, () => {
        reads += 1;
        return reads === 1
          ? problem(404, 'not_found')
          : HttpResponse.json({ token: 'someone-elses-file' });
      }),
      http.post(`${WORKFLOW_API}/uploads`, () =>
        HttpResponse.json({
          id: 'new-upload',
          url: null,
          ready: true,
          expires_at: '2026-10-27T12:00:00Z',
        }),
      ),
      http.post(`${WORKFLOW_API}/uploads/new-upload/complete`, () => {
        completed += 1;
        return HttpResponse.json({ status: 'verified' });
      }),
    );
    const user = userEvent.setup();
    renderApp(EDITOR_PAGE);
    const files = await openFiles(user);
    for (const [at, content] of ['first', 'second'].entries()) {
      await user.upload(
        within(files).getByLabelText('Add files'),
        new File([content], 'new.py'),
      );
      await waitFor(() => expect(completed).toBe(at + 1));
      await waitFor(() => expect(barButton('Save')).toBeEnabled());
      expect(
        within(files).getByText('new.py: uploaded, waiting for Save'),
      ).toBeInTheDocument();
    }
    await user.click(barButton('Save'));
    await waitFor(() => expect(backend.state.saves).toHaveLength(1));
    expect(reads).toBe(1);
    expect(backend.state.saves[0]).toEqual({
      content: CLASSIC,
      token: 'token-1',
      changes: [
        {
          path: 'new.py',
          token: null,
          encoding: 'utf-8',
          remove: false,
          upload: 'new-upload',
        },
      ],
    });
  });
});
