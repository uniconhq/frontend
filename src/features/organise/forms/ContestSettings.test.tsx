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
