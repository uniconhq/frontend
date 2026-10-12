import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@/test/user-event';
import { http, HttpResponse } from 'msw';
import type { FileContent, TreeEntry } from '@/api/types';
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
import { comeBackToTab, fakeLiveStream, openStream, realLiveStream } from '@/test/live';

const CONTEST = '/orgs/acme/contests/spring/files';
/** Where a task's Files page was, before each file had its form (M51). */
const TASK_FILES = '/orgs/acme/contests/spring/tasks/sum/files';
/** The task's Settings page, which holds its settings as stored. */
const TASK_SETTINGS = '/orgs/acme/contests/spring/tasks/sum/settings';
const CONTEST_FILE = `${CONTEST_API}/files/:path`;

function tree() {
  return screen.getByRole('navigation', { name: 'Files' });
}

/** A contest's files beyond its settings: a folder of rooms, with a text and a picture. */
const CONTEST_TREE: Record<string, TreeEntry[]> = {
  '': [
    { path: 'contest.yaml', kind: 'file', size: 80, upload: null },
    { path: 'notes.md', kind: 'file', size: 17, upload: null },
    { path: 'data', kind: 'directory', size: null, upload: null },
  ],
  data: [{ path: 'data/rooms', kind: 'directory', size: null, upload: null }],
  'data/rooms': [
    { path: 'data/rooms/1.in', kind: 'file', size: 4, upload: null },
    { path: 'data/rooms/logo.png', kind: 'file', size: 11, upload: null },
  ],
};

const CONTEST_FILES: Record<string, FileContent> = {
  'data/rooms/1.in': {
    path: 'data/rooms/1.in',
    encoding: 'utf-8',
    content: '1 2\n',
    token: 'token-1-in',
    upload: null,
  },
  'data/rooms/logo.png': {
    path: 'data/rooms/logo.png',
    encoding: 'base64',
    content: 'iVBORw0KGgoA//4=',
    token: 'token-logo',
    upload: null,
  },
};

/** The contest's tree as above, each folder read as it is asked for. */
function contestFiles(asked: string[] = []) {
  return [
    http.get(`${CONTEST_API}/tree`, ({ request }) => {
      const at = new URL(request.url).searchParams.get('path') ?? '';
      asked.push(at);
      return HttpResponse.json(CONTEST_TREE[at] ?? []);
    }),
    http.get(CONTEST_FILE, ({ params }) => {
      const path = decodeURIComponent(String(params['path']));
      if (path === 'notes.md') return HttpResponse.json(NOTES);
      const file = CONTEST_FILES[path];
      return file === undefined ? undefined : HttpResponse.json(file);
    }),
  ];
}

describe('the file tree', () => {
  it('lists the top folder, folders first, and opens a folder by listing it', async () => {
    const asked: string[] = [];
    server.use(signedIn, taskList, ...contestFiles(asked), ...repoFiles);
    renderApp(CONTEST);

    await within(await screen.findByRole('navigation', { name: 'Files' })).findByRole(
      'link',
      { name: 'notes.md' },
    );
    const top = within(tree()).getAllByRole('listitem');
    expect(top.map((item) => item.textContent)).toEqual(['▸data/', 'notes.md']);

    await userEvent.click(within(tree()).getByRole('button', { name: /data\// }));
    await userEvent.click(
      await within(tree()).findByRole('button', { name: /rooms\// }),
    );
    expect(await within(tree()).findByRole('link', { name: '1.in' })).toHaveAttribute(
      'href',
      `${CONTEST}?file=data/rooms/1.in`,
    );
    expect(asked).toEqual(['', 'data', 'data/rooms']);
  });

  it('opens a clicked file and puts it in the address', async () => {
    server.use(signedIn, taskList, ...contestFiles(), ...repoFiles);
    const { router } = renderApp(CONTEST);

    expect(await screen.findByText('Choose a file to open it.')).toBeVisible();
    await userEvent.click(
      await within(tree()).findByRole('link', { name: 'notes.md' }),
    );

    expect(await screen.findByRole('textbox', { name: 'notes.md' })).toHaveValue(
      NOTES.content,
    );
    expect(router.state.location.search).toBe('?file=notes.md');
    expect(within(tree()).getByRole('link', { name: 'notes.md' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('leaves the settings out of the tree, saying where they are changed', async () => {
    server.use(signedIn, taskList, ...contestFiles(), ...repoFiles);
    renderApp(CONTEST);

    await within(await screen.findByRole('navigation', { name: 'Files' })).findByRole(
      'link',
      { name: 'notes.md' },
    );
    expect(within(tree()).queryByRole('link', { name: 'contest.yaml' })).toBeNull();
    expect(
      within(screen.getByRole('main')).getByRole('link', { name: 'Settings' }),
    ).toHaveAttribute('href', '/orgs/acme/contests/spring/settings');
  });

  it('opens a linked file with the folders above it open', async () => {
    server.use(signedIn, taskList, ...contestFiles(), ...repoFiles);
    renderApp(`${CONTEST}?file=data/rooms/1.in`);

    expect(await screen.findByRole('textbox', { name: 'data/rooms/1.in' })).toHaveValue(
      '1 2\n',
    );
    expect(await within(tree()).findByRole('link', { name: '1.in' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('shows a binary file as its size, not as text to edit', async () => {
    server.use(signedIn, taskList, ...contestFiles(), ...repoFiles);
    renderApp(`${CONTEST}?file=data/rooms/logo.png`);

    expect(await screen.findByText(/This file is not text \(11 bytes\)/)).toBeVisible();
    expect(
      screen.queryByRole('textbox', { name: /data\/rooms\/logo\.png/ }),
    ).not.toBeInTheDocument();
    // The page is the files alone, so no box on it takes text.
    expect(screen.queryAllByRole('textbox')).toEqual([]);
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });

  it('shows why a file would not open', async () => {
    server.use(signedIn, taskList, ...contestFiles(), ...repoFiles);
    renderApp(`${CONTEST}?file=nowhere.txt`);

    expect(await screen.findByText('Not found')).toBeVisible();
  });
});

describe("a task's files, each on its own form (M51)", () => {
  it('has no Files page of its own: an old link to it, or to a file in it, lands on the task’s page', async () => {
    server.use(signedIn, taskState, publicationList, ...repoFiles);
    const { router } = renderApp(`${TASK_FILES}?file=tests/main/1/input`);

    expect(await screen.findByLabelText('Where the task stands')).toBeVisible();
    expect(router.state.location.pathname).toBe('/orgs/acme/contests/spring/tasks/sum');
    const sidebar = screen.getByRole('group', { name: 'Task' });
    expect(within(sidebar).queryByRole('link', { name: 'Files' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Files' })).toBeNull();
  });

  it('opens the task’s settings on its Settings page, to read only, saying where they are changed', async () => {
    server.use(signedIn, taskState, publicationList, ...repoFiles);
    renderApp(TASK_SETTINGS);

    const settings = await screen.findByRole('textbox', {
      name: 'The task’s settings',
    });
    expect(settings).toHaveValue(files['task.yaml']?.content);
    expect(settings).toHaveAttribute('readonly');
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(
      within(screen.getByRole('main')).getByRole('link', { name: 'Inputs' }),
    ).toHaveAttribute('href', '/orgs/acme/contests/spring/tasks/sum?card=inputs');
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
  beforeEach(fakeLiveStream);
  afterEach(realLiveStream);

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
        if (body.token !== 'token-theirs') return problem(409, 'conflict');
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

  it('keeps the text, and does not spin, when the tab comes back after they saved, and meets theirs at the save', async () => {
    const sent = conflicting();
    renderApp(`${CONTEST}?file=notes.md`);
    const editor = await screen.findByRole('textbox', { name: 'notes.md' });
    openStream();
    await userEvent.type(editor, 'Mine.\n');

    // Their save lands while this tab is in the background.
    server.use(
      http.get(CONTEST_FILE, ({ params }) =>
        params['path'] === 'notes.md'
          ? HttpResponse.json({
              ...NOTES,
              content: 'Rooms open at 9.\n',
              token: 'token-theirs',
            })
          : undefined,
      ),
    );
    comeBackToTab();
    await new Promise((resolve) => setTimeout(resolve, 300));

    const text = screen.getByRole('textbox', { name: 'notes.md' });
    expect(text).toHaveValue('Rooms open at 8.\nMine.\n');
    expect(text).not.toHaveAttribute('readonly');
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).not.toHaveAttribute('data-loading');

    await userEvent.click(save);
    const alert = await screen.findByRole('alert');
    expect(
      await within(alert).findByRole('textbox', {
        name: 'Their version, as it is now',
      }),
    ).toHaveValue('Rooms open at 9.\n');
    expect(sent[0]).toMatchObject({ token: 'token-notes' });
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
    renderApp(TASK_SETTINGS);

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
    renderApp(TASK_SETTINGS);

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

  it("names each admin-only key a save of a task's file changed, on the file's own card", async () => {
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
    renderApp('/orgs/acme/contests/spring/tasks/sum?card=statement');

    fireEvent.change(await screen.findByRole('textbox', { name: 'Statement source' }), {
      target: { value: 'x' },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Save statement' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Only an admin may change statement.md.');
    expect(
      within(
        within(alert).getByRole('list', { name: 'What stands in the way' }),
      ).getByText('statement.md'),
    ).toBeVisible();
  });
});
