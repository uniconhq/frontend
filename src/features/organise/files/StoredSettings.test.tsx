import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@/test/user-event';
import { http, HttpResponse } from 'msw';
import { renderApp } from '@/test/render';
import { afterAnswers, problem, server, signedIn, someone } from '@/test/server';
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

/** The contest's Settings page, which holds its settings as stored below its form. */
const CONTEST_SETTINGS = '/orgs/acme/contests/spring/settings';
/** Where a contest's Files page was, before it was taken away (M43). */
const CONTEST_FILES = '/orgs/acme/contests/spring/files';
/** Where a task's Files page was, before each file had its form (M51). */
const TASK_FILES = '/orgs/acme/contests/spring/tasks/sum/files';
/** The task's Settings page, which holds its settings as stored. */
const TASK_SETTINGS = '/orgs/acme/contests/spring/tasks/sum/settings';
const CONTEST_FILE = `${CONTEST_API}/files/:path`;

/** The part of a Settings page that holds the settings as stored. */
async function stored(): Promise<HTMLElement> {
  return screen.findByRole('region', { name: 'The settings as stored' });
}

describe("a contest's stored settings, on its Settings page (M43)", () => {
  it('shows them under the form, to read, with where they are changed and every change to them', async () => {
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
    renderApp(CONTEST_SETTINGS);

    const part = await stored();
    const settings = await within(part).findByRole('textbox', {
      name: 'The contest’s settings',
    });
    expect(settings).toHaveValue(files['contest.yaml']?.content);
    expect(settings).toHaveAttribute('readonly');
    expect(within(part).queryByRole('button', { name: 'Save' })).toBeNull();
    expect(
      within(part).getByRole('link', { name: 'How people enter' }),
    ).toHaveAttribute('href', '/orgs/acme/contests/spring/entry');
    expect(within(part).queryByRole('link', { name: 'Settings' })).toBeNull();
    expect(part).toHaveTextContent('and the rest in the form above.');
    await user.click(within(part).getByRole('button', { name: 'Every change' }));
    const changes = await within(part).findByRole('list', {
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

  it('scrolls to them from View file once the form above them has loaded', async () => {
    // The test's document draws nothing, so it has no scrolling of its own.
    const scrolled: Element[] = [];
    Element.prototype.scrollIntoView = vi.fn(function (this: Element) {
      scrolled.push(this);
    });
    try {
      server.use(signedIn, taskList, ...repoFiles);
      const user = userEvent.setup();
      renderApp(CONTEST_SETTINGS);

      await screen.findByRole('button', { name: 'Save settings' });
      const view = screen.getByRole('link', { name: 'View file' });
      expect(view).toHaveAttribute('href', `${CONTEST_SETTINGS}#file`);
      expect(scrolled).toEqual([]);
      await user.click(view);

      await waitFor(() => expect(scrolled).toContain(document.getElementById('file')));
      expect(document.getElementById('file')).toHaveAccessibleName(
        'The settings as stored',
      );
    } finally {
      // @ts-expect-error The test's document had none before.
      delete Element.prototype.scrollIntoView;
    }
  });
});

describe("a contest's stored settings that cannot be read", () => {
  it('says why they would not open, with a way to try again', async () => {
    server.use(
      signedIn,
      taskList,
      http.get(CONTEST_FILE, () =>
        problem(404, 'not_found', { detail: 'contest.yaml is not in the contest.' }),
      ),
      ...repoFiles,
    );
    renderApp(CONTEST_SETTINGS);

    const part = await stored();
    expect(await within(part).findByText('Not found')).toBeVisible();
    expect(within(part).getByRole('button', { name: /Try again/ })).toBeVisible();
  });
});

describe('a contest has no Files page (M43)', () => {
  it('has no Files entry, and an old link to it, or to its settings in it, lands on Settings', async () => {
    server.use(signedIn, taskList, ...repoFiles);
    const { router } = renderApp(`${CONTEST_FILES}?file=contest.yaml`);

    expect(
      await within(await stored()).findByRole('textbox', {
        name: 'The contest’s settings',
      }),
    ).toBeVisible();
    expect(router.state.location.pathname).toBe(CONTEST_SETTINGS);
    expect(router.state.location.hash).toBe('#file');
    const sidebar = screen.getByRole('group', { name: 'Contest' });
    expect(within(sidebar).queryByRole('link', { name: 'Files' })).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Files' })).toBeNull();
  });

  it('lands an old link to the page alone on Settings, at its top', async () => {
    server.use(signedIn, taskList, ...repoFiles);
    const { router } = renderApp(CONTEST_FILES);

    expect(await screen.findByRole('button', { name: 'Save settings' })).toBeVisible();
    expect(router.state.location.pathname).toBe(CONTEST_SETTINGS);
    expect(router.state.location.hash).toBe('');
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
    // Every card that writes the settings, and none that links to this page.
    const part = await stored();
    expect(
      within(part)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Workflow', 'Inputs', 'Runs', 'Scoring', 'Checks', 'Submissions']);
    expect(part).toHaveTextContent(
      'Workflow, Inputs, Runs, Scoring, Checks and Submissions cards, and its title in the form above.',
    );
  });
});

/**
 * The contest's settings as they are when the pages cannot read them: no
 * longer YAML, so its admin fixes them as text on its Settings page.
 */
const BROKEN = {
  path: 'contest.yaml',
  encoding: 'utf-8' as const,
  content: 'name: Spring\nstart: [\n',
  token: 'token-broken',
  upload: null,
  version: '3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d',
};

/** The contest with its settings broken, each read counted as `reads` says. */
function brokenContest(reads: { count: number } = { count: 0 }) {
  return [
    http.get(CONTEST_FILE, ({ params }) => {
      if (params['path'] !== 'contest.yaml') return undefined;
      reads.count += 1;
      return HttpResponse.json(BROKEN);
    }),
  ];
}

/** The text to fix the settings in, once the page has offered it. */
async function settingsText(): Promise<HTMLElement> {
  return within(await stored()).findByRole('textbox', { name: 'contest.yaml' });
}

/** The panel that says someone else saved first, once a save has met it. */
async function conflict(): Promise<HTMLElement> {
  const said = await within(await stored()).findByText(
    'Someone else changed these settings since you opened it.',
  );
  return said.closest('[role="alert"]') as HTMLElement;
}

function saveButton(): HTMLElement {
  return within(
    screen.getByRole('region', { name: 'The settings as stored' }),
  ).getByRole('button', { name: 'Save' });
}

describe("saving the contest's settings as text", () => {
  it('sends the text with the token it was read with, and shows the new version', async () => {
    let sent: unknown = null;
    const reads = { count: 0 };
    server.use(
      signedIn,
      taskList,
      ...brokenContest(reads),
      ...repoFiles,
      http.put(CONTEST_FILE, async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({ version: '9f8e7d6c5b4a39281706', notes: [] });
      }),
    );
    renderApp(CONTEST_SETTINGS);

    const editor = await settingsText();
    const before = reads.count;
    expect(saveButton()).toBeDisabled();
    await userEvent.type(editor, ']\n');
    expect(
      screen.getByText('Not saved yet: leaving this page loses these changes.'),
    ).toBeVisible();
    await userEvent.click(saveButton());

    const saved = await screen.findByText(/Saved as version/);
    expect(saved).toHaveTextContent('Saved as version 9f8e7d6.');
    expect(saved.closest('[role="status"]')).toHaveFocus();
    expect(sent).toEqual({
      content: 'name: Spring\nstart: [\n]\n',
      encoding: 'utf-8',
      token: 'token-broken',
      confirm: false,
      keep_as_draft: false,
    });
    await expect.poll(() => reads.count).toBeGreaterThan(before);
  });

  it('holds the text still until the saved settings have been read again', async () => {
    let reads = 0;
    let readAgain = () => {};
    const held = new Promise<void>((resolve) => {
      readAgain = resolve;
    });
    let saved = false;
    server.use(
      signedIn,
      taskList,
      http.get(CONTEST_FILE, async ({ params }) => {
        if (params['path'] !== 'contest.yaml') return undefined;
        reads += 1;
        if (saved) await held;
        return HttpResponse.json(BROKEN);
      }),
      ...repoFiles,
      http.put(CONTEST_FILE, () => {
        saved = true;
        return HttpResponse.json({ version: '9f8e7d6c5b4a39281706', notes: [] });
      }),
    );
    renderApp(CONTEST_SETTINGS);

    await userEvent.type(await settingsText(), 'x\n');
    await userEvent.click(saveButton());
    await screen.findByText(/Saved as version/);

    expect(screen.getByRole('textbox', { name: 'contest.yaml' })).toHaveAttribute(
      'readonly',
    );
    expect(saveButton()).toBeDisabled();

    readAgain();
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'contest.yaml' })).not.toHaveAttribute(
        'readonly',
      ),
    );
    expect(reads).toBeGreaterThan(1);
  });
});

describe('settings someone else saved first', () => {
  beforeEach(fakeLiveStream);
  afterEach(realLiveStream);

  const THEIRS = {
    ...BROKEN,
    content: 'name: Spring 2026\nstart: [\n',
    token: 'token-theirs',
  };

  /** The settings, theirs once the first save is refused as a conflict; `sent` holds each save. */
  function conflicting() {
    let theirs = false;
    const sent: { content: string; token: string }[] = [];
    server.use(
      signedIn,
      taskList,
      http.get(CONTEST_FILE, ({ params }) =>
        params['path'] === 'contest.yaml'
          ? HttpResponse.json(theirs ? THEIRS : BROKEN)
          : undefined,
      ),
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
    renderApp(CONTEST_SETTINGS);

    await user.type(await settingsText(), 'mine');
    await user.click(saveButton());

    const alert = await conflict();
    expect(alert).toHaveFocus();
    expect(
      await within(alert).findByRole('textbox', {
        name: 'Their version, as it is now',
      }),
    ).toHaveValue(THEIRS.content);
    expect(within(alert).getByRole('textbox', { name: 'Your version' })).toHaveValue(
      'name: Spring\nstart: [\nmine',
    );

    await user.click(
      within(alert).getByRole('button', { name: 'Continue from theirs' }),
    );

    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'contest.yaml' })).toHaveValue(
        THEIRS.content,
      ),
    );
    expect(
      screen.getByRole('textbox', { name: 'Your text from before, to copy from' }),
    ).toHaveValue('name: Spring\nstart: [\nmine');
  });

  it('keeps the text, and does not spin, when the tab comes back after they saved, and meets theirs at the save', async () => {
    const sent = conflicting();
    renderApp(CONTEST_SETTINGS);
    const editor = await settingsText();
    openStream();
    await userEvent.type(editor, 'mine');

    // Their save lands while this tab is in the background.
    server.use(
      http.get(CONTEST_FILE, ({ params }) =>
        params['path'] === 'contest.yaml' ? HttpResponse.json(THEIRS) : undefined,
      ),
    );
    await afterAnswers(comeBackToTab);

    const text = screen.getByRole('textbox', { name: 'contest.yaml' });
    expect(text).toHaveValue('name: Spring\nstart: [\nmine');
    expect(text).not.toHaveAttribute('readonly');
    const save = saveButton();
    expect(save).not.toHaveAttribute('data-loading');

    await userEvent.click(save);
    const alert = await conflict();
    expect(
      await within(alert).findByRole('textbox', {
        name: 'Their version, as it is now',
      }),
    ).toHaveValue(THEIRS.content);
    expect(sent[0]).toMatchObject({ token: 'token-broken' });
  });

  it('saves one’s own over theirs only after a warning', async () => {
    const sent = conflicting();
    const user = userEvent.setup();
    renderApp(CONTEST_SETTINGS);

    await user.type(await settingsText(), 'mine');
    await user.click(saveButton());
    const alert = await conflict();
    await user.click(
      await within(alert).findByRole('button', { name: 'Save yours over theirs' }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Save yours over theirs?',
    });
    expect(dialog).toHaveTextContent('Their change to these settings is thrown away');
    await user.click(
      within(dialog).getByRole('button', { name: 'Save yours over theirs' }),
    );

    expect(await screen.findByText(/Saved as version/)).toBeVisible();
    expect(sent[1]).toMatchObject({
      content: 'name: Spring\nstart: [\nmine',
      token: 'token-theirs',
    });
  });
});

describe('mending settings that do not read', () => {
  const TASK_FILE = `${TASK_API}/files/:path`;
  const BROKEN_TASK = 'name: sum\nworkflow: [unicon/classic@v2\n';

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
              content: BROKEN_TASK,
              token: 'token-broken',
              upload: null,
              version: '3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d',
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

  it('holds the text as it was asked about while a save asks before it publishes', async () => {
    brokenBackend(() =>
      problem(409, 'confirmation_required', {
        changes: [],
        regrades: 0,
        summary: 'Nobody’s result changes.',
        asked: 'b1c2d3e:12',
      }),
    );
    renderApp(TASK_SETTINGS);

    await userEvent.type(
      await screen.findByRole('textbox', { name: 'task.yaml' }),
      'x',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByRole('button', { name: 'Publish the change' }),
    ).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'task.yaml' })).toHaveAttribute(
      'readonly',
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
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
      await screen.findByText('See who can on the organisers page.'),
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
    renderApp(`${CONTEST_SETTINGS}#file`);

    const part = await stored();
    expect(
      await within(part).findByText(
        'These settings cannot be read, so the pages cannot change them.',
      ),
    ).toBeVisible();
    expect(within(part).getByRole('list', { name: 'Errors' })).toHaveTextContent(
      'invite_only is retired',
    );
    expect(
      within(part).getByRole('textbox', { name: 'contest.yaml' }),
    ).not.toHaveAttribute('readonly');
    expect(within(part).getByRole('button', { name: 'Save' })).toBeVisible();
  });

  it('leads from the form that cannot read the settings to where they are fixed', async () => {
    server.use(signedIn, taskList, ...brokenContest(), ...repoFiles);
    renderApp(CONTEST_SETTINGS);

    expect(
      await screen.findByText(
        'These settings cannot be read, so they cannot be changed here.',
        {
          exact: false,
        },
      ),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'the stored settings' })).toHaveAttribute(
      'href',
      `${CONTEST_SETTINGS}#file`,
    );
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
