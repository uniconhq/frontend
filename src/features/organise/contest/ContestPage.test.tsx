import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@/test/user-event';
import { delay, http, HttpResponse } from 'msw';
import type { RegradeSummary, TaskStanding } from '@/api/types';
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
  unchanged,
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

describe("the contest's regrades (#448)", () => {
  it('sums up a task’s latest regrade on the contest page, each count a link to those submissions on Gradings', async () => {
    const regrade: RegradeSummary = {
      id: '0199a2c1-0000-7000-8000-0000000000bb',
      task: 'sum',
      label: 'B',
      cause: 'rejudge',
      publication: 3,
      started_at: '2026-10-12T14:00:00Z',
      started_by: 7,
      started_by_name: 'alice',
      total: 12,
      graded: 12,
      running: false,
      counts: {
        unchanged: 9,
        new: 3,
        running: 0,
        failed: 0,
        over_limit: 0,
      },
    };
    server.use(
      signedIn,
      standingList,
      ...repoFiles,
      http.get(`${CONTEST_API}/gradings/regrades`, () => HttpResponse.json([regrade])),
    );
    renderApp(CONTEST);

    const regrades = await screen.findByRole('region', { name: 'Regrades' });
    const summary = within(regrades).getByRole('listitem', { name: 'Regrade of B' });
    expect(summary).toHaveTextContent(
      'Regrade of B: 12 graded · 3 graded for the first time',
    );
    const gradings = `${CONTEST}/gradings`;
    expect(
      within(summary).getByRole('link', { name: '3 graded for the first time' }),
    ).toHaveAttribute('href', `${gradings}?regrade=${regrade.id}&change=new`);
    expect(within(summary).getByRole('link', { name: '12 graded' })).toHaveAttribute(
      'href',
      `${gradings}?regrade=${regrade.id}`,
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
    const status = screen.getByRole('region', { name: 'Status' });
    expect(
      await within(status).findByRole('link', { name: /^A · Sorting: / }),
    ).toBeVisible();
  });

  it("says each task's latest publication and its timeline as one line, defaults resolved", async () => {
    server.use(signedIn, standingList, ...repoFiles);
    renderApp(CONTEST);

    const sort = await screen.findByRole('listitem', { name: 'A · sort' });
    // The first publication has none before it to have changed from.
    expect(sort).toHaveTextContent(`Publication 1, ${at('2026-09-20T10:00:00Z')}`);
    expect(sort).not.toHaveTextContent(/grades|grading/);
    expect(sort).toHaveTextContent(
      `open for the whole contest; due ${at('2026-10-08T09:00:00Z')}`,
    );

    const sum = screen.getByRole('listitem', { name: 'B · sum' });
    expect(sum).toHaveTextContent('open for the whole contest');
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
            'leaderboards: {final: {columns: {marked: {value: [sort, marked]}}}}',
            'tasks: [{id: sort, marks: 2}]',
            '',
          ].join('\n'),
        }),
      ),
      ...repoFiles,
    );
    renderApp(CONTEST);

    expect(await screen.findByRole('listitem', { name: 'A · sort' })).toHaveTextContent(
      `opens ${at('2026-10-02T09:00:00Z')}; due ${at('2026-10-08T09:00:00Z')}; closes with the contest; an entrant may mark up to 2 submissions`,
    );
  });

  it("says how many problems hold back a task's last save, which its own page lists", async () => {
    server.use(signedIn, standingList, ...repoFiles);
    renderApp(CONTEST);

    const sum = await screen.findByRole('listitem', { name: 'B · sum' });
    expect(sum).toHaveTextContent(`Publication 2, ${at('2026-09-21T10:00:00Z')}`);
    expect(sum).not.toHaveTextContent(/unchanged|how it grades/);
    expect(sum).toHaveTextContent('1 problem in its last save');
    expect(within(sum).queryByRole('list', { name: 'Errors' })).toBeNull();
  });

  it('says a task that has never published so, and its timeline', async () => {
    const fresh: TaskStanding = {
      task: { name: 'max' },
      label: 'C',
      withdrawn: false,
      submissions: 0,
      take_out: 'remove',
      state: {
        head: 'a1',
        latest: null,
        draft: true,
        errors: [{ path: '', message: 'task.yaml is missing.' }],
        statement_written: false,
        head_statement_written: false,
        results: { history: [], released: false },
      },
      timeline: {
        release_at: '2026-10-01T09:00:00Z',
        due: null,
        closes: '2026-10-15T09:00:00Z',
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
    expect(max).toHaveTextContent('open for the whole contest');

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

describe("a task's place in the contest, changed from its row", () => {
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

  it('saves the due time chosen, exactly', async () => {
    server.use(signedIn, standingList, ...repoFiles);
    const sent = settingsSaved();
    const user = userEvent.setup();
    renderApp(CONTEST);

    await user.click(
      await screen.findByRole('button', { name: 'Change A · sort in this contest' }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'A · sort in this contest',
    });
    const due = await within(dialog).findByRole('radiogroup', { name: 'Due' });
    await user.click(within(due).getByRole('radio', { name: 'At a time' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await within(dialog).findByText('Saved.')).toBeVisible();
    const [saved] = sent;
    expect(parse(saved ?? '')).toMatchObject({
      tasks: [
        { id: 'sort', due: isoOf(localOf('2026-10-15T09:00:00Z')) },
        { id: 'sum' },
      ],
    });
  });

  it('offers when the task opens, falls due and closes, and no marks while no leaderboard reads them', async () => {
    server.use(signedIn, standingList, ...repoFiles);
    settingsSaved();
    const user = userEvent.setup();
    renderApp(CONTEST);

    await user.click(
      await screen.findByRole('button', { name: 'Change B · sum in this contest' }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'B · sum in this contest',
    });
    for (const name of ['Opens', 'Due', 'Closes']) {
      expect(await within(dialog).findByRole('radiogroup', { name })).toBeVisible();
    }
    expect(
      within(dialog).queryByRole('textbox', {
        name: /Submissions each entrant may mark/,
      }),
    ).toBeNull();
  });

  it('moves a task down the list from its row, which saves at once', async () => {
    server.use(signedIn, standingList, ...repoFiles);
    const sent = settingsSaved();
    const user = userEvent.setup();
    renderApp(CONTEST);

    const row = await screen.findByRole('listitem', { name: 'A · sort' });
    expect(
      within(row).getByRole('button', { name: 'Move A · sort up' }),
    ).toBeDisabled();
    await user.click(within(row).getByRole('button', { name: 'Move A · sort down' }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect((parse(sent[0] ?? '') as { tasks: { id: string }[] }).tasks).toEqual([
      { id: 'sum' },
      { id: 'sort' },
    ]);
    expect(
      within(screen.getByRole('listitem', { name: 'B · sum' })).getByRole('button', {
        name: 'Move B · sum down',
      }),
    ).toBeDisabled();
  });

  it('asks before a move once the contest has started, saying which letters change', async () => {
    server.use(signedIn, standingList, ...repoFiles);
    const sent = settingsSaved(
      [
        'name: Spring',
        'start: 2020-01-01T09:00:00Z',
        'end: 2099-01-01T09:00:00Z',
        'state: published',
        'tasks:',
        '  - id: sort',
        '  - id: sum',
        '',
      ].join('\n'),
    );
    const user = userEvent.setup();
    renderApp(CONTEST);

    const row = await screen.findByRole('listitem', { name: 'B · sum' });
    await user.click(within(row).getByRole('button', { name: 'Move B · sum up' }));
    const asked = await screen.findByRole('dialog', { name: 'Move B · sum up?' });
    expect(asked).toHaveTextContent(
      'The contest has started, so entrants see this at once: B · sum becomes A, and A · sort becomes B. The leaderboards, the contest’s page and every announcement or question that names a task by its letter go by the new letters.',
    );
    await user.click(within(asked).getByRole('button', { name: 'Cancel' }));
    expect(sent).toEqual([]);

    await user.click(within(row).getByRole('button', { name: 'Move B · sum up' }));
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Move B · sum up?' })).getByRole(
        'button',
        { name: 'Move it up' },
      ),
    );
    await waitFor(() => expect(sent).toHaveLength(1));
    expect((parse(sent[0] ?? '') as { tasks: { id: string }[] }).tasks).toEqual([
      { id: 'sum' },
      { id: 'sort' },
    ]);
  });

  it('opens the dialog from the row’s second line, which ends in Change, and has no Edit button', async () => {
    server.use(signedIn, standingList, ...repoFiles);
    settingsSaved();
    renderApp(CONTEST);

    const row = await screen.findByRole('listitem', { name: 'A · sort' });
    const line = within(row).getByRole('button', {
      name: 'Change A · sort in this contest',
    });
    expect(line).toHaveTextContent(/open for the whole contest.*·Change$/);
    expect(within(row).queryByRole('button', { name: /^Edit/ })).toBeNull();
  });

  it('offers no arrows while the contest has one task', async () => {
    server.use(
      signedIn,
      http.get(`${CONTEST_API}/organise/tasks`, () =>
        HttpResponse.json(standings.slice(0, 1)),
      ),
      ...repoFiles,
    );
    settingsSaved();
    renderApp(CONTEST);

    const row = await screen.findByRole('listitem', { name: 'A · sort' });
    expect(within(row).queryByRole('button', { name: /^Move/ })).toBeNull();
    expect(
      within(row).getByRole('button', { name: 'Change A · sort in this contest' }),
    ).toBeVisible();
  });

  it('moves the task whose arrow was pressed, wherever the list read fresh has it', async () => {
    server.use(signedIn, standingList, ...repoFiles);
    // Someone else put a task ahead of sort since the page read its list.
    const sent = settingsSaved(
      'name: Spring\ntasks:\n  - id: extra\n  - id: sort\n  - id: sum\n',
    );
    const user = userEvent.setup();
    renderApp(CONTEST);

    const row = await screen.findByRole('listitem', { name: 'A · sort' });
    await user.click(within(row).getByRole('button', { name: 'Move A · sort down' }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect((parse(sent[0] ?? '') as { tasks: { id: string }[] }).tasks).toEqual([
      { id: 'extra' },
      { id: 'sum' },
      { id: 'sort' },
    ]);
  });

  it("opens a task's dialog from a link that names one of its fields", async () => {
    server.use(signedIn, standingList, ...repoFiles);
    settingsSaved();
    renderApp(`${CONTEST}?part=tasks&field=due&item=0`);

    const dialog = await screen.findByRole('dialog', {
      name: 'A · sort in this contest',
    });
    await waitFor(() =>
      expect(within(dialog).getByRole('radio', { name: 'No due time' })).toHaveFocus(),
    );
  });

  it("opens a task's dialog from such a link followed while the page is open", async () => {
    server.use(signedIn, standingList, ...repoFiles);
    settingsSaved();
    const { router } = renderApp(CONTEST);
    await screen.findByRole('listitem', { name: 'B · sum' });

    await router.navigate(`${CONTEST}?part=tasks&field=closes&item=1`);

    expect(
      await screen.findByRole('dialog', { name: 'B · sum in this contest' }),
    ).toBeVisible();
  });

  it('offers an observer the line as text, with no way to change or move a task', async () => {
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

    const row = await screen.findByRole('listitem', { name: 'A · sort' });
    expect(within(row).getByText(/open for the whole contest/)).toBeVisible();
    expect(within(row).queryByRole('button')).toBeNull();
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
    await says('Leaderboards', 'No hold.');
    await says('Contest organisers', '0 organisers');
    // A contest holds no file but its settings, so it has no Files card (M43).
    expect(screen.queryByRole('region', { name: 'Files' })).toBeNull();
    // No button and no form on the page but the tasks' one button.
    const sections = screen.getByRole('group', { name: "The contest's sections" });
    expect(within(sections).queryByRole('button')).toBeNull();
    expect(screen.queryByRole('form')).toBeNull();
  });

  it('asks before ending a hold', async () => {
    const user = userEvent.setup();
    let ended = false;
    server.use(
      signedIn,
      standingList,
      ...repoFiles,
      http.get('/api/v1/orgs/:org/contests/:contest/hold', () =>
        HttpResponse.json(
          ended
            ? {
                from: '2030-10-01T13:00:00Z',
                until: 'staff',
                holding: false,
                ended_at: '2026-10-25T01:00:00Z',
                ended_by: 7,
                ended_by_name: 'kenny',
              }
            : {
                from: '2030-10-01T13:00:00Z',
                until: 'staff',
                holding: true,
                ended_at: null,
                ended_by: null,
                ended_by_name: null,
              },
        ),
      ),
      http.post('/api/v1/orgs/:org/contests/:contest/hold/end', async ({ request }) => {
        const body = (await request.json()) as { confirm: boolean };
        if (!body.confirm) {
          return problem(409, 'confirmation_required', {
            detail: 'Every row becomes visible, and this hold cannot be put back.',
          });
        }
        ended = true;
        return HttpResponse.json({
          from: '2030-10-01T13:00:00Z',
          until: 'staff',
          holding: false,
          ended_at: '2026-10-25T01:00:00Z',
          ended_by: 7,
          ended_by_name: 'kenny',
        });
      }),
    );
    renderApp(CONTEST);
    const boards = await screen.findByRole('region', { name: 'Leaderboards' });
    await user.click(
      await within(boards).findByRole('button', { name: 'End the hold now' }),
    );
    expect(
      await screen.findByText(
        'Every row becomes visible, and this hold cannot be put back.',
      ),
    ).toBeVisible();
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'End the hold now',
      }),
    );
    expect(await within(boards).findByText(/Ended by kenny/)).toBeVisible();
    expect(
      within(boards).queryByRole('button', { name: 'End the hold now' }),
    ).toBeNull();
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
          withdrawn: false,
          submissions: 0,
          take_out: 'remove',
          state: {
            head: 'a1',
            latest: null,
            draft: false,
            errors: [],
            statement_written: false,
            head_statement_written: false,
            results: { history: [], released: false },
          },
          timeline: {
            release_at: '2026-10-01T09:00:00Z',
            due: null,
            closes: '2026-10-15T09:00:00Z',
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
            versions: ['v3'],
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
            'inputs:\n  program: {type: folder, title: Program}\n  language: {type: enum, options: [c, python]}\n  entry: text\n  time_limit: number\n  memory_limit: number\n  input: file\n  answer: file\nsteps: []\n',
        }),
      ),
      http.get('/api/v1/orgs/acme/contests/spring/tasks/max/files/task.yaml', () =>
        HttpResponse.json({
          path: 'task.yaml',
          encoding: 'utf-8',
          content:
            'name: max\nworkflow: unicon/classic@v3\ninputs:\n  code: {entrant: {label: Your solution}}\n  language: {entrant: {label: Language, options: [python]}}\n  time_limit: 2\n  memory_limit: 256\nrepeat:\n  - inputs: [input, answer]\n    tuples:\n      - [tests/1.in, tests/1.ans]\n',
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
            effect: unchanged,
          });
        },
      ),
    );
    renderApp(CONTEST);

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'New task' }));
    const form = screen.getByRole('form', { name: 'New task' });
    await user.type(within(form).getByRole('textbox', { name: /^Name/ }), 'max');
    await user.selectOptions(
      await within(form).findByRole('combobox', { name: 'Workflow' }),
      'unicon/classic-folder',
    );
    await user.click(within(form).getByRole('button', { name: 'Create task' }));

    await expect.poll(() => saves.length).toBe(1);
    const [change] = saves[0]?.changes ?? [];
    expect(change?.token).toBe('token-starter');
    expect(parse(change?.content ?? '')).toEqual({
      name: 'max',
      workflow: 'unicon/classic-folder@v1',
      inputs: {
        language: { entrant: { label: 'Language', options: ['python'] } },
        time_limit: 2,
        memory_limit: 256,
      },
      repeat: [
        { inputs: ['input', 'answer'], tuples: [['tests/1.in', 'tests/1.ans']] },
      ],
    });
  });

  it('offers the workflows the organiser may read, and no other', async () => {
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
    const workflow = await within(form).findByRole('combobox', { name: 'Workflow' });
    expect(
      within(workflow).getByRole('option', { name: 'unicon/classic' }),
    ).toBeVisible();
    expect(
      within(workflow).queryByRole('option', { name: 'unicon/classic-folder' }),
    ).toBeNull();
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

describe('taking a task out of the contest', () => {
  /** The spring contest's tasks, `sort` as `change` makes it. */
  function sortAs(change: Partial<TaskStanding>) {
    const [sort, ...rest] = standings;
    if (sort === undefined) throw new Error('sort is listed');
    return http.get(`${CONTEST_API}/organise/tasks`, () =>
      HttpResponse.json([{ ...sort, ...change }, ...rest]),
    );
  }

  /** Each take-out asked, and its answer: done, unless `answer` refuses it. */
  function takeOuts(answer?: (asked: number) => Response | undefined) {
    const sent: unknown[] = [];
    server.use(
      http.post(`${CONTEST_API}/tasks/:task/take-out`, async ({ request, params }) => {
        const body = (await request.json()) as { confirmed: string };
        sent.push({ task: params['task'], ...body });
        return answer?.(sent.length) ?? HttpResponse.json({ done: body.confirmed });
      }),
    );
    return sent;
  }

  async function openDialog(user: ReturnType<typeof userEvent.setup>) {
    await user.click(
      await screen.findByRole('button', { name: 'Change A · sort in this contest' }),
    );
    return screen.findByRole('dialog', { name: 'A · sort in this contest' });
  }

  it('removes a task nobody has submitted to, after saying it is deleted for good', async () => {
    server.use(signedIn, standingList, ...repoFiles);
    const sent = takeOuts();
    const user = userEvent.setup();
    renderApp(CONTEST);

    const dialog = await openDialog(user);
    expect(within(dialog).queryByText(/cannot be taken out/)).toBeNull();
    await user.click(
      within(dialog).getByRole('button', { name: 'Remove A · sort from the contest' }),
    );
    const asked = await screen.findByRole('dialog', {
      name: 'Remove A · sort from the contest?',
    });
    expect(asked).toHaveTextContent(
      'Nobody has submitted to A · sort. Removing it deletes the task and its files for good, and the tasks after it each move up a letter.',
    );
    expect(asked).toHaveTextContent('This cannot be undone.');
    await user.click(within(asked).getByRole('button', { name: 'Remove it' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(sent).toEqual([{ task: 'sort', confirmed: 'remove' }]);
  });

  it('goes back to the timeline from the question on Not now', async () => {
    server.use(signedIn, standingList, ...repoFiles);
    const sent = takeOuts();
    const user = userEvent.setup();
    renderApp(CONTEST);

    const dialog = await openDialog(user);
    await user.click(
      within(dialog).getByRole('button', { name: 'Remove A · sort from the contest' }),
    );
    const asked = await screen.findByRole('dialog', {
      name: 'Remove A · sort from the contest?',
    });
    await user.click(within(asked).getByRole('button', { name: 'Not now' }));

    expect(
      await screen.findByRole('dialog', { name: 'A · sort in this contest' }),
    ).toBeVisible();
    expect(sent).toEqual([]);
  });

  it('withdraws a task with submissions, saying what entrants lose and that it can be put back', async () => {
    server.use(
      signedIn,
      sortAs({ submissions: 14, take_out: 'withdraw' }),
      ...repoFiles,
    );
    const sent = takeOuts();
    const user = userEvent.setup();
    renderApp(CONTEST);

    const dialog = await openDialog(user);
    await user.click(
      within(dialog).getByRole('button', {
        name: 'Withdraw A · sort from the contest',
      }),
    );
    const asked = await screen.findByRole('dialog', {
      name: 'Withdraw A · sort from the contest?',
    });
    expect(asked).toHaveTextContent(
      'A · sort has 14 submissions. Withdrawing it hides it from entrants and takes its points off every leaderboard. Its submissions are kept, and you can put it back.',
    );
    await user.click(within(asked).getByRole('button', { name: 'Withdraw it' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(sent).toEqual([{ task: 'sort', confirmed: 'withdraw' }]);
  });

  it('asks again when someone submitted since the dialog opened, then withdraws', async () => {
    server.use(signedIn, standingList, ...repoFiles);
    const sent = takeOuts((asked) =>
      asked === 1
        ? problem(409, 'take_out_changed', {
            detail: 'sort has 1 submission now, so it can no longer be removed.',
            submissions: 1,
            take_out: 'withdraw',
          })
        : undefined,
    );
    const user = userEvent.setup();
    renderApp(CONTEST);

    const dialog = await openDialog(user);
    await user.click(
      within(dialog).getByRole('button', { name: 'Remove A · sort from the contest' }),
    );
    await user.click(
      within(
        await screen.findByRole('dialog', {
          name: 'Remove A · sort from the contest?',
        }),
      ).getByRole('button', { name: 'Remove it' }),
    );
    const again = await screen.findByRole('dialog', {
      name: 'Withdraw A · sort from the contest?',
    });
    expect(again).toHaveTextContent(
      'Someone has submitted to A · sort since this dialog opened, so it can no longer be removed, only withdrawn.',
    );
    expect(again).toHaveTextContent('A · sort has 1 submission.');
    await user.click(within(again).getByRole('button', { name: 'Withdraw it' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(sent).toEqual([
      { task: 'sort', confirmed: 'remove' },
      { task: 'sort', confirmed: 'withdraw' },
    ]);
  });

  it('says which leaderboard stands in the way of removing a task, with the way to it', async () => {
    server.use(signedIn, standingList, ...repoFiles);
    takeOuts(() =>
      problem(409, 'take_out_refused', {
        detail:
          'The leaderboard Practice counts sort by name. Take sort out of that leaderboard first, then remove the task.',
        boards: ['Practice'],
      }),
    );
    const user = userEvent.setup();
    renderApp(CONTEST);

    const dialog = await openDialog(user);
    await user.click(
      within(dialog).getByRole('button', { name: 'Remove A · sort from the contest' }),
    );
    const asked = await screen.findByRole('dialog', {
      name: 'Remove A · sort from the contest?',
    });
    await user.click(within(asked).getByRole('button', { name: 'Remove it' }));

    const alert = await within(asked).findByRole('alert');
    expect(alert).toHaveTextContent(
      'The leaderboard Practice counts sort by name. Take sort out of that leaderboard first, then remove the task.',
    );
    expect(
      within(alert).getByRole('link', { name: 'Open Leaderboards' }),
    ).toHaveAttribute('href', '/orgs/acme/contests/spring/leaderboards');
  });

  it('marks a withdrawn task on its row, and puts it back from there after asking', async () => {
    server.use(
      signedIn,
      sortAs({ withdrawn: true, submissions: 14, take_out: null }),
      ...repoFiles,
    );
    const sent: string[] = [];
    server.use(
      http.post(`${CONTEST_API}/tasks/:task/put-back`, ({ params }) => {
        sent.push(String(params['task']));
        return HttpResponse.json({
          notes: ['The leaderboard Standings counts sort again.'],
        });
      }),
    );
    const user = userEvent.setup();
    renderApp(CONTEST);

    const row = await screen.findByRole('listitem', { name: 'A · sort' });
    expect(within(row).getByText('Withdrawn')).toBeVisible();
    await user.click(
      within(row).getByRole('button', { name: 'Put A · sort back in the contest' }),
    );
    const asked = await screen.findByRole('dialog', {
      name: 'Put A · sort back in the contest?',
    });
    expect(asked).toHaveTextContent(
      'Entrants see it again and can submit to it while it is open, and every leaderboard counts it as before, its submissions included.',
    );
    await user.click(within(asked).getByRole('button', { name: 'Put it back' }));

    const back = await screen.findByRole('dialog', {
      name: 'A · sort is back in the contest',
    });
    expect(
      within(back).getByRole('list', { name: 'About the leaderboards' }),
    ).toHaveTextContent('The leaderboard Standings counts sort again.');
    expect(sent).toEqual(['sort']);
    await user.click(within(back).getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('says why a withdrawn task cannot go back as the settings stand', async () => {
    server.use(
      signedIn,
      sortAs({ withdrawn: true, submissions: 14, take_out: null }),
      ...repoFiles,
      http.post(`${CONTEST_API}/tasks/:task/put-back`, () =>
        problem(422, 'invalid_definition', {
          errors: [
            {
              path: 'tasks[0].release_at',
              message: 'sort was released already; its release cannot move later.',
            },
          ],
        }),
      ),
    );
    const user = userEvent.setup();
    renderApp(CONTEST);

    const row = await screen.findByRole('listitem', { name: 'A · sort' });
    await user.click(
      within(row).getByRole('button', { name: 'Put A · sort back in the contest' }),
    );
    const asked = await screen.findByRole('dialog', {
      name: 'Put A · sort back in the contest?',
    });
    await user.click(within(asked).getByRole('button', { name: 'Put it back' }));

    const alert = await within(asked).findByRole('alert');
    expect(alert).toHaveTextContent(
      'It cannot go back as the contest’s settings stand:',
    );
    expect(alert).toHaveTextContent(
      'sort was released already; its release cannot move later.',
    );
  });

  it('says in the dialog of a withdrawn task what that means, with the way to put it back', async () => {
    server.use(
      signedIn,
      sortAs({ withdrawn: true, submissions: 14, take_out: null }),
      ...repoFiles,
    );
    const user = userEvent.setup();
    renderApp(CONTEST);

    const dialog = await openDialog(user);
    expect(dialog).toHaveTextContent(
      'Withdrawn: entrants do not see it, and no leaderboard counts it. Its 14 submissions are kept.',
    );
    expect(
      within(dialog).queryByRole('button', { name: /Withdraw A · sort/ }),
    ).toBeNull();
    await user.click(
      within(dialog).getByRole('button', { name: 'Put A · sort back in the contest' }),
    );
    expect(
      await screen.findByRole('dialog', { name: 'Put A · sort back in the contest?' }),
    ).toBeVisible();
  });
});
