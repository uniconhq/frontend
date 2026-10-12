import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@/test/user-event';
import { http, HttpResponse } from 'msw';
import { parse } from 'yaml';
import type { FileContent } from '@/api/types';
import { icpc, organised, row, cell, entrantOf } from '@/test/boards';
import { CONTEST_API, repoFiles, standingList, taskList } from '@/test/organiser';
import { formatDateTime } from '@/lib/time';
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
    standingList,
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
    // Once the tasks' published groups are read: none is held back.
    await waitFor(() =>
      expect(
        within(form).getByRole('status', { name: 'What Standings ranks' }),
      ).toHaveTextContent(
        'Ranks entrants by their total points over every task, most first; ties broken by penalty minutes, fewest first, with 20 more for each earlier attempt. Each entrant’s best submission to each task counts. Organisers see all of it, and each entrant only their own row. It counts nothing: it counts only test groups whose results entrants see once their task closes, and no task it covers has one.',
      ),
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

  it('names a published group hidden until its task closes, and when its results join, in the words how the contest is scored uses (M52)', async () => {
    server.use(signedIn);
    settings();
    server.use(
      http.get(`${CONTEST_API}/tasks/:task/files/:path`, ({ params }) =>
        params['path'] === 'task.yaml'
          ? HttpResponse.json({
              path: 'task.yaml',
              encoding: 'utf-8',
              content:
                params['task'] === 'sum'
                  ? 'name: Sum\nworkflow: unicon/classic@v2\ntest_groups:\n  open: {pass: 40}\n  hidden: {pass: 60, show: after_close}\n'
                  : 'name: Sort\nworkflow: unicon/classic@v2\ntest_groups:\n  all: {pass: 100}\n',
              token: 'token-task',
              upload: null,
              version: '3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d',
            })
          : undefined,
      ),
    );
    renderApp(PAGE);

    const form = await screen.findByRole('form', { name: 'Leaderboards' });
    // sum closes after the contest's end here, so its own close is named.
    await waitFor(() =>
      expect(
        within(form).getByRole('status', { name: 'What Standings ranks' }),
      ).toHaveTextContent(
        `Ranks entrants by their total points over every task, most first. Each entrant’s best submission to each task counts. Entrants and organisers see all of it. Results from test group “hidden” of task B join it when task B closes, ${formatDateTime(new Date('2026-10-15T09:00:00Z'))}.`,
      ),
    );
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
        'Every test group’s points. A group’s points join once entrants can see its results.',
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
    const key = within(icpcBoard().getByRole('group', { name: 'Way to rank 2' }));
    expect(key.getByRole('combobox', { name: 'Way to rank 2' })).toHaveValue('penalty');
    fireEvent.change(
      key.getByRole('textbox', { name: 'Minutes per earlier attempt' }),
      {
        target: { value: '20' },
      },
    );
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
      within(
        board(form, 'Standings').getByRole('group', { name: 'Ranked by' }),
      ).getByText('Ranks by points, most first.'),
    ).toBeVisible();
    await user.selectOptions(
      board(form, 'Standings').getByRole('combobox', { name: 'Way to rank 1' }),
      'value',
    );
    await user.selectOptions(
      await board(form, 'Standings').findByRole('combobox', { name: 'Which value' }),
      'time_ms',
    );
    await user.click(within(form).getByRole('button', { name: 'Save leaderboards' }));

    expect(
      await screen.findByRole('link', {
        name: 'Leaderboards, leaderboard 1: Ranked by',
      }),
    ).toHaveAttribute('href', `${PAGE}?field=order&item=0`);
    const key = board(form, 'Standings').getByRole('group', {
      name: 'Way to rank 1',
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
    const offered = (name: string) =>
      within(standings.getByRole('combobox', { name }))
        .getAllByRole('option')
        .map((option) => option.textContent);
    expect(offered('Way to rank 1')).toEqual([
      'Points, most first',
      'A value the tasks report',
    ]);
    expect(offered('Way to rank 2')).toEqual([
      'Penalty minutes, fewest first',
      'A value the tasks report',
    ]);
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
      'Organisers see all of it; entrants see the top 10 rows and any row tied with the last of them, and an entrant their own row as well.',
    );
  });

  it('shows each way to rank as one row under a summary, offering each way once', async () => {
    server.use(signedIn);
    const sent = settings(
      CONTEST.replace(
        '    who: contestants\n',
        '    who: contestants\n    order: [points, {by: penalty, per_attempt: 20}]\n',
      ),
    );
    const user = userEvent.setup();
    renderApp(PAGE);

    const form = await screen.findByRole('form', { name: 'Leaderboards' });
    const standings = board(form, 'Standings');
    const order = within(standings.getByRole('group', { name: 'Ranked by' }));
    expect(
      order.getByText(
        'Ranks by points, most first; ties broken by penalty minutes, fewest first, with 20 more for each earlier attempt.',
      ),
    ).toBeVisible();
    const second = within(order.getByRole('group', { name: 'Way to rank 2' }));
    expect(
      second.getByRole('textbox', { name: 'Minutes per earlier attempt' }),
    ).toHaveValue('20');
    expect(
      second.getByText(
        'The minutes from the start to each counted submission, and a set number more for each earlier attempt. Fewer ranks higher.',
      ),
    ).toBeVisible();
    expect(order.queryAllByRole('radio')).toHaveLength(0);

    // Points and penalty minutes are used, so Add brings a value, and then goes.
    await user.click(
      order.getByRole('button', { name: 'Add a way to rank Standings' }),
    );
    expect(order.getByRole('combobox', { name: 'Way to rank 3' })).toHaveValue('value');
    expect(order.queryByRole('button', { name: /^Add a way to rank/ })).toBeNull();

    await user.click(
      order.getByRole('button', { name: 'Remove way to rank 3 of Standings' }),
    );
    await user.click(
      order.getByRole('button', { name: 'Move way to rank 2 of Standings up' }),
    );
    expect(
      within(order.getByRole('group', { name: 'Way to rank 1' })).getByRole('alert'),
    ).toHaveTextContent(
      'Penalty minutes only break ties, so they are never the first way to rank.',
    );
    await user.click(
      order.getByRole('button', { name: 'Move way to rank 2 of Standings up' }),
    );
    fireEvent.change(
      within(order.getByRole('group', { name: 'Way to rank 2' })).getByRole('textbox', {
        name: 'Minutes per earlier attempt',
      }),
      { target: { value: '30' } },
    );
    await user.click(within(form).getByRole('button', { name: 'Save leaderboards' }));

    expect(await screen.findByText('Saved.')).toBeVisible();
    expect(sent[0]).toContain('    order: [points, {by: penalty, per_attempt: 30}]\n');
  });

  it('keeps a board that names no way to rank as it is, showing points as its one way', async () => {
    server.use(signedIn);
    settings();
    renderApp(PAGE);

    const form = await screen.findByRole('form', { name: 'Leaderboards' });
    const order = within(
      board(form, 'Standings').getByRole('group', { name: 'Ranked by' }),
    );
    expect(order.getByRole('combobox', { name: 'Way to rank 1' })).toHaveValue(
      'points',
    );
    expect(
      order.getByRole('button', { name: 'Remove way to rank 1 of Standings' }),
    ).toBeDisabled();
    expect(
      within(form).getByRole('button', { name: 'Save leaderboards' }),
    ).toBeDisabled();
  });

  it('says a value ranked by twice changes nothing', async () => {
    server.use(signedIn);
    settings(
      CONTEST.replace(
        '    who: contestants\n',
        '    who: contestants\n    order: [points, time_ms, time_ms]\n',
      ),
    );
    renderApp(PAGE);

    const form = await screen.findByRole('form', { name: 'Leaderboards' });
    const order = within(
      board(form, 'Standings').getByRole('group', { name: 'Ranked by' }),
    );
    expect(
      within(order.getByRole('group', { name: 'Way to rank 3' })).getByRole('alert'),
    ).toHaveTextContent(
      'Way 2 already ranks by run time, so this one changes nothing.',
    );
  });

  it('offers the values the tasks report by their titles, and words the board by them (M58)', async () => {
    server.use(signedIn);
    settings(
      CONTEST.replace(
        '    who: contestants\n',
        '    who: contestants\n    order: [points, time_ms]\n',
      ),
    );
    renderApp(PAGE);

    const form = await screen.findByRole('form', { name: 'Leaderboards' });
    const standings = board(form, 'Standings');
    const which = await standings.findByRole('combobox', { name: 'Which value' });
    expect(
      within(which)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual([
      'Choose a value',
      'Run time (lower is better)',
      'Memory used (lower is better)',
    ]);
    expect(which).toHaveValue('time_ms');
    expect(
      within(standings.getByRole('group', { name: 'Ranked by' })).getByText(
        'Ranks by points, most first; ties broken by run time, lowest first.',
      ),
    ).toBeVisible();
    await waitFor(() =>
      expect(
        within(form).getByRole('status', { name: 'What Standings ranks' }),
      ).toHaveTextContent(
        'Ranks entrants by their total points over every task, most first; ties broken by their total run time, lowest first.',
      ),
    );
    expect(form).not.toHaveTextContent('time_ms');
  });

  it('keeps a value no task reports in view, and flags it', async () => {
    server.use(signedIn);
    settings(
      CONTEST.replace(
        '    who: contestants\n',
        '    who: contestants\n    order: [points, score]\n',
      ),
    );
    renderApp(PAGE);

    const form = await screen.findByRole('form', { name: 'Leaderboards' });
    const key = board(form, 'Standings').getByRole('group', { name: 'Way to rank 2' });
    const which = await within(key).findByRole('combobox', { name: 'Which value' });
    expect(which).toHaveValue('score');
    expect(within(which).getAllByRole('option')[1]).toHaveTextContent('score');
    expect(within(key).getByRole('alert')).toHaveTextContent(
      'No task this leaderboard covers reports score for each test.',
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
