import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@/test/user-event';
import { http, HttpResponse } from 'msw';
import { parse } from 'yaml';
import type { FileContent } from '@/api/types';
import { renderApp } from '@/test/render';
import { problem, server, signedIn, someone } from '@/test/server';
import { CONTEST_API, repoFiles, taskList } from '@/test/organiser';
import { comeBackToTab, fakeLiveStream, openStream, realLiveStream } from '@/test/live';
import { isoOf } from './times';

const CONTEST = `name: Spring   # the page's title
description: A short paragraph
start: 2026-06-01T09:00:00Z
end: 2026-06-01T14:00:00Z
state: draft
visibility: signed-in
registration:
  capacity: 100
leaderboards:
  - name: Standings
    who: contestants
tasks:
  - {id: sum, worth: 100}
  - id: sort
    worth: 50
`;

const FILE = `${CONTEST_API}/files/:path`;
const PAGE = '/orgs/acme/contests/spring/settings';

/**
 * The spring contest with `contest.yaml` holding `current`. Each write is
 * taken and the file becomes it, except that with `conflictWith` the first
 * write is refused as a conflict and the file becomes that text instead, as
 * if someone else had saved it. Each write taken answers `notes`, what the
 * boards report. `sent` holds each write's body.
 */
function contestBackend({
  current = CONTEST,
  conflictWith,
  notes = [],
}: { current?: string; conflictWith?: string; notes?: string[] } = {}) {
  let file: FileContent = {
    path: 'contest.yaml',
    encoding: 'utf-8',
    content: current,
    token: 'token-1',
    upload: null,
  };
  let conflicted = conflictWith === undefined;
  const sent: { content: string; token: string }[] = [];
  server.use(
    signedIn,
    taskList,
    http.get(FILE, ({ params }) =>
      params['path'] === 'contest.yaml' ? HttpResponse.json(file) : undefined,
    ),
    http.put(FILE, async ({ request }) => {
      const body = (await request.json()) as { content: string; token: string };
      sent.push(body);
      if (!conflicted && conflictWith !== undefined) {
        conflicted = true;
        file = { ...file, content: conflictWith, token: 'token-2' };
        return problem(409, 'conflict');
      }
      // A save made with the token of a version since saved over is refused.
      if (body.token !== file.token) return problem(409, 'conflict');
      const token = `token-${String(sent.length + 2)}`;
      file = { ...file, content: body.content, token };
      return HttpResponse.json({ version: `version-${token}`, notes });
    }),
    ...repoFiles,
  );
  /** Someone else saving the settings as `content`. */
  const elsewhere = (content: string) => {
    file = { ...file, content, token: 'token-elsewhere' };
  };
  return { sent, elsewhere };
}

/** Set a field's value at once, as a paste would. */
function fill(field: HTMLElement, value: string) {
  fireEvent.change(field, { target: { value } });
}

/** The fields of one section of the form, found by its title. */
function inBox(form: HTMLElement, name: string | RegExp) {
  return within(within(form).getByRole('group', { name }));
}

async function openForm() {
  renderApp(PAGE);
  return screen.findByRole('form', { name: 'Contest settings' });
}

function asManager() {
  server.use(
    http.get('/api/v1/me', () =>
      HttpResponse.json({
        ...someone,
        roles: [
          { names: { org: 'acme', contest: 'spring', task: null }, role: 'manager' },
        ],
      }),
    ),
  );
}

describe('the contest settings form', { timeout: 20_000 }, () => {
  it('holds the settings in sections, each saying what it is for', async () => {
    contestBackend();
    const form = await openForm();

    expect(
      within(form)
        .getAllByRole('group')
        .filter((group) => group.tagName === 'FIELDSET')
        .map((group) => group.querySelector('legend')?.textContent),
    ).toEqual(['Basics', 'Schedule', 'Teams', 'When grading fails']);
    expect(within(form).queryByLabelText('State')).toBeNull();
    expect(within(form).queryByLabelText('Who sees it')).toBeNull();
    expect(screen.getByRole('link', { name: 'View file' })).toHaveAttribute(
      'href',
      '/orgs/acme/contests/spring/files?file=contest.yaml',
    );
  });

  it("lets an admin change every setting here, and writes only those into the organiser's file", async () => {
    const { sent } = contestBackend();
    const form = await openForm();

    fill(inBox(form, 'Basics').getByLabelText('Name'), 'Spring 2026');
    fill(
      inBox(form, 'Basics').getByLabelText('Description'),
      'Two lines\nof description',
    );
    fill(inBox(form, 'Schedule').getByLabelText(/^Start/), '2026-06-01T10:00');
    fill(inBox(form, 'Schedule').getByLabelText(/^End/), '2026-06-01T23:30');
    const teams = inBox(form, 'Teams');
    await userEvent.click(teams.getByRole('radio', { name: 'In teams' }));
    fill(teams.getByLabelText('Most people in a team'), '3');
    fill(teams.getByLabelText('Fewest people in a team'), '2');
    await userEvent.click(
      teams.getByRole('radio', { name: 'At a team’s first submission' }),
    );
    await userEvent.click(
      inBox(form, 'When grading fails').getByRole('radio', {
        name: 'Uses its last good result',
      }),
    );
    await userEvent.click(within(form).getByRole('button', { name: 'Save settings' }));

    expect(await screen.findByText('Saved.')).toBeVisible();
    expect(sent).toHaveLength(1);
    const [write] = sent;
    expect(write?.token).toBe('token-1');
    expect(parse(write?.content ?? '')).toEqual({
      name: 'Spring 2026',
      description: 'Two lines\nof description',
      start: isoOf('2026-06-01T10:00'),
      end: isoOf('2026-06-01T23:30'),
      state: 'draft',
      visibility: 'signed-in',
      registration: { capacity: 100 },
      leaderboards: [{ name: 'Standings', who: 'contestants' }],
      tasks: [
        { id: 'sum', worth: 100 },
        { id: 'sort', worth: 50 },
      ],
      entrants: { most: 3, fewest: 2, locks: 'first_submission' },
      on_system_error: 'last_result',
    });
    expect(write?.content).toContain("# the page's title");
  });

  it('takes the team settings away when people enter alone again', async () => {
    const { sent } = contestBackend({
      current: `${CONTEST}entrants:\n  most: 3\n  fewest: 2\n`,
    });
    const form = await openForm();

    await userEvent.click(inBox(form, 'Teams').getByRole('radio', { name: 'Alone' }));
    expect(inBox(form, 'Teams').queryByLabelText('Most people in a team')).toBeNull();
    await userEvent.click(within(form).getByRole('button', { name: 'Save settings' }));

    await screen.findByText('Saved.');
    expect(parse(sent[0]?.content ?? '')).not.toHaveProperty('entrants');
  });

  it('will not save a team whose fewest is more than its most', async () => {
    contestBackend({ current: `${CONTEST}entrants: {most: 3}\n` });
    const form = await openForm();

    fill(inBox(form, 'Teams').getByLabelText('Fewest people in a team'), '4');

    expect(
      inBox(form, 'Teams').getByLabelText('Fewest people in a team'),
    ).toBeInvalid();
    expect(within(form).getByRole('button', { name: 'Save settings' })).toBeDisabled();
  });

  it('shows the notes the boards report once the save is written', async () => {
    contestBackend({ notes: ['Standings counts nothing from sort.'] });
    const form = await openForm();

    fill(inBox(form, 'Basics').getByLabelText('Name'), 'Spring 2026');
    await userEvent.click(within(form).getByRole('button', { name: 'Save settings' }));

    expect(await screen.findByText('Saved.')).toBeVisible();
    const notes = screen.getByRole('list', { name: 'Notes' });
    expect(
      within(notes).getByText('Standings counts nothing from sort.'),
    ).toBeVisible();
  });

  it("shows a manager the admin's settings read-only and saves the manager's own", async () => {
    const { sent } = contestBackend();
    asManager();
    const form = await openForm();

    expect(inBox(form, 'Basics').getByLabelText('Name')).toBeDisabled();
    expect(inBox(form, 'Basics').getByLabelText('Description')).toHaveAttribute(
      'readonly',
    );
    expect(form).toHaveTextContent('Only an admin of the contest can change these.');

    fill(inBox(form, 'Schedule').getByLabelText(/^End/), '2026-06-01T15:00');
    await userEvent.click(within(form).getByRole('button', { name: 'Save settings' }));

    await screen.findByText('Saved.');
    expect(parse(sent[0]?.content ?? '')).toEqual({
      ...(parse(CONTEST) as object),
      end: isoOf('2026-06-01T15:00'),
    });
  });

  it('names a refused setting in words and opens it with the field focused', async () => {
    contestBackend();
    server.use(
      http.put(FILE, () =>
        problem(422, 'invalid_definition', {
          errors: [{ path: 'end', message: 'Must be after start.' }],
        }),
      ),
    );
    const user = userEvent.setup();
    const form = await openForm();
    fill(inBox(form, 'Schedule').getByLabelText(/^End/), '2026-06-01T08:00');
    await user.click(within(form).getByRole('button', { name: 'Save settings' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Nothing was saved');
    const link = within(alert).getByRole('link', { name: 'Settings, Schedule: End' });
    expect(link).toHaveAttribute('href', `${PAGE}?field=end`);
    expect(alert).toHaveTextContent('Settings, Schedule: End: Must be after start.');
    await user.click(link);

    await waitFor(() => expect(screen.getByLabelText(/^End/)).toHaveFocus());
  });

  it('shows both versions field by field in words on a conflict, and saves the fields picked', async () => {
    const theirs = CONTEST.replace('state: draft', 'state: published').replace(
      'name: Spring',
      'name: Their spring',
    );
    const { sent } = contestBackend({ conflictWith: theirs });
    const form = await openForm();

    fill(inBox(form, 'Basics').getByLabelText('Name'), 'My spring');
    await userEvent.click(
      inBox(form, 'Teams').getByRole('radio', { name: 'In teams' }),
    );
    fill(inBox(form, 'Teams').getByLabelText('Most people in a team'), '2');
    await userEvent.click(within(form).getByRole('button', { name: 'Save settings' }));

    const merge = await screen.findByRole('list', { name: 'Fields that differ' });
    const name = within(merge).getByRole('radiogroup', {
      name: 'Name (both changed it)',
    });
    expect(within(name).getByRole('radio', { name: 'Yours: My spring' })).toBeChecked();
    const state = within(merge).getByRole('radiogroup', {
      name: 'Open, draft or archived',
    });
    expect(within(state).getByRole('radio', { name: 'Now: Open' })).toBeChecked();
    const teams = within(merge).getByRole('radiogroup', { name: 'Teams' });
    expect(
      within(teams).getByRole('radio', { name: 'Yours: Most people in a team: 2' }),
    ).toBeChecked();
    expect(merge).not.toHaveTextContent('entrants');
    expect(sent).toHaveLength(1);

    await userEvent.click(
      within(name).getByRole('radio', { name: 'Now: Their spring' }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Save the merged version' }),
    );

    await screen.findByText('Saved.');
    expect(sent).toHaveLength(2);
    expect(sent[1]?.token).toBe('token-2');
    expect(parse(sent[1]?.content ?? '')).toEqual({
      ...(parse(theirs) as object),
      entrants: { most: 2 },
    });
  });

  it('saves the whole of one’s own version over theirs only after a warning', async () => {
    const theirs = CONTEST.replace('name: Spring', 'name: Their spring');
    const { sent } = contestBackend({ conflictWith: theirs });
    const form = await openForm();
    fill(inBox(form, 'Basics').getByLabelText('Name'), 'My spring');
    await userEvent.click(within(form).getByRole('button', { name: 'Save settings' }));

    await screen.findByRole('list', { name: 'Fields that differ' });
    await userEvent.click(
      screen.getByRole('button', { name: 'Save mine over theirs' }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Save yours over theirs?',
    });
    expect(dialog).toHaveTextContent(
      'This throws away what the other person changed in Name.',
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Save mine over theirs' }),
    );

    await screen.findByText('Saved.');
    expect((parse(sent[1]?.content ?? '') as { name: string }).name).toBe('My spring');
  });

  it('keeps the merge open with the choices made when the merged version is refused', async () => {
    const theirs = CONTEST.replace('name: Spring', 'name: Their spring');
    contestBackend({ conflictWith: theirs });
    const form = await openForm();
    fill(inBox(form, 'Basics').getByLabelText('Name'), 'My spring');
    await userEvent.click(within(form).getByRole('button', { name: 'Save settings' }));
    const merge = await screen.findByRole('list', { name: 'Fields that differ' });
    const name = within(merge).getByRole('radiogroup', {
      name: 'Name (both changed it)',
    });
    await userEvent.click(
      within(name).getByRole('radio', { name: 'Now: Their spring' }),
    );
    server.use(
      http.put(FILE, () =>
        problem(422, 'invalid_definition', {
          errors: [{ path: 'name', message: 'The name is refused.' }],
        }),
      ),
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Save the merged version' }),
    );

    expect(await screen.findByText(/The name is refused./)).toBeVisible();
    const kept = screen.getByRole('list', { name: 'Fields that differ' });
    expect(
      within(kept).getByRole('radio', { name: 'Now: Their spring' }),
    ).toBeChecked();
  });

  it("holds a manager's admin-only fields to the current version in the merge", async () => {
    const theirs = CONTEST.replace('name: Spring', 'name: Their spring').replace(
      'start: 2026-06-01T09:00:00Z',
      'start: 2026-06-01T17:00:00+08:00',
    );
    const { sent } = contestBackend({ conflictWith: theirs });
    asManager();
    const form = await openForm();
    fill(inBox(form, 'Schedule').getByLabelText(/^End/), '2026-06-01T15:00');
    await userEvent.click(within(form).getByRole('button', { name: 'Save settings' }));

    const merge = await screen.findByRole('list', { name: 'Fields that differ' });
    const name = within(merge).getByRole('radiogroup', { name: 'Name' });
    expect(
      within(name).getByRole('radio', { name: 'Now: Their spring' }),
    ).toBeChecked();
    for (const radio of within(name).getAllByRole('radio'))
      expect(radio).toBeDisabled();
    expect(within(merge).queryByRole('radiogroup', { name: 'Start' })).toBeNull();

    await userEvent.click(
      screen.getByRole('button', { name: 'Save the merged version' }),
    );
    await screen.findByText('Saved.');
    expect(parse(sent[1]?.content ?? '')).toEqual({
      ...(parse(theirs) as object),
      end: isoOf('2026-06-01T15:00'),
    });
  });

  it('says settings that cannot be read cannot be changed, rather than offering the text', async () => {
    contestBackend({ current: 'name: [Spring\n' });
    renderApp(PAGE);

    expect(
      await screen.findByText(
        'These settings cannot be read, so they cannot be changed here.',
      ),
    ).toBeVisible();
    expect(screen.queryByRole('form', { name: 'Contest settings' })).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'contest.yaml' })).toBeNull();
  });
});

describe(
  'the contest settings while they are being changed',
  { timeout: 20_000 },
  () => {
    beforeEach(fakeLiveStream);
    afterEach(realLiveStream);

    it('keeps what was changed, and does not spin, when the tab comes back, and meets someone else’s save at the save', async () => {
      const { sent, elsewhere } = contestBackend();
      const form = await openForm();
      openStream();
      fill(inBox(form, 'Basics').getByLabelText('Name'), 'My spring');

      elsewhere(CONTEST.replace('name: Spring', 'name: Their spring'));
      comeBackToTab();
      await new Promise((resolve) => setTimeout(resolve, 300));

      const now = screen.getByRole('form', { name: 'Contest settings' });
      expect(inBox(now, 'Basics').getByLabelText('Name')).toHaveValue('My spring');
      const save = within(now).getByRole('button', { name: 'Save settings' });
      expect(save).not.toHaveAttribute('data-loading');
      expect(save).toBeEnabled();

      await userEvent.click(save);

      const merge = await screen.findByRole('list', { name: 'Fields that differ' });
      expect(
        within(merge).getByRole('radiogroup', { name: 'Name (both changed it)' }),
      ).toBeVisible();
      expect(sent).toEqual([expect.objectContaining({ token: 'token-1' })]);
    });
  },
);
