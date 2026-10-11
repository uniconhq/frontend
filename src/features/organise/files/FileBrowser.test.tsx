import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@/test/user-event';
import { http, HttpResponse } from 'msw';
import { renderApp } from '@/test/render';
import { problem, server, signedIn, someone } from '@/test/server';
import {
  CONTEST_API,
  TASK_API,
  files,
  publicationList,
  repoFiles,
  taskList,
  taskState,
} from '@/test/organiser';

const CONTEST = '/orgs/acme/contests/spring/files';
const TASK = '/orgs/acme/contests/spring/tasks/sum/files';
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
      { name: 'statement.md' },
    );
    const top = within(tree()).getAllByRole('listitem');
    expect(top.map((item) => item.textContent)).toEqual(['▸data/', 'statement.md']);

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

  it('opens a clicked file and puts it in the address', async () => {
    server.use(signedIn, taskState, publicationList, ...repoFiles);
    const { router } = renderApp(TASK);

    expect(await screen.findByText('Choose a file to open it.')).toBeVisible();
    await userEvent.click(
      await within(tree()).findByRole('link', { name: 'statement.md' }),
    );

    expect(await screen.findByRole('textbox', { name: 'statement.md' })).toHaveValue(
      files['statement.md']?.content,
    );
    expect(router.state.location.search).toBe('?file=statement.md');
    expect(within(tree()).getByRole('link', { name: 'statement.md' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('leaves the tests and the settings out of the tree, saying where each is changed', async () => {
    server.use(
      signedIn,
      taskState,
      publicationList,
      http.get(`${TASK_API}/tree`, ({ request }) =>
        new URL(request.url).searchParams.get('path') === ''
          ? HttpResponse.json([
              { path: 'task.yaml', kind: 'file', size: 120, upload: null },
              { path: 'tests', kind: 'directory', size: null, upload: null },
              { path: 'public', kind: 'directory', size: null, upload: null },
            ])
          : undefined,
      ),
      ...repoFiles,
    );
    renderApp(TASK);

    await within(await screen.findByRole('navigation', { name: 'Files' })).findByRole(
      'button',
      { name: /public\// },
    );
    const top = within(tree()).getAllByRole('listitem');
    expect(top.map((item) => item.textContent)).toEqual(['▸public/']);
    const main = within(screen.getByRole('main'));
    expect(main.getByRole('link', { name: 'Tests and scoring' })).toHaveAttribute(
      'href',
      '/orgs/acme/contests/spring/tasks/sum?card=tests',
    );
    expect(main.getByRole('link', { name: 'task’s page' })).toHaveAttribute(
      'href',
      '/orgs/acme/contests/spring/tasks/sum',
    );
  });

  it('opens the task’s settings from a link, to read only, though the tree leaves them out', async () => {
    server.use(signedIn, taskState, publicationList, ...repoFiles);
    renderApp(`${TASK}?file=task.yaml`);

    const settings = await screen.findByRole('textbox', {
      name: 'The task’s settings',
    });
    expect(settings).toHaveValue(files['task.yaml']?.content);
    expect(settings).toHaveAttribute('readonly');
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(
      within(screen.getByRole('main')).getByRole('link', { name: 'Inputs' }),
    ).toHaveAttribute('href', '/orgs/acme/contests/spring/tasks/sum?card=inputs');
    expect(within(tree()).queryByRole('link', { name: 'task.yaml' })).toBeNull();
  });

  it('opens a test’s file to read, saying where tests are changed', async () => {
    server.use(
      signedIn,
      taskState,
      publicationList,
      http.get(`${TASK_API}/files/:path`, ({ params }) =>
        decodeURIComponent(String(params['path'])) === 'tests/main/1/input'
          ? HttpResponse.json({
              path: 'tests/main/1/input',
              encoding: 'utf-8',
              content: '1 2\n',
              token: 'token-input',
              upload: null,
            })
          : undefined,
      ),
      ...repoFiles,
    );
    renderApp(`${TASK}?file=tests/main/1/input`);

    expect(
      await screen.findByText(
        'A test’s files are changed on the task’s page, in its Tests and scoring card.',
      ),
    ).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'tests/main/1/input' })).toHaveAttribute(
      'readonly',
    );
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
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

    expect(await screen.findByText(/This file is not text \(11 bytes\)/)).toBeVisible();
    expect(
      screen.queryByRole('textbox', { name: /data\/testcases\/logo\.png/ }),
    ).not.toBeInTheDocument();
    // The page is the files alone, so no box on it takes text.
    expect(screen.queryAllByRole('textbox')).toEqual([]);
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });

  it('shows why a file would not open', async () => {
    server.use(signedIn, taskState, publicationList, ...repoFiles);
    renderApp(`${TASK}?file=nowhere.txt`);

    expect(await screen.findByText('Not found')).toBeVisible();
  });
});

/** A contest's own note, a file beside its settings, edited as text. */
const NOTES = {
  path: 'notes.md',
  encoding: 'utf-8' as const,
  content: 'Rooms open at 8.\n',
  token: 'token-notes',
  upload: null,
};

/** The contest's tree with its note in it, and the note read as it stands. */
const contestNotes = [
  http.get(`${CONTEST_API}/tree`, () =>
    HttpResponse.json([
      { path: 'contest.yaml', kind: 'file', size: 80, upload: null },
      { path: 'notes.md', kind: 'file', size: 17, upload: null },
    ]),
  ),
  http.get(CONTEST_FILE, ({ params }) =>
    params['path'] === 'notes.md' ? HttpResponse.json(NOTES) : undefined,
  ),
];

describe("the contest's settings in its files", () => {
  it('shows them to read, with where they are changed and every change to them', async () => {
    server.use(
      signedIn,
      taskList,
      ...repoFiles,
      http.get(`${CONTEST_API}/history`, () =>
        HttpResponse.json([
          {
            version: 'b2',
            message: 'Open the contest',
            author: 'kenny',
            author_id: 7,
            at: '2026-09-12T09:00:00Z',
          },
          {
            version: 'a1',
            message: 'Make the contest',
            author: 'kenny',
            author_id: 7,
            at: '2026-09-11T09:00:00Z',
          },
        ]),
      ),
    );
    const user = userEvent.setup();
    renderApp(`${CONTEST}?file=contest.yaml`);

    const settings = await screen.findByRole('textbox', {
      name: 'The contest’s settings',
    });
    expect(settings).toHaveAttribute('readonly');
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(
      within(screen.getByRole('main')).getByRole('link', { name: 'How people enter' }),
    ).toHaveAttribute('href', '/orgs/acme/contests/spring/entry');
    await user.click(screen.getByRole('button', { name: 'Every change' }));
    const changes = await screen.findByRole('list', {
      name: 'Changes to the settings',
    });
    expect(within(changes).getAllByRole('listitem')[0]).toHaveTextContent(
      'Open the contest',
    );
    expect(within(changes).getAllByRole('listitem')[0]).toHaveTextContent(
      'as they are now',
    );
    expect(
      within(changes).getAllByRole('button', { name: /^Read the settings/ }),
    ).toHaveLength(1);
  });
});

describe('saving a contest file', () => {
  it('sends the text with the token it was read with, and shows the new version', async () => {
    let sent: unknown = null;
    let reads = 0;
    server.use(
      signedIn,
      taskList,
      http.get(CONTEST_FILE, ({ params }) => {
        if (params['path'] === 'notes.md') reads += 1;
        return undefined;
      }),
      ...contestNotes,
      ...repoFiles,
      http.put(CONTEST_FILE, async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({ version: '9f8e7d6c5b4a39281706', notes: [] });
      }),
    );
    renderApp(`${CONTEST}?file=notes.md`);

    const editor = await screen.findByRole('textbox', { name: 'notes.md' });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await userEvent.type(editor, 'Lunch at noon.\n');
    expect(
      screen.getByText('Not saved yet: leaving this page loses these changes.'),
    ).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    const saved = await screen.findByText(/Saved as version/);
    expect(saved).toHaveTextContent('Saved as version 9f8e7d6.');
    expect(saved.closest('[role="status"]')).toHaveFocus();
    expect(sent).toEqual({
      content: 'Rooms open at 8.\nLunch at noon.\n',
      encoding: 'utf-8',
      token: 'token-notes',
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
      http.get(CONTEST_FILE, async ({ params }) => {
        if (params['path'] !== 'notes.md') return undefined;
        reads += 1;
        if (reads > 1) await held;
        return undefined;
      }),
      ...contestNotes,
      ...repoFiles,
      http.put(CONTEST_FILE, () =>
        HttpResponse.json({ version: '9f8e7d6c5b4a39281706', notes: [] }),
      ),
    );
    renderApp(`${CONTEST}?file=notes.md`);

    await userEvent.type(
      await screen.findByRole('textbox', { name: 'notes.md' }),
      'x\n',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText(/Saved as version/);

    expect(screen.getByRole('textbox', { name: 'notes.md' })).toHaveAttribute(
      'readonly',
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    readAgain();
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'notes.md' })).not.toHaveAttribute(
        'readonly',
      ),
    );
  });
});

describe('a text file someone else saved first', () => {
  /** The note, theirs once the first save is refused as a conflict; `sent` holds each save. */
  function conflicting() {
    let theirs = false;
    const sent: { content: string; token: string }[] = [];
    server.use(
      signedIn,
      taskList,
      http.get(CONTEST_FILE, ({ params }) =>
        params['path'] === 'notes.md' && theirs
          ? HttpResponse.json({
              ...NOTES,
              content: 'Rooms open at 9.\n',
              token: 'token-theirs',
            })
          : undefined,
      ),
      ...contestNotes,
      ...repoFiles,
      http.put(CONTEST_FILE, async ({ request }) => {
        const body = (await request.json()) as { content: string; token: string };
        sent.push(body);
        if (!theirs) {
          theirs = true;
          return problem(409, 'conflict', {
            detail: 'The file changed since it was read.',
          });
        }
        return HttpResponse.json({ version: '1a2b3c4d5e6f', notes: [] });
      }),
    );
    return sent;
  }

  it('shows both versions, and goes on from theirs keeping one’s own text to copy', async () => {
    conflicting();
    const user = userEvent.setup();
    renderApp(`${CONTEST}?file=notes.md`);

    const editor = await screen.findByRole('textbox', { name: 'notes.md' });
    await user.type(editor, 'Mine.\n');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'Someone else changed this file since you opened it.',
    );
    expect(alert).toHaveFocus();
    expect(
      await within(alert).findByRole('textbox', {
        name: 'Their version, as it is now',
      }),
    ).toHaveValue('Rooms open at 9.\n');
    expect(within(alert).getByRole('textbox', { name: 'Your version' })).toHaveValue(
      'Rooms open at 8.\nMine.\n',
    );

    await user.click(
      within(alert).getByRole('button', { name: 'Continue from theirs' }),
    );

    expect(
      await screen.findByDisplayValue('Rooms open at 9.', {
        normalizer: (v) => v.trim(),
      }),
    ).toBeVisible();
    expect(
      screen.getByRole('textbox', { name: 'Your text from before, to copy from' }),
    ).toHaveValue('Rooms open at 8.\nMine.\n');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('saves one’s own over theirs only after a warning', async () => {
    const sent = conflicting();
    const user = userEvent.setup();
    renderApp(`${CONTEST}?file=notes.md`);

    await user.type(
      await screen.findByRole('textbox', { name: 'notes.md' }),
      'Mine.\n',
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));
    const alert = await screen.findByRole('alert');
    await user.click(
      await within(alert).findByRole('button', { name: 'Save yours over theirs' }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Save yours over theirs?',
    });
    expect(dialog).toHaveTextContent('Their change to notes.md is thrown away');
    await user.click(
      within(dialog).getByRole('button', { name: 'Save yours over theirs' }),
    );

    expect(await screen.findByText(/Saved as version/)).toBeVisible();
    expect(sent[1]).toMatchObject({
      content: 'Rooms open at 8.\nMine.\n',
      token: 'token-theirs',
    });
  });
});

describe('mending settings that do not read', () => {
  const TASK_FILE = `${TASK_API}/files/:path`;
  const BROKEN = 'name: sum\nworkflow: [unicon/classic@v2\n';

  /** The sum task, its settings no longer YAML, and every save of them refused as `answer` says. */
  function brokenBackend(answer: () => Response) {
    server.use(
      signedIn,
      taskState,
      publicationList,
      http.get(TASK_FILE, ({ params }) =>
        params['path'] === 'task.yaml'
          ? HttpResponse.json({
              path: 'task.yaml',
              encoding: 'utf-8',
              content: BROKEN,
              token: 'token-broken',
              upload: null,
            })
          : undefined,
      ),
      http.put(TASK_FILE, answer),
      ...repoFiles,
    );
  }

  it('offers an admin the text, and names each problem of a save that does not validate', async () => {
    brokenBackend(() =>
      problem(422, 'invalid_definition', {
        detail: 'task.yaml does not validate.',
        errors: [{ path: 'workflow', message: 'There is no such workflow.' }],
      }),
    );
    renderApp(`${TASK}?file=task.yaml`);

    expect(
      await screen.findByText(
        'These settings cannot be read, so the pages cannot change them.',
      ),
    ).toBeVisible();
    await userEvent.type(
      await screen.findByRole('textbox', { name: 'task.yaml' }),
      'x',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    const alert = await screen.findByText('Nothing was saved', { exact: false });
    const errors = within(alert.closest('[role="alert"]') as HTMLElement).getByRole(
      'list',
      { name: 'Errors' },
    );
    expect(errors).toHaveTextContent('Workflow: There is no such workflow.');
    expect(within(errors).getByRole('link', { name: 'Workflow' })).toHaveAttribute(
      'href',
      '/orgs/acme/contests/spring/tasks/sum?card=workflow&field=workflow',
    );
  });

  it('shows anyone else the text to read, and who may mend it', async () => {
    brokenBackend(() => HttpResponse.json({}));
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
    renderApp(`${TASK}?file=task.yaml`);

    expect(
      await screen.findByText('An admin of the task can fix them as text.'),
    ).toBeVisible();
    expect(
      screen.getByRole('textbox', { name: 'The task’s settings' }),
    ).toHaveAttribute('readonly');
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });

  it('offers an admin the contest’s settings as text while the forge refuses them as they are', async () => {
    server.use(
      signedIn,
      taskList,
      http.get(`${CONTEST_API}/organise/tasks`, () =>
        problem(422, 'invalid_definition', {
          errors: [
            {
              path: 'registration.invite_only',
              message: 'invite_only is retired: say who enters with registration.ways.',
            },
          ],
        }),
      ),
      ...repoFiles,
    );
    renderApp('/orgs/acme/contests/spring/files?file=contest.yaml');

    expect(
      await screen.findByText(
        'These settings cannot be read, so the pages cannot change them.',
      ),
    ).toBeVisible();
    expect(screen.getByRole('list', { name: 'Errors' })).toHaveTextContent(
      'invite_only is retired',
    );
    expect(screen.getByRole('textbox', { name: 'contest.yaml' })).not.toHaveAttribute(
      'readonly',
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeVisible();
  });

  it("names each admin-only key a manager's save of a file changed", async () => {
    server.use(
      signedIn,
      taskState,
      publicationList,
      ...repoFiles,
      http.put(TASK_FILE, () =>
        problem(403, 'admin_only', {
          detail: 'Only an admin may change statement.md.',
          keys: ['statement.md'],
        }),
      ),
    );
    renderApp(`${TASK}?file=statement.md`);

    await userEvent.type(
      await screen.findByRole('textbox', { name: 'statement.md' }),
      'x',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Only an admin may change statement.md.');
    expect(
      within(
        within(alert).getByRole('list', { name: 'What stands in the way' }),
      ).getByText('statement.md'),
    ).toBeVisible();
  });
});
