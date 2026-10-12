import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@/test/user-event';
import { delay, http, HttpResponse } from 'msw';
import type { TaskStanding } from '@/api/types';
import { parse } from 'yaml';
import { isoOf, localOf } from '../forms/times';
import { CONTEST_SECTIONS } from '@/lib/sections';
import { formatDateTime } from '@/lib/time';
import { renderApp } from '@/test/render';
import { problem, server, signedIn, someone } from '@/test/server';
import {
  CONTEST_API,
  files,
  repoFiles,
  standingList,
  standings,
  taskList,
} from '@/test/organiser';

const CONTEST = '/orgs/acme/contests/spring';

function at(iso: string): string {
  return formatDateTime(new Date(iso));
}

describe("the contest page's header", () => {
  it('names the contest, says where it stands, and leads to the page its contestants see', async () => {
    server.use(signedIn, standingList, ...repoFiles);
    renderApp(CONTEST);

    const title = await screen.findByRole('heading', { name: 'spring', level: 1 });
    expect(title).toBeVisible();
    const header = title.closest('header');
    if (header === null) throw new Error('the title is in a header');
    expect(await within(header).findByText('Draft')).toBeVisible();
    expect(screen.getByRole('link', { name: 'View as an entrant' })).toHaveAttribute(
      'href',
      '/contests/acme/spring',
    );
    expect(
      await screen.findByRole('timer', { name: 'Contest countdown' }),
    ).toBeVisible();
  });
});

describe("the contest's settings at a glance", () => {
  it('says when it runs, who sees it, how people enter and in teams or not', async () => {
    server.use(
      signedIn,
      standingList,
      http.get(`${CONTEST_API}/files/:path`, () =>
        HttpResponse.json({
          ...files['contest.yaml'],
          content: [
            'name: Spring',
            'start: 2026-10-01T09:00:00Z',
            'end: 2026-10-01T14:00:00Z',
            'state: draft',
            'visibility: everyone',
            'registration:',
            '  capacity: 500',
            '  ways:',
            '    - invite: {}',
            '    - signup: {domains: [u.nus.edu], approval: auto}',
            'entrants: {most: 3, fewest: 2}',
            '',
          ].join('\n'),
        }),
      ),
      ...repoFiles,
    );
    renderApp(CONTEST);

    const summary = await screen.findByLabelText('The settings');
    const values = within(summary)
      .getAllByRole('definition')
      .map((value) => value.textContent);
    expect(values).toEqual([
      `${at('2026-10-01T09:00:00Z')} to ${at('2026-10-01T14:00:00Z')}`,
      'Anyone, signed in or not',
      'Anyone you invite, or anyone with an @u.nus.edu email can register from when the contest opens until the contest ends. Each is approved straight away. At most 500 entrants can register.',
      'Teams of 2 to 3 people, fixed when the contest starts',
    ]);
    const card = screen.getByRole('region', { name: 'Settings' });
    expect(within(card).getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'href',
      '/orgs/acme/contests/spring/settings',
    );
  });
});

describe("the contest's tasks", () => {
  it('lists the tasks in order, each by its letter and name, linking to its page', async () => {
    server.use(signedIn, standingList, ...repoFiles);
    renderApp(CONTEST);

    const list = await screen.findByRole('list', { name: 'Tasks' });
    expect([...list.children].map((item) => item.getAttribute('aria-label'))).toEqual([
      'A · sort',
      'B · sum',
    ]);
    expect(
      within(list)
        .getAllByRole('link')
        .map((link) => [link.textContent, link.getAttribute('href')]),
    ).toEqual([
      ['A · sort', '/orgs/acme/contests/spring/tasks/sort'],
      ['B · sum', '/orgs/acme/contests/spring/tasks/sum'],
    ]);
  });

  it('calls each task by its letter and its title, as its settings give it', async () => {
    server.use(
      signedIn,
      standingList,
      http.get(`${CONTEST_API}/tasks/:task/files/:path`, ({ params }) =>
        params['path'] === 'task.yaml'
          ? HttpResponse.json({
              ...files['task.yaml']!,
              content: `name: ${params['task'] === 'sort' ? 'Sorting' : 'Sum of two'}\n`,
            })
          : undefined,
      ),
      ...repoFiles,
    );
    renderApp(CONTEST);

    const list = await screen.findByRole('list', { name: 'Tasks' });
    await waitFor(() =>
      expect(
        within(list)
          .getAllByRole('link')
          .map((link) => [link.textContent, link.getAttribute('href')]),
      ).toEqual([
        ['A · Sorting', '/orgs/acme/contests/spring/tasks/sort'],
        ['B · Sum of two', '/orgs/acme/contests/spring/tasks/sum'],
      ]),
    );
  });

  it("says each task's latest publication and its timeline as one line, defaults resolved", async () => {
    server.use(signedIn, standingList, ...repoFiles);
    renderApp(CONTEST);

    const sort = await screen.findByRole('listitem', { name: 'A · sort' });
    // The first publication has none before it to have changed from.
    expect(sort).toHaveTextContent(`Publication 1, ${at('2026-09-20T10:00:00Z')}`);
    expect(sort).not.toHaveTextContent(/grades|grading/);
    expect(sort).toHaveTextContent(
      `100 points, open for the whole contest; due ${at('2026-10-08T09:00:00Z')}, then 10% less per started day late`,
    );

    const sum = screen.getByRole('listitem', { name: 'B · sum' });
    expect(sum).toHaveTextContent('no points, open for the whole contest');
  });

  it('names a time of its own, and the marks a marked board lets each entrant make', async () => {
    const [sort] = standings;
    if (sort === undefined) throw new Error('standings has sort');
    server.use(
      signedIn,
      http.get(`${CONTEST_API}/organise/tasks`, () =>
        HttpResponse.json([
          {
            ...sort,
            timeline: {
              ...sort.timeline,
              release_at: '2026-10-02T09:00:00Z',
              late_per_day: '1',
            },
          },
        ]),
      ),
      http.get(`${CONTEST_API}/files/:path`, () =>
        HttpResponse.json({
          ...files['contest.yaml'],
          content: [
            'name: Spring',
            'start: 2026-10-01T09:00:00Z',
            'end: 2026-10-15T09:00:00Z',
            'state: draft',
            'visibility: signed-in',
            'leaderboards: [{name: Final, select: marked}]',
            'tasks: [{id: sort, marks: 2}]',
            '',
          ].join('\n'),
        }),
      ),
      ...repoFiles,
    );
    renderApp(CONTEST);

    expect(await screen.findByRole('listitem', { name: 'A · sort' })).toHaveTextContent(
      `100 points, opens ${at('2026-10-02T09:00:00Z')}; due ${at('2026-10-08T09:00:00Z')}, nothing once late; closes with the contest; an entrant may mark up to 2 submissions`,
    );
  });

  it('says the late rate as the exact percentage it is, however small', async () => {
    const [sort] = standings;
    if (sort === undefined) throw new Error('standings has sort');
    const rated = (late: string): TaskStanding => ({
      ...sort,
      timeline: { ...sort.timeline, late_per_day: late },
    });
    server.use(
      signedIn,
      http.get(`${CONTEST_API}/organise/tasks`, () =>
        HttpResponse.json([rated('0.0001'), { ...rated('0.0005'), label: 'B' }]),
      ),
      ...repoFiles,
    );
    renderApp(CONTEST);

    const items = await screen.findAllByRole('listitem', { name: /sort$/ });
    expect(items[0]).toHaveTextContent('then 0.01% less per started day late');
    expect(items[1]).toHaveTextContent('then 0.05% less per started day late');
  });

  it("says how many problems hold back a task's last save, which its own page lists", async () => {
    server.use(signedIn, standingList, ...repoFiles);
    renderApp(CONTEST);

    const sum = await screen.findByRole('listitem', { name: 'B · sum' });
    expect(sum).toHaveTextContent(
      `Publication 2, ${at('2026-09-21T10:00:00Z')}, grading unchanged`,
    );
    expect(sum).toHaveTextContent('1 problem in its last save');
    expect(within(sum).queryByRole('list', { name: 'Errors' })).toBeNull();
  });

  it('says a task that has never published so, and what it is worth once it has', async () => {
    const fresh: TaskStanding = {
      task: { name: 'max' },
      label: 'C',
      state: {
        head: 'a1',
        latest: null,
        draft: true,
        errors: [{ path: '', message: 'task.yaml is missing.' }],
      },
      timeline: {
        release_at: '2026-10-01T09:00:00Z',
        due: null,
        late_per_day: null,
        closes: '2026-10-15T09:00:00Z',
        worth: null,
      },
    };
    server.use(
      signedIn,
      ...repoFiles,
      http.get(`${CONTEST_API}/organise/tasks`, () =>
        HttpResponse.json([
          fresh,
          {
            ...fresh,
            task: { name: 'min' },
            label: 'D',
            state: { ...fresh.state, errors: [] },
          },
        ]),
      ),
    );
    renderApp(CONTEST);

    const max = await screen.findByRole('listitem', { name: 'C · max' });
    expect(max).toHaveTextContent('Never published');
    expect(max).toHaveTextContent('1 problem in its last save');
    expect(max).toHaveTextContent('points known once the task is published');

    const min = screen.getByRole('listitem', { name: 'D · min' });
    expect(min).toHaveTextContent('Never published');
    expect(min).toHaveTextContent('Draft, not published');
  });

  it("reads the tasks afresh on coming back from saving the contest's settings", async () => {
    // The tasks as read once the save is in, which the contest's page must show.
    let readsAfterSave = 0;
    let saved = false;
    server.use(
      signedIn,
      ...repoFiles,
      http.get(`${CONTEST_API}/organise/tasks`, () => {
        if (saved) readsAfterSave += 1;
        return HttpResponse.json(standings);
      }),
      http.put(`${CONTEST_API}/files/:path`, () => {
        saved = true;
        return HttpResponse.json({ version: '9f8e7d6c5b4a39281706', notes: [] });
      }),
    );
    renderApp(`${CONTEST}/settings`);

    const form = await screen.findByRole('form', { name: 'Contest settings' });
    await userEvent.type(
      within(form).getByRole('textbox', { name: 'Description' }),
      'Ours',
    );
    await userEvent.click(within(form).getByRole('button', { name: 'Save settings' }));
    await screen.findByText('Saved.');

    const trail = screen.getByRole('navigation', { name: 'Breadcrumb' });
    await userEvent.click(within(trail).getByRole('link', { name: 'spring' }));
    await screen.findByRole('list', { name: 'Tasks' });
    expect(readsAfterSave).toBeGreaterThan(0);
  });

  it('shows a skeleton while the tasks load', async () => {
    server.use(
      signedIn,
      ...repoFiles,
      http.get(`${CONTEST_API}/organise/tasks`, async () => {
        await delay('infinite');
        return HttpResponse.json([]);
      }),
    );
    renderApp(CONTEST);

    const tasks = await screen.findByRole('region', { name: 'Tasks' });
    expect(within(tasks).getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Tasks' })).not.toBeInTheDocument();
  });

  it('shows the refusal when the tasks may not be listed, and keeps the rest of the page', async () => {
    server.use(
      signedIn,
      ...repoFiles,
      http.get(`${CONTEST_API}/organise/tasks`, () =>
        problem(403, 'forbidden', {
          detail: 'You need the observer role at acme/spring.',
        }),
      ),
    );
    renderApp(CONTEST);

    expect(
      await screen.findByText('You need the observer role at acme/spring.'),
    ).toBeVisible();
    const cards = screen.getByRole('group', { name: "The contest's sections" });
    expect(
      within(cards).getByRole('link', { name: 'Contest organisers' }),
    ).toBeVisible();
    expect(await within(cards).findByText('0 organisers')).toBeVisible();
  });

  it("shows the settings' errors at their paths and lists the tasks by name when the settings do not read", async () => {
    server.use(
      signedIn,
      ...repoFiles,
      taskList,
      // As the backend answers the forge's InvalidDefinition naming contest.yaml.
      http.get(`${CONTEST_API}/organise/tasks`, () =>
        problem(422, 'invalid_definition', {
          title: 'Unprocessable Content',
          detail:
            'contest.yaml has 2 problems; the first is at tasks[0].due: It is not a time with an offset.',
          errors: [
            { path: 'tasks[0].due', message: 'It is not a time with an offset.' },
            { path: '', message: 'end comes before start.' },
          ],
        }),
      ),
    );
    renderApp(CONTEST);

    const tasks = await screen.findByRole('region', { name: 'Tasks' });
    const alert = await within(tasks).findByRole('alert');
    expect(alert).toHaveTextContent("The contest's settings cannot be read");
    expect(alert).toHaveTextContent(
      'Fix each problem where it is listed, or, as an admin, fix them as text in the stored settings.',
    );
    expect(
      within(alert).getByRole('link', { name: 'the stored settings' }),
    ).toHaveAttribute('href', '/orgs/acme/contests/spring/settings#file');
    const errors = within(alert).getByRole('list', { name: 'Errors' });
    expect(
      within(errors)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      'Tasks, A: Due: It is not a time with an offset.',
      'Settings: end comes before start.',
    ]);
    expect(within(errors).getByRole('link', { name: 'Tasks, A: Due' })).toHaveAttribute(
      'href',
      '/orgs/acme/contests/spring?part=tasks&field=due&item=0',
    );
    const list = await screen.findByRole('list', { name: 'Tasks' });
    expect(within(list).getByRole('link', { name: 'sum' })).toHaveAttribute(
      'href',
      '/orgs/acme/contests/spring/tasks/sum',
    );
    expect(screen.getByRole('button', { name: 'New task' })).toBeVisible();
  });

  it('shows someone refused the list the tasks their own roles reach', async () => {
    server.use(
      http.get('/api/v1/me', () =>
        HttpResponse.json({
          ...someone,
          roles: [
            {
              names: { org: 'acme', contest: 'spring', task: 'sum' },
              role: 'manager',
            },
            {
              names: { org: 'acme', contest: 'autumn', task: 'max' },
              role: 'manager',
            },
          ],
        }),
      ),
      ...repoFiles,
      http.get(`${CONTEST_API}/organise/tasks`, () =>
        problem(403, 'forbidden', {
          detail: 'You need the observer role at acme/spring.',
        }),
      ),
    );
    renderApp(CONTEST);

    expect(
      await screen.findByText('Tasks of this contest where you have a role:'),
    ).toBeVisible();
    const own = screen.getByRole('list', { name: 'Tasks' });
    expect(
      within(own)
        .getAllByRole('link')
        .map((link) => [link.textContent, link.getAttribute('href')]),
    ).toEqual([['sum', '/orgs/acme/contests/spring/tasks/sum']]);
    expect(screen.queryByRole('button', { name: 'New task' })).toBeNull();
  });
});

/** A line of a scoring card whose words are `text`, however they are marked up. */
async function line(region: HTMLElement, text: string): Promise<HTMLElement> {
  return within(region).findByText(
    (_, element) => element?.tagName === 'LI' && element.textContent === text,
  );
}

/** A contest's settings, as its file holds them, from `lines`. */
function contestFile(lines: string[]) {
  return http.get(`${CONTEST_API}/files/:path`, () =>
    HttpResponse.json({
      ...files['contest.yaml'],
      content: [...lines, ''].join('\n'),
      token: 'token-contest',
    }),
  );
}

/** Each task's published settings, by task, and its tests by group, as `tests/` holds them. */
function publishedTasks(
  settings: Record<string, string>,
  tests: Record<string, Record<string, number>> = {},
) {
  return [
    http.get(`${CONTEST_API}/tasks/:task/files/:path`, ({ params }) =>
      HttpResponse.json({
        path: 'task.yaml',
        encoding: 'utf-8',
        content: settings[String(params['task'])] ?? '',
        token: 'token-task',
        upload: null,
        version: '3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d',
      }),
    ),
    http.get(`${CONTEST_API}/tasks/:task/tree`, ({ params, request }) => {
      const groups = tests[String(params['task'])];
      const at = new URL(request.url).searchParams.get('path') ?? '';
      if (groups === undefined) return problem(404, 'not_found');
      const entry = (path: string) => ({
        path,
        kind: 'directory',
        size: null,
        upload: null,
      });
      if (at === 'tests') {
        return HttpResponse.json(
          Object.keys(groups).map((group) => entry(`tests/${group}`)),
        );
      }
      const group = at.slice('tests/'.length);
      return HttpResponse.json(
        Array.from({ length: groups[group] ?? 0 }, (_, n) =>
          entry(`${at}/${String(n + 1)}`),
        ),
      );
    }),
  ];
}

describe('how the contest is scored (M52)', () => {
  it('heads each task with its worth and when it is open, then says each group and each board that counts it in plain words', async () => {
    const [sort, sum] = standings;
    if (sort === undefined || sum === undefined) throw new Error('standings has two');
    server.use(
      signedIn,
      http.get(`${CONTEST_API}/organise/tasks`, () =>
        HttpResponse.json([
          { ...sort, timeline: { ...sort.timeline, worth: '50' } },
          { ...sum, timeline: { ...sum.timeline, worth: '100' } },
        ]),
      ),
      contestFile([
        'name: Spring',
        'start: 2026-10-01T09:00:00Z',
        'end: 2026-10-15T09:00:00Z',
        'tasks:',
        '  - id: sort',
        '    worth: 50',
        '  - id: sum',
        'leaderboards:',
        '  - name: Standings',
        '    tasks: [sort]',
      ]),
      ...publishedTasks(
        {
          sort: 'name: Sort\nworkflow: unicon/classic@v2\ntest_groups:\n  small: {pass: 30}\n  large: {pass: 70}\n',
          sum: 'name: Sum\nworkflow: unicon/classic@v2\ntest_groups:\n  main: {each: 80, pass: 20}\n',
        },
        { sort: { small: 4, large: 2 } },
      ),
      ...repoFiles,
    );
    renderApp(CONTEST);

    const card = await screen.findByRole('region', {
      name: 'How this contest is scored',
    });
    expect(card).toHaveTextContent(
      "Check this before the contest starts. It says how each task earns points and which leaderboards count them, as each task's latest publication has it.",
    );
    const sortPart = await within(card).findByRole('region', { name: 'A · sort' });
    expect(within(sortPart).getByRole('heading', { level: 3 })).toHaveTextContent(
      `A · sort: 50 points, open for the whole contest; due ${at('2026-10-08T09:00:00Z')}, then 10% less per started day late`,
    );
    await line(
      sortPart,
      "Its contest makes the task worth 50 points, so each test group's points are scaled to that.",
    );
    // A worked example from the group's own number of tests.
    await line(
      sortPart,
      'Test group “small”: an entrant earns 15 points when every test passes, and nothing otherwise. An entrant who passes 3 of 4 gets nothing.',
    );
    await line(
      sortPart,
      'Counted on Standings: highest total first, using each entrant’s best submission. Only organisers see it.',
    );
    expect(sortPart).not.toHaveTextContent(/\byou\b/i);

    const sumPart = within(card).getByRole('region', { name: 'B · sum' });
    expect(within(sumPart).getByRole('heading', { level: 3 })).toHaveTextContent(
      'B · sum: 100 points, open for the whole contest',
    );
    // Where the worth comes from is said only where the contest sets it.
    expect(sumPart).not.toHaveTextContent('scaled');
    // A draft on top of its publication: its tests now are not the published ones.
    await line(
      sumPart,
      'Test group “main”: each test passed is worth an equal share of 80 points. Passing every test earns 20 points more.',
    );
    await line(sumPart, 'No leaderboard counts it.');
  });

  it('says a task gives no points in the Tests card’s words', async () => {
    const [, sum] = standings;
    if (sum === undefined) throw new Error('standings has sum');
    server.use(
      signedIn,
      http.get(`${CONTEST_API}/organise/tasks`, () =>
        HttpResponse.json([
          {
            ...sum,
            label: 'A',
            state: { ...sum.state, draft: false, errors: [] },
            timeline: { ...sum.timeline, worth: null },
          },
        ]),
      ),
      contestFile([
        'name: Spring',
        'start: 2026-10-01T09:00:00Z',
        'end: 2026-10-15T09:00:00Z',
        'tasks: [{id: sum}]',
      ]),
      ...publishedTasks(
        {
          sum: 'name: Sum\nworkflow: unicon/classic@v2\ntest_groups:\n  samples: {show: always}\n',
        },
        { sum: { samples: 2 } },
      ),
      ...repoFiles,
    );
    renderApp(CONTEST);

    const card = await screen.findByRole('region', {
      name: 'How this contest is scored',
    });
    const part = await within(card).findByRole('region', { name: 'A · sum' });
    await line(
      part,
      'The task gives no points: no group earns any. It is ranked on what its workflow reports, if a leaderboard says so.',
    );
  });

  it('names a group hidden until the end on each board where it changes what the board counts, and nowhere else', async () => {
    const [, sum] = standings;
    if (sum === undefined) throw new Error('standings has sum');
    server.use(
      signedIn,
      http.get(`${CONTEST_API}/organise/tasks`, () =>
        HttpResponse.json([
          {
            ...sum,
            label: 'A',
            state: { ...sum.state, draft: false, errors: [] },
            timeline: { ...sum.timeline, worth: '100' },
          },
        ]),
      ),
      contestFile([
        'name: Spring',
        'start: 2026-10-01T09:00:00Z',
        'end: 2026-10-15T09:00:00Z',
        'tasks: [{id: sum}]',
        'leaderboards:',
        '  - {name: Live, over: live, who: contestants}',
        '  - {name: Final, who: everyone}',
        '  - {name: Practice, over: all, tasks: []}',
      ]),
      ...publishedTasks(
        {
          sum: 'name: Sum\nworkflow: unicon/classic@v2\ntest_groups:\n  samples: {show: always}\n  hidden: {each: 100, show: after_close}\n',
        },
        { sum: { samples: 2, hidden: 4 } },
      ),
      ...repoFiles,
    );
    renderApp(CONTEST);

    const card = await screen.findByRole('region', {
      name: 'How this contest is scored',
    });
    const part = await within(card).findByRole('region', { name: 'A · sum' });
    await line(
      part,
      'Test group “samples”: no points: its tests are for entrants to practise on.',
    );
    // The same words the task's Tests card gives the group.
    await line(
      part,
      'Test group “hidden”: each test passed is worth an equal share of 100 points. An entrant who passes 3 of 4 gets 75.',
    );
    await line(
      part,
      'Counted on Live: highest total first, using each entrant’s best submission. Entrants and organisers see the whole leaderboard. It leaves out test group “hidden”, whose results entrants see only once the task closes.',
    );
    await line(
      part,
      'Counted on Final: highest total first, using each entrant’s best submission. Everyone who can see the contest sees the whole leaderboard. Results from test group “hidden” join it when the contest ends.',
    );
    // A board that does not cover the task is not listed under it.
    expect(part).not.toHaveTextContent('Practice');
  });
});

describe('how the contest is scored, as published', () => {
  it('reads each task as its latest publication holds it, not the draft saved since', async () => {
    const neverPublished: TaskStanding = {
      ...standings[0]!,
      task: { name: 'new' },
      label: 'C',
      state: { head: 'f0', latest: null, draft: true, errors: [] },
      // A task never published has no worth yet.
      timeline: { ...standings[0]!.timeline, worth: null },
    };
    server.use(
      signedIn,
      http.get(`${CONTEST_API}/organise/tasks`, () =>
        HttpResponse.json([...standings, neverPublished]),
      ),
      http.get(`${CONTEST_API}/tasks/:task/files/:path`, ({ params, request }) => {
        const at = new URL(request.url).searchParams.get('at');
        const content =
          params['task'] === 'sort'
            ? 'name: Sort\nworkflow: unicon/icpc@v1\ntest_groups:\n  judge: {pass: 1}\n'
            : at === standings[1]!.state.latest?.version
              ? 'name: Sum\nworkflow: unicon/classic@v2\ntest_groups:\n  main: {each: 80, pass: 20}\n'
              : 'name: Sum\nworkflow: unicon/classic@v2\ntest_groups:\n  main: {each: 120}\n';
        return HttpResponse.json({
          path: 'task.yaml',
          encoding: 'utf-8',
          content,
          token: 'token-task',
          upload: null,
          version: '3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d',
        });
      }),
      http.get(`${CONTEST_API}/tasks/:task/tree`, () => problem(404, 'not_found')),
      ...repoFiles,
    );
    renderApp(CONTEST);

    const card = await screen.findByRole('region', {
      name: 'How this contest is scored',
    });
    const sum = await within(card).findByRole('region', { name: 'B · sum' });
    await line(
      sum,
      'Test group “main”: each test passed is worth an equal share of 80 points. Passing every test earns 20 points more.',
    );
    const sort = within(card).getByRole('region', { name: 'A · sort' });
    await line(
      sort,
      'Test group “judge”: an entrant earns 1 point when every test passes, and nothing otherwise.',
    );
    const fresh = within(card).getByRole('region', { name: 'C · new' });
    expect(
      within(fresh).getByText('Not published yet, so entrants are told nothing of it.'),
    ).toBeVisible();
    expect(within(fresh).getByRole('heading', { level: 3 })).toHaveTextContent(
      'C · new: points known once the task is published',
    );
  });
});

describe("a task's timeline, edited on its row", () => {
  /** The contest's settings, each save taken and the file becoming it. */
  function settingsSaved(content?: string) {
    let file = files['contest.yaml']!;
    if (content !== undefined) file = { ...file, content };
    const sent: string[] = [];
    server.use(
      http.get(`${CONTEST_API}/files/:path`, ({ params }) =>
        params['path'] === 'contest.yaml' ? HttpResponse.json(file) : undefined,
      ),
      http.put(`${CONTEST_API}/files/:path`, async ({ request }) => {
        const body = (await request.json()) as { content: string };
        sent.push(body.content);
        file = { ...file, content: body.content, token: 'token-2' };
        return HttpResponse.json({ version: 'v2', notes: [] });
      }),
    );
    return sent;
  }

  it('saves the worth, the due time and the late rate typed as a percentage, exactly', async () => {
    server.use(signedIn, standingList, ...repoFiles);
    const sent = settingsSaved();
    const user = userEvent.setup();
    renderApp(CONTEST);

    await user.click(
      await screen.findByRole('button', { name: 'Edit the timeline of A · sort' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Timeline of A · sort' });
    const worth = await within(dialog).findByRole('textbox', { name: 'Worth' });
    expect(worth).toHaveAttribute('placeholder', '100, its test groups’ total');
    await user.type(worth, '120');
    const due = within(dialog).getByRole('radiogroup', { name: 'Due' });
    await user.click(within(due).getByRole('radio', { name: 'At a time' }));
    await user.type(
      within(dialog).getByRole('textbox', { name: /Taken off per started late day/ }),
      '12.5',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Save the timeline' }));

    expect(await within(dialog).findByText('Saved.')).toBeVisible();
    const [saved] = sent;
    expect(saved).toContain('late_per_day: 0.125');
    expect(parse(saved ?? '')).toMatchObject({
      tasks: [
        { id: 'sort', worth: 120, due: isoOf(localOf('2026-10-15T09:00:00Z')) },
        { id: 'sum' },
      ],
    });
  });

  it('offers a task that gives no points neither a worth nor a due time, saying why', async () => {
    server.use(signedIn, standingList, ...repoFiles);
    settingsSaved();
    const user = userEvent.setup();
    renderApp(CONTEST);

    await user.click(
      await screen.findByRole('button', { name: 'Edit the timeline of B · sum' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Timeline of B · sum' });
    const worth = await within(dialog).findByRole('textbox', { name: 'Worth' });
    expect(worth).toBeDisabled();
    expect(worth).toHaveAccessibleDescription(
      'This task gives no points, so it has no worth.',
    );
    expect(
      within(within(dialog).getByRole('radiogroup', { name: 'Due' })).getByRole(
        'radio',
        {
          name: 'At a time',
        },
      ),
    ).toBeDisabled();
  });

  it('moves a task down the list, which saves at once', async () => {
    server.use(signedIn, standingList, ...repoFiles);
    const sent = settingsSaved();
    const user = userEvent.setup();
    renderApp(CONTEST);

    await user.click(
      await screen.findByRole('button', { name: 'Edit the timeline of A · sort' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Timeline of A · sort' });
    expect(within(dialog).getByRole('button', { name: 'Move up' })).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: 'Move down' }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect((parse(sent[0] ?? '') as { tasks: { id: string }[] }).tasks).toEqual([
      { id: 'sum' },
      { id: 'sort' },
    ]);
  });

  it('says in a task’s timeline that it cannot be taken out of the contest yet', async () => {
    server.use(signedIn, standingList, ...repoFiles);
    settingsSaved();
    const user = userEvent.setup();
    renderApp(CONTEST);

    await user.click(
      await screen.findByRole('button', { name: 'Edit the timeline of A · sort' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Timeline of A · sort' });
    expect(
      within(dialog).getByText(
        'Every task in this list is part of the contest: a task cannot be taken out of it yet, so the contest opens only once each is published.',
      ),
    ).toBeVisible();
  });

  it('moves the task it was opened for, wherever the list read fresh has it', async () => {
    server.use(signedIn, standingList, ...repoFiles);
    // Someone else put a task ahead of sort since the page read its list.
    const sent = settingsSaved(
      'name: Spring\ntasks:\n  - id: extra\n  - id: sort\n  - id: sum\n',
    );
    const user = userEvent.setup();
    renderApp(CONTEST);

    await user.click(
      await screen.findByRole('button', { name: 'Edit the timeline of A · sort' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Timeline of A · sort' });
    await user.click(within(dialog).getByRole('button', { name: 'Move down' }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect((parse(sent[0] ?? '') as { tasks: { id: string }[] }).tasks).toEqual([
      { id: 'extra' },
      { id: 'sum' },
      { id: 'sort' },
    ]);
  });

  it("opens a task's timeline from a link that names one of its fields", async () => {
    server.use(signedIn, standingList, ...repoFiles);
    settingsSaved();
    renderApp(`${CONTEST}?part=tasks&field=worth&item=0`);

    const dialog = await screen.findByRole('dialog', { name: 'Timeline of A · sort' });
    await waitFor(() =>
      expect(within(dialog).getByRole('textbox', { name: 'Worth' })).toHaveFocus(),
    );
  });

  it("opens a task's timeline from such a link followed while the page is open", async () => {
    server.use(signedIn, standingList, ...repoFiles);
    settingsSaved();
    const { router } = renderApp(CONTEST);
    await screen.findByRole('listitem', { name: 'B · sum' });

    await router.navigate(`${CONTEST}?part=tasks&field=closes&item=1`);

    expect(
      await screen.findByRole('dialog', { name: 'Timeline of B · sum' }),
    ).toBeVisible();
  });

  it('offers an observer no way to edit a timeline', async () => {
    server.use(
      http.get('/api/v1/me', () =>
        HttpResponse.json({
          ...someone,
          roles: [
            { names: { org: 'acme', contest: 'spring', task: null }, role: 'observer' },
          ],
        }),
      ),
      standingList,
      ...repoFiles,
    );
    renderApp(CONTEST);

    await screen.findByRole('listitem', { name: 'A · sort' });
    expect(screen.queryByRole('button', { name: /^Edit the timeline/ })).toBeNull();
  });
});

describe("the contest's sections", () => {
  it('gives each section a card going to its page, in the order the sidebar lists them', async () => {
    server.use(signedIn, standingList, ...repoFiles);
    renderApp(CONTEST);

    const cards = await screen.findByRole('group', { name: "The contest's sections" });
    const titles = within(cards)
      .getAllByRole('heading', { level: 2 })
      .map((heading) => within(heading).getByRole('link'));
    const grid = CONTEST_SECTIONS.filter((section) => section.card === 'grid');
    expect(titles.map((link) => link.textContent)).toEqual(
      grid.map((section) => section.label),
    );
    expect(titles.map((link) => link.getAttribute('href'))).toEqual(
      grid.map((section) => `${CONTEST}/${section.segment}`),
    );

    const sidebar = screen.getByRole('group', { name: 'Contest' });
    expect(
      within(sidebar)
        .getAllByRole('link')
        .slice(1)
        .map((link) => [link.textContent, link.getAttribute('href')]),
    ).toEqual(
      CONTEST_SECTIONS.map((section) => [
        section.label,
        `${CONTEST}/${section.segment}`,
      ]),
    );
  });

  it('says how many gradings failed, linking to them on Gradings, and nothing while none has', async () => {
    let failed = 2;
    server.use(
      signedIn,
      standingList,
      http.get(`${CONTEST_API}/gradings/queue`, () =>
        HttpResponse.json({ queued: 0, dispatched: 0, failed }),
      ),
    );
    const { unmount } = renderApp(CONTEST);

    const notice = await screen.findByRole('region', { name: 'Failed gradings' });
    expect(notice).toHaveTextContent("2 gradings failed on Unicon's side.");
    expect(notice).toHaveTextContent(
      'Unicon tries a failed grading again once by itself. If that fails too, it waits for you to retry or cancel it; meanwhile its entrant sees “Grading delayed”.',
    );
    expect(
      within(notice).getByRole('link', { name: 'Show the failed gradings' }),
    ).toHaveAttribute(
      'href',
      '/orgs/acme/contests/spring/gradings?status=system_error&latest=true',
    );
    unmount();

    failed = 0;
    renderApp(CONTEST);
    expect(
      await within(await screen.findByRole('region', { name: 'Gradings' })).findByText(
        'Nothing is waiting to be graded.',
      ),
    ).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Failed gradings' })).toBeNull();
  });

  it('says on each card whether it needs going into', async () => {
    server.use(
      signedIn,
      standingList,
      ...repoFiles,
      http.get(`${CONTEST_API}/gradings/queue`, () =>
        HttpResponse.json({ queued: 3, dispatched: 1, failed: 0 }),
      ),
      http.get(`${CONTEST_API}/announcements`, () =>
        HttpResponse.json([
          { number: 1, title: 'Welcome', body: '', closed: false },
          { number: 2, title: 'Task B fixed', body: '', closed: false },
        ]),
      ),
    );
    renderApp(CONTEST);

    const says = async (name: string, line: string) =>
      expect(
        await within(await screen.findByRole('region', { name })).findByText(line),
      ).toBeVisible();
    await says('How people enter', '1 way in: a sign-up.');
    await says('Entrants', 'Nobody has registered yet.');
    await says('Gradings', '3 waiting to be graded, 1 being graded.');
    await says('Announcements', '2 posted; the latest is “Task B fixed”.');
    await says('Questions', 'Nobody has asked anything yet.');
    await says('Leaderboards', 'No leaderboard yet.');
    await says('Contest organisers', '0 organisers');
    // A contest holds no file but its settings, so it has no Files card (M43).
    expect(screen.queryByRole('region', { name: 'Files' })).toBeNull();
    // No button and no form on the page but the tasks' one button.
    const sections = screen.getByRole('group', { name: "The contest's sections" });
    expect(within(sections).queryByRole('button')).toBeNull();
    expect(screen.queryByRole('form')).toBeNull();
  });
});

describe('creating a task', () => {
  /**
   * The standings and the create beside them, as the backend keeps them: the
   * create adds the task to `contest.yaml`'s tasks before it answers, so the
   * standings list it from then on, never published.
   */
  function standingsAndCreate(answer?: () => Response) {
    const listed = [...standings];
    const sent: unknown[] = [];
    server.use(
      http.get(`${CONTEST_API}/organise/tasks`, () => HttpResponse.json(listed)),
      http.post(`${CONTEST_API}/tasks`, async ({ request }) => {
        const refused = answer?.();
        if (refused !== undefined) return refused;
        const body = (await request.json()) as { name: string };
        sent.push(body);
        listed.push({
          task: { name: body.name },
          label: 'C',
          state: { head: 'a1', latest: null, draft: false, errors: [] },
          timeline: {
            release_at: '2026-10-01T09:00:00Z',
            due: null,
            late_per_day: null,
            closes: '2026-10-15T09:00:00Z',
            worth: null,
          },
        });
        return HttpResponse.json({ name: body.name }, { status: 201 });
      }),
    );
    return sent;
  }

  async function submitTask(name: string, title = '') {
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'New task' }));
    const form = screen.getByRole('form', { name: 'New task' });
    await user.type(within(form).getByRole('textbox', { name: /^Name/ }), name);
    if (title !== '') {
      await user.type(within(form).getByRole('textbox', { name: /^Title/ }), title);
    }
    await user.click(within(form).getByRole('button', { name: 'Create task' }));
    return form;
  }

  it('sends the name and title, closes the form and lists the new task', async () => {
    server.use(signedIn, ...repoFiles);
    const sent = standingsAndCreate();
    renderApp(CONTEST);

    const form = await submitTask('max', 'Maximum');

    const list = screen.getByRole('list', { name: 'Tasks' });
    expect(await within(list).findByRole('link', { name: 'C · max' })).toHaveAttribute(
      'href',
      '/orgs/acme/contests/spring/tasks/max',
    );
    expect(within(list).getByRole('listitem', { name: 'C · max' })).toHaveTextContent(
      'Never published',
    );
    expect(sent).toEqual([{ name: 'max', title: 'Maximum' }]);
    expect(form).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New task' })).toHaveFocus();
  });

  it('starts a task of another kind on its workflow, in the task’s first save', async () => {
    server.use(signedIn, ...repoFiles);
    standingsAndCreate();
    const saves: { changes: { path: string; content: string; token: string }[] }[] = [];
    server.use(
      http.get('/api/v1/workflows', () =>
        HttpResponse.json([
          {
            owner: 'unicon',
            name: 'classic',
            versions: ['v2'],
            editable: false,
            visibility: 'public',
          },
          {
            owner: 'unicon',
            name: 'classic-folder',
            versions: ['v1'],
            editable: false,
            visibility: 'public',
          },
        ]),
      ),
      http.get('/api/v1/workflows/unicon/classic-folder/versions/v1', () =>
        HttpResponse.json({
          content:
            'inputs:\n  program: {type: folder, contestant: true, title: Program}\n  language: {type: enum, options: [c, python], contestant: true}\n  entry: {type: text, contestant: true}\n  time_limit: number\n  memory_limit: number\ntest:\n  input: file\n  answer: file\nsteps: []\n',
        }),
      ),
      http.get('/api/v1/orgs/acme/contests/spring/tasks/max/files/task.yaml', () =>
        HttpResponse.json({
          path: 'task.yaml',
          encoding: 'utf-8',
          content:
            'name: max\nworkflow: unicon/classic@v2\ninputs:\n  submission: {label: Your solution}\n  language: {options: [python]}\n  time_limit: 2\n  memory_limit: 256\ntest_groups:\n  main: {each: 100}\n',
          token: 'token-starter',
          upload: null,
          version: '3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d',
        }),
      ),
      http.post(
        '/api/v1/orgs/acme/contests/spring/tasks/max/save',
        async ({ request }) => {
          saves.push((await request.json()) as (typeof saves)[number]);
          return HttpResponse.json({
            number: 1,
            grading_changed: true,
            changes: [],
            notes: [],
            regraded: 0,
          });
        },
      ),
    );
    renderApp(CONTEST);

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'New task' }));
    const form = screen.getByRole('form', { name: 'New task' });
    await user.type(within(form).getByRole('textbox', { name: /^Name/ }), 'max');
    await user.click(
      await within(form).findByRole('radio', { name: 'A program of several files' }),
    );
    await user.click(within(form).getByRole('button', { name: 'Create task' }));

    await expect.poll(() => saves.length).toBe(1);
    const [change] = saves[0]?.changes ?? [];
    expect(change?.token).toBe('token-starter');
    expect(parse(change?.content ?? '')).toEqual({
      name: 'max',
      workflow: 'unicon/classic-folder@v1',
      inputs: {
        language: { options: ['python'] },
        time_limit: 2,
        memory_limit: 256,
        program: { label: 'Your program' },
      },
      test_groups: { main: { each: 100 } },
    });
  });

  it('says under each kind of task what it is, and under a greyed one why', async () => {
    server.use(signedIn, ...repoFiles);
    standingsAndCreate();
    server.use(
      http.get('/api/v1/workflows', () =>
        HttpResponse.json([
          {
            owner: 'unicon',
            name: 'classic',
            versions: ['v2'],
            editable: false,
            visibility: 'public',
          },
        ]),
      ),
    );
    renderApp(CONTEST);

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'New task' }));
    const form = screen.getByRole('form', { name: 'New task' });
    const classic = await within(form).findByRole('radio', {
      name: 'Compare output with an answer',
    });
    expect(classic).toBeChecked();
    expect(classic).toHaveAccessibleDescription(
      'Entrants submit one source file. Each test runs it on an input and compares what it prints with the answer.',
    );
    const folder = within(form).getByRole('radio', {
      name: 'A program of several files',
    });
    expect(folder).toBeDisabled();
    expect(folder).toHaveAccessibleDescription(/Its workflow is not available here\.$/);
    expect(
      within(form).getByRole('radiogroup', { name: 'What kind of task' }),
    ).not.toHaveAccessibleDescription(/not available/);
  });

  it('sends no title when none was given', async () => {
    server.use(signedIn, ...repoFiles);
    const sent = standingsAndCreate();
    renderApp(CONTEST);

    await submitTask('max');

    expect(await screen.findByRole('button', { name: 'New task' })).toBeVisible();
    expect(sent).toEqual([{ name: 'max', title: null }]);
  });

  it('shows a taken name beside the form, keeping what was typed', async () => {
    server.use(signedIn, ...repoFiles);
    standingsAndCreate(() =>
      problem(409, 'conflict', {
        detail: 'The task acme/spring/sum already exists.',
      }),
    );
    renderApp(CONTEST);

    const form = await submitTask('sum');

    expect(await within(form).findByRole('alert')).toHaveTextContent(
      'The task acme/spring/sum already exists.',
    );
    expect(within(form).getByRole('textbox', { name: /^Name/ })).toHaveValue('sum');
  });
});
