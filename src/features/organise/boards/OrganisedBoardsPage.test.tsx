import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@/test/user-event';
import { http, HttpResponse } from 'msw';
import { parse } from 'yaml';
import type { FileContent } from '@/api/types';
import { icpc, organised, row, cell, entrantOf } from '@/test/boards';
import { CONTEST_API, repoFiles, taskList } from '@/test/organiser';
import { renderApp } from '@/test/render';
import { problem, server, signedIn, someone } from '@/test/server';

const PAGE = '/orgs/acme/contests/spring/boards';
const FILE = `${CONTEST_API}/files/:path`;

const CONTEST = `name: Spring
start: 2026-06-01T09:00:00Z
end: 2026-06-01T14:00:00Z
state: draft
visibility: signed-in
leaderboards:
  - name: Standings
    who: contestants
tasks:
  - {id: sum}
  - {id: sort}
`;

/** Before B's final group is shown: kenny is level with ada now, ahead of her once it is. */
const final = icpc({
  not_in_view: [],
  rows: [
    row(1, 7, 'kenny', ['2', '115'], {
      sum: cell({
        counting: true,
        numbers: { points: '1', penalty: '45' },
        grading: 0,
      }),
      max: cell({
        counting: true,
        numbers: { points: '1', penalty: '70' },
        grading: 0,
      }),
    }),
    ...icpc().rows.filter((found) => found.row.name !== 'kenny'),
  ],
});

/** The contest's settings holding `current`, each save taken and the file becoming it. */
function settings(current = CONTEST) {
  let file: FileContent = {
    path: 'contest.yaml',
    encoding: 'utf-8',
    content: current,
    token: 'token-1',
    upload: null,
    version: '3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d',
  };
  const sent: string[] = [];
  server.use(
    taskList,
    http.get(FILE, ({ params }) =>
      params['path'] === 'contest.yaml' ? HttpResponse.json(file) : undefined,
    ),
    http.put(FILE, async ({ request }) => {
      const body = (await request.json()) as { content: string };
      sent.push(body.content);
      file = { ...file, content: body.content, token: 'token-2' };
      return HttpResponse.json({ version: 'v2', notes: [] });
    }),
    ...repoFiles,
  );
  return sent;
}

/** The fields of one board, found by its title. */
function board(form: HTMLElement, name: string | RegExp) {
  return within(within(form).getByRole('group', { name }));
}

describe("the boards' settings", { timeout: 20_000 }, () => {
  it('says what each board ranks in a sentence, in plain words', async () => {
    server.use(signedIn);
    settings(
      CONTEST.replace(
        '    who: contestants\n',
        '    who: contestants\n    rows: own\n    over: after_close\n    order: [points, {by: penalty, per_attempt: 20}]\n',
      ),
    );
    renderApp(PAGE);

    const form = await screen.findByRole('form', { name: 'Leaderboards' });
    expect(
      within(form).getByRole('status', { name: 'What Standings ranks' }),
    ).toHaveTextContent(
      'Ranks entrants by points and penalty minutes, 20 for each earlier attempt, from each entrant’s best submission on every task, counting only the results shown once each task closes. Entrants and organisers see it, each entrant only their own row.',
    );
    const standings = board(form, 'Standings');
    const chosen = (name: string) =>
      within(standings.getByRole('radiogroup', { name })).getByRole('radio', {
        checked: true,
      });
    expect(chosen('Shown to')).toHaveAccessibleName('Entrants');
    expect(chosen('Counts')).toHaveAccessibleName(
      'Results shown once each task closes',
    );
    expect(standings.getByRole('radio', { name: 'Only their own row' })).toBeChecked();
  });

  it('offers each choice once with what it means, an unset one shown as the default it means', async () => {
    server.use(signedIn);
    settings(CONTEST.replace('    who: contestants\n', ''));
    renderApp(PAGE);

    const form = await screen.findByRole('form', { name: 'Leaderboards' });
    const standings = board(form, 'Standings');
    for (const [name, shown, means] of [
      [
        'Shown to',
        'Organisers only',
        'Every organiser of the contest, observers included.',
      ],
      [
        'Counts',
        'Every result',
        'Every test group’s points, each group’s joining once entrants can see its results.',
      ],
      [
        'Which submission counts',
        'Best submission',
        'On each task, the one submission that ranks the entrant highest.',
      ],
    ] as const) {
      const field = standings.getByRole('radiogroup', { name });
      const labels = within(field)
        .getAllByRole('radio')
        .map((option) => option.getAttribute('value'));
      expect(labels).toHaveLength(3);
      expect(new Set(labels).size).toBe(labels.length);
      const checked = within(field).getByRole('radio', { checked: true });
      expect(checked).toHaveAccessibleName(shown);
      expect(checked).toHaveAccessibleDescription(means);
    }
  });

  it('builds a board from its fields that reads as the same board written by hand', async () => {
    server.use(signedIn);
    const sent = settings();
    const user = userEvent.setup();
    renderApp(PAGE);

    const form = await screen.findByRole('form', { name: 'Leaderboards' });
    await user.click(within(form).getByRole('button', { name: 'Add a leaderboard' }));
    const added = () => board(form, /^Leaderboard 2/);
    fireEvent.change(added().getByLabelText('Name'), { target: { value: 'ICPC' } });
    const icpcBoard = () => board(form, 'ICPC');
    await user.click(
      within(icpcBoard().getByRole('radiogroup', { name: 'Shown to' })).getByRole(
        'radio',
        { name: 'Everyone who can see the contest' },
      ),
    );
    const tasks = within(icpcBoard().getByRole('group', { name: 'Tasks' }));
    await user.click(tasks.getByRole('checkbox', { name: 'Covers every task' }));
    await user.click(tasks.getByRole('checkbox', { name: 'sort' }));
    await user.click(
      within(form).getByRole('button', { name: 'Add a way to rank ICPC' }),
    );
    const key = within(icpcBoard().getByRole('group', { name: 'Then by (2)' }));
    await user.click(key.getByRole('radio', { name: 'Penalty minutes, fewest first' }));
    fireEvent.change(key.getByLabelText('Minutes per earlier attempt'), {
      target: { value: '20' },
    });
    await user.click(within(form).getByRole('button', { name: 'Save leaderboards' }));

    expect(await screen.findByText('Saved.')).toBeVisible();
    const byHand = parse(`
- name: Standings
  who: contestants
- {name: ICPC, tasks: [sum], order: [points, {by: penalty, per_attempt: 20}], who: everyone}
`) as unknown;
    const written = sent[0] ?? '';
    expect((parse(written) as { leaderboards: unknown }).leaderboards).toEqual(byHand);
    expect(written).toContain('    order: [points, {by: penalty, per_attempt: 20}]\n');
  });

  it('names a refused way to rank on the field itself and in words above', async () => {
    server.use(signedIn);
    settings();
    server.use(
      http.put(FILE, () =>
        problem(422, 'invalid_definition', {
          errors: [
            {
              path: 'leaderboards[0].order[0]',
              message: 'No covered task reports time_ms with a fold.',
            },
          ],
        }),
      ),
    );
    const user = userEvent.setup();
    renderApp(PAGE);

    const form = await screen.findByRole('form', { name: 'Leaderboards' });
    expect(
      within(form).getByText(
        'Ranked by points alone, unless you add another way to rank.',
      ),
    ).toBeVisible();
    await user.click(
      within(form).getByRole('button', { name: 'Add a way to rank Standings' }),
    );
    await user.click(
      within(
        board(form, 'Standings').getByRole('radiogroup', { name: 'Ranked first by' }),
      ).getByRole('radio', { name: 'A value the tasks report' }),
    );
    fireEvent.change(board(form, 'Standings').getByLabelText('Value'), {
      target: { value: 'time_ms' },
    });
    await user.click(within(form).getByRole('button', { name: 'Save leaderboards' }));

    expect(
      await screen.findByRole('link', {
        name: 'Leaderboards, leaderboard 1: Ranked by',
      }),
    ).toHaveAttribute('href', `${PAGE}?field=order&item=0`);
    const key = board(form, 'Standings').getByRole('group', {
      name: 'Ranked first by',
    });
    expect(within(key).getByText(/No covered task reports time_ms/)).toBeVisible();
  });

  it('greys out a way to rank or a submission rule the save would refuse, with the reason', async () => {
    server.use(signedIn);
    settings(
      CONTEST.replace(
        '    who: contestants\n',
        '    who: contestants\n    rows: 10\n    order: [points, time_ms]\n',
      ),
    );
    renderApp(PAGE);

    const form = await screen.findByRole('form', { name: 'Leaderboards' });
    const standings = board(form, 'Standings');
    const penalty = (name: string) =>
      within(standings.getByRole('radiogroup', { name })).getByRole('radio', {
        name: 'Penalty minutes, fewest first',
      });
    expect(penalty('Ranked first by')).toBeDisabled();
    expect(penalty('Ranked first by')).toHaveAccessibleDescription(
      /Penalty minutes only break ties, so they are never the first way to rank\.$/,
    );
    expect(penalty('Then by (2)')).toBeEnabled();
    expect(penalty('Then by (2)')).not.toHaveAccessibleDescription(/never the first/);
    const perGroup = within(
      standings.getByRole('radiogroup', { name: 'Which submission counts' }),
    ).getByRole('radio', { name: 'Best submission on each test group' });
    expect(perGroup).toBeDisabled();
    expect(perGroup).toHaveAccessibleDescription(
      /The best submission on each test group needs points ranked first and no value to rank by\.$/,
    );
    expect(
      standings.getByRole('radiogroup', { name: 'Which submission counts' }),
    ).not.toHaveAccessibleDescription(/needs points/);
    expect(
      within(form).getByRole('status', { name: 'What Standings ranks' }),
    ).toHaveTextContent(
      'Entrants and organisers see it, the top 10 rows, every row tied with the last of them, and each entrant’s own row.',
    );
  });

  it('removes a board only once asked, and the key with the last of them', async () => {
    server.use(signedIn);
    const sent = settings();
    const user = userEvent.setup();
    renderApp(PAGE);

    const form = await screen.findByRole('form', { name: 'Leaderboards' });
    await user.click(within(form).getByRole('button', { name: 'Remove Standings' }));
    const dialog = await screen.findByRole('dialog', { name: 'Remove Standings?' });
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }));
    expect(
      within(form).getByText(
        'This contest has no leaderboards yet, so nobody sees a ranking. Add one to rank its entrants.',
      ),
    ).toBeVisible();
    await user.click(within(form).getByRole('button', { name: 'Save leaderboards' }));

    await screen.findByText('Saved.');
    expect(parse(sent[0] ?? '')).not.toHaveProperty('leaderboards');
  });

  it('shows an observer the boards to read, with nothing to change', async () => {
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
    settings();
    renderApp(PAGE);

    const form = await screen.findByRole('form', { name: 'Leaderboards' });
    expect(board(form, 'Standings').getByLabelText('Name')).toBeDisabled();
    expect(
      within(form).queryByRole('button', { name: 'Save leaderboards' }),
    ).toBeNull();
    expect(
      within(form).queryByRole('button', { name: 'Add a leaderboard' }),
    ).toBeNull();
  });
});

describe("the boards' previews", () => {
  it('shows each board now and once all is shown, every row and none marked as theirs', async () => {
    server.use(
      signedIn,
      http.get(`${CONTEST_API}/organise/boards`, () =>
        HttpResponse.json([
          { ...organised(icpc(), final), notes: ['B gives no points.'] },
        ]),
      ),
    );
    settings();
    renderApp(PAGE);

    const now = await screen.findByRole('table', { name: 'Standings, now' });
    const later = screen.getByRole('table', {
      name: 'Standings, once every result is shown',
    });
    expect(within(now).getAllByRole('rowheader')).toHaveLength(3);
    expect(within(now).queryByText('The entrant previewed')).toBeNull();
    expect(within(later).getAllByRole('rowheader')[0]).toHaveTextContent('kenny');
    expect(screen.getByRole('list', { name: 'Not counted yet' })).toHaveTextContent(
      'final of B',
    );
    expect(screen.getByRole('note', { name: 'Notes on Standings' })).toHaveTextContent(
      'B gives no points.',
    );
  });

  it('previews now as an entrant sees it, kept in the address', async () => {
    const asked: string[] = [];
    server.use(
      signedIn,
      http.get(`${CONTEST_API}/organise/boards`, ({ request }) => {
        const query = new URL(request.url).searchParams;
        asked.push(query.toString());
        const picked = query.get('entrant') === entrantOf(30);
        const now = picked
          ? icpc({
              rows: icpc().rows.map((found) =>
                found.row.name === 'carol'
                  ? { ...found, cells: { sum: cell({ grading: 0 }), max: cell() } }
                  : {
                      ...found,
                      cells: Object.fromEntries(
                        Object.entries(found.cells).map(([task, held]) => [
                          task,
                          { ...held, grading: null, submissions: null },
                        ]),
                      ),
                    },
              ),
            })
          : icpc();
        return HttpResponse.json([organised(now, final)]);
      }),
    );
    settings();
    const user = userEvent.setup();
    const { router } = renderApp(PAGE);
    await screen.findByRole('table', { name: 'Standings, now' });

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Preview as an entrant' }),
      'carol',
    );

    await waitFor(() => expect(asked.at(-1)).toBe(`entrant=${entrantOf(30)}`));
    expect(router.state.location.search).toBe(`?entrant=${entrantOf(30)}`);
    const now = screen.getByRole('table', { name: 'Standings, now' });
    await waitFor(() =>
      expect(
        within(now).getByText('The entrant previewed').closest('tr'),
      ).toHaveTextContent('carol'),
    );
  });
});
