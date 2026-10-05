import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderApp } from '@/test/render';
import { problem, server, signedIn } from '@/test/server';
import {
  CONTEST_API,
  TASK_API,
  files,
  publicationList,
  repoFiles,
  taskList,
  taskState,
} from '@/test/organiser';

const CONTEST = '/orgs/acme/contests/spring';
const TASK = `${CONTEST}/tasks/sum`;
const CONTEST_FILE = `${CONTEST_API}/files/:path`;

function tree() {
  return screen.getByRole('navigation', { name: 'Files' });
}

describe('the file tree', () => {
  it('lists the top folder, folders first, and opens a folder by listing it', async () => {
    const asked: string[] = [];
    server.use(
      signedIn,
      taskState,
      publicationList,
      http.get(`${TASK_API}/tree`, ({ request }) => {
        asked.push(new URL(request.url).searchParams.get('path') ?? '');
        return undefined;
      }),
      ...repoFiles,
    );
    renderApp(TASK);

    await within(await screen.findByRole('navigation', { name: 'Files' })).findByRole(
      'link',
      { name: 'task.yaml' },
    );
    const top = within(tree()).getAllByRole('listitem');
    expect(top.map((item) => item.textContent)).toEqual([
      '▸data/',
      'statement.md',
      'task.yaml',
    ]);

    await userEvent.click(within(tree()).getByRole('button', { name: /data\// }));
    await userEvent.click(
      await within(tree()).findByRole('button', { name: /testcases\// }),
    );
    expect(await within(tree()).findByRole('link', { name: '1.in' })).toHaveAttribute(
      'href',
      `${TASK}?file=data/testcases/1.in`,
    );
    expect(asked).toEqual(['', 'data', 'data/testcases']);
  });

  it('opens a clicked file as text and puts it in the address', async () => {
    server.use(signedIn, taskState, publicationList, ...repoFiles);
    const { router } = renderApp(TASK);

    expect(await screen.findByText('Pick a file to open it.')).toBeVisible();
    await userEvent.click(
      await within(tree()).findByRole('link', { name: 'task.yaml' }),
    );

    const editor = await screen.findByRole('textbox', { name: 'task.yaml' });
    expect(editor).toHaveValue(files['task.yaml']?.content);
    expect(router.state.location.search).toBe('?file=task.yaml');
    expect(within(tree()).getByRole('link', { name: 'task.yaml' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('opens a linked file with the folders above it open', async () => {
    server.use(signedIn, taskState, publicationList, ...repoFiles);
    renderApp(`${TASK}?file=data/testcases/1.in`);

    expect(
      await screen.findByRole('textbox', { name: 'data/testcases/1.in' }),
    ).toHaveValue('1 2\n');
    expect(await within(tree()).findByRole('link', { name: '1.in' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('shows a binary file as its size, not as text to edit', async () => {
    server.use(signedIn, taskState, publicationList, ...repoFiles);
    renderApp(`${TASK}?file=data/testcases/logo.png`);

    expect(await screen.findByText(/Binary, 11 bytes/)).toBeVisible();
    expect(
      screen.queryByRole('textbox', { name: /data\/testcases\/logo\.png/ }),
    ).not.toBeInTheDocument();
    expect(
      new Set(
        screen.queryAllByRole('textbox').map((box) => box.closest('form')?.ariaLabel),
      ),
    ).toEqual(new Set(['Add someone', 'Post announcement']));
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });

  it('shows why a file would not open', async () => {
    server.use(signedIn, taskState, publicationList, ...repoFiles);
    renderApp(`${TASK}?file=nowhere.txt`);

    expect(await screen.findByText('Not found')).toBeVisible();
  });
});

describe('saving a contest file', () => {
  it('sends the text with the token it was read with, and shows the new version', async () => {
    let sent: unknown = null;
    let reads = 0;
    server.use(
      signedIn,
      taskList,
      http.get(CONTEST_FILE, () => {
        reads += 1;
        return undefined;
      }),
      ...repoFiles,
      http.put(CONTEST_FILE, async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({ version: '9f8e7d6c5b4a39281706' });
      }),
    );
    renderApp(`${CONTEST}?file=contest.yaml`);

    const editor = await screen.findByRole('textbox', { name: 'contest.yaml' });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await userEvent.type(editor, 'description: Our spring round\n');
    expect(screen.getByText('Unsaved changes')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    const saved = await screen.findByText(/Saved as version/);
    expect(saved).toHaveTextContent('Saved as version 9f8e7d6.');
    expect(saved.closest('[role="status"]')).toHaveFocus();
    expect(sent).toEqual({
      content: 'name: Spring\nvisibility: signed-in\ndescription: Our spring round\n',
      encoding: 'utf-8',
      token: 'token-contest-yaml',
      confirm: false,
      keep_as_draft: false,
    });
    await expect.poll(() => reads).toBe(2);
  });

  it('holds the text still until the saved file has been read again', async () => {
    let reads = 0;
    let readAgain = () => {};
    const held = new Promise<void>((resolve) => {
      readAgain = resolve;
    });
    server.use(
      signedIn,
      taskList,
      http.get(CONTEST_FILE, async () => {
        reads += 1;
        if (reads > 1) await held;
        return undefined;
      }),
      ...repoFiles,
      http.put(CONTEST_FILE, () =>
        HttpResponse.json({ version: '9f8e7d6c5b4a39281706' }),
      ),
    );
    renderApp(`${CONTEST}?file=contest.yaml`);

    await userEvent.type(
      await screen.findByRole('textbox', { name: 'contest.yaml' }),
      'x: 1\n',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText(/Saved as version/);

    expect(screen.getByRole('textbox', { name: 'contest.yaml' })).toHaveAttribute(
      'readonly',
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    readAgain();
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'contest.yaml' })).not.toHaveAttribute(
        'readonly',
      ),
    );
  });

  it('keeps the text on a conflict, and replaces it with their version on reload', async () => {
    let theirs = false;
    server.use(
      signedIn,
      taskList,
      http.get(CONTEST_FILE, () =>
        theirs
          ? HttpResponse.json({
              path: 'contest.yaml',
              encoding: 'utf-8',
              content: 'name: Spring 2026\n',
              token: 'token-theirs',
            })
          : undefined,
      ),
      ...repoFiles,
      http.put(CONTEST_FILE, () => {
        theirs = true;
        return problem(409, 'conflict', {
          detail: 'The file changed since it was read.',
        });
      }),
    );
    renderApp(`${CONTEST}?file=contest.yaml`);

    const editor = await screen.findByRole('textbox', { name: 'contest.yaml' });
    await userEvent.type(editor, 'mine: true\n');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'Someone else changed this file since you opened it.',
    );
    expect(alert).toHaveFocus();
    expect(editor).toHaveValue('name: Spring\nvisibility: signed-in\nmine: true\n');

    await userEvent.click(
      within(alert).getByRole('button', { name: 'Reload the file' }),
    );

    const reloaded = await screen.findByDisplayValue('name: Spring 2026', {
      normalizer: (v) => v.trim(),
    });
    expect(reloaded).toBeVisible();
    expect(reloaded).toHaveFocus();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('names each error of a contest.yaml that does not validate', async () => {
    server.use(
      signedIn,
      taskList,
      ...repoFiles,
      http.put(CONTEST_FILE, () =>
        problem(422, 'invalid_definition', {
          detail: 'contest.yaml does not validate.',
          errors: [{ path: 'visibility', message: 'Must be public or signed-in.' }],
        }),
      ),
    );
    renderApp(`${CONTEST}?file=contest.yaml`);

    await userEvent.type(
      await screen.findByRole('textbox', { name: 'contest.yaml' }),
      'x: 1\n',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The settings file has errors');
    expect(alert).toHaveTextContent('contest.yaml does not validate.');
    expect(within(alert).getByRole('list', { name: 'Errors' })).toHaveTextContent(
      'visibility: Must be public or signed-in.',
    );
  });

  it("names each admin-only key a manager's save changed", async () => {
    server.use(
      signedIn,
      taskList,
      ...repoFiles,
      http.put(CONTEST_FILE, () =>
        problem(403, 'admin_only', {
          detail: 'Only an admin may change name.',
          keys: ['name'],
        }),
      ),
    );
    renderApp(`${CONTEST}?file=contest.yaml`);

    await userEvent.type(
      await screen.findByRole('textbox', { name: 'contest.yaml' }),
      'x: 1\n',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Only an admin may change name.');
    expect(
      within(
        within(alert).getByRole('list', { name: 'What stands in the way' }),
      ).getByText('name'),
    ).toBeVisible();
  });
});
