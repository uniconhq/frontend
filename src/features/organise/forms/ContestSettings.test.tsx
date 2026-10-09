import { describe, expect, it } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { parse } from 'yaml';
import type { FileContent } from '@/api/types';
import { renderApp } from '@/test/render';
import { problem, server, signedIn, someone } from '@/test/server';
import { CONTEST_API, repoFiles, taskList } from '@/test/organiser';
import { isoOf } from './times';

const CONTEST = `name: Spring   # the page's title
description: A short paragraph
start: 2026-06-01T09:00:00Z
end: 2026-06-01T14:00:00Z
state: draft
visibility: signed-in
registration:
  approval: manual
leaderboards:
  - name: Standings
    who: contestants
tasks:
  - {id: sum, worth: 100}
  - id: sort
    worth: 50
`;

const FILE = `${CONTEST_API}/files/:path`;

/**
 * The spring contest with `contest.yaml` holding `current`. Each write is
 * taken and the file becomes it, except that with `conflictWith` the first
 * write is refused as a conflict and the file becomes that text instead, as
 * if someone else had saved it. `sent` holds each write's body.
 */
function contestBackend({
  current = CONTEST,
  conflictWith,
}: { current?: string; conflictWith?: string } = {}) {
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
      const token = `token-${String(sent.length + 2)}`;
      file = { ...file, content: body.content, token };
      return HttpResponse.json({ version: `version-${token}` });
    }),
    ...repoFiles,
  );
  return { sent };
}

/** Set a field's value at once, as a paste would. */
function fill(field: HTMLElement, value: string) {
  fireEvent.change(field, { target: { value } });
}

async function openForm() {
  renderApp('/orgs/acme/contests/spring');
  await userEvent.click(
    await screen.findByRole('button', { name: 'Edit the settings' }),
  );
  return screen.findByRole('form', { name: 'Contest settings' });
}

describe('the contest settings form', { timeout: 20_000 }, () => {
  it("lets an admin change every key, and writes only those into the organiser's file", async () => {
    const { sent } = contestBackend();
    const form = await openForm();
    const field = (name: string) => within(form).getByLabelText(name);

    fill(field('Name'), 'Spring 2026');
    fill(field('Description'), 'Two lines\nof description');
    await userEvent.selectOptions(field('State'), 'published');
    await userEvent.selectOptions(field('Who sees it'), 'everyone');
    await userEvent.click(
      within(form).getByRole('checkbox', { name: 'By invitation only' }),
    );
    fill(field('Registration opens'), '2026-05-01T08:00');
    await userEvent.selectOptions(field('Approval'), 'auto');
    fill(field('Capacity'), '500');
    fill(field('Code'), 'olympiad');
    fill(field('Email pattern'), '.*@u\\.nus\\.edu');
    fill(field('Registration closes'), '2026-06-01T09:00');
    fill(field('Start'), '2026-06-01T10:00');
    fill(field('A released at'), '2026-06-01T11:00');
    fill(field('A closes'), '2026-06-01T22:00');
    fill(field('A marks'), '2');
    fill(field('End'), '2026-06-01T23:30');
    fill(field('Team size'), '3');
    await userEvent.selectOptions(
      field('A submission whose grading broke counts as'),
      'last_result',
    );
    fill(field('B worth'), '70');
    fill(field('B due'), '2026-06-01T20:00');
    fill(field('B taken off per late day'), '0.1');
    await userEvent.click(within(form).getByRole('button', { name: 'Move sort up' }));
    await userEvent.click(within(form).getByRole('button', { name: 'Save settings' }));

    expect(await screen.findByText(/Saved as version/)).toBeVisible();
    expect(sent).toHaveLength(1);
    const [write] = sent;
    expect(write?.token).toBe('token-1');
    expect(parse(write?.content ?? '')).toEqual({
      name: 'Spring 2026',
      description: 'Two lines\nof description',
      start: isoOf('2026-06-01T10:00'),
      end: isoOf('2026-06-01T23:30'),
      state: 'published',
      visibility: 'everyone',
      registration: {
        approval: 'auto',
        invite_only: true,
        opens: isoOf('2026-05-01T08:00'),
        closes: isoOf('2026-06-01T09:00'),
        code: 'olympiad',
        email_pattern: '.*@u\\.nus\\.edu',
        capacity: 500,
      },
      leaderboards: [{ name: 'Standings', who: 'contestants' }],
      tasks: [
        { id: 'sort', worth: 70, due: isoOf('2026-06-01T20:00'), late_per_day: 0.1 },
        {
          id: 'sum',
          worth: 100,
          release_at: isoOf('2026-06-01T11:00'),
          closes: isoOf('2026-06-01T22:00'),
          marks: 2,
        },
      ],
      team_size: 3,
      on_system_error: 'last_result',
    });
    expect(write?.content).toContain("# the page's title");
    expect(write?.content).toContain('leaderboards:\n  - name: Standings\n');
  });

  it("shows a manager the admin's keys read-only and saves the manager's own", async () => {
    const { sent } = contestBackend();
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
    const form = await openForm();
    const field = (name: string) => within(form).getByLabelText(name);

    for (const name of [
      'Name',
      'State',
      'Who sees it',
      'Approval',
      'Code',
      'Capacity',
    ]) {
      expect(field(name)).toBeDisabled();
    }
    expect(
      within(form).getByRole('checkbox', { name: 'By invitation only' }),
    ).toBeDisabled();
    expect(field('Description')).toHaveAttribute('readonly');

    await userEvent.clear(field('A worth'));
    await userEvent.type(field('A worth'), '120');
    await userEvent.click(within(form).getByRole('button', { name: 'Save settings' }));

    await screen.findByText(/Saved as version/);
    expect(parse(sent[0]?.content ?? '')).toEqual({
      ...(parse(CONTEST) as object),
      tasks: [
        { id: 'sum', worth: 120 },
        { id: 'sort', worth: 50 },
      ],
    });
  });

  it('shows both versions field by field on a conflict, and saves the fields picked', async () => {
    const theirs = CONTEST.replace('state: draft', 'state: published').replace(
      'name: Spring',
      'name: Their spring',
    );
    const { sent } = contestBackend({ conflictWith: theirs });
    const form = await openForm();
    const field = (name: string) => within(form).getByLabelText(name);

    await userEvent.clear(field('Name'));
    await userEvent.type(field('Name'), 'My spring');
    await userEvent.type(field('Team size'), '2');
    await userEvent.click(within(form).getByRole('button', { name: 'Save settings' }));

    const merge = await screen.findByRole('list', { name: 'Fields that differ' });
    const name = within(merge).getByRole('radiogroup', {
      name: 'name (both changed it)',
    });
    expect(within(name).getByRole('radio', { name: 'Yours: My spring' })).toBeChecked();
    const state = within(merge).getByRole('radiogroup', { name: 'state' });
    expect(within(state).getByRole('radio', { name: 'Now: published' })).toBeChecked();
    const teams = within(merge).getByRole('radiogroup', { name: 'team_size' });
    expect(within(teams).getByRole('radio', { name: 'Yours: 2' })).toBeChecked();
    expect(sent).toHaveLength(1);

    await userEvent.click(
      within(name).getByRole('radio', { name: 'Now: Their spring' }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Save the merged version' }),
    );

    await screen.findByText(/Saved as version/);
    expect(sent).toHaveLength(2);
    expect(sent[1]?.token).toBe('token-2');
    expect(parse(sent[1]?.content ?? '')).toEqual({
      ...(parse(theirs) as object),
      team_size: 2,
    });
  });

  it("holds a manager's admin-only fields to the current version in the merge", async () => {
    const theirs = CONTEST.replace('name: Spring', 'name: Their spring').replace(
      'start: 2026-06-01T09:00:00Z',
      'start: 2026-06-01T17:00:00+08:00',
    );
    const { sent } = contestBackend({ conflictWith: theirs });
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
    const form = await openForm();
    fill(within(form).getByLabelText('B worth'), '70');
    await userEvent.click(within(form).getByRole('button', { name: 'Save settings' }));

    const merge = await screen.findByRole('list', { name: 'Fields that differ' });
    // The start names the same moment on both sides, so it is no row.
    expect(within(merge).getAllByRole('radiogroup')).toHaveLength(2);
    const name = within(merge).getByRole('radiogroup', { name: 'name' });
    expect(
      within(name).getByRole('radio', { name: 'Now: Their spring' }),
    ).toBeChecked();
    expect(within(name).getByRole('radio', { name: 'Yours: Spring' })).toBeDisabled();
    const worth = within(merge).getByRole('radiogroup', { name: 'tasks[sort].worth' });
    expect(within(worth).getByRole('radio', { name: 'Yours: 70' })).toBeChecked();

    await userEvent.click(
      screen.getByRole('button', { name: 'Save the merged version' }),
    );
    await screen.findByText(/Saved as version/);
    expect(parse(sent[1]?.content ?? '')).toEqual({
      ...(parse(theirs) as object),
      tasks: [
        { id: 'sum', worth: 100 },
        { id: 'sort', worth: 70 },
      ],
    });
  });

  it('builds a board from its fields that reads as the same board written by hand', async () => {
    const { sent } = contestBackend();
    const form = await openForm();
    const field = (name: string) => within(form).getByLabelText(name);

    await userEvent.click(within(form).getByRole('button', { name: 'Add a board' }));
    fill(field('Board 2 name'), 'ICPC');
    await userEvent.selectOptions(field('Board 2 shown to'), 'everyone');
    await userEvent.click(
      within(form).getByRole('checkbox', { name: 'Board 2 covers every task' }),
    );
    await userEvent.click(
      within(form).getByRole('checkbox', { name: 'Board 2 covers sort' }),
    );
    await userEvent.click(
      within(form).getByRole('button', { name: 'Add a key to Board 2' }),
    );
    await userEvent.selectOptions(field('Board 2 key 2'), 'penalty');
    fill(field('Board 2 key 2 minutes per earlier attempt'), '20');
    await userEvent.click(within(form).getByRole('button', { name: 'Save settings' }));

    expect(await screen.findByText(/Saved as version/)).toBeVisible();
    const byHand = parse(`
- name: Standings
  who: contestants
- {name: ICPC, tasks: [sum], order: [points, {by: penalty, per_attempt: 20}], who: everyone}
`) as unknown;
    const written = sent[0]?.content ?? '';
    expect((parse(written) as { leaderboards: unknown }).leaderboards).toEqual(byHand);
    expect(written).toContain('    order: [points, {by: penalty, per_attempt: 20}]\n');
    expect(written).toContain(
      'leaderboards:\n  - name: Standings\n    who: contestants\n',
    );
  });

  it('says on the key itself that a save refused penalty as the first key', async () => {
    contestBackend();
    server.use(
      http.put(FILE, () =>
        problem(422, 'invalid_definition', {
          errors: [
            {
              path: 'leaderboards[0].order[0]',
              message:
                'penalty is never the first key: it breaks ties among rows equal on the keys before it.',
            },
          ],
        }),
      ),
    );
    const form = await openForm();
    const field = (name: string) => within(form).getByLabelText(name);

    expect(within(form).getByText('Points alone, the default.')).toBeVisible();
    await userEvent.click(
      within(form).getByRole('button', { name: 'Add a key to Board 1' }),
    );
    await userEvent.selectOptions(field('Board 1 key 1'), 'penalty');
    await userEvent.click(within(form).getByRole('button', { name: 'Save settings' }));

    expect(await screen.findByText('leaderboards[0].order[0]')).toBeVisible();
    const key = field('Board 1 key 1');
    expect(key).toBeInvalid();
    expect(key).toHaveAccessibleDescription(/penalty is never the first key/);
    expect(field('Board 1 name')).toBeValid();
  });

  it('removes a board, and the key with the last of them', async () => {
    const { sent } = contestBackend();
    const form = await openForm();

    await userEvent.click(within(form).getByRole('button', { name: 'Remove Board 1' }));
    expect(within(form).getByText('No leaderboards yet.')).toBeVisible();
    await userEvent.click(within(form).getByRole('button', { name: 'Save settings' }));

    await screen.findByText(/Saved as version/);
    const written = parse(sent[0]?.content ?? '') as Record<string, unknown>;
    expect(written).not.toHaveProperty('leaderboards');
    expect(written['tasks']).toEqual([
      { id: 'sum', worth: 100 },
      { id: 'sort', worth: 50 },
    ]);
  });

  it('leaves boards it cannot read to the text tab', async () => {
    contestBackend({
      current: CONTEST.replace(
        '  - name: Standings\n    who: contestants\n',
        '  - name: Standings\n    order: [{metric: points}]\n',
      ),
    });
    const form = await openForm();

    expect(
      within(form).getByText(
        'leaderboards is not a list of boards the form can read; edit it as text.',
      ),
    ).toBeVisible();
    expect(within(form).queryByRole('button', { name: 'Add a board' })).toBeNull();
  });

  it('falls back to the text with the reason when the file is not YAML', async () => {
    contestBackend({ current: 'name: [Spring\n' });
    renderApp('/orgs/acme/contests/spring');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Edit the settings' }),
    );

    expect(
      await screen.findByText(
        'The form cannot read contest.yaml, so it is open as text below.',
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole('form', { name: 'Contest settings' }),
    ).not.toBeInTheDocument();
  });
});
