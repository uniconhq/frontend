import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import userEvent from '@/test/user-event';
import {
  CONTEST_API,
  TASK_API,
  home,
  publicContest,
  taskPage,
} from '@/test/contestant';
import { listedContests } from '@/test/may';
import { standingList } from '@/test/organiser';
import { renderApp } from '@/test/render';
import { problem, server, signedIn } from '@/test/server';
import {
  CONTEST_SECTIONS,
  ORG_SECTIONS,
  TASK_BUILD_CARDS,
  TASK_SECTIONS,
} from '@/lib/sections';
import { workflowItem } from '@/test/workflows';

/** Each part of the trail: its words, where it goes, and whether it is the page. */
async function trail() {
  const nav = await screen.findByRole('navigation', { name: 'Breadcrumb' });
  return [...nav.children].map((step) => {
    const link = within(step as HTMLElement).queryByRole('link');
    return {
      label: (link ?? step).textContent.replace(/^\//, ''),
      to: link?.getAttribute('href') ?? null,
      current: link?.getAttribute('aria-current') === 'page',
    };
  });
}

/** Opens a part's arrow and reads its menu, as headings and links. */
async function menuOf(label: string) {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: `${label} menu` }));
  const menu = await screen.findByRole('menu', { name: `${label} menu` });
  await waitFor(() => expect(within(menu).queryByLabelText('Loading')).toBeNull());
  return [...menu.querySelectorAll('.mantine-Menu-label, a')].map((entry) =>
    entry.tagName === 'A'
      ? [entry.textContent, entry.getAttribute('href')]
      : entry.textContent,
  );
}

describe('the breadcrumb', () => {
  it('starts at Home and walks an organiser down to a section of a task, each part a link', async () => {
    server.use(signedIn);
    renderApp('/orgs/acme/contests/spring/tasks/sum/gradings');

    expect(await trail()).toEqual([
      { label: 'Home', to: '/', current: false },
      { label: 'acme', to: '/orgs/acme', current: false },
      { label: 'spring', to: '/orgs/acme/contests/spring', current: false },
      { label: 'sum', to: '/orgs/acme/contests/spring/tasks/sum', current: false },
      {
        label: 'Gradings',
        to: '/orgs/acme/contests/spring/tasks/sum/gradings',
        current: true,
      },
    ]);
  });

  it("names the org's open questions as their card does", async () => {
    server.use(signedIn);
    renderApp('/orgs/acme/clarifications');

    expect((await trail()).map((step) => step.label)).toEqual([
      'Home',
      'acme',
      'Open questions',
    ]);
  });

  it('keeps a part of a section opened by its address under the section', async () => {
    server.use(signedIn);
    renderApp('/orgs/acme/contests/spring/settings#file');

    expect((await trail()).at(-1)).toEqual({
      label: 'Settings',
      to: '/orgs/acme/contests/spring/settings',
      current: true,
    });
  });

  it('says an address that is no page is not found', async () => {
    server.use(signedIn);
    renderApp('/orgs/acme/contests/spring/boards');

    expect(await trail()).toEqual([
      { label: 'Home', to: '/', current: false },
      { label: 'Page not found', to: null, current: false },
    ]);
  });

  it('puts a contest its entrants see straight under Home', async () => {
    server.use(
      http.get('/api/v1/public/contests/:org/:contest/leaderboards', () =>
        HttpResponse.json([]),
      ),
    );
    renderApp('/contests/acme/spring/leaderboards');

    expect(await trail()).toEqual([
      { label: 'Home', to: '/', current: false },
      { label: 'spring', to: '/contests/acme/spring', current: false },
      {
        label: 'Leaderboards',
        to: '/contests/acme/spring/leaderboards',
        current: true,
      },
    ]);
  });

  it.each([
    ['/account', 'Account'],
    ['/invites', 'Invites'],
    ['/orgs', 'Orgs'],
    ['/workflows', 'Workflows'],
    ['/workflows/kenny/tuned', 'kenny/tuned'],
  ])('puts %s under Home, with no arrow of its own', async (path, label) => {
    server.use(signedIn);
    renderApp(path);

    expect(await trail()).toEqual([
      { label: 'Home', to: '/', current: false },
      { label, to: path, current: true },
    ]);
    await waitFor(() =>
      expect(
        screen
          .getAllByRole('button', { name: /menu$/ })
          .map((button) => button.getAttribute('aria-label')),
      ).toEqual(['Home menu', 'Account menu']),
    );
  });

  it('gives a visitor Home alone, with nothing under it', async () => {
    renderApp('/');

    expect(await trail()).toEqual([{ label: 'Home', to: '/', current: true }]);
    expect(screen.queryByRole('button', { name: 'Home menu' })).toBeNull();
  });

  it('names the contest and the task as their pages do', async () => {
    let askedOrg = 0;
    server.use(
      signedIn,
      http.get('/api/v1/orgs/:org', () => {
        askedOrg += 1;
        return HttpResponse.json({ display_name: 'Acme University', description: '' });
      }),
      http.get(`${CONTEST_API}/home`, () => HttpResponse.json(home())),
      http.get(`${TASK_API}/page`, () => HttpResponse.json(taskPage)),
      http.get(`${TASK_API}/submissions`, () => HttpResponse.json([])),
    );
    renderApp('/contests/acme/spring/tasks/sum');

    await screen.findByRole('heading', { name: 'A. Sum of Two', level: 1 });
    expect(await trail()).toEqual([
      { label: 'Home', to: '/', current: false },
      { label: 'Spring 2026', to: '/contests/acme/spring', current: false },
      { label: 'A. Sum of Two', to: '/contests/acme/spring/tasks/sum', current: true },
    ]);
    // The trail asks nothing of its own: an entrant's pages never read the org.
    expect(askedOrg).toBe(0);
  });

  it('calls each part by its address until its page has read its name', async () => {
    server.use(
      signedIn,
      http.get(`${CONTEST_API}/home`, async () => {
        await delay('infinite');
        return HttpResponse.json(home());
      }),
      http.get(`${TASK_API}/page`, async () => {
        await delay('infinite');
        return HttpResponse.json(taskPage);
      }),
    );
    renderApp('/contests/acme/spring/tasks/sum');

    expect((await trail()).map((step) => step.label)).toEqual([
      'Home',
      'spring',
      'sum',
    ]);
  });

  it('names an org by its display name once its page has read it', async () => {
    server.use(
      signedIn,
      http.get('/api/v1/orgs/:org', () =>
        HttpResponse.json({ display_name: 'Acme University', description: '' }),
      ),
    );
    renderApp('/orgs/acme');

    await waitFor(async () =>
      expect((await trail()).map((step) => step.label)).toEqual([
        'Home',
        'Acme University',
      ]),
    );
  });
});

describe("the breadcrumb's menus", () => {
  it("lists Home's orgs and workflows", async () => {
    server.use(
      signedIn,
      http.get('/api/v1/workflows', () =>
        HttpResponse.json([workflowItem({ versions: [] })]),
      ),
    );
    renderApp('/account');

    expect(await menuOf('Home')).toEqual([
      'Orgs',
      ['acme', '/orgs/acme'],
      'Workflows',
      ['kenny/tuned', '/workflows/kenny/tuned'],
    ]);
  });

  it("lists an org's contests and sections", async () => {
    server.use(
      signedIn,
      http.get('/api/v1/orgs/:org/contests', () =>
        HttpResponse.json([{ name: 'spring', state: 'draft', start: null, end: null }]),
      ),
    );
    renderApp('/orgs/acme/settings');

    expect(await menuOf('acme')).toEqual([
      'Contests',
      ['spring', '/orgs/acme/contests/spring'],
      'Sections',
      ...ORG_SECTIONS.map((section) => [
        section.label,
        `/orgs/acme/${section.segment}`,
      ]),
    ]);
  });

  it('lists the contests the server lists for someone holding a role at one alone', async () => {
    server.use(
      signedIn,
      http.get('/api/v1/orgs/:org/contests', () =>
        HttpResponse.json(
          listedContests('manager').filter(({ name }) => name === 'spring'),
        ),
      ),
    );
    renderApp('/orgs/acme/contests/spring/entrants');

    const menu = await menuOf('acme');
    expect(menu.slice(0, 2)).toEqual([
      'Contests',
      ['spring', '/orgs/acme/contests/spring'],
    ]);
  });

  it("lists a contest's tasks and sections", async () => {
    server.use(signedIn, standingList);
    renderApp('/orgs/acme/contests/spring/entrants');

    expect(await menuOf('spring')).toEqual([
      'Tasks',
      ['A · sort', '/orgs/acme/contests/spring/tasks/sort'],
      ['B · sum', '/orgs/acme/contests/spring/tasks/sum'],
      'Sections',
      ...CONTEST_SECTIONS.map((section) => [
        section.label,
        `/orgs/acme/contests/spring/${section.segment}`,
      ]),
    ]);
  });

  it('lists the tasks the server names when the contest refuses its standings', async () => {
    server.use(
      signedIn,
      http.get(`${CONTEST_API}/organise/tasks`, () => problem(403, 'forbidden')),
      http.get(`${CONTEST_API}/tasks`, () =>
        HttpResponse.json([{ name: 'sum', may_manage: true }]),
      ),
    );
    renderApp('/orgs/acme/contests/spring/tasks/sum/marking');

    const menu = await menuOf('spring');
    expect(menu.slice(0, 2)).toEqual([
      'Tasks',
      ['sum', '/orgs/acme/contests/spring/tasks/sum'],
    ]);
  });

  it("lists a task's build cards and sections", async () => {
    server.use(signedIn);
    renderApp('/orgs/acme/contests/spring/tasks/sum/marking');

    const task = '/orgs/acme/contests/spring/tasks/sum';
    expect(await menuOf('sum')).toEqual([
      "On the task's page",
      ...TASK_BUILD_CARDS.map((card) => [card.label, `${task}?card=${card.key}`]),
      'Sections',
      ...TASK_SECTIONS.map((section) => [section.label, `${task}/${section.segment}`]),
    ]);
  });

  it('lists the tasks and pages of a contest its entrants see', async () => {
    server.use(
      http.get('/api/v1/public/contests/:org/:contest', () =>
        HttpResponse.json(publicContest),
      ),
      http.get('/api/v1/public/contests/:org/:contest/leaderboards', () =>
        HttpResponse.json([]),
      ),
    );
    renderApp('/contests/acme/spring/leaderboards');

    const contest = (await trail())[1]?.label ?? '';
    const menu = await menuOf(contest);
    expect(menu.at(0)).toBe('Tasks');
    expect(menu.slice(-3)).toEqual([
      'Sections',
      ['Leaderboards', '/contests/acme/spring/leaderboards'],
      ['Questions', '/contests/acme/spring/questions'],
    ]);
  });
});
