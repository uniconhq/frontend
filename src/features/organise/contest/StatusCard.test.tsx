import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@/test/user-event';
import { http, HttpResponse } from 'msw';
import { parse } from 'yaml';
import type { FileContent, TaskStanding } from '@/api/types';
import { formatDateTime } from '@/lib/time';
import { renderApp } from '@/test/render';
import { problem, server, signedIn, someone } from '@/test/server';
import { CONTEST_API, files, repoFiles, standings } from '@/test/organiser';

const CONTEST = '/orgs/acme/contests/spring';
const FILE = `${CONTEST_API}/files/:path`;

/** Both tasks published without problems. */
const ready: TaskStanding[] = standings.map((standing) => ({
  ...standing,
  state: { ...standing.state, draft: false, errors: [] },
}));

/** The settings as given, with each save taken and the settings becoming it. */
function settingsAt(lines: string[]) {
  let file: FileContent = {
    ...files['contest.yaml']!,
    content: [...lines, ''].join('\n'),
  };
  const sent: string[] = [];
  server.use(
    http.get(FILE, ({ params }) =>
      params['path'] === 'contest.yaml' ? HttpResponse.json(file) : undefined,
    ),
    http.put(FILE, async ({ request }) => {
      const body = (await request.json()) as { content: string };
      sent.push(body.content);
      file = { ...file, content: body.content, token: `token-${String(sent.length)}` };
      return HttpResponse.json({ version: `v${String(sent.length)}`, notes: [] });
    }),
  );
  return sent;
}

const DRAFT = [
  'name: Spring',
  'start: 2030-10-01T09:00:00Z',
  'end: 2030-10-15T09:00:00Z',
  'state: draft',
  'visibility: signed-in',
  'leaderboards: [{name: Standings, who: contestants}]',
  'tasks: [{id: sort}, {id: sum}]',
];

async function status(): Promise<HTMLElement> {
  return screen.findByRole('region', { name: 'Status' });
}

describe("the contest's status", () => {
  it('says a draft is seen by its organisers alone, and lists what opening it needs', async () => {
    server.use(
      signedIn,
      ...repoFiles,
      http.get(`${CONTEST_API}/organise/tasks`, () => HttpResponse.json(standings)),
    );
    settingsAt(DRAFT.filter((line) => !line.startsWith('leaderboards')));
    renderApp(CONTEST);

    const card = await status();
    await waitFor(() =>
      expect(card).toHaveTextContent('DraftOnly its organisers can see it.'),
    );
    const list = await within(card).findByRole('list', { name: 'Before it opens' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      '✓Name and times set',
      '✓At least one task',
      '✓A · sort: published',
      '✗B · sum: its last save has problems',
      '✓Anyone with an account can register from when the contest opens until the contest ends. An organiser approves each one.',
      '!No leaderboard yet, so nobody sees a ranking. The contest can open without one.',
    ]);
    expect(within(list).getByRole('link', { name: /B · sum/ })).toHaveAttribute(
      'href',
      '/orgs/acme/contests/spring/tasks/sum',
    );
    expect(
      within(card).getByRole('button', { name: 'Open the contest' }),
    ).toBeDisabled();
  });

  it('opens the contest after saying what will happen', async () => {
    server.use(
      signedIn,
      ...repoFiles,
      http.get(`${CONTEST_API}/organise/tasks`, () => HttpResponse.json(ready)),
    );
    const sent = settingsAt(DRAFT);
    const user = userEvent.setup();
    renderApp(CONTEST);

    const card = await status();
    const open = await within(card).findByRole('button', { name: 'Open the contest' });
    await waitFor(() => expect(open).toBeEnabled());
    await user.click(open);
    const dialog = await screen.findByRole('dialog', { name: 'Open the contest?' });
    expect(dialog).toHaveTextContent('Anyone signed in can see it.');
    expect(dialog).toHaveTextContent('Registration opens now.');
    expect(dialog).toHaveTextContent(
      `It starts ${formatDateTime(new Date('2030-10-01T09:00:00Z'))}.`,
    );
    await user.click(within(dialog).getByRole('button', { name: 'Open the contest' }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect((parse(sent[0] ?? '') as { state: string }).state).toBe('published');
    expect(await within(card).findByText(/^Live$/)).toBeVisible();
  });

  it('takes a live contest back to draft before its start, and says why when the forge refuses', async () => {
    server.use(
      signedIn,
      ...repoFiles,
      http.get(`${CONTEST_API}/organise/tasks`, () => HttpResponse.json(ready)),
    );
    settingsAt(
      DRAFT.map((line) => (line === 'state: draft' ? 'state: published' : line)),
    );
    server.use(
      http.put(FILE, () =>
        problem(422, 'invalid_definition', {
          errors: [
            {
              path: 'state',
              message: 'The contest has started, so it can no longer go back to draft.',
            },
          ],
        }),
      ),
    );
    const user = userEvent.setup();
    renderApp(CONTEST);

    const card = await status();
    await waitFor(() =>
      expect(card).toHaveTextContent(
        `Anyone signed in can see it. It starts ${formatDateTime(new Date('2030-10-01T09:00:00Z'))}.`,
      ),
    );
    await user.click(
      await within(card).findByRole('button', { name: 'Back to draft' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Back to draft?' });
    await user.click(within(dialog).getByRole('button', { name: 'Back to draft' }));

    // The refusal is about this card's own setting: said on its own, here.
    const alert = await within(card).findByRole('alert');
    expect(alert).toHaveTextContent(
      /^The contest has started, so it can no longer go back to draft\.$/,
    );
  });

  it('archives a contest that has ended, asked first', async () => {
    server.use(
      signedIn,
      ...repoFiles,
      http.get(`${CONTEST_API}/organise/tasks`, () => HttpResponse.json(ready)),
    );
    const sent = settingsAt([
      'name: Spring',
      'start: 2026-09-01T09:00:00Z',
      'end: 2026-09-02T09:00:00Z',
      'state: published',
      'visibility: everyone',
    ]);
    const user = userEvent.setup();
    renderApp(CONTEST);

    const card = await status();
    await waitFor(() => expect(card).toHaveTextContent('Ended'));
    await user.click(await within(card).findByRole('button', { name: 'Archive' }));
    const dialog = await screen.findByRole('dialog', { name: 'Archive the contest?' });
    await user.click(within(dialog).getByRole('button', { name: 'Archive' }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect((parse(sent[0] ?? '') as { state: string }).state).toBe('archived');
  });

  it('changes who sees it in words', async () => {
    server.use(
      signedIn,
      ...repoFiles,
      http.get(`${CONTEST_API}/organise/tasks`, () => HttpResponse.json(ready)),
    );
    const sent = settingsAt(DRAFT);
    const user = userEvent.setup();
    renderApp(CONTEST);

    const card = await status();
    await waitFor(() =>
      expect(card).toHaveTextContent('Who sees it: Anyone signed in'),
    );
    await user.click(within(card).getByRole('button', { name: 'Change who sees it' }));
    const dialog = await screen.findByRole('dialog', { name: 'Who sees it' });
    await user.click(
      within(dialog).getByRole('radio', { name: 'Only its entrants and organisers' }),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect((parse(sent[0] ?? '') as { visibility: string }).visibility).toBe('hidden');
  });

  it('offers a manager none of the buttons, which are an admin’s', async () => {
    server.use(
      http.get('/api/v1/me', () =>
        HttpResponse.json({
          ...someone,
          roles: [
            { names: { org: 'acme', contest: 'spring', task: null }, role: 'manager' },
          ],
        }),
      ),
      ...repoFiles,
      http.get(`${CONTEST_API}/organise/tasks`, () => HttpResponse.json(ready)),
    );
    settingsAt(DRAFT);
    renderApp(CONTEST);

    const card = await status();
    expect(
      await within(card).findByText('Only an admin of the contest can open it.'),
    ).toBeVisible();
    expect(within(card).queryByRole('button', { name: 'Open the contest' })).toBeNull();
    expect(
      within(card).queryByRole('button', { name: 'Change who sees it' }),
    ).toBeNull();
  });
});
