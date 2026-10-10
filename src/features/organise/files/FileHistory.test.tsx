import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { Holder } from '@/api/types';
import type { components } from '@/api/schema';
import { renderApp } from '@/test/render';
import { problem, server, signedIn, someone } from '@/test/server';
import {
  TASK_API,
  publicationList,
  publications,
  repoFiles,
  taskState,
} from '@/test/organiser';

type Change = components['schemas']['Change'];

const TASK = '/orgs/acme/contests/spring/tasks/sum';
const LATEST = '3c4d5e6f7a8b9c0d1e2f';
/** Publication 2's version, and publication 1's. */
const SECOND = publications[1]?.version ?? '';
const FIRST = publications[0]?.version ?? '';
/** What an uploaded file's commit holds: a pointer to its bytes. */
const POINTER = `version https://git-lfs.github.com/spec/v1
oid sha256:${'a'.repeat(64)}
size 2048
`;

const changes: Change[] = [
  {
    version: LATEST,
    author_id: someone.user.id,
    author: someone.user.username,
    message: 'Raise the limits',
    at: '2026-09-22T10:00:00Z',
  },
  {
    version: SECOND,
    author_id: 9,
    author: 'grace',
    message: 'Name the task',
    at: '2026-09-21T10:00:00Z',
  },
  {
    version: '9e8d7c6b5a4f3e2d1c0b',
    author_id: 12,
    author: null,
    message: 'Add the statement',
    at: '2026-09-20T12:00:00Z',
  },
  {
    version: FIRST,
    author_id: null,
    author: null,
    message: 'Make the task',
    at: '2026-09-20T10:00:00Z',
  },
];

const kenny: Holder = {
  user: {
    id: someone.user.id,
    username: someone.user.username,
    name: null,
    avatar_url: null,
  },
  role: 'admin',
  at_names: { org: 'acme', contest: null, task: null },
};

/** The task's history and roles, counting the reads of the history and what each asked for. */
function history() {
  const asked: (string | null)[] = [];
  server.use(
    signedIn,
    taskState,
    publicationList,
    ...repoFiles,
    http.get(`${TASK_API}/history`, ({ request }) => {
      asked.push(new URL(request.url).searchParams.get('path'));
      return HttpResponse.json(changes);
    }),
    http.get(`${TASK_API}/roles`, () => HttpResponse.json([kenny])),
  );
  return asked;
}

async function openHistory() {
  renderApp(`${TASK}?file=task.yaml`);
  await screen.findByRole('textbox', { name: 'task.yaml' });
  await userEvent.click(
    screen.getByRole('button', { name: 'Show the history of task.yaml' }),
  );
  return within(await screen.findByRole('list', { name: 'History of task.yaml' }));
}

describe("a task file's history", () => {
  it('lists the versions newest first, with who, what and the publications on them', async () => {
    const asked = history();
    const list = await openHistory();

    const items = list.getAllByRole('listitem');
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveTextContent('3c4d5e6 Raise the limits');
    expect(items[0]).toHaveTextContent('kenny');
    expect(items[0]).toHaveTextContent('the file as it is now');
    expect(items[0]).not.toHaveTextContent('Publication');
    // grace holds no role at the task any more; the history still names her.
    expect(items[1]).toHaveTextContent('grace');
    expect(items[1]).toHaveTextContent('Publication 2 · grading unchanged');
    expect(items[2]).toHaveTextContent('account 12');
    expect(items[3]).toHaveTextContent('an unknown author');
    expect(items[3]).toHaveTextContent('Publication 1 · changed how the task grades');
    expect(asked).toEqual(['task.yaml']);
  });

  it('opens an older version to read, not to edit', async () => {
    let at: string | null = null;
    history();
    server.use(
      http.get(`${TASK_API}/files/:path`, ({ request }) => {
        at = new URL(request.url).searchParams.get('at');
        if (at === null) return undefined;
        return HttpResponse.json({
          path: 'task.yaml',
          encoding: 'utf-8',
          content: 'name: sum\n',
          token: 'token-old',
        });
      }),
    );
    const list = await openHistory();

    expect(
      list.queryByRole('button', { name: /View task.yaml at 3c4d5e6/ }),
    ).toBeNull();
    await userEvent.click(
      list.getByRole('button', { name: 'View task.yaml at 2b3c4d5' }),
    );

    const old = await screen.findByRole('textbox', { name: 'task.yaml at 2b3c4d5' });
    expect(old).toHaveValue('name: sum\n');
    expect(old).toHaveAttribute('readonly');
    expect(at).toBe(SECOND);
  });

  it('shows an older version of an uploaded file by its size and digest', async () => {
    history();
    server.use(
      http.get(`${TASK_API}/files/:path`, ({ request }) =>
        new URL(request.url).searchParams.get('at') === null
          ? undefined
          : HttpResponse.json({
              path: 'task.yaml',
              encoding: 'utf-8',
              content: POINTER,
              token: 'token-old',
              upload: { size: 2048, digest: 'a'.repeat(64) },
            }),
      ),
    );
    const list = await openHistory();
    await userEvent.click(
      list.getByRole('button', { name: 'View task.yaml at 2b3c4d5' }),
    );

    const old = await screen.findByRole('region', { name: 'task.yaml at 2b3c4d5' });
    expect(within(old).getByText('a'.repeat(64))).toBeVisible();
    expect(within(old).getByText(/^2 KB \(2.048 bytes\)$/)).toBeVisible();
    expect(screen.queryByRole('textbox', { name: 'task.yaml at 2b3c4d5' })).toBeNull();
    expect(within(old).queryByRole('button', { name: 'Upload again' })).toBeNull();
  });

  it('rolls back after asking, as a save whose answer the editor shows', async () => {
    const asked = history();
    const sent: unknown[] = [];
    server.use(
      http.post(`${TASK_API}/files/:path/rollback`, async ({ request }) => {
        sent.push(await request.json());
        return HttpResponse.json({
          number: 3,
          grading_changed: false,
          changes: [],
          notes: [],
          regraded: 0,
        });
      }),
    );
    const list = await openHistory();

    await userEvent.click(
      list.getByRole('button', { name: 'Roll task.yaml back to 1a2b3c4' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Roll this file back?' });
    expect(dialog).toHaveTextContent(
      'task.yaml is written as it was at version 1a2b3c4',
    );
    expect(sent).toEqual([]);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Roll back' }));

    const answer = await screen.findByText('Published as publication 3.');
    expect(answer.closest('[role="status"]')).toHaveFocus();
    expect(sent).toEqual([
      {
        version: FIRST,
        token: 'token-task-yaml',
        confirm: false,
        keep_as_draft: false,
      },
    ]);
    await expect.poll(() => asked.length).toBe(2);
  });

  it('sends the same rollback again when publishing it has to be confirmed', async () => {
    history();
    const sent: { confirm: boolean; version: string }[] = [];
    server.use(
      http.post(`${TASK_API}/files/:path/rollback`, async ({ request }) => {
        const body = (await request.json()) as { confirm: boolean; version: string };
        sent.push(body);
        return body.confirm
          ? HttpResponse.json({
              number: 3,
              grading_changed: true,
              changes: ['limits changed'],
              notes: [],
              regraded: 0,
            })
          : problem(409, 'confirmation_required', { changes: ['limits changed'] });
      }),
    );
    const list = await openHistory();

    await userEvent.click(
      list.getByRole('button', { name: 'Roll task.yaml back to 2b3c4d5' }),
    );
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Roll back',
      }),
    );
    const alert = await screen.findByRole('alert');
    await userEvent.click(
      within(alert).getByRole('button', { name: 'Publish the change' }),
    );

    expect(await screen.findByText('Published as publication 3.')).toBeVisible();
    expect(sent.map(({ confirm, version }) => ({ confirm, version }))).toEqual([
      { confirm: false, version: SECOND },
      { confirm: true, version: SECOND },
    ]);
  });

  it('sends nothing when the dialog is cancelled', async () => {
    history();
    let sent = 0;
    server.use(
      http.post(`${TASK_API}/files/:path/rollback`, () => {
        sent += 1;
        return HttpResponse.json({});
      }),
    );
    const list = await openHistory();

    await userEvent.click(
      list.getByRole('button', { name: 'Roll task.yaml back to 1a2b3c4' }),
    );
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }),
    );

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(sent).toBe(0);
  });

  it('shows an observer the history with no rollback', async () => {
    history();
    server.use(
      http.get('/api/v1/me', () =>
        HttpResponse.json({
          ...someone,
          roles: [
            { names: { org: 'acme', contest: 'spring', task: null }, role: 'observer' },
          ],
        }),
      ),
    );
    const list = await openHistory();

    expect(list.getAllByRole('listitem')).toHaveLength(4);
    expect(list.getAllByRole('button', { name: /^View / })).toHaveLength(3);
    expect(list.queryByRole('button', { name: /^Roll / })).toBeNull();
  });
});
